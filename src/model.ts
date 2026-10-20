export interface Lap {
  id: string;
  number: number;
  timeMs: number;
  valid: boolean;
  sectors?: [number, number, number];
  csvSource?: string;
}
export interface Session {
  id: string;
  circuit: string;
  car: string;
  game: string;
  date: string;
  type: "Essais" | "Qualifications" | "Course";
  laps: Lap[];
  conditions?: string;
  layout?: string;
  demo?: boolean;
}
export const KEY = "racelab.sessions.v1";
export function parseTime(input: string): number | null {
  const text = input.trim();
  if (!/^(?:\d+:)?\d+\.\d{3}$/.test(text)) return null;
  const parts = text.split(":");
  if (parts.length === 2 && Number(parts[1]) >= 60) return null;
  const [seconds, fraction] = parts[parts.length - 1].split(".");
  const ms =
    (parts.length === 2 ? Number(parts[0]) * 60000 : 0) +
    Number(seconds) * 1000 +
    Number(fraction);
  return Number.isSafeInteger(ms) && ms > 0 ? ms : null;
}
export function formatTime(ms: number | null): string {
  if (ms === null) return "—";
  const rounded = Math.round(ms);
  return `${Math.floor(rounded / 60000)}:${String(Math.floor((rounded % 60000) / 1000)).padStart(2, "0")}.${String(rounded % 1000).padStart(3, "0")}`;
}
export const delta = (ms: number) =>
  `${ms >= 0 ? "+" : "−"}${(Math.abs(ms) / 1000).toFixed(3)}`;
export const circuitKey = (s: string) =>
  s
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
export function stats(laps: Lap[]) {
  const values = laps.filter((l) => l.valid).map((l) => l.timeMs);
  if (!values.length)
    return { best: null, mean: null, spread: null, deviation: null, count: 0 };
  const best = values.reduce((min, value) => Math.min(min, value), Infinity),
    mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    best,
    mean,
    spread:
      values.reduce((max, value) => Math.max(max, value), -Infinity) - best,
    deviation: Math.sqrt(
      values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length,
    ),
    count: values.length,
  };
}
export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}
export function isSessions(value: unknown): value is Session[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every((s) => {
    if (
      !s ||
      typeof s !== "object" ||
      typeof s.id !== "string" ||
      !s.id.trim() ||
      ids.has(s.id)
    )
      return false;
    ids.add(s.id);
    if (
      !["circuit", "car", "game"].every(
        (k) => typeof s[k] === "string" && s[k].trim(),
      ) ||
      !["Essais", "Qualifications", "Course"].includes(s.type) ||
      typeof s.date !== "string" ||
      !isDate(s.date) ||
      (s.conditions !== undefined && typeof s.conditions !== "string") ||
      (s.layout !== undefined && typeof s.layout !== "string") ||
      (s.demo !== undefined && typeof s.demo !== "boolean") ||
      !Array.isArray(s.laps)
    )
      return false;
    const lapIds = new Set<string>();
    return s.laps.every((l: Lap, index: number) => {
      if (
        !l ||
        typeof l.id !== "string" ||
        !l.id.trim() ||
        lapIds.has(l.id) ||
        l.number !== index + 1 ||
        !Number.isSafeInteger(l.timeMs) ||
        l.timeMs <= 0 ||
        typeof l.valid !== "boolean" ||
        (l.sectors !== undefined && !validSectors(l.sectors, l.timeMs)) ||
        (l.csvSource !== undefined && typeof l.csvSource !== "string")
      )
        return false;
      lapIds.add(l.id);
      return true;
    });
  });
}
export function demoSessions(): Session[] {
  return [
    {
      circuit: "Spa-Francorchamps",
      car: "Porsche 911 GT3 R",
      game: "Assetto Corsa Competizione",
      date: "2026-10-17",
      type: "Essais",
      times: [141820, 140432, 139751, 140120, 138946, 139220, 139580, 139105],
    },
    {
      circuit: "Spa-Francorchamps",
      car: "Ferrari 296 GT3",
      game: "Assetto Corsa Competizione",
      date: "2026-10-15",
      type: "Qualifications",
      times: [141221, 140630, 139880, 139412, 140025],
    },
    {
      circuit: "Monza",
      car: "BMW M4 GT3",
      game: "iRacing",
      date: "2026-10-12",
      type: "Course",
      times: [109520, 108830, 109110, 108244, 108760, 109030],
    },
  ].map((s, i) => ({
    id: `demo-${i}`,
    circuit: s.circuit,
    car: s.car,
    game: s.game,
    date: s.date,
    type: s.type as Session["type"],
    demo: true,
    laps: s.times.map((timeMs, n) => ({
      id: `demo-${i}-${n}`,
      number: n + 1,
      timeMs,
      valid: n !== 3,
    })),
  }));
}

