import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const GRAPH_WIDTH = 420;
const NODE_GAP = 48;
const LANE_GAP = 34;

const actionButton = {
  height: 31,
  padding: "0 13px",
  borderRadius: 7,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
};

function samePair(leftSource, leftTarget, rightSource, rightTarget) {
  return (
    (String(leftSource) === String(rightSource) &&
      String(leftTarget) === String(rightTarget)) ||
    (String(leftSource) === String(rightTarget) &&
      String(leftTarget) === String(rightSource))
  );
}

function selectEssentialGraph(notes, graph, results) {
  const validIds = new Set(notes.map((note) => String(note.id)));
  const enhancementPairs = new Set(
    results.map((item) =>
      [String(item.relationSourceId), String(item.relationTargetId)]
        .sort()
        .join("::")
    )
  );
  const seenPairs = new Set();
  const candidates = graph.flatMap((edge, index) => {
    const sourceId = String(edge.sourceId);
    const targetId = String(edge.targetId);
    if (!validIds.has(sourceId) || !validIds.has(targetId) || sourceId === targetId) return [];

    const pairKey = [sourceId, targetId].sort().join("::");
    if (seenPairs.has(pairKey)) return [];
    seenPairs.add(pairKey);

    return [{
      ...edge,
      sourceId,
      targetId,
      importance: Math.max(1, Math.min(5, Number(edge.importance) || 3)),
      hasEnhancement: enhancementPairs.has(pairKey),
      arrivalIndex: index,
    }];
  });

  const limit = Math.min(5, Math.max(1, notes.length));
  return candidates
    .sort((left, right) =>
      Number(right.hasEnhancement) - Number(left.hasEnhancement) ||
      right.importance - left.importance ||
      left.arrivalIndex - right.arrivalIndex
    )
    .slice(0, Math.max(limit, candidates.filter((edge) => edge.hasEnhancement).length))
    .sort((left, right) => left.arrivalIndex - right.arrivalIndex);
}

function useProgressiveGraph(graph) {
  const [visibleIds, setVisibleIds] = useState([]);
  const graphKey = graph.map((edge) => edge.id).join("|");
  const graphRef = useRef(graph);
  graphRef.current = graph;

  useEffect(() => {
    const allowedIds = new Set(graph.map((edge) => edge.id));
    setVisibleIds((current) => current.filter((id) => allowedIds.has(id)));
  }, [graphKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setVisibleIds((current) => {
        const currentGraph = graphRef.current;
        const allowedIds = new Set(currentGraph.map((edge) => edge.id));
        const retained = current.filter((id) => allowedIds.has(id));
        const nextEdge = currentGraph.find((edge) => !retained.includes(edge.id));
        if (nextEdge) return [...retained, nextEdge.id];
        return retained.length === current.length ? current : retained;
      });
    }, 820);

    return () => window.clearInterval(timer);
  }, []);

  return useMemo(
    () => graph.filter((edge) => visibleIds.includes(edge.id)),
    [graph, graphKey, visibleIds]
  );
}

function buildEdgeLayout(notes, graph) {
  const indexById = new Map(
    notes.map((note, index) => [String(note.id), index])
  );
  const seen = new Set();
  const laneIntervals = [];

  const edges = graph.flatMap((edge) => {
    const sourceIndex = indexById.get(String(edge.sourceId));
    const targetIndex = indexById.get(String(edge.targetId));
    if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex)) return [];
    if (sourceIndex === targetIndex) return [];

    const key = `${edge.sourceId}-${edge.targetId}-${edge.relation}`;
    if (seen.has(key)) return [];
    seen.add(key);

    const adjacent = Math.abs(sourceIndex - targetIndex) === 1;
    let lane = -1;

    if (!adjacent) {
      const interval = {
        start: Math.min(sourceIndex, targetIndex),
        end: Math.max(sourceIndex, targetIndex),
      };

      lane = laneIntervals.findIndex((items) =>
        items.every(
          (item) => interval.end < item.start || interval.start > item.end
        )
      );

      if (lane === -1) {
        lane = laneIntervals.length;
        laneIntervals.push([]);
      }
      laneIntervals[lane].push(interval);
    }

    return [
      {
        ...edge,
        sourceIndex,
        targetIndex,
        adjacent,
        lane,
      },
    ];
  });

  return {
    edges,
    laneCount: laneIntervals.length,
  };
}

