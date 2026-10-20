import { formatTime, sectorStats, type Session } from "./model";
export function SectorInputs({
  values,
  onChange,
}: {
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset className="sector-inputs">
      <legend>Secteurs facultatifs · S1 + S2 + S3 = chrono</legend>
      {values.map((value, i) => (
        <label key={i}>
          S{i + 1}
          <input
            aria-label={`S${i + 1}`}
            placeholder="32.439"
            value={value}
            onChange={(e) =>
              onChange(values.map((v, n) => (n === i ? e.target.value : v)))
            }
          />
        </label>
      ))}
    </fieldset>
  );
}
export function SectorAnalysis({ session }: { session: Session }) {
  const analysis = sectorStats(session.laps);
  return (
    <section className="panel sector-analysis" aria-label="Sector Analysis">
      <div className="section-heading">
        <div>
          <h2>Sector Analysis</h2>
          <p>
            Meilleurs secteurs des tours valides complets ·{" "}
            {analysis.completeCount} tours exploitables
          </p>
        </div>
      </div>
      <div className="sector-metrics">
        {analysis.best.map((v, i) => (
          <div key={i}>
            <span>MEILLEUR S{i + 1}</span>
            <strong>{formatTime(v)}</strong>
          </div>
        ))}
        <div>
          <span>TOUR IDÉAL THÉORIQUE</span>
          <strong>{formatTime(analysis.ideal)}</strong>
        </div>
        <div>
          <span>RÉEL − IDÉAL</span>
          <strong>
            {analysis.gap === null
              ? "—"
              : `${(analysis.gap / 1000).toFixed(3)} s`}
          </strong>
        </div>
      </div>
      <p className="analysis-note">
        L’idéal combine des secteurs observés, sans garantir qu’ils soient
        réalisables ensemble. Un écart négatif est possible si le meilleur tour
        réel n’a pas de secteurs renseignés.
      </p>
      {session.laps.some((l) => l.sectors) ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>TOUR</th>
                <th>S1</th>
                <th>S2</th>
                <th>S3</th>
                <th>TOTAL</th>
                <th>STATUT</th>
              </tr>
            </thead>
            <tbody>
              {session.laps
                .filter((l) => l.sectors)
                .map((l) => (
                  <tr key={l.id}>
                    <td>{l.number}</td>
                    {l.sectors!.map((v, i) => (
                      <td
                        className={`mono ${l.valid && v === analysis.best[i] ? "sector-best" : ""}`}
                        key={i}
                      >
                        {formatTime(v)}
                      </td>
                    ))}
                    <td className="mono">{formatTime(l.timeMs)}</td>
                    <td>
                      {l.valid ? "Valide" : "Invalide · hors statistiques"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty compact">
          Aucun secteur enregistré. Vos anciens tours restent utilisables sans
          secteurs.
        </div>
      )}
    </section>
  );
}
