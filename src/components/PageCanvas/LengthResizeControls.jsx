import {
  memo,
  useState,
} from "react";

import {
  normalizeId,
} from "./semanticEditorUtils";
import { useI18n } from "../../i18n.jsx";
import QuickInstructionComposer from "./QuickInstructionComposer.jsx";

/**
 * 绘制长度拉伸手柄和长度提示。
 *
 * 功能：
 * 1. 手柄位于模块最后一个字符的右侧边缘
 * 2. 默认不显示手柄
 * 3. 鼠标靠近模块右侧边缘时显示一个小圆点
 * 4. 小圆点外部有较大的透明感应区域，方便操作
 * 5. 拖动过程中圆点保持显示
 * 6. 长度提示显示在圆点上方
 * 7. 鼠标松开后长度提示立即消失
 */
function LengthResizeControls({
  lengthResizeHandles = [],
  lengthResizeDraft = null,
  lengthResizePreview = null,

  /**
   * 只有用户正在按住鼠标拖动时为 true。
   */
  isLengthResizeDragging = false,

  beginLengthResize,
  cancelLengthResize,
  onApplyInstruction,

  isGenerating = false,
  isAdjustingLength = false,

  hasFocusedEditingBlock = false,
  effectiveEditingBlockId = "",
}) {
  const { t } = useI18n();
  /**
   * 当前鼠标悬停的拉伸手柄对应的模块 ID。
   */
  const [
    hoveredBlockId,
    setHoveredBlockId,
  ] = useState(null);

  const [composer, setComposer] = useState(null);

  /**
   * AI 正在生成或正在执行长度调整时，
   * 不显示拉伸控制器。
   */
  if (
    isGenerating ||
    isAdjustingLength
  ) {
    return null;
  }

  return (
    <>
      {lengthResizeHandles.map(
        (handle) => {
          const blockId =
            normalizeId(
              handle.blockId
            );

          const currentDraftBlockId =
            normalizeId(
              lengthResizeDraft
                ?.blockId
            );

          const isCurrentDraft =
            currentDraftBlockId ===
            blockId;

          /**
           * 拉伸过程中使用预览框最后一行的手柄位置。
           * 没有拉伸时使用模块原来的末尾位置。
           */
          const handleX =
            isCurrentDraft &&
            lengthResizePreview
              ? lengthResizePreview
                  .handleX
              : handle.anchorX;

          const handleY =
            isCurrentDraft &&
            lengthResizePreview
              ? lengthResizePreview
                  .handleY
              : handle.anchorY;

          const isSubmitting =
            Boolean(
              isCurrentDraft &&
              lengthResizeDraft
                ?.submitting
            );

          const dimmed =
            hasFocusedEditingBlock &&
            blockId !==
              normalizeId(
                effectiveEditingBlockId
              );

          const blockColor =
            handle.block?.color ||
            "#7c83fd";

          const isHovered =
            normalizeId(
              hoveredBlockId
            ) === blockId;

          /**
           * 小圆点显示条件：
           *
           * 1. 鼠标靠近手柄区域；
           * 2. 当前模块正在被拖动；
           * 3. 当前模块已有长度草稿。
           */
          const showHandleDot =
            isHovered ||
            isCurrentDraft;

          /**
           * 长度提示只在按住鼠标拖动时显示。
           * 鼠标松开以后提示立即隐藏。
           */
          const showStatus =
            isCurrentDraft &&
            isLengthResizeDragging &&
            !isSubmitting;

          return (
            <div
              key={
                `length-resize-control-${blockId}`
              }
              data-length-resize-control="true"
              data-block-id={
                blockId
              }
              style={{
                position:
                  "absolute",

                left:
                  handleX,

                top:
                  handleY,

                /**
                 * 透明感应区域尺寸。
                 * 虽然视觉上只有一个小圆点，
                 * 但鼠标接近模块边缘时就能触发。
                 */
                width: 30,
                height: 34,

                zIndex: 20,

                pointerEvents:
                  "none",

                opacity:
                  dimmed
                    ? 0.28
                    : 1,

                /**
                 * 使用 translate3d，并且在存在拉伸草稿时
                 * 完全关闭 left/top 动画。
                 *
                 * 手柄位置本身已经由每一帧的预览矩形计算，
                 * 再给 left/top 添加 transition 会造成视觉滞后，
                 * 看起来像手柄在鼠标后面漂移。
                 */
                transform:
                  "translate3d(-50%, -50%, 0)",

                transition:
                  isCurrentDraft
                    ? "none"
                    : "opacity 180ms ease",

                willChange:
                  isCurrentDraft
                    ? "left, top, transform"
                    : "opacity",
              }}
            >
              <button
                type="button"
                aria-label={t("canvas.adjustLength")}
                title={t("canvas.dragAdjustLength")}

                data-length-resize-handle="true"

                onPointerEnter={() => {
                  setHoveredBlockId(
                    blockId
                  );
                }}

                onPointerLeave={() => {
                  /**
                   * 拖动期间保持当前手柄的悬停状态，
                   * 避免鼠标离开原感应区后圆点闪烁。
                   */
                  if (
                    !isLengthResizeDragging
                  ) {
                    setHoveredBlockId(
                      null
                    );
                  }
                }}

                onPointerDown={(
                  event
                ) => {
                  if (
                    isSubmitting
                  ) {
                    return;
                  }

                  /**
                   * 捕获当前 pointer，避免快速拖出按钮区域后
                   * 浏览器切换命中目标导致手柄出现抖动。
                   */
                  try {
                    event.currentTarget
                      .setPointerCapture?.(
                        event.pointerId
                      );
                  } catch {
                    // 部分浏览器可能不支持 pointer capture。
                  }

                  setHoveredBlockId(
                    blockId
                  );

                  beginLengthResize?.(
                    event,
                    handle
                  );
                }}

                style={{
                  position:
                    "absolute",

                  inset: 0,

                  width: "100%",
                  height: "100%",

                  padding: 0,
                  margin: 0,

                  border: "none",
                  borderRadius:
                    "50%",

                  /**
                   * 按钮本身完全透明，
                   * 只作为鼠标感应区域。
                   */
                  background:
                    "transparent",

                  display:
                    "flex",

                  alignItems:
                    "center",

                  justifyContent:
                    "center",

                  cursor:
                    isSubmitting
                      ? "default"
                      : "ew-resize",

                  pointerEvents:
                    isSubmitting
                      ? "none"
                      : "auto",

                  touchAction:
                    "none",

                  userSelect:
                    "none",

                  WebkitUserSelect:
                    "none",

                  outline:
                    "none",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display:
                      "block",

                    /**
                     * 实际可见的小圆点尺寸。
                     */
                    width: 8,
                    height: 8,

                    borderRadius:
                      "50%",

                    background:
                      blockColor,

                    border:
                      "1.5px solid rgba(255,255,255,0.96)",

                    boxShadow:
                      [
                        `0 0 0 1px ${blockColor}55`,
                        "0 2px 6px rgba(15,23,42,0.2)",
                      ].join(", "),

                    opacity:
                      showHandleDot
                        ? 1
                        : 0,

                    transform:
                      showHandleDot
                        ? "scale(1)"
                        : "scale(0.55)",

                    transition:
                      isCurrentDraft &&
                      isLengthResizeDragging
                        ? "none"
                        : [
                            "opacity 140ms ease",
                            "transform 140ms ease",
                            "box-shadow 140ms ease",
                          ].join(", "),

                    pointerEvents:
                      "none",
                  }}
                />
              </button>

              <button
                type="button"
                aria-label={t("quickInstruction.open")}
                title={t("quickInstruction.open")}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  cancelLengthResize?.();

                  const blockElement = Array.from(
                    document.querySelectorAll(
                      "[data-semantic-block-id][data-semantic-text='true']"
                    )
                  ).find(
                    (element) =>
                      normalizeId(
                        element.getAttribute(
                          "data-semantic-block-id"
                        )
                      ) === blockId
                  );

                  const rect = (
                    blockElement || event.currentTarget
                  ).getBoundingClientRect();

                  setComposer({
                    block: handle.block,
                    blockId,
                    blockColor,
                    anchorRect: {
                      left: rect.left,
                      right: rect.right,
                      top: rect.top,
                      bottom: rect.bottom,
                    },
                  });
                }}
                style={{
                  position: "absolute",
                  left: 16,
                  top: "50%",
                  width: 18,
                  height: 18,
                  zIndex: 24,
                  padding: 0,
                  border: "1px solid #d9dce2",
                  borderRadius: 5,
                  background: "rgba(255,255,255,0.94)",
                  boxShadow: "0 2px 6px rgba(15,23,42,0.10)",
                  color: "#777",
                  fontSize: 13,
                  lineHeight: "16px",
                  cursor: "pointer",
                  pointerEvents: "auto",
                  transform: "translateY(-50%)",
                }}
              >
                ✎
              </button>

              {showStatus && (
                <LengthResizeStatus
                  draft={
                    lengthResizeDraft
                  }
                  color={
                    blockColor
                  }
                />
              )}
            </div>
          );
        }
      )}

      {composer ? (
        <QuickInstructionComposer
          anchorRect={composer.anchorRect}
          blockColor={composer.blockColor}
          onClose={() => setComposer(null)}
          onSubmit={(instruction) => {
            const target = composer;
            setComposer(null);
            Promise.resolve(
              onApplyInstruction?.(
                target.block,
                {
                  id: `quick-instruction-${Date.now()}`,
                  label: instruction,
                  instruction,
                  color: target.blockColor,
                  fill: target.block?.fill || "#f3f4f6",
                }
              )
            ).catch((error) => {
              console.error("[LengthResizeControls] quick instruction failed:", error);
            });
          }}
        />
      ) : null}
    </>
  );
}

