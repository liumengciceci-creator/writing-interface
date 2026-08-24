import { useEffect, useState } from "react";
import { useI18n } from "../i18n.jsx";
import {
  dividerStyle,
  toolbarButton,
  toolbarWideButton,
  zoomLabelButton,
} from "../styles";

export default function Toolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onGenerate,
  onReview,
  onComplete,

  selectedIds = [],

  isGenerating = false,
  isAdjustingLength = false,
  isReviewing = false,
  reviewStatus = "",

  statusText = "",
  generationStatus = "",

  webSearchEnabled = false,
  onToggleWebSearch,

  reviewPanelOpen = false,
  reviewPanelStacked = false,

}) {
  const {
    localizeStatus,
    t,
  } = useI18n();
  const normalizedGenerationStatus =
    String(
      localizeStatus(generationStatus) || ""
    ).trim();

  const normalizedStatusText =
    String(
      localizeStatus(statusText) || ""
    ).trim();

  const busy = isGenerating || isAdjustingLength || isReviewing;
  const normalizedReviewStatus =
    String(localizeStatus(reviewStatus) || "").trim();
  const rawCentralStatus =
    normalizedStatusText ||
    (
      isReviewing
        ? normalizedReviewStatus ||
          t("status.reviewing")
        : isGenerating
          ? normalizedGenerationStatus ||
            t("status.generating")
          : isAdjustingLength
            ? t("status.resizing")
            : normalizedGenerationStatus ||
              normalizedReviewStatus
    );
  const [centralStatus, setCentralStatus] = useState(rawCentralStatus);

  useEffect(() => {
    if (!rawCentralStatus) {
      setCentralStatus("");
      return undefined;
    }

    setCentralStatus(rawCentralStatus);

    // 进行中的提示持续保留；操作结束后，完成或结果提示最多保留 4 秒。
    if (busy) return undefined;

    const timerId = window.setTimeout(() => {
      setCentralStatus("");
    }, 4000);

    return () => window.clearTimeout(timerId);
  }, [busy, rawCentralStatus]);

  const statusIsError =
    /错误|失败|error|failed|failure/i.test(
      centralStatus
    );
  const groupStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 10px",
    borderRadius: 12,
    background: "#f8f8f8",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  };

  return (
    <div
      className={`toolbar-shell${
        reviewPanelOpen
          ? " review-panel-open"
          : ""
      }${
        reviewPanelStacked
          ? " review-panel-stacked"
          : ""
      }${
        centralStatus
          ? " has-status"
          : ""
      }`}
      style={{
        width: "100%",
        minHeight: 100,
        position: "relative",
      }}
    >
      <div
        className="canvas-toolbar"
        style={{
          ...groupStyle,
          position: "absolute",
          top: 0,
          left: "var(--toolbar-center, 50%)",
          transform: "translateX(-50%)",
          zIndex: 1,
          whiteSpace: "nowrap",
        }}
        aria-label={t("toolbar.canvasTools")}
      >
        <button type="button" onClick={onZoomOut} style={toolbarButton}>−</button>
        <button type="button" onClick={onResetZoom} style={zoomLabelButton}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" onClick={onZoomIn} style={toolbarButton}>＋</button>
        <div style={dividerStyle} />
        <button
          type="button"
          onClick={onUndo}
          style={{
            ...toolbarButton,
            fontSize: 20,
            lineHeight: 1,
            opacity: busy || !canUndo ? 0.42 : 1,
          }}
          disabled={busy || !canUndo}
          title={`${t("toolbar.undo")} · ⌘Z`}
          aria-label={t("toolbar.undo")}
        >
          ↶
        </button>
        <button
          type="button"
          onClick={onRedo}
          style={{
            ...toolbarButton,
            fontSize: 20,
            lineHeight: 1,
            opacity: busy || !canRedo ? 0.42 : 1,
          }}
          disabled={busy || !canRedo}
          title={`${t("toolbar.redo")} · ⇧⌘Z`}
          aria-label={t("toolbar.redo")}
        >
          ↷
        </button>
        <button
          type="button"
          onClick={onToggleWebSearch}
          disabled={isGenerating || isAdjustingLength}
          aria-pressed={webSearchEnabled}
          style={{
            ...toolbarWideButton,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            opacity: isGenerating || isAdjustingLength ? 0.55 : 1,
            color: webSearchEnabled ? "#315ea8" : "#6b7280",
            background: webSearchEnabled ? "rgba(37,99,235,0.09)" : "#fff",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: webSearchEnabled ? "#4f7fd8" : "#9ca3af",
            }}
          />
          {t("toolbar.webSearch", {
            state: webSearchEnabled
              ? t("toolbar.on")
              : t("toolbar.off"),
          })}
        </button>

      </div>

      <div
        className="action-toolbar"
        style={{
          ...groupStyle,
          position: "absolute",
          top: 0,
          right: 0,
          zIndex: 2,
          border: "none",
          background: "#f8f8f8",
        }}
        aria-label={t("toolbar.mainActions")}
      >
        <button
          type="button"
          onMouseDown={(event) => {
            /**
             * 不把焦点从正在编辑的 contentEditable 抢到按钮上。
             * onClick 仍会正常触发，键盘操作也不受影响。
             */
            event.preventDefault();
          }}
          onClick={onGenerate}
          title={t("toolbar.generateTitle")}
          style={{
            ...toolbarWideButton,
            opacity: 1,
          }}
        >
          {t("toolbar.generate")}
        </button>

        <button
          type="button"
          onClick={onReview}
          title={
            selectedIds.length === 1
              ? t("toolbar.reviewNeedTwo")
              : selectedIds.length >= 2
                ? t("toolbar.reviewSelected")
                : t("toolbar.reviewAll")
          }
          style={{
            ...toolbarWideButton,
            opacity: 1,
          }}
        >
          {t("toolbar.review")}
        </button>

        <button
          type="button"
          onClick={onComplete}
          style={{ ...toolbarWideButton, opacity: 1 }}
        >
          {t("toolbar.complete")}
        </button>
      </div>

      {centralStatus ? (
        <div
          className="canvas-status"
          aria-live="polite"
          title={centralStatus}
          style={{
            position: "absolute",
            top: 72,
            left: "var(--toolbar-center, 50%)",
            zIndex: 3,
            maxWidth: "min(680px, 72%)",
            transform: "translateX(-50%)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            padding: "5px 12px",
            border: "1px solid rgba(79,127,216,0.2)",
            borderRadius: 9,
            background: "#eef5ff",
            boxShadow: "0 2px 8px rgba(79,127,216,0.1)",
            color: statusIsError
              ? "#b91c1c"
              : "#526078",
            fontSize: 12,
            fontWeight: 500,
            lineHeight: "18px",
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
          {centralStatus}
        </div>
      ) : null}
    </div>
  );
}
