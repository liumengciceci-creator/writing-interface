import { useEffect, useRef, useState } from "react";

import { streamReviewEnhancementDetail } from "../api/reviewBlockCompatibility.js";

const panelButton = {
  height: 30,
  padding: "0 12px",
  borderRadius: 7,
  fontSize: 10.8,
  fontWeight: 700,
  cursor: "pointer",
};

export default function ReviewIssuesPanel({
  open,
  results = [],
  onFocusIssue,
  onAccept,
  onReject,
  onClose,
}) {
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [detailText, setDetailText] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const detailAbortRef = useRef(null);

  const closeIssue = () => {
    detailAbortRef.current?.abort();
    detailAbortRef.current = null;
    setSelectedIssueId(null);
    setDetailText("");
    setDetailLoading(false);
    setDetailError("");
    onFocusIssue?.(null);
  };

  const handleSelectIssue = async (item) => {
    if (selectedIssueId === item.id) {
      closeIssue();
      return;
    }

    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    setSelectedIssueId(item.id);
    setDetailText("");
    setDetailLoading(true);
    setDetailError("");
    onFocusIssue?.(item);

    try {
      await streamReviewEnhancementDetail({
        issue: item,
        sourceBlock: item.sourceBlock,
        targetBlock: item.targetBlock,
        contextBlocks: item.contextBlocks,
        signal: controller.signal,
        onDelta: (delta) => setDetailText((text) => `${text}${delta}`),
      });
      setDetailLoading(false);
    } catch (error) {
      if (error?.name === "AbortError") return;
      setDetailLoading(false);
      setDetailError(error?.message || "详细审阅失败，请重新打开此项");
    } finally {
      if (detailAbortRef.current === controller) {
        detailAbortRef.current = null;
      }
    }
  };

  useEffect(() => () => detailAbortRef.current?.abort(), []);

  useEffect(() => {
    if (!selectedIssueId) return;
    if (results.some((item) => item.id === selectedIssueId && !item.decision)) return;
    closeIssue();
  }, [results, selectedIssueId]);

  if (!open) return null;

  const pendingResults = results.filter((item) => !item.decision);

  return (
    <aside
      aria-label="潜在修改点"
      style={{
        position: "sticky",
        top: 0,
        alignSelf: "start",
        zIndex: 2000,
        width: "100%",
        height: "100dvh",
        minHeight: 0,
        overflowY: "auto",
        padding: "16px 14px 24px",
        background: "#e7e7e7",
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
          overflow: "hidden",
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
              {pendingResults.length > 0
                ? `发现 ${pendingResults.length} 处潜在修改点`
                : "本轮审阅已完成"}
            </div>
            <div style={{ marginTop: 4, color: "#7b8190", fontSize: 10.5, lineHeight: 1.45 }}>
              点击一项，定位相关模块并查看详细意见
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

        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10 }}>
          {pendingResults.length === 0 ? (
            <div style={{ padding: "18px 10px", color: "#6b7280", fontSize: 11.5, lineHeight: 1.6 }}>
              暂未发现需要立即修改的内容关系。
            </div>
          ) : null}

          {pendingResults.map((item, index) => {
            const selected = selectedIssueId === item.id;
            const hasRevision = item.suggestedText !== item.originalText;

            return (
              <article
                key={item.id}
                style={{
                  border: selected
                    ? "1px solid rgba(205,151,20,0.62)"
                    : "1px solid rgba(17,24,39,0.08)",
                  borderRadius: 10,
                  background: selected ? "#fff9e9" : "#fafafa",
                  overflow: "hidden",
                  transition: "border-color 160ms ease, background 160ms ease",
                }}
              >
                <button
                  type="button"
                  aria-expanded={selected}
                  onClick={() => handleSelectIssue(item)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "26px minmax(0, 1fr)",
                    gap: 9,
                    width: "100%",
                    padding: "10px 11px",
                    border: 0,
                    background: "transparent",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: selected ? "#c78f11" : "#dda919",
                      color: "#fff",
                      fontSize: 10.5,
                      fontWeight: 800,
                    }}
                  >
                    {index + 1}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", color: "#9a7010", fontSize: 10, fontWeight: 800 }}>
                      {item.category || "内容关系把关"}
                    </span>
                    <span style={{ display: "block", marginTop: 3, color: "#374151", fontSize: 11.3, lineHeight: 1.5 }}>
                      {item.summary || item.comment}
                    </span>
                  </span>
                </button>

                {selected ? (
                  <div
                    aria-live="polite"
                    style={{
                      padding: "0 11px 11px 46px",
                    }}
                  >
                    <div
                      style={{
                        minHeight: 48,
                        padding: 9,
                        borderRadius: 8,
                        background: "rgba(255,255,255,0.82)",
                        color: "#4b5563",
                        fontSize: 11.3,
                        lineHeight: 1.62,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {detailText || (detailLoading ? "正在结合相关模块重新判断…" : "")}
                      {detailLoading ? (
                        <span
                          aria-hidden="true"
                          style={{
                            display: "inline-block",
                            width: 1,
                            height: "1em",
                            marginLeft: 2,
                            background: "#9a7010",
                            verticalAlign: "-0.12em",
                            animation: "semantic-review-stream-caret 0.8s steps(1) infinite",
                          }}
                        />
                      ) : null}
                    </div>

                    {detailError ? (
                      <div style={{ marginTop: 7, color: "#b42318", fontSize: 10.8, lineHeight: 1.5 }}>
                        {detailError}
                      </div>
                    ) : null}

                    {!detailLoading && !detailError && detailText ? (
                      <>
                        {hasRevision ? (
                          <div
                            style={{
                              marginTop: 8,
                              padding: 8,
                              borderRadius: 8,
                              background: "#fff",
                              color: "#374151",
                              fontSize: 11,
                              lineHeight: 1.58,
                            }}
                          >
                            <div style={{ marginBottom: 4, color: "#80621b", fontSize: 10, fontWeight: 800 }}>
                              可直接替换为
                            </div>
                            {item.suggestedText}
                          </div>
                        ) : null}

                        <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
                          {hasRevision ? (
                            <button
                              type="button"
                              onClick={() => {
                                onAccept(item);
                                closeIssue();
                              }}
                              style={{ ...panelButton, flex: 1, border: 0, background: "#315ea8", color: "#fff" }}
                            >
                              加强
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              onReject(item);
                              closeIssue();
                            }}
                            style={{ ...panelButton, flex: hasRevision ? "0 0 auto" : 1, border: "1px solid #d7dce3", background: "#fff", color: "#4b5563" }}
                          >
                            {hasRevision ? "保留原文" : "知道了"}
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
