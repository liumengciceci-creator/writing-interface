import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const PANEL_WIDTH = 286;
const ROUTE_GAP = 22;

function normalizeId(value) {
  return value == null ? "" : String(value);
}

function pairKey(sourceId, targetId) {
  return [normalizeId(sourceId), normalizeId(targetId)]
    .sort()
    .join("::");
}

function groupEnhancements(items) {
  const groups = new Map();

  items.forEach((item) => {
    if (item?.decision) return;
    const sourceId = normalizeId(item?.relationSourceId);
    const targetId = normalizeId(item?.relationTargetId);
    if (!sourceId || !targetId || sourceId === targetId) return;

    const key = pairKey(sourceId, targetId);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      return;
    }

    groups.set(key, {
      id: key,
      sourceId,
      targetId,
      items: [item],
    });
  });

  return Array.from(groups.values()).slice(0, 5);
}

function findBlockElement(stage, blockId) {
  const targetId = normalizeId(blockId);
  return Array.from(
    stage.querySelectorAll(
      "[data-semantic-block-id], [data-block-root='true']"
    )
  ).find((element) =>
    normalizeId(
      element.getAttribute("data-semantic-block-id") ??
        element.getAttribute("data-block-id")
    ) === targetId
  ) || null;
}

function relativeRect(element, stageRect) {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left - stageRect.left,
    right: rect.right - stageRect.left,
    top: rect.top - stageRect.top,
    bottom: rect.bottom - stageRect.top,
    centerX: rect.left - stageRect.left + rect.width / 2,
    centerY: rect.top - stageRect.top + rect.height / 2,
  };
}

function buildRoute(group, source, target, index) {
  const verticallySeparated =
    target.top > source.bottom + 12 || source.top > target.bottom + 12;

  if (verticallySeparated) {
    const laneX = Math.max(source.right, target.right) + ROUTE_GAP + index * 13;
    const startX = source.right + 3;
    const startY = source.centerY;
    const endX = target.right + 7;
    const endY = target.centerY;

    return {
      ...group,
      d: `M ${startX} ${startY} H ${laneX} V ${endY} H ${endX}`,
      markerX: laneX,
      markerY: startY + (endY - startY) / 2,
    };
  }

  const pointsRight = source.centerX <= target.centerX;
  const startX = pointsRight ? source.right + 3 : source.left - 3;
  const endX = pointsRight ? target.left - 7 : target.right + 7;
  const y = (source.centerY + target.centerY) / 2;

  return {
    ...group,
    d: `M ${startX} ${source.centerY} V ${y} H ${endX} V ${target.centerY}`,
    markerX: startX + (endX - startX) / 2,
    markerY: y,
  };
}