/** Analyse descriptive : blocs de début/fin de même taille, sans chevauchement. */
export function consistency(laps: Lap[]) {
  const valid = laps.filter((l) => l.valid);
  const summary = stats(laps);
  const blockSize = Math.min(3, Math.floor(valid.length / 2));
  const average = (block: Lap[]) =>
    block.reduce((sum, l) => sum + l.timeMs, 0) / block.length;
  const first = blockSize ? valid.slice(0, blockSize) : [];
  const last = blockSize ? valid.slice(-blockSize) : [];
  const startMean = blockSize ? average(first) : null;
  const endMean = blockSize ? average(last) : null;
  return {
    ...summary,
    averageGap:
      summary.mean === null || summary.best === null
        ? null
        : summary.mean - summary.best,
    validPercent: laps.length ? (valid.length / laps.length) * 100 : null,
    blockSize,
    first,
    last,
    startMean,
    endMean,
    paceChange:
      startMean === null || endMean === null ? null : endMean - startMean,
  };
}
export function personalRecords(sessions: Session[]) {
  const groups = new Map<
    string,
    { circuit: string; session: Session | null; lap: Lap | null }
  >();
  // À chrono égal, conserver la date la plus ancienne puis les identifiants pour un résultat stable.
  const ordered = [...sessions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  for (const session of ordered) {
    const key = configurationKey(session);
    if (!groups.has(key))
      groups.set(key, {
        circuit: circuitLabel(session),
        session: null,
        lap: null,
      });
    const record = groups.get(key)!;
    for (const lap of session.laps)
      if (lap.valid && (!record.lap || lap.timeMs < record.lap.timeMs)) {
        record.session = session;
        record.lap = lap;
        record.circuit = circuitLabel(session);
      }
  }
  return [...groups.values()].sort((a, b) =>
    a.circuit.localeCompare(b.circuit, "fr"),
  );
}
export function comparisonData(a: Session, b: Session) {
  if (a.id === b.id || !compatibleSessions(a, b)) return [];
  return Array.from(
    { length: Math.max(a.laps.length, b.laps.length) },
    (_, i) => ({
      number: i + 1,
      a: a.laps[i] ? a.laps[i].timeMs / 1000 : null,
      b: b.laps[i] ? b.laps[i].timeMs / 1000 : null,
      lapA: a.laps[i],
      lapB: b.laps[i],
    }),
  );
}
export function chartDomain(values: number[]): [number, number] {
  if (!values.length) return [0, 1];
  const min = values.reduce((a, b) => Math.min(a, b), Infinity),
    max = values.reduce((a, b) => Math.max(a, b), -Infinity);
  const padding = Math.max((max - min) * 0.12, 0.005);
  return [Math.max(0, min - padding), max + padding];
}

export const configurationKey = (s: Pick<Session, "circuit" | "layout">) =>
  JSON.stringify([circuitKey(s.circuit), circuitKey(s.layout ?? "")]);
export const circuitLabel = (s: Pick<Session, "circuit" | "layout">) =>
  `${s.circuit}${s.layout?.trim() ? ` · ${s.layout.trim()}` : ""}`;
export const compatibleSessions = (a: Session, b: Session) =>
  configurationKey(a) === configurationKey(b);
// Les secteurs sont saisis avec une résolution de 1 ms : leur somme doit être exacte.
export function validSectors(
  value: unknown,
  total: number,
): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((v) => Number.isSafeInteger(v) && v > 0) &&
    value.reduce((a, b) => a + b, 0) === total
  );
}
export function parseSectors(
  values: string[],
  total: number,
): [number, number, number] | undefined {
  if (values.every((v) => !v.trim())) return undefined;
  if (values.length !== 3 || values.some((v) => !v.trim()))
    throw new Error("Renseignez les trois secteurs ou laissez-les tous vides.");
  const parsed = values.map(parseTime);
  if (parsed.some((v) => v === null))
    throw new Error(
      "Secteurs : format attendu 32.439 ou 0:32.439, avec trois décimales.",
    );
  if (!validSectors(parsed, total))
    throw new Error(
      `La somme des secteurs (${formatTime((parsed as number[]).reduce((a, b) => a + b, 0))}) doit correspondre exactement au chrono (${formatTime(total)}).`,
    );
  return parsed;
}
export function sectorStats(laps: Lap[]) {
  const complete = laps.filter(
    (l) => l.valid && l.sectors && validSectors(l.sectors, l.timeMs),
  );
  const best: (number | null)[] = [0, 1, 2].map((i) =>
    complete.length
      ? complete.reduce((min, l) => Math.min(min, l.sectors![i]), Infinity)
      : null,
  );
  const ideal = best.every((v) => v !== null)
    ? (best as number[]).reduce((sum, v) => sum + v, 0)
    : null;
  const real = stats(laps).best;
  return {
    best,
    ideal,
    completeCount: complete.length,
    real,
    gap: ideal !== null && real !== null ? real - ideal : null,
  };
}
export function driverProgress(sessions: Session[]) {
  if (sessions.some((s) => !compatibleSessions(s, sessions[0])))
    throw Error("La progression nécessite une même configuration de circuit.");
  const rows = [...sessions]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((session) => ({ session, ...stats(session.laps) }));
  const valid = rows.filter((r) => r.best !== null);
  const first = valid[0]?.best ?? null,
    last = valid.at(-1)?.best ?? null;
  return {
    rows,
    first,
    last,
    improvement: first !== null && last !== null ? first - last : null,
    percent:
      first !== null && last !== null ? ((first - last) / first) * 100 : null,
  };
}
