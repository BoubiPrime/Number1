import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  Upload,
  Flag,
  Gauge,
  GitCompareArrows,
  LayoutDashboard,
  MapPin,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Timer,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import {
  KEY,
  circuitKey,
  delta,
  demoSessions,
  formatTime,
  isDate,
  isSessions,
  parseTime,
  personalRecords,
  stats,
  type Lap,
  type Session,
} from "./model";

import {
  ConsistencyAnalysis,
  PersonalRecords,
  SessionComparison,
} from "./Analytics";

import {
  createBackup,
  parseBackup,
  MAX_BACKUP_BYTES,
  type Backup,
} from "./backup";

type DeleteTarget =
  | { kind: "session"; id: string }
  | { kind: "demo" }
  | { kind: "reset" };
type View = "dashboard" | "history" | "session" | "comparison" | "records";
const dateLabel = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return { sessions: demoSessions(), error: "" };
    const data: unknown = JSON.parse(raw);
    if (!isSessions(data)) throw Error();
    return { sessions: data, error: "" };
  } catch {
    return {
      sessions: [] as Session[],
      error:
        "Les données locales sont illisibles. Elles ont été conservées. Réinitialisez le stockage pour reprendre la sauvegarde.",
    };
  }
}
function Metric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  icon: ReactNode;
}) {
  return (
    <div className="metric panel">
      <div className="metric-label">
        {label}
        {icon}
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </div>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const elements = () => [
      ...(ref.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]):not([type="file"]), select:not([disabled]), [tabindex="0"]',
      ) ?? []),
    ];
    if (!ref.current?.contains(document.activeElement)) elements()[0]?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab") return;
      const all = elements(),
        first = all[0],
        last = all[all.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={close} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
const LapChart = lazy(() => import("./LapChart"));
export default function App() {
  const [initial] = useState(load);
  const [sessions, setSessions] = useState<Session[]>(initial.sessions);
  const [storageError, setStorageError] = useState(initial.error);
  const [view, setView] = useState<View>("dashboard");
  const [selected, setSelected] = useState<string | null>(null);
  const [recordCircuit, setRecordCircuit] = useState("");
  const [create, setCreate] = useState(false);
  const [editingSession, setEditingSession] = useState<string | null>(null);
  const [editingLap, setEditingLap] = useState<string | null>(null);
  const [storageBlocked, setStorageBlocked] = useState(Boolean(initial.error));
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [query, setQuery] = useState("");
  const [game, setGame] = useState("");
  const [comparison, setComparison] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [notice, setNotice] = useState("");
  const [time, setTime] = useState("");
  const [valid, setValid] = useState(true);
  const [lapError, setLapError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<Backup | null>(null);
  const [backupError, setBackupError] = useState("");
  const [readingImport, setReadingImport] = useState(false);
  const exportData = () => {
    setBackupError("");
    try {
      const backup = createBackup(sessions);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `racelab-v1-${backup.exportedAt.slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Sauvegarde JSON préparée pour téléchargement");
    } catch {
      setBackupError(
        "Impossible de créer la sauvegarde JSON. Vos données sont conservées.",
      );
    }
  };
  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBackupError("");
    setReadingImport(true);
    try {
      if (file.size > MAX_BACKUP_BYTES)
        throw new Error("Le fichier dépasse la limite de 10 Mo.");
      setPendingImport(parseBackup(await file.text()));
    } catch (error) {
      setBackupError(
        error instanceof Error
          ? error.message
          : "Impossible de lire ce fichier.",
      );
    } finally {
      setReadingImport(false);
    }
  };
  const confirmImport = () => {
    if (!pendingImport) return;
    try {
      // Écrire avant de remplacer l’état : un échec de stockage préserve la collection actuelle.
      localStorage.setItem(KEY, JSON.stringify(pendingImport.sessions));
      setSessions(pendingImport.sessions);
      setStorageBlocked(false);
      setStorageError("");
      setBackupError("");
      setSelected(null);
      setComparison([]);
      setQuery("");
      setGame("");
      setRecordCircuit("");
      setView("dashboard");
      setPendingImport(null);
      setNotice("Sauvegarde restaurée. Les données ont été remplacées.");
    } catch {
      setBackupError(
        "Restauration impossible : stockage indisponible ou plein. Les données actuelles sont conservées.",
      );
    }
  };

  useEffect(() => {
    if (storageBlocked) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(sessions));
      setStorageError("");
    } catch {
      setStorageError(
        "La sauvegarde locale est indisponible ou pleine. Vos modifications restent dans cet onglet.",
      );
    }
  }, [sessions, storageBlocked]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(id);
  }, [notice]);
  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  const current = sessions.find((s) => s.id === selected);
  const latest = sorted[0];
  const filteredSessions = sorted.filter(
    (s) =>
      circuitKey(s.circuit).includes(circuitKey(query)) &&
      (!game || s.game === game),
  );
  const active = view === "session" ? current : latest;
  const summary = active ? stats(active.laps) : stats([]);
  const groups = personalRecords(sessions).map((record) => ({
    circuit: record.circuit,
    best: record.lap?.timeMs ?? null,
  }));
  const record =
    groups.find((g) => circuitKey(g.circuit) === recordCircuit) ?? groups[0];
  const open = (s: Session) => {
    setSelected(s.id);
    setView("session");
    setTime("");
    setValid(true);
    setLapError("");
    setEditingLap(null);
  };
  const addLap = (event: FormEvent) => {
    event.preventDefault();
    const ms = parseTime(time);
    if (!ms || !current) {
      setLapError("Format attendu : 1:37.317 ou 97.317 (trois décimales).");
      return;
    }
    setSessions((prev) =>
      prev.map((s) =>
        s.id === current.id
          ? {
              ...s,
              laps: [
                ...s.laps,
                {
                  id: crypto.randomUUID(),
                  number: s.laps.length + 1,
                  timeMs: ms,
                  valid,
                },
              ],
            }
          : s,
      ),
    );
    setTime("");
    setLapError("");
    setNotice("Tour enregistré");
  };
  const toggleCompare = (s: Session) => {
    if (comparison.includes(s.id)) {
      setComparison(comparison.filter((id) => id !== s.id));
      return;
    }
    const first = sessions.find((x) => x.id === comparison[0]);
    if (first && circuitKey(first.circuit) !== circuitKey(s.circuit)) {
      setNotice("Sélectionnez deux sessions sur le même circuit.");
      return;
    }
    if (comparison.length === 2) {
      setNotice("Deux sessions maximum. Désélectionnez une session.");
      return;
    }
    setComparison([...comparison, s.id]);
  };
  const table = (items: Session[], selectable = false) => (
    <div className="table-scroll">
      <table className="session-table">
        <thead>
          <tr>
            {selectable && (
              <th>
                <GitCompareArrows size={15} />
              </th>
            )}
            <th>SESSION / CIRCUIT</th>
            <th>VOITURE</th>
            <th>TYPE</th>
            <th>TOURS</th>
            <th>MEILLEUR TOUR</th>
            <th>DATE</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id}>
              {selectable && (
                <td>
                  <input
                    aria-label={`Comparer ${s.circuit}, ${s.car}, ${s.date}`}
                    type="checkbox"
                    checked={comparison.includes(s.id)}
                    onChange={() => toggleCompare(s)}
                  />
                </td>
              )}
              <td>
                <button className="session-link" onClick={() => open(s)}>
                  <span className="track-icon">
                    <Flag size={17} />
                  </span>
                  <span>
                    <strong>{s.circuit}</strong>
                    <small>
                      {s.game}
                      {s.demo && <span className="demo-tag">DÉMO</span>}
                    </small>
                  </span>
                </button>
              </td>
              <td>{s.car}</td>
              <td>
                <span
                  className={`badge ${s.type === "Qualifications" ? "purple" : s.type === "Course" ? "blue" : ""}`}
                >
                  {s.type}
                </span>
              </td>
              <td className="mono">{s.laps.length}</td>
              <td className="mono best-text">
                {formatTime(stats(s.laps).best)}
              </td>
              <td>{dateLabel(s.date)}</td>
              <td>
                <button
                  className="icon-button"
                  onClick={() => open(s)}
                  aria-label={`Ouvrir ${s.circuit}`}
                >
                  <ChevronRight size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Aller au contenu
      </a>
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setView("dashboard");
          }}
        >
          <span className="brand-icon">
            <Activity size={26} />
          </span>
          RACE<span>LAB</span>
          <small>PERFORMANCE ENGINEERING</small>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <button
            className={
              view === "dashboard" || view === "session" ? "active" : ""
            }
            onClick={() => setView("dashboard")}
          >
            <LayoutDashboard size={19} />
            Vue d’ensemble
          </button>
          <button
            className={view === "history" ? "active" : ""}
            onClick={() => setView("history")}
          >
            <Clock3 size={19} />
            Historique<span className="nav-count">{sessions.length}</span>
          </button>
          <button
            aria-label="Session Comparison"
            className={view === "comparison" ? "active" : ""}
            onClick={() => setView("comparison")}
          >
            <GitCompareArrows size={19} />
            Comparaison
          </button>
          <button
            aria-label="Personal Records"
            className={view === "records" ? "active" : ""}
            onClick={() => setView("records")}
          >
            <Trophy size={19} />
            Records personnels
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status">
            <span className="status-dot" />
            ESPACE LOCAL
          </div>
          <p>
            Vos données. Votre performance.
            <br />
            Sans cloud, sans compromis.
          </p>
          <div className="driver">
            <div className="avatar">RL</div>
            <div>
              <strong>Pilote indépendant</strong>
              <small>RaceLab Workspace</small>
            </div>
            <ShieldCheck size={17} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <span>
              {view === "comparison"
                ? "Session Comparison"
                : view === "records"
                  ? "Personal Records"
                  : view === "history"
                    ? "Historique"
                    : view === "session"
                      ? "Analyse de session"
                      : "Vue d’ensemble"}
            </span>
          </div>
          <div className="topbar-right">
            <span
              className={`status-dot ${storageError ? "storage-failed" : ""}`}
            />{" "}
            {storageError ? "SAUVEGARDE INDISPONIBLE" : "STOCKAGE LOCAL"}{" "}
            <span className="top-divider" />
            <span className="avatar small">RL</span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {storageError && (
            <div className="alert" role="alert">
              {storageError}
              {storageBlocked && (
                <button onClick={() => setDeleting({ kind: "reset" })}>
                  Réinitialiser les données
                </button>
              )}
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">VOTRE PROCHAIN TOUR COMMENCE ICI</div>
              <h1>
                {view === "comparison"
                  ? "Session Comparison"
                  : view === "records"
                    ? "Personal Records"
                    : view === "history"
                      ? "Historique des sessions"
                      : view === "session" && current
                        ? current.circuit
                        : "Chaque millième compte."}
              </h1>
              <p>
                {view === "comparison"
                  ? "Deux sessions, une même piste. Comparez vos chronos dans leur contexte."
                  : view === "records"
                    ? "Vos références par circuit, toujours reliées à leur session."
                    : view === "history"
                      ? "Retrouvez vos runs. Mesurez votre progression."
                      : view === "session" && current
                        ? `${current.car} · ${current.game}`
                        : "Analysez vos sessions, affinez votre rythme, repoussez vos limites."}
              </p>
            </div>
            <button className="primary" onClick={() => setCreate(true)}>
              <Plus size={18} />
              Nouvelle session
            </button>
          </div>
          <div className="data-toolbar" aria-label="Sauvegarde et restauration">
            <span>
              <ShieldCheck size={14} />
              Données sur cet appareil
            </span>
            <div>
              <button className="secondary" onClick={exportData}>
                <Download size={15} />
                Exporter JSON
              </button>
              <button
                className="secondary"
                onClick={() => fileInput.current?.click()}
                disabled={readingImport}
              >
                <Upload size={15} />
                {readingImport ? "Lecture du fichier…" : "Importer JSON"}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                aria-label="Fichier de sauvegarde JSON"
                hidden
                onChange={importData}
              />
            </div>
          </div>
          {backupError && !pendingImport && (
            <div className="alert" role="alert">
              {backupError}
            </div>
          )}
          {view === "comparison" ? (
            <SessionComparison
              sessions={sessions}
              selected={comparison}
              onSelect={setComparison}
              open={open}
            />
          ) : view === "records" ? (
            <PersonalRecords sessions={sessions} open={open} />
          ) : view === "history" ? (
            <>
              <div className="history-tools">
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Rechercher un circuit"
                    placeholder="Rechercher un circuit…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Filtrer par jeu"
                  value={game}
                  onChange={(e) => setGame(e.target.value)}
                >
                  <option value="">Tous les jeux</option>
                  {[...new Set(sessions.map((s) => s.game))].map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
                <button
                  className="secondary"
                  disabled={comparison.length !== 2}
                  onClick={() => setShowCompare(true)}
                >
                  <GitCompareArrows size={16} />
                  Comparer ({comparison.length}/2)
                </button>
              </div>
              <section className="panel">
                <div className="section-heading">
                  <h2>Toutes les sessions</h2>
                  <span className="muted">Comparaison sur un même circuit</span>
                </div>
                {filteredSessions.length ? (
                  table(filteredSessions, true)
                ) : sessions.length ? (
                  <div className="empty">
                    <Search size={28} />
                    <h3>Aucune session ne correspond.</h3>
                    <p>
                      Essayez un autre circuit ou réinitialisez les filtres.
                    </p>
                    <button
                      className="secondary"
                      onClick={() => {
                        setQuery("");
                        setGame("");
                      }}
                    >
                      Réinitialiser les filtres
                    </button>
                  </div>
                ) : (
                  <Empty create={() => setCreate(true)} />
                )}
              </section>
            </>
          ) : (
            <>
              <div className="metrics">
                <Metric
                  label={
                    view === "session"
                      ? "TOURS ENREGISTRÉS"
                      : "SESSIONS TOTALES"
                  }
                  value={
                    view === "session"
                      ? (current?.laps.length ?? 0)
                      : sessions.length
                  }
                  detail={
                    view === "session" ? (
                      `${summary.count} tours valides`
                    ) : (
                      <>
                        <span className="green-dot" />
                        Votre historique de performance
                      </>
                    )
                  }
                  icon={<Flag size={18} />}
                />
                <Metric
                  label={
                    view === "session" ? "TEMPS MOYEN" : "TOURS ENREGISTRÉS"
                  }
                  value={
                    view === "session"
                      ? formatTime(summary.mean)
                      : sessions.reduce((n, s) => n + s.laps.length, 0)
                  }
                  detail={
                    view === "session"
                      ? "Calculé sur les tours valides"
                      : `${sessions.reduce((n, s) => n + s.laps.filter((l) => l.valid).length, 0)} tours valides au total`
                  }
                  icon={<Activity size={18} />}
                />
                <Metric
                  label={
                    view === "session"
                      ? "MEILLEUR TOUR VALIDE"
                      : "RECORD PERSONNEL · PAR CIRCUIT"
                  }
                  value={
                    view === "session" ? (
                      formatTime(summary.best)
                    ) : groups.length ? (
                      <div className="record-display">
                        <span className="mono">
                          {formatTime(record?.best ?? null)}
                        </span>
                        <select
                          className="record-select"
                          aria-label="Circuit du record personnel"
                          value={
                            groups.some(
                              (g) => circuitKey(g.circuit) === recordCircuit,
                            )
                              ? recordCircuit
                              : groups[0]
                                ? circuitKey(groups[0].circuit)
                                : ""
                          }
                          onChange={(e) => setRecordCircuit(e.target.value)}
                        >
                          {groups.map((g) => (
                            <option
                              key={g.circuit}
                              value={circuitKey(g.circuit)}
                            >
                              {g.circuit}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      "—"
                    )
                  }
                  detail={
                    view === "session"
                      ? "Référence de cette session"
                      : "Records séparés pour chaque circuit"
                  }
                  icon={<Trophy size={18} />}
                />
                <Metric
                  label={
                    view === "session"
                      ? "RÉGULARITÉ · ÉCART-TYPE"
                      : "DERNIÈRE SESSION"
                  }
                  value={
                    view === "session"
                      ? summary.deviation === null
                        ? "—"
                        : `${(summary.deviation / 1000).toFixed(3)} s`
                      : (latest?.circuit ?? "—")
                  }
                  detail={
                    view === "session"
                      ? "Plus la valeur est faible, plus le rythme est stable"
                      : latest
                        ? `${dateLabel(latest.date)} · ${latest.type}`
                        : "Votre première session vous attend"
                  }
                  icon={<Timer size={18} />}
                />
              </div>
              {active ? (
                <>
                  <div className="analysis-title">
                    <div>
                      <span className="eyebrow">
                        {view === "session"
                          ? "ANALYSE DU RUN"
                          : "FOCUS · DERNIÈRE SESSION"}
                      </span>
                      <h2>
                        {active.circuit}
                        <span className="badge">{active.type}</span>
                        {active.demo && (
                          <span className="demo-tag">DÉMONSTRATION</span>
                        )}
                      </h2>
                      <p>
                        <MapPin size={13} />
                        {active.car}
                        <span>·</span>
                        {dateLabel(active.date)}
                      </p>
                    </div>
                    {view === "dashboard" ? (
                      <button
                        className="text-button"
                        onClick={() => open(active)}
                      >
                        Analyser la session <ArrowRight size={16} />
                      </button>
                    ) : (
                      <div className="session-actions">
                        <button
                          className="text-button"
                          onClick={() => setView("dashboard")}
                        >
                          <ArrowLeft size={15} />
                          Dashboard
                        </button>
                        <button
                          className="text-button"
                          onClick={() => setView("history")}
                        >
                          Toutes les sessions
                        </button>
                        <button
                          className="secondary"
                          onClick={() => setEditingSession(active.id)}
                        >
                          <Pencil size={14} />
                          Modifier la session
                        </button>
                        <button
                          className="icon-button danger"
                          onClick={() =>
                            setDeleting({ kind: "session", id: active.id })
                          }
                          aria-label="Supprimer cette session"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="analysis-grid">
                    <section className="panel chart-panel">
                      <div className="section-heading">
                        <div>
                          <h2>Évolution des chronos</h2>
                          <p>Chaque tour raconte une trajectoire.</p>
                        </div>
                        <span className="live-badge">
                          <span className="status-dot" />
                          {active.laps.length} TOURS
                        </span>
                      </div>
                      <Suspense
                        fallback={
                          <div className="chart empty">
                            Chargement du graphique…
                          </div>
                        }
                      >
                        <LapChart key={active.id} session={active} />
                      </Suspense>
                      <div className="chart-legend">
                        <span>
                          <i className="legend-line" />
                          Temps au tour
                        </span>
                        <span>
                          <i className="legend-best" />
                          Meilleur tour
                        </span>
                        <span>
                          <X size={12} color="#fb7185" />
                          Tour invalide
                        </span>
                      </div>
                    </section>
                    <section className="panel pace-panel">
                      <div className="section-heading">
                        <h2>Le rythme en détail</h2>
                        <Gauge size={18} />
                      </div>
                      <div className="pace-hero">
                        <span className="eyebrow">MEILLEUR TOUR VALIDE</span>
                        <strong>{formatTime(summary.best)}</strong>
                        <span className="best-chip">
                          <Trophy size={13} />
                          {summary.best === null
                            ? "Aucun tour valide"
                            : `Tour ${active.laps.find((l) => l.valid && l.timeMs === summary.best)?.number}`}
                        </span>
                      </div>
                      <div className="pace-row">
                        <span>Temps moyen</span>
                        <strong>{formatTime(summary.mean)}</strong>
                      </div>
                      <div className="pace-row">
                        <span>Amplitude des chronos</span>
                        <strong>
                          {summary.spread === null
                            ? "—"
                            : `${(summary.spread / 1000).toFixed(3)} s`}
                        </strong>
                      </div>
                      <div className="pace-row">
                        <span>Tours valides</span>
                        <strong>
                          {summary.count}
                          <span className="muted"> / {active.laps.length}</span>
                        </strong>
                      </div>
                      <div className="insight">
                        <Activity size={16} />
                        <p>
                          {summary.deviation === null
                            ? "Ajoutez des tours valides pour analyser votre régularité."
                            : `Écart-type de ${(summary.deviation / 1000).toFixed(3)} s sur vos tours valides.`}
                        </p>
                      </div>
                    </section>
                  </div>
                  {view === "session" && current && (
                    <ConsistencyAnalysis session={current} />
                  )}
                  {view === "session" && current && (
                    <section className="panel laps-panel">
                      <div className="section-heading">
                        <h2>Journal des tours</h2>
                        <span className="muted">
                          Les tours invalides restent visibles, hors
                          statistiques.
                        </span>
                      </div>
                      <form className="lap-form" onSubmit={addLap}>
                        <label>
                          Chrono
                          <input
                            autoComplete="off"
                            placeholder="1:37.317"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            required
                            aria-describedby="lap-error"
                          />
                        </label>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={valid}
                            onChange={(e) => setValid(e.target.checked)}
                          />
                          Tour valide
                        </label>
                        <button className="primary" type="submit">
                          <Plus size={16} />
                          Ajouter le tour
                        </button>
                        <p className="form-error" id="lap-error" role="alert">
                          {lapError}
                        </p>
                      </form>
                      {current.laps.length ? (
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>TOUR</th>
                                <th>CHRONO</th>
                                <th>ÉCART AU MEILLEUR</th>
                                <th>STATUT</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {current.laps.map((l) => (
                                <tr key={l.id}>
                                  <td className="mono">
                                    {String(l.number).padStart(2, "0")}
                                  </td>
                                  <td
                                    className={`mono ${l.valid && l.timeMs === summary.best ? "best-text" : ""}`}
                                  >
                                    {formatTime(l.timeMs)}{" "}
                                    {l.valid && l.timeMs === summary.best && (
                                      <Trophy size={12} />
                                    )}
                                  </td>
                                  <td className="mono">
                                    {summary.best === null
                                      ? "—"
                                      : delta(l.timeMs - summary.best)}
                                    {!l.valid && (
                                      <small className="muted">
                                        {" "}
                                        (hors classement)
                                      </small>
                                    )}
                                  </td>
                                  <td>
                                    <button
                                      className={`badge status-toggle ${l.valid ? "" : "invalid"}`}
                                      title="Changer la validité du tour"
                                      aria-label={`${l.valid ? "Invalider" : "Valider"} le tour ${l.number}`}
                                      onClick={() => {
                                        setSessions((prev) =>
                                          prev.map((s) =>
                                            s.id === current.id
                                              ? {
                                                  ...s,
                                                  laps: s.laps.map((x) =>
                                                    x.id === l.id
                                                      ? {
                                                          ...x,
                                                          valid: !x.valid,
                                                        }
                                                      : x,
                                                  ),
                                                }
                                              : s,
                                          ),
                                        );
                                        setNotice(
                                          l.valid
                                            ? "Tour invalidé. Statistiques recalculées."
                                            : "Tour validé. Statistiques recalculées.",
                                        );
                                      }}
                                    >
                                      {l.valid ? (
                                        <Check size={12} />
                                      ) : (
                                        <X size={12} />
                                      )}{" "}
                                      {l.valid ? "Valide" : "Invalide"}
                                    </button>
                                  </td>
                                  <td>
                                    <button
                                      className="icon-button"
                                      aria-label={`Modifier le tour ${l.number}`}
                                      onClick={() => setEditingLap(l.id)}
                                    >
                                      <Pencil size={15} />
                                    </button>
                                    <button
                                      className="icon-button"
                                      aria-label={`Supprimer le tour ${l.number}`}
                                      onClick={() => {
                                        setSessions((prev) =>
                                          prev.map((s) =>
                                            s.id === current.id
                                              ? {
                                                  ...s,
                                                  laps: s.laps
                                                    .filter(
                                                      (x) => x.id !== l.id,
                                                    )
                                                    .map((x, i) => ({
                                                      ...x,
                                                      number: i + 1,
                                                    })),
                                                }
                                              : s,
                                          ),
                                        );
                                        setNotice(
                                          "Tour supprimé. Statistiques recalculées.",
                                        );
                                      }}
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="empty compact">
                          Aucun tour enregistré. Saisissez votre premier chrono
                          ci-dessus.
                        </div>
                      )}
                    </section>
                  )}
                </>
              ) : (
                <section className="panel">
                  <Empty create={() => setCreate(true)} />
                </section>
              )}
              {view === "dashboard" && (
                <section className="panel recent">
                  <div className="section-heading">
                    <div className="flex items-center gap-3">
                      <h2>Sessions récentes</h2>
                      <span className="count-pill">{sessions.length}</span>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setView("history")}
                    >
                      Tout l’historique <ArrowRight size={15} />
                    </button>
                  </div>
                  {sessions.length ? (
                    table(sorted.slice(0, 4))
                  ) : (
                    <Empty create={() => setCreate(true)} />
                  )}
                </section>
              )}
            </>
          )}
          {view === "dashboard" && (
            <PersonalRecords sessions={sessions} open={open} />
          )}
          {sessions.some((s) => s.demo) && (
            <div className="demo-banner">
              <CircleHelp size={16} />
              <span>
                Vous explorez des données de démonstration. Aucun chrono ne
                provient d’une télémétrie réelle.
              </span>
              <button onClick={() => setDeleting({ kind: "demo" })}>
                Supprimer les démos <Trash2 size={13} />
              </button>
            </div>
          )}
          <footer>
            <span>
              <span className="footer-mark">/ /</span> RACELAB v1.0{" "}
              <span className="muted">MOTORSPORT ANALYTICS</span>
            </span>
            <span>Conçu pour la performance. Stocké sur votre appareil.</span>
          </footer>
        </main>
      </div>
      {create && (
        <SessionForm
          close={() => setCreate(false)}
          save={(s) => {
            setSessions((prev) => [...prev, s]);
            setCreate(false);
            open(s);
            setNotice("Session créée. À vous de jouer.");
          }}
        />
      )}
      {editingSession && sessions.find((s) => s.id === editingSession) && (
        <SessionForm
          session={sessions.find((s) => s.id === editingSession)}
          close={() => setEditingSession(null)}
          save={(updated) => {
            setSessions((prev) =>
              prev.map((s) => (s.id === updated.id ? updated : s)),
            );
            setEditingSession(null);
            setComparison([]);
            setNotice("Session modifiée");
          }}
        />
      )}
      {editingLap && current?.laps.find((l) => l.id === editingLap) && (
        <LapEditor
          lap={current.laps.find((l) => l.id === editingLap)!}
          close={() => setEditingLap(null)}
          save={(updated) => {
            setSessions((prev) =>
              prev.map((s) =>
                s.id === current.id
                  ? {
                      ...s,
                      laps: s.laps.map((l) =>
                        l.id === updated.id ? updated : l,
                      ),
                    }
                  : s,
              ),
            );
            setEditingLap(null);
            setNotice("Chrono modifié. Statistiques recalculées.");
          }}
        />
      )}
      {pendingImport && (
        <Modal
          title="Restaurer la sauvegarde ?"
          close={() => {
            setPendingImport(null);
            setBackupError("");
          }}
        >
          <p className="modal-copy">
            Cette sauvegarde du{" "}
            {new Date(pendingImport.exportedAt).toLocaleString("fr-FR")}{" "}
            contient {pendingImport.sessions.length} sessions et{" "}
            {pendingImport.sessions.reduce((n, s) => n + s.laps.length, 0)}{" "}
            tours. Elle remplacera vos {sessions.length} sessions actuelles.
            Aucune fusion : réimporter le même fichier ne crée pas de doublons.
            Exportez d’abord vos données si vous souhaitez les conserver.
          </p>
          {backupError && (
            <p className="form-error" role="alert">
              {backupError}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="secondary"
              onClick={() => {
                setPendingImport(null);
                setBackupError("");
              }}
            >
              Annuler
            </button>
            <button className="primary" onClick={confirmImport}>
              Remplacer les données
            </button>
          </div>
        </Modal>
      )}
      {deleting && (
        <Modal
          title={
            deleting.kind === "reset"
              ? "Réinitialiser le stockage ?"
              : deleting.kind === "demo"
                ? "Supprimer les démonstrations ?"
                : "Supprimer cette session ?"
          }
          close={() => setDeleting(null)}
        >
          <p className="modal-copy">
            {deleting.kind === "reset"
              ? "Les données locales illisibles seront remplacées. Cette action est irréversible."
              : deleting.kind === "demo"
                ? "Toutes les sessions marquées Démo seront supprimées, y compris leurs éventuelles modifications. Vos autres sessions seront conservées."
                : "La session et tous ses tours seront définitivement supprimés de cet appareil."}
          </p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setDeleting(null)}>
              Annuler
            </button>
            <button
              className="danger-button"
              onClick={() => {
                if (deleting.kind === "reset") {
                  try {
                    localStorage.setItem(KEY, "[]");
                    setStorageError("");
                    setStorageBlocked(false);
                    setSessions([]);
                    setNotice("Stockage réinitialisé");
                  } catch {
                    setStorageError(
                      "Impossible d’accéder au stockage de cet appareil.",
                    );
                  }
                } else {
                  setSessions((prev) =>
                    prev.filter((s) =>
                      deleting.kind === "demo"
                        ? !s.demo
                        : s.id !==
                          (deleting.kind === "session" ? deleting.id : null),
                    ),
                  );
                  setComparison([]);
                  if (
                    (deleting.kind === "session" && deleting.id === selected) ||
                    deleting.kind === "demo"
                  )
                    setView("dashboard");
                  setNotice(
                    deleting.kind === "demo"
                      ? "Données de démonstration supprimées"
                      : "Session supprimée",
                  );
                }
                setDeleting(null);
              }}
            >
              Confirmer la suppression
            </button>
          </div>
        </Modal>
      )}
      {showCompare && (
        <Modal
          title="Comparaison de sessions"
          close={() => setShowCompare(false)}
        >
          <SessionComparison
            sessions={sessions}
            selected={comparison}
            onSelect={setComparison}
            open={(s) => {
              setShowCompare(false);
              open(s);
            }}
          />
          <div className="modal-actions">
            <button
              className="secondary"
              onClick={() => {
                setShowCompare(false);
                setView("comparison");
              }}
            >
              Ouvrir la page de comparaison
              <ArrowRight size={15} />
            </button>
          </div>
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
    </div>
  );
}
function Empty({ create }: { create: () => void }) {
  return (
    <div className="empty">
      <Flag size={32} />
      <h3>Votre histoire commence en piste.</h3>
      <p>Créez une session et enregistrez vos premiers tours.</p>
      <button className="primary" onClick={create}>
        <Plus size={16} />
        Créer une session
      </button>
    </div>
  );
}
function SessionForm({
  close,
  save,
  session,
}: {
  close: () => void;
  save: (s: Session) => void;
  session?: Session;
}) {
  const [error, setError] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const circuit = String(data.get("circuit") ?? "").trim(),
      car = String(data.get("car") ?? "").trim(),
      game = String(data.get("game") ?? "").trim(),
      date = String(data.get("date") ?? "");
    if (!circuit || !car || !game || !isDate(date)) {
      setError("Veuillez renseigner tous les champs.");
      return;
    }
    save({
      ...session,
      id: session?.id ?? crypto.randomUUID(),
      circuit,
      car,
      game,
      date,
      conditions: String(data.get("conditions") ?? "").trim(),
      type: String(data.get("type")) as Session["type"],
      laps: session?.laps ?? [],
    });
  };
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return (
    <Modal
      title={session ? "Modifier la session" : "Nouvelle session"}
      close={close}
    >
      <p className="modal-copy">
        {session
          ? "Mettez à jour les informations du run. Vos tours sont conservés."
          : "Préparez votre run. Les chronos s’ajoutent ensuite."}
      </p>
      <form onSubmit={submit} className="create-form">
        <label>
          Circuit
          <input
            name="circuit"
            defaultValue={session?.circuit}
            required
            maxLength={100}
            placeholder="Ex. Spa-Francorchamps"
            autoFocus
          />
        </label>
        <label>
          Voiture
          <input
            name="car"
            defaultValue={session?.car}
            required
            maxLength={100}
            placeholder="Ex. Porsche 911 GT3 R"
          />
        </label>
        <label>
          Jeu
          <input
            name="game"
            aria-label="Jeu"
            defaultValue={session?.game}
            required
            maxLength={100}
            placeholder="Ex. Assetto Corsa Competizione"
            list="games"
          />
          <datalist id="games">
            <option>Project Motor Racing</option>
            <option>F1 24</option>
            <option>Assetto Corsa Competizione</option>
            <option>iRacing</option>
            <option>Le Mans Ultimate</option>
            <option>Automobilista 2</option>
            <option>F1 25</option>
          </datalist>
        </label>
        <div className="form-grid">
          <label>
            Date
            <input
              type="date"
              name="date"
              required
              defaultValue={session?.date ?? today}
            />
          </label>
          <label>
            Type de session
            <select
              name="type"
              aria-label="Type de session"
              defaultValue={session?.type ?? "Essais"}
            >
              <option>Essais</option>
              <option>Qualifications</option>
              <option>Course</option>
            </select>
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <label>
          Conditions de piste (facultatif)
          <input
            name="conditions"
            defaultValue={session?.conditions ?? ""}
            maxLength={200}
            placeholder="Ex. Sec, 22 °C — informations saisies manuellement"
          />
        </label>
        <div className="modal-actions">
          <button className="secondary" type="button" onClick={close}>
            Annuler
          </button>
          <button className="primary" type="submit">
            {session ? "Enregistrer les modifications" : "Créer la session"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LapEditor({
  lap,
  close,
  save,
}: {
  lap: Lap;
  close: () => void;
  save: (lap: Lap) => void;
}) {
  const [time, setTime] = useState(formatTime(lap.timeMs));
  const [valid, setValid] = useState(lap.valid);
  const [error, setError] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const timeMs = parseTime(time);
    if (timeMs === null) {
      setError("Format attendu : 1:37.317 ou 97.317 (trois décimales).");
      return;
    }
    save({ ...lap, timeMs, valid });
  };
  return (
    <Modal title={`Modifier le tour ${lap.number}`} close={close}>
      <p className="modal-copy">
        Le numéro et l’identifiant du tour sont conservés. Les statistiques
        seront recalculées.
      </p>
      <form className="create-form" onSubmit={submit}>
        <label>
          Chrono
          <input
            autoFocus
            required
            autoComplete="off"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby="edit-lap-error"
          />
        </label>
        <label className="edit-validity">
          <input
            type="checkbox"
            checked={valid}
            onChange={(e) => setValid(e.target.checked)}
          />
          Tour valide
        </label>
        {error && (
          <p id="edit-lap-error" className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="secondary" type="button" onClick={close}>
            Annuler
          </button>
          <button className="primary" type="submit">
            Enregistrer le chrono
          </button>
        </div>
      </form>
    </Modal>
  );
}
