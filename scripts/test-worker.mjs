// Real Workers runtime + SQLite, with every outbound request intercepted locally.
// Use the emulator bundled with the pinned Wrangler tool, not a second runtime version.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { Miniflare, convertV4MiniflareOptions, Response: RuntimeResponse } = await import(pathToFileURL(wranglerRequire.resolve("miniflare")).href);
const accessCode = "test-access-code-0000000000000000";
const origin = "https://boubiprime.github.io";
const fixture = { circuit: "Spa", layout: "GP", car: "Porsche", game: "ACC", type: "Essais", demo: true,
  laps: [99000, 100000, 101000].map((timeMs) => ({ timeMs, valid: true })) };
const folder = await mkdtemp(join(tmpdir(), "racelab-worker-test-"));
let calls = 0;
function runtime({ configured = true, redirect = false, persist = false } = {}) {
  return new Miniflare(convertV4MiniflareOptions({
    modules: true,
    scriptPath: resolve(".worker-build/worker.js"),
    compatibilityDate: "2026-10-23",
    bindings: { OPENAI_API_KEY: configured ? "NOT_A_REAL_OPENAI_KEY" : "", ANALYSIS_ACCESS_CODE: accessCode,
      ALLOWED_ORIGIN: origin, AI_DAILY_LIMIT: "2", OPENAI_API: "decisions" },
    durableObjects: { ANALYSIS_QUOTA: { className: "AnalysisQuota", useSQLite: true } },
    ...(persist ? { resourcePersistencePath: folder, isolatedResourcePersistencePath: folder } : {}),
    outboundService: async (request) => {
      assert.equal(request.url, "https://api.openai.com/v1/decisions");
      calls++;
      if (redirect) return new RuntimeResponse(null, { status: 302, headers: { Location: "https://never-follow.example" } });
      const body = await request.json();
      assert.equal(body.model, "gpt-6-luna");
      return new RuntimeResponse(JSON.stringify({ answers: body.questions.map((question, i) => question.type === "choice"
        ? { name: question.name, type: "choice", choice: i ? "Régularité" : "Bonne" }
        : { name: question.name, type: "predicate", probability: 0.8 }) }), { headers: { "Content-Type": "application/json" } });
    },
  }));
}
const request = (worker) => worker.dispatchFetch("https://worker.example/analyze", {
  method: "POST", headers: { Origin: origin, Authorization: `Bearer ${accessCode}`, "Content-Type": "application/json" }, body: JSON.stringify(fixture),
});
try {
  let worker = runtime({ persist: true });
  try {
    const responses = await Promise.all([request(worker), request(worker), request(worker)]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 200, 429]);
    for (const response of responses) if (response.status === 200) {
      const result = await response.json();
      assert.equal(result.consistencyScore, 84);
      assert.equal(result.tips.length, 3);
    }
    assert.equal(calls, 2);
    console.log("PASS — runtime Workers, analyse simulée et quota SQLite sous appels concurrents");
  } finally { await worker.dispose(); }
  worker = runtime({ persist: true });
  try {
    assert.equal((await request(worker)).status, 429);
    assert.equal(calls, 2);
    console.log("PASS — quota conservé après redémarrage du runtime");
  } finally { await worker.dispose(); }
  worker = runtime({ redirect: true });
  try {
    assert.equal((await request(worker)).status, 502);
    assert.equal(calls, 3);
    console.log("PASS — redirection fournisseur refusée, aucun transfert de clé");
  } finally { await worker.dispose(); }
  worker = runtime({ configured: false });
  try {
    const response = await request(worker);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "not_configured");
    assert.equal(calls, 3);
    console.log("PASS — sans configuration, aucun appel fournisseur");
  } finally { await worker.dispose(); }
} finally { await rm(folder, { recursive: true, force: true }); }
console.log("4 scénarios runtime réussis. Aucun appel externe ni clé réelle.");
