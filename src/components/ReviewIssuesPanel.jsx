import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useI18n } from "../i18n.jsx";

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

function renderSuggestionPoints(value) {
  const text = String(value || "").trim();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const bulletLines = lines.filter((line) => /^[•·*-]\s*/.test(line));

  if (bulletLines.length < 2) return text;

  return (
    <ul
      style={{
        margin: 0,
        paddingLeft: 18,
        display: "grid",
        gap: 8,
      }}
    >
      {bulletLines.map((line, index) => (
        <li key={`${index}-${line.slice(0, 20)}`}>
          {line.replace(/^[•·*-]\s*/, "")}
        </li>
      ))}
    </ul>
  );
}

export default function ReviewIssuesPanel({
  open,
  results = [],
  criteria = [],
  phase = "idle",
  overallSummary = "",
  summaryHighlights = [],
  onFocusIssue,
  onAccept,
  onReject,
  onClose,
}) {
  const { blockTypeLabel, t } = useI18n();
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState("");
  const criteriaListRef = useRef(null);

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

  useEffect(() => {
    const list = criteriaListRef.current;
    if (!list || criteria.length === 0) return;
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [criteria.length]);

  if (!open) return null;

  const pendingResults = results.filter((item) => !item.decision);
  const selectedItem = pendingResults.find((item) => item.id === selectedIssueId) || null;
  const accentSource = selectedItem?.action === "insert"
    ? selectedItem?.suggestedModule
    : selectedItem?.sourceBlock;
  const accentColor = accentSource?.color || "#d6a31a";
  const accentFill = accentSource?.fill || "#fff8e7";
  const modificationInstruction = String(
    selectedItem?.modificationInstruction || selectedItem?.suggestion || ""
  ).trim();

  return (
    <aside
      className="review-issues-panel"
      aria-label={t("review.issueNumbers")}
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
              {overallSummary || phase === "summary" ? t("review.overall") : t("review.result")}
            </div>
          </div>
          <button
            type="button"
            aria-label={t("review.close")}
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
            aria-label={t("review.summary")}
            style={{
              margin: "12px 14px 0",
              padding: "11px 12px",
              borderRadius: 9,
              background: "#f5f6f8",
              color: "#596171",
              fontSize: 11.2,
              lineHeight: 1.72,
              whiteSpace: "pre-wrap",
            }}
          >
            {renderSummaryWithHighlights(overallSummary, summaryHighlights)}
          </div>
        ) : null}

        {phase !== "summary" ? <>
        <div style={{ padding: "14px 14px 7px" }}>
          <div style={{ color: "#1f2937", fontSize: 12, fontWeight: 800 }}>
            {t("review.criteriaHeading")}
          </div>
        </div>

        {criteria.length === 0 ? (
          <div
            aria-live="polite"
            style={{ padding: "8px 14px 18px", color: "#7b8190", fontSize: 11, lineHeight: 1.6 }}
          >
            {t("review.waitingResults")}
          </div>
        ) : (
          <div
            ref={criteriaListRef}
            role="list"
            aria-label={t("review.criteriaHeading")}
            style={{
              display: "grid",
              gap: 0,
              padding: "0 14px 14px",
              maxHeight: 300,
              overflowY: "auto",
              scrollBehavior: "smooth",
            }}
          >
            {criteria.map((criterion, index) => {
              const issueItem = criterion.issueId
                ? results.find((item) => item.id === criterion.issueId)
                : null;
              const selected = Boolean(issueItem && issueItem.id === selectedIssueId);
              const itemColor = issueItem?.action === "insert"
                ? issueItem?.suggestedModule?.color || "#d6a31a"
                : issueItem?.sourceBlock?.color || "#d6a31a";
              const accepted = issueItem?.decision === "accepted";
              const rejected = issueItem?.decision === "rejected";

              return (
                <div
                  key={`${criterion.key}-${index}`}
                  role="listitem"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) 26px",
                    alignItems: "start",
                    gap: 9,
                    padding: "10px 0",
                    borderTop: index === 0 ? "1px solid rgba(17,24,39,0.08)" : "1px solid rgba(17,24,39,0.07)",
                  }}
                >
                  <div style={{ color: "#4b5563", fontSize: 11.1, lineHeight: 1.65 }}>
                    {criterion.summary}
                  </div>

                  {!issueItem || accepted ? (
                    <span
                      aria-label={t("review.passed")}
                      title={t("review.passed")}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 23,
                        height: 23,
                        color: "#2f8f63",
                        fontSize: 16,
                        fontWeight: 900,
                      }}
                    >
                      ✓
                    </span>
                  ) : rejected ? (
                    <span
                      aria-label={t("review.skipped")}
                      title={t("review.skipped")}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 23,
                        height: 23,
                        color: "#9ca3af",
                        fontSize: 15,
                      }}
                    >
                      —
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label={t("review.viewIssue", { count: index + 1 })}
                      aria-pressed={selected}
                      title={issueItem.summary || issueItem.category || t("review.issue", { count: index + 1 })}
                      onClick={() => handleSelectIssue(issueItem)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 22,
                        height: 22,
                        padding: 0,
                        border: `2px solid ${itemColor}`,
                        borderRadius: "50%",
                        background: selected ? itemColor : "#fff",
                        boxShadow: selected
                          ? `0 0 0 3px color-mix(in srgb, ${itemColor} 20%, transparent)`
                          : "0 1px 4px rgba(15,23,42,0.10)",
                        cursor: "pointer",
                        transition: "background 150ms ease, box-shadow 150ms ease",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        </> : null}
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
            {selectedItem.action === "insert"
              ? t("review.insertInstruction", {
                  label: selectedItem.suggestedModule?.label ||
                    blockTypeLabel(selectedItem.insertType, selectedItem.insertType),
                })
              : t("review.instruction", {
                  label: blockTypeLabel(
                    selectedItem.sourceBlock?.type,
                    selectedItem.sourceBlock?.label || selectedItem.sourceBlock?.type
                  ),
                })}
          </span>

          <div
            style={{
              minHeight: 58,
              fontSize: 11.4,
              lineHeight: 1.68,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {renderSuggestionPoints(modificationInstruction)}
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
                    setApplyError(error?.message || t("review.applyFailed"));
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
                {applyLoading
                  ? selectedItem.action === "insert"
                    ? t("review.inserting")
                    : t("review.applying")
                  : selectedItem.action === "insert"
                    ? t("review.insert")
                    : t("review.apply")}
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
                {t("review.skip")}
              </button>
            </div>
          ) : null}
        </article>
      ) : null}
    </aside>
  );
}
