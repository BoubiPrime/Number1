import {
  comparisonData,
  delta,
  formatTime,
  sectorStats,
  stats,
  type Session,
} from "./model";
export function AdvancedComparison({ a, b }: { a: Session; b: Session }) {
  const x = sectorStats(a.laps),
    y = sectorStats(b.laps),
    sa = stats(a.laps),
    sb = stats(b.laps);
  const metrics = [
    { label: "Meilleur valide", a: sa.best, b: sb.best },
    { label: "Moyenne valide", a: sa.mean, b: sb.mean },
    { label: "Écart-type", a: sa.deviation, b: sb.deviation },
    ...[0, 1, 2].map((i) => ({
      label: `Meilleur S${i + 1}`,
      a: x.best[i],
      b: y.best[i],
    })),
    { label: "Tour idéal théorique", a: x.ideal, b: y.ideal },
  ];
  return (
    <>
      <section className="panel advanced-comparison">
        <div className="section-heading">
          <div>
            <h2>Performance Delta</h2>
            <p>
              Secteurs des tours valides complets. Écart = session 2 − session
              1.
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>INDICATEUR</th>
                <th>SESSION 1</th>
                <th>SESSION 2</th>
                <th>ÉCART (s)</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m, i) => (
                <tr key={m.label}>
                  <td>{m.label}</td>
                  <td className="mono">
                    {i === 2
                      ? m.a === null
                        ? "—"
                        : `${(m.a / 1000).toFixed(3)} s`
                      : formatTime(m.a)}
                  </td>
                  <td className="mono">
                    {i === 2
                      ? m.b === null
                        ? "—"
                        : `${(m.b / 1000).toFixed(3)} s`
                      : formatTime(m.b)}
                  </td>
                  <td className="mono">
                    {m.a === null || m.b === null ? "—" : delta(m.b - m.a)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Comparaison tour par tour</h2>
          <span className="muted">
            Alignement par numéro, aucune interpolation
          </span>
        </div>
        <div className="table-scroll comparison-lap-table">
          <table>
            <thead>
              <tr>
                <th>TOUR</th>
                <th>SESSION 1</th>
                <th>SECTEURS 1</th>
                <th>SESSION 2</th>
                <th>SECTEURS 2</th>
                <th>ÉCART VALIDE (s)</th>
              </tr>
            </thead>
            <tbody>
              {comparisonData(a, b).map((row) => (
                <tr key={row.number}>
                  <td>{row.number}</td>
                  <td className="mono">
                    {formatTime(row.lapA?.timeMs ?? null)}
                    {row.lapA && !row.lapA.valid && (
                      <span className="invalid-label"> · invalide</span>
                    )}
                  </td>
                  <td className="mono">
                    {row.lapA?.sectors?.map(formatTime).join(" / ") ?? "—"}
                  </td>
                  <td className="mono">
                    {formatTime(row.lapB?.timeMs ?? null)}
                    {row.lapB && !row.lapB.valid && (
                      <span className="invalid-label"> · invalide</span>
                    )}
                  </td>
                  <td className="mono">
                    {row.lapB?.sectors?.map(formatTime).join(" / ") ?? "—"}
                  </td>
                  <td className="mono">
                    {row.lapA?.valid && row.lapB?.valid
                      ? delta(row.lapB.timeMs - row.lapA.timeMs)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
