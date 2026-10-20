import { ArrowUpRight, TrendingUp } from "lucide-react";
import {
  compatibleSessions,
  delta,
  driverProgress,
  type Session,
} from "./model";
export function DashboardProgress({
  sessions,
  show,
}: {
  sessions: Session[];
  show: () => void;
}) {
  const latest = [...sessions].sort((a, b) => b.date.localeCompare(a.date))[0];
  const comparable = latest
    ? sessions.filter(
        (s) =>
          compatibleSessions(s, latest) &&
          s.car === latest.car &&
          s.game === latest.game,
      )
    : [];
  const progress = driverProgress(comparable);
  return (
    <section className="progress-strip panel">
      <div className="progress-strip-icon">
        <TrendingUp size={22} />
      </div>
      <div>
        <span className="eyebrow">DRIVER DEVELOPMENT</span>
        <h2>
          {latest
            ? `${latest.circuit} · ${latest.layout || "configuration non renseignée"}`
            : "Votre progression commence ici"}
        </h2>
        <p>
          Même circuit, configuration, voiture et jeu · conditions non vérifiées
        </p>
      </div>
      <div className="progress-strip-gain">
        <strong>
          {progress.rows.filter((r) => r.best !== null).length < 2
            ? "—"
            : `${delta(progress.improvement!)} s`}
        </strong>
        <small>
          {progress.rows.filter((r) => r.best !== null).length < 2
            ? "Deux sessions valides nécessaires"
            : "Gain entre première et dernière référence"}
        </small>
      </div>
      <button className="secondary" onClick={show}>
        Driver Progress
        <ArrowUpRight size={15} />
      </button>
    </section>
  );
}
