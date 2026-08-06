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
  onComplete,
  onToggleModuleVisibility,
  onExportWord,

  selectedIds = [],

  isGenerating = false,
  isAdjustingLength = false,

  statusText = "",
  generationStatus = "",

  webSearchEnabled = false,
  onToggleWebSearch,

  editableBlockCount = 0,
  modulesHidden = false,
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


  if (
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
    normalizedStatusText.startsWith(
      "正在"
    );


  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,

          background: "#f8f8f8",

          borderRadius: 12,

          boxShadow:
            "0 2px 8px rgba(0,0,0,0.08)",

          padding:
            "10px 12px",
        }}
      >

        <button
          onClick={onZoomOut}
          style={toolbarButton}
        >
          −
        </button>


        <button
          onClick={onResetZoom}
          style={zoomLabelButton}
        >
          {Math.round(
            zoom * 100
          )}
          %
        </button>


        <button
          onClick={onZoomIn}
          style={toolbarButton}
        >
          ＋
        </button>


        <div
          style={dividerStyle}
        />


        <button
          onClick={onUndo}
          style={toolbarWideButton}
          disabled={
            isGenerating ||
            isAdjustingLength
          }
        >
          撤销
        </button>


        <button
          onClick={onGenerate}
          disabled={
            selectedIds.length === 0 ||
            isGenerating ||
            isAdjustingLength
          }
          style={{
            ...toolbarWideButton,

            opacity:
              selectedIds.length === 0 ||
              isGenerating ||
              isAdjustingLength
                ? 0.5
                : 1,
          }}
        >
          {
            isGenerating
              ? "生成中..."
              : isAdjustingLength
                ? "调整中..."
                : selectedIds.length > 0
                  ? `AI生成 (${selectedIds.length})`
                  : "AI生成"
          }
        </button>



        <button
          type="button"
          onClick={onToggleWebSearch}
          disabled={
            isGenerating ||
            isAdjustingLength
          }
          aria-pressed={
            webSearchEnabled
          }
          style={{
            ...toolbarWideButton,

            display:
              "inline-flex",

            alignItems:
              "center",

            gap:6,

            opacity:
              isGenerating ||
              isAdjustingLength
                ? 0.55
                : 1,

            color:
              webSearchEnabled
                ? "#315ea8"
                : "#6b7280",

            background:
              webSearchEnabled
                ? "rgba(37,99,235,0.09)"
                : "#fff",
          }}
        >

          <span
            style={{
              width:8,
              height:8,

              borderRadius:
                "50%",

              background:
                webSearchEnabled
                  ? "#4f7fd8"
                  : "#9ca3af",
            }}
          />

          联网搜索：
          {
            webSearchEnabled
              ? "开"
              : "关"
          }

        </button>



        <button
          type="button"
          onClick={
            onToggleModuleVisibility
          }
          disabled={
            editableBlockCount === 0 ||
            isGenerating ||
            isAdjustingLength
          }
          style={{
            ...toolbarWideButton,

            opacity:
              editableBlockCount === 0 ||
                isGenerating ||
                isAdjustingLength
                ? 0.5
                : 1,
          }}
          title={
            modulesHidden
              ? "显示当前段落的模块外观"
              : "隐藏当前段落的模块外观"
          }
        >
          {modulesHidden
            ? "显示模块"
            : "隐藏模块"}
        </button>


        <button
          onClick={onComplete}
          disabled={
            editableBlockCount === 0 ||
            isGenerating ||
            isAdjustingLength
          }
          style={{
            ...toolbarWideButton,

            opacity:
              editableBlockCount === 0 ||
              isGenerating ||
              isAdjustingLength
                ? 0.5
                : 1,
          }}
        >
          完成
        </button>


        <button
          type="button"
          onClick={onExportWord}
          disabled={
            isGenerating ||
            isAdjustingLength
          }
          style={{
            ...toolbarWideButton,

            opacity:
              isGenerating ||
              isAdjustingLength
                ? 0.5
                : 1,
          }}
          title="将当前线性正文导出为 Word 文档"
        >
          导出Word
        </button>



        {
          visibleStatus && (
            <span
              style={{
                display:
                  "inline-flex",

                alignItems:
                  "center",

                gap:6,


                minWidth:
                  isBusyStatus
                    ? 190
                    : 0,


                padding:
                  isBusyStatus
                    ? "5px 9px"
                    : 0,


                borderRadius:
                  999,


                background:
                  isBusyStatus
                    ? "rgba(37,99,235,0.08)"
                    : "transparent",


                color:
                  hasGenerationError
                    ? "#b91c1c"
                    : isBusyStatus
                      ? "#315ea8"
                      : "#666",


                fontSize:12,

                whiteSpace:
                  "nowrap",
              }}
            >

              {
                isBusyStatus && (
                  <span
                    style={{
                      width:7,
                      height:7,

                      borderRadius:
                        "50%",

                      background:
                        "#4f7fd8",
                    }}
                  />
                )
              }


              {visibleStatus}

            </span>
          )
        }

      </div>
    </div>
  );
}