function RelationGraph({
  notes,
  graph,
  results,
  activeGraphId,
  graphBlinkOn,
  selectedEdgeId,
  onSelectEdge,
}) {
  const containerRef = useRef(null);
  const [routes, setRoutes] = useState([]);
  const visibleGraph = useProgressiveGraph(graph);
  const { edges, laneCount } = useMemo(
    () => buildEdgeLayout(notes, visibleGraph),
    [notes, visibleGraph]
  );
  const gutterWidth = laneCount > 0 ? Math.min(164, 54 + laneCount * LANE_GAP) : 18;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const measure = () => {
      const containerRect = container.getBoundingClientRect();
      const nodeRects = new Map();

      container.querySelectorAll("[data-review-node-id]").forEach((element) => {
        const rect = element.getBoundingClientRect();
        nodeRects.set(String(element.getAttribute("data-review-node-id")), {
          left: rect.left - containerRect.left,
          right: rect.right - containerRect.left,
          top: rect.top - containerRect.top,
          bottom: rect.bottom - containerRect.top,
          centerX: rect.left - containerRect.left + rect.width / 2,
          centerY: rect.top - containerRect.top + rect.height / 2,
        });
      });

      const nodeRight = Math.max(
        0,
        ...Array.from(nodeRects.values()).map((rect) => rect.right)
      );

      setRoutes(
        edges.flatMap((edge) => {
          const source = nodeRects.get(String(edge.sourceId));
          const target = nodeRects.get(String(edge.targetId));
          if (!source || !target) return [];

          if (edge.adjacent) {
            const pointsDown = edge.sourceIndex < edge.targetIndex;
            const startX = source.centerX;
            const startY = pointsDown ? source.bottom + 2 : source.top - 2;
            const endX = target.centerX;
            const endY = pointsDown ? target.top - 7 : target.bottom + 7;
            const middleY = startY + (endY - startY) / 2;

            return [
              {
                ...edge,
                d: `M ${startX} ${startY} V ${endY}`,
                labelX: startX + 11,
                labelY: middleY,
                markerX: startX,
                markerY: middleY,
              },
            ];
          }

          const laneX = Math.min(
            container.clientWidth - 18,
            nodeRight + 26 + edge.lane * LANE_GAP
          );
          const startX = source.right + 3;
          const startY = source.centerY;
          const endX = target.right + 7;
          const endY = target.centerY;
          const middleY = startY + (endY - startY) / 2;

          return [
            {
              ...edge,
              d: `M ${startX} ${startY} H ${laneX} V ${endY} H ${endX}`,
              labelX: laneX + 5,
              labelY: middleY,
              markerX: laneX,
              markerY: middleY,
            },
          ];
        })
      );
    };

    const frame = window.requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    container.querySelectorAll("[data-review-node-id]").forEach((element) =>
      observer.observe(element)
    );
    window.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [edges, gutterWidth]);

  const enhancementNumberById = new Map(
    results.map((item, index) => [String(item.id), index + 1])
  );

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: NODE_GAP,
      }}
    >
      <svg
        aria-hidden="true"
        width="100%"
        height="100%"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          overflow: "visible",
          pointerEvents: "none",
        }}
      >
        <defs>
          {routes.map((route) => (
            <marker
              key={`marker-${route.id}`}
              id={`review-edge-arrow-${route.id}`}
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 7 3.5 L 0 7 Z" fill={route.color || "#8d96a3"} />
            </marker>
          ))}
        </defs>

        {routes.map((route) => {
          const active = activeGraphId === route.id;
          return (
            <path
              key={route.id}
              d={route.d}
              fill="none"
              stroke={route.color || "#8d96a3"}
              strokeWidth={active && graphBlinkOn ? 2.25 : 1.35}
              strokeLinecap="square"
              strokeLinejoin="miter"
              markerEnd={`url(#review-edge-arrow-${route.id})`}
              opacity={active && !graphBlinkOn ? 0.46 : 0.86}
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset="1"
            >
              <animate
                attributeName="stroke-dashoffset"
                from="1"
                to="0"
                dur="0.72s"
                fill="freeze"
              />
            </path>
          );
        })}
      </svg>

      {notes.map((note) => {
        const active = activeGraphId === `note-${note.id}`;
        return (
          <article
            key={note.id}
            data-review-node-id={note.id}
            style={{
              position: "relative",
              zIndex: 3,
              width: `calc(100% - ${gutterWidth}px)`,
              minWidth: 0,
              padding: "14px 12px 9px",
              border: `1px solid ${note.color}72`,
              borderRadius: 9,
              background: note.fill,
              boxSizing: "border-box",
              boxShadow:
                active && graphBlinkOn
                  ? `0 0 0 3px ${note.color}2f`
                  : "0 1px 2px rgba(15,23,42,0.025)",
              opacity: active && !graphBlinkOn ? 0.64 : 1,
              transform: active && graphBlinkOn ? "translateY(-1px)" : "translateY(0)",
              transition: "opacity 170ms ease, transform 170ms ease, box-shadow 170ms ease",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 10,
                top: -9,
                display: "inline-flex",
                alignItems: "center",
                minHeight: 18,
                padding: "0 7px",
                borderRadius: 3,
                background: note.color,
                color: "#fff",
                fontSize: 10,
                fontWeight: 800,
                lineHeight: "18px",
                boxShadow: "0 1px 3px rgba(15,23,42,0.12)",
              }}
            >
              {note.type}
            </span>
            <div style={{ color: "#374151", fontSize: 11.8, lineHeight: 1.5 }}>
              {note.text}
            </div>
          </article>
        );
      })}

      {routes.map((route) => (
        <div
          key={`label-${route.id}`}
          style={{
            position: "absolute",
            left: route.labelX,
            top: route.labelY,
            zIndex: 4,
            maxWidth: route.adjacent ? 104 : 78,
            padding: "1px 4px",
            transform: "translateY(-50%)",
            borderRadius: 4,
            background: "rgba(231,231,231,0.94)",
            color: route.color || "#667085",
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1.35,
            pointerEvents: "none",
          }}
        >
          {route.relation}
        </div>
      ))}

      {routes.map((route) => {
        const enhancements = results.filter((item) =>
          samePair(
            item.relationSourceId,
            item.relationTargetId,
            route.sourceId,
            route.targetId
          )
        );
        if (enhancements.length === 0) return null;

        const first = enhancements[0];
        const number = enhancementNumberById.get(String(first.id));
        const selected = selectedEdgeId === route.id;

        return (
          <button
            key={`enhancement-${route.id}`}
            type="button"
            aria-label={`查看第 ${number} 个潜在增强点`}
            aria-expanded={selected}
            onClick={() => onSelectEdge(route.id)}
            style={{
              position: "absolute",
              left: route.markerX,
              top: route.markerY,
              zIndex: 6,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 22,
              height: 22,
              padding: 0,
              transform: "translate(-50%, -50%)",
              border: "2px solid #e7e7e7",
              borderRadius: "50%",
              background: selected ? "#c58d0e" : "#dda919",
              color: "#fff",
              fontSize: 10.5,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(128,98,27,0.24)",
            }}
          >
            {enhancements.length > 1 ? `+${enhancements.length}` : number}
          </button>
        );
      })}
    </div>
  );
}