function EnhancementDetails({ route, stageWidth, onAccept, onReject, onClose }) {
  const left = Math.max(
    8,
    Math.min(
      route.markerX + 18,
      Math.max(8, stageWidth - PANEL_WIDTH - 8)
    )
  );

  return (
    <section
      aria-label="潜在增强点详情"
      onMouseDown={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        left,
        top: route.markerY + 18,
        zIndex: 3,
        width: PANEL_WIDTH,
        maxHeight: 330,
        overflowY: "auto",
        padding: 11,
        border: "1px solid rgba(184,134,20,0.34)",
        borderRadius: 11,
        background: "rgba(255,255,255,0.97)",
        boxShadow: "0 10px 28px rgba(15,23,42,0.16)",
        boxSizing: "border-box",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <strong style={{ color: "#6f5613", fontSize: 11.5 }}>
          潜在增强点
        </strong>
        <button
          type="button"
          aria-label="关闭潜在增强点"
          onClick={onClose}
          style={{
            width: 24,
            height: 24,
            padding: 0,
            border: 0,
            borderRadius: 6,
            background: "transparent",
            color: "#6b7280",
            fontSize: 18,
            cursor: "pointer",
          }}
        >
          ×
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {route.items.map((item) => {
          const hasRevision = item.suggestedText !== item.originalText;
          return (
            <article
              key={item.id}
              style={{
                padding: 9,
                borderRadius: 8,
                background: "#fff8e7",
                color: "#374151",
              }}
            >
              <div style={{ color: "#9a7010", fontSize: 10, fontWeight: 800 }}>
                {item.criterion || item.category || "内容关系把关"}
              </div>
              <div style={{ marginTop: 5, fontSize: 11.5, lineHeight: 1.55 }}>
                {item.summary || item.comment}
              </div>
              <div style={{ marginTop: 5, color: "#824d0b", fontSize: 11.2, lineHeight: 1.55 }}>
                {item.suggestion}
              </div>

              {hasRevision ? (
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => onAccept(item)}
                    style={{
                      flex: 1,
                      height: 28,
                      border: 0,
                      borderRadius: 6,
                      background: "#315ea8",
                      color: "#fff",
                      fontSize: 10.5,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    加强
                  </button>
                  <button
                    type="button"
                    onClick={() => onReject(item)}
                    style={{
                      height: 28,
                      padding: "0 10px",
                      border: "1px solid #d7dce3",
                      borderRadius: 6,
                      background: "#fff",
                      color: "#4b5563",
                      fontSize: 10.5,
                      cursor: "pointer",
                    }}
                  >
                    拒绝
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onReject(item)}
                  style={{
                    width: "100%",
                    height: 28,
                    marginTop: 8,
                    border: "1px solid #d7dce3",
                    borderRadius: 6,
                    background: "#fff",
                    color: "#4b5563",
                    fontSize: 10.5,
                    cursor: "pointer",
                  }}
                >
                  保留原文
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function CanvasReviewOverlay({
  stageRef,
  enhancements = [],
  onAccept,
  onReject,
}) {
  const groups = useMemo(
    () => groupEnhancements(enhancements),
    [enhancements]
  );
  const [routes, setRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const routeKey = groups.map((group) => group.id).join("|");
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  useLayoutEffect(() => {
    const stage = stageRef?.current;
    if (!stage || groups.length === 0) {
      setRoutes([]);
      return undefined;
    }

    const measure = () => {
      const currentStage = stageRef.current;
      if (!currentStage) return;
      const stageRect = currentStage.getBoundingClientRect();
      const nextRoutes = groupsRef.current.flatMap((group, index) => {
        const sourceElement = findBlockElement(currentStage, group.sourceId);
        const targetElement = findBlockElement(currentStage, group.targetId);
        if (!sourceElement || !targetElement) return [];

        return [
          buildRoute(
            group,
            relativeRect(sourceElement, stageRect),
            relativeRect(targetElement, stageRect),
            index
          ),
        ];
      });
      setRoutes(nextRoutes);
    };

    const frame = window.requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    stage
      .querySelectorAll("[data-semantic-block-id], [data-block-root='true']")
      .forEach((element) => observer.observe(element));
    window.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [routeKey, stageRef, groups.length]);

  useEffect(() => {
    if (!selectedRouteId) return;
    if (routes.some((route) => route.id === selectedRouteId)) return;
    setSelectedRouteId(null);
  }, [routes, selectedRouteId]);

  if (routes.length === 0) return null;

  const selectedRoute =
    routes.find((route) => route.id === selectedRouteId) || null;
  const stageWidth = stageRef.current?.clientWidth || 0;

  return (
    <div
      aria-label="画布增强关系提示"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 6000,
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <svg
        aria-hidden="true"
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        <defs>
          {routes.map((route, index) => (
            <marker
              key={`marker-${route.id}`}
              id={`canvas-review-arrow-${index}`}
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 7 3.5 L 0 7 Z" fill="#d6a31a" />
            </marker>
          ))}
        </defs>

        {routes.map((route, index) => (
          <path
            key={route.id}
            d={route.d}
            fill="none"
            stroke="#d6a31a"
            strokeWidth="1.5"
            strokeLinecap="square"
            strokeLinejoin="miter"
            markerEnd={`url(#canvas-review-arrow-${index})`}
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset="1"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="1"
              to="0"
              dur="0.72s"
              begin={`${index * 0.28}s`}
              fill="freeze"
            />
          </path>
        ))}
      </svg>

      {routes.map((route, index) => (
        <button
          key={`point-${route.id}`}
          type="button"
          aria-label={`查看第 ${index + 1} 个潜在增强点`}
          aria-expanded={selectedRouteId === route.id}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() =>
            setSelectedRouteId((current) =>
              current === route.id ? null : route.id
            )
          }
          style={{
            position: "absolute",
            left: route.markerX,
            top: route.markerY,
            width: 24,
            height: 24,
            padding: 0,
            transform: "translate(-50%, -50%)",
            border: "2px solid #fff",
            borderRadius: "50%",
            background: selectedRouteId === route.id ? "#b57d08" : "#dba817",
            color: "#fff",
            fontSize: 10.5,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(112,80,11,0.30)",
            pointerEvents: "auto",
            animation: "semantic-review-point-in 220ms ease both",
            animationDelay: `${0.52 + index * 0.28}s`,
          }}
        >
          {route.items.length > 1 ? `+${route.items.length}` : index + 1}
        </button>
      ))}

      {selectedRoute ? (
        <EnhancementDetails
          route={selectedRoute}
          stageWidth={stageWidth}
          onAccept={onAccept}
          onReject={onReject}
          onClose={() => setSelectedRouteId(null)}
        />
      ) : null}
    </div>
  );
}
