import { afterEach, describe, expect, it, vi } from "vitest";
import type { DurableObjectState } from "@cloudflare/workers-types";
import { demoSessions } from "../src/model";
import { sessionInput, MAX_REQUEST_BYTES } from "../src/ai/contracts";
import { evidence } from "./analysis";
import { callOpenAI, parseProviderResponse, providerRequest } from "./openai";
import { AnalysisQuota, handleRequest, type Env } from "./worker";

const origin = "https://boubiprime.github.io";
const accessCode = "test-access-code-0000000000000000";
// Fake sentinel only. It must never appear in returned errors or frontend builds.
const fakeKey = "NOT_A_REAL_OPENAI_KEY_server_only";
const payload = () => sessionInput(demoSessions()[0]);
const data = evidence(payload());
const env = (overrides: Partial<Env> = {}): Env => ({
  OPENAI_API_KEY: fakeKey, ANALYSIS_ACCESS_CODE: accessCode, ALLOWED_ORIGIN: origin,
  ANALYSIS_QUOTA: { idFromName: () => "global", get: () => ({ fetch: async () => new Response(null, { status: 204 }) }) } as unknown as Env["ANALYSIS_QUOTA"], ...overrides,
});
const req = (body: unknown = payload(), headers: Record<string, string> = {}) => new Request("https://api.example/analyze", {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Authorization: `Bearer ${accessCode}`, ...headers }, body: JSON.stringify(body),
});
const decision = () => ({ model: "gpt-6-luna", answers: [
  { name: "performance", type: "choice", choice: "Bonne", confidence: 0.8, probabilities: [] },
  { name: "priority", type: "choice", choice: "Régularité", confidence: 0.9, probabilities: [] },
  ...Object.keys(data.tips).map((name, i) => ({ name, type: "predicate", probability: 0.9 - i / 100 })),
] });
const upstream = () => vi.fn<typeof fetch>(async () => Response.json(decision()));
afterEach(() => vi.useRealTimers());

