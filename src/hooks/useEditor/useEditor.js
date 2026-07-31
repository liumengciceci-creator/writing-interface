import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  cloneBlocks,
} from "../../utils";

import {
  buildSectionLayouts,
  makeCompletedText,
} from "./layout";

import {
  cloneSections,
  createEditingSection,
  normalizeSections,
} from "./sectionHelpers";

import {
  useEditorShortcuts,
} from "./shortcuts";

import {
  useStreamingGenerate,
} from "./useStreamingGenerate";

import {
  useStatus,
} from "./useStatus";

import {
  useZoom,
} from "./useZoom";

import {
  useHistory,
} from "./useHistory";

import {
  useSelection,
} from "./useSelection";

import {
  useBlockActions,
} from "./useBlockActions";

import {
  useInlineDocumentActions,
} from "./useInlineDocumentActions";

import {
  useAIActions,
} from "./useAIActions";

import {
  useMultiBlockActions,
} from "./useMultiBlockActions";

import {
  useCanvasDrop,
} from "./useCanvasDrop.jsx";

import {
  useBlockDuplicate,
} from "./useBlockDuplicate";

const INITIAL_SECTIONS = [
  {
    id: 1,
    mode: "editing",
    blocks: [],
  },
];

/**
 * 将同一个模块的多个 fragment 合并成一个包围区域。
 *
 * 旧的框选逻辑仍然可以使用这个区域。
 */
function buildBlockBoundsFromFragments(
  fragments
) {
  const boundsByBlockId =
    new Map();

  (
    fragments || []
  ).forEach((fragment) => {
    const blockId =
      fragment.blockId;

    if (
      blockId === null ||
      blockId === undefined
    ) {
      return;
    }

    const left =
      Number(fragment.x) || 0;

    const top =
      Number(fragment.y) || 0;

    const width =
      Number(fragment.width) ||
      0;

    const height =
      Number(fragment.height) ||
      0;

    const right =
      left + width;

    const bottom =
      top + height;

    if (
      !boundsByBlockId.has(
        blockId
      )
    ) {
      boundsByBlockId.set(
        blockId,
        {
          blockId,

          x: left,
          y: top,

          width,
          height,
        }
      );

      return;
    }

    const existing =
      boundsByBlockId.get(
        blockId
      );

    const nextLeft =
      Math.min(
        existing.x,
        left
      );

    const nextTop =
      Math.min(
        existing.y,
        top
      );

    const nextRight =
      Math.max(
        existing.x +
          existing.width,
        right
      );

    const nextBottom =
      Math.max(
        existing.y +
          existing.height,
        bottom
      );

    existing.x =
      nextLeft;

    existing.y =
      nextTop;

    existing.width =
      nextRight -
      nextLeft;

    existing.height =
      nextBottom -
      nextTop;
  });

  return Array.from(
    boundsByBlockId.values()
  );
}

