import { lazy, Suspense } from "react";
import { Activity, ArrowRight, CircleHelp, Trophy } from "lucide-react";
import {
  circuitKey,
  compatibleSessions,
  circuitLabel,
  consistency,
  delta,
  formatTime,
  personalRecords,
  stats,
  type Session,
} from "./model";
import { AdvancedComparison } from "./AdvancedComparison";
const ComparisonChart = lazy(() =>
  import("./LapChart").then((module) => ({ default: module.ComparisonChart })),
);
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR");
const seconds = (value: number | null) =>
  value === null ? "—" : `${(value / 1000).toFixed(3)} s`;
function AnalysisMetric({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help: string;
}) {
  return (
    <div className="analysis-metric">
      <span>
        {label}
        <CircleHelp size={12} tabIndex={0} aria-label={help}>
          <title>{help}</title>
        </CircleHelp>
      </span>
      <strong className="mono">{value}</strong>
      <p>{help}</p>
    </div>
  );
}
export function ConsistencyAnalysis({ session }: { session: Session }) {
  const analysis = consistency(session.laps);
  return (
    <section
      className="panel consistency-panel"
      aria-label="Consistency Analysis"
    >
      <div className="section-heading">
        <div>
          <h2>Consistency Analysis</h2>
          <p>
            Régularité et évolution du rythme · uniquement les tours valides.
          </p>
        </div>
        <Activity size={18} />
      </div>
      <div className="consistency-grid">
        <AnalysisMetric
          label="Écart-type"
          value={seconds(analysis.deviation)}
          help="Dispersion des chronos valides. Une valeur faible indique des temps plus proches."
        />
        <AnalysisMetric
          label="Meilleur → moins bon"
          value={seconds(analysis.spread)}
          help="Différence entre le plus lent et le plus rapide des tours valides."
        />
        <AnalysisMetric
          label="Écart moyen au meilleur"
          value={seconds(analysis.averageGap)}
          help="Moyenne des écarts de chaque tour valide au meilleur tour valide."
        />
        <AnalysisMetric
          label="Tours valides"
          value={
            analysis.validPercent === null
              ? "—"
              : `${analysis.validPercent.toFixed(1)} %`
          }
          help={`${analysis.count} tours valides sur ${session.laps.length} tours enregistrés.`}
        />
      </div>
      <div className="pace-evolution">
        <div>
          <span className="eyebrow">ÉVOLUTION DU RYTHME</span>
          <h3>
            {analysis.paceChange === null
              ? "Au moins deux tours valides sont nécessaires."
              : `${delta(analysis.paceChange)} s entre le début et la fin`}
          </h3>
          <p>
            {analysis.paceChange === null
              ? "Enregistrez des tours valides pour comparer deux blocs distincts."
              : `Moyennes des ${analysis.blockSize} premier${analysis.blockSize > 1 ? "s" : ""} et ${analysis.blockSize} dernier${analysis.blockSize > 1 ? "s" : ""} tours valides, sans chevauchement. Un écart négatif indique une fin plus rapide ; aucune cause n’est déduite.`}
          </p>
        </div>
        {analysis.paceChange !== null && (
          <div className="evolution-blocks">
            <span>
              Début · tours {analysis.first.map((l) => l.number).join(", ")}
              <strong>{formatTime(analysis.startMean)}</strong>
            </span>
            <ArrowRight size={16} />
            <span>
              Fin · tours {analysis.last.map((l) => l.number).join(", ")}
              <strong>{formatTime(analysis.endMean)}</strong>
            </span>
          </div>
        )}
      </div>
      {analysis.count === 0 && (
        <p className="analysis-note">
          Aucun tour valide : les statistiques de chrono restent vides. Les
          tours invalides sont conservés dans le graphique.
        </p>
      )}
    </section>
  );
}
export function PersonalRecords({
  sessions,
  open,
}: {
  sessions: Session[];
  open: (s: Session) => void;
}) {
  const records = personalRecords(sessions);
  return (
    <section className="panel personal-records" aria-label="Personal Records">
      <div className="section-heading">
        <div>
          <h2>Personal Records</h2>
          <p>
            Un record par circuit, avec sa voiture et son jeu. Aucun classement
            entre circuits.
          </p>
        </div>
        <Trophy size={18} />
      </div>
      {records.length ? (
        <div className="records-grid">
          {records.map((record) => (
            <article className="record-card" key={circuitKey(record.circuit)}>
              <div className="flex items-center justify-between gap-3">
                <h3>{record.circuit}</h3>
                <Trophy size={16} />
              </div>
              <strong className="record-time mono">
                {formatTime(record.lap?.timeMs ?? null)}
              </strong>
              {record.session && record.lap ? (
                <>
                  <dl>
                    <div>
                      <dt>Voiture</dt>
                      <dd>{record.session.car}</dd>
                    </div>
                    <div>
                      <dt>Jeu</dt>
                      <dd>{record.session.game}</dd>
                    </div>
                    <div>
                      <dt>Date</dt>
                      <dd>{dateLabel(record.session.date)}</dd>
                    </div>
                    <div>
                      <dt>Tour</dt>
                      <dd>
                        {record.lap.number}
                        {record.session.demo && " · Démonstration"}
                      </dd>
                    </div>
                  </dl>
                  <button
                    className="text-button"
                    onClick={() => open(record.session!)}
                  >
                    Ouvrir la session du record
                    <ArrowRight size={14} />
                  </button>
                </>
              ) : (
                <p className="muted">
                  Aucun tour valide enregistré sur ce circuit.
                </p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <Trophy size={30} />
          <h3>Votre premier record vous attend.</h3>
          <p>
            Enregistrez un tour valide dans une session pour établir votre
            référence.
          </p>
        </div>
      )}
      <p className="analysis-note">
        À chrono égal, la session la plus ancienne est retenue. Les conditions,
        voitures et jeux peuvent différer.
      </p>
    </section>
  );
}
export function SessionComparison({
  sessions,
  selected,
  onSelect,
  open,
}: {
  sessions: Session[];
  selected: string[];
  onSelect: (ids: string[]) => void;
  open: (s: Session) => void;
}) {
  const a = sessions.find((s) => s.id === selected[0]);
  const b = sessions.find((s) => s.id === selected[1]);
  const comparable = a && b && a.id !== b.id && compatibleSessions(a, b);
  const firstOptions = [...sessions].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const secondOptions = a
    ? firstOptions.filter((s) => s.id !== a.id && compatibleSessions(s, a))
    : [];
  return (
    <div className="session-comparison">
      <section className="panel comparison-selectors">
        <div className="section-heading">
          <div>
            <h2>Session Comparison</h2>
            <p>
              Sélectionnez deux runs du même circuit et de la même
              configuration. Les tours sont alignés par numéro, sans
              interpolation.
            </p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Session 1
            <select
              aria-label="Session 1"
              value={a?.id ?? ""}
              onChange={(e) => {
                const first = sessions.find((s) => s.id === e.target.value);
                onSelect(
                  first
                    ? [
                        first.id,
                        ...(b &&
                        b.id !== first.id &&
                        compatibleSessions(b, first)
                          ? [b.id]
                          : []),
                      ]
                    : [],
                );
              }}
            >
              <option value="">Choisir une session</option>
              {firstOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {circuitLabel(s)} · {s.car} · {dateLabel(s.date)} · {s.game} ·{" "}
                  {s.type}
                </option>
              ))}
            </select>
          </label>
          <label>
            Session 2
            <select
              aria-label="Session 2"
              disabled={!a}
              value={comparable ? b.id : ""}
              onChange={(e) =>
                onSelect(
                  a ? (e.target.value ? [a.id, e.target.value] : [a.id]) : [],
                )
              }
            >
              <option value="">Choisir sur le même circuit</option>
              {secondOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {circuitLabel(s)} · {s.car} · {dateLabel(s.date)} · {s.game} ·{" "}
                  {s.type}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      {!comparable ? (
        <div className="panel empty">
          <Activity size={28} />
          <h3>Deux sessions, une même piste.</h3>
          <p>
            {a && !secondOptions.length
              ? "Aucune autre session sur ce circuit. Créez un second run pour comparer."
              : "Choisissez deux sessions distinctes pour afficher les statistiques et les courbes."}
          </p>
        </div>
      ) : (
        <>
          <div className="comparison-warning" role="note">
            {a.car !== b.car && (
              <p>
                Voitures différentes : {a.car} / {b.car}.
              </p>
            )}
            {a.game !== b.game && (
              <p>
                Jeux différents : {a.game} / {b.game}.
              </p>
            )}
            {a.date !== b.date && (
              <p>
                Dates différentes : {dateLabel(a.date)} / {dateLabel(b.date)}.
              </p>
            )}
            {a.type !== b.type && (
              <p>
                Types de session différents : {a.type} / {b.type}.
              </p>
            )}
            {!a.conditions?.trim() || !b.conditions?.trim() ? (
              <p>
                Conditions de piste non renseignées : l’équivalence des
                conditions ne peut pas être vérifiée.
              </p>
            ) : a.conditions.trim().toLowerCase() !==
              b.conditions.trim().toLowerCase() ? (
              <p>
                Conditions différentes : {a.conditions} / {b.conditions}.
              </p>
            ) : (
              <p>
                Conditions déclarées identiques : {a.conditions}. Les autres
                paramètres ne sont pas vérifiés.
              </p>
            )}
            <p>
              La comparaison n’est pas parfaitement équivalente : carburant,
              pneus, météo et réglages ne sont pas mesurés.
            </p>
          </div>
          <div className="compare-grid">
            {[a, b].map((s, i) => {
              const summary = stats(s.laps);
              return (
                <article
                  className={`panel compare-card series-${i}`}
                  key={s.id}
                >
                  <span className="eyebrow">
                    SESSION {i + 1} · {s.circuit}
                  </span>
                  <h3>{s.car}</h3>
                  <p>
                    {s.game}
                    <br />
                    {dateLabel(s.date)} · {s.type}
                    <br />
                    Conditions : {s.conditions?.trim() || "Non renseignées"}
                  </p>
                  <span>Meilleur chrono valide</span>
                  <strong>{formatTime(summary.best)}</strong>
                  <span>Chrono moyen valide</span>
                  <strong>{formatTime(summary.mean)}</strong>
                  <span>Régularité · écart-type</span>
                  <strong>{seconds(summary.deviation)}</strong>
                  <span>
                    {summary.count} tours valides / {s.laps.length}
                  </span>
                  <button className="text-button" onClick={() => open(s)}>
                    Ouvrir cette session
                    <ArrowRight size={14} />
                  </button>
                </article>
              );
            })}
          </div>
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Chronos comparés · {a.circuit}</h2>
                <p>Les tours invalides restent visibles, hors statistiques.</p>
              </div>
            </div>
            <Suspense
              fallback={
                <div className="chart empty">Chargement des courbes…</div>
              }
            >
              <ComparisonChart key={`${a.id}-${b.id}`} a={a} b={b} />
            </Suspense>
            <div className="chart-legend">
              <span>
                <i className="legend-line" />
                Session 1
              </span>
              <span>
                <i className="legend-line blue-line" />
                Session 2
              </span>
              <span>● Meilleurs tours valides</span>
              <span className="invalid-legend">× Invalides</span>
            </div>
          </section>
          <AdvancedComparison a={a} b={b} />
          <div className="panel comparison-delta">
            {(() => {
              const first = stats(a.laps).best,
                second = stats(b.laps).best;
              return first !== null && second !== null ? (
                <>
                  <span>
                    Écart des meilleurs chronos · session 2 − session 1
                  </span>
                  <strong className="mono">{delta(second - first)} s</strong>
                  <p>
                    Un écart négatif signifie que la session 2 a un meilleur
                    chrono plus rapide.
                  </p>
                </>
              ) : (
                <p>
                  Ajoutez au moins un tour valide dans chaque session pour
                  calculer l’écart.
                </p>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}
