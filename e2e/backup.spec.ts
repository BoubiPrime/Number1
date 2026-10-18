import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
const key = "racelab.sessions.v1";
const sessions = [
  {
    id: "reset",
    circuit: "Le Mans",
    car: "Porsche 963",
    game: "LMU",
    date: "2026-10-18",
    type: "Essais",
    laps: [
      { id: "l1", number: 1, timeMs: 97317, valid: true },
      { id: "l2", number: 2, timeMs: 96000, valid: false },
    ],
  },
];
const backup = (data: unknown = sessions) => ({
  formatVersion: 1,
  exportedAt: "2026-10-18T12:00:00.000Z",
  sessions: data,
});
async function upload(page: Page, data: unknown) {
  await page.locator("input[type=file]").setInputFiles({
    name: "racelab.json",
    mimeType: "application/json",
    buffer: Buffer.from(typeof data === "string" ? data : JSON.stringify(data)),
  });
}
async function stored(page: Page) {
  return page.evaluate((k) => localStorage.getItem(k), key);
}
test("export réel, restauration confirmée, annulation et absence de doublons", async ({
  page,
}) => {
  await page.goto("/");
  const original = await stored(page);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter JSON" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^racelab-v1-.*\.json$/);
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported.formatVersion).toBe(1);
  expect(Number.isFinite(Date.parse(exported.exportedAt))).toBe(true);
  expect(exported.sessions).toEqual(JSON.parse(original!));
  await upload(page, backup());
  await expect(page.getByRole("dialog")).toContainText("remplacera");
  expect(await stored(page)).toBe(original);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  expect(await stored(page)).toBe(original);
  await upload(page, backup());
  await page.getByRole("button", { name: "Remplacer les données" }).click();
  expect(JSON.parse((await stored(page))!)).toEqual(sessions);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Le Mans LMU", exact: true }),
  ).toBeVisible();
  await upload(page, backup());
  await page.getByRole("button", { name: "Remplacer les données" }).click();
  expect(JSON.parse((await stored(page))!)).toHaveLength(1);
  // Le nom d’un identifiant de session ne doit jamais déclencher une réinitialisation globale.
  const both = [
    ...sessions,
    { ...sessions[0], id: "other", circuit: "Monza", laps: [] },
  ];
  await upload(page, backup(both));
  await page.getByRole("button", { name: "Remplacer les données" }).click();
  await page.getByRole("button", { name: "Le Mans LMU", exact: true }).click();
  await page
    .getByRole("button", { name: "Supprimer cette session", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "Supprimer cette session ?",
  );
  await page.getByRole("button", { name: "Confirmer la suppression" }).click();
  expect(
    JSON.parse((await stored(page))!).map((s: { id: string }) => s.id),
  ).toEqual(["other"]);
  await upload(page, exported);
  await page.getByRole("button", { name: "Remplacer les données" }).click();
  expect(JSON.parse((await stored(page))!)).toEqual(exported.sessions);
});
test("JSON invalide, version future, doublons et chronos négatifs refusés sans perte", async ({
  page,
}) => {
  await page.goto("/");
  const before = await stored(page);
  for (const file of [
    "{broken",
    { ...backup(), formatVersion: 2 },
    backup([sessions[0], sessions[0]]),
    backup([
      { ...sessions[0], laps: [{ ...sessions[0].laps[0], timeMs: -1 }] },
    ]),
  ]) {
    await upload(page, file);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await stored(page)).toBe(before);
  }
});
test("échec du stockage pendant une restauration : données actuelles préservées", async ({
  page,
}) => {
  await page.goto("/");
  const before = await stored(page);
  await upload(page, backup());
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "racelab.sessions.v1")
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      return original.call(this, k, v);
    };
  });
  await page.getByRole("button", { name: "Remplacer les données" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "données actuelles sont conservées",
  );
  expect(await stored(page)).toBe(before);
});
test("import vide confirmé, puis restauration d’un stockage corrompu", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, backup([]));
  await page.getByRole("button", { name: "Remplacer les données" }).click();
  expect(await stored(page)).toBe("[]");
  await expect(
    page.getByText("Votre histoire commence en piste.").first(),
  ).toBeVisible();
  await page.evaluate((k) => localStorage.setItem(k, "{broken"), key);
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("illisibles");
  await upload(page, backup());
  await page.getByRole("button", { name: "Remplacer les données" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.reload();
  expect(JSON.parse((await stored(page))!)).toEqual(sessions);
});
test("audit navigation mobile, recherche vide et longue session sans erreur console", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error")
      errors.push(`${message.text()} (${message.location().url})`);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  for (const name of [
    "Session Comparison",
    "Personal Records",
    "Historique",
    "Vue d’ensemble",
  ]) {
    await page.getByRole("button", { name, exact: false }).first().click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("button", { name: "Historique", exact: false })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Rechercher un circuit" })
    .fill("circuit introuvable");
  await expect(page.getByText("Aucune session ne correspond.")).toBeVisible();
  await page.getByRole("button", { name: "Réinitialiser les filtres" }).click();
  await expect(page.locator(".session-table tbody tr")).toHaveCount(3);
  const longSession = {
    ...sessions[0],
    laps: Array.from({ length: 500 }, (_, i) => ({
      id: `lap-${i}`,
      number: i + 1,
      timeMs: 97000 + (i % 100),
      valid: i % 20 !== 0,
    })),
  };
  await upload(page, backup([longSession]));
  await page.getByRole("button", { name: "Remplacer les données" }).click();
  await page.getByRole("button", { name: "Le Mans LMU", exact: true }).click();
  await expect(page.locator(".recharts-brush")).toBeVisible();
  await expect(page.locator(".laps-panel tbody tr")).toHaveCount(500);
  await expect(
    page
      .locator(
        ".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value",
      )
      .last(),
  ).toHaveText("40");
  const handle = page.locator(".recharts-brush-traveller").last();
  await handle.focus();
  await handle.press("ArrowRight");
  await expect(
    page
      .locator(
        ".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value",
      )
      .last(),
  ).toHaveText("41");
  await expect(page.locator(".chart .recharts-line-curve")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".chart").first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "/tmp/racelab-v1-mobile.png",
    fullPage: false,
  });
  expect(errors).toEqual([]);
});
