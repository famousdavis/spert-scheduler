// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useEffect, useRef, useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import type {
  QuerySnapshot,
  DocumentData,
  DocumentSnapshot,
  DocumentChange,
  FirestoreError,
  Firestore,
} from "firebase/firestore";
import { db, isFirebaseAvailable, getTeardownAiSession } from "@infrastructure/firebase/firebase";
import { sanitizeForFirestore } from "@infrastructure/firebase/firestore-sanitize";
import { APP_VERSION } from "@app/constants";
import type { Project, Calendar } from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import type { AiOp, AiOpResult } from "@app/api/ai-batch-service";
import {
  buildProjectSnapshot,
  truncateSnapshotToBudget,
  ScenarioScheduleCache,
} from "@app/api/ai-snapshot-service";
import {
  AI_SESSION_ID_KEY,
  AI_CONSENT_KEY,
  AI_CONSENT_VERSION,
  AI_SESSIONS_COL,
  SCHEDULER_APP_ID,
} from "@app/ai-connectivity-constants";
import {
  getLastSeq,
  setLastSeq,
  clearLastSeq,
  safeParseConsent,
  buildOpsQuery,
} from "./ai-connectivity-utils";

// ── Public types ────────────────────────────────────────────────────────────
export interface AiSessionState {
  sessionActive: boolean;
  aiConnected: boolean;
  consentRead: boolean;
  sessionId: string | null;
}

export interface UseAiConnectivityParams {
  project: Project | null;
  activeScenarioId: string | null;
  workCalendar: WorkCalendar | Calendar | undefined;
  applyAiBatch: (projectId: string, ops: AiOp[], openScenarioId: string | null) => AiOpResult[];
  clearAiUndoFrame: (projectId: string) => void;
  /** Provenance feed sink — called with the per-op results after each drain. */
  onResults?: (results: AiOpResult[]) => void;
}

export interface UseAiConnectivityResult {
  sessionState: AiSessionState;
  startSession: (consentRead: boolean) => Promise<boolean>;
  stopSession: () => Promise<void>;
  changePermissions: (consentRead: boolean) => Promise<boolean>;
}

// ── Module-level pure helpers ────────────────────────────────────────────────

interface RawOpDoc {
  seq: number;
  op: string;
  payload: unknown;
}

function readOpDocs(changes: Array<DocumentChange<DocumentData>>): RawOpDoc[] {
  return changes
    .filter((c) => c.type === "added")
    .map((c) => ({
      seq: c.doc.data().seq as number,
      op: c.doc.data().op as string,
      payload: c.doc.data().payload as unknown,
    }))
    .sort((a, b) => a.seq - b.seq);
}

function computeAiConnected(data: DocumentData): boolean {
  const aiLastSeen = (data.aiLastSeenAt as { toDate?: () => Date } | null)?.toDate?.();
  return !!aiLastSeen && Date.now() - aiLastSeen.getTime() < 90_000;
}

