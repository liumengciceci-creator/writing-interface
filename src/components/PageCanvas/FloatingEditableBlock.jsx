import {
  getLastLeftDragDebugBlockId,
  leftDragDebug,
} from "../../debug/leftDragDebug";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  getActiveInstructionDragData,
  hasInstructionDragData,
  readInstructionDragData,
} from "../../utils/instructionDrag";

import InstructionDropBurst from "./InstructionDropBurst.jsx";
import BlockSources from "./BlockSources.jsx";
import { useI18n } from "../../i18n.jsx";


const FLOATING_RESIZE_HANDLES = [
  {
    direction: "n",
    cursor: "ns-resize",
    style: {
      top: -4,
      left: 8,
      right: 8,
      height: 8,
    },
  },
  {
    direction: "s",
    cursor: "ns-resize",
    style: {
      bottom: -4,
      left: 8,
      right: 8,
      height: 8,
    },
  },
  {
    direction: "w",
    cursor: "ew-resize",
    style: {
      left: -4,
      top: 8,
      bottom: 8,
      width: 8,
    },
  },
  {
    direction: "e",
    cursor: "ew-resize",
    style: {
      right: -4,
      top: 8,
      bottom: 8,
      width: 8,
    },
  },
  {
    direction: "nw",
    cursor: "nwse-resize",
    style: {
      left: -6,
      top: -6,
      width: 12,
      height: 12,
    },
  },
  {
    direction: "ne",
    cursor: "nesw-resize",
    style: {
      right: -6,
      top: -6,
      width: 12,
      height: 12,
    },
  },
  {
    direction: "sw",
    cursor: "nesw-resize",
    style: {
      left: -6,
      bottom: -6,
      width: 12,
      height: 12,
    },
  },
  {
    direction: "se",
    cursor: "nwse-resize",
    style: {
      right: -6,
      bottom: -6,
      width: 12,
      height: 12,
    },
  },
];


