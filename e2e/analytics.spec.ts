import { test, expect, type Page } from "@playwright/test";
const fixture = [
  {
    id: "analysis-a",
    circuit: "Spa",
    car: "Porsche",
    game: "ACC",
    date: "2026-10-17",
    type: "Essais",
    conditions: "Sec",
    laps: [
      { id: "a1", number: 1, timeMs: 97317, valid: true },
      { id: "a2", number: 2, timeMs: 95000, valid: false },
      { id: "a3", number: 3, timeMs: 98317, valid: true },
    ],
  },
  {
    id: "analysis-b",
    circuit: "Spa",
    car: "Ferrari",
    game: "ACC",
    date: "2026-10-18",
    type: "Qualifications",
    conditions: "Pluie",
    laps: [
      { id: "b1", number: 1, timeMs: 99317, valid: true },
      { id: "b2", number: 2, timeMs: 100317, valid: true },
    ],
  },
  {
    id: "analysis-c",
    circuit: "Monza",
    car: "BMW",
    game: "iRacing",
    date: "2026-10-18",
    type: "Course",
    laps: [{ id: "c1", number: 1, timeMs: 80000, valid: true }],
  },
];
async function seed(page: Page) {
  await page.goto("/");
  await page.evaluate(
    (data) => localStorage.setItem("racelab.sessions.v1", JSON.stringify(data)),
    fixture,
  );
  await page.reload();
}
test("graphique exact, infobulle avec écart, régularité et records réactifs", async ({
  page,
}) => {
  await seed(page);
  await page
    .getByRole("button", { name: "Personal Records", exact: true })
    .click();
  const spa = page
    .locator(".record-card")
    .filter({ has: page.getByRole("heading", { name: "Spa", exact: true }) });
  await expect(spa).toContainText("1:37.317");
  await expect(spa).toContainText("Porsche");
  await spa
    .getByRole("button", { name: "Ouvrir la session du record" })
    .click();
  const analysis = page.getByRole("region", { name: "Consistency Analysis" });
  await expect(analysis).toContainText("0.500 s");
  await expect(analysis).toContainText("66.7 %");
  await expect(analysis).toContainText("+1.000 s entre le début et la fin");
  await expect(page.locator('.chart [data-valid="false"]')).toHaveCount(1);
  const dot = page.locator('.chart circle[data-lap="3"]');
  await dot.hover();
  await expect(page.locator(".chart-tooltip")).toContainText("1:38.317");
  await expect(page.locator(".chart-tooltip")).toContainText("+1.000 s");
  await page
    .getByRole("button", { name: "Invalider le tour 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Personal Records", exact: true })
    .click();
  await expect(spa).toContainText("1:38.317");
  await page.reload();
  await page
    .getByRole("button", { name: "Personal Records", exact: true })
    .click();
  await expect(spa).toContainText("1:38.317");
  await spa
    .getByRole("button", { name: "Ouvrir la session du record" })
    .click();
  await page
    .getByRole("button", { name: "Supprimer cette session", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirmer la suppression" }).click();
  await page
    .getByRole("button", { name: "Personal Records", exact: true })
    .click();
  await expect(spa).toContainText("1:39.317");
  await expect(spa).toContainText("Ferrari");
  await expect(spa).not.toContainText("Porsche");
  await page.reload();
  await page
    .getByRole("button", { name: "Personal Records", exact: true })
    .click();
  await expect(spa).toContainText("1:39.317");
});
test("page de comparaison : sélection, deux courbes réelles et contexte", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page);
  await page
    .getByRole("button", { name: "Session Comparison", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Session Comparison",
  );
  await page
    .getByRole("combobox", { name: "Session 1", exact: true })
    .selectOption("analysis-a");
  const second = page.getByRole("combobox", { name: "Session 2", exact: true });
  await expect(second.locator('option[value="analysis-c"]')).toHaveCount(0);
  await second.selectOption("analysis-b");
  await expect(page.locator(".comparison-warning")).toContainText(
    "Voitures différentes",
  );
  await expect(page.locator(".comparison-warning")).toContainText(
    "Conditions différentes : Sec / Pluie",
  );
  await expect(page.locator(".comparison-delta")).toContainText("+2.000 s");
  await expect(
    page.locator(".comparison-chart .recharts-line-curve"),
  ).toHaveCount(2);
  await expect(
    page.locator('.comparison-chart [data-valid="false"]'),
  ).toHaveCount(1);
  await page.locator('.comparison-chart circle[data-lap="1"]').first().hover();
  await expect(page.locator(".chart-tooltip")).toContainText("1:37.317");
  await expect(page.locator(".chart-tooltip")).toContainText("1:39.317");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.locator(".comparison-chart .recharts-line-curve"),
  ).toHaveCount(2);
  await page.screenshot({
    path: "/tmp/racelab-comparison-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("combobox", { name: "Session 1", exact: true })
    .selectOption("analysis-c");
  await expect(second).toHaveValue("");
  await expect(page.locator(".comparison-chart")).toHaveCount(0);
  await expect(
    page.getByText("Aucune autre session sur ce circuit.", { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("conditions facultatives conservées après édition et rechargement", async ({
  page,
}) => {
  await seed(page);
  await page
    .getByRole("button", { name: "Personal Records", exact: true })
    .click();
  await page
    .locator(".record-card")
    .filter({ has: page.getByRole("heading", { name: "Spa", exact: true }) })
    .getByRole("button", { name: "Ouvrir la session du record" })
    .click();
  await page
    .getByRole("button", { name: "Modifier la session", exact: true })
    .click();
  await page
    .getByLabel("Conditions de piste (facultatif)", { exact: true })
    .fill("Sec, 22 °C");
  await page
    .getByRole("button", { name: "Enregistrer les modifications" })
    .click();
  await page.reload();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("racelab.sessions.v1")!).find(
          (s: { id: string }) => s.id === "analysis-a",
        ).conditions,
    ),
  ).toBe("Sec, 22 °C");
});
