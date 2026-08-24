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

}) {
  const normalizedGenerationStatus =
    String(
      generationStatus || ""
    ).trim();

  const normalizedStatusText =
    String(
      statusText || ""
    ).trim();

  const busy = isGenerating || isAdjustingLength || isReviewing;
  const normalizedReviewStatus =
    String(reviewStatus || "").trim();
  const centralStatus =
    normalizedStatusText ||
    (
      isReviewing
        ? normalizedReviewStatus ||
          "正在审阅模块关系..."
        : isGenerating
          ? normalizedGenerationStatus ||
            "正在生成..."
          : isAdjustingLength
            ? "正在调整模块长度..."
            : normalizedGenerationStatus ||
              normalizedReviewStatus
    );
  const statusIsError =
    /错误|失败/.test(
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
      style={{
        width: "100%",
        minHeight:
          centralStatus
            ? 78
            : 54,
        position: "relative",
      }}
    >
      <div
        style={{
          ...groupStyle,
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1,
          whiteSpace: "nowrap",
        }}
        aria-label="画布工具"
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
          style={toolbarWideButton}
          disabled={busy}
        >
          撤销
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
          联网搜索：{webSearchEnabled ? "开" : "关"}
        </button>

      </div>

      <div
        style={{
          ...groupStyle,
          position: "absolute",
          top: 0,
          right: 0,
          zIndex: 2,
          border: "none",
          background: "#f8f8f8",
        }}
        aria-label="主要写作操作"
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
          title="生成所选模块"
          style={{
            ...toolbarWideButton,
            opacity: 1,
          }}
        >
          AI生成
        </button>

        <button
          type="button"
          onClick={onReview}
          title={
            selectedIds.length === 1
              ? "请选择至少两个模块，或清除选择以审阅全文"
              : selectedIds.length >= 2
                ? "审阅所选模块"
                : "审阅全文；已完成内容会先恢复为模块"
          }
          style={{
            ...toolbarWideButton,
            opacity: 1,
          }}
        >
          审阅
        </button>

        <button
          type="button"
          onClick={onComplete}
          style={{ ...toolbarWideButton, opacity: 1 }}
        >
          完成
        </button>
      </div>

      {centralStatus ? (
        <div
          aria-live="polite"
          title={centralStatus}
          style={{
            position: "absolute",
            top: 50,
            left: "50%",
            zIndex: 3,
            maxWidth: "min(680px, 72%)",
            transform: "translateX(-50%)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            padding: "5px 12px",
            border: "1px solid rgba(17,24,39,0.08)",
            borderRadius: 9,
            background: "#f8f8f8",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
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