export function useEditor() {
  /**
   * ID 生成器。
   *
   * 旧模块和部分 AI 操作仍然使用数字 ID，
   * 新的 inline 模块允许使用 UUID。
   */
  const nextBlockIdRef =
    useRef(1);

  const nextSectionIdRef =
    useRef(2);

  /**
   * 最近一次实际操作过的模块。
   * “完成”以它所在的段落为目标。
   */
  const lastActiveBlockIdRef =
    useRef(null);

  /**
   * 页面 DOM。
   */
  const stageRef =
    useRef(null);

  const pageRef =
    useRef(null);

  const contentRef =
    useRef(null);

  /**
   * 创建新的 editing section。
   */
  const createEditingSectionFn =
    useCallback(() => {
      return createEditingSection(
        nextSectionIdRef
      );
    }, []);

  /**
   * 文档数据。
   */
  const [
    sections,
    setSections,
  ] = useState(() =>
    cloneSections(
      INITIAL_SECTIONS
    )
  );

  /**
   * 当前从左侧栏拖入的模块类型。
   */
  const [
    draggingType,
    setDraggingType,
  ] = useState(null);

  /**
   * 当前拖动的已有模块 ID。
   */
  const [
    draggingBlockId,
    setDraggingBlockId,
  ] = useState(null);

  /**
   * 顶部状态提示。
   */
  const {
    statusText,
    setStatusText,
    showTemporaryStatus,
    clearStatusTimer,
  } = useStatus();

  /**
   * 页面缩放。
   */
  const {
    zoom,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useZoom();

  /**
   * 根据 sections 计算旧页面布局数据。
   *
   * floating 模块、completed section 和旧的框选逻辑
   * 仍然可以继续使用这些数据。
   */
  const {
    sectionLayouts,
    globalFragments,
    totalContentHeight,
  } = useMemo(() => {
    return buildSectionLayouts(
      sections
    );
  }, [sections]);

  /**
   * 将多行 fragment 合并为模块边界。
   */
  const blockBounds =
    useMemo(() => {
      return buildBlockBoundsFromFragments(
        globalFragments
      );
    }, [globalFragments]);

  /**
   * 模块选择。
   */
  const {
    selectedIds,
    setSelectedIds,

    isSelecting,
    selectionRect,

    clearSelection,

    handleBlockMouseDown:
      handleSelectionBlockMouseDown,

    handleSelectionStart,
    handleSelectionMove,
    handleSelectionEnd,
  } = useSelection({
    contentRef,
    zoom,

    totalContentHeight,
    blockBounds,

    draggingType,
    draggingBlockId,
  });

  const handleBlockMouseDown =
    useCallback(
      (event, blockId) => {
        lastActiveBlockIdRef.current =
          blockId;

        handleSelectionBlockMouseDown(
          event,
          blockId
        );
      },
      [
        handleSelectionBlockMouseDown,
      ]
    );

  /**
   * 清除当前交互状态。
   */
  const clearInteractionState =
    useCallback(() => {
      clearSelection();

      setDraggingType(null);
      setDraggingBlockId(
        null
      );
    }, [clearSelection]);

  /**
   * 历史记录。
   */
  const {
    pushHistorySnapshot,
    undoLastAction,
  } = useHistory({
    initialSections:
      INITIAL_SECTIONS,

    setSections,

    clearInteractionState,
  });

  /**
   * AI 流式生成。
   */
  const {
    isGenerating,
    generatingBlockIds,
    generatingBlinkOn,
    generationStatus,
    webSearchEnabled,
    toggleWebSearch,
    generateFromSelectedBlocks,
  } = useStreamingGenerate({
    sections,
    setSections,

    selectedIds,
    setSelectedIds,
  });

  /**
   * 模块基础操作。
   */
  const {
    getBlockById,

    handleUpdateFloatingBlockText,
    handleUpdateFloatingBlockWidth,

    updateBlockPlacement,
    handleUpdateBlockAppearance,

    handleChangeText,
    handleBatchChangeText,
    handleTextBlur,

    handleDeleteSelected,
  } = useBlockActions({
    sections,
    setSections,

    selectedIds,
    setSelectedIds,

    pushHistorySnapshot,
    createEditingSectionFn,
  });

  /**
   * 模块复制。
   *
   * 所有副本都会先以 floating 形式创建，
   * 后续可拖入正文并转换为 inline。
   */
  const {
  duplicateBlocks,
  duplicateSelectedBlocks,
  beginDuplicateDrag,
} = useBlockDuplicate({
  sections,

  /**
   * 用于定位 inline 模块。
   */
  sectionLayouts,

  stageRef,
  pageRef,
  contentRef,

  zoom,

  setSections,
  setSelectedIds,
  setDraggingBlockId,

  nextBlockIdRef,

  getBlockById,

  pushHistorySnapshot,
  createEditingSectionFn,
});

  /**
   * inline 文档结构操作。
   */
  const {
    handleInsertInlineBlock,
    handleReorderInlineBlocks,

    handleMoveInlineBlockBefore,
    handleMoveInlineBlockAfter,

    handleDeleteInlineBlock,
    handleDeleteInlineBlocks,
  } = useInlineDocumentActions({
    sections,
    setSections,

    selectedIds,
    setSelectedIds,

    pushHistorySnapshot,
    createEditingSectionFn,
  });

  /**
   * 单模块 AI 操作。
   *
   * 包括：
   * 1. 调整长度
   * 2. 调整文本风格
   */
  const {
    isAdjustingLength,
    adjustLengthError,
    adjustingLengthBlockId,

    isAdjustingStyle,
    adjustingStyleBlockId,
    adjustStyleError,

    handleApplyBlockLength,
    handleApplyBlockStyle,
  } = useAIActions({
    setSections,

    getBlockById,

    pushHistorySnapshot,

    showTemporaryStatus,
    setStatusText,
    clearStatusTimer,

    createEditingSectionFn,
  });

  /**
   * 多模块 AI 操作。
   *
   * 包括：
   * 1. 拼接
   * 2. 融合
   * 3. 模仿
   * 4. 建立联系
   */
  const {
    isApplyingMultiAction,
    multiActionError,
    clearMultiActionError,

    handleJoinBlocks,
    handleMergeBlocks,
    handleImitateBlock,
    handleRelateBlocks,
  } = useMultiBlockActions({
    sections,
    setSections,

    selectedIds,
    setSelectedIds,

    nextBlockIdRef,

    pushHistorySnapshot,
    createEditingSectionFn,

    showTemporaryStatus,
    setStatusText,
    clearStatusTimer,
  });

  /**
   * 页面拖拽与外部模块放置。
   */
  const {
    handleTemplateMouseDown,
    handleBlockDragStart,

    endBlockDrag,

    handleCanvasMouseUp,
    handleExternalDrop,
    handleGlobalMouseUp,
  } = useCanvasDrop({
    pageRef,
    zoom,

    sectionLayouts,
    totalContentHeight,

    draggingType,
    setDraggingType,

    draggingBlockId,
    setDraggingBlockId,

    isSelecting,
    selectionRect,

    setSections,
    setSelectedIds,

    nextBlockIdRef,

    pushHistorySnapshot,
    createEditingSectionFn,
  });

  /**
   * 当前可编辑模块数量。
   */
  const editableBlockCount =
    useMemo(() => {
      return sections
        .filter(
          (section) =>
            section.mode ===
            "editing"
        )
        .reduce(
          (
            total,
            section
          ) =>
            total +
            (
              section.blocks ||
              []
            ).filter(
              (block) =>
                !block
                  ?.isCompletedParagraph
            ).length,
          0
        );
    }, [sections]);

  /**
   * 只完成当前段落。
   * 当前段落优先取 selectedIds[0] 所在段落；
   * 没有选择时取最后一个仍可编辑的段落。
   */
  const handleComplete =
    useCallback(() => {
      if (
        editableBlockCount ===
        0
      ) {
        return;
      }

      setSections(
        (
          previousSections
        ) => {
          let targetSectionIndex =
            -1;

          let targetBlockIndex =
            -1;

          const preferredId =
            selectedIds?.[0] != null
              ? String(
                  selectedIds[0]
                )
              : lastActiveBlockIdRef
                    .current != null
                ? String(
                    lastActiveBlockIdRef
                      .current
                  )
                : null;

          if (preferredId) {
            previousSections.some(
              (section, sectionIndex) => {
                if (
                  section.mode !==
                    "editing" ||
                  !Array.isArray(
                    section.blocks
                  )
                ) {
                  return false;
                }

                const blockIndex =
                  section.blocks.findIndex(
                    (block) =>
                      !block
                        ?.isCompletedParagraph &&
                      String(
                        block.id
                      ) === preferredId
                  );

                if (blockIndex < 0) {
                  return false;
                }

                targetSectionIndex =
                  sectionIndex;
                targetBlockIndex =
                  blockIndex;
                return true;
              }
            );
          }

          if (
            targetSectionIndex < 0
          ) {
            for (
              let sectionIndex =
                previousSections.length -
                1;
              sectionIndex >= 0;
              sectionIndex -= 1
            ) {
              const section =
                previousSections[
                  sectionIndex
                ];

              if (
                section.mode !==
                  "editing" ||
                !Array.isArray(
                  section.blocks
                )
              ) {
                continue;
              }

              const blockIndex =
                section.blocks.findLastIndex(
                  (block) =>
                    !block
                      ?.isCompletedParagraph
                );

              if (blockIndex < 0) {
                continue;
              }

              targetSectionIndex =
                sectionIndex;
              targetBlockIndex =
                blockIndex;
              break;
            }
          }

          if (
            targetSectionIndex < 0 ||
            targetBlockIndex < 0
          ) {
            return previousSections;
          }

          const targetSection =
            previousSections[
              targetSectionIndex
            ];

          const sourceBlocks =
            targetSection.blocks;

          let paragraphStart =
            targetBlockIndex;

          while (
            paragraphStart > 0 &&
            !sourceBlocks[
              paragraphStart
            ]?.forceLineBreakBefore &&
            !sourceBlocks[
              paragraphStart - 1
            ]?.isCompletedParagraph
          ) {
            paragraphStart -= 1;
          }

          let paragraphEnd =
            targetBlockIndex + 1;

          while (
            paragraphEnd <
              sourceBlocks.length &&
            !sourceBlocks[
              paragraphEnd
            ]?.forceLineBreakBefore &&
            !sourceBlocks[
              paragraphEnd
            ]?.isCompletedParagraph
          ) {
            paragraphEnd += 1;
          }

          const paragraphBlocks =
            cloneBlocks(
              sourceBlocks.slice(
                paragraphStart,
                paragraphEnd
              )
            );

          if (
            paragraphBlocks.length ===
            0
          ) {
            return previousSections;
          }

          /**
           * 记录完成前这段模块在页面中真实占用的高度。
           * 合并为纯文字后继续保留这段空间，后面的段落不会上移。
           */
          const paragraphBlockIdSet =
            new Set(
              paragraphBlocks.map(
                (block) =>
                  String(block.id)
              )
            );

          const paragraphRects =
            Array.from(
              contentRef.current
                ?.querySelectorAll?.(
                  "[data-semantic-block-id]"
                ) || []
            )
              .filter(
                (element) =>
                  paragraphBlockIdSet.has(
                    String(
                      element.getAttribute(
                        "data-semantic-block-id"
                      )
                    )
                  )
              )
              .flatMap(
                (element) =>
                  Array.from(
                    element.getClientRects?.() ||
                      []
                  )
              )
              .filter(
                (rect) =>
                  rect.width > 0 &&
                  rect.height > 0
              );

          let completedPreservedHeight =
            null;

          if (
            paragraphRects.length > 0
          ) {
            const contentElement =
              contentRef.current;

            const contentRect =
              contentElement
                ?.getBoundingClientRect();

            const scaleY =
              contentElement
                ?.offsetHeight > 0 &&
              contentRect?.height > 0
                ? contentRect.height /
                  contentElement.offsetHeight
                : zoom || 1;

            const top =
              Math.min(
                ...paragraphRects.map(
                  (rect) => rect.top
                )
              );

            const bottom =
              Math.max(
                ...paragraphRects.map(
                  (rect) => rect.bottom
                )
              );

            completedPreservedHeight =
              Math.max(
                38,
                (bottom - top) /
                  Math.max(
                    scaleY,
                    0.001
                  )
              );
          }

          const completedParagraph = {
            id:
              `completed-paragraph-${nextBlockIdRef.current++}`,
            type:
              "CompletedParagraph",
            placement:
              "inline",
            isCompletedParagraph:
              true,
            forceLineBreakBefore:
              Boolean(
                paragraphBlocks[0]
                  ?.forceLineBreakBefore
              ),
            text:
              makeCompletedText(
                paragraphBlocks
              ),
            completedBlocks:
              paragraphBlocks,

            completedPreservedHeight,
          };

          const nextSections =
            cloneSections(
              previousSections
            );

          nextSections[
            targetSectionIndex
          ] = {
            ...nextSections[
              targetSectionIndex
            ],
            blocks: [
              ...cloneBlocks(
                sourceBlocks.slice(
                  0,
                  paragraphStart
                )
              ),
              completedParagraph,
              ...cloneBlocks(
                sourceBlocks.slice(
                  paragraphEnd
                )
              ),
            ],
          };

          pushHistorySnapshot(
            previousSections
          );

          return normalizeSections(
            nextSections,
            createEditingSectionFn
          );
        }
      );

      clearInteractionState();

      setStatusText("");
    }, [
      editableBlockCount,
      selectedIds,

      setSections,
      pushHistorySnapshot,

      createEditingSectionFn,
      clearInteractionState,

      setStatusText,
      contentRef,
      zoom,
    ]);

  /**
   * 双击已完成的纯文字段落时，
   * 在原位置恢复它保存的全部模块。
   */
  const handleRestoreCompletedParagraph =
    useCallback(
      (completedBlockId) => {
        const targetId =
          String(
            completedBlockId
          );

        setSections(
          (previousSections) => {
            let restored =
              false;

            const nextSections =
              previousSections.map(
                (section) => {
                  if (
                    section.mode !==
                      "editing" ||
                    !Array.isArray(
                      section.blocks
                    )
                  ) {
                    return section;
                  }

                  const blockIndex =
                    section.blocks.findIndex(
                      (block) =>
                        block
                          ?.isCompletedParagraph &&
                        String(
                          block.id
                        ) ===
                          targetId
                    );

                  if (blockIndex < 0) {
                    return section;
                  }

                  const completedBlock =
                    section.blocks[
                      blockIndex
                    ];

                  const restoredBlocks =
                    cloneBlocks(
                      completedBlock
                        .completedBlocks ||
                        []
                    );

                  if (
                    restoredBlocks.length ===
                    0
                  ) {
                    return section;
                  }

                  restored = true;

                  return {
                    ...section,
                    blocks: [
                      ...cloneBlocks(
                        section.blocks.slice(
                          0,
                          blockIndex
                        )
                      ),
                      ...restoredBlocks,
                      ...cloneBlocks(
                        section.blocks.slice(
                          blockIndex + 1
                        )
                      ),
                    ],
                  };
                }
              );

            if (!restored) {
              return previousSections;
            }

            pushHistorySnapshot(
              previousSections
            );

            return normalizeSections(
              nextSections,
              createEditingSectionFn
            );
          }
        );

        clearInteractionState();
      },
      [
        clearInteractionState,
        createEditingSectionFn,
        pushHistorySnapshot,
        setSections,
      ]
    );

  /**
   * 将 completed section 恢复为 editing。
   */
  const handleRestoreCompletedSection =
    useCallback(
      (sectionId) => {
        setSections(
          (
            previousSections
          ) => {
            pushHistorySnapshot(
              previousSections
            );

            const nextSections =
              cloneSections(
                previousSections.map(
                  (section) => {
                    const isTarget =
                      String(
                        section.id
                      ) ===
                        String(
                          sectionId
                        ) &&
                      section.mode ===
                        "completed";

                    if (
                      !isTarget
                    ) {
                      return section;
                    }

                    return {
                      ...section,

                      mode:
                        "editing",

                      completedText:
                        undefined,
                    };
                  }
                )
              );

            return normalizeSections(
              nextSections,
              createEditingSectionFn
            );
          }
        );
      },
      [
        setSections,
        pushHistorySnapshot,
        createEditingSectionFn,
      ]
    );

  /**
   * 更新 completed section 的完整文本。
   */
  const handleUpdateCompletedSectionText =
    useCallback(
      (
        sectionId,
        nextText
      ) => {
        setSections(
          (
            previousSections
          ) => {
            const targetSection =
              previousSections.find(
                (section) =>
                  String(
                    section.id
                  ) ===
                    String(
                      sectionId
                    ) &&
                  section.mode ===
                    "completed"
              );

            if (
              !targetSection
            ) {
              return previousSections;
            }

            const normalizedText =
              String(
                nextText ?? ""
              );

            if (
              String(
                targetSection.completedText ??
                  ""
              ) ===
              normalizedText
            ) {
              return previousSections;
            }

            pushHistorySnapshot(
              previousSections
            );

            return previousSections.map(
              (section) => {
                const isTarget =
                  String(
                    section.id
                  ) ===
                    String(
                      sectionId
                    ) &&
                  section.mode ===
                    "completed";

                if (
                  !isTarget
                ) {
                  return section;
                }

                return {
                  ...section,

                  completedText:
                    normalizedText,
                };
              }
            );
          }
        );
      },
      [
        setSections,
        pushHistorySnapshot,
      ]
    );

  /**
   * 全局快捷键。
   */
  useEditorShortcuts({
    selectedIds,

    isGenerating,

    draggingType,
    draggingBlockId,

    undoLastAction,

    zoomIn,
    zoomOut,
    resetZoom,

    handleDeleteSelected,
    generateFromSelectedBlocks,
    duplicateSelectedBlocks,


    handleGlobalMouseUp,
  });

  return {
    /**
     * 原始文档数据。
     */
    sections,

    /**
     * 页面与选择状态。
     */
    zoom,

    selectedIds,
    selectionRect,

    /**
     * AI 状态。
     */
    isGenerating,
    generatingBlockIds,
    generatingBlinkOn,
    generationStatus,
    webSearchEnabled,
    toggleWebSearch,

    isAdjustingLength,
    adjustLengthError,
    adjustingLengthBlockId,

    isAdjustingStyle,
    adjustingStyleBlockId,
    adjustStyleError,

    isApplyingMultiAction,
    multiActionError,

    /**
     * 状态提示。
     */
    statusText,

    /**
     * DOM refs。
     */
    stageRef,
    pageRef,
    contentRef,

    /**
     * 拖拽状态。
     */
    draggingBlockId,

    endBlockDrag,

    /**
     * 页面布局。
     */
    editableBlockCount,

    sectionLayouts,
    totalContentHeight,

    /**
     * 左侧模块和页面拖拽。
     */
    handleTemplateMouseDown,
    handleCanvasMouseUp,
    handleBlockDragStart,
    handleExternalDrop,

    /**
     * floating 模块。
     */
    handleUpdateFloatingBlockText,
    handleUpdateFloatingBlockWidth,

    /**
     * 模块外观。
     */
    handleUpdateBlockAppearance,

    /**
     * 模块文本。
     */
    handleChangeText,
    handleBatchChangeText,
    handleTextBlur,

    /**
     * inline 模块结构操作。
     */
    handleInsertInlineBlock,
    handleReorderInlineBlocks,

    handleMoveInlineBlockBefore,
    handleMoveInlineBlockAfter,

    handleDeleteInlineBlock,
    handleDeleteInlineBlocks,

    /**
     * 通用模块查找与 placement。
     */
    getBlockById,
    updateBlockPlacement,

    /**
     * 模块复制。
     */
    duplicateBlocks,
    duplicateSelectedBlocks,
    beginDuplicateDrag,

    /**
     * 选择操作。
     */
    handleBlockMouseDown,

    handleSelectionStart,
    handleSelectionMove,
    handleSelectionEnd,

    clearSelection,

    /**
     * section 操作。
     */
    handleComplete,
    handleRestoreCompletedParagraph,
    handleRestoreCompletedSection,
    handleUpdateCompletedSectionText,

    /**
     * 单模块 AI 操作。
     */
    handleApplyBlockLength,
    handleApplyBlockStyle,

    /**
     * 多模块 AI 操作。
     */
    handleJoinBlocks,
    handleMergeBlocks,
    handleImitateBlock,
    handleRelateBlocks,

    clearMultiActionError,

    /**
     * 页面缩放和历史记录。
     */
    zoomIn,
    zoomOut,
    resetZoom,

    undoLastAction,

    /**
     * AI 生成。
     */
    generateFromSelectedBlocks,
  };
}

export default useEditor;
