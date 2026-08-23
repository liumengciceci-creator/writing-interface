import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const actionButton = {
  height: 32,
  padding: "0 14px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

function groupTreeEdges(edges) {
  const groups = new Map();
  edges.forEach((edge) => {
    const key = `${edge.targetId}-${edge.targetType}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        type: edge.targetType,
        text: edge.targetText,
        color: edge.targetColor,
        fill: edge.targetFill,
        children: [],
      });
    }
    groups.get(key).children.push(edge);
  });
  return Array.from(groups.values());
}

function LogicNode({ type, text, color, fill, active = false, blinkOn = false }) {
  return (
    <div
      title={text}
      style={{
        minWidth: 0,
        padding: "9px 10px",
        border: `1.5px solid ${color}`,
        borderRadius: 9,
        background: fill,
        boxShadow: active && blinkOn ? `0 0 0 3px ${color}35, 0 5px 16px ${color}55` : `0 2px 7px ${color}22`,
        opacity: active && !blinkOn ? 0.56 : 1,
        transform: active && blinkOn ? "scale(1.025)" : "scale(1)",
        transition: "opacity 180ms ease, transform 180ms ease, box-shadow 180ms ease",
      }}
    >
      <div style={{ color, fontSize: 11, fontWeight: 800 }}>{type}</div>
      <div style={{ marginTop: 4, color: "#4b5563", fontSize: 10.5, lineHeight: 1.55, whiteSpace: "normal", overflowWrap: "break-word", wordBreak: "break-word" }}>
        {text || "空模块"}
      </div>
    </div>
  );
}

function LogicTree({ edges, activeEdgeId, blinkOn }) {
  const groups = groupTreeEdges(edges);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {groups.map((group) => {
        const childCount = group.children.length;
        const groupActive = group.children.some((child) => child.id === activeEdgeId);
        return (
          <div key={group.id} style={{ position: "relative" }}>
            <div style={{ width: "min(176px, 82%)", margin: "0 auto" }}>
              <LogicNode type={group.type} text={group.text} color={group.color} fill={group.fill} active={groupActive} blinkOn={blinkOn} />
            </div>

            <div style={{ width: 1.5, height: 16, margin: "0 auto", background: group.color }} />

            <div style={{ position: "relative", display: "grid", gridTemplateColumns: childCount === 1 ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))", gap: "12px 10px", paddingTop: 15 }}>
              {childCount > 1 && (
                <div style={{ position: "absolute", left: "25%", right: "25%", top: 0, height: 1.5, background: group.color }} />
              )}

              {group.children.map((child) => (
                <div key={child.id} style={{ position: "relative", minWidth: 0 }}>
                  <div style={{ position: "absolute", left: "50%", top: -15, width: 1.5, height: 11, background: group.color }} />
                  <div style={{ marginBottom: 5, color: "#738096", fontSize: 9, fontWeight: 700, textAlign: "center" }}>
                    {child.relation || "关联"} ↑
                  </div>
                  <LogicNode type={child.sourceType} text={child.sourceText} color={child.sourceColor} fill={child.sourceFill} active={child.id === activeEdgeId} blinkOn={blinkOn} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ModuleNoteConnectors({ notes }) {
  const [paths, setPaths] = useState([]);

  useEffect(() => {
    const updatePaths = () => {
      const blockElements = Array.from(document.querySelectorAll("[data-semantic-block-id], [data-block-id]"));
      const noteElements = Array.from(document.querySelectorAll("[data-review-note-id]"));
      const nextPaths = notes.map((note) => {
        const source = blockElements.find((element) =>
          String(element.getAttribute("data-semantic-block-id") || element.getAttribute("data-block-id")) === String(note.blockId)
        );
        const target = noteElements.find((element) => element.getAttribute("data-review-note-id") === String(note.id));
        if (!source || !target) return null;
        const sourceRect = source.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        if (!sourceRect.width || !sourceRect.height || !targetRect.width || !targetRect.height) return null;
        const startX = sourceRect.right + 5;
        const startY = sourceRect.top + sourceRect.height / 2;
        const endX = targetRect.left - 9;
        const endY = targetRect.top + targetRect.height / 2;
        const bend = Math.max(42, Math.abs(endX - startX) * 0.42);
        return {
          id: note.id,
          color: note.color,
          d: `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`,
        };
      }).filter(Boolean);
      setPaths(nextPaths);
    };

    const frame = window.requestAnimationFrame(updatePaths);
    const delayed = window.setTimeout(updatePaths, 180);
    window.addEventListener("resize", updatePaths);
    window.addEventListener("scroll", updatePaths, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(delayed);
      window.removeEventListener("resize", updatePaths);
      window.removeEventListener("scroll", updatePaths, true);
    };
  }, [notes]);

  if (paths.length === 0) return null;
  return createPortal(
    <svg aria-hidden="true" width="100%" height="100%" viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`} style={{ position: "fixed", inset: 0, zIndex: 135, pointerEvents: "none", overflow: "visible" }}>
      <defs>
        {paths.map((path) => (
          <marker key={`marker-${path.id}`} id={`review-arrow-${path.id}`} markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 8 4 L 0 8 Z" fill={path.color} />
          </marker>
        ))}
      </defs>
      {paths.map((path) => (
        <path key={path.id} d={path.d} fill="none" stroke={path.color} strokeWidth="1.6" strokeLinecap="round" markerEnd={`url(#review-arrow-${path.id})`} opacity="0.88" />
      ))}
    </svg>,
    document.body
  );
}

export default function ReviewPanel({
  open,
  isReviewing,
  progress,
  graph = [],
  notes = [],
  frameworkSummary = "",
  activeGraphId = null,
  graphBlinkOn = false,
  results,
  onAccept,
  onReject,
  onClose,
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  if (!open) return null;

  const actionableResults = results.filter((item) => item.suggestedText !== item.originalText);

  return (
    <aside
      aria-label="模块审阅意见"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 140,
        width: "100%",
        height: "100vh",
        minWidth: 0,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
        overflowY: "auto",
        border: 0,
        borderLeft: "1px solid rgba(17,24,39,0.10)",
        borderRadius: 0,
        background: "rgba(255,255,255,0.97)",
        boxShadow: "-8px 0 28px rgba(15,23,42,0.08)",
        backdropFilter: "blur(12px)",
      }}
    >
      <header style={{ position: "sticky", top: 0, zIndex: 5, padding: "18px 18px 14px", borderBottom: "1px solid #edf0f4", background: "rgba(255,255,255,0.97)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "#111827", fontSize: 16, fontWeight: 700 }}>整体论证审阅</div>
            <div style={{ marginTop: 4, color: "#6b7280", fontSize: 12 }}>
              {isReviewing
                ? progress.total > 0
                  ? `正在实时分析模块 · 已完成 ${progress.current} 个`
                  : "正在通读所选模块"
                : `共分析 ${progress.total} 个模块`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭审阅面板"
            style={{ border: 0, background: "transparent", color: "#6b7280", fontSize: 22, cursor: "pointer" }}
          >
            ×
          </button>
        </div>
        <div style={{ height: 4, marginTop: 14, overflow: "hidden", borderRadius: 999, background: "#eef2f7" }}>
          <div
            style={{
              width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
              height: "100%",
              borderRadius: 999,
              background: "#4f7fd8",
              transition: "width 280ms ease",
            }}
          />
        </div>
      </header>

      <ModuleNoteConnectors notes={notes} />

      {notes.length > 0 && (
        <section style={{ padding: "14px 14px 12px", borderBottom: "1px solid #edf0f4", background: "#fafbfc" }}>
          <div style={{ marginBottom: 10, color: "#374151", fontSize: 12, fontWeight: 700 }}>
            {isReviewing ? "正在实时梳理论证过程" : "论证过程"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {notes.map((note, index) => (
              <article
                key={note.id}
                data-review-note-id={note.id}
                style={{
                  position: "relative",
                  zIndex: 3,
                  padding: "12px 13px 12px 15px",
                  border: `1.5px solid ${note.color}`,
                  borderRadius: 12,
                  background: note.fill,
                  boxShadow: "0 5px 16px rgba(15,23,42,0.07)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 20, height: 20, padding: "0 6px", borderRadius: 999, background: note.color, color: "#fff", fontSize: 10, fontWeight: 800 }}>
                    {index + 1}
                  </span>
                  <span style={{ color: note.color, fontSize: 11, fontWeight: 800 }}>{note.type}</span>
                </div>
                <div style={{ color: "#374151", fontSize: 12, lineHeight: 1.72 }}>{note.text}</div>
              </article>
            ))}
          </div>
          {frameworkSummary && (
            <div style={{ marginTop: 16, padding: "11px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: "#4b5563", fontSize: 12, lineHeight: 1.75 }}>
              <div style={{ marginBottom: 5, color: "#374151", fontSize: 11, fontWeight: 800 }}>整体判断</div>
              {frameworkSummary}
            </div>
          )}
        </section>
      )}

      <div style={{ flex: "0 0 auto", overflow: "visible", padding: 14 }}>
        {isReviewing && notes.length === 0 && results.length === 0 && (
          <div style={{ padding: "32px 18px", color: "#6b7280", fontSize: 13, lineHeight: 1.7, textAlign: "center" }}>
            正在读取所选模块并分析它们之间的论证关系…
          </div>
        )}

        {!isReviewing && progress.total === 0 && results.length === 0 && (
          <div style={{ padding: "32px 18px", color: "#6b7280", fontSize: 13, lineHeight: 1.7, textAlign: "center" }}>
            所选模块中没有可审阅的明确论证关系。请同时选择论点，以及对应的原因、证据、反论、对比或结论模块。
          </div>
        )}

        {notes.length > 0 && (
          <button
            type="button"
            onClick={() => setDetailsOpen((value) => !value)}
            aria-expanded={detailsOpen}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "13px 14px",
              border: "1px solid #dfe5ee",
              borderRadius: 11,
              background: "#fff",
              color: "#374151",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <span>{isReviewing ? "整体判断完成后显示加强点" : `发现 ${actionableResults.length} 个可加强点`}</span>
            <span aria-hidden="true" style={{ color: "#718096", transform: detailsOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 180ms ease" }}>⌄</span>
          </button>
        )}

        {detailsOpen && actionableResults.map((item) => (
          <article
            key={item.id}
            style={{ marginTop: 10, padding: 12, border: "1px solid #e6eaf0", borderRadius: 10, background: "#fff" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "#315ea8", fontSize: 12, fontWeight: 700 }}>
                {item.relationLabel.split(" → ")[0]}
                <span aria-hidden="true" style={{ color: "#7c9bd3", fontSize: 16 }}>→</span>
                {item.relationLabel.split(" → ")[1]}
              </span>
            </div>
            <div style={{ marginTop: 7, color: "#4b5563", fontSize: 12, lineHeight: 1.6 }}>{item.summary || item.comment}</div>

            {!item.decision && (
              <div style={{ marginTop: 8, color: "#92400e", fontSize: 12, lineHeight: 1.6 }}>
                {item.suggestion || "这部分内容可以进一步加强。"}
              </div>
            )}

            {item.suggestedText !== item.originalText && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "#f5f7fb", color: "#374151", fontSize: 12, lineHeight: 1.65 }}>
                <div style={{ marginBottom: 4, color: "#64748b", fontSize: 11, fontWeight: 700 }}>
                  {item.decision === "accepted" ? "加强后的结果" : "建议加强为"}
                </div>
                {item.suggestedText}
              </div>
            )}

            {item.decision ? (
              <div style={{ marginTop: 11, color: item.decision === "accepted" ? "#287a55" : "#6b7280", fontSize: 12, fontWeight: 600 }}>
                {item.decision === "accepted" ? "✓ 已加强" : "已拒绝，本条保持原文"}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => onAccept(item)}
                  style={{ ...actionButton, flex: 1, border: 0, background: "#315ea8", color: "#fff" }}
                >
                  加强
                </button>
                <button type="button" onClick={() => onReject(item)} style={{ ...actionButton, border: "1px solid #d7dce3", background: "#fff", color: "#4b5563" }}>
                  拒绝
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </aside>
  );
}
