const actionButton = {
  height: 32,
  padding: "0 14px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

export default function ReviewPanel({
  open,
  isReviewing,
  progress,
  results,
  onAccept,
  onReject,
  onClose,
}) {
  if (!open) return null;

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
        overflow: "hidden",
        border: 0,
        borderLeft: "1px solid rgba(17,24,39,0.10)",
        borderRadius: 0,
        background: "rgba(255,255,255,0.97)",
        boxShadow: "-8px 0 28px rgba(15,23,42,0.08)",
        backdropFilter: "blur(12px)",
      }}
    >
      <header style={{ padding: "18px 18px 14px", borderBottom: "1px solid #edf0f4" }}>
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

      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
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

        {results.map((item) => (
          <article
            key={item.id}
            style={{ marginBottom: 12, padding: 14, border: "1px solid #e6eaf0", borderRadius: 12, background: "#fff" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "#315ea8", fontSize: 12, fontWeight: 700 }}>
                {item.relationLabel.split(" → ")[0]}
                <span aria-hidden="true" style={{ color: "#7c9bd3", fontSize: 16 }}>→</span>
                {item.relationLabel.split(" → ")[1]}
              </span>
              <span style={{ color: item.score >= 80 ? "#287a55" : "#a16207", fontSize: 11, fontWeight: 700 }}>
                匹配度 {item.score}%
              </span>
            </div>
            <div style={{ marginTop: 9, color: "#64748b", fontSize: 11, fontWeight: 600 }}>{item.criterion}</div>
            <div style={{ marginTop: 5, color: "#1f2937", fontSize: 14, fontWeight: 700 }}>{item.title}</div>
            <div style={{ marginTop: 7, color: "#4b5563", fontSize: 12, lineHeight: 1.65 }}>{item.comment}</div>

            {item.suggestedText !== item.originalText && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "#f5f7fb", color: "#374151", fontSize: 12, lineHeight: 1.65 }}>
                <div style={{ marginBottom: 4, color: "#64748b", fontSize: 11, fontWeight: 700 }}>建议修改</div>
                {item.suggestedText}
              </div>
            )}

            {item.decision ? (
              <div style={{ marginTop: 11, color: item.decision === "accepted" ? "#287a55" : "#6b7280", fontSize: 12, fontWeight: 600 }}>
                {item.decision === "accepted" ? "✓ 已接受修改" : "已拒绝，本条保持原文"}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => onAccept(item)}
                  disabled={item.suggestedText === item.originalText}
                  style={{ ...actionButton, flex: 1, border: 0, background: item.suggestedText === item.originalText ? "#e5e7eb" : "#315ea8", color: item.suggestedText === item.originalText ? "#9ca3af" : "#fff", cursor: item.suggestedText === item.originalText ? "default" : "pointer" }}
                >
                  接受修改
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