/**
 * 简单判断文本主要是英文还是中文。
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

export default function FloatingEditableBlock({
  block,
  zoom = 1,
  isSelected,
  isGenerating = false,
  generatingBlinkOn = false,
  isDimmed = false,
  onEditingChange,
  onApplyInstruction,
  onSelect,
  onDragStart,
  onUpdateText,
  onUpdateWidth,
}) {
  const { blockTypeLabel } = useI18n();
  const isTitleBlock =
    block.type === "Title";

  /**
   * 灰色工作区中的浮动模块与白色画布使用同一缩放倍率。
   * 坐标仍以 Stage 为基准保存；只缩放模块自身，避免缩放时横向漂移。
   */
  const visualZoom =
    Number.isFinite(Number(zoom)) &&
    Number(zoom) > 0
      ? Number(zoom)
      : 1;

  const matchesInlineAppearance =
    block
      .floatingMatchesInlineAppearance ===
    true;

  const lineFragments =
    Array.isArray(
      block.floatingLineFragments
    )
      ? block.floatingLineFragments
      : [];

  const usesLineFragments =
    matchesInlineAppearance &&
    lineFragments.length > 1;

  const editorRef =
    useRef(null);

  const rootRef =
    useRef(null);

  const resizingRef =
    useRef(null);

  const dragCandidateRef =
    useRef(null);

  const editPointRef =
    useRef(null);

  const textUndoStackRef =
    useRef([]);

  /**
   * 记录当前正在编辑的模块。
   * 避免 React 更新时重复覆盖 contentEditable。
   */
  const isEditingRef =
    useRef(false);

  const [
    isEditing,
    setIsEditing,
  ] = useState(false);

  const [
    instructionEffect,
    setInstructionEffect,
  ] = useState(null);

  const instructionDropTimerRef =
    useRef(null);

  useEffect(() => {
    return () => {
      if (
        instructionDropTimerRef.current
      ) {
        window.clearTimeout(
          instructionDropTimerRef.current
        );
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (
        isEditingRef.current
      ) {
        onEditingChange?.(null);
      }
    };
  }, [onEditingChange]);

  const [
    draftText,
    setDraftText,
  ] = useState(
    block.text || ""
  );

  useEffect(() => {
    const debugBlockId =
      getLastLeftDragDebugBlockId();

    if (
      debugBlockId &&
      String(block.id) ===
        debugBlockId
    ) {
      const node =
        editorRef.current;

      const rect =
        node?.getBoundingClientRect?.();

      leftDragDebug(
        "render:floating-component",
        {
          blockId:
            String(block.id),
          isGenerated:
            Boolean(
              block.isGenerated
            ),
          placement:
            block.placement,
          floatingX:
            block.floatingX ??
            null,
          floatingY:
            block.floatingY ??
            null,
          floatingWidth:
            block.floatingWidth ??
            null,
          floatingHeight:
            block.floatingHeight ??
            null,
          height:
            block.height ??
            null,
          domRect:
            rect
              ? {
                  left:
                    rect.left,
                  top:
                    rect.top,
                  right:
                    rect.right,
                  bottom:
                    rect.bottom,
                  width:
                    rect.width,
                  height:
                    rect.height,
                }
              : null,
        }
      );
    }
  }, [
    block.id,
    block.placement,
    block.floatingX,
    block.floatingY,
    block.floatingWidth,
    block.floatingHeight,
    block.height,
    block.isGenerated,
  ]);

  /**
   * block.id 变化时，
   * 强制同步新模块的文本。
   *
   * 这样可以避免 React 复用 DOM 后，
   * 第二个模块显示第一个模块的内容。
   */
  useEffect(() => {
    const nextText =
      block.text || "";

    setDraftText(
      nextText
    );

    const node =
      editorRef.current;

    if (!node) {
      return;
    }

    if (
      node.textContent !==
      nextText
    ) {
      node.textContent =
        nextText;
    }
  }, [
    block.id,
  ]);

  /**
   * 外部 AI 生成、撤销、重做或其他操作
   * 修改 block.text 时，
   * 将新文本同步到编辑器。
   *
   * 用户正在输入时不覆盖 DOM，
   * 避免光标跳动和文字重复。
   */
  useEffect(() => {
    const nextText =
      block.text || "";

    setDraftText(
      nextText
    );

    const node =
      editorRef.current;

    if (!node) {
      return;
    }

    if (
      isEditingRef.current ||
      document.activeElement === node
    ) {
      return;
    }

    if (
      node.textContent !==
      nextText
    ) {
      node.textContent =
        nextText;
    }
  }, [
    block.text,
  ]);

  /**
   * 浮动模块八方向尺寸调整。
   *
   * 左边缘 / 上边缘拖动时不仅改变尺寸，也同步移动 floatingX / Y，
   * 保证另一侧边界固定，行为与设计软件中的边界框一致。
   */
  useEffect(() => {
    const handleMouseMove =
      (event) => {
        const resizing =
          resizingRef.current;

        if (!resizing) {
          return;
        }

        const deltaX =
          (event.clientX -
            resizing.startX) /
          resizing.zoom;

        const deltaY =
          (event.clientY -
            resizing.startY) /
          resizing.zoom;

        const direction =
          resizing.direction;

        let nextWidth =
          resizing.startWidth;
        let nextHeight =
          resizing.startHeight;
        let nextX =
          resizing.startLeft;
        let nextY =
          resizing.startTop;

        if (
          direction.includes("e")
        ) {
          nextWidth =
            Math.max(
              80,
              resizing.startWidth +
                deltaX
            );
        }

        if (
          direction.includes("w")
        ) {
          nextWidth =
            Math.max(
              80,
              resizing.startWidth -
                deltaX
            );
          nextX =
            resizing.startLeft +
            resizing.startWidth -
            nextWidth;
        }

        if (
          direction.includes("s")
        ) {
          nextHeight =
            Math.max(
              40,
              resizing.startHeight +
                deltaY
            );
        }

        if (
          direction.includes("n")
        ) {
          nextHeight =
            Math.max(
              40,
              resizing.startHeight -
                deltaY
            );
          nextY =
            resizing.startTop +
            resizing.startHeight -
            nextHeight;
        }

        onUpdateWidth?.(
          resizing.blockId,
          {
            floatingX:
              nextX,
            floatingY:
              nextY,
            floatingWidth:
              nextWidth,
            ...(
              direction.includes(
                "n"
              ) ||
              direction.includes(
                "s"
              )
                ? {
                    floatingHeight:
                      nextHeight,
                  }
                : {}
            ),
          }
        );
      };

    const handleMouseUp =
      () => {
        resizingRef.current =
          null;

        document.body.style.cursor =
          "";

        document.body.style.userSelect =
          "";
      };

    window.addEventListener(
      "mousemove",
      handleMouseMove
    );

    window.addEventListener(
      "mouseup",
      handleMouseUp
    );

    return () => {
      window.removeEventListener(
        "mousemove",
        handleMouseMove
      );

      window.removeEventListener(
        "mouseup",
        handleMouseUp
      );

      document.body.style.cursor =
        "";
      document.body.style.userSelect =
        "";
    };
  }, [
    onUpdateWidth,
    visualZoom,
  ]);

  const beginResize = (
    event,
    direction,
    cursor
  ) => {
    event.stopPropagation();
    event.preventDefault();

    cancelDragCandidate();

    const rootRect =
      rootRef.current
        ?.getBoundingClientRect();

    resizingRef.current = {
      blockId:
        block.id,
      direction,
      startX:
        event.clientX,
      startY:
        event.clientY,
      startWidth:
        block.floatingWidth ??
        (
          rootRect?.width != null
            ? rootRect.width /
              visualZoom
            : null
        ) ??
        220,
      startHeight:
        block.floatingHeight ??
        (
          rootRect?.height != null
            ? rootRect.height /
              visualZoom
            : null
        ) ??
        block.height ??
        40,
      startLeft:
        block.floatingX ??
        0,
      startTop:
        block.floatingY ??
        0,
      zoom:
        visualZoom,
    };

    document.body.style.cursor =
      cursor;
    document.body.style.userSelect =
      "none";
  };

  const cancelDragCandidate = () => {
    const pending =
      dragCandidateRef.current;

    if (!pending) {
      return;
    }

    window.removeEventListener(
      "mousemove",
      pending.handleMouseMove
    );

    window.removeEventListener(
      "mouseup",
      pending.handleMouseUp
    );

    dragCandidateRef.current =
      null;
  };

  useEffect(() => {
    return () => {
      cancelDragCandidate();
    };
  }, []);

  /**
   * 双击切换到编辑状态后再聚焦。
   */
  useEffect(() => {
    if (!isEditing) {
      return;
    }

    const node =
      editorRef.current;

    if (!node) {
      return;
    }

    node.focus({
      preventScroll: true,
    });

    const point =
      editPointRef.current;

    let range = null;

    if (
      point &&
      document.caretPositionFromPoint
    ) {
      const position =
        document.caretPositionFromPoint(
          point.x,
          point.y
        );

      if (
        position &&
        node.contains(
          position.offsetNode
        )
      ) {
        range =
          document.createRange();

        range.setStart(
          position.offsetNode,
          position.offset
        );

        range.collapse(true);
      }
    }

    if (!range) {
      range =
        document.createRange();

      range.selectNodeContents(
        node
      );

      range.collapse(false);
    }

    const selection =
      window.getSelection();

    selection?.removeAllRanges();
    selection?.addRange(range);

    isEditingRef.current =
      true;
  }, [isEditing]);

  /**
   * 非编辑状态下，鼠标移动超过 5px 才开始拖拽。
   * 因此普通单击只选中，双击可以稳定进入编辑。
   */
  const beginPointerGesture = (
    event
  ) => {
    if (
      isEditing ||
      event.button !== 0 ||
      resizingRef.current ||
      event.target.closest?.(
        "[data-floating-resize-handle='true']"
      )
    ) {
      return;
    }

    /**
     * 点击另一个模块时，先结束旧模块的文字编辑。
     * 否则 preventDefault 会让旧 contentEditable 一直保留焦点，
     * 全局 Delete 和 Cmd/Ctrl+Z 会误以为用户仍在输入文字。
     */
    const activeElement =
      document.activeElement;

    if (
      activeElement &&
      activeElement !==
        editorRef.current &&
      activeElement.isContentEditable
    ) {
      activeElement.blur();
    }

    event.preventDefault();
    event.stopPropagation();

    cancelDragCandidate();

    onSelect?.(event);

    const startX =
      event.clientX;

    const startY =
      event.clientY;

    const dragEvent = {
      clientX: startX,
      clientY: startY,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      button: event.button,
      target: event.target,
      currentTarget:
        event.currentTarget,
      preventDefault() {},
      stopPropagation() {},
    };

    const handleMouseMove = (
      moveEvent
    ) => {
      const distance =
        Math.hypot(
          moveEvent.clientX -
            startX,
          moveEvent.clientY -
            startY
        );

      if (distance <= 5) {
        return;
      }

      cancelDragCandidate();

      window
        .getSelection?.()
        ?.removeAllRanges();

      onDragStart?.(
        dragEvent
      );
    };

    const handleMouseUp = () => {
      cancelDragCandidate();
    };

    dragCandidateRef.current = {
      handleMouseMove,
      handleMouseUp,
    };

    window.addEventListener(
      "mousemove",
      handleMouseMove
    );

    window.addEventListener(
      "mouseup",
      handleMouseUp
    );
  };

  const isEnglish =
    isEnglishText(
      draftText
    );

  /**
   * 获取编辑器当前文本。
   */
  const readEditorText = (
    event
  ) => {
    return (
      event.currentTarget
        .textContent || ""
    )
      .replace(
        /\u200B/g,
        ""
      )
      .replace(
        /\r/g,
        ""
      );
  };

  /**
   * 更新本地文本和父组件数据。
   */
  const updateText = (
    nextText
  ) => {
    setDraftText(
      nextText
    );

    onUpdateText?.(
      block.id,
      nextText
    );
  };

  const rememberTextForUndo = (
    element
  ) => {
    if (!element) {
      return;
    }

    const currentText =
      (element.textContent || "")
        .replace(/\u200B/g, "")
        .replace(/\r/g, "");

    const stack =
      textUndoStackRef.current;

    if (
      stack[
        stack.length - 1
      ] === currentText
    ) {
      return;
    }

    textUndoStackRef.current = [
      ...stack.slice(-99),
      currentText,
    ];
  };

  const placeCaretAtEnd = (
    element
  ) => {
    const selection =
      window.getSelection();

    if (!selection || !element) {
      return;
    }

    const range =
      document.createRange();

    range.selectNodeContents(
      element
    );
    range.collapse(false);

    selection.removeAllRanges();
    selection.addRange(range);
  };

  return (
    <div
      ref={rootRef}
      data-block-root="true"
      data-block-id={
        block.id
      }
      data-floating-editing={
        isEditing
          ? "true"
          : "false"
      }
      onMouseDownCapture={
        beginPointerGesture
      }
      onDragOver={(event) => {
        if (
          !hasInstructionDragData(
            event.dataTransfer
          )
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (event.dataTransfer) {
          event.dataTransfer.dropEffect =
            "copy";
        }

        const instruction =
          getActiveInstructionDragData();

        setInstructionEffect({
          color:
            instruction?.color ||
            "#ef4444",
          fill:
            instruction?.fill ||
            "#feecec",
          phase: "hover",
        });
      }}
      onDragLeave={(event) => {
        if (
          event.currentTarget.contains(
            event.relatedTarget
          )
        ) {
          return;
        }

        setInstructionEffect(
          (current) =>
            current?.phase ===
            "impact"
              ? current
              : null
        );
      }}
      onDrop={(event) => {
        const instruction =
          readInstructionDragData(
            event.dataTransfer
          );

        if (!instruction) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (isGenerating) {
          setInstructionEffect(
            null
          );
          return;
        }

        setInstructionEffect({
          color:
            instruction.color,
          fill:
            instruction.fill,
          phase: "impact",
          clientX:
            event.clientX,
          clientY:
            event.clientY,
        });

        if (
          instructionDropTimerRef.current
        ) {
          window.clearTimeout(
            instructionDropTimerRef.current
          );
        }

        instructionDropTimerRef.current =
          window.setTimeout(() => {
            instructionDropTimerRef.current =
              null;

            setInstructionEffect(
              (current) =>
                current
                  ? {
                      ...current,
                      phase:
                        "waiting",
                    }
                  : current
            );

            Promise.resolve(
              onApplyInstruction?.(
                block,
                instruction,
                {
                  onTextStart:
                    () => {
                      setInstructionEffect(
                        null
                      );
                    },
                }
              )
            ).catch((error) => {
              console.error(
                "[FloatingEditableBlock] 应用指令失败：",
                  error
                );
            }).finally(() => {
              setInstructionEffect(
                null
              );
            });
          }, 660);
      }}
      style={{
        position:
          "absolute",

        left:
          block.floatingX ??
          0,

        top:
          block.floatingY ??
          0,

        width:
          block.floatingWidth ??
          220,

        minHeight:
          Math.max(
            40,
            Number(
              block.height
            ) || 0,
            Number(
              block.floatingHeight
            ) || 0
          ),

        /**
         * floatingHeight 只表示用户希望保留的最小尺寸，
         * 不能作为硬高度锁死外框。
         *
         * 否则 AI 扩写、重新生成或手动编辑后，正文可以继续增长，
         * 但边框停在旧 floatingHeight，造成文字溢出框外。
         * 始终使用 auto，让真实内容决定最终高度。
         */
        height:
          "auto",

        border:
          usesLineFragments
            ? "none"
            : `1px solid color-mix(in srgb, ${block.color} 52%, white)`,

        boxShadow:
          usesLineFragments
            ? "none"
            : instructionEffect
                ?.phase === "hover"
            ? `0 10px 28px rgba(15,23,42,0.24), 0 3px 10px rgba(15,23,42,0.16), 0 0 0 2px ${block.color}38`
            : isEditing
            ? "none"
            : isGenerating &&
          generatingBlinkOn
            ? `0 0 0 1px ${block.color}22, 0 0 4px ${block.color}33, 0 8px 18px rgba(0,0,0,0.12)`
            : isSelected
            ? `0 10px 28px rgba(15,23,42,0.24), 0 3px 10px rgba(15,23,42,0.16), 0 0 0 2px ${block.color}38`
            : "0 8px 18px rgba(0,0,0,0.12)",

        borderRadius:
          matchesInlineAppearance
            ? 8
            : 10,

        background:
          isGenerating &&
          generatingBlinkOn
            ? `${block.color}22`
            : usesLineFragments
            ? "transparent"
            : block.fill,

        transition:
          isGenerating
            ? "background 160ms ease, box-shadow 160ms ease, opacity 180ms ease"
            : "opacity 180ms ease",

        opacity:
          isDimmed
            ? 0.24
            : 1,

        boxSizing:
          "border-box",

        transform:
          `scale(${visualZoom})`,

        transformOrigin:
          "top left",

        padding:
          usesLineFragments
            ? 0
            : matchesInlineAppearance
            ? "2px 8px"
            : "8px 14px",

        zIndex:
          isSelected
            ? 5001
            : 5000,

        userSelect:
          "none",

        WebkitUserSelect:
          "none",

        overflow:
          "visible",

        cursor:
          isEditing
            ? "text"
            : "grab",
      }}
    >
      <InstructionDropBurst
        effect={instructionEffect}
      />

      {usesLineFragments &&
        !isEditing && (
          <div
            aria-hidden="true"
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();

              cancelDragCandidate();
              editPointRef.current = {
                x: event.clientX,
                y: event.clientY,
              };
              textUndoStackRef.current =
                [];
              setIsEditing(true);
              onEditingChange?.(
                block.isGenerated ===
                    true ||
                  block.type ===
                    "Generated"
                  ? block.id
                  : null
              );
            }}
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "auto",
            }}
          >
            {lineFragments.map(
              (fragment, index) => (
                <div
                  key={`${block.id}-line-${index}`}
                  style={{
                    position: "absolute",
                    left:
                      fragment.x ?? 0,
                    top:
                      fragment.y ?? 0,
                    width:
                      fragment.width,
                    minHeight:
                      fragment.height ?? 28,
                    padding:
                      isTitleBlock
                        ? "1px 12px 3px"
                        : "2px 8px",
                    boxSizing:
                      "border-box",
                    border:
                      `1px solid color-mix(in srgb, ${block.color} 52%, white)`,
                    borderRadius: 8,
                    background:
                      block.fill,
                    color: "#202124",
                    fontSize:
                      isTitleBlock
                        ? 20
                        : 16,
                    fontWeight:
                      isTitleBlock
                        ? 700
                        : 400,
                    lineHeight:
                      isTitleBlock
                        ? "26px"
                        : "24px",
                    whiteSpace: "pre",
                    overflow: "visible",
                    boxShadow: "none",
                  }}
                >
                  {fragment.text}

                  {index === 0 && (
                    <span
                      style={{
                        position:
                          "absolute",
                        left: 7,
                        top:
                          isTitleBlock
                            ? -14
                            : -12,
                        height: 16,
                        padding:
                          "0 6px",
                        borderRadius: 5,
                        background:
                          block.color,
                        color: "#fff",
                        fontSize:
                          isTitleBlock
                            ? 10
                            : 9,
                        fontWeight: 600,
                        lineHeight:
                          "16px",
                        whiteSpace:
                          "nowrap",
                      }}
                    >
                      {blockTypeLabel(
                        block.type
                      )}
                    </span>
                  )}
                </div>
              )
            )}
          </div>
        )}

      <style>
        {`
          @keyframes floating-instruction-water-fill {
            0% {
              transform: scaleX(0);
              opacity: 0.2;
            }

            72% {
              opacity: 0.88;
            }

            100% {
              transform: scaleX(1);
              opacity: 0.68;
            }
          }

          @keyframes floating-instruction-waiting-pulse {
            0%, 100% {
              opacity: 0.42;
            }

            50% {
              opacity: 0.78;
            }
          }
        `}
      </style>

      {instructionEffect && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            borderRadius: 8,
            background:
              instructionEffect.fill,
            pointerEvents: "none",
            transformOrigin:
              "left center",
            animation:
              instructionEffect.phase ===
                "impact"
                ? "floating-instruction-water-fill 640ms cubic-bezier(0.22, 1, 0.36, 1) forwards"
                : instructionEffect.phase ===
                  "waiting"
                ? "floating-instruction-waiting-pulse 620ms ease-in-out infinite"
                : undefined,
            opacity:
              instructionEffect.phase ===
                "hover"
                ? 0
                : undefined,
          }}
        />
      )}

      {/* 模块类型标签 */}
      <div
        style={{
          display:
            usesLineFragments &&
            !isEditing
              ? "none"
              : "block",
          position:
            "absolute",

          zIndex:
            2,

          top:
            isTitleBlock
              ? -14
              : -12,

          left:
            7,

          height:
            16,

          padding:
            isTitleBlock
              ? "0 8px"
              : "0 6px",

          borderRadius:
            isTitleBlock
              ? 6
              : 5,

          background:
            block.color,

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

          maxWidth:
            "calc(100% - 8px)",

          overflow:
            "hidden",

          textOverflow:
            "ellipsis",
        }}
      >
        {blockTypeLabel(
          block.type
        )}
      </div>

      {/* 文本编辑区域 */}
      <div
        key={
          block.id
        }
        ref={
          editorRef
        }
        contentEditable={
          isEditing
        }
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        spellCheck
        onMouseDown={(
          event
        ) => {
          if (isEditing) {
            event.stopPropagation();
          }
        }}
        onDoubleClick={(
          event
        ) => {
          event.preventDefault();
          event.stopPropagation();

          cancelDragCandidate();

          editPointRef.current = {
            x: event.clientX,
            y: event.clientY,
          };

          textUndoStackRef.current =
            [];

          setIsEditing(true);
          onEditingChange?.(
            block.isGenerated ===
              true ||
              block.type ===
                "Generated"
              ? block.id
              : null
          );
        }}
        onFocus={() => {
          if (!isEditing) {
            return;
          }

          isEditingRef.current =
            true;
        }}
        onInput={(
          event
        ) => {
          const nextText =
            readEditorText(
              event
            );

          updateText(
            nextText
          );
        }}
        onBeforeInput={(
          event
        ) => {
          const inputType =
            event.nativeEvent
              ?.inputType;

          if (
            inputType !==
              "historyUndo" &&
            inputType !==
              "historyRedo"
          ) {
            rememberTextForUndo(
              event.currentTarget
            );
          }
        }}
        onBlur={(
          event
        ) => {
          isEditingRef.current =
            false;

          setIsEditing(false);
          onEditingChange?.(null);

          const nextText =
            readEditorText(
              event
            );

          /**
           * 失焦时再次清理并保存最终内容。
           */
          if (
            event.currentTarget
              .textContent !==
            nextText
          ) {
            event.currentTarget
              .textContent =
              nextText;
          }

          updateText(
            nextText
          );
        }}
        onPaste={(
          event
        ) => {
          /**
           * 只粘贴纯文本，
           * 避免网页格式影响模块宽度和高度。
           */
          event.preventDefault();

          rememberTextForUndo(
            event.currentTarget
          );

          const pastedText =
            event.clipboardData
              .getData(
                "text/plain"
              );

          document.execCommand(
            "insertText",
            false,
            pastedText
          );
        }}
        onKeyDown={(
          event
        ) => {
          if (!isEditing) {
            return;
          }

          /**
           * 阻止编辑文字时，
           * Backspace、Delete 等按键触发画布快捷键。
           */
          event.stopPropagation();

          const key =
            event.key.toLowerCase();

          const isDirectTextMutation =
            event.key ===
              "Backspace" ||
            event.key ===
              "Delete" ||
            event.key ===
              "Enter" ||
            (
              event.key.length === 1 &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.altKey
            );

          if (
            isDirectTextMutation &&
            !event.isComposing
          ) {
            rememberTextForUndo(
              event.currentTarget
            );
          }

          const isTextUndo =
            (event.metaKey ||
              event.ctrlKey) &&
            !event.shiftKey &&
            key === "z";

          if (isTextUndo) {
            event.preventDefault();

            const previousText =
              textUndoStackRef.current.pop();

            if (
              previousText !==
              undefined
            ) {
              event.currentTarget.textContent =
                previousText;

              placeCaretAtEnd(
                event.currentTarget
              );

              updateText(
                previousText
              );
            }

            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        style={{
          position:
            "relative",

          zIndex:
            1,

          display:
            usesLineFragments &&
            !isEditing
              ? "none"
              : "block",

          width:
            "100%",

          minWidth:
            0,

          minHeight:
            20,

          margin:
            0,

          padding:
            0,

          boxSizing:
            "border-box",

          fontSize:
            isTitleBlock
              ? 20
              : matchesInlineAppearance
                ? 16
                : 14,

          fontWeight:
            isTitleBlock
              ? 700
              : 400,

          color:
            "#333",

          lineHeight:
            isTitleBlock
              ? "26px"
              : matchesInlineAppearance
                ? "24px"
                : "20px",

          textAlign:
            "left",

          whiteSpace:
            isEnglish
              ? "pre-wrap"
              : "pre-wrap",

          wordBreak:
            isEnglish
              ? "break-word"
              : "break-all",

          overflowWrap:
            "anywhere",

          outline:
            "none",

          border:
            "none",

          background:
            "transparent",

          userSelect:
            isEditing
              ? "text"
              : "none",

          WebkitUserSelect:
            isEditing
              ? "text"
              : "none",

          caretColor:
            isEditing
              ? "#333"
              : "transparent",

          cursor:
            isEditing
              ? "text"
              : "grab",

          overflow:
            "visible",
        }}
      />

      <BlockSources
        sources={block.sources}
        floating
      />

      {/*
       * 标准边界框缩放：命中区透明，只有鼠标进入边缘或角点时
       * 通过系统光标提示方向，不再显示常驻彩色小方块。
       */}
      {!block.hideResizeHandle &&
        !block.hideFloatingResizeHandle &&
        !usesLineFragments &&
        FLOATING_RESIZE_HANDLES.map(
          (handle) => (
            <div
              key={handle.direction}
              data-floating-resize-handle="true"
              data-resize-direction={
                handle.direction
              }
              onMouseDown={(event) =>
                beginResize(
                  event,
                  handle.direction,
                  handle.cursor
                )
              }
              style={{
                position:
                  "absolute",
                zIndex:
                  handle.direction.length >
                  1
                    ? 4
                    : 3,
                background:
                  "transparent",
                cursor:
                  handle.cursor,
                ...handle.style,
              }}
            />
          )
        )}
    </div>
  );
}
