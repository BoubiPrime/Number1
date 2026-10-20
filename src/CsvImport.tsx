import { useMemo, useState } from "react";
import {
  MAX_CSV_BYTES,
  defaultMapping,
  parseCsv,
  previewCsv,
  type CsvMapping,
  type CsvTable,
} from "./csv";
import { circuitLabel, formatTime, type Session, type Lap } from "./model";
const labels: Record<keyof CsvMapping, string> = {
  time: "Chrono",
  number: "Numéro de tour",
  valid: "Validité",
  s1: "Secteur S1",
  s2: "Secteur S2",
  s3: "Secteur S3",
};
export function CsvImport({
  sessions,
  initialSession,
  save,
}: {
  sessions: Session[];
  initialSession?: string;
  save: (id: string, laps: Lap[], expected: Lap[]) => Promise<boolean>;
}) {
  const [sessionId, setSessionId] = useState(
    initialSession ?? sessions[0]?.id ?? "",
  );
  const [table, setTable] = useState<CsvTable | null>(null),
    [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [error, setError] = useState(""),
    [reading, setReading] = useState(false),
    [preview, setPreview] = useState(false),
    [includeDuplicates, setInclude] = useState(false),
    [skipErrors, setSkip] = useState(false),
    [saving, setSaving] = useState(false);
  const session = sessions.find((s) => s.id === sessionId);
  const results = useMemo(() => {
    if (!table || !mapping) return { rows: [], error: "" };
    try {
      return {
        rows: previewCsv(table, mapping, session?.laps ?? []),
        error: "",
      };
    } catch (e) {
      return { rows: [], error: (e as Error).message };
    }
  }, [table, mapping, session]);
  const failures = results.rows.filter((r) => r.errors.length),
    duplicates = results.rows.filter((r) => r.duplicate);
  const accepted = results.rows.filter(
    (r) => !r.errors.length && (includeDuplicates || !r.duplicate),
  );
  const submit = async () => {
    if (
      !session ||
      !accepted.length ||
      results.error ||
      (failures.length && !skipErrors)
    )
      return;
    setSaving(true);
    setError("");
    const laps = accepted.map((r, i) => ({
      id: crypto.randomUUID(),
      number: session.laps.length + i + 1,
      timeMs: r.timeMs!,
      valid: r.valid,
      csvSource: r.sourceKey,
      ...(r.sectors ? { sectors: r.sectors } : {}),
    }));
    try {
      if (!(await save(session.id, laps, session.laps)))
        setError(
          "Import non enregistré : la session a changé ou le stockage est indisponible. Vos données existantes sont conservées.",
        );
    } catch {
      setError("Import impossible. Aucun tour n’a été ajouté.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="csv-import">
      <p className="modal-copy">
        CSV générique UTF-8, en-têtes requis. Séparateur virgule, point-virgule
        ou tabulation. Chronos 1:37.317 ou 97.317 ; les nombres bruts en
        millisecondes et les formats natifs des jeux ne sont pas interprétés
        automatiquement.
      </p>
      <a
        className="text-button"
        href={`${import.meta.env.BASE_URL}exemple-chronos.csv`}
        download
      >
        Télécharger un exemple CSV fictif
      </a>
      {!sessions.length ? (
        <div className="empty compact">
          Créez une session avant d’importer ses tours.
        </div>
      ) : (
        <>
          <label>
            Session de destination
            <select
              aria-label="Session CSV"
              value={sessionId}
              onChange={(e) => {
                setSessionId(e.target.value);
                setPreview(false);
              }}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {circuitLabel(s)} · {s.car} · {s.game} · {s.date}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fichier CSV (2 Mo maximum)
            <input
              type="file"
              accept=".csv,text/csv,text/tab-separated-values"
              aria-label="Fichier CSV"
              disabled={reading || saving}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setError("");
                setTable(null);
                setMapping(null);
                setPreview(false);
                setInclude(false);
                setSkip(false);
                setReading(true);
                try {
                  if (file.size > MAX_CSV_BYTES)
                    throw Error("Le CSV dépasse 2 Mo.");
                  const parsed = parseCsv(await file.text());
                  setTable(parsed);
                  setMapping(defaultMapping(parsed.headers));
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setReading(false);
                }
              }}
            />
          </label>
          {reading && <p role="status">Lecture du CSV…</p>}
          {table && mapping && (
            <>
              <div className="column-mapping">
                {(Object.keys(labels) as (keyof CsvMapping)[]).map((key) => (
                  <label key={key}>
                    {labels[key]}
                    <select
                      aria-label={`Colonne ${labels[key]}`}
                      value={mapping[key]}
                      onChange={(e) => {
                        setMapping({
                          ...mapping,
                          [key]: Number(e.target.value),
                        });
                        setPreview(false);
                      }}
                    >
                      <option value={-1}>
                        {key === "time"
                          ? "Choisir une colonne"
                          : "Non utilisée"}
                      </option>
                      {table.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <p className="analysis-note">
                {table.rows.length} lignes détectées. Les lignes seront ajoutées
                dans l’ordre du fichier puis renumérotées. Les numéros source
                servent à la détection des doublons, pas à remplacer des tours.
              </p>
              <button
                className="secondary"
                onClick={() => {
                  setPreview(true);
                  setError("");
                }}
              >
                Prévisualiser l’import
              </button>
              {preview && (
                <>
                  {results.error ? (
                    <p className="form-error" role="alert">
                      {results.error}
                    </p>
                  ) : (
                    <>
                      <div className="import-summary">
                        <strong>{accepted.length} tours à ajouter</strong>
                        <span>
                          {failures.length} lignes en erreur ·{" "}
                          {duplicates.length} doublons potentiels
                        </span>
                      </div>
                      <div className="table-scroll csv-preview">
                        <table>
                          <thead>
                            <tr>
                              <th>LIGNE</th>
                              <th>CHRONO</th>
                              <th>S1 / S2 / S3</th>
                              <th>VALIDITÉ</th>
                              <th>CONTRÔLE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {results.rows.slice(0, 200).map((r) => (
                              <tr key={r.line}>
                                <td>{r.line}</td>
                                <td className="mono">{formatTime(r.timeMs)}</td>
                                <td className="mono">
                                  {r.sectors?.map(formatTime).join(" / ") ??
                                    "—"}
                                </td>
                                <td>{r.valid ? "Valide" : "Invalide"}</td>
                                <td
                                  className={
                                    r.errors.length ? "form-error" : ""
                                  }
                                >
                                  {r.errors.join(" ") ||
                                    (r.duplicate
                                      ? "Doublon potentiel · exclu par défaut"
                                      : "Prêt")}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {results.rows.length > 200 && (
                        <p className="muted">
                          Aperçu limité à 200 lignes ; toutes les{" "}
                          {results.rows.length} lignes ont été contrôlées.
                        </p>
                      )}
                      {failures.length > 0 && (
                        <label className="inline-check">
                          <input
                            type="checkbox"
                            checked={skipErrors}
                            onChange={(e) => setSkip(e.target.checked)}
                          />
                          Je confirme l’exclusion des {failures.length} lignes
                          en erreur.
                        </label>
                      )}
                      {duplicates.length > 0 && (
                        <label className="inline-check">
                          <input
                            type="checkbox"
                            checked={includeDuplicates}
                            onChange={(e) => setInclude(e.target.checked)}
                          />
                          Inclure les doublons potentiels (deux tours identiques
                          peuvent être légitimes).
                        </label>
                      )}
                      <p className="analysis-note">
                        Confirmer ajoutera {accepted.length} tours à cette
                        session.{" "}
                        {failures.length +
                          results.rows.filter(
                            (r) =>
                              !r.errors.length &&
                              r.duplicate &&
                              !includeDuplicates,
                          ).length}{" "}
                        lignes seront exclues. Aucun tour existant ne sera
                        remplacé.
                      </p>
                      <button
                        className="primary"
                        disabled={
                          !session ||
                          !accepted.length ||
                          Boolean(failures.length && !skipErrors) ||
                          saving
                        }
                        onClick={submit}
                      >
                        {saving
                          ? "Enregistrement…"
                          : `Confirmer l’import de ${accepted.length} tours`}
                      </button>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
