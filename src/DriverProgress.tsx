import { lazy, Suspense, useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import {
  circuitLabel,
  configurationKey,
  delta,
  driverProgress,
  formatTime,
  type Session,
} from "./model";
const ProgressChart = lazy(() => import("./ProgressChart"));
export function DriverProgress({
  sessions,
  open,
}: {
  sessions: Session[];
  open: (s: Session) => void;
}) {
  const [config, setConfig] = useState(""),
    [car, setCar] = useState(""),
    [game, setGame] = useState("");
  const configurations = useMemo(
    () =>
      [
        ...new Map(
          sessions.map((s) => [configurationKey(s), circuitLabel(s)]),
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1])),
    [sessions],
  );
  const selected = configurations.some(([key]) => key === config)
    ? config
    : (configurations[0]?.[0] ?? "");
  const compatible = useMemo(
    () => sessions.filter((s) => configurationKey(s) === selected),
    [sessions, selected],
  );
  const filtered = useMemo(
    () =>
      compatible.filter(
        (s) => (!car || s.car === car) && (!game || s.game === game),
      ),
    [compatible, car, game],
  );
  const analysis = useMemo(() => driverProgress(filtered), [filtered]);
  const mixed =
    new Set(filtered.map((s) => s.car)).size > 1 ||
    new Set(filtered.map((s) => s.game)).size > 1;
  return (
    <div className="progress-page">
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Driver Progress</h2>
            <p>Analyse chronologique d’une seule configuration de circuit.</p>
          </div>
          <TrendingUp size={20} />
        </div>
        <div className="progress-filters">
          <label>
            Circuit et configuration
            <select
              aria-label="Circuit de progression"
              value={selected}
              onChange={(e) => {
                setConfig(e.target.value);
                setCar("");
                setGame("");
              }}
            >
              <option value="" disabled>
                Choisir un circuit
              </option>
              {configurations.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Voiture
            <select
              aria-label="Voiture de progression"
              value={car}
              onChange={(e) => setCar(e.target.value)}
            >
              <option value="">Toutes les voitures</option>
              {[...new Set(compatible.map((s) => s.car))].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Jeu
            <select
              aria-label="Jeu de progression"
              value={game}
              onChange={(e) => setGame(e.target.value)}
            >
              <option value="">Tous les jeux</option>
              {[...new Set(compatible.map((s) => s.game))].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
      </section>
      {!filtered.length ? (
        <div className="panel empty">
          <TrendingUp />
          <h3>Aucune session à analyser</h3>
          <p>Créez une session ou ajustez les filtres.</p>
        </div>
      ) : (
        <>
          {mixed && (
            <div className="comparison-warning">
              Voitures ou jeux différents : les écarts sont descriptifs et ne
              mesurent pas à eux seuls la progression du pilote. Affinez les
              filtres.
            </div>
          )}
          <div className="progress-kpis">
            <div className="panel">
              <span>PREMIÈRE RÉFÉRENCE</span>
              <strong>{formatTime(analysis.first)}</strong>
            </div>
            <div className="panel">
              <span>DERNIÈRE RÉFÉRENCE</span>
              <strong>{formatTime(analysis.last)}</strong>
            </div>
            <div className="panel">
              <span>GAIN DE CHRONO</span>
              <strong>
                {analysis.improvement === null
                  ? "—"
                  : `${delta(analysis.improvement)} s`}
              </strong>
            </div>
            <div className="panel">
              <span>GAIN RELATIF</span>
              <strong>
                {analysis.percent === null
                  ? "—"
                  : `${analysis.percent >= 0 ? "+" : ""}${analysis.percent.toFixed(2)} %`}
              </strong>
            </div>
          </div>
          <p className="analysis-note">
            Gain = premier meilleur tour valide − dernier meilleur tour valide ;
            positif = amélioration. Les sessions sans tour valide n’entrent pas
            dans ces références. Une session unique n’établit pas de tendance. À
            date identique, l’ordre est départagé par identifiant, faute d’heure
            enregistrée. Une configuration non renseignée reste un groupe
            distinct des configurations explicites.
          </p>
          <section className="panel">
            <div className="section-heading">
              <h2>Meilleur chrono & rythme moyen</h2>
              <span className="muted">Secondes · tours valides</span>
            </div>
            <Suspense
              fallback={
                <div className="chart empty">Chargement de la progression…</div>
              }
            >
              <ProgressChart rows={analysis.rows} />
            </Suspense>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>Journal de progression</h2>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>VOITURE / JEU</th>
                    <th>MEILLEUR</th>
                    <th>MOYENNE</th>
                    <th>ÉCART-TYPE</th>
                    <th>VALIDES</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {analysis.rows.map((row) => (
                    <tr key={row.session.id}>
                      <td>{row.session.date}</td>
                      <td>
                        {row.session.car}
                        <small className="table-sub">{row.session.game}</small>
                      </td>
                      <td className="mono best-text">{formatTime(row.best)}</td>
                      <td className="mono">{formatTime(row.mean)}</td>
                      <td className="mono">
                        {row.deviation === null
                          ? "—"
                          : `${(row.deviation / 1000).toFixed(3)} s`}
                      </td>
                      <td>{row.count}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => open(row.session)}
                        >
                          Ouvrir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
