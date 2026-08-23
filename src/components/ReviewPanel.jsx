import { useState } from "react";

const actionButton = {
  height: 32,
  padding: "0 14px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

function relationVerb(criterion) {
  if (criterion.includes("解释")) return "解释";
  if (criterion.includes("支持")) return "支持";
  if (criterion.includes("回应")) return "回应";
  if (criterion.includes("阐明")) return "阐明";
  if (criterion.includes("总结")) return "总结";
  return "关联";
}

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
        padding: "7px 9px",
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
      <div style={{ marginTop: 3, overflow: "hidden", color: "#4b5563", fontSize: 10, lineHeight: 1.4, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
            <div style={{ width: 142, margin: "0 auto" }}>
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
                    {relationVerb(child.criterion)} ↑
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

function argumentSummary(edges, enhancementCount, isReviewing) {
  const sourceTypes = new Set(edges.map((edge) => edge.sourceType));
  const targetTypes = new Set(edges.map((edge) => edge.targetType));
  const steps = [];

  if (targetTypes.has("论点")) steps.push("你先写了论点");
  if (sourceTypes.has("原因")) steps.push("再用原因解释论点");
  if (sourceTypes.has("证据")) steps.push("并用证据支持论点");
  if (sourceTypes.has("反论")) steps.push("随后用反论回应论点");
  if (sourceTypes.has("对比")) steps.push("再通过对比阐明论点");
  if (sourceTypes.has("结论")) steps.push("最后用结论总结全文");

  const processText = steps.length > 0 ? `${steps.join("，")}。` : "正在识别文章的论证结构。";
  if (isReviewing) return `${processText}系统正在继续检查可以加强的关系。`;
  return `${processText}总体结构已经形成，发现 ${enhancementCount} 处关系可以进一步加强。`;
}

export default function ReviewPanel({
  open,
  isReviewing,
  progress,
  graph = [],
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
        zIndex: 40,
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
            <div style={{ color: "#111827", fontSize: 16, fontWeight: 700 }}>模块匹配度审阅</div>
            <div style={{ marginTop: 4, color: "#6b7280", fontSize: 12 }}>
              {isReviewing ? `正在检查 ${progress.current}/${progress.total}` : `共检查 ${progress.total} 组关系`}
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

      {graph.length > 0 && (
        <section style={{ padding: "14px 14px 12px", borderBottom: "1px solid #edf0f4", background: "#fafbfc" }}>
          <div style={{ marginBottom: 10, color: "#374151", fontSize: 12, fontWeight: 700 }}>论证逻辑图</div>
          <LogicTree edges={graph} activeEdgeId={activeGraphId} blinkOn={graphBlinkOn} />
          <div style={{ marginTop: 14, padding: "10px 11px", borderRadius: 9, background: "#fff", color: "#4b5563", fontSize: 12, lineHeight: 1.65 }}>
            {argumentSummary(graph, actionableResults.length, isReviewing)}
          </div>
        </section>
      )}

      <div style={{ flex: "0 0 auto", overflow: "visible", padding: 14 }}>
        {isReviewing && results.length === 0 && (
          <div style={{ padding: "32px 18px", color: "#6b7280", fontSize: 13, lineHeight: 1.7, textAlign: "center" }}>
            正在读取所选模块并分析它们之间的论证关系…
          </div>
        )}

        {!isReviewing && progress.total === 0 && results.length === 0 && (
          <div style={{ padding: "32px 18px", color: "#6b7280", fontSize: 13, lineHeight: 1.7, textAlign: "center" }}>
            所选模块中没有可审阅的明确论证关系。请同时选择论点，以及对应的原因、证据、反论、对比或结论模块。
          </div>
        )}

        {graph.length > 0 && (
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
            <span>发现 {actionableResults.length} 个潜在可以增强的点</span>
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

            {item.suggestedText !== item.originalText && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "#f5f7fb", color: "#374151", fontSize: 12, lineHeight: 1.65 }}>
                <div style={{ marginBottom: 4, color: "#64748b", fontSize: 11, fontWeight: 700 }}>可加强部分</div>
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