function sevenDaysOut(): Date {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

function writeConsentLocal(read: boolean): void {
  localStorage.setItem(
    AI_CONSENT_KEY,
    JSON.stringify({ version: AI_CONSENT_VERSION, date: new Date().toISOString(), write: true, read })
  );
}

/**
 * Resolve which session id to use: resume a live stored session, or mint a new
 * one. Returns `null` only on a hard read failure (caller aborts start).
 */
async function resolveSessionId(
  database: Firestore,
  storedId: string | null
): Promise<{ sessionId: string; prevConsentRead: boolean | null } | null> {
  if (!storedId) return { sessionId: crypto.randomUUID(), prevConsentRead: null };
  try {
    const snap = await getDoc(doc(database, AI_SESSIONS_COL, storedId));
    if (!snap.exists()) {
      clearLastSeq(storedId);
      return { sessionId: crypto.randomUUID(), prevConsentRead: null };
    }
    const d = snap.data();
    const storedExp = (d.expiresAt as { toDate?: () => Date } | undefined)?.toDate?.();
    if (storedExp && storedExp < new Date()) {
      clearLastSeq(storedId);
      return { sessionId: crypto.randomUUID(), prevConsentRead: null };
    }
    return { sessionId: storedId, prevConsentRead: (d.consentRead as boolean) ?? false };
  } catch (err) {
    console.error("[AI] Session check failed:", err);
    return null;
  }
}

async function createFreshSession(
  database: Firestore,
  sessionId: string,
  consentRead: boolean,
  projectId: string
): Promise<boolean> {
  setLastSeq(sessionId, 0);
  try {
    await setDoc(doc(database, AI_SESSIONS_COL, sessionId), {
      createdAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
      expiresAt: sevenDaysOut(),
      browserConnectedAt: serverTimestamp(),
      openProductId: projectId,
      consentWrite: true,
      consentRead,
      lastSeq: 0,
      appVersion: APP_VERSION,
      appId: SCHEDULER_APP_ID,
      // aiLastSeenAt intentionally OMITTED: MCP-server-owned. Including it fails
      // the Firestore create rule's hasOnly check.
    });
    return true;
  } catch (err) {
    console.error("[AI] Session creation failed:", err);
    return false;
  }
}

type ResumeResult = "ok" | "abort" | "recreate";

async function resumeSession(
  database: Firestore,
  sessionId: string,
  consentRead: boolean,
  prevConsentRead: boolean,
  projectId: string
): Promise<ResumeResult> {
  const snapshotRef = doc(database, AI_SESSIONS_COL, sessionId, "snapshot", "current");
  try {
    await updateDoc(doc(database, AI_SESSIONS_COL, sessionId), {
      consentRead,
      openProductId: projectId,
      lastActiveAt: serverTimestamp(),
      browserConnectedAt: serverTimestamp(),
      expiresAt: sevenDaysOut(),
    });
    if (prevConsentRead && !consentRead) {
      deleteDoc(snapshotRef).catch(() => {});
    }
    return "ok";
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "not-found" || code === "permission-denied") {
      clearLastSeq(sessionId);
      return "recreate";
    }
    if (prevConsentRead && !consentRead) {
      // Privilege downgrade (Read → off) failed transiently. Revert local
      // consent to the server's actual state (still read:true) and abort.
      writeConsentLocal(true);
      deleteDoc(snapshotRef).catch(() => {});
      console.error("[AI] Consent downgrade write failed; aborting resume:", err);
      return "abort";
    }
    console.error("[AI] Resume reconciliation failed; proceeding:", err);
    return "ok";
  }
}

type MutRef<T> = { current: T };

/**
 * Schedule a 5s-delayed listener re-subscribe after a transient Firestore
 * error. Extracted to module scope so its nested timer/updater closures don't
 * push the hook's error handlers past the max function-nesting depth.
 */
