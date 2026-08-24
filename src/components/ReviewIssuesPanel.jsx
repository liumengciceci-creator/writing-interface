import {
  useCallback,
  useEffect,
  useState,
} from "react";

const panelButton = {
  height: 30,
  padding: "0 12px",
  borderRadius: 7,
  fontSize: 10.8,
  fontWeight: 700,
  cursor: "pointer",
};

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderSummaryWithHighlights(summary, highlights = []) {
  const text = String(summary || "").trim();
  if (!text) return null;

  const validHighlights = Array.from(
    new Set(
      (Array.isArray(highlights) ? highlights : [])
        .map((value) => String(value || "").trim())
        .filter((value) => value && text.includes(value))
    )
  ).sort((first, second) => second.length - first.length);

  if (!validHighlights.length) return text;

  const highlightSet = new Set(validHighlights);
  const pattern = new RegExp(
    `(${validHighlights.map(escapeRegExp).join("|")})`,
    "g"
  );

  return text.split(pattern).map((part, index) =>
    highlightSet.has(part) ? (
      <strong key={`${part}-${index}`} style={{ color: "#1f2937", fontWeight: 800 }}>
        {part}
      </strong>
    ) : (
      part
    )
  );
}

export default function ReviewIssuesPanel({
  open,
  results = [],
  overallSummary = "",
  summaryHighlights = [],
  onFocusIssue,
  onAccept,
  onReject,
  onClose,
}) {
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState("");

  const closeIssue = useCallback(() => {
    setSelectedIssueId(null);
    setApplyLoading(false);
    setApplyError("");
    onFocusIssue?.(null);
  }, [onFocusIssue]);

  const handleSelectIssue = (item) => {
    if (selectedIssueId === item.id) {
      closeIssue();
      return;
    }

    setSelectedIssueId(item.id);
    setApplyLoading(false);
    setApplyError("");
    onFocusIssue?.(item);
  };

  useEffect(() => {
    if (!selectedIssueId) return;
    if (results.some((item) => item.id === selectedIssueId && !item.decision)) return;
    closeIssue();
  }, [closeIssue, results, selectedIssueId]);

  if (!open) return null;

  const pendingResults = results.filter((item) => !item.decision);
  const selectedItem = pendingResults.find((item) => item.id === selectedIssueId) || null;
  const accentColor = selectedItem?.sourceBlock?.color || "#d6a31a";
  const accentFill = selectedItem?.sourceBlock?.fill || "#fff8e7";
  const modificationInstruction = String(
    selectedItem?.modificationInstruction || selectedItem?.suggestion || ""
  ).trim();

  return (
    <aside
      className="review-issues-panel"
      aria-label="潜在修改点"
      style={{
        zIndex: 2000,
        height: "auto",
        minHeight: 0,
        overflowY: "auto",
        padding: "0 0 20px",
        background: "transparent",
        boxSizing: "border-box",
        isolation: "isolate",
      }}
    >
      <section
        style={{
          border: "1px solid rgba(17,24,39,0.10)",
          borderRadius: 13,
          background: "rgba(255,255,255,0.92)",
          boxShadow: "0 7px 22px rgba(15,23,42,0.09)",
          overflow: "visible",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
            padding: "14px 12px 11px 14px",
            borderBottom: "1px solid rgba(17,24,39,0.08)",
          }}
        >
          <div>
            <div style={{ color: "#1f2937", fontSize: 13, fontWeight: 800 }}>
              {overallSummary ? "整体关系判断" : "本轮审阅结果"}
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭审阅结果"
            onClick={() => {
              closeIssue();
              onClose?.();
            }}
            style={{
              width: 26,
              height: 26,
              padding: 0,
              border: 0,
              borderRadius: 7,
              background: "transparent",
              color: "#6b7280",
              fontSize: 19,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </header>

        {overallSummary ? (
          <div
            aria-label="整体论证关系总结"
            style={{
              margin: "12px 14px 0",
              padding: "11px 12px",
              borderRadius: 9,
              background: "#f5f6f8",
              color: "#596171",
              fontSize: 11.2,
              lineHeight: 1.72,
            }}
          >
            {renderSummaryWithHighlights(overallSummary, summaryHighlights)}
          </div>
        ) : null}

        <div
          style={{
            padding: "13px 14px 0",
          }}
        >
          <div style={{ color: "#1f2937", fontSize: 12, fontWeight: 800 }}>
            {pendingResults.length > 0
              ? `发现 ${pendingResults.length} 处潜在修改点`
              : "本轮审阅已完成"}
          </div>
          {pendingResults.length > 0 ? (
            <div style={{ marginTop: 4, color: "#7b8190", fontSize: 10.5, lineHeight: 1.45 }}>
              选择圆点，查看对应模块关系
            </div>
          ) : null}
        </div>

        {pendingResults.length === 0 ? (
          <div style={{ padding: "18px 14px", color: "#6b7280", fontSize: 11.5, lineHeight: 1.6 }}>
            暂未发现需要立即修改的内容关系。
          </div>
        ) : (
          <div
            role="list"
            aria-label="潜在修改点编号"
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
              padding: "14px",
            }}
          >
            {pendingResults.map((item, index) => {
              const selected = item.id === selectedIssueId;
              const itemColor = item.sourceBlock?.color || "#d6a31a";

              return (
                <button
                  key={item.id}
                  type="button"
                  role="listitem"
                  aria-label={`查看第 ${index + 1} 处潜在修改点`}
                  aria-pressed={selected}
                  title={item.summary || item.category || `修改点 ${index + 1}`}
                  onClick={() => handleSelectIssue(item)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 34,
                    height: 34,
                    padding: 0,
                    border: selected ? `2px solid ${itemColor}` : "2px solid #fff",
                    borderRadius: "50%",
                    background: itemColor,
                    boxShadow: selected
                      ? `0 0 0 3px color-mix(in srgb, ${itemColor} 22%, transparent)`
                      : "0 2px 7px rgba(15,23,42,0.15)",
                    color: "#fff",
                    fontSize: 11.5,
                    fontWeight: 800,
                    cursor: "pointer",
                    transform: selected ? "scale(1.08)" : "scale(1)",
                    transition: "transform 160ms ease, box-shadow 160ms ease",
                  }}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selectedItem ? (
        <article
          aria-live="polite"
          aria-busy={applyLoading}
          data-review-suggestion-for={selectedItem.id}
          style={{
            position: "relative",
            marginTop: 22,
            padding: "21px 13px 13px",
            border: `1.5px solid ${accentColor}`,
            borderRadius: 11,
            background: accentFill,
            boxShadow: "0 7px 18px rgba(15,23,42,0.08)",
            color: "#374151",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: -10,
              left: 11,
              display: "inline-flex",
              alignItems: "center",
              minHeight: 20,
              padding: "0 8px",
              borderRadius: 5,
              background: accentColor,
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              boxShadow: "0 2px 5px rgba(15,23,42,0.10)",
            }}
          >
            {selectedItem.sourceBlock?.label || selectedItem.sourceBlock?.type || "模块"}修改指令
          </span>

          <div
            style={{
              minHeight: 58,
              fontSize: 11.4,
              lineHeight: 1.68,
              whiteSpace: "pre-wrap",
            }}
          >
            {modificationInstruction}
          </div>

          {applyError ? (
            <div style={{ marginTop: 7, color: "#b42318", fontSize: 10.8, lineHeight: 1.5 }}>
              {applyError}
            </div>
          ) : null}

          {modificationInstruction ? (
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <button
                type="button"
                disabled={applyLoading}
                onClick={async () => {
                  setApplyLoading(true);
                  setApplyError("");
                  try {
                    await onAccept?.(selectedItem);
                    closeIssue();
                  } catch (error) {
                    setApplyLoading(false);
                    setApplyError(error?.message || "按照指令修改失败，请重试");
                  }
                }}
                style={{
                  ...panelButton,
                  flex: 1,
                  border: 0,
                  background: accentColor,
                  color: "#fff",
                  cursor: applyLoading ? "wait" : "pointer",
                  opacity: applyLoading ? 0.7 : 1,
                }}
              >
                {applyLoading ? "正在按指令修改…" : "按此指令修改"}
              </button>
              <button
                type="button"
                disabled={applyLoading}
                onClick={() => {
                  onReject(selectedItem);
                  closeIssue();
                }}
                style={{
                  ...panelButton,
                  flex: "0 0 auto",
                  border: "1px solid rgba(17,24,39,0.14)",
                  background: "rgba(255,255,255,0.76)",
                  color: "#4b5563",
                  opacity: applyLoading ? 0.55 : 1,
                }}
              >
                暂不修改
              </button>
            </div>
          ) : null}
        </article>
      ) : null}
    </aside>
  );
}
