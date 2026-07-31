const BLOCK_TYPE_LABELS = {
  Claim: "论点",
  Evidence: "证据",
  Reason: "推理",
  Counter: "反论",
  Conclusion: "结论",
  Question: "问题",
  Generated: "生成",
  Transition: "过渡",
  Merged: "融合",
};

/**
 * 将模块类型转换为界面显示标签。
 * 自定义模块没有对应映射时，
 * 继续显示原始 type。
 */
function getBlockTypeLabel(type) {
  return (
    BLOCK_TYPE_LABELS[type] ||
    type ||
    "模块"
  );
}

/**
 * 判断文本是否主要为英文。
 */
function isEnglishText(text) {
  if (!text) {
    return false;
  }

  const latin =
    (
      text.match(
        /[A-Za-z]/g
      ) || []
    ).length;

  const cjk =
    (
      text.match(
        /[\u4e00-\u9fff]/g
      ) || []
    ).length;

  return latin > cjk;
}

export default function FragmentBlock({
  fragment,
  globalY,
  isSelected,
  isDraggingThisBlock,
  showHandle,
  dragOffsetX = 0,
  dragOffsetY = 0,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onDoubleClick,
  isGeneratingThisBlock = false,
  generatingBlinkOn = false,
}) {
  const text =
    fragment.text ||
    "\u200B";

  const isEnglish =
    isEnglishText(text);

  const blockId =
    fragment.blockId ??
    fragment.id;

  const shouldShowGeneratingEffect =
    isGeneratingThisBlock ===
      true &&
    generatingBlinkOn ===
      true;

  const visualOpacity =
    isDraggingThisBlock
      ? 0.92
      : shouldShowGeneratingEffect
      ? 0.45
      : 1;

  const visualScale =
    shouldShowGeneratingEffect
      ? 0.992
      : 1;

  return (
    <div
      data-block-root="true"
      data-block-id={
        blockId
      }
      onMouseDown={(
        event
      ) => {
        event.stopPropagation();

        onPointerDown?.(
          event
        );
      }}
      onMouseUp={
        onPointerUp
      }
      onMouseLeave={
        onPointerLeave
      }
      onDoubleClick={(
        event
      ) => {
        event.stopPropagation();

        onDoubleClick?.(
          event
        );
      }}
      style={{
        position:
          "absolute",

        left:
          fragment.x +
          dragOffsetX,

        top:
          fragment.y +
          dragOffsetY,

        width:
          fragment.width,

        minHeight:
          fragment.height,

        border:
          `1.5px solid ${fragment.color}`,

        outline:
          "none",

        borderRadius:
          10,

        background:
          fragment.fill,

        boxSizing:
          "border-box",

        boxShadow:
          isDraggingThisBlock
            ? "0 12px 24px rgba(0,0,0,0.18)"
            : isSelected
            ? `
                0 10px 28px rgba(15,23,42,0.24),
                0 3px 10px rgba(15,23,42,0.16),
                0 0 0 2px ${fragment.color}38
              `
            : showHandle
            ? "0 0 0 2px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.08)"
            : "0 2px 8px rgba(0,0,0,0.04)",

        padding:
          "8px 14px",

        display:
          "block",

        opacity:
          visualOpacity,

        transform:
          `scale(${visualScale})`,

        transformOrigin:
          "center center",

        zIndex:
          isDraggingThisBlock
            ? 1000
            : showHandle
            ? 3
            : 1,

        cursor:
          isDraggingThisBlock
            ? "grabbing"
            : showHandle
            ? "grab"
            : "default",

        transition:
          isDraggingThisBlock
            ? "none"
            : "opacity 0.18s ease, transform 0.18s ease, box-shadow 0.15s ease",

        overflow:
          "visible",
      }}
    >
      {fragment.showLabel && (
        <div
          style={{
            position:
              "absolute",

            top:
              -14,

            left:
              0,

            height:
              16,

            padding:
              "0 8px",

            borderRadius:
              6,

            background:
              fragment.color,

            color:
              "#fff",

            fontSize:
              9,

            lineHeight:
              "16px",

            pointerEvents:
              "none",

            whiteSpace:
              "nowrap",

            zIndex:
              10,

            transition:
              isDraggingThisBlock
                ? "none"
                : "box-shadow 0.2s ease, transform 0.15s ease",
          }}
        >
          {getBlockTypeLabel(
            fragment.type
          )}
        </div>
      )}

      <span
        style={{
          display:
            "block",

          width:
            "100%",

          fontSize:
            14,

          color:
            "#333",

          lineHeight:
            "20px",

          textAlign:
            "left",

          whiteSpace:
            isEnglish
              ? "nowrap"
              : "pre-wrap",

          wordBreak:
            isEnglish
              ? "normal"
              : "break-word",

          overflowWrap:
            isEnglish
              ? "normal"
              : "break-word",

          overflow:
            isEnglish
              ? "hidden"
              : "visible",

          textOverflow:
            isEnglish
              ? "clip"
              : "unset",

          pointerEvents:
            "none",
        }}
      >
        {text}
      </span>
    </div>
  );
}
