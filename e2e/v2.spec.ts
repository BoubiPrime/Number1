import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
const key = "racelab.sessions.v1";
const fixture = [
  {
    id: "v2-a",
    circuit: "Spa",
    layout: "GP",
    car: "Porsche",
    game: "ACC",
    date: "2026-10-17",
    type: "Essais",
    laps: [
      {
        id: "a1",
        number: 1,
        timeMs: 100000,
        valid: true,
        sectors: [30000, 30000, 40000],
      },
    ],
  },
  {
    id: "v2-b",
    circuit: "Spa",
    layout: "GP",
    car: "Porsche",
    game: "ACC",
    date: "2026-10-18",
    type: "Qualifications",
    laps: [
      {
        id: "b1",
        number: 1,
        timeMs: 98000,
        valid: true,
        sectors: [29000, 30000, 39000],
      },
    ],
  },
  {
    id: "v2-c",
    circuit: "Spa",
    layout: "National",
    car: "Porsche",
    game: "ACC",
    date: "2026-10-19",
    type: "Essais",
    laps: [{ id: "c1", number: 1, timeMs: 50000, valid: true }],
  },
];
async function seed(page: Page, data: unknown = fixture) {
  await page.goto("/");
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key, data },
  );
  await page.reload();
}
async function addSession(page: Page, name: string) {
  await page
    .getByRole("button", { name: "Nouvelle session", exact: true })
    .click();
  await page.getByLabel("Circuit", { exact: true }).fill(name);
  await page.getByLabel("Voiture", { exact: true }).fill("Porsche");
  await page.getByLabel("Jeu", { exact: true }).fill("ACC");
  await page
    .getByRole("button", { name: "Créer la session", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
}
test("secteurs : saisie, validation, édition et persistance sans modifier les anciens tours", async ({
  page,
}) => {
  await seed(page, [{ ...fixture[0], layout: undefined, laps: [] }]);
  await page.getByRole("button", { name: "Spa ACC", exact: true }).click();
  await page.getByLabel("Chrono", { exact: true }).fill("1:37.317");
  for (const [i, v] of ["30.000", "31.000", "36.318"].entries())
    await page.getByLabel(`S${i + 1}`, { exact: true }).fill(v);
  await page.getByRole("button", { name: "Ajouter le tour" }).click();
  await expect(page.locator("#lap-error")).toContainText("somme");
  await expect(page.locator(".laps-panel tbody tr")).toHaveCount(0);
  await page.getByLabel("S3", { exact: true }).fill("36.317");
  await page.getByRole("button", { name: "Ajouter le tour" }).click();
  await expect(page.locator(".laps-panel tbody tr")).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Sector Analysis" }),
  ).toContainText("1:37.317");
  await page
    .getByRole("button", { name: "Modifier le tour 1", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Chrono", { exact: true })
    .fill("98.000");
  await page
    .getByRole("dialog")
    .getByLabel("S3", { exact: true })
    .fill("37.000");
  await page.getByRole("button", { name: "Enregistrer le chrono" }).click();
  await expect(page.locator(".pace-hero>strong")).toHaveText("1:38.000");
  await page.reload();
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!)[0].laps[0],
      key,
    ),
  ).toMatchObject({ timeMs: 98000, sectors: [30000, 31000, 37000] });
  await page.getByRole("button", { name: "Spa ACC", exact: true }).click();
  await page
    .getByRole("button", { name: "Invalider le tour 1", exact: true })
    .click();
  await expect(page.locator(".sector-metrics")).toContainText("—");
});
test("progression et comparaison avancée ne mélangent pas les configurations", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page);
  await page
    .getByRole("button", { name: "Driver Progress", exact: true })
    .first()
    .click();
  const select = page.getByLabel("Circuit de progression", { exact: true });
  const gpValue = await select
    .locator("option")
    .filter({ hasText: "Spa · GP" })
    .getAttribute("value");
  await select.selectOption(gpValue!);
  await expect(page.locator(".progress-kpis")).toContainText("+2.000 s");
  await expect(page.locator(".progress-kpis")).toContainText("+2.00 %");
  await expect(page.locator(".progress-page tbody tr")).toHaveCount(2);
  await expect(
    page.locator(".progress-chart .recharts-line-curve"),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Session Comparison", exact: true })
    .click();
  await page.getByLabel("Session 1", { exact: true }).selectOption("v2-a");
  await expect(
    page
      .getByLabel("Session 2", { exact: true })
      .locator('option[value="v2-c"]'),
  ).toHaveCount(0);
  await page.getByLabel("Session 2", { exact: true }).selectOption("v2-b");
  await expect(page.locator(".advanced-comparison")).toContainText(
    "Tour idéal théorique",
  );
  await expect(page.locator(".advanced-comparison")).toContainText(
    "Meilleur S1",
  );
  await expect(page.locator(".comparison-lap-table tbody tr")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Driver Progress", exact: true })
    .first()
    .click();
  await page.locator(".progress-chart").scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "/tmp/racelab-v2-progress-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("CSV : correspondance, erreurs, confirmation, doublons et JSON v2", async ({
  page,
}) => {
  await seed(page, [{ ...fixture[0], laps: [] }]);
  await page.getByRole("button", { name: "Importer CSV", exact: true }).click();
  const csv =
    "lap;clock;valid;S1;S2;S3\n10;97.317;true;30.000;31.000;36.317\n11;98.000;false;30.000;31.000;37.000\n12;bad;true;;;";
  const upload = () =>
    page.getByLabel("Fichier CSV", { exact: true }).setInputFiles({
      name: "laps.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await upload();
  await page.getByLabel("Colonne Chrono", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Prévisualiser l’import" }).click();
  await expect(page.locator(".csv-preview tbody tr")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Confirmer l’import de 2 tours" }),
  ).toBeDisabled();
  await page.getByLabel("Je confirme l’exclusion", { exact: false }).check();
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!)[0].laps.length,
      key,
    ),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Confirmer l’import de 2 tours" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".laps-panel tbody tr")).toHaveCount(2);
  await expect(page.locator(".pace-hero>strong")).toHaveText("1:37.317");
  await page.getByRole("button", { name: "Importer CSV", exact: true }).click();
  await upload();
  await page.getByLabel("Colonne Chrono", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Prévisualiser l’import" }).click();
  await expect(page.locator(".import-summary")).toContainText(
    "2 doublons potentiels",
  );
  await expect(
    page.getByRole("button", { name: "Confirmer l’import de 0 tours" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter JSON" }).click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(backup.formatVersion).toBe(2);
  expect(backup.sessions[0].laps[0].sectors).toEqual([30000, 31000, 36317]);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Spa · GP ACC", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!)[0].laps.length,
      key,
    ),
  ).toBe(2);
});
test("onglets concurrents : aucune réécriture silencieuse, export de la copie et résolution explicite", async ({
  page,
  context,
}) => {
  await seed(page, [{ ...fixture[0], laps: [] }]);
  const second = await context.newPage();
  await second.goto("/");
  await addSession(page, "Onglet A");
  await expect(second.locator(".conflict-alert")).toBeVisible();
  await addSession(second, "Brouillon B");
  const saved = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!),
    key,
  );
  expect(saved.some((s: { circuit: string }) => s.circuit === "Onglet A")).toBe(
    true,
  );
  expect(
    saved.some((s: { circuit: string }) => s.circuit === "Brouillon B"),
  ).toBe(false);
  const downloadPromise = second.waitForEvent("download");
  await second.getByRole("button", { name: "Exporter JSON" }).click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(
    backup.sessions.some(
      (s: { circuit: string }) => s.circuit === "Brouillon B",
    ),
  ).toBe(true);
  await second
    .getByRole("button", { name: "Charger la version de l’autre onglet" })
    .click();
  await second
    .getByRole("button", { name: "Charger la version externe" })
    .click();
  await expect(second.locator(".conflict-alert")).toHaveCount(0);
  await expect(
    second.getByRole("button", { name: "Onglet A ACC", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!).length,
      key,
    ),
  ).toBe(2);
});
test("v1 préservée au chargement, contrôle avant écriture et grand historique paginé", async ({
  page,
}) => {
  const many = Array.from({ length: 250 }, (_, i) => ({
    ...fixture[0],
    id: `legacy-${i}`,
    circuit: `Circuit ${i}`,
    layout: undefined,
    laps: [{ id: `lap-${i}`, number: 1, timeMs: 97317, valid: true }],
  }));
  await seed(page, many);
  expect(
    await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!)[0], key),
  ).toEqual(JSON.parse(JSON.stringify(many[0])));
  await page
    .getByRole("button", { name: "Historique", exact: false })
    .first()
    .click();
  await expect(page.locator(".session-table tbody tr")).toHaveCount(50);
  await expect(page.locator(".pagination")).toContainText("250 sessions");
  await page.getByRole("button", { name: "Suivante", exact: true }).click();
  await expect(page.locator(".pagination")).toContainText("page 2/5");
  // Simuler un changement externe sans événement storage : le contrôle avant écriture doit encore le détecter.
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key, data: fixture },
  );
  await addSession(page, "Tentative stale");
  await expect(page.locator(".conflict-alert")).toBeVisible();
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!).length,
      key,
    ),
  ).toBe(3);
});
