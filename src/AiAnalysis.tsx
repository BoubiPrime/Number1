import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, CircleHelp, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { circuitLabel, formatTime, stats, type Session } from "./model";
import { sessionInput, validateInput, type AnalysisResult } from "./ai/contracts";
import { ClientError, loadEndpoint, requestAnalysis } from "./ai/client";

export function AiAnalysis({ sessions, open }: { sessions: Session[]; open: (session: Session) => void }) {
  const [chosen, setChosen] = useState("");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [configurationLoading, setConfigurationLoading] = useState(true);
  const [configurationError, setConfigurationError] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ key: string; value: AnalysisResult } | null>(null);
  const [retryUntil, setRetryUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const active = useRef<AbortController | null>(null);
  const cache = useRef(new Map<string, AnalysisResult>());
  const sorted = useMemo(() => [...sessions].sort((a, b) => b.date.localeCompare(a.date)), [sessions]);
  const session = sessions.find((s) => s.id === chosen) ?? sorted[0];
  const input = useMemo(() => session ? sessionInput(session) : null, [session]);
  const signature = `${endpoint ?? ""}:${session?.id ?? ""}:${JSON.stringify(input)}`;
  const signatureRef = useRef(signature);
  signatureRef.current = signature;
  const summary = useMemo(() => stats(session?.laps ?? []), [session]);
  const validation = useMemo(() => {
    if (!input) return "Créez une session et enregistrez au moins 3 tours valides pour commencer.";
    try { validateInput(input); return ""; }
    catch (error) { return error instanceof Error ? error.message : "Les données sont insuffisantes."; }
  }, [input]);
  useEffect(() => {
    const controller = new AbortController();
    loadEndpoint(controller.signal).then(setEndpoint).catch((error) => {
      if (!controller.signal.aborted) setConfigurationError(error instanceof Error && error.name !== "TimeoutError" && error.name !== "TypeError" ? error.message : "Configuration IA indisponible. Vérifiez la connexion puis rouvrez cette section.");
    }).finally(() => { if (!controller.signal.aborted) setConfigurationLoading(false); });
    return () => { controller.abort(); active.current?.abort(); active.current = null; };
  }, []);
  useEffect(() => {
    active.current?.abort(); active.current = null;
    setBusy(false); setError("");
    const saved = cache.current.get(signature);
    setResult(saved ? { key: signature, value: saved } : null);
  }, [signature]);
  useEffect(() => {
    if (retryUntil <= Date.now()) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (retryUntil <= Date.now()) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [retryUntil]);
  const wait = Math.max(0, Math.ceil((retryUntil - now) / 1000));
  const displayed = result?.key === signature ? result.value : null;
  const analyze = async () => {
    if (!endpoint || !input || validation || active.current || wait) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError("");
    try {
      const value = await requestAnalysis(endpoint, input, accessCode, controller.signal);
      if (active.current !== controller || signatureRef.current !== signature) return;
      cache.current.set(signature, value);
      if (cache.current.size > 5) cache.current.delete(cache.current.keys().next().value!);
      setResult({ key: signature, value });
    } catch (error) {
      if (active.current !== controller || controller.signal.aborted) return;
      setError(error instanceof Error ? error.message : "L’analyse a échoué. Vos données sont conservées.");
      if (error instanceof ClientError && error.retryAfter) { setNow(Date.now()); setRetryUntil(Date.now() + error.retryAfter * 1000); }
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  };
  return <div className="ai-page">
    <section className="panel ai-controls" aria-label="Choisir une session pour l’IA">
      <div className="section-heading">
        <div><h2>Votre débrief de session</h2><p>Une analyse à la demande, à partir de vos chronos.</p></div>
        <Bot className="best-text" size={23} />
      </div>
      <div className="ai-form">
        <label>Session à analyser
          <select value={session?.id ?? ""} disabled={!sessions.length} onChange={(e) => setChosen(e.target.value)}>
            {!sessions.length && <option value="">Aucune session enregistrée</option>}
            {sorted.map((s) => <option key={s.id} value={s.id}>{s.demo ? "[Démo] " : ""}{circuitLabel(s)} · {s.car} · {s.game} · {s.date} · {s.type}</option>)}
          </select>
        </label>
        {session && <div className="ai-session-facts">
          <span><strong>{session.laps.length}</strong> tours · <strong>{summary.count}</strong> valides</span>
          <span>Meilleur <strong className="mono">{formatTime(summary.best)}</strong></span>
          <span>Moyenne <strong className="mono">{formatTime(summary.mean)}</strong></span>
          <button className="text-button" onClick={() => open(session)}>Ouvrir la session</button>
        </div>}
        {session?.demo && <p className="ai-muted">Données de démonstration fictives. L’analyse ne décrit pas vos performances personnelles.</p>}
        {configurationLoading ? <p role="status" className="ai-muted">Vérification de la configuration…</p>
          : configurationError ? <div className="alert" role="alert">{configurationError}</div>
          : !endpoint ? <div className="ai-unconfigured" role="status"><ShieldCheck size={21} /><div><strong>Analyse IA non configurée</strong><p>Le propriétaire du site doit activer le service sécurisé. Vos sessions et toutes les autres fonctions restent disponibles.</p></div></div>
          : <>
            <label className="ai-code">Code d’accès IA
              <input type="password" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} maxLength={128} autoComplete="off" spellCheck={false} placeholder="Code fourni par le propriétaire du site" aria-describedby="ai-code-help" />
            </label>
            <p id="ai-code-help" className="ai-muted">Ce code protège le budget IA. Il reste en mémoire le temps de cette page. Ne saisissez jamais une clé OpenAI ici.</p>
          </>}
        {validation && <p className="ai-empty" role="status">{validation}</p>}
        <p className="ai-muted">En cliquant, vous envoyez cette session au serveur IA. OpenAI reçoit uniquement le contexte circuit/voiture/jeu et les statistiques utiles. Les autres sessions restent sur cet appareil.</p>
        <div className="ai-actions">
          <button className="primary" disabled={busy || !endpoint || !!validation || !accessCode || !!wait} onClick={analyze}>
            {busy ? <LoaderCircle className="ai-spinner" size={17} /> : displayed ? <RefreshCw size={17} /> : <Bot size={17} />}
            {busy ? "Analyse de la session en cours…" : displayed ? "Relancer l’analyse" : "Analyser avec l’IA"}
          </button>
          {busy && <button className="secondary" onClick={() => { active.current?.abort(); active.current = null; setBusy(false); }}>Annuler l’attente</button>}
          {wait > 0 && <span className="ai-muted" role="status">Nouvel essai dans {wait > 3600 ? `${Math.ceil(wait / 3600)} h` : `${wait} s`}.</span>}
        </div>
        {busy && <p className="ai-muted" role="status">Analyse de la session en cours… Annuler l’attente n’annule pas un appel déjà transmis au service.</p>}
        {error && <div className="alert" role="alert">{error}{displayed && " La dernière analyse réussie reste affichée."}</div>}
      </div>
    </section>
    {displayed && <section className="panel ai-result" aria-label="Résultat de l’analyse IA" aria-live="polite">
      <div className="section-heading"><div><h2>🤖 Analyse IA</h2><p>{session && circuitLabel(session)} · {new Date(displayed.analyzedAt).toLocaleString("fr-FR")}</p></div><span className="ai-badge">VOS CHRONOS, VOS PRIORITÉS</span></div>
      <div className="ai-metrics">
        <div><span>Performance</span><strong>{displayed.performance}</strong><small>Exécution dans cette session</small></div>
        <div><span>Régularité</span><strong>{displayed.consistencyScore}<small>/100</small></strong><progress value={displayed.consistencyScore} max={100} aria-label="Score de régularité" /></div>
        <div><span>Priorité</span><strong>{displayed.priority}</strong><small>{displayed.validLaps} tours valides analysés</small></div>
      </div>
      <div className="ai-report"><h3>Résumé IA</h3><p>{displayed.summary}</p><h3>À travailler</h3><ol>{displayed.tips.map((tip) => <li key={tip}>{tip}</li>)}</ol></div>
    </section>}
    <details className="panel ai-method"><summary><CircleHelp size={16} /> Comprendre cette analyse</summary>
      <p>L’IA classe l’exécution et choisit trois conseils parmi des observations vérifiées. Le résumé est construit à partir de ces choix et des statistiques calculées. Aucune donnée de freinage, de trajectoire ou de résultat n’est déduite.</p>
      <p>Régularité = arrondi de max(0, 100 − 20 × (écart-type ÷ moyenne × 100)), sur les seuls tours valides. Exemple : une dispersion de 1 % donne 80/100. Ce barème descriptif n’est pas une note officielle.</p>
      <p>La performance est une appréciation IA relative à votre meilleur tour dans cette session, jamais une comparaison avec d’autres circuits ou pilotes. Un petit échantillon, des tours de sortie ou des arrêts peuvent limiter son interprétation. Minimum : 3 tours valides ; maximum : 2 000 tours.</p>
      <p>Aucun appel automatique. Une relance peut consommer votre quota. Le résultat reste uniquement en mémoire et devient obsolète dès que les données de la session changent.</p>
    </details>
  </div>;
}
