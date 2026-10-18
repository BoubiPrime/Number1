import { describe, expect, it } from "vitest";
import {
  chartDomain,
  comparisonData,
  consistency,
  personalRecords,
  type Session,
} from "./model";
const session = (id: string, times: number[], circuit = "Spa"): Session => ({
  id,
  circuit,
  car: "Porsche",
  game: "ACC",
  date: "2026-10-18",
  type: "Essais",
  laps: times.map((timeMs, i) => ({
    id: `${id}-${i}`,
    number: i + 1,
    timeMs,
    valid: true,
  })),
});
describe("analyse de régularité", () => {
  it("exclut les invalides et compare des blocs distincts", () => {
    const s = session("a", [100000, 50000, 102000, 98000, 96000, 94000]);
    s.laps[1].valid = false;
    const result = consistency(s.laps);
    expect(result.count).toBe(5);
    expect(result.averageGap).toBe(4000);
    expect(result.spread).toBe(8000);
    expect(result.validPercent).toBeCloseTo((5 / 6) * 100);
    expect(result.blockSize).toBe(2);
    expect(result.first.map((l) => l.number)).toEqual([1, 3]);
    expect(result.last.map((l) => l.number)).toEqual([5, 6]);
    expect(result.startMean).toBe(101000);
    expect(result.endMean).toBe(95000);
    expect(result.paceChange).toBe(-6000);
  });
  it("ne produit pas une tendance à partir d’un seul tour ou de valeurs absentes", () => {
    expect(consistency([])).toMatchObject({
      averageGap: null,
      validPercent: null,
      paceChange: null,
    });
    expect(consistency(session("a", [100000]).laps)).toMatchObject({
      deviation: 0,
      averageGap: 0,
      paceChange: null,
      validPercent: 100,
    });
    expect(
      consistency(
        session("a", [100000]).laps.map((l) => ({ ...l, valid: false })),
      ),
    ).toMatchObject({ best: null, validPercent: 0, paceChange: null });
  });
});
describe("records personnels", () => {
  it("conserve le contexte du record et sépare les circuits", () => {
    const a = session("a", [100000, 90000]),
      b = session("b", [95000]),
      c = session("c", [80000], "Monza");
    a.laps[1].valid = false;
    const records = personalRecords([a, b, c]);
    expect(records).toHaveLength(2);
    expect(records.find((r) => r.circuit === "Spa")).toMatchObject({
      session: { id: "b" },
      lap: { timeMs: 95000 },
    });
    expect(
      personalRecords([a, c]).find((r) => r.circuit === "Spa")?.lap?.timeMs,
    ).toBe(100000);
    a.laps[1].valid = true;
    expect(
      personalRecords([a, b]).find((r) => r.circuit === "Spa")?.session?.id,
    ).toBe("a");
  });
  it("gère les circuits sans tour valide et les ex æquo", () => {
    const a = session("a", [100000]),
      b = session("b", [100000]);
    a.date = "2026-10-17";
    expect(personalRecords([b, a])[0].session?.id).toBe("a");
    expect(personalRecords([session("x", [])])[0]).toMatchObject({
      session: null,
      lap: null,
    });
    expect(personalRecords([])).toEqual([]);
  });
});
describe("données des graphiques", () => {
  it("utilise les chronos exacts, garde les invalides et ne prolonge pas la session courte", () => {
    const a = session("a", [97317, 98222]),
      b = session("b", [99111]);
    a.laps[1].valid = false;
    const data = comparisonData(a, b);
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ number: 1, a: 97.317, b: 99.111 });
    expect(data[1]).toMatchObject({
      number: 2,
      a: 98.222,
      b: null,
      lapA: { valid: false },
    });
    expect(data[1].lapB).toBeUndefined();
    expect(comparisonData(a, session("c", [100000], "Monza"))).toEqual([]);
    expect(comparisonData(a, a)).toEqual([]);
  });
  it("adapte l’échelle même aux écarts de quelques millisecondes et au tour unique", () => {
    const [min, max] = chartDomain([97.317, 97.319]);
    expect(min).toBeLessThan(97.317);
    expect(max).toBeGreaterThan(97.319);
    expect(max - min).toBeLessThan(0.02);
    const single = chartDomain([97]);
    expect(single[1]).toBeGreaterThan(single[0]);
    expect(chartDomain([])).toEqual([0, 1]);
  });
});
