import { validSectors, type Session } from "../model";

export const MAX_AI_LAPS = 2000;
export const MIN_AI_VALID_LAPS = 3;
export const MAX_REQUEST_BYTES = 256 * 1024;
export const performances = ["Faible", "Moyenne", "Bonne", "Excellente"] as const;
export const priorities = ["Rythme", "Régularité", "Validité des tours", "Secteurs"] as const;
export type Performance = typeof performances[number];
export type Priority = typeof priorities[number];
export interface AnalysisInput {
  circuit: string;
  layout: string;
  car: string;
  game: string;
  type: Session["type"];
  demo: boolean;
  laps: { timeMs: number; valid: boolean; sectors?: [number, number, number] }[];
}
export interface AnalysisResult {
  version: 1;
  performance: Performance;
  consistencyScore: number;
  priority: Priority;
  summary: string;
  tips: [string, string, string];
  validLaps: number;
  totalLaps: number;
  analyzedAt: string;
  provider: "decisions" | "responses";
}
export class AnalysisError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
  }
}
export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
// Explicit projection: IDs, dates, CSV provenance and unknown fields never leave the browser.
export function sessionInput(session: Session): AnalysisInput {
  return {
    circuit: session.circuit, layout: session.layout ?? "", car: session.car,
    game: session.game, type: session.type, demo: !!session.demo,
    laps: session.laps.map(({ timeMs, valid, sectors }) => ({ timeMs, valid, ...(sectors ? { sectors } : {}) })),
  };
}
export function validateInput(value: unknown): AnalysisInput {
  const fail = (message: string): never => { throw new AnalysisError("invalid_data", 400, message); };
  if (!record(value)) return fail("La session transmise est invalide.");
  for (const field of ["circuit", "car", "game", "layout"])
    if (typeof value[field] !== "string" || (value[field] as string).length > 160 ||
      (field !== "layout" && !(value[field] as string).trim()))
      return fail("Circuit, configuration, voiture et jeu : 160 caractères maximum par champ.");
  if (!["Essais", "Qualifications", "Course"].includes(value.type as string) || typeof value.demo !== "boolean")
    return fail("Le type de session est invalide.");
  if (!Array.isArray(value.laps) || value.laps.length > MAX_AI_LAPS)
    return fail(`L’analyse accepte au maximum ${MAX_AI_LAPS} tours par session.`);
  const laps = value.laps.map((lap) => {
    if (!record(lap) || !Number.isSafeInteger(lap.timeMs) || (lap.timeMs as number) <= 0 ||
      (lap.timeMs as number) > 86_400_000 || typeof lap.valid !== "boolean" ||
      (lap.sectors !== undefined && !validSectors(lap.sectors, lap.timeMs as number)))
      return fail("Un chrono ou ses secteurs sont invalides (maximum 24 heures par tour pour l’IA).");
    return { timeMs: lap.timeMs as number, valid: lap.valid,
      ...(lap.sectors ? { sectors: [...lap.sectors as [number, number, number]] as [number, number, number] } : {}) };
  });
  if (laps.filter((lap) => lap.valid).length < MIN_AI_VALID_LAPS)
    throw new AnalysisError("insufficient_data", 422, "Enregistrez au moins 3 tours valides pour analyser cette session.");
  return { circuit: (value.circuit as string).trim(), layout: (value.layout as string).trim(),
    car: (value.car as string).trim(), game: (value.game as string).trim(),
    type: value.type as Session["type"], demo: value.demo, laps };
}
export function isAnalysisResult(value: unknown): value is AnalysisResult {
  return record(value) && value.version === 1 && performances.includes(value.performance as Performance) &&
    priorities.includes(value.priority as Priority) && Number.isInteger(value.consistencyScore) &&
    (value.consistencyScore as number) >= 0 && (value.consistencyScore as number) <= 100 &&
    typeof value.summary === "string" && value.summary.length > 0 && value.summary.length <= 1600 &&
    Array.isArray(value.tips) && value.tips.length === 3 && new Set(value.tips).size === 3 &&
    value.tips.every((tip) => typeof tip === "string" && tip.length > 0 && tip.length <= 400) &&
    Number.isInteger(value.validLaps) && (value.validLaps as number) >= MIN_AI_VALID_LAPS &&
    Number.isInteger(value.totalLaps) && (value.totalLaps as number) >= (value.validLaps as number) &&
    (value.totalLaps as number) <= MAX_AI_LAPS && typeof value.analyzedAt === "string" &&
    Number.isFinite(Date.parse(value.analyzedAt)) && ["decisions", "responses"].includes(value.provider as string);
}
