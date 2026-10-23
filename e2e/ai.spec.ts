import { test, expect, type Page } from "@playwright/test";
const key = "racelab.sessions.v1";
const endpoint = "https://racelab-ai.example/analyze";
const code = "test-access-code-0000000000000000";
const sessions = [
  { id: "ai-valid", circuit: "Spa", car: "Porsche", game: "ACC", layout: "GP", date: "2026-10-23", type: "Essais", laps: [100000, 101000, 99000, 97000].map((timeMs, i) => ({ id: `a-${i}`, number: i + 1, timeMs, valid: i !== 3 })) },
  { id: "ai-empty", circuit: "Monza", car: "BMW", game: "ACC", date: "2026-10-22", type: "Course", laps: [] },
];
const result = {
  version: 1, performance: "Bonne", consistencyScore: 84, priority: "Régularité", provider: "decisions",
  summary: "Sur 3 tours valides parmi 4, votre meilleur chrono est 1:39.000 et votre moyenne 1:40.000. L’écart-type est de 0,816 s ; le score de régularité est 84/100. L’écart entre le meilleur et le moins bon tour valide est de 2,000 s.",
  tips: ["Refaites un relais de cinq tours valides avec la même voiture.", "Comparez votre dispersion sur un relais plus long.", "Renseignez les secteurs pour localiser les écarts."],
  validLaps: 3, totalLaps: 4, analyzedAt: "2026-10-23T12:00:00Z",
};
async function seed(page: Page, configured = true) {
  await page.addInitScript(({ key, sessions }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(sessions));
  }, { key, sessions });
  if (configured) await page.route("**/ai-config.json", (route) => route.fulfill({ json: { endpoint } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Analyse IA", exact: true }).click();
}
test("IA non configurée : aucun appel, sessions inchangées, navigation et mobile", async ({ page }) => {
  const calls: string[] = [], errors: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST") calls.push(r.url()); });
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page, false);
  await expect(page.getByText("Analyse IA non configurée", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyser avec l’IA" })).toBeDisabled();
  await page.getByRole("combobox", { name: "Session à analyser" }).selectOption("ai-empty");
  await expect(page.getByText("Enregistrez au moins 3 tours valides pour analyser cette session.")).toBeVisible();
  await page.getByRole("button", { name: "Ouvrir la session", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Monza");
  await page.reload();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key)).toEqual(sessions);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: "Analyse IA", exact: true }).click();
  await expect(page.getByText("Analyse IA non configurée", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(calls).toEqual([]);
  expect(errors).toEqual([]);
});
test("analyse sur clic, chargement, résultat, relance et code jamais sauvegardé", async ({ page }) => {
  let calls = 0;
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  await page.route(endpoint, async (route) => {
    calls++;
    expect(route.request().headers().authorization).toBe(`Bearer ${code}`);
    const body = route.request().postDataJSON();
    expect(body.circuit).toBe("Spa");
    expect(body.laps).toHaveLength(4);
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("date");
    expect(route.request().url()).not.toContain(code);
    if (calls === 1) await delayed;
    await route.fulfill({ json: result, headers: { "Access-Control-Allow-Origin": "*" } });
  });
  await seed(page);
  await expect(page.getByLabel("Code d’accès IA", { exact: true })).toBeVisible();
  expect(calls).toBe(0);
  await page.getByLabel("Code d’accès IA", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Analyser avec l’IA" }).click();
  await expect(page.getByRole("button", { name: "Analyse de la session en cours…" })).toBeDisabled();
  release();
  const card = page.getByRole("region", { name: "Résultat de l’analyse IA" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Bonne");
  await expect(card).toContainText("84/100");
  await expect(card.locator("li")).toHaveCount(3);
  expect(calls).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/racelab-ai-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Relancer l’analyse" }).click();
  await expect(page.getByRole("button", { name: "Relancer l’analyse" })).toBeEnabled();
  expect(calls).toBe(2);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key)).toEqual(sessions);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(code);
  await page.reload();
  await page.getByRole("button", { name: "Analyse IA", exact: true }).click();
  await expect(page.getByLabel("Code d’accès IA", { exact: true })).toHaveValue("");
  await expect(card).toHaveCount(0);
  expect(calls).toBe(2);
});
test("insuffisance, format de clé OpenAI saisi par erreur et erreurs réseau n’enregistrent aucune analyse", async ({ page }) => {
  let calls = 0;
  await page.route(endpoint, async (route) => { calls++; await route.abort("failed"); });
  await seed(page);
  await page.getByRole("combobox", { name: "Session à analyser" }).selectOption("ai-empty");
  await expect(page.getByRole("button", { name: "Analyser avec l’IA" })).toBeDisabled();
  await page.getByRole("combobox", { name: "Session à analyser" }).selectOption("ai-valid");
  await page.getByLabel("Code d’accès IA", { exact: true }).fill("sk-EXAMPLE_ONLY_NEVER_A_REAL_KEY_00000");
  await page.getByRole("button", { name: "Analyser avec l’IA" }).click();
  await expect(page.getByRole("alert")).toContainText("jamais votre clé OpenAI");
  expect(calls).toBe(0);
  await page.getByLabel("Code d’accès IA", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Analyser avec l’IA" }).click();
  await expect(page.getByRole("alert")).toContainText("Impossible de joindre");
  await expect(page.getByRole("button", { name: "Analyser avec l’IA" })).toBeEnabled();
  expect(calls).toBe(1);
});
test("relance refusée : ancien résultat conservé et Retry-After respecté", async ({ page }) => {
  let calls = 0;
  await page.route(endpoint, async (route) => {
    calls++;
    await route.fulfill(calls === 1 ? { json: result } : { status: 429, json: { error: { code: "rate_limit", message: "INTERNAL_MUST_NOT_BE_SHOWN" } }, headers: { "Retry-After": "60" } });
  });
  await seed(page);
  await page.getByLabel("Code d’accès IA", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Analyser avec l’IA" }).click();
  await expect(page.getByRole("region", { name: "Résultat de l’analyse IA" })).toBeVisible();
  await page.getByRole("button", { name: "Relancer l’analyse" }).click();
  await expect(page.getByRole("alert")).toContainText("dernière analyse réussie");
  await expect(page.getByRole("alert")).not.toContainText("INTERNAL_MUST_NOT_BE_SHOWN");
  await expect(page.getByRole("button", { name: "Relancer l’analyse" })).toBeDisabled();
  await expect(page.getByRole("region", { name: "Résultat de l’analyse IA" })).toBeVisible();
  expect(calls).toBe(2);
});
test("changement de session ou navigation : une réponse tardive ne s’affiche jamais sur une autre session", async ({ page }) => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  await page.route(endpoint, async (route) => { await delayed; await route.fulfill({ json: result }); });
  await seed(page);
  await page.getByLabel("Code d’accès IA", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Analyser avec l’IA" }).click();
  await expect(page.getByRole("button", { name: "Annuler l’attente" })).toBeVisible();
  await page.getByRole("combobox", { name: "Session à analyser" }).selectOption("ai-empty");
  release();
  await expect(page.getByRole("region", { name: "Résultat de l’analyse IA" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Analyser avec l’IA" })).toBeDisabled();
  await page.getByRole("button", { name: "Vue d’ensemble", exact: true }).click();
  await page.getByRole("button", { name: "Analyse IA", exact: true }).click();
  await expect(page.getByLabel("Code d’accès IA", { exact: true })).toHaveValue("");
  await expect(page.getByRole("region", { name: "Résultat de l’analyse IA" })).toHaveCount(0);
});
