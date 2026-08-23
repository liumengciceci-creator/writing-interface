import { Fragment, useState } from "react";

const actionButton = {
  height: 30,
  padding: "0 13px",
  borderRadius: 7,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
};

function matchesPair(item, sourceId, targetId) {
  const itemSource = String(item.relationSourceId || "");
  const itemTarget = String(item.relationTargetId || "");
  const source = String(sourceId);
  const target = String(targetId);

  return (
    (itemSource === source && itemTarget === target) ||
    (itemSource === target && itemTarget === source)
  );
}

function EnhancementDetail({ items, onAccept, onReject }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        margin: "2px 0 10px",
      }}
    >
      {items.map((item) => (
        <article
          key={item.id}
          style={{
            padding: 11,
            border: "1px solid #e2c56f",
            borderRadius: 9,
            background: "#fffaf0",
            boxShadow: "0 3px 10px rgba(92,70,16,0.08)",
          }}
        >
          <div style={{ color: "#80621b", fontSize: 10.5, fontWeight: 800 }}>
            潜在增强点
          </div>

          <div style={{ marginTop: 6, color: "#4b5563", fontSize: 11.5, lineHeight: 1.55 }}>
            {item.summary || item.comment}
          </div>

          {!item.decision && (
            <div style={{ marginTop: 6, color: "#92400e", fontSize: 11.5, lineHeight: 1.55 }}>
              {item.suggestion || "这部分内容可以进一步加强。"}
            </div>
          )}

          {item.suggestedText !== item.originalText && (
            <div
              style={{
                marginTop: 8,
                padding: 8,
                borderRadius: 7,
                background: "rgba(255,255,255,0.82)",
                color: "#374151",
                fontSize: 11.5,
                lineHeight: 1.58,
              }}
            >
              <div style={{ marginBottom: 3, color: "#80621b", fontSize: 10, fontWeight: 700 }}>
                {item.decision === "accepted" ? "加强后的结果" : "建议加强为"}
              </div>
              {item.suggestedText}
            </div>
          )}

          {item.decision ? (
            <div
              style={{
                marginTop: 9,
                color: item.decision === "accepted" ? "#287a55" : "#6b7280",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {item.decision === "accepted" ? "✓ 已加强" : "已拒绝，本条保持原文"}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
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
  );
}

function RelationStep({ relation, enhancements, enhancementNumber, expanded, onToggle, onAccept, onReject }) {
  const hasEnhancement = enhancements.length > 0;

  return (
    <div>
      <div
        style={{
          position: "relative",
          height: 48,
          minHeight: 48,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: 1.5,
            height: 39,
            transform: "translateX(-50%)",
            background: relation?.color || "#9aa3af",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            top: 35,
            width: 0,
            height: 0,
            transform: "translateX(-50%)",
            borderLeft: "4px solid transparent",
            borderRight: "4px solid transparent",
            borderTop: `6px solid ${relation?.color || "#9aa3af"}`,
          }}
        />

        {hasEnhancement && (
          <button
            type="button"
            aria-label={`查看第 ${enhancementNumber} 个潜在增强点`}
            aria-expanded={expanded}
            onClick={onToggle}
            style={{
              position: "absolute",
              left: "50%",
              top: 11,
              zIndex: 2,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 22,
              height: 22,
              padding: 0,
              transform: "translateX(-50%)",
              border: "2px solid #e7e7e7",
              borderRadius: "50%",
              background: expanded ? "#c89213" : "#dda919",
              color: "#fff",
              fontSize: 10.5,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(128,98,27,0.22)",
            }}
          >
            {enhancementNumber}
          </button>
        )}

        <div
          style={{
            position: "absolute",
            left: "calc(50% + 17px)",
            right: 4,
            top: 12,
            overflow: "hidden",
            color: relation?.color || "#747b87",
            fontSize: 10.5,
            fontWeight: 700,
            lineHeight: "22px",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {relation?.relation || "正在判断关系…"}
        </div>
      </div>

      {expanded && (
        <EnhancementDetail items={enhancements} onAccept={onAccept} onReject={onReject} />
      )}
    </div>
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
}) {
  const [expandedEnhancementId, setExpandedEnhancementId] = useState(null);
  const actionableResults = results.filter(
    (item) => item.suggestedText !== item.originalText
  );

  if (!open) return null;

  const noteIndexById = new Map(
    notes.map((note, index) => [String(note.id), index])
  );
  const unassignedEnhancements = new Map();

  actionableResults.forEach((item, index) => {
    const sourceIndex = noteIndexById.get(String(item.relationSourceId));
    const targetIndex = noteIndexById.get(String(item.relationTargetId));
    const gapIndex =
      Number.isInteger(sourceIndex) && Number.isInteger(targetIndex)
        ? Math.min(sourceIndex, targetIndex)
        : Math.max(0, notes.length - 2);

    if (!unassignedEnhancements.has(gapIndex)) {
      unassignedEnhancements.set(gapIndex, []);
    }
    unassignedEnhancements.get(gapIndex).push({ item, number: index + 1 });
  });

  return (
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
          onClick={onClose}
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

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "19px 20px 34px",
        }}
      >
        {isReviewing && notes.length === 0 && (
          <div style={{ padding: "30px 12px", color: "#777e89", fontSize: 12, lineHeight: 1.65 }}>
            正在读取所选模块，识别结果会依次显示在这里。
          </div>
        )}

        {!isReviewing && progress.total === 0 && notes.length === 0 && (
          <div style={{ padding: "30px 12px", color: "#777e89", fontSize: 12, lineHeight: 1.65 }}>
            所选内容中暂未识别出明确的模块关系。
          </div>
        )}

        {notes.map((note, index) => {
          const nextNote = notes[index + 1];
          const active = activeGraphId === `note-${note.id}`;
          const relation = nextNote
            ? graph.find(
                (item) =>
                  (String(item.sourceId) === String(note.id) &&
                    String(item.targetId) === String(nextNote.id)) ||
                  (String(item.sourceId) === String(nextNote.id) &&
                    String(item.targetId) === String(note.id))
              )
            : null;
          const gapEnhancementEntries = unassignedEnhancements.get(index) || [];
          const exactPairEnhancements = nextNote
            ? gapEnhancementEntries.filter(({ item }) =>
                matchesPair(item, note.id, nextNote.id)
              )
            : [];
          const enhancementEntries =
            exactPairEnhancements.length > 0
              ? exactPairEnhancements
              : gapEnhancementEntries;
          const enhancementItems = enhancementEntries.map(({ item }) => item);
          const firstEnhancement = enhancementEntries[0];
          const expanded =
            firstEnhancement && expandedEnhancementId === firstEnhancement.item.id;

          return (
            <Fragment key={note.id}>
              <article
                style={{
                  position: "relative",
                  zIndex: 3,
                  padding: "14px 12px 10px",
                  border: `1px solid ${note.color}72`,
                  borderRadius: 9,
                  background: note.fill,
                  boxShadow:
                    active && graphBlinkOn
                      ? `0 0 0 3px ${note.color}2f`
                      : "0 1px 2px rgba(15,23,42,0.025)",
                  opacity: active && !graphBlinkOn ? 0.66 : 1,
                  transform: active && graphBlinkOn ? "translateY(-1px)" : "translateY(0)",
                  transition: "opacity 170ms ease, transform 170ms ease, box-shadow 170ms ease",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 11,
                    top: -9,
                    display: "inline-flex",
                    alignItems: "center",
                    minHeight: 18,
                    padding: "0 7px",
                    borderRadius: 4,
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
                <div style={{ color: "#374151", fontSize: 12, lineHeight: 1.52 }}>
                  {note.text}
                </div>
              </article>

              {nextNote && (
                <RelationStep
                  relation={relation}
                  enhancements={enhancementItems}
                  enhancementNumber={firstEnhancement?.number}
                  expanded={Boolean(expanded)}
                  onToggle={() =>
                    setExpandedEnhancementId((current) =>
                      current === firstEnhancement?.item.id
                        ? null
                        : firstEnhancement?.item.id || null
                    )
                  }
                  onAccept={onAccept}
                  onReject={onReject}
                />
              )}
            </Fragment>
          );
        })}
      </div>
    </aside>
  );
}
