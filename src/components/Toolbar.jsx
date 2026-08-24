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

  editableBlockCount = 0,
  reviewableBlockCount = 0,
}) {
  const normalizedGenerationStatus =
    String(
      generationStatus || ""
    ).trim();

  const normalizedStatusText =
    String(
      statusText || ""
    ).trim();

  const hasGenerationError =
    normalizedGenerationStatus.startsWith(
      "错误："
    ) ||
    normalizedStatusText.startsWith(
      "错误："
    );

  const busy = isGenerating || isAdjustingLength || isReviewing;
  const generationDisabled = selectedIds.length === 0 || busy;
  const reviewDisabled =
    reviewableBlockCount < 2 ||
    selectedIds.length === 1 ||
    busy;
  const completeDisabled = editableBlockCount === 0 || busy;
  const generationMessage =
    isGenerating
      ? normalizedGenerationStatus ||
        "正在生成..."
      : hasGenerationError ||
          normalizedGenerationStatus.startsWith(
            "生成完成"
          )
        ? normalizedGenerationStatus
        : "";
  const reviewMessage = isReviewing
    ? String(
        reviewStatus ||
          "正在审阅模块关系..."
      ).trim()
    : "";
  const canvasStatus =
    isGenerating || isReviewing
      ? ""
      : isAdjustingLength
        ? normalizedStatusText ||
          "正在调整模块长度..."
        : normalizedStatusText;
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
          generationMessage ||
          reviewMessage
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

        {canvasStatus ? (
          <span
            aria-live="polite"
            title={canvasStatus}
            style={{
              maxWidth: 210,
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: normalizedStatusText.startsWith("错误：")
                ? "#b91c1c"
                : "#596273",
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            {canvasStatus}
          </span>
        ) : null}
      </div>

      <div
        style={{
          ...groupStyle,
          position: "absolute",
          top: 0,
          right: 0,
          zIndex: 2,
          border: "1px solid rgba(79,127,216,0.18)",
          background: "rgba(248,250,255,0.98)",
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
            if (!generationDisabled) {
              event.preventDefault();
            }
          }}
          onClick={onGenerate}
          disabled={generationDisabled}
          title={generationMessage || "生成所选模块"}
          style={{
            ...toolbarWideButton,
            width: generationMessage ? 220 : "auto",
            minHeight: 34,
            height: "auto",
            padding: generationMessage
              ? "7px 12px"
              : toolbarWideButton.padding,
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "center",
            gap: generationMessage ? 3 : 0,
            opacity:
              generationDisabled &&
              !isGenerating
                ? 0.5
                : 1,
          }}
        >
          <span>
            {isGenerating
              ? "AI生成中"
              : selectedIds.length > 0
                ? `AI生成 (${selectedIds.length})`
                : "AI生成"}
          </span>
          {generationMessage ? (
            <span
              aria-live="polite"
              style={{
                width: "100%",
                color: hasGenerationError
                  ? "#b91c1c"
                  : "#5f6f8f",
                fontSize: 11,
                fontWeight: 400,
                lineHeight: "15px",
                textAlign: "left",
                whiteSpace: "normal",
              }}
            >
              {generationMessage}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={onReview}
          disabled={reviewDisabled}
          title={
            reviewMessage ||
            (selectedIds.length === 1
              ? "请选择至少两个模块，或清除选择以审阅全文"
              : selectedIds.length >= 2
                ? "审阅所选模块"
                : "审阅全文；已完成内容会先恢复为模块")
          }
          style={{
            ...toolbarWideButton,
            width: reviewMessage ? 220 : "auto",
            minHeight: 34,
            height: "auto",
            padding: reviewMessage
              ? "7px 12px"
              : toolbarWideButton.padding,
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "center",
            gap: reviewMessage ? 3 : 0,
            opacity:
              reviewDisabled &&
              !isReviewing
                ? 0.5
                : 1,
            color: isReviewing ? "#315ea8" : toolbarWideButton.color,
          }}
        >
          <span>
            {isReviewing
              ? "审阅中"
              : selectedIds.length >= 2
                ? `审阅 (${selectedIds.length})`
                : "审阅全文"}
          </span>
          {reviewMessage ? (
            <span
              aria-live="polite"
              style={{
                width: "100%",
                color: "#5f6f8f",
                fontSize: 11,
                fontWeight: 400,
                lineHeight: "15px",
                textAlign: "left",
                whiteSpace: "normal",
              }}
            >
              {reviewMessage}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={onComplete}
          disabled={completeDisabled}
          style={{ ...toolbarWideButton, opacity: completeDisabled ? 0.5 : 1 }}
        >
          完成
        </button>
      </div>
    </div>
  );
}