describe("endpoint sécurisé", () => {
  it("retourne non configuré sans clé et n’appelle jamais OpenAI", async () => {
    const fetcher = upstream();
    const response = await handleRequest(req(), env({ OPENAI_API_KEY: "" }), fetcher);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("not_configured");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("refuse une origine étrangère même avec le bon code et accepte le preflight exact", async () => {
    const fetcher = upstream();
    const rejected = await handleRequest(req(payload(), { Origin: "https://attacker.example" }), env(), fetcher);
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const good = await handleRequest(new Request("https://api.example/analyze", { method: "OPTIONS", headers: {
      Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type",
    } }), env(), fetcher);
    expect(good.status).toBe(204);
    expect(good.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("exige un code distinct et refuse les méthodes et les clés en URL", async () => {
    const fetcher = upstream();
    expect((await handleRequest(req(payload(), { Authorization: "Bearer incorrect" }), env(), fetcher)).status).toBe(401);
    expect((await handleRequest(new Request("https://api.example/analyze?key=invalid", { headers: { Origin: origin } }), env(), fetcher)).status).toBe(404);
    expect((await handleRequest(new Request("https://api.example/analyze", { headers: { Origin: origin } }), env(), fetcher)).status).toBe(405);
    expect((await handleRequest(req(), env({ ANALYSIS_ACCESS_CODE: "short" }), fetcher)).status).toBe(503);
    expect((await handleRequest(req(), env({ ANALYSIS_ACCESS_CODE: fakeKey }), fetcher)).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("valide type, taille réelle, JSON et données avant de réserver un appel", async () => {
    const fetcher = upstream();
    const gate = vi.fn(async () => new Response(null, { status: 204 }));
    const settings = env({ ANALYSIS_QUOTA: { idFromName: () => "global", get: () => ({ fetch: gate }) } as unknown as Env["ANALYSIS_QUOTA"] });
    expect((await handleRequest(req({}, { "Content-Type": "text/plain" }), settings, fetcher)).status).toBe(415);
    expect((await handleRequest(req("x".repeat(MAX_REQUEST_BYTES)), settings, fetcher)).status).toBe(413);
    expect((await handleRequest(req({ ...payload(), laps: [] }), settings, fetcher)).status).toBe(422);
    expect((await handleRequest(new Request("https://api.example/analyze", { method: "POST", headers: { Origin: origin, Authorization: `Bearer ${accessCode}`, "Content-Type": "application/json" }, body: "{" }), settings, fetcher)).status).toBe(400);
    expect(gate).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("retourne une analyse complète et transmet seulement des agrégats à l’API documentée", async () => {
    const fetcher = upstream();
    const response = await handleRequest(req(), env(), fetcher);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ performance: "Bonne", priority: "Régularité", validLaps: 7, totalLaps: 8, provider: "decisions" });
    expect(result.tips).toHaveLength(3);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/decisions");
    expect(options?.headers).toMatchObject({ Authorization: `Bearer ${fakeKey}` });
    expect(options?.redirect).toBe("manual");
    const sent = JSON.parse(String(options?.body));
    expect(sent.model).toBe("gpt-6-luna");
    expect(sent.questions[0]).toMatchObject({ type: "choice", name: "performance" });
    const facts = JSON.parse(sent.input[1].content).facts;
    expect(facts.bestMs).toBe(138946);
    expect(facts).not.toHaveProperty("laps");
    expect(JSON.stringify(result)).not.toContain(fakeKey);
    expect(JSON.stringify(sent)).not.toContain(accessCode);
  });
  it("bloque un quota atteint sans appeler OpenAI", async () => {
    const fetcher = upstream();
    const settings = env({ ANALYSIS_QUOTA: { idFromName: () => "global", get: () => ({ fetch: async () => new Response(null, { status: 429, headers: { "Retry-After": "42" } }) }) } as unknown as Env["ANALYSIS_QUOTA"] });
    const response = await handleRequest(req(), settings, fetcher);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("échoue sans appel facturé si le stockage de quota est indisponible", async () => {
    const fetcher = upstream();
    const settings = env({ ANALYSIS_QUOTA: { idFromName: () => "global", get: () => ({ fetch: async () => { throw Error(fakeKey); } }) } as unknown as Env["ANALYSIS_QUOTA"] });
    const response = await handleRequest(req(), settings, fetcher);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(fakeKey);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([302, 400, 401, 403, 404, 429, 500])("masque les détails fournisseur (%s) et ne réessaie pas", async (status) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(fakeKey, { status }));
    const response = await handleRequest(req(), env(), fetcher);
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await response.text()).not.toContain(fakeKey);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("contrats OpenAI et absence de texte inventé", () => {
  it("utilise explicitement Responses si configuré, sans basculement automatique", async () => {
    const request = providerRequest(data, "responses");
    expect(request.path).toBe("responses");
    expect(request.body).toMatchObject({ model: "gpt-4.1-mini", store: false, max_output_tokens: 400, text: { format: { type: "json_schema", strict: true } } });
    const selection = { performance: "Bonne", priority: "Régularité", tipIds: ["repeat_run", "target_mean", "inspect_gaps"] };
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(selection) }] }] }));
    expect(await callOpenAI(data, fakeKey, "responses", fetcher)).toEqual(selection);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
  });
  it("refuse les refus, scores hors plage, réponses tronquées et conseils inconnus", () => {
    const raw = decision(); raw.answers[0] = { name: "performance", type: "refusal" } as typeof raw.answers[0];
    expect(() => parseProviderResponse(raw, data, "decisions")).toThrow();
    const bad = decision(); (bad.answers[2] as { probability: number }).probability = NaN;
    expect(() => parseProviderResponse(bad, data, "decisions")).toThrow();
    expect(() => parseProviderResponse({ ...decision(), answers: [] }, data, "decisions")).toThrow();
    expect(() => parseProviderResponse({ status: "incomplete", output: [] }, data, "responses")).toThrow();
    expect(() => parseProviderResponse({ status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] }, data, "responses")).toThrow();
    expect(() => parseProviderResponse({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ performance: "Bonne", priority: "Régularité", tipIds: ["freine plus tôt au virage 7", "repeat_run", "target_mean"] }) }] }] }, data, "responses")).toThrow();
  });
  it("gère les erreurs réseau et le délai sans exposer de secret", async () => {
    await expect(callOpenAI(data, fakeKey, "decisions", async () => { throw Error(fakeKey); })).rejects.toThrow("connexion");
    await expect(callOpenAI(data, fakeKey, "decisions", async () => { throw new DOMException(fakeKey, "TimeoutError"); })).rejects.toThrow("trop de temps");
  });
  it("borne la réponse réelle du fournisseur, même sans Content-Length, et refuse le JSON invalide", async () => {
    await expect(callOpenAI(data, fakeKey, "decisions", async () => new Response("x".repeat(65537)))).rejects.toThrow("taille");
    await expect(callOpenAI(data, fakeKey, "decisions", async () => new Response("{"))).rejects.toThrow("illisible");
  });
});

describe("quota persistant atomique", () => {
  const storageFixture = () => {
    const values = new Map<string, unknown>();
    let pending = Promise.resolve<unknown>(null);
    const storage = { get: async (key: string) => structuredClone(values.get(key)), put: async (key: string, value: unknown) => { values.set(key, structuredClone(value)); } };
    return { storage: { transaction: (run: (tx: typeof storage) => Promise<unknown>) => {
      const result = pending.then(() => run(storage)); pending = result.catch(() => null); return result;
    } } } as unknown as DurableObjectState;
  };
  it("limite des appels concurrents, conserve le compteur après recréation et renouvelle au jour UTC", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
    const state = storageFixture(), settings = env({ AI_DAILY_LIMIT: "3" });
    const gate = new AnalysisQuota(state, settings);
    const responses = await Promise.all([gate.fetch(), gate.fetch(), gate.fetch()]);
    expect(responses.map((r) => r.status)).toEqual([204, 204, 429]);
    vi.setSystemTime(new Date("2026-10-23T12:01:01Z"));
    const recreated = new AnalysisQuota(state, settings);
    expect((await recreated.fetch()).status).toBe(204);
    expect((await recreated.fetch()).status).toBe(429);
    vi.setSystemTime(new Date("2026-10-24T00:01:01Z"));
    expect((await recreated.fetch()).status).toBe(204);
  });
});