/**
 * 拉伸过程中显示目标长度和操作提示。
 */
function LengthResizeStatus({
  draft,
  color,
}) {
  const { t } = useI18n();
  if (!draft) {
    return null;
  }

  const originalCount =
    Number(
      draft.originalCount
    ) || 0;

  const targetLength =
    Number(
      draft.targetLength
    ) || 0;

  const difference =
    targetLength -
    originalCount;

  const differenceText =
    difference > 0
      ? `+${difference}`
      : String(
          difference
        );

  const unitLabel =
    draft.unitLabel ||
    (
      draft.lengthUnit ===
      "word"
        ? t("canvas.word")
        : t("canvas.character")
    );

  return (
    <div
      data-length-resize-status="true"
      style={{
        position:
          "absolute",

        /**
         * 提示框位于圆点上方。
         */
        bottom:
          "calc(100% + 10px)",

        left: "50%",

        transform:
          "translateX(-50%)",

        zIndex: 21,

        display:
          "flex",

        alignItems:
          "center",

        gap: 7,

        minHeight: 30,

        padding:
          "5px 9px",

        border:
          `1px solid ${color}30`,

        borderRadius: 8,

        /**
         * 半透明毛玻璃背景。
         */
        background:
          "rgba(255,255,255,0.58)",

        backdropFilter:
          "blur(8px)",

        WebkitBackdropFilter:
          "blur(8px)",

        boxShadow:
          "0 4px 14px rgba(15,23,42,0.08)",

        whiteSpace:
          "nowrap",

        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",

        fontSize: 12,

        lineHeight: 1.2,

        color:
          "#334155",

        pointerEvents:
          "none",

        userSelect:
          "none",

        WebkitUserSelect:
          "none",
      }}
    >
      <span
        style={{
          display:
            "inline-flex",

          alignItems:
            "baseline",

          gap: 2,

          fontWeight:
            600,

          color:
            "#0f172a",
        }}
      >
        <span
          style={{
            color,
            fontSize: 13,
          }}
        >
          {targetLength}
        </span>

        <span>
          {unitLabel}
        </span>
      </span>

      {difference !== 0 && (
        <span
          style={{
            color:
              difference > 0
                ? "#16a34a"
                : "#dc2626",

            fontWeight:
              600,
          }}
        >
          {differenceText}
        </span>
      )}

      <span
        aria-hidden="true"
        style={{
          width: 1,
          height: 13,

          background:
            "rgba(148,163,184,0.38)",
        }}
      />

      <span
        style={{
          color:
            "#64748b",
        }}
      >
        Enter 生成
      </span>

      <span
        style={{
          color:
            "#94a3b8",
        }}
      >
        Esc 取消
      </span>
    </div>
  );
}

export default memo(
  LengthResizeControls
);
