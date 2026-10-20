import { parseTime, parseSectors, type Lap } from "./model";
export interface CsvTable {
  headers: string[];
  rows: { line: number; cells: string[] }[];
  delimiter: string;
}
export interface CsvMapping {
  time: number;
  number: number;
  valid: number;
  s1: number;
  s2: number;
  s3: number;
}
export interface CsvRow {
  line: number;
  timeMs: number | null;
  valid: boolean;
  sectors?: [number, number, number];
  sourceNumber: number | null;
  duplicate: boolean;
  sourceKey: string;
  errors: string[];
}
export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export function parseCsv(text: string): CsvTable {
  if (text.length > MAX_CSV_BYTES) throw Error("Le CSV dépasse 2 Mo.");
  text = text.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/)[0];
  let quote = false;
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (let i = 0; i < first.length; i++) {
    if (first[i] === '"') {
      if (quote && first[i + 1] === '"') i++;
      else quote = !quote;
    } else if (!quote && first[i] in counts)
      counts[first[i] as keyof typeof counts]++;
  }
  const delimiter = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1]
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ",";
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [],
    field = "",
    quoted = false,
    closed = false,
    line = 1,
    rowLine = 1;
  const push = () => {
    cells.push(field.trim());
    if (cells.some((c) => c !== "")) rows.push({ line: rowLine, cells });
    cells = [];
    field = "";
    closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        field += c;
        if (c === "\n") line++;
      }
      continue;
    }
    if (c === delimiter) {
      cells.push(field.trim());
      field = "";
      closed = false;
      continue;
    }
    if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      push();
      line++;
      rowLine = line;
      continue;
    }
    if (c === '"') {
      if (field.trim() || closed)
        throw Error(`Guillemet inattendu à la ligne ${line}.`);
      quoted = true;
      continue;
    }
    if (closed && c.trim())
      throw Error(`Caractère après un guillemet fermé, ligne ${line}.`);
    field += c;
  }
  if (quoted)
    throw Error("Le CSV contient un champ entre guillemets non fermé.");
  if (field || cells.length) push();
  if (!rows.length) throw Error("Le CSV est vide.");
  const headers = rows.shift()!.cells;
  if (
    headers.some((h) => !h) ||
    new Set(headers.map((h) => h.toLowerCase())).size !== headers.length
  )
    throw Error("Chaque colonne doit avoir un nom non vide et unique.");
  if (rows.length > 10000) throw Error("Limite : 10 000 lignes par import.");
  return { headers, rows, delimiter };
}
export function defaultMapping(headers: string[]): CsvMapping {
  const find = (aliases: string[]) =>
    headers.findIndex((h) =>
      aliases.includes(h.toLowerCase().replace(/[ _-]/g, "")),
    );
  return {
    time: find(["time", "laptime", "chrono", "temps"]),
    number: find(["lap", "tour", "number", "lapnumber"]),
    valid: find(["valid", "valide"]),
    s1: find(["s1", "sector1", "secteur1"]),
    s2: find(["s2", "sector2", "secteur2"]),
    s3: find(["s3", "sector3", "secteur3"]),
  };
}
const fingerprint = (l: {
  timeMs: number;
  valid: boolean;
  sectors?: number[];
}) => JSON.stringify([l.timeMs, l.valid, l.sectors ?? null]);
export function previewCsv(
  table: CsvTable,
  mapping: CsvMapping,
  existing: Lap[],
): CsvRow[] {
  if (mapping.time < 0 || mapping.time >= table.headers.length)
    throw Error("Choisissez la colonne du chrono.");
  if (
    Object.values(mapping).some(
      (i) => !Number.isInteger(i) || i < -1 || i >= table.headers.length,
    )
  )
    throw Error("Correspondance de colonnes invalide.");
  const mapped = Object.values(mapping).filter((i) => i >= 0);
  if (new Set(mapped).size !== mapped.length)
    throw Error("Une même colonne ne peut pas avoir plusieurs rôles.");
  if (
    [mapping.s1, mapping.s2, mapping.s3].some((i) => i >= 0) &&
    [mapping.s1, mapping.s2, mapping.s3].some((i) => i < 0)
  )
    throw Error("Associez les trois colonnes de secteurs ou aucune.");
  const seen = new Set<string>(),
    seenNumbers = new Set<number>();
  const existingPrints = new Set(existing.map(fingerprint));
  const existingNumbers = new Set(
    existing.map((l) => `${l.number}:${fingerprint(l)}`),
  );
  const existingSources = new Set(
    existing
      .filter((l) => l.csvSource)
      .map((l) => JSON.stringify([l.csvSource, fingerprint(l)])),
  );
  return table.rows.map(({ line, cells }) => {
    const errors: string[] = [];
    if (cells.length !== table.headers.length)
      errors.push("Nombre de colonnes incorrect.");
    const timeMs = parseTime(cells[mapping.time] ?? "");
    if (timeMs === null)
      errors.push("Chrono invalide (ex. 1:37.317 ou 97.317).");
    let valid = true;
    const status =
      mapping.valid >= 0
        ? (cells[mapping.valid] ?? "").trim().toLowerCase()
        : "";
    if (["false", "0", "non", "no", "invalid", "invalide"].includes(status))
      valid = false;
    else if (
      !["", "true", "1", "oui", "yes", "valid", "valide"].includes(status)
    )
      errors.push("Validité inconnue.");
    let sourceNumber: number | null = null;
    if (mapping.number >= 0) {
      const value = cells[mapping.number] ?? "";
      sourceNumber = /^\d+$/.test(value) ? Number(value) : null;
      if (
        sourceNumber === null ||
        !Number.isSafeInteger(sourceNumber) ||
        sourceNumber <= 0
      )
        errors.push("Numéro de tour invalide.");
      else if (seenNumbers.has(sourceNumber))
        errors.push("Numéro de tour répété dans le fichier.");
      else seenNumbers.add(sourceNumber);
    }
    let sectors: [number, number, number] | undefined;
    if (mapping.s1 >= 0 && timeMs !== null) {
      try {
        sectors = parseSectors(
          [mapping.s1, mapping.s2, mapping.s3].map((i) => cells[i] ?? ""),
          timeMs,
        );
      } catch (error) {
        errors.push((error as Error).message);
      }
    }
    const signature = fingerprint({ timeMs: timeMs ?? 0, valid, sectors });
    const identity =
      mapping.number >= 0 ? `${sourceNumber}:${signature}` : signature;
    const duplicate =
      !errors.length &&
      (seen.has(identity) ||
        (mapping.number >= 0
          ? existingNumbers.has(identity) ||
            existingSources.has(JSON.stringify([identity, signature]))
          : existingPrints.has(signature)));
    if (!errors.length) seen.add(identity);
    return {
      line,
      timeMs,
      valid,
      sectors,
      sourceNumber,
      duplicate,
      sourceKey: identity,
      errors,
    };
  });
}