function EnhancementInspector({ edge, items, onAccept, onReject, onClose }) {
  return (
    <section
      aria-label="潜在增强点详情"
      style={{
        flex: "1 1 300px",
        minWidth: 280,
        height: "100vh",
        overflowY: "auto",
        borderLeft: "1px solid rgba(17,24,39,0.10)",
        background: "#f5f5f5",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 3,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 44,
          padding: "8px 12px 7px 15px",
          background: "rgba(245,245,245,0.96)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div>
          <div style={{ color: "#555", fontSize: 11, fontWeight: 800 }}>潜在增强点</div>
          <div style={{ marginTop: 2, color: edge?.color || "#718096", fontSize: 10.5 }}>
            {edge?.relation || "模块关系"}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭潜在增强点详情"
          style={{
            width: 27,
            height: 27,
            padding: 0,
            border: 0,
            borderRadius: 7,
            background: "transparent",
            color: "#747b87",
            fontSize: 19,
            cursor: "pointer",
          }}
        >
          ×
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px 24px" }}>
        {items.map((item) => (
          <article
            key={item.id}
            style={{
              padding: 12,
              border: "1px solid #e2c56f",
              borderRadius: 10,
              background: "#fffaf0",
              boxShadow: "0 3px 10px rgba(92,70,16,0.08)",
            }}
          >
            <div
              style={{
                marginBottom: 6,
                color: "#80621b",
                fontSize: 10.5,
                fontWeight: 800,
              }}
            >
              {item.criterion || item.category || "内容关系把关"}
            </div>
            <div style={{ color: "#4b5563", fontSize: 11.8, lineHeight: 1.58 }}>
              {item.summary || item.comment}
            </div>

            {!item.decision && (
              <div style={{ marginTop: 7, color: "#92400e", fontSize: 11.8, lineHeight: 1.58 }}>
                {item.suggestion || "这部分内容可以进一步加强。"}
              </div>
            )}

            {item.suggestedText !== item.originalText && (
              <div
                style={{
                  marginTop: 9,
                  padding: 9,
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.84)",
                  color: "#374151",
                  fontSize: 11.8,
                  lineHeight: 1.6,
                }}
              >
                <div style={{ marginBottom: 4, color: "#80621b", fontSize: 10.5, fontWeight: 700 }}>
                  {item.decision === "accepted" ? "加强后的结果" : "建议加强为"}
                </div>
                {item.suggestedText}
              </div>
            )}

            {item.decision ? (
              <div
                style={{
                  marginTop: 10,
                  color: item.decision === "accepted" ? "#287a55" : "#6b7280",
                  fontSize: 11.5,
                  fontWeight: 600,
                }}
              >
                {item.decision === "accepted" ? "✓ 已加强" : "已拒绝，本条保持原文"}
              </div>
            ) : item.suggestedText !== item.originalText ? (
              <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => onAccept(item)}
                  style={{ ...actionButton, flex: 1, border: 0, background: "#315ea8", color: "#fff" }}
                >
                  加强
                </button>
                <button
                  type="button"
                  onClick={() => onReject(item)}
                  style={{ ...actionButton, border: "1px solid #d7dce3", background: "#fff", color: "#4b5563" }}
                >
                  拒绝
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onReject(item)}
                style={{
                  ...actionButton,
                  width: "100%",
                  marginTop: 10,
                  border: "1px solid #d7dce3",
                  background: "#fff",
                  color: "#4b5563",
                }}
              >
                保留原文
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export default function ReviewPanel({
  open,
  isReviewing,
  progress,
  graph = [],
  notes = [],
  activeGraphId = null,
  graphBlinkOn = false,
  results = [],
  onAccept,
  onReject,
  onClose,
  onInspectorOpenChange,
}) {
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const reviewResults = useMemo(
    () => results.filter((item) => item.summary || item.suggestion),
    [results]
  );
  const essentialGraph = useMemo(
    () => selectEssentialGraph(notes, graph, reviewResults),
    [notes, graph, reviewResults]
  );
  const edgeLayout = useMemo(
    () => buildEdgeLayout(notes, essentialGraph).edges,
    [notes, essentialGraph]
  );
  const selectedEdge = edgeLayout.find((edge) => edge.id === selectedEdgeId) || null;
  const selectedItems = selectedEdge
    ? reviewResults.filter((item) =>
        samePair(
          item.relationSourceId,
          item.relationTargetId,
          selectedEdge.sourceId,
          selectedEdge.targetId
        )
      )
    : [];

  useEffect(() => {
    if (!selectedEdgeId || selectedEdge) return;
    setSelectedEdgeId(null);
    onInspectorOpenChange?.(false);
  }, [selectedEdge, selectedEdgeId, onInspectorOpenChange]);

  if (!open) return null;

  const closeInspector = () => {
    setSelectedEdgeId(null);
    onInspectorOpenChange?.(false);
  };

  const selectEdge = (edgeId) => {
    if (selectedEdgeId === edgeId) {
      closeInspector();
      return;
    }
    setSelectedEdgeId(edgeId);
    onInspectorOpenChange?.(true);
  };

  return (
    <aside
      aria-label="模块关系说明"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 140,
        display: "flex",
        width: "100%",
        height: "100vh",
        minWidth: 0,
        overflow: "hidden",
        background: "#e7e7e7",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          flex: `0 0 ${GRAPH_WIDTH}px`,
          width: GRAPH_WIDTH,
          height: "100vh",
          overflowX: "hidden",
          overflowY: "auto",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: 42,
            padding: "7px 14px 6px 18px",
            background: "rgba(231,231,231,0.94)",
            backdropFilter: "blur(8px)",
            boxSizing: "border-box",
          }}
        >
          <span style={{ color: "#717784", fontSize: 11, fontWeight: 600 }}>
            {isReviewing
              ? progress.total > 0
                ? `正在识别 ${progress.current}/${progress.total}`
                : "正在识别模块关系"
              : `已识别 ${progress.total} 个模块`}
          </span>
          <button
            type="button"
            onClick={() => {
              closeInspector();
              onClose();
            }}
            aria-label="关闭模块关系说明"
            style={{
              width: 27,
              height: 27,
              padding: 0,
              border: 0,
              borderRadius: 7,
              background: "transparent",
              color: "#747b87",
              fontSize: 19,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "20px 20px 36px" }}>
          {isReviewing && notes.length === 0 && (
            <div style={{ padding: "30px 12px", color: "#777e89", fontSize: 12, lineHeight: 1.65 }}>
              正在读取所选模块，模块与跨段关系会依次显示在这里。
            </div>
          )}

          {!isReviewing && progress.total === 0 && notes.length === 0 && (
            <div style={{ padding: "30px 12px", color: "#777e89", fontSize: 12, lineHeight: 1.65 }}>
              所选内容中暂未识别出明确的模块关系。
            </div>
          )}

          <RelationGraph
            notes={notes}
            graph={essentialGraph}
            results={reviewResults}
            activeGraphId={activeGraphId}
            graphBlinkOn={graphBlinkOn}
            selectedEdgeId={selectedEdgeId}
            onSelectEdge={selectEdge}
          />
        </div>
      </div>

      {selectedEdge && selectedItems.length > 0 && (
        <EnhancementInspector
          edge={selectedEdge}
          items={selectedItems}
          onAccept={onAccept}
          onReject={onReject}
          onClose={closeInspector}
        />
      )}
    </aside>
  );
}
