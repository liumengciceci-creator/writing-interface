import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

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
import QuickInstructionComposer from "./QuickInstructionComposer";
import { useI18n } from "../../i18n.jsx";


function normalizeId(value) {
  return value == null
    ? ""
    : String(value);
}

/**
 * 判断原生拖拽是否携带 ArguWeave 模块。
 * Sidebar 新标签和已有正文模块都会写入这两个 MIME 类型。
 */
function hasWorkspaceBlockPayload(
  event
) {
  const types = Array.from(
    event?.dataTransfer?.types ||
      []
  );

  return (
    types.includes(
      "application/x-writing-block"
    ) ||
    types.includes(
      "application/x-semantic-block"
    )
  );
}

/**
 * PageCanvas 的 Stage 位于中间列，最左侧空白灰区属于独立网格列。
 * 这里仅接收明确标记的空白灰区，避免工具栏、标签窗口和按钮误触发放置。
 */
function isLeftWorkspaceGutterTarget(
  event
) {
  const target = event?.target;

  if (
    !target ||
    !(target instanceof Element)
  ) {
    return false;
  }

  if (
    target.closest(
      "[data-workspace-drop-ignore='true'], button, input, textarea, select, a"
    )
  ) {
    return false;
  }

  return Boolean(
    target.closest(
      "[data-workspace-drop-zone='left-gutter']"
    )
  );
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
  visualScale = 1,
}) {
  // The preview is rendered in a separate branch from PageCanvas. Keep the
  // localized label resolver in this component's own scope so external drops
  // never depend on a variable owned by the canvas or another preview branch.
  const {
    blockTypeLabel: getPreviewTypeLabel,
  } = useI18n();

  const previewScale =
    Number.isFinite(
      Number(visualScale)
    ) &&
    Number(visualScale) > 0
      ? Number(visualScale)
      : 1;

  if (!preview?.block) {
    return null;
  }

  if (
    Array.isArray(
      preview.groupPreviews
    ) &&
    preview.groupPreviews.length > 0
  ) {
    const primaryPreview = {
      ...preview,
      groupPreviews: undefined,
    };

    return (
      <>
        <InlineDragPreview
          preview={primaryPreview}
          zIndex={zIndex}
          visualScale={previewScale}
        />

        {preview.groupPreviews.map(
          (item) => (
            <InlineDragPreview
              key={`group-drag-${item.block?.id}`}
              preview={item}
              zIndex={zIndex}
              visualScale={previewScale}
            />
          )
        )}
      </>
    );
  }

  const block =
    preview.block;

  const isTitleBlock =
    block.type === "Title";

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
          transform:
            `scale(${previewScale})`,
          transformOrigin:
            "top left",
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
                  {getPreviewTypeLabel(
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

  transform:
    `scale(${previewScale})`,
  transformOrigin:
    "top left",
}}
    >
      <div
        style={{
          position: "absolute",
          left: 7,
          top:
            isTitleBlock
              ? -14
              : -12,
          zIndex: 1,

          height: 16,
          padding:
            isTitleBlock
              ? "0 8px"
              : "0 6px",
          borderRadius:
            isTitleBlock
              ? 6
              : 5,

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
        {getPreviewTypeLabel(
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
  const { t } = useI18n();

  const {
    zoom = 1,

    pageRef,
    stageRef,
    contentRef,

    draggingBlockId,
    isDraggingTemplate = false,
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
    onContextSelectBlocks,
    onDeleteContextBlocks,
    onRegenerateContextBlocks,

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
    onStopAdjustingStyle,
    onStopGenerating,

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

  const [blockContextMenu, setBlockContextMenu] =
    useState(null);
  const [batchInstructionTarget, setBatchInstructionTarget] =
    useState(null);
  const [contextEditingIds, setContextEditingIds] =
    useState([]);
  const [isBatchInstructionSubmitting, setIsBatchInstructionSubmitting] =
    useState(false);
  const batchInstructionCancelledRef = useRef(false);

  const contextFocusIds = useMemo(
    () =>
      new Set(
        (
          batchInstructionTarget?.targetIds?.length
            ? batchInstructionTarget.targetIds
            : contextEditingIds
        ).map(normalizeId)
      ),
    [batchInstructionTarget, contextEditingIds]
  );

  useEffect(() => {
    if (!blockContextMenu) return undefined;

    const closeMenu = () => setBlockContextMenu(null);
    const closeOnEscape = (event) => {
      if (event.key === "Escape") closeMenu();
    };

    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("blur", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("blur", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [blockContextMenu]);

  const handleBlockContextMenu = (event) => {
    const blockElement = event.target?.closest?.(
      "[data-semantic-block-id], [data-block-root='true'][data-block-id]"
    );
    if (!blockElement) return;

    const blockId =
      blockElement.getAttribute("data-semantic-block-id") ||
      blockElement.getAttribute("data-block-id");
    const clickedBlock = getBlockById?.(blockId);
    if (!clickedBlock) return;

    event.preventDefault();
    event.stopPropagation();

    // 右键是独立操作：退出文字编辑聚焦，清除浏览器文字选区，
    // 防止原有的编辑 dim 效果继续把其他模块压成灰色。
    if (
      document.activeElement?.matches?.(
        "[contenteditable='true']"
      )
    ) {
      document.activeElement.blur();
    }
    window.getSelection?.()?.removeAllRanges();
    setActiveEditingBlockId(null);

    const clickedIsSelected = selectedIds.some(
      (id) => normalizeId(id) === normalizeId(blockId)
    );
    const targetIds = clickedIsSelected
      ? selectedIds.map(normalizeId)
      : [normalizeId(blockId)];

    if (!clickedIsSelected) {
      onContextSelectBlocks?.([blockId]);
    }

    const rect = blockElement.getBoundingClientRect();
    setBlockContextMenu({
      x: event.clientX,
      y: event.clientY,
      targetIds,
      anchorElement: blockElement,
      anchorRect: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      },
    });
  };

  const openBatchInstructionComposer = () => {
    if (!blockContextMenu) return;
    setContextEditingIds([]);
    batchInstructionCancelledRef.current = false;
    setBatchInstructionTarget(blockContextMenu);
    setBlockContextMenu(null);
  };

  const deleteContextBlocks = () => {
    const targetIds = blockContextMenu?.targetIds || [];
    setBlockContextMenu(null);
    setBatchInstructionTarget(null);
    setContextEditingIds([]);
    onDeleteContextBlocks?.(targetIds);
  };

  const regenerateContextBlocks = () => {
    const targetIds = blockContextMenu?.targetIds || [];
    setBlockContextMenu(null);
    setBatchInstructionTarget(null);
    setContextEditingIds([]);
    onRegenerateContextBlocks?.(targetIds);
  };

  const editContextBlocks = () => {
    const targetIds = blockContextMenu?.targetIds || [];
    setBlockContextMenu(null);
    setBatchInstructionTarget(null);
    setContextEditingIds(targetIds);
    onContextSelectBlocks?.(targetIds);
  };

  const submitBatchInstruction = async (
    instructionText,
    instructionStyle
  ) => {
    const target = batchInstructionTarget;
    if (!target || isBatchInstructionSubmitting) return;

    const targetBlocks = target.targetIds
      .map((id) => getBlockById?.(id))
      .filter(Boolean);
    const instruction = {
      id:
        instructionStyle?.id ||
        `batch-instruction-${Date.now()}`,
      label: instructionStyle?.label || instructionText,
      instruction: instructionText,
      color: targetBlocks[0]?.color || "#7c83fd",
      fill: targetBlocks[0]?.fill || "rgba(124,131,253,0.08)",
    };

    batchInstructionCancelledRef.current = false;
    setIsBatchInstructionSubmitting(true);

    try {
      // 逐个回写现有模块文字；不创建、合并、排序或移动模块。
      for (const block of targetBlocks) {
        if (batchInstructionCancelledRef.current) break;
        await handleApplyInstructionToBlock(block, instruction);
      }
    } finally {
      setIsBatchInstructionSubmitting(false);
    }
  };

  const stopBatchInstruction = () => {
    batchInstructionCancelledRef.current = true;
    onStopAdjustingStyle?.();
    setIsBatchInstructionSubmitting(false);
  };

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
    hasActiveDragGesture,

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
    selectedIds,
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
              copiedBlock,
              duplicateResult?.blocks
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

      if (event.button === 0) {
        setContextEditingIds([]);
        setBatchInstructionTarget(null);
        setActiveEditingBlockId(null);
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
   * Floating 模块使用自定义鼠标拖拽而不是 HTML drag/drop。
   * 当鼠标移出 Stage 后松开（尤其拖向左侧灰区），Stage 的 mouseup
   * 不会触发；过去全局监听器只清理状态，模块因此回到原位置。
   * 这里在 Stage 外真正提交同一次放置，再结束拖拽。
   */
  useEffect(() => {
    const cancelStaleDrag =
      (reason, event, activeBlockId) => {
        console.debug(
          "[Drag Drop Debug] cancelled stale external drop",
          {
            reason,
            blockId:
              activeBlockId == null
                ? null
                : String(activeBlockId),
            clientX:
              event?.clientX ?? null,
            clientY:
              event?.clientY ?? null,
            target:
              event?.target?.tagName ||
              null,
          }
        );

        clearDragPointer();
        nativeDraggingBlockIdRef.current =
          null;
        onDragEnd?.();
      };

    /**
     * 新鼠标手势从 Stage 外开始时，必然不属于旧拖拽。
     * 在 toolbar mouseup 之前清除残留 ID，防止模块被放到“审阅”按钮下。
     */
    const handleWindowMouseDown =
      (event) => {
        const activeBlockId =
          nativeDraggingBlockIdRef.current ??
          draggingBlockId;

        if (
          activeBlockId == null ||
          !stageRef?.current ||
          stageRef.current.contains(
            event.target
          )
        ) {
          return;
        }

        cancelStaleDrag(
          "new-mousedown-outside-stage",
          event,
          activeBlockId
        );
      };

    const handleWindowMouseUp =
      (event) => {
        const activeBlockId =
          nativeDraggingBlockIdRef.current ??
          draggingBlockId;

        if (
          activeBlockId == null ||
          !stageRef?.current ||
          stageRef.current.contains(
            event.target
          )
        ) {
          return;
        }

        if (
          !hasActiveDragGesture?.(
            activeBlockId
          )
        ) {
          cancelStaleDrag(
            "mouseup-without-active-movement",
            event,
            activeBlockId
          );
          return;
        }

        console.debug(
          "[Drag Drop Debug] committing external drop",
          {
            blockId:
              String(activeBlockId),
            clientX:
              event.clientX,
            clientY:
              event.clientY,
          }
        );

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

    window.addEventListener(
      "mousedown",
      handleWindowMouseDown,
      true
    );

    window.addEventListener(
      "mouseup",
      handleWindowMouseUp
    );

    return () => {
      window.removeEventListener(
        "mousedown",
        handleWindowMouseDown,
        true
      );

      window.removeEventListener(
        "mouseup",
        handleWindowMouseUp
      );
    };
  }, [
    draggingBlockId,
    stageRef,
    handleFloatingDrop,
    clearDragPointer,
    hasActiveDragGesture,
    onClearSelection,
    onDragEnd,
  ]);

  /**
   * 左侧空白灰区不在 Stage DOM 内，原生 dragover / drop 不会冒泡到
   * handleStageDragOver / handleStageDrop。只在该灰区补一层 window 接收，
   * 然后复用完全相同的放置函数，使左右灰区行为一致。
   */
  useEffect(() => {
    const handleWindowDragOver =
      (event) => {
        const activeBlockId =
          nativeDraggingBlockIdRef.current ??
          draggingBlockId;

        if (
          !isLeftWorkspaceGutterTarget(event) ||
          !(
            activeBlockId != null ||
            isDraggingTemplate ||
            hasWorkspaceBlockPayload(event)
          )
        ) {
          return;
        }

        event.preventDefault();

        if (event.dataTransfer) {
          event.dataTransfer.dropEffect =
            activeBlockId == null
              ? "copy"
              : "move";
        }

        if (activeBlockId != null) {
          updateDragPointer(event);
        }
      };

    const handleWindowDrop =
      (event) => {
        const activeBlockId =
          nativeDraggingBlockIdRef.current ??
          draggingBlockId;

        if (
          !isLeftWorkspaceGutterTarget(event) ||
          !(
            activeBlockId != null ||
            isDraggingTemplate ||
            hasWorkspaceBlockPayload(event)
          )
        ) {
          return;
        }

        handleStageDrop(event);
      };

    window.addEventListener(
      "dragover",
      handleWindowDragOver
    );
    window.addEventListener(
      "drop",
      handleWindowDrop
    );

    return () => {
      window.removeEventListener(
        "dragover",
        handleWindowDragOver
      );
      window.removeEventListener(
        "drop",
        handleWindowDrop
      );
    };
  }, [
    draggingBlockId,
    isDraggingTemplate,
    updateDragPointer,
    handleStageDrop,
  ]);

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
        (event) => {
          if (
            event.button === 2 &&
            event.target?.closest?.(
              "[data-semantic-block-id], [data-block-root='true'][data-block-id]"
            )
          ) {
            // 阻止右键按下先走左键的模块编辑、拖拽和聚焦逻辑。
            event.stopPropagation();
            return;
          }

          handleDuplicatePointerDown(event);
        }
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
      onContextMenu={
        handleBlockContextMenu
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
          "var(--page-canvas-top-inset, 8px) 16px 20px",

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
                      copiedBlock,
                      duplicateResult?.blocks
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
                  copiedBlock,
                  duplicateResult?.blocks
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

              contextEditingIds={
                contextEditingIds
              }

              contextInstructionIds={
                batchInstructionTarget?.targetIds || []
              }

              onStopAdjustingStyle={
                onStopAdjustingStyle
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
                    contextFocusIds.size > 0
                      ? !(section.blocks || []).some((block) =>
                          contextFocusIds.has(normalizeId(block.id))
                        )
                      : activeEditingBlockId != null
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
        visualScale={zoom}
      />

      {floatingBlocks
        .filter(
          (block) => {
            if (!isDraggingFloatingBlock) {
              return true;
            }

            const draggingSelectedGroup =
              selectedIds.length > 1 &&
              selectedIds.some(
                (id) =>
                  normalizeId(id) ===
                  normalizeId(
                    draggingBlockId
                  )
              );

            if (draggingSelectedGroup) {
              return !selectedIds.some(
                (id) =>
                  normalizeId(id) ===
                  normalizeId(block.id)
              );
            }

            return (
              normalizeId(block.id) !==
              normalizeId(
                draggingBlockId
              )
            );
          }
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

              zoom={zoom}

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
                contextFocusIds.size > 0
                  ? !contextFocusIds.has(normalizeId(block.id))
                  : activeEditingBlockId != null &&
                    normalizeId(activeEditingBlockId) !==
                      normalizeId(block.id)
              }

              groupEditingEnabled={
                contextEditingIds.some(
                  (id) => normalizeId(id) === normalizeId(block.id)
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
                      copiedBlock,
                      duplicateResult?.blocks
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

      {blockContextMenu &&
        createPortal(
          <div
            role="menu"
            onPointerDown={(event) => event.stopPropagation()}
            style={{
              position: "fixed",
              left: Math.min(blockContextMenu.x, window.innerWidth - 190),
              top: Math.min(blockContextMenu.y, window.innerHeight - 174),
              zIndex: 20000,
              minWidth: 178,
              padding: 6,
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 10,
              background: "#ffffff",
              boxShadow: "0 10px 30px rgba(0,0,0,0.16)",
            }}
          >
            {[
              {
                key: "instruction",
                label: t("instruction.add"),
                action: openBatchInstructionComposer,
              },
              {
                key: "regenerate",
                label: t("contextMenu.regenerate"),
                action: regenerateContextBlocks,
              },
              {
                key: "edit",
                label: t("contextMenu.editText"),
                action: editContextBlocks,
              },
              {
                key: "delete",
                label: t("contextMenu.delete"),
                action: deleteContextBlocks,
                danger: true,
              },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                onClick={item.action}
                style={{
                  width: "100%",
                  border: 0,
                  borderRadius: 7,
                  background: "transparent",
                  padding: "9px 12px",
                  color: item.danger ? "#dc2626" : "#262626",
                  fontSize: 14,
                  textAlign: "left",
                  cursor: "pointer",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = item.danger
                    ? "#fef2f2"
                    : "#f3f4f6";
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = "transparent";
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}

      {batchInstructionTarget ? (
        <QuickInstructionComposer
          anchorRect={batchInstructionTarget.anchorRect}
          anchorElement={batchInstructionTarget.anchorElement}
          onClose={() => {
            if (isBatchInstructionSubmitting) return;
            setBatchInstructionTarget(null);
          }}
          onSubmit={submitBatchInstruction}
          isSubmitting={isBatchInstructionSubmitting}
          onStop={stopBatchInstruction}
        />
      ) : null}

    </div>
  );
}
