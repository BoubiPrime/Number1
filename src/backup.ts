import { isSessions, type Session } from "./model";
export const FORMAT_VERSION = 1;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export interface Backup {
  formatVersion: 1;
  exportedAt: string;
  sessions: Session[];
}
export function createBackup(sessions: Session[], date = new Date()): Backup {
  if (!isSessions(sessions))
    throw new Error("Les données actuelles ne peuvent pas être exportées.");
  return {
    formatVersion: FORMAT_VERSION,
    exportedAt: date.toISOString(),
    sessions,
  };
}
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Le fichier ne contient pas un JSON valide.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Structure de sauvegarde invalide.");
  const value = data as Record<string, unknown>;
  if (value.formatVersion !== FORMAT_VERSION)
    throw new Error(
      "Version de sauvegarde non prise en charge. Aucune donnée n’a été modifiée.",
    );
  if (
    typeof value.exportedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.exportedAt) ||
    !Number.isFinite(Date.parse(value.exportedAt)) ||
    new Date(value.exportedAt).toISOString() !== value.exportedAt
  )
    throw new Error("Date d’exportation invalide.");
  if (!isSessions(value.sessions))
    throw new Error(
      "Sessions ou tours invalides : champs, dates, chronos, ordre ou identifiants dupliqués.",
    );
  return {
    formatVersion: FORMAT_VERSION,
    exportedAt: value.exportedAt,
    sessions: value.sessions,
  };
}
