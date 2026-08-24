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


  /**
   * 状态显示逻辑
   *
   * 优先级：
   *
   * 1. 长度调整
   * 2. AI生成
   * 3. 错误
   * 4. 普通状态
   */
  let visibleStatus = "";


  if (isReviewing) {
    visibleStatus = reviewStatus || "正在审阅模块关系...";
  } else if (
    isAdjustingLength
  ) {
    visibleStatus =
      normalizedStatusText ||
      "正在调整模块长度...";
  } else if (
    isGenerating
  ) {
    visibleStatus =
      normalizedGenerationStatus ||
      normalizedStatusText ||
      "正在生成...";
  } else if (
    hasGenerationError
  ) {
    visibleStatus =
      normalizedGenerationStatus ||
      normalizedStatusText;
  } else {
    visibleStatus =
      normalizedStatusText;
  }


  /**
   * 判断是否显示蓝色状态气泡
   */
  const isBusyStatus =
    isGenerating ||
    isAdjustingLength ||
    isReviewing ||
    normalizedStatusText.startsWith(
      "正在"
    );


  const busy = isGenerating || isAdjustingLength || isReviewing;
  const generationDisabled = selectedIds.length === 0 || busy;
  const reviewDisabled =
    reviewableBlockCount < 2 ||
    selectedIds.length === 1 ||
    busy;
  const completeDisabled = editableBlockCount === 0 || busy;
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
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
      }}
    >
      <div style={groupStyle} aria-label="画布工具">
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
          border: "1px solid rgba(79,127,216,0.18)",
          background: "rgba(248,250,255,0.98)",
        }}
        aria-label="主要写作操作"
      >
        <button
          type="button"
          onClick={onGenerate}
          disabled={generationDisabled}
          style={{ ...toolbarWideButton, opacity: generationDisabled ? 0.5 : 1 }}
        >
          {isGenerating
            ? "生成中..."
            : selectedIds.length > 0
              ? `AI生成 (${selectedIds.length})`
              : "AI生成"}
        </button>

        <button
          type="button"
          onClick={onReview}
          disabled={reviewDisabled}
          style={{
            ...toolbarWideButton,
            opacity: reviewDisabled ? 0.5 : 1,
            color: isReviewing ? "#315ea8" : toolbarWideButton.color,
          }}
          title={
            selectedIds.length === 1
              ? "请选择至少两个模块，或清除选择以审阅全文"
              : selectedIds.length >= 2
                ? "审阅所选模块"
                : "审阅全文；已完成内容会先恢复为模块"
          }
        >
          {isReviewing
            ? "审阅中..."
            : selectedIds.length >= 2
              ? `审阅 (${selectedIds.length})`
              : "审阅全文"}
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

      {visibleStatus ? (
        <span
          aria-live="polite"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            minWidth: isBusyStatus ? 190 : 0,
            padding: isBusyStatus ? "5px 9px" : 0,
            borderRadius: 999,
            background: isBusyStatus ? "rgba(37,99,235,0.08)" : "transparent",
            color: hasGenerationError
              ? "#b91c1c"
              : isBusyStatus
                ? "#315ea8"
                : "#666",
            fontSize: 12,
            whiteSpace: "nowrap",
          }}
        >
          {isBusyStatus ? (
            <span
              aria-hidden="true"
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#4f7fd8",
              }}
            />
          ) : null}
          {visibleStatus}
        </span>
      ) : null}
    </div>
  );
}
