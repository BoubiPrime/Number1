import type { DurableObjectNamespace, DurableObjectState } from "@cloudflare/workers-types";
import { AnalysisError, MAX_REQUEST_BYTES, validateInput } from "../src/ai/contracts";
import { assembleResult, evidence } from "./analysis";
import { callOpenAI, type Provider } from "./openai";

export interface Env {
  OPENAI_API_KEY?: string;
  ANALYSIS_ACCESS_CODE?: string;
  ALLOWED_ORIGIN: string;
  OPENAI_API?: Provider;
  AI_DAILY_LIMIT?: string;
  ANALYSIS_QUOTA: DurableObjectNamespace;
}
function json(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } });
}
function errorResponse(error: unknown): Response {
  return error instanceof AnalysisError
    ? json({ error: { code: error.code, message: error.message } }, error.status)
    : json({ error: { code: "unavailable", message: "Le service IA est indisponible. Vos sessions sont conservées." } }, 503);
}
export async function readJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? ""))
    throw new AnalysisError("content_type", 415, "Le format JSON est requis.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES)
    throw new AnalysisError("too_large", 413, "La session dépasse la taille autorisée pour l’IA.");
  const reader = request.body?.getReader();
  if (!reader) throw new AnalysisError("invalid_data", 400, "La session est manquante.");
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new AnalysisError("too_large", 413, "La session dépasse la taille autorisée pour l’IA.");
      }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const all = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) { all.set(part, offset); offset += part.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(all)); }
  catch { throw new AnalysisError("invalid_json", 400, "Le fichier JSON de session est illisible."); }
}
async function sameCode(supplied: string, expected: string): Promise<boolean> {
  // Compare fixed-size digests, including when input lengths differ. Never log either value.
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(supplied), digest(expected)]);
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
  return different === 0;
}
export function dailyLimit(env: Pick<Env, "AI_DAILY_LIMIT">): number {
  const limit = Number(env.AI_DAILY_LIMIT ?? "20");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new AnalysisError("not_configured", 503, "La limite quotidienne IA doit être configurée entre 1 et 100.");
  return limit;
}
async function analyze(request: Request, env: Env, fetcher: typeof fetch): Promise<Response> {
  if (!env.OPENAI_API_KEY?.trim() || !env.ANALYSIS_ACCESS_CODE ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(env.ANALYSIS_ACCESS_CODE) ||
    env.ANALYSIS_ACCESS_CODE.startsWith("sk-") || env.ANALYSIS_ACCESS_CODE === env.OPENAI_API_KEY ||
    !["decisions", "responses"].includes(env.OPENAI_API ?? "decisions") || !env.ANALYSIS_QUOTA)
    throw new AnalysisError("not_configured", 503, "L’analyse IA n’est pas configurée. Les autres fonctions de RaceLab restent disponibles.");
  dailyLimit(env);
  const auth = request.headers.get("authorization") ?? "";
  if (auth.length > 150 || !auth.startsWith("Bearer ") || !(await sameCode(auth.slice(7), env.ANALYSIS_ACCESS_CODE)))
    throw new AnalysisError("unauthorized", 401, "Le code d’accès IA est incorrect. Utilisez le code fourni par le propriétaire du site, pas une clé OpenAI.");
  const input = validateInput(await readJson(request));
  const data = evidence(input);
  // One globally named Durable Object: atomic, persistent limits across serverless instances.
  // A reserved call stays counted even on timeout/provider failure; no automatic paid retry.
  const gate = env.ANALYSIS_QUOTA.get(env.ANALYSIS_QUOTA.idFromName("racelab-ai-budget-v1"));
  const reservation = await gate.fetch("https://quota.internal/reserve", { method: "POST" });
  if (!reservation.ok) {
    if (reservation.status === 429)
      return json({ error: { code: "rate_limit", message: "Limite IA atteinte : 2 analyses par minute et un quota quotidien. Patientez ou réessayez demain (UTC)." } }, 429,
        { "Retry-After": reservation.headers.get("Retry-After") ?? "60" });
    throw new AnalysisError("unavailable", 503, "Le contrôle du quota IA est indisponible. Aucun appel IA n’a été effectué.");
  }
  const provider = env.OPENAI_API ?? "decisions";
  const selected = await callOpenAI(data, env.OPENAI_API_KEY, provider, fetcher);
  return json(assembleResult(data, selected, provider));
}
export async function handleRequest(request: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  const origin = request.headers.get("origin");
  // Origin is an extra browser restriction; authentication is always required as well.
  if (!env.ALLOWED_ORIGIN || env.ALLOWED_ORIGIN === "*" || origin !== env.ALLOWED_ORIGIN)
    return json({ error: { code: "origin", message: "Origine non autorisée." } }, 403);
  let response: Response;
  try {
    const url = new URL(request.url);
    if (url.pathname !== "/analyze" || url.search)
      response = json({ error: { code: "not_found", message: "Endpoint inconnu." } }, 404);
    else if (request.method === "OPTIONS") {
      const headers = (request.headers.get("access-control-request-headers") ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
      response = request.headers.get("access-control-request-method") === "POST" && headers.every((s) => ["content-type", "authorization"].includes(s))
        ? new Response(null, { status: 204, headers: { "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "600" } })
        : json({ error: { code: "preflight", message: "Requête non autorisée." } }, 403);
    } else if (request.method !== "POST")
      response = json({ error: { code: "method", message: "Utilisez une requête POST." } }, 405, { Allow: "POST, OPTIONS" });
    else response = await analyze(request, env, fetcher);
  } catch (error) { response = errorResponse(error); }
  response.headers.set("Access-Control-Allow-Origin", env.ALLOWED_ORIGIN);
  response.headers.set("Access-Control-Expose-Headers", "Retry-After");
  response.headers.set("Vary", "Origin");
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export default { fetch: (request: Request, env: Env) => handleRequest(request, env) };

interface QuotaState { day: string; count: number; recent: number[] }
export class AnalysisQuota {
  constructor(private ctx: DurableObjectState, private env: Env) {}
  async fetch(): Promise<Response> {
    const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
    const limit = dailyLimit(this.env);
    return this.ctx.storage.transaction(async (storage) => {
      const previous = await storage.get<QuotaState>("quota");
      const state: QuotaState = { day, count: previous?.day === day ? previous.count : 0, recent: (previous?.recent ?? []).filter((n) => n > now - 60_000) };
      if (state.count >= limit || state.recent.length >= 2) {
        const seconds = state.count >= limit
          ? Math.ceil((Date.parse(`${day}T00:00:00Z`) + 86_400_000 - now) / 1000)
          : Math.ceil((state.recent[0] + 60_000 - now) / 1000);
        return new Response(null, { status: 429, headers: { "Retry-After": String(Math.max(1, seconds)) } });
      }
      state.count++;
      state.recent.push(now);
      await storage.put("quota", state);
      return new Response(null, { status: 204 });
    });
  }
}