function scheduleListenerRetry(
  timerRef: MutRef<ReturnType<typeof setTimeout> | null>,
  activeSessionIdRef: MutRef<string | null>,
  resubscribeRef: MutRef<((sessionId: string) => void) | null>,
  sessionId: string,
  setSessionState: Dispatch<SetStateAction<AiSessionState>>
): void {
  timerRef.current = setTimeout(() => {
    timerRef.current = null;
    if (activeSessionIdRef.current !== sessionId || !db) return;
    resubscribeRef.current?.(sessionId);
    setSessionState((prev) => ({ ...prev, sessionActive: true }));
  }, 5_000);
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useAiConnectivity(params: UseAiConnectivityParams): UseAiConnectivityResult {
  const { project, activeScenarioId, workCalendar, applyAiBatch, clearAiUndoFrame, onResults } = params;

  const [sessionState, setSessionState] = useState<AiSessionState>({
    sessionActive: false,
    aiConnected: false,
    consentRead: false,
    sessionId: null,
  });

  // Live inputs mirrored into refs so the stable callbacks read current values.
  const productRef = useRef<Project | null>(project);
  const activeScenarioIdRef = useRef<string | null>(activeScenarioId);
  const workCalendarRef = useRef<WorkCalendar | Calendar | undefined>(workCalendar);
  const applyAiBatchRef = useRef(applyAiBatch);
  const clearAiUndoFrameRef = useRef(clearAiUndoFrame);
  const onResultsRef = useRef(onResults);
  const consentReadRef = useRef(false);
  const lastAppliedSeqRef = useRef(0);
  const cacheRef = useRef<ScenarioScheduleCache | null>(null);

  // Firestore listener + timer handles.
  const opsUnsubRef = useRef<(() => void) | null>(null);
  const sessionUnsubRef = useRef<(() => void) | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const startSessionInFlightRef = useRef(false);
  // onError retries delegate through refs to avoid self-referential useCallback.
  const resubscribeOpsRef = useRef<((sessionId: string) => void) | null>(null);
  const resubscribeSessionRef = useRef<((sessionId: string) => void) | null>(null);
  const retryTimerOpsRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerSessionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opRetryCountRef = useRef(0);
  const sessionRetryCountRef = useRef(0);

  useEffect(() => { productRef.current = project; }, [project]);
  useEffect(() => { activeScenarioIdRef.current = activeScenarioId; }, [activeScenarioId]);
  useEffect(() => { workCalendarRef.current = workCalendar; }, [workCalendar]);
  useEffect(() => { applyAiBatchRef.current = applyAiBatch; }, [applyAiBatch]);
  useEffect(() => { clearAiUndoFrameRef.current = clearAiUndoFrame; }, [clearAiUndoFrame]);
  useEffect(() => { onResultsRef.current = onResults; }, [onResults]);
  useEffect(() => { consentReadRef.current = sessionState.consentRead; }, [sessionState.consentRead]);

  // ── localTeardown ────────────────────────────────────────────────────────
  const localTeardown = useCallback(() => {
    opsUnsubRef.current?.(); opsUnsubRef.current = null;
    sessionUnsubRef.current?.(); sessionUnsubRef.current = null;
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    if (snapshotTimerRef.current) { clearTimeout(snapshotTimerRef.current); snapshotTimerRef.current = null; }
    if (retryTimerOpsRef.current) { clearTimeout(retryTimerOpsRef.current); retryTimerOpsRef.current = null; }
    if (retryTimerSessionRef.current) { clearTimeout(retryTimerSessionRef.current); retryTimerSessionRef.current = null; }
    // §4.4 site 3: end any AI undo frame for the paired project so a re-pairing
    // opens a fresh frame instead of extending a torn-down one.
    const pid = productRef.current?.id;
    if (pid) clearAiUndoFrameRef.current?.(pid);
    activeSessionIdRef.current = null;
    opRetryCountRef.current = 0;
    sessionRetryCountRef.current = 0;
  }, []);

  // ── Snapshot writer (sanitize body, THEN attach sentinels) ─────────────────
  const writeSnapshot = useCallback(() => {
    const database = db;
    const project = productRef.current;
    const sessionId = activeSessionIdRef.current;
    if (!database || !project || !sessionId) return;
    if (!consentReadRef.current) return; // Read Mode gate
    if (!cacheRef.current) cacheRef.current = new ScenarioScheduleCache();
    const full = buildProjectSnapshot(
      project,
      workCalendarRef.current,
      activeScenarioIdRef.current,
      lastAppliedSeqRef.current,
      cacheRef.current
    );
    const body = sanitizeForFirestore(truncateSnapshotToBudget(full));
    const byteSize = new TextEncoder().encode(JSON.stringify(body)).length;
    if (byteSize > 900_000) {
      console.warn("[AI] Snapshot exceeds 900 KB — skipping.");
      return;
    }
    // sanitizeForFirestore ran over the body ONLY; the serverTimestamp()/
    // expiresAt sentinels are attached to the top-level payload here, never
    // recursed through the sanitizer (which would flatten a FieldValue).
    setDoc(doc(database, AI_SESSIONS_COL, sessionId, "snapshot", "current"), {
      project: body,
      updatedAt: serverTimestamp(),
      expiresAt: sevenDaysOut(),
    }).catch((err) => console.error("[AI] Snapshot write failed:", err));
  }, []);

  const scheduleSnapshot = useCallback(() => {
    if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = setTimeout(writeSnapshot, 2000);
  }, [writeSnapshot]);

  // Reactive snapshot refresh on any snapshot input change: project edits
  // (human or applied AI batch), the open scenario, or the assembled work
  // calendar (global work week / holidays live in preferences, so they change
  // without changing `project`). writeSnapshot reads all three via refs; this
  // effect is the only thing that schedules the rewrite.
  useEffect(() => {
    if (!sessionState.sessionActive || !sessionState.consentRead) return;
    scheduleSnapshot();
  }, [project, activeScenarioId, workCalendar, sessionState.sessionActive, sessionState.consentRead, scheduleSnapshot]);

  // ── Op listener handlers ───────────────────────────────────────────────────
  const makeOpHandlers = useCallback((sessionId: string) => {
    const onNext = (snapshot: QuerySnapshot<DocumentData>) => {
      opRetryCountRef.current = 0;
      const candidates = readOpDocs(snapshot.docChanges());
      const current = productRef.current;
      if (!current || !candidates.length) return;
      const floor = getLastSeq(sessionId);
      const toProcess = candidates.filter((o) => o.seq > floor);
      if (!toProcess.length) return;
      // Raw op docs are validated inside applyAiBatch (schemas + unknown_op), so
      // the cast is safe — malformed ops resolve to a skipped outcome.
      const ops = toProcess.map((o) => ({ seq: o.seq, op: o.op, payload: o.payload })) as unknown as AiOp[];
      const results = applyAiBatchRef.current(current.id, ops, activeScenarioIdRef.current);
      const maxSeq = toProcess[toProcess.length - 1]!.seq;
      setLastSeq(sessionId, maxSeq);
      lastAppliedSeqRef.current = Math.max(lastAppliedSeqRef.current, maxSeq);
      onResultsRef.current?.(results);
      // Imperative: fires for every drained batch, even an all-skipped one, so
      // asOfSeq (= lastAppliedSeqRef) advances in the next snapshot write.
      scheduleSnapshot();
    };
    const onError = (err: FirestoreError) => {
      console.error("[AI] Op listener error:", err);
      setSessionState((prev) => ({ ...prev, sessionActive: false }));
      opRetryCountRef.current++;
      if (opRetryCountRef.current >= 3) {
        console.warn("[AI] Op listener: 3 consecutive errors; giving up.");
        localTeardown();
        return;
      }
      scheduleListenerRetry(retryTimerOpsRef, activeSessionIdRef, resubscribeOpsRef, sessionId, setSessionState);
    };
    return { onNext, onError };
  }, [scheduleSnapshot, localTeardown]);

  // ── Session doc listener handlers ──────────────────────────────────────────
  const makeSessionHandlers = useCallback((sessionId: string) => {
    const onNext = (snap: DocumentSnapshot) => {
      if (!snap.exists()) {
        localTeardown();
        setSessionState({ sessionActive: false, aiConnected: false, consentRead: false, sessionId: null });
        return;
      }
      sessionRetryCountRef.current = 0;
      setSessionState((prev) => ({ ...prev, aiConnected: computeAiConnected(snap.data()!) }));
    };
    const onError = (err: FirestoreError) => {
      console.error("[AI] Session listener error:", err);
      setSessionState((prev) => ({ ...prev, sessionActive: false }));
      sessionRetryCountRef.current++;
      if (sessionRetryCountRef.current >= 3) {
        console.warn("[AI] Session listener: 3 consecutive errors; giving up.");
        localTeardown();
        return;
      }
      scheduleListenerRetry(retryTimerSessionRef, activeSessionIdRef, resubscribeSessionRef, sessionId, setSessionState);
    };
    return { onNext, onError };
  }, [localTeardown]);

  const resubscribeOps = useCallback((sessionId: string) => {
    if (!db) return;
    opsUnsubRef.current?.();
    const { onNext, onError } = makeOpHandlers(sessionId);
    opsUnsubRef.current = onSnapshot(buildOpsQuery(sessionId, getLastSeq(sessionId)), onNext, onError);
  }, [makeOpHandlers]);

  const resubscribeSession = useCallback((sessionId: string) => {
    if (!db) return;
    sessionUnsubRef.current?.();
    const { onNext, onError } = makeSessionHandlers(sessionId);
    sessionUnsubRef.current = onSnapshot(doc(db, AI_SESSIONS_COL, sessionId), onNext, onError);
  }, [makeSessionHandlers]);

  useEffect(() => { resubscribeOpsRef.current = resubscribeOps; }, [resubscribeOps]);
  useEffect(() => { resubscribeSessionRef.current = resubscribeSession; }, [resubscribeSession]);

  // ── Heartbeat ──────────────────────────────────────────────────────────────
  const startHeartbeat = useCallback((sessionId: string) => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    const fire = async () => {
      if (!db || activeSessionIdRef.current !== sessionId) return;
      try {
        await updateDoc(doc(db, AI_SESSIONS_COL, sessionId), {
          browserConnectedAt: serverTimestamp(),
          lastActiveAt: serverTimestamp(),
          expiresAt: sevenDaysOut(),
          openProductId: productRef.current?.id ?? null,
        });
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === "not-found" || code === "permission-denied") {
          if (heartbeatRef.current) clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
          setSessionState((prev) => ({ ...prev, sessionActive: false }));
        }
        console.error("[AI] Heartbeat error:", err);
      }
    };
    fire();
    heartbeatRef.current = setInterval(fire, 30_000);
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && activeSessionIdRef.current && db) {
        updateDoc(doc(db, AI_SESSIONS_COL, activeSessionIdRef.current), {
          browserConnectedAt: serverTimestamp(),
          openProductId: productRef.current?.id ?? null,
        }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // ── Teardown (with best-effort server cleanup) ─────────────────────────────
  const teardown = useCallback(async (sessionId: string) => {
    localTeardown();
    if (db) {
      deleteDoc(doc(db, AI_SESSIONS_COL, sessionId, "snapshot", "current")).catch(() => {});
    }
    const callable = getTeardownAiSession();
    if (callable) {
      callable({ sessionId }).catch((err) =>
        console.error("[AI] Teardown callable failed — data TTL-expires in 7 days:", err)
      );
    }
  }, [localTeardown]);

  // ── Start session ──────────────────────────────────────────────────────────
  const startSession = useCallback(async (consentRead: boolean): Promise<boolean> => {
    const database = db;
    if (!database || !isFirebaseAvailable || !project) return false;
    if (startSessionInFlightRef.current) return false;
    startSessionInFlightRef.current = true;
    try {
      const resolved = await resolveSessionId(database, localStorage.getItem(AI_SESSION_ID_KEY));
      if (!resolved) return false;
      let { sessionId } = resolved;
      let prevConsentRead = resolved.prevConsentRead;
      localStorage.setItem(AI_SESSION_ID_KEY, sessionId);
      writeConsentLocal(consentRead);
      activeSessionIdRef.current = sessionId;

      if (prevConsentRead !== null) {
        // Resuming a live session (e.g. after a page reload): seed asOfSeq from
        // the persisted per-session cursor so the first snapshot written doesn't
        // regress to 0 — the server-side snapshot may already carry the higher
        // value from before the reload. The fresh/recreate path below re-zeroes.
        lastAppliedSeqRef.current = getLastSeq(sessionId);
        const outcome = await resumeSession(database, sessionId, consentRead, prevConsentRead, project.id);
        if (outcome === "abort") { activeSessionIdRef.current = null; return false; }
        if (outcome === "recreate") {
          sessionId = crypto.randomUUID();
          localStorage.setItem(AI_SESSION_ID_KEY, sessionId);
          writeConsentLocal(consentRead);
          activeSessionIdRef.current = sessionId;
          prevConsentRead = null;
        }
      }
      if (prevConsentRead === null) {
        lastAppliedSeqRef.current = 0;
        const created = await createFreshSession(database, sessionId, consentRead, project.id);
        if (!created) { activeSessionIdRef.current = null; return false; }
      }

      resubscribeOps(sessionId);
      resubscribeSession(sessionId);
      startHeartbeat(sessionId);
      setSessionState({ sessionActive: true, aiConnected: false, consentRead, sessionId });
      if (consentRead) scheduleSnapshot();
      return true;
    } finally {
      startSessionInFlightRef.current = false;
    }
  }, [project, resubscribeOps, resubscribeSession, startHeartbeat, scheduleSnapshot]);

  // ── Stop session ───────────────────────────────────────────────────────────
  const stopSession = useCallback(async () => {
    const sessionId = activeSessionIdRef.current ?? localStorage.getItem(AI_SESSION_ID_KEY);
    if (sessionId) {
      clearLastSeq(sessionId);
      await teardown(sessionId);
    }
    localStorage.removeItem(AI_SESSION_ID_KEY);
    localStorage.removeItem(AI_CONSENT_KEY);
    setSessionState({ sessionActive: false, aiConnected: false, consentRead: false, sessionId: null });
  }, [teardown]);

  // ── Change permissions (Read Mode toggle) ──────────────────────────────────
  const changePermissions = useCallback(async (consentRead: boolean): Promise<boolean> => {
    const sessionId = activeSessionIdRef.current;
    if (!db || !sessionId) return false;
    try {
      await updateDoc(doc(db, AI_SESSIONS_COL, sessionId), {
        consentRead,
        lastActiveAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("[AI] Failed to update consentRead:", err);
      return false;
    }
    const prev = safeParseConsent(localStorage.getItem(AI_CONSENT_KEY)) ?? {};
    localStorage.setItem(AI_CONSENT_KEY, JSON.stringify({ ...prev, read: consentRead }));
    setSessionState((s) => ({ ...s, consentRead }));
    if (consentRead) {
      scheduleSnapshot();
    } else {
      if (snapshotTimerRef.current) { clearTimeout(snapshotTimerRef.current); snapshotTimerRef.current = null; }
      deleteDoc(doc(db, AI_SESSIONS_COL, sessionId, "snapshot", "current")).catch(() => {});
    }
    return true;
  }, [scheduleSnapshot]);

  useEffect(() => () => localTeardown(), [localTeardown]);

  return { sessionState, startSession, stopSession, changePermissions };
}
