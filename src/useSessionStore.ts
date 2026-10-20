import { useEffect, useRef, useState, type SetStateAction } from "react";
import { KEY, demoSessions, isSessions, type Session } from "./model";
function readInitial() {
  let raw: string | null | undefined;
  try {
    raw = localStorage.getItem(KEY);
    const sessions = raw === null ? demoSessions() : JSON.parse(raw);
    if (!isSessions(sessions)) throw Error();
    return { raw, sessions, error: "" };
  } catch {
    return {
      raw,
      sessions: [] as Session[],
      error:
        "Les données locales sont illisibles ou inaccessibles. Elles sont conservées. Exportez votre copie ou restaurez une sauvegarde JSON.",
    };
  }
}
export function useSessionStore() {
  const [initial] = useState(readInitial);
  const [sessions, update] = useState<Session[]>(initial.sessions),
    current = useRef(initial.sessions);
  const [storageError, setError] = useState(initial.error);
  const [storageBlocked, setBlocked] = useState(Boolean(initial.error));
  const [conflict, setConflict] = useState(false),
    conflictRef = useRef(false);
  const snapshot = useRef(initial.raw),
    blocked = useRef(Boolean(initial.error));
  const queue = useRef(Promise.resolve(true));
  const markConflict = () => {
    conflictRef.current = true;
    setConflict(true);
  };
  const perform = (
    next: SetStateAction<Session[]>,
    strict: boolean,
    expected: Session[],
  ) => {
    if (strict && current.current !== expected) {
      setError(
        "Les données de cet onglet ont changé. Opération refusée : actualisez la prévisualisation avant de réessayer.",
      );
      return false;
    }
    const candidate = typeof next === "function" ? next(current.current) : next;
    if (!isSessions(candidate)) {
      setError("Les données proposées sont invalides. Enregistrement refusé.");
      return false;
    }
    try {
      const actual = localStorage.getItem(KEY);
      // Lecture initiale corrompue : mémoriser sa valeur sans jamais l’écraser implicitement.
      if (snapshot.current === undefined) snapshot.current = actual;
      if (actual !== snapshot.current) {
        if (actual === JSON.stringify(current.current))
          snapshot.current = actual;
        else markConflict();
      }
      if (conflictRef.current || (!strict && blocked.current)) {
        if (!strict) {
          current.current = candidate;
          update(candidate);
        }
        return false;
      }
      const raw = JSON.stringify(candidate);
      localStorage.setItem(KEY, raw);
      snapshot.current = raw;
      current.current = candidate;
      update(candidate);
      blocked.current = false;
      setBlocked(false);
      setError("");
      return true;
    } catch {
      if (!strict) {
        current.current = candidate;
        update(candidate);
      }
      setError(
        strict
          ? "Stockage indisponible ou plein. Les données actuelles sont conservées."
          : "Sauvegarde indisponible ou pleine. Vos modifications restent dans cet onglet : exportez un JSON avant de le fermer.",
      );
      return false;
    }
  };
  const schedule = (
    next: SetStateAction<Session[]>,
    strict = false,
    expected = current.current,
  ) => {
    const operation = async () => {
      // Verrou commun aux onglets v2 quand Web Locks est disponible.
      if (navigator.locks)
        return navigator.locks.request(KEY, () =>
          perform(next, strict, expected),
        );
      return perform(next, strict, expected);
    };
    const result = queue.current.then(operation);
    queue.current = result.catch(() => {
      setError(
        "L’accès à la sauvegarde a été refusé. L’opération n’a pas été enregistrée ; conservez votre saisie et réessayez.",
      );
      return false;
    });
    return result;
  };
  useEffect(() => {
    const check = () => {
      try {
        if (
          snapshot.current !== undefined &&
          localStorage.getItem(KEY) !== snapshot.current
        )
          markConflict();
      } catch {
        setError(
          "Impossible de vérifier la sauvegarde locale. Exportez un JSON.",
        );
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === KEY || event.key === null) check();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", check);
    if (initial.raw === null) void schedule(current.current);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", check);
    };
  }, []);
  const loadRemote = () => {
    try {
      const raw = localStorage.getItem(KEY);
      const incoming = raw === null ? [] : JSON.parse(raw);
      if (!isSessions(incoming)) throw Error();
      snapshot.current = raw;
      current.current = incoming;
      update(incoming);
      conflictRef.current = false;
      setConflict(false);
      blocked.current = false;
      setBlocked(false);
      setError("");
      return true;
    } catch {
      setError(
        "La version externe est illisible. Votre copie en mémoire est conservée.",
      );
      return false;
    }
  };
  const reloadRemote = () => {
    const action = async () =>
      navigator.locks ? navigator.locks.request(KEY, loadRemote) : loadRemote();
    const result = queue.current.then(action);
    queue.current = result.catch(() => {
      setError(
        "L’accès à la sauvegarde a été refusé. L’opération n’a pas été enregistrée ; conservez votre saisie et réessayez.",
      );
      return false;
    });
    return result;
  };
  return {
    sessions,
    setSessions: (next: SetStateAction<Session[]>) => {
      void schedule(next);
    },
    replaceSessions: (next: Session[], expected = current.current) =>
      schedule(next, true, expected),
    storageError,
    storageBlocked,
    conflict,
    reloadRemote,
  };
}
