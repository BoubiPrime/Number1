import { AnalysisError, isAnalysisResult, type AnalysisInput, type AnalysisResult } from "./contracts";

export function parseEndpoint(value: unknown, development = false): string | null {
  if (value === "") return null;
  if (typeof value !== "string") throw Error("La configuration IA est illisible.");
  let url: URL;
  try { url = new URL(value); } catch { throw Error("L’adresse du service IA est invalide."); }
  const local = development && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((url.protocol !== "https:" && !local) || url.username || url.password || url.search || url.hash ||
    url.pathname !== "/analyze" || url.hostname === "api.openai.com")
    throw Error("Configurez l’URL HTTPS /analyze du backend sécurisé, sans clé ni paramètre.");
  return url.href;
}
export async function loadEndpoint(signal: AbortSignal): Promise<string | null> {
  const response = await fetch(`${import.meta.env.BASE_URL}ai-config.json`, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]), cache: "no-store", credentials: "omit" });
  if (!response.ok) throw Error("La configuration IA est indisponible. Les autres fonctions restent accessibles.");
  let config;
  try { config = await response.json(); }
  catch { throw Error("La configuration IA est illisible. Les autres fonctions restent accessibles."); }
  return parseEndpoint(config?.endpoint, import.meta.env.DEV);
}
export class ClientError extends Error {
  constructor(message: string, public retryAfter = 0) { super(message); }
}
const errorMessages: Record<string, string> = {
  not_configured: "L’analyse IA n’est pas configurée sur le serveur. Les autres fonctions de RaceLab restent disponibles.",
  unauthorized: "Code d’accès IA incorrect. Saisissez le code fourni par le propriétaire du site, jamais une clé OpenAI.",
  insufficient_data: "Enregistrez au moins 3 tours valides pour analyser cette session.",
  invalid_data: "Cette session ne respecte pas les limites de l’analyse IA. Vérifiez ses chronos et ses secteurs.",
  too_large: "Cette session dépasse la taille autorisée pour l’analyse IA.",
  rate_limit: "La limite des analyses est atteinte. Patientez avant de relancer.",
  provider_limit: "Le quota du service IA est atteint. Réessayez plus tard.",
  provider_configuration: "Le propriétaire du site doit vérifier la clé et l’accès au modèle OpenAI configuré.",
  invalid_response: "La réponse IA est incomplète ou inexploitable. Vous pouvez relancer l’analyse.",
  timeout: "L’analyse a pris trop de temps. Vous pouvez réessayer.",
};
export async function requestAnalysis(endpoint: string, input: AnalysisInput, accessCode: string, signal: AbortSignal): Promise<AnalysisResult> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(accessCode) || accessCode.startsWith("sk-"))
    throw new ClientError("Utilisez le code d’accès IA de 32 à 128 caractères, jamais votre clé OpenAI.");
  try {
    const response = await fetch(endpoint, {
      method: "POST", credentials: "omit", cache: "no-store", redirect: "error",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessCode}` },
      body: JSON.stringify(input), signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const code = (body as { error?: { code?: string } })?.error?.code ?? "unknown";
      const retry = Number(response.headers.get("Retry-After"));
      throw new ClientError(errorMessages[code] ?? "Le service IA est indisponible. Vos données sont conservées.",
        response.status === 429 ? (Number.isFinite(retry) && retry > 0 ? Math.min(retry, 86400) : 60) : 0);
    }
    if (!isAnalysisResult(body) || body.totalLaps !== input.laps.length || body.validLaps !== input.laps.filter((l) => l.valid).length)
      throw new ClientError("La réponse IA ne correspond pas à la session. Vous pouvez réessayer.");
    return body;
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof ClientError || error instanceof AnalysisError) throw error;
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) throw new ClientError(errorMessages.timeout);
    throw new ClientError("Impossible de joindre le service IA. Vérifiez la connexion et la configuration du serveur.");
  }
}
