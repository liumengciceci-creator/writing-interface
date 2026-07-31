import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  CONTENT_LEFT,
  CONTENT_TOP,
  CONTENT_WIDTH,
  PAGE_HEIGHT,
  PAGE_WIDTH,
} from "../../constants";

import { useFloatingBlocks } from "../../hooks/useEditor/useFloatingBlocks";

import CompletedSection from "./CompletedSection";
import FloatingEditableBlock from "./FloatingEditableBlock";
import SingleSemanticEditor from "./SingleSemanticEditor";

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

function getBlockTypeLabel(type) {
  return (
    BLOCK_TYPE_LABELS[type] ||
    type ||
    "模块"
  );
}

function normalizeId(value) {
  return value == null
    ? ""
    : String(value);
}

function collectContinuousBlocks(
  sectionLayouts = []
) {
  const result = [];
  const visited = new Set();

  for (const section of sectionLayouts) {
    if (
      section?.mode ===
      "completed"
    ) {
      continue;
    }

    if (
      !Array.isArray(
        section?.blocks
      )
    ) {
      continue;
    }

    for (
      const block of
      section.blocks
    ) {
      if (
        !block ||
        block.placement ===
          "floating"
      ) {
        continue;
      }

      const key =
        normalizeId(block.id);

      if (
        !key ||
        visited.has(key)
      ) {
        continue;
      }

      visited.add(key);
      result.push(block);
    }
  }

  return result;
}

function InlineDragPreview({
  preview,
  zIndex = 1200,
}) {
  if (!preview?.block) {
    return null;
  }

  const block =
    preview.block;

  const lineFragments =
    Array.isArray(
      block.floatingLineFragments
    )
      ? block.floatingLineFragments
      : [];

  const matchesInlineAppearance =
    block.floatingMatchesInlineAppearance ===
    true;

  if (
    lineFragments.length > 1
  ) {
    return (
      <div
        style={{
          position: "absolute",
          left: preview.x,
          top: preview.y,
          width:
            preview.width ||
            block.floatingWidth,
          height:
            preview.height ||
            block.floatingHeight,
          zIndex,
          pointerEvents: "none",
          opacity: 0.96,
        }}
      >
        {lineFragments.map(
          (fragment, index) => (
            <div
              key={`${block.id}-drag-line-${index}`}
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
                padding: "2px 8px",
                boxSizing:
                  "border-box",
                border:
                  `1px solid color-mix(in srgb, ${block.color || "#7c83fd"} 52%, white)`,
                borderRadius: 8,
                background:
                  block.fill ||
                  "rgba(124,131,253,0.10)",
                color: "#202124",
                fontSize: 16,
                fontWeight: 400,
                lineHeight: "24px",
                whiteSpace: "pre",
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
                    top: -12,
                    height: 16,
                    padding: "0 6px",
                    borderRadius: 5,
                    background:
                      block.color ||
                      "#7c83fd",
                    color: "#fff",
                    fontSize: 9,
                    fontWeight: 600,
                    lineHeight: "16px",
                    whiteSpace:
                      "nowrap",
                  }}
                >
                  {getBlockTypeLabel(
                    block.type
                  )}
                </span>
              )}
            </div>
          )
        )}
      </div>
    );
  }

  return (
    <div
   style={{
  position: "absolute",
  left: preview.x,
  top: preview.y,

  display: "block",

  width:
    preview.width ||
    block.floatingWidth ||
    block.width ||
    "fit-content",
  minHeight:
    preview.height ||
    block.floatingHeight ||
    block.height ||
    undefined,
  minWidth: 0,
  

  border: `1px solid color-mix(in srgb, ${block.color || "#7c83fd"} 52%, white)`,
  borderRadius:
    matchesInlineAppearance
      ? 8
      : 10,

  background:
    block.fill ||
    "rgba(124,131,253,0.10)",

  padding:
    matchesInlineAppearance
      ? "2px 8px"
      : "8px 14px",

  boxSizing: "border-box",

  color: "#333",
  fontSize:
    matchesInlineAppearance
      ? 16
      : 14,
  fontWeight: 400,
  lineHeight:
    matchesInlineAppearance
      ? "24px"
      : "20px",

  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  wordBreak: "break-word",

  boxShadow:
    "0 8px 18px rgba(0,0,0,0.12)",

  opacity: 0.96,

  zIndex,
  pointerEvents: "none",

  userSelect: "none",
  WebkitUserSelect: "none",
}}
    >
      <div
        style={{
          position: "absolute",
          left:
            matchesInlineAppearance
              ? 7
              : 0,
          top:
            matchesInlineAppearance
              ? -12
              : -14,
          zIndex: 1,

          height: 16,
          padding:
            matchesInlineAppearance
              ? "0 6px"
              : "0 8px",
          borderRadius:
            matchesInlineAppearance
              ? 5
              : 6,

          background:
            block.color ||
            "#7c83fd",

          color: "#fff",
          fontSize: 9,
          fontWeight: 600,
          lineHeight: "16px",
          whiteSpace: "nowrap",

          pointerEvents: "none",
          userSelect: "none",
          WebkitUserSelect:
            "none",
        }}
      >
        {getBlockTypeLabel(
          block.type
        )}
      </div>

      {block.text ||
  block.label ||
  block.type ||
  ""}
    </div>
  );
}

