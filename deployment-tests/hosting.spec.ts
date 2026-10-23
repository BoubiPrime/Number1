import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("compilation statique : ressources, navigation, sauvegarde et restauration JSON", async ({
  page,
  request,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const config = JSON.parse(await readFile("vercel.json", "utf8"));
  expect(config).toMatchObject({
    framework: "vite",
    installCommand: "npm ci",
    buildCommand: "npm run build -- --base=/",
    outputDirectory: "dist",
    rewrites: [{ source: "/(.*)", destination: "/index.html" }],
  });
  for (const path of ["/", "/history", "/comparison"]) {
    const response = await request.get("/Number1" + path);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("RaceLab v2.0 Pro Edition");
  }
  await page.goto("/Number1/");
  await expect(page.locator(".chart .recharts-line-curve")).toBeVisible();
  const assets = await page
    .locator('script[src],link[rel="stylesheet"]')
    .evaluateAll((elements) =>
      elements.map((el) => el.getAttribute("src") ?? el.getAttribute("href")!),
    );
  expect(assets.length).toBeGreaterThan(1);
  for (const asset of assets) {
    const response = await request.get(asset);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).not.toContain("text/html");
  }
  for (const name of [
    "Session Comparison",
    "Personal Records",
    "Driver Progress",
    "Historique",
    "Vue d’ensemble",
  ])
    await page.getByRole("button", { name, exact: false }).first().click();
  // Public configuration is also served under /Number1/, with AI disabled by default.
  const aiConfig = await request.get("/Number1/ai-config.json");
  expect(aiConfig.status()).toBe(200);
  expect(await aiConfig.json()).toEqual({ endpoint: "" });
  await page.getByRole("button", { name: "Analyse IA", exact: true }).click();
  await expect(page.getByText("Analyse IA non configurée", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyser avec l’IA" })).toBeDisabled();
  await page
    .getByRole("button", { name: "Nouvelle session", exact: true })
    .click();
  await page.getByLabel("Circuit", { exact: true }).fill("Test hébergement");
  await page.getByLabel("Voiture", { exact: true }).fill("Porsche 911");
  await page.getByLabel("Jeu", { exact: true }).fill("ACC");
  await page
    .getByRole("button", { name: "Créer la session", exact: true })
    .click();
  await page.getByLabel("Chrono", { exact: true }).fill("1:37.317");
  await page.getByRole("button", { name: "Ajouter le tour" }).click();
  await expect(page.locator(".pace-hero>strong")).toHaveText("1:37.317");
  await page.reload();
  await page
    .getByRole("button", { name: "Test hébergement ACC", exact: true })
    .click();
  await expect(page.locator(".pace-hero>strong")).toHaveText("1:37.317");
  const state = await page.context().storageState();
  const restored = await browser.newContext({ storageState: state });
  const second = await restored.newPage();
  await second.goto("http://127.0.0.1:4175/Number1/");
  await expect(
    second.getByRole("button", { name: "Test hébergement ACC", exact: true }),
  ).toBeVisible();
  await restored.close();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter JSON" }).click();
  const download = await downloadPromise;
  const data = JSON.parse(await readFile((await download.path())!, "utf8"));
  const saved = await page.evaluate(() =>
    localStorage.getItem("racelab.sessions.v1"),
  );
  expect(data.sessions).toEqual(JSON.parse(saved!));
  await page.locator("input[type=file]").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.getByRole("button", { name: "Remplacer les données" }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("racelab.sessions.v1")),
  ).toBe(saved);
  // L’origine change : les données personnelles ne sont pas transférées automatiquement.
  const other = await page.context().newPage();
  await other.goto("http://localhost:4175/Number1/");
  await expect(
    other.getByRole("button", { name: "Test hébergement ACC", exact: true }),
  ).toHaveCount(0);
  await other.close();
  expect(errors).toEqual([]);
});
