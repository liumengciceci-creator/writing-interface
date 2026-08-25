import { API_BASE_URL } from "../apiConfig.js";

const STORAGE_PREFIX = "arguweave-research-v1";
const APP_VERSION = "v86";
const MAX_LOCAL_EVENTS = 2500;
const FLUSH_DELAY = 1800;
const FLUSH_BATCH_SIZE = 24;

let session = null;
let pendingEvents = [];
let allEvents = [];
let flushTimer = null;
let flushPromise = null;
const subscribers = new Set();

function createId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeParticipantId(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .slice(0, 80);
}

function storageKey(kind, sessionId) {
  return `${STORAGE_PREFIX}:${kind}:${sessionId}`;
}

function readStoredEvents(kind, sessionId) {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(storageKey(kind, sessionId)) || "[]"
    );
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistLocalState() {
  if (!session?.sessionId) return;
  try {
    window.localStorage.setItem(
      storageKey("pending", session.sessionId),
      JSON.stringify(pendingEvents)
    );
    window.localStorage.setItem(
      storageKey("events", session.sessionId),
      JSON.stringify(allEvents.slice(-MAX_LOCAL_EVENTS))
    );
  } catch (error) {
    console.warn("[research-log] local backup unavailable", error);
  }
}

function notify() {
  const snapshot = getResearchSessionInfo();
  subscribers.forEach((subscriber) => subscriber(snapshot));
}

function scheduleFlush() {
  if (!session?.enabled || flushTimer != null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flushResearchEvents();
  }, pendingEvents.length >= FLUSH_BATCH_SIZE ? 80 : FLUSH_DELAY);
}

function installLifecycleFlush() {
  if (window.__arguweaveResearchFlushInstalled) return;
  window.__arguweaveResearchFlushInstalled = true;

  const flushOnExit = () => {
    if (!session?.enabled || pendingEvents.length === 0) return;
    const body = JSON.stringify({ events: pendingEvents.slice(0, 120) });
    try {
      navigator.sendBeacon?.(
        `${API_BASE_URL}/api/research-events`,
        new Blob([body], { type: "application/json" })
      );
    } catch {
      persistLocalState();
    }
  };

  window.addEventListener("pagehide", flushOnExit);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOnExit();
  });
}

export function initializeResearchSession({ language = "zh" } = {}) {
  if (typeof window === "undefined") return getResearchSessionInfo();
  if (session) return getResearchSessionInfo();

  const params = new URLSearchParams(window.location.search);
  const participantId = normalizeParticipantId(
    params.get("participant") || params.get("pid")
  );
  const condition = String(params.get("condition") || "").trim().slice(0, 80);
  const enabled = Boolean(participantId);

  if (!enabled) {
    session = {
      enabled: false,
      participantId: "",
      condition: "",
      sessionId: "",
      startedAt: "",
      ended: false,
    };
    notify();
    return getResearchSessionInfo();
  }

  const sessionStorageKey = `${STORAGE_PREFIX}:active:${participantId}`;
  let sessionId = "";
  try {
    sessionId = window.sessionStorage.getItem(sessionStorageKey) || "";
  } catch {
    // A fresh id below is still sufficient when sessionStorage is blocked.
  }
  if (!sessionId) sessionId = createId("session");
  try {
    window.sessionStorage.setItem(sessionStorageKey, sessionId);
  } catch {
    // Logging continues with the in-memory id.
  }

  pendingEvents = readStoredEvents("pending", sessionId);
  allEvents = readStoredEvents("events", sessionId);
  session = {
    enabled: true,
    participantId,
    condition,
    sessionId,
    startedAt: new Date().toISOString(),
    ended: false,
    sequence: Math.max(
      0,
      ...allEvents.map((event) => Number(event.sequence) || 0)
    ),
  };

  installLifecycleFlush();
  const alreadyStarted = allEvents.some(
    (event) => event.event_type === "session_started"
  );
  if (!alreadyStarted) {
    logResearchEvent("session_started", {
      language,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      referrer: document.referrer || "",
    });
  } else {
    logResearchEvent("session_resumed", { language });
  }
  notify();
  return getResearchSessionInfo();
}

export function getResearchSessionInfo() {
  return {
    enabled: Boolean(session?.enabled),
    participantId: session?.participantId || "",
    condition: session?.condition || "",
    sessionId: session?.sessionId || "",
    startedAt: session?.startedAt || "",
    ended: Boolean(session?.ended),
    pendingCount: pendingEvents.length,
    eventCount: allEvents.length,
  };
}

export function subscribeResearchSession(subscriber) {
  subscribers.add(subscriber);
  subscriber(getResearchSessionInfo());
  return () => subscribers.delete(subscriber);
}

export function createResearchActionId(prefix = "action") {
  return createId(prefix);
}

export function logResearchEvent(
  eventType,
  payload = {},
  { actionId = "", targetBlockIds = [] } = {}
) {
  if (!session?.enabled || session.ended) return null;

  session.sequence = (Number(session.sequence) || 0) + 1;
  const event = {
    event_id: createId("event"),
    participant_id: session.participantId,
    session_id: session.sessionId,
    condition: session.condition,
    sequence: session.sequence,
    timestamp: new Date().toISOString(),
    event_type: String(eventType || "unknown"),
    action_id: String(actionId || ""),
    target_block_ids: Array.from(
      new Set((targetBlockIds || []).map(String).filter(Boolean))
    ),
    payload,
    app_version: APP_VERSION,
    interface_language:
      document.documentElement.lang || "",
  };

  pendingEvents.push(event);
  allEvents.push(event);
  if (allEvents.length > MAX_LOCAL_EVENTS) {
    allEvents = allEvents.slice(-MAX_LOCAL_EVENTS);
  }
  persistLocalState();
  scheduleFlush();
  notify();
  return event;
}

export async function flushResearchEvents({ keepalive = false } = {}) {
  if (!session?.enabled || pendingEvents.length === 0) return true;
  if (flushPromise) return flushPromise;

  const batch = pendingEvents.slice(0, 120);
  flushPromise = fetch(`${API_BASE_URL}/api/research-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events: batch }),
    keepalive,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error((await response.text()) || `HTTP ${response.status}`);
      }
      const acknowledgedIds = new Set(batch.map((event) => event.event_id));
      pendingEvents = pendingEvents.filter(
        (event) => !acknowledgedIds.has(event.event_id)
      );
      persistLocalState();
      notify();
      if (pendingEvents.length > 0) scheduleFlush();
      return true;
    })
    .catch((error) => {
      console.warn("[research-log] remote submission deferred", error);
      persistLocalState();
      return false;
    })
    .finally(() => {
      flushPromise = null;
    });

  return flushPromise;
}

export function downloadResearchLog({ documentSnapshot = null } = {}) {
  if (!session?.enabled) return false;
  const exportData = {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    session: getResearchSessionInfo(),
    document_snapshot: documentSnapshot,
    events: allEvents,
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `${session.participantId}_${session.sessionId}_research-log.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
  return true;
}

export async function finishResearchSession({ documentSnapshot = null } = {}) {
  if (!session?.enabled || session.ended) return false;
  logResearchEvent("session_ended", {
    duration_ms: Math.max(
      0,
      Date.now() - new Date(session.startedAt).getTime()
    ),
    final_document: documentSnapshot,
  });
  session.ended = true;
  await flushResearchEvents({ keepalive: true });
  downloadResearchLog({ documentSnapshot });
  notify();
  return true;
}
