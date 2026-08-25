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

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function renderSummaryWithHighlights(summary, highlights = []) {
  const rawText = String(summary || "").trim();
  if (!rawText) return null;

  const markdownHighlights = [];
  const text = rawText
    .replace(/\*\*([^*]+)\*\*/g, (_, value) => {
      const highlight = String(value || "").trim();
      if (highlight) markdownHighlights.push(highlight);
      return value;
    })
    // 流式输出时末尾可能只有半个加粗标记；隐藏标记本身，避免界面闪出星号。
    .replace(/\*\*/g, "");

  const validHighlights = Array.from(
    new Set(
      [...markdownHighlights, ...(Array.isArray(highlights) ? highlights : [])]
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

function stripParagraphPrefix(value) {
  return String(value || "")
    .replace(/^(?:标题|Title)[：:]\s*/i, "")
    .replace(/^第[^：:]{1,8}段[：:]\s*/u, "")
    .replace(/^Paragraph\s+\d+\s*:\s*/i, "")
    .trim();
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
  const [panelOffset, setPanelOffset] = useState({ x: 0, y: 0 });
  const [panelDragging, setPanelDragging] = useState(false);
  const criteriaListRef = useRef(null);
  const panelRef = useRef(null);
  const panelDragRef = useRef(null);

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

  useEffect(() => {
    if (open) return;
    panelDragRef.current = null;
    setPanelDragging(false);
    setPanelOffset({ x: 0, y: 0 });
  }, [open]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const drag = panelDragRef.current;
      if (!drag) return;

      const baseLeft = drag.rect.left - drag.offset.x;
      const baseTop = drag.rect.top - drag.offset.y;
      const minimumX = 12 - baseLeft;
      const maximumX = Math.max(
        minimumX,
        window.innerWidth - drag.rect.width - 12 - baseLeft
      );
      const minimumY = 12 - baseTop;
      // 窗口较高时只要求标题栏留在视口内，正文仍可跟随画布滚动查看。
      const maximumY = Math.max(
        minimumY,
        window.innerHeight - 44 - baseTop
      );

      setPanelOffset({
        x: clamp(
          drag.offset.x + event.clientX - drag.pointerX,
          minimumX,
          maximumX
        ),
        y: clamp(
          drag.offset.y + event.clientY - drag.pointerY,
          minimumY,
          maximumY
        ),
      });
    };

    const stopDragging = () => {
      if (!panelDragRef.current) return;
      panelDragRef.current = null;
      setPanelDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, []);

  const beginPanelDrag = (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    panelDragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      offset: panelOffset,
      rect,
    };
    setPanelDragging(true);
  };

  if (!open) return null;

  const pendingResults = results.filter((item) => !item.decision);
  const resultById = new Map(results.map((item) => [item.id, item]));
  const issueNumberById = new Map();
  let nextIssueNumber = 1;
  criteria.forEach((criterion) => {
    const issueItem = criterion.issueId
      ? resultById.get(criterion.issueId)
      : null;
    if (!issueItem || issueItem.decision || issueNumberById.has(issueItem.id)) return;
    issueNumberById.set(issueItem.id, nextIssueNumber);
    nextIssueNumber += 1;
  });
  const selectedItem = pendingResults.find((item) => item.id === selectedIssueId) || null;
  const accentSource = selectedItem?.action === "insert" || selectedItem?.action === "replace"
    ? selectedItem?.suggestedModule
    : selectedItem?.sourceBlock;
  const accentColor = accentSource?.color || "#d6a31a";
  const accentFill = accentSource?.fill || "#fff8e7";
  const modificationInstruction = String(
    selectedItem?.modificationInstruction || selectedItem?.suggestion || ""
  ).trim();
  const paragraphGroups = criteria.reduce((groups, criterion, index) => {
    const paragraphValue = Number(criterion?.paragraph);
    const paragraph = Number.isFinite(paragraphValue)
      ? Math.max(0, paragraphValue)
      : 1;
    let group = groups.find((item) => item.paragraph === paragraph);
    if (!group) {
      group = { paragraph, items: [] };
      groups.push(group);
    }
    group.items.push({ criterion, index });
    return groups;
  }, []).sort((first, second) => first.paragraph - second.paragraph);

  return (
    <aside
      ref={panelRef}
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
        transform: `translate3d(${panelOffset.x}px, ${panelOffset.y}px, 0)`,
        willChange: panelDragging ? "transform" : "auto",
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
          onPointerDown={beginPanelDrag}
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
            padding: "14px 12px 11px 14px",
            borderBottom: "1px solid rgba(17,24,39,0.08)",
            cursor: panelDragging ? "grabbing" : "grab",
            userSelect: "none",
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
            {paragraphGroups.map((group) => (
              <section
                key={`review-paragraph-${group.paragraph}`}
                aria-label={group.paragraph === 0
                  ? t("review.titleGroup")
                  : t("review.paragraph", { count: group.paragraph })}
                style={{
                  padding: "10px 0 4px",
                  borderTop: "1px solid rgba(17,24,39,0.08)",
                }}
              >
                <div
                  style={{
                    marginBottom: 3,
                    color: "#374151",
                    fontSize: 11.5,
                    fontWeight: 800,
                    lineHeight: 1.5,
                  }}
                >
                  {group.paragraph === 0
                    ? t("review.titleGroup")
                    : t("review.paragraph", { count: group.paragraph })}
                </div>

                {group.items.map(({ criterion, index }) => {
              const issueItem = criterion.issueId
                ? resultById.get(criterion.issueId)
                : null;
              const issueNumber = issueItem ? issueNumberById.get(issueItem.id) : null;
              const selected = Boolean(issueItem && issueItem.id === selectedIssueId);
              const itemColor = issueItem?.action === "insert" || issueItem?.action === "replace"
                ? issueItem?.suggestedModule?.color || "#d6a31a"
                : issueItem?.sourceBlock?.color || "#d6a31a";
              const accepted = issueItem?.decision === "accepted";
              const rejected = issueItem?.decision === "rejected";

              const checking = criterion.status === "checking";

              return (
                <div
                  key={`${criterion.key}-${index}`}
                  role="listitem"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) 26px",
                    alignItems: "start",
                    gap: 9,
                    padding: "7px 0 7px 8px",
                    borderTop: "none",
                  }}
                >
                  <div
                    aria-live="polite"
                    style={{
                      color: checking ? "#7b8190" : "#4b5563",
                      fontSize: 11.1,
                      lineHeight: 1.58,
                      fontStyle: checking ? "italic" : "normal",
                    }}
                  >
                    {checking
                      ? t("review.checking")
                      : stripParagraphPrefix(criterion.summary)}
                  </div>

                  {checking ? (
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 23,
                        height: 23,
                        color: "#8aa0c5",
                        fontSize: 15,
                        animation: "semantic-instruction-waiting-pulse 900ms ease-in-out infinite",
                      }}
                    >
                      ···
                    </span>
                  ) : !issueItem || accepted ? (
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
                      aria-label={t("review.viewIssue", { count: issueNumber })}
                      aria-pressed={selected}
                      title={issueItem.summary || issueItem.category || t("review.issue", { count: issueNumber })}
                      onClick={() => handleSelectIssue(issueItem)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 18,
                        height: 18,
                        padding: 0,
                        border: `1px solid ${itemColor}`,
                        borderRadius: "50%",
                        background: itemColor,
                        color: "#fff",
                        fontSize: 9.5,
                        fontWeight: 800,
                        lineHeight: 1,
                        boxShadow: selected
                          ? `0 0 0 3px color-mix(in srgb, ${itemColor} 20%, transparent)`
                          : "0 1px 4px rgba(15,23,42,0.10)",
                        cursor: "pointer",
                        transition: "box-shadow 150ms ease, transform 150ms ease",
                      }}
                    >
                      {issueNumber}
                    </button>
                  )}
                </div>
              );
              })}
              </section>
            ))}
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
              : selectedItem.action === "replace"
                ? t("review.replaceInstruction", {
                    label: selectedItem.suggestedModule?.label ||
                      blockTypeLabel(selectedItem.replaceType, selectedItem.replaceType),
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
                    : selectedItem.action === "replace"
                      ? t("review.replacing")
                      : t("review.applying")
                  : selectedItem.action === "insert"
                    ? t("review.insert")
                    : selectedItem.action === "replace"
                      ? t("review.replace")
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
