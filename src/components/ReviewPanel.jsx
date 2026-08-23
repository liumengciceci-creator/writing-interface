import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import FloatingPaletteWindow from "./FloatingPaletteWindow.jsx";

const actionButton = {
  height: 32,
  padding: "0 14px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

function ModuleNoteConnectors({ notes }) {
  const [paths, setPaths] = useState([]);

  useEffect(() => {
    const updatePaths = () => {
      const blockElements = Array.from(
        document.querySelectorAll("[data-semantic-block-id], [data-block-id]")
      );
      const noteElements = Array.from(document.querySelectorAll("[data-review-note-id]"));

      const nextPaths = notes
        .map((note) => {
          const source = blockElements.find(
            (element) =>
              String(
                element.getAttribute("data-semantic-block-id") ||
                  element.getAttribute("data-block-id")
              ) === String(note.blockId)
          );
          const target = noteElements.find(
            (element) => element.getAttribute("data-review-note-id") === String(note.id)
          );

          if (!source || !target) return null;

          const sourceRect = source.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          if (!sourceRect.width || !sourceRect.height || !targetRect.width || !targetRect.height) {
            return null;
          }

          const startX = sourceRect.right + 4;
          const startY = sourceRect.top + sourceRect.height / 2;
          const endX = targetRect.left - 8;
          const endY = targetRect.top + targetRect.height / 2;
          const availableWidth = endX - startX;
          const elbowX =
            availableWidth > 40
              ? startX + availableWidth * 0.58
              : Math.max(startX + 18, endX - 18);

          return {
            id: note.id,
            color: note.color,
            d: `M ${startX} ${startY} H ${elbowX} V ${endY} H ${endX}`,
          };
        })
        .filter(Boolean);

      setPaths(nextPaths);
    };

    const frame = window.requestAnimationFrame(updatePaths);
    const delayed = window.setTimeout(updatePaths, 160);
    window.addEventListener("resize", updatePaths);
    window.addEventListener("scroll", updatePaths, { capture: true, passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(delayed);
      window.removeEventListener("resize", updatePaths);
      window.removeEventListener("scroll", updatePaths, true);
    };
  }, [notes]);

  if (paths.length === 0) return null;

  return createPortal(
    <svg
      aria-hidden="true"
      width="100%"
      height="100%"
      viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 135,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      <defs>
        {paths.map((path) => (
          <marker
            key={`marker-${path.id}`}
            id={`review-arrow-${path.id}`}
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 7 3.5 L 0 7 Z" fill={path.color} />
          </marker>
        ))}
      </defs>

      {paths.map((path) => (
        <path
          key={path.id}
          d={path.d}
          fill="none"
          stroke={path.color}
          strokeWidth="1.35"
          strokeLinecap="square"
          strokeLinejoin="miter"
          markerEnd={`url(#review-arrow-${path.id})`}
          opacity="0.82"
        />
      ))}
    </svg>,
    document.body
  );
}

function EnhancementPalette({ items, onAccept, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const [width, setWidth] = useState(320);

  useEffect(() => {
    if (items.length > 0) setExpanded(true);
  }, [items.length]);

  if (items.length === 0) return null;

  const defaultX =
    typeof window === "undefined" ? 184 : Math.max(184, window.innerWidth - width - 22);

  return (
    <FloatingPaletteWindow
      storageKey="writing-interface-review-enhancement-position"
      defaultPosition={{ x: defaultX, y: 28 }}
      width={width}
      onWidthChange={setWidth}
    >
      <section
        aria-label="潜在增强点"
        style={{
          width: "100%",
          padding: 10,
          borderRadius: 14,
          background: "#f8f8f8",
          boxShadow: "0 3px 14px rgba(15,23,42,0.13)",
          boxSizing: "border-box",
        }}
      >
        <div
          data-palette-drag-handle="true"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            minHeight: 28,
            cursor: "grab",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ color: "#555", fontSize: 11, fontWeight: 700 }}>潜在增强点</span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 18,
                height: 18,
                padding: "0 5px",
                borderRadius: 999,
                background: "#e8edf5",
                color: "#52627a",
                fontSize: 10,
                fontWeight: 700,
                boxSizing: "border-box",
              }}
            >
              {items.length}
            </span>
          </div>

          <button
            type="button"
            aria-label={expanded ? "收起潜在增强点" : "展开潜在增强点"}
            onClick={() => setExpanded((value) => !value)}
            style={{
              width: 26,
              height: 26,
              padding: 0,
              border: "1px solid #d7d7d7",
              borderRadius: 7,
              background: "#fff",
              color: "#667085",
              cursor: "pointer",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 180ms ease",
              }}
            >
              ⌄
            </span>
          </button>
        </div>

        {expanded && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 9,
              maxHeight: "min(62vh, 520px)",
              marginTop: 9,
              overflowY: "auto",
              overscrollBehavior: "contain",
            }}
          >
            {items.map((item) => (
              <article
                key={item.id}
                style={{
                  padding: 11,
                  border: "1px solid #e2e6ec",
                  borderRadius: 10,
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    color: "#315ea8",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {item.relationLabel.split(" → ")[0]}
                  <span aria-hidden="true" style={{ color: "#8aa1c9", fontSize: 14 }}>
                    →
                  </span>
                  {item.relationLabel.split(" → ")[1]}
                </div>

                <div style={{ marginTop: 7, color: "#4b5563", fontSize: 12, lineHeight: 1.58 }}>
                  {item.summary || item.comment}
                </div>

                {!item.decision && (
                  <div style={{ marginTop: 7, color: "#92400e", fontSize: 12, lineHeight: 1.58 }}>
                    {item.suggestion || "这部分内容可以进一步加强。"}
                  </div>
                )}

                {item.suggestedText !== item.originalText && (
                  <div
                    style={{
                      marginTop: 9,
                      padding: 9,
                      borderRadius: 8,
                      background: "#f3f5f8",
                      color: "#374151",
                      fontSize: 12,
                      lineHeight: 1.62,
                    }}
                  >
                    <div style={{ marginBottom: 4, color: "#64748b", fontSize: 10.5, fontWeight: 700 }}>
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
                ) : (
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
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </FloatingPaletteWindow>
  );
}

export default function ReviewPanel({
  open,
  isReviewing,
  progress,
  notes = [],
  activeGraphId = null,
  graphBlinkOn = false,
  results = [],
  onAccept,
  onReject,
  onClose,
}) {
  const actionableResults = results.filter(
    (item) => item.suggestedText !== item.originalText
  );

  if (!open) return null;

  return (
    <>
      <aside
        aria-label="模块关系说明"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 140,
          width: "100%",
          height: "100vh",
          minWidth: 0,
          boxSizing: "border-box",
          overflowX: "hidden",
          overflowY: "auto",
          border: 0,
          background: "#e7e7e7",
        }}
      >
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: 44,
            padding: "8px 14px 7px 18px",
            background: "rgba(231,231,231,0.94)",
            backdropFilter: "blur(8px)",
            boxSizing: "border-box",
          }}
        >
          <span style={{ color: "#717784", fontSize: 11.5, fontWeight: 600 }}>
            {isReviewing
              ? progress.total > 0
                ? `正在识别模块关系 ${progress.current}/${progress.total}`
                : "正在识别模块关系"
              : `已识别 ${progress.total} 个模块`}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭模块关系说明"
            style={{
              width: 28,
              height: 28,
              padding: 0,
              border: 0,
              borderRadius: 7,
              background: "transparent",
              color: "#747b87",
              fontSize: 20,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <ModuleNoteConnectors notes={notes} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            padding: "18px 20px 36px",
          }}
        >
          {isReviewing && notes.length === 0 && (
            <div style={{ padding: "34px 14px", color: "#777e89", fontSize: 12, lineHeight: 1.7 }}>
              正在读取所选模块，关系说明会在识别后逐条显示。
            </div>
          )}

          {!isReviewing && progress.total === 0 && notes.length === 0 && (
            <div style={{ padding: "34px 14px", color: "#777e89", fontSize: 12, lineHeight: 1.7 }}>
              所选内容中暂未识别出明确的模块关系。
            </div>
          )}

          {notes.map((note) => {
            const active = activeGraphId === `note-${note.id}`;
            return (
              <article
                key={note.id}
                data-review-note-id={note.id}
                style={{
                  position: "relative",
                  zIndex: 3,
                  padding: "12px 13px",
                  border: `1px solid ${note.color}66`,
                  borderRadius: 10,
                  background: note.fill,
                  boxShadow:
                    active && graphBlinkOn
                      ? `0 0 0 3px ${note.color}2f`
                      : "0 1px 2px rgba(15,23,42,0.025)",
                  opacity: active && !graphBlinkOn ? 0.66 : 1,
                  transform: active && graphBlinkOn ? "translateX(-2px)" : "translateX(0)",
                  transition: "opacity 170ms ease, transform 170ms ease, box-shadow 170ms ease",
                }}
              >
                <div style={{ marginBottom: 6, color: note.color, fontSize: 10.5, fontWeight: 800 }}>
                  {note.type}
                </div>
                <div style={{ color: "#374151", fontSize: 12.5, lineHeight: 1.68 }}>
                  {note.text}
                </div>
              </article>
            );
          })}
        </div>
      </aside>

      <EnhancementPalette items={actionableResults} onAccept={onAccept} onReject={onReject} />
    </>
  );
}