export default function PageCanvas(
  props
) {
  const {
    zoom = 1,

    pageRef,
    stageRef,
    contentRef,

    draggingBlockId,
    sectionLayouts = [],
    totalContentHeight = 0,

    selectedIds = [],
    selectionRect,

    onDragEnd,
    onCanvasMouseUp,
    onExternalDrop,
    onSelectionMove,
    onSelectionStart,
    onSelectionEnd,

    onBlockMouseDown,
    onBlockDragStart,

    /**
     * Option + Shift + 左键拖动复制。
     * 由 useBlockDuplicate 提供。
     */
    beginDuplicateDrag,

    getBlockById,
    updateBlockPlacement,

    onChangeText,
    onCommitBlocks,
    onTextBlur,
    onTextEditStart,

    isGenerating = false,
    generatingBlockIds = [],
    generatingBlinkOn = false,
    isAdjustingLength = false,
    adjustingLengthBlockId = null,

    isAdjustingStyle = false,
    adjustingStyleBlockId = null,

    onClearSelection,

    onRestoreCompletedSection,
    onRestoreCompletedParagraph,
    onUpdateCompletedSectionText,

    onUpdateFloatingBlockText,
    onUpdateFloatingBlockWidth,

    onSelectBlockForPanel,
    onApplyBlockInstruction,
    onAdjustBlockLength,

    onInsertInlineBlock,
    onReorderInlineBlocks,
    onDeleteInlineBlock,
  } = props;

  const continuousEditorRef =
    useRef(null);

  const [
    activeEditingBlockId,
    setActiveEditingBlockId,
  ] = useState(null);

  const [
    measuredEditorHeight,
    setMeasuredEditorHeight,
  ] = useState(0);

  const handleApplyInstructionToBlock =
    (
      block,
      instruction,
      lifecycle = {}
    ) => {
      if (
        !block ||
        !instruction?.instruction
      ) {
        return;
      }

      return Promise.resolve(
        onApplyBlockInstruction?.({
          block,
          style:
            instruction.instruction,
          styleLabel:
            instruction.label ||
            instruction.instruction,
          isCustom: true,
          onTextStart:
            lifecycle.onTextStart,
        })
      ).catch((error) => {
        console.error(
          "[PageCanvas] 应用拖拽指令失败：",
          error
        );
      });
    };

  /**
   * 原生 dragstart 到 React 状态更新之间存在一个渲染间隔。
   * 用 ref 同步保存当前模块，避免快速拖出时拿到旧 ID。
   */
  const nativeDraggingBlockIdRef =
    useRef(null);

  /**
   * Shift + Option + 左键复制拖拽使用独立的全局手势，
   * 避开 contentEditable 与原生 draggable 的事件冲突。
   */
  const duplicatePointerGestureRef =
    useRef(null);

  const completedSections =
    useMemo(
      () =>
        sectionLayouts.filter(
          (section) =>
            section?.mode ===
            "completed"
        ),
      [sectionLayouts]
    );

  const continuousBlocks =
    useMemo(() => {
      const directBlocks =
        collectContinuousBlocks(
          sectionLayouts
        );

      const visited =
        new Set(
          directBlocks.map(
            (block) =>
              normalizeId(
                block.id
              )
          )
        );

      const result = [
        ...directBlocks,
      ];

      for (
        const section of
        sectionLayouts
      ) {
        if (
          section?.mode ===
          "completed"
        ) {
          continue;
        }

        const fragments =
          section
            ?.localFragments ||
          [];

        for (
          const fragment of
          fragments
        ) {
          const blockId =
            fragment?.blockId;

          const key =
            normalizeId(
              blockId
            );

          if (
            !key ||
            visited.has(key)
          ) {
            continue;
          }

          const block =
            getBlockById?.(
              blockId
            );

          if (
            !block ||
            block.placement ===
              "floating"
          ) {
            continue;
          }

          visited.add(key);
          result.push(block);
        }
      }

      return result;
    }, [
      getBlockById,
      sectionLayouts,
    ]);

  const {
    beginDragTracking,
    updateDragPointer,
    clearDragPointer,

    draggingFloatingPreview,
    draggingBackToPagePreview,

    handleFloatingDrop,
    floatingBlocks,
  } = useFloatingBlocks({
    zoom,
    stageRef,
    pageRef,
    totalContentHeight,
    sectionLayouts,
    draggingBlockId,
    getBlockById,
    updateBlockPlacement,
    handleCanvasMouseUp:
      onCanvasMouseUp,
  });

  /**
   * 全局 mouseup 监听器创建于复制开始的那一帧。
   * 副本写入 sections 后组件会重新渲染，因此松手时必须调用
   * 最新一帧的 drop 函数，才能查找到刚创建的新模块。
   */
  const latestHandleFloatingDropRef =
    useRef(handleFloatingDrop);

  latestHandleFloatingDropRef.current =
    handleFloatingDrop;

  useEffect(() => {
    return () => {
      const gesture =
        duplicatePointerGestureRef.current;

      if (!gesture) {
        return;
      }

      window.removeEventListener(
        "mousemove",
        gesture.handleMouseMove
      );

      window.removeEventListener(
        "mouseup",
        gesture.handleMouseUp
      );
    };
  }, []);

  const handleDuplicatePointerDown =
    (event) => {
      if (
        event.button !== 0 ||
        !event.shiftKey ||
        !event.altKey ||
        isGenerating
      ) {
        return;
      }

      const blockElement =
        event.target?.closest?.(
          "[data-semantic-block-id], [data-block-root='true']"
        );

      if (!blockElement) {
        return;
      }

      const sourceBlockId =
        blockElement.getAttribute(
          "data-semantic-block-id"
        ) ??
        blockElement.getAttribute(
          "data-block-id"
        );

      if (
        sourceBlockId == null ||
        !getBlockById?.(
          sourceBlockId
        )
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const startX =
        event.clientX;

      const startY =
        event.clientY;

      const gesture = {
        started: false,
        copiedBlockId: null,
        handleMouseMove: null,
        handleMouseUp: null,
      };

      const cleanup = () => {
        window.removeEventListener(
          "mousemove",
          gesture.handleMouseMove
        );

        window.removeEventListener(
          "mouseup",
          gesture.handleMouseUp
        );

        if (
          duplicatePointerGestureRef.current ===
          gesture
        ) {
          duplicatePointerGestureRef.current =
            null;
        }
      };

      gesture.handleMouseMove =
        (moveEvent) => {
          if (!gesture.started) {
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

            const duplicateResult =
              beginDuplicateDrag?.(
                moveEvent,
                sourceBlockId
              );

            const copiedBlock =
              duplicateResult?.primaryBlock;

            const copiedBlockId =
              duplicateResult?.primaryId;

            if (
              !copiedBlock ||
              copiedBlockId == null
            ) {
              cleanup();
              return;
            }

            gesture.started = true;
            gesture.copiedBlockId =
              copiedBlockId;

            nativeDraggingBlockIdRef.current =
              copiedBlockId;

            onBlockDragStart?.(
              copiedBlockId,
              moveEvent
            );

            beginDragTracking(
              moveEvent,
              copiedBlock
            );

            return;
          }

          updateDragPointer(
            moveEvent
          );
        };

      gesture.handleMouseUp =
        (upEvent) => {
          if (
            gesture.started &&
            gesture.copiedBlockId !=
              null
          ) {
            latestHandleFloatingDropRef.current?.(
              upEvent,
              gesture.copiedBlockId
            );

            clearDragPointer();
            nativeDraggingBlockIdRef.current =
              null;
            onDragEnd?.();
          }

          cleanup();
        };

      duplicatePointerGestureRef.current =
        gesture;

      window.addEventListener(
        "mousemove",
        gesture.handleMouseMove
      );

      window.addEventListener(
        "mouseup",
        gesture.handleMouseUp
      );
    };

  const draggingBlock =
    draggingBlockId != null
      ? getBlockById?.(
          draggingBlockId
        )
      : null;

  const isDraggingFloatingBlock =
    draggingBlockId != null &&
    draggingBlock?.placement ===
      "floating";

  const visualContentHeight =
    Math.max(
      totalContentHeight,
      measuredEditorHeight,
      640
    );

  const pageHeight =
    Math.max(
      PAGE_HEIGHT,
      CONTENT_TOP +
        visualContentHeight +
        100
    );

  /**
   * 检查鼠标事件是否发生在
   * SingleSemanticEditor 内部。
   *
   * 注意：
   * 必须使用新的属性名称：
   * data-single-semantic-editor
   */
  const isInsideSemanticEditor =
    (event) => {
      const target =
        event?.target;

      if (
        !target ||
        typeof target.closest !==
          "function"
      ) {
        return false;
      }

      return Boolean(
        target.closest(
          "[data-single-semantic-editor='true']"
        )
      );
    };

  const isInsideSemanticBlock =
    (event) => {
      const target =
        event?.target;

      if (
        !target ||
        typeof target.closest !==
          "function"
      ) {
        return false;
      }

      return Boolean(
        target.closest(
          "[data-semantic-block-id]"
        )
      );
    };

  /**
   * 画布按下。
   *
   * 编辑器内部的点击不能启动框选，
   * 否则会覆盖浏览器文字光标。
   */
  const handleStageMouseDown =
    (event) => {
      if (
        isInsideSemanticBlock(
          event
        )
      ) {
        return;
      }

      onSelectionStart?.(
        event
      );
    };

  /**
   * 画布移动。
   *
   * 正在拖动浮动模块时继续更新拖动位置。
   * 普通文字编辑时不处理画布框选。
   */
  const handleStageMouseMove =
    (event) => {
      if (
        draggingBlockId != null
      ) {
        updateDragPointer(
          event
        );

        onSelectionMove?.(
          event
        );

        return;
      }

      onSelectionMove?.(
        event
      );
    };

  /**
   * 原生 HTML 拖拽使用 dragover/drop，
   * 不会稳定触发 mousemove/mouseup。
   * 因此单独接入 useFloatingBlocks。
   */
  const handleStageDragOver =
    (event) => {
      const activeBlockId =
        nativeDraggingBlockIdRef.current ??
        draggingBlockId;

      /**
       * Sidebar 模板拖到 Stage 时也必须 preventDefault，
       * 否则浏览器不会触发最终 drop，表现为松手后不出现，
       * 还要再点击一次鼠标才创建。
       */
      event.preventDefault();

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect =
          activeBlockId == null
            ? "copy"
            : "move";
      }

      /**
       * 只有拖动已有模块时才更新 floating 预览。
       * Sidebar 新模板由 useCanvasDrop 在 drop 时直接创建。
       */
      if (
        activeBlockId != null
      ) {
        updateDragPointer(
          event
        );
      }
    };

  const handleStageDrop =
    (event) => {
      const activeBlockId =
        nativeDraggingBlockIdRef.current ??
        draggingBlockId;

      event.preventDefault();
      event.stopPropagation();

      /**
       * activeBlockId 为空时，说明拖入的是 Sidebar 新模板。
       *
       * 直接在本次 drop 中交给 useCanvasDrop 创建：
       * - 落在白色页面：创建为 inline
       * - 落在页面外灰色区域：创建为 floating
       *
       * 因此鼠标松开时会立即出现，不需要再点击一次。
       */
      if (
        activeBlockId == null
      ) {
        onExternalDrop?.(
          event
        );

        clearDragPointer();

        nativeDraggingBlockIdRef.current =
          null;

        return;
      }

      /**
       * 已有 inline / floating 模块继续交给
       * useFloatingBlocks 处理移动及 placement 转换。
       */
      const result =
        handleFloatingDrop(
          event,
          activeBlockId
        );

      if (
        result?.type ===
          "to-floating" ||
        (
          result?.type ===
            "floating-move" &&
          result?.moved
        )
      ) {
        onClearSelection?.();
      }

      clearDragPointer();

      nativeDraggingBlockIdRef.current =
        null;

      onDragEnd?.();
    };

  /**
   * 画布松开。
   *
   * 普通文字点击结束时不能执行：
   * - onCanvasMouseUp
   * - onSelectionEnd
   * - 浮动模块放置
   *
   * 否则编辑器刚建立的光标会被 React
   * 状态更新覆盖。
   */
  const handleStageMouseUp =
    (event) => {
      if (
        duplicatePointerGestureRef.current
          ?.started
      ) {
        return;
      }

      const insideEditor =
        isInsideSemanticEditor(
          event
        );

      if (
        insideEditor &&
        draggingBlockId == null
      ) {
        onSelectionEnd?.(event);
        return;
      }

      if (
        selectionRect &&
        draggingBlockId == null
      ) {
        onSelectionEnd?.(event);
        return;
      }

      if (
        draggingBlockId != null
      ) {
        const result =
          handleFloatingDrop(
            event,
            draggingBlockId
          );

        if (
          result?.type ===
            "to-floating" ||
          (
            result?.type ===
              "floating-move" &&
            result?.moved
          )
        ) {
          onClearSelection?.();
        }

        clearDragPointer();
        onDragEnd?.();
      } else {
        onCanvasMouseUp?.(
          event
        );
      }

      onSelectionEnd?.(event);
    };

  return (
    <div
      ref={stageRef}
      onMouseDownCapture={
        handleDuplicatePointerDown
      }
      onMouseDown={
        handleStageMouseDown
      }
      onMouseMove={
        handleStageMouseMove
      }
      onMouseUp={
        handleStageMouseUp
      }
      onDragOver={
        handleStageDragOver
      }
      onDrop={
        handleStageDrop
      }
      style={{
        width: "100%",
        minWidth: 0,
        flex: 1,

        overflow: "visible",
        position: "relative",
        zIndex: 100,

        display: "flex",
        justifyContent:
          "center",

        alignItems:
          "flex-start",

        padding:
          "8px 16px 20px",

        boxSizing:
          "border-box",

        userSelect: "none",
        WebkitUserSelect:
          "none",
      }}
    >
      <div
        style={{
          transform:
            `scale(${zoom})`,

          transformOrigin:
            "top center",

          width: PAGE_WIDTH,
          minWidth: PAGE_WIDTH,
          flex: "0 0 auto",

          height: pageHeight,

          position: "relative",
          overflow: "visible",
        }}
      >
        <div
          ref={pageRef}
          onMouseDown={(
            event
          ) => {
            /**
             * 点击 Page 本身的空白处才清除选择。
             * 点击子元素时不处理。
             */
            if (
              event.target !==
              event.currentTarget
            ) {
              return;
            }

            if (
              draggingBlockId ==
              null
            ) {
              onClearSelection?.();
            }
          }}
          style={{
            width: PAGE_WIDTH,
            minHeight:
              pageHeight,

            background:
              "#ffffff",

            boxShadow:
              "0 0 0 1px rgba(0,0,0,0.06)",

            position:
              "relative",

            overflow:
              "visible",
          }}
        >
          <div
            ref={contentRef}
            style={{
              position:
                "absolute",

              left:
                CONTENT_LEFT,

              top:
                CONTENT_TOP,

              width:
                CONTENT_WIDTH,

              minHeight:
                visualContentHeight,

              overflow:
                "visible",

              userSelect:
                "text",

              WebkitUserSelect:
                "text",
            }}
          >
            <SingleSemanticEditor
              ref={
                continuousEditorRef
              }

              blocks={
                continuousBlocks
              }

              selectedIds={
                selectedIds
              }

              externalDraggingBlockId={
                draggingBlockId
              }

              onChangeText={
                onChangeText
              }

              onCommitBlocks={
                onCommitBlocks
              }

              onTextBlur={
                onTextBlur
              }

              onTextEditStart={
                onTextEditStart
              }

              onBlockMouseDown={
                onBlockMouseDown
              }

              onSelectBlockForPanel={
                onSelectBlockForPanel
              }

              onClearSelection={
                onClearSelection
              }

              onInsertBlock={
                onInsertInlineBlock
              }

              onTemplateDropComplete={
                onExternalDrop
              }

              onReorderBlocks={
                onReorderInlineBlocks
              }

              onDeleteBlock={
                onDeleteInlineBlock
              }

              onRestoreCompletedParagraph={
                onRestoreCompletedParagraph
              }

              onApplyInstruction={
                handleApplyInstructionToBlock
              }

              onAdjustLength={
                onAdjustBlockLength
              }

              onExistingBlockDragStart={(
                event,
                block
              ) => {
                /**
                 * Option + Shift + 左键保持按住并开始拖动时：
                 * 1. 立即复制原模块
                 * 2. 副本初始为 floating
                 * 3. 当前这次拖拽直接切换到副本
                 * 4. 原模块保持在原位置
                 */
                if (
                  event.altKey &&
                  event.shiftKey
                ) {
                  const duplicateResult =
                    beginDuplicateDrag?.(
                      event,
                      block.id
                    );

                  const copiedBlock =
                    duplicateResult?.primaryBlock;

                  const copiedBlockId =
                    duplicateResult?.primaryId;

                  if (
                    copiedBlock &&
                    copiedBlockId != null
                  ) {
                    nativeDraggingBlockIdRef.current =
                      copiedBlockId;

                    onBlockDragStart?.(
                      copiedBlockId,
                      event
                    );

                    beginDragTracking(
                      event,
                      copiedBlock
                    );

                    return;
                  }
                }

                nativeDraggingBlockIdRef.current =
                  block.id;

                onBlockDragStart?.(
                  block.id,
                  event
                );

                beginDragTracking(
                  event,
                  block
                );
              }}

              /**
               * Shift + Option + 左键：
               * 立即创建 floating 副本，并把当前按住的这次鼠标操作
               * 切换为拖动副本。原 inline 模块完全不移动。
               */
              onDuplicateBlockDragStart={(
                event,
                block
              ) => {
                const duplicateResult =
                  beginDuplicateDrag?.(
                    event,
                    block.id
                  );

                const copiedBlock =
                  duplicateResult?.primaryBlock;

                const copiedBlockId =
                  duplicateResult?.primaryId;

                if (
                  !copiedBlock ||
                  copiedBlockId == null
                ) {
                  return null;
                }

                nativeDraggingBlockIdRef.current =
                  copiedBlockId;

                onBlockDragStart?.(
                  copiedBlockId,
                  event
                );

                beginDragTracking(
                  event,
                  copiedBlock
                );

                return duplicateResult;
              }}

              onExistingBlockDragOver={(
                event
              ) => {
                updateDragPointer(
                  event
                );
              }}

              onExistingBlockDragEnd={() => {
                nativeDraggingBlockIdRef.current =
                  null;

                clearDragPointer();
                onDragEnd?.();
              }}

              isGenerating={
                isGenerating
              }

              generatingBlockIds={
                generatingBlockIds
              }

              generatingBlinkOn={
                generatingBlinkOn
              }

              isAdjustingLength={
                isAdjustingLength
              }

              adjustingLengthBlockId={
                adjustingLengthBlockId
              }

              isAdjustingStyle={
                isAdjustingStyle
              }

              adjustingStyleBlockId={
                adjustingStyleBlockId
              }

              focusedEditingBlockId={
                activeEditingBlockId
              }

              onEditingBlockChange={
                setActiveEditingBlockId
              }

              onContentHeightChange={
                setMeasuredEditorHeight
              }
            />

            {completedSections.map(
              (section) => (
                <CompletedSection
                  key={
                    `completed-${section.id}`
                  }
                  section={{
                    ...section,

                    /**
                     * buildSectionLayouts 已经计算好了 completed
                     * section 在内容区中的真实位置。
                     *
                     * 不能再加 visualContentHeight，否则点击“完成”
                     * 后正文会被推到页面下方，看起来像消失了。
                     */
                    top:
                      section.top ||
                      0,
                  }}
                  onRestoreCompletedSection={
                    onRestoreCompletedSection
                  }
                  onUpdateCompletedSectionText={
                    onUpdateCompletedSectionText
                  }
                  isDimmed={
                    activeEditingBlockId != null
                  }
                />
              )
            )}

            {selectionRect && (
              <div
                style={{
                  position:
                    "absolute",

                  left:
                    selectionRect.x,

                  top:
                    selectionRect.y,

                  width:
                    selectionRect.width,

                  height:
                    selectionRect.height,

                  border:
                    "1px dashed #2563eb",

                  background:
                    "rgba(37,99,235,0.08)",

                  pointerEvents:
                    "none",

                  zIndex:
                    1000,
                }}
              />
            )}

            <InlineDragPreview
              preview={
                draggingBackToPagePreview
              }
              zIndex={1200}
            />
          </div>
        </div>
      </div>

      <InlineDragPreview
        preview={
          draggingFloatingPreview
        }
        zIndex={9999}
      />

      {floatingBlocks
        .filter(
          (block) =>
            !isDraggingFloatingBlock ||
            normalizeId(
              block.id
            ) !==
              normalizeId(
                draggingBlockId
              )
        )
        .map((block) => {
          const isSelected =
            selectedIds.some(
              (id) =>
                normalizeId(
                  id
                ) ===
                normalizeId(
                  block.id
                )
            );

          const isBlockGenerating =
            generatingBlockIds.some(
              (id) =>
                normalizeId(
                  id
                ) ===
                normalizeId(
                  block.id
                )
            );

          return (
            <FloatingEditableBlock
              key={
                `floating-${block.id}`
              }

              block={block}

              isSelected={
                isSelected
              }

              isGenerating={
                isBlockGenerating
              }

              generatingBlinkOn={
                generatingBlinkOn
              }

              isDimmed={
                activeEditingBlockId != null &&
                normalizeId(
                  activeEditingBlockId
                ) !==
                  normalizeId(
                    block.id
                  )
              }

              onEditingChange={
                setActiveEditingBlockId
              }

              onApplyInstruction={
                handleApplyInstructionToBlock
              }

              onSelect={(
                event
              ) => {
                event.stopPropagation();

                onBlockMouseDown?.(
                  event,
                  block.id
                );

                onSelectBlockForPanel?.(
                  block
                );
              }}

              onDragStart={(
                event
              ) => {
                event.stopPropagation();

                /**
                 * Floating 模块同样支持
                 * Option + Shift + 左键保持按住拖动复制。
                 */
                if (
                  event.altKey &&
                  event.shiftKey
                ) {
                  const duplicateResult =
                    beginDuplicateDrag?.(
                      event,
                      block.id
                    );

                  const copiedBlock =
                    duplicateResult?.primaryBlock;

                  const copiedBlockId =
                    duplicateResult?.primaryId;

                  if (
                    copiedBlock &&
                    copiedBlockId != null
                  ) {
                    nativeDraggingBlockIdRef.current =
                      copiedBlockId;

                    onBlockDragStart?.(
                      copiedBlockId,
                      event
                    );

                    beginDragTracking(
                      event,
                      copiedBlock
                    );

                    return;
                  }
                }

                nativeDraggingBlockIdRef.current =
                  block.id;

                onBlockDragStart?.(
                  block.id,
                  event
                );

                beginDragTracking(
                  event,
                  block
                );
              }}

              onUpdateText={
                onUpdateFloatingBlockText
              }

              onUpdateWidth={
                onUpdateFloatingBlockWidth
              }
            />
          );
        })}
    </div>
  );
}
