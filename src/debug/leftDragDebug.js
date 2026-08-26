const MAX_LEFT_DRAG_DEBUG_EVENTS = 120;

function getDebugStore() {
  if (typeof window === "undefined") return null;

  if (!Array.isArray(window.__ARGUWEAVE_LEFT_DRAG_DEBUG__)) {
    window.__ARGUWEAVE_LEFT_DRAG_DEBUG__ = [];
  }

  return window.__ARGUWEAVE_LEFT_DRAG_DEBUG__;
}

export function leftDragDebug(step, payload = {}) {
  const event = {
    time: new Date().toISOString(),
    step,
    ...payload,
  };

  const store = getDebugStore();

  if (store) {
    store.push(event);

    if (store.length > MAX_LEFT_DRAG_DEBUG_EVENTS) {
      store.splice(
        0,
        store.length - MAX_LEFT_DRAG_DEBUG_EVENTS
      );
    }

    if (payload?.blockId != null) {
      window.__ARGUWEAVE_LAST_LEFT_DRAG_BLOCK_ID__ =
        String(payload.blockId);
    }
  }

  console.log(
    `[LEFT_DRAG_DEBUG] ${step}`,
    event
  );

  return event;
}

export function getLastLeftDragDebugBlockId() {
  if (typeof window === "undefined") {
    return "";
  }

  return String(
    window.__ARGUWEAVE_LAST_LEFT_DRAG_BLOCK_ID__ ||
      ""
  );
}


if (typeof window !== "undefined") {
  window.dumpLeftDragDebug = () => {
    const events = Array.isArray(window.__ARGUWEAVE_LEFT_DRAG_DEBUG__)
      ? window.__ARGUWEAVE_LEFT_DRAG_DEBUG__
      : [];

    console.table(events);
    return events;
  };

  window.clearLeftDragDebug = () => {
    window.__ARGUWEAVE_LEFT_DRAG_DEBUG__ = [];
    window.__ARGUWEAVE_LAST_LEFT_DRAG_BLOCK_ID__ = "";
    console.log("[LEFT_DRAG_DEBUG] cleared");
  };
}
