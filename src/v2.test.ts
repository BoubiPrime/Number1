import { describe, it, expect } from "vitest";
import {
  compatibleSessions,
  configurationKey,
  driverProgress,
  parseSectors,
  sectorStats,
  isSessions,
  personalRecords,
  type Session,
} from "./model";
import { createBackup, parseBackup } from "./backup";
import { parseCsv, previewCsv, defaultMapping } from "./csv";
const session = (id: string, times: number[], layout?: string): Session => ({
  id,
  circuit: "Spa",
  layout,
  car: "Porsche",
  game: "ACC",
  date: `2026-10-${id === "a" ? "17" : "18"}`,
  type: "Essais",
  laps: times.map((timeMs, i) => ({
    id: `${id}-${i}`,
    number: i + 1,
    timeMs,
    valid: true,
  })),
});
describe("secteurs et compatibilité v1", () => {
  it("conserve les anciens tours, les identifiants et la clé lors du passage au format JSON 2", () => {
    const old = session("a", [97317]);
    const backup = {
      formatVersion: 1,
      exportedAt: "2026-10-18T10:00:00.000Z",
      sessions: [old],
    };
    expect(parseBackup(JSON.stringify(backup)).sessions).toEqual([old]);
    expect(createBackup([old]).formatVersion).toBe(2);
  });
  it("refuse un secteur négatif, une somme incohérente et un remplissage partiel", () => {
    expect(parseSectors(["30.000", "31.000", "36.317"], 97317)).toEqual([
      30000, 31000, 36317,
    ]);
    expect(parseSectors(["", "", ""], 97317)).toBeUndefined();
    for (const data of [
      ["30.000", "", "36.317"],
      ["-30.000", "31.000", "36.317"],
      ["30.000", "31.000", "36.318"],
    ])
      expect(() => parseSectors(data, 97317)).toThrow();
    const s = session("a", [97317]);
    s.laps[0].sectors = [30000, 31000, 36318];
    expect(isSessions([s])).toBe(false);
  });
  it("compose l’idéal uniquement avec les tours valides complets", () => {
    const s = session("a", [100000, 101000, 90000, 95000]);
    s.laps[0].sectors = [30000, 30000, 40000];
    s.laps[1].sectors = [29000, 32000, 40000];
    s.laps[2].sectors = [28000, 28000, 34000];
    s.laps[2].valid = false;
    expect(sectorStats(s.laps)).toMatchObject({
      best: [29000, 30000, 40000],
      ideal: 99000,
      completeCount: 2,
      real: 95000,
      gap: -4000,
    });
    expect(sectorStats([]).ideal).toBeNull();
  });
  it("sépare les configurations et les records sans renommer les anciennes sessions", () => {
    const a = session("a", [100000]),
      b = session("b", [90000], "GP");
    expect(compatibleSessions(a, b)).toBe(false);
    expect(personalRecords([a, b])).toHaveLength(2);
    expect(configurationKey({ ...a, layout: " GP " })).toBe(
      configurationKey(b),
    );
    expect(a.layout).toBeUndefined();
  });
});
describe("progression", () => {
  it("calcule un gain chronologique et exclut les sessions sans tour valide des références", () => {
    const a = session("a", [100000, 102000]),
      b = session("b", [98000]);
    const invalid = {
      ...session("z", [50000]),
      date: "2026-10-19",
      laps: [{ id: "z", number: 1, timeMs: 50000, valid: false }],
    };
    expect(driverProgress([invalid, b, a])).toMatchObject({
      first: 100000,
      last: 98000,
      improvement: 2000,
      percent: 2,
    });
    expect(() => driverProgress([a, { ...b, layout: "National" }])).toThrow();
    expect(driverProgress([]).improvement).toBeNull();
  });
  it("traite de nombreux historiques sans regrouper des circuits différents", () => {
    const sessions = Array.from({ length: 2500 }, (_, i) => ({
      ...session(String(i), [100000 + (i % 100), 101000]),
      circuit: `Circuit ${i % 50}`,
    }));
    expect(personalRecords(sessions)).toHaveLength(50);
    expect(
      driverProgress(sessions.filter((s) => s.circuit === "Circuit 1")).rows,
    ).toHaveLength(50);
  });
});
describe("CSV générique", () => {
  it("parse BOM, séparateurs, guillemets échappés et retours de ligne", () => {
    const parsed = parseCsv(
      '\uFEFFtour;chrono;note\r\n1;"1:37.317";"texte; et ""citation"""\r\n',
    );
    expect(parsed.delimiter).toBe(";");
    expect(parsed.rows[0].cells).toEqual([
      "1",
      "1:37.317",
      'texte; et "citation"',
    ]);
    expect(parseCsv("chrono\tvalide\n97.317\ttrue").delimiter).toBe("\t");
    expect(
      parseCsv('chrono,note\n97.317,"ligne 1\nligne 2"').rows[0].cells[1],
    ).toBe("ligne 1\nligne 2");
    for (const invalid of [
      "",
      "chrono,chrono\n1,2",
      'chrono,note\n97.317,"non ferme',
      'chrono\n"97.317"bad',
    ])
      expect(() => parseCsv(invalid)).toThrow();
  });
  it("valide les colonnes, les secteurs et les erreurs de chaque ligne", () => {
    const table = parseCsv(
      "tour,chrono,valide,s1,s2,s3\n1,97.317,true,30.000,31.000,36.317\n2,-1.000,false,,,\n3,98.000,inconnu,30.000,31.000,36.000",
    );
    const result = previewCsv(table, defaultMapping(table.headers), []);
    expect(result[0]).toMatchObject({
      timeMs: 97317,
      valid: true,
      sectors: [30000, 31000, 36317],
      errors: [],
    });
    expect(result[1].errors.length).toBeGreaterThan(0);
    expect(result[2].errors).toHaveLength(2);
    expect(() =>
      previewCsv(table, { ...defaultMapping(table.headers), time: -1 }, []),
    ).toThrow();
    expect(() =>
      previewCsv(table, { ...defaultMapping(table.headers), valid: 1 }, []),
    ).toThrow();
  });
  it("détecte les doublons et conserve une provenance après renumérotation", () => {
    const table = parseCsv("tour,chrono\n10,97.317\n11,97.317");
    const mapping = defaultMapping(table.headers);
    const first = previewCsv(table, mapping, []);
    expect(first.map((r) => r.duplicate)).toEqual([false, false]);
    const existing = first.map((r, i) => ({
      id: String(i),
      number: i + 1,
      timeMs: r.timeMs!,
      valid: r.valid,
      csvSource: r.sourceKey,
    }));
    expect(previewCsv(table, mapping, existing).every((r) => r.duplicate)).toBe(
      true,
    );
    const noNumbers = parseCsv("chrono\n97.317\n97.317");
    expect(
      previewCsv(noNumbers, defaultMapping(noNumbers.headers), []).map(
        (r) => r.duplicate,
      ),
    ).toEqual([false, true]);
  });
  it("refuse les numéros répétés et les limites de taille", () => {
    const table = parseCsv("tour,chrono\n1,97.317\n1,98.000");
    expect(
      previewCsv(table, defaultMapping(table.headers), [])[1].errors,
    ).toContain("Numéro de tour répété dans le fichier.");
    expect(() => parseCsv("x".repeat(2 * 1024 * 1024 + 1))).toThrow();
  });
});
