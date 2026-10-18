import { describe, it, expect } from "vitest";
import { createBackup, parseBackup } from "./backup";
import {
  demoSessions,
  isSessions,
  parseTime,
  stats,
  chartDomain,
} from "./model";
describe("sauvegardes JSON v1", () => {
  it("exporte et restaure intégralement les sessions, chronos, identifiants et champs facultatifs", () => {
    const sessions = demoSessions();
    sessions[0].conditions = "Sec";
    const backup = createBackup(sessions, new Date("2026-10-18T12:30:00.000Z"));
    expect(backup).toMatchObject({
      formatVersion: 1,
      exportedAt: "2026-10-18T12:30:00.000Z",
    });
    expect(parseBackup(JSON.stringify(backup)).sessions).toEqual(sessions);
    expect(parseBackup(JSON.stringify(createBackup([]))).sessions).toEqual([]);
  });
  it.each([
    "{oops",
    "null",
    "[]",
    "{}",
    '{"formatVersion":2}',
    '{"sessions":[]}',
  ])("refuse un fichier invalide sans modifier les données : %s", (text) =>
    expect(() => parseBackup(text)).toThrow(),
  );
  it("refuse les dates d’exportation impossibles ou absentes", () => {
    for (const date of [undefined, "2026-02-30T12:00:00.000Z", "hello"])
      expect(() =>
        parseBackup(JSON.stringify({ ...createBackup([]), exportedAt: date })),
      ).toThrow();
  });
  it("refuse les doublons et les chronos corrompus", () => {
    const base = demoSessions()[0];
    for (const sessions of [
      [base, base],
      [{ ...base, laps: [base.laps[0], { ...base.laps[0], number: 2 }] }],
      [{ ...base, laps: [{ ...base.laps[0], timeMs: -1 }] }],
      [{ ...base, laps: [{ ...base.laps[0], timeMs: 0 }] }],
      [{ ...base, laps: [{ ...base.laps[0], timeMs: 1.5 }] }],
      [{ ...base, laps: [{ ...base.laps[0], number: 2 }] }],
    ])
      expect(() =>
        parseBackup(JSON.stringify({ ...createBackup([]), sessions })),
      ).toThrow();
  });
  it("conserve les anciennes sessions sans conditions et les champs additionnels", () => {
    const sessions = demoSessions();
    const backup = {
      ...createBackup(sessions),
      sessions: sessions.map((s) => ({ ...s, futureNote: "conserver" })),
    };
    expect(isSessions(backup.sessions)).toBe(true);
    expect(parseBackup(JSON.stringify(backup)).sessions[0]).toHaveProperty(
      "futureNote",
      "conserver",
    );
  });
  it("refuse l’export de données corrompues et les métadonnées mal typées", () => {
    const sessions = demoSessions();
    sessions[0].laps[0].timeMs = -1;
    expect(() => createBackup(sessions)).toThrow();
    const malformed = {
      ...createBackup([]),
      sessions: [{ ...demoSessions()[0], conditions: 42 }],
    };
    expect(() => parseBackup(JSON.stringify(malformed))).toThrow();
  });
});
describe("robustesse des chronos et longues sessions", () => {
  it("accepte le retour d’édition d’un chrono long et refuse les dépassements numériques", () => {
    expect(parseTime("1000:00.001")).toBe(60000001);
    expect(parseTime("999999999999999999999999.000")).toBeNull();
    expect(parseTime("-97.317")).toBeNull();
  });
  it("calcule sans dépassement de pile pour 150 000 tours", () => {
    const laps = Array.from({ length: 150000 }, (_, i) => ({
      id: String(i),
      number: i + 1,
      timeMs: 100000 + (i % 1000),
      valid: true,
    }));
    expect(stats(laps)).toMatchObject({
      best: 100000,
      mean: 100499.5,
      spread: 999,
      count: 150000,
    });
    const domain = chartDomain(laps.map((l) => l.timeMs / 1000));
    expect(domain[0]).toBeLessThan(100);
    expect(domain[1]).toBeGreaterThan(100.999);
  });
});
