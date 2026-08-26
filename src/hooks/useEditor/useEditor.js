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

import {
  getInlineParagraphBlockIndices,
  isEditableInlineBlock,
  restoreCompletedParagraphBlocks,
} from "./paragraphBlocks";

const INITIAL_SECTIONS = [
  {
    id: 1,
    mode: "editing",
    blocks: [],
  },
];

/**
 * 完成段落被编辑后，恢复模块时按照原模块文字长度比例重新分配文本。
 * 这样修改后的内容不会在双击恢复时退回旧版本。
 */
function distributeCompletedText(
  text,
  blocks
) {
  const sourceBlocks =
    cloneBlocks(blocks || []);

  if (
    sourceBlocks.length === 0
  ) {
    return sourceBlocks;
  }

  const value =
    String(text ?? "").trim();

  if (
    sourceBlocks.length === 1
  ) {
    sourceBlocks[0].text =
      value;
    return sourceBlocks;
  }

  const lengths =
    sourceBlocks.map(
      (block) =>
        Math.max(
          1,
          String(
            block.text ?? ""
          ).length
        )
    );

  const totalLength =
    lengths.reduce(
      (sum, length) =>
        sum + length,
      0
    );

  let sourceOffset = 0;
  let consumedWeight = 0;

  sourceBlocks.forEach(
    (block, index) => {
      if (
        index ===
        sourceBlocks.length - 1
      ) {
        block.text =
          value
            .slice(sourceOffset)
            .trim();
        return;
      }

      consumedWeight +=
        lengths[index];

      const idealOffset =
        Math.round(
          value.length *
            (consumedWeight /
              totalLength)
        );

      let splitOffset =
        Math.max(
          sourceOffset,
          idealOffset
        );

      /**
       * 在理想切点附近优先寻找空格或中文/英文标点，
       * 尽量避免从一个词或句子中间切开。
       */
      for (
        let distance = 0;
        distance <= 12;
        distance += 1
      ) {
        const candidates = [
          idealOffset + distance,
          idealOffset - distance,
        ];

        const matched =
          candidates.find(
            (candidate) =>
              candidate >
                sourceOffset &&
              candidate <
                value.length &&
              /[\s，。！？；：、,.!?;:]/.test(
                value[
                  candidate - 1
                ] || ""
              )
          );

        if (
          matched != null
        ) {
          splitOffset =
            matched;
          break;
        }
      }

      block.text =
        value
          .slice(
            sourceOffset,
            splitOffset
          )
          .trim();

      sourceOffset =
        splitOffset;
    }
  );

  return sourceBlocks;
}

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
    redoLastAction,
    canUndo,
    canRedo,
  } = useHistory({
    initialSections:
      INITIAL_SECTIONS,

    sections,

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
    generationFailure,
    webSearchEnabled,
    toggleWebSearch,
    generateFromSelectedBlocks,
    retryFailedGeneration,
    dismissGenerationFailure,
    stopGenerating,
  } = useStreamingGenerate({
    sections,
    setSections,

    pushHistorySnapshot,

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
  selectedIds,
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
    cancelTemplateDrag,
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

    selectedIds,

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
              isEditableInlineBlock
            ).length,
          0
        );
    }, [sections]);

  /** 当前操作段落是否已经隐藏模块外观。 */
  const activeParagraphModulesHidden =
    useMemo(() => {
      let targetSection = null;
      let targetBlockIndex = -1;

      const preferredId =
        selectedIds?.[0] != null
          ? String(selectedIds[0])
          : lastActiveBlockIdRef.current != null
            ? String(lastActiveBlockIdRef.current)
            : null;

      if (preferredId) {
        sections.some((section) => {
          if (
            section?.mode !== "editing" ||
            !Array.isArray(section.blocks)
          ) {
            return false;
          }

          const blockIndex =
            section.blocks.findIndex(
              (block) =>
                isEditableInlineBlock(block) &&
                String(block.id) === preferredId
            );

          if (blockIndex < 0) return false;

          targetSection = section;
          targetBlockIndex = blockIndex;
          return true;
        });
      }

      if (!targetSection) {
        for (
          let index = sections.length - 1;
          index >= 0;
          index -= 1
        ) {
          const section = sections[index];
          const blockIndex =
            section?.mode === "editing" &&
            Array.isArray(section.blocks)
              ? section.blocks.findLastIndex(
                  isEditableInlineBlock
                )
              : -1;

          if (blockIndex >= 0) {
            targetSection = section;
            targetBlockIndex = blockIndex;
            break;
          }
        }
      }

      if (!targetSection || targetBlockIndex < 0) {
        return false;
      }

      const sourceBlocks = targetSection.blocks;
      const paragraphIndices = getInlineParagraphBlockIndices(
        sourceBlocks,
        targetBlockIndex
      );
      const paragraphBlocks = paragraphIndices.map(
        (index) => sourceBlocks[index]
      );

      return (
        paragraphBlocks.length > 0 &&
        paragraphBlocks.every(
          (block) =>
            block.isModuleHidden === true
        )
      );
    }, [sections, selectedIds]);

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
                      isEditableInlineBlock(block) &&
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
                  isEditableInlineBlock
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

          const paragraphIndices =
            getInlineParagraphBlockIndices(
              sourceBlocks,
              targetBlockIndex
            );

          const paragraphBlocks =
            cloneBlocks(
              paragraphIndices.map(
                (blockIndex) =>
                  sourceBlocks[blockIndex]
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
            /**
             * 完成后 block.type 会变成 CompletedParagraph。
             * 单独保存标题身份，避免渲染时丢失 Title 类型。
             */
            isCompletedTitle:
              paragraphBlocks.length > 0 &&
              paragraphBlocks.every(
                (block) =>
                  block?.type === "Title"
              ),
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

          const paragraphIndexSet =
            new Set(
              paragraphIndices
            );

          const firstParagraphIndex =
            paragraphIndices[0];

          nextSections[
            targetSectionIndex
          ] = {
            ...nextSections[
              targetSectionIndex
            ],
            blocks:
              cloneBlocks(
                sourceBlocks
              ).flatMap(
                (block, blockIndex) => {
                  if (
                    blockIndex ===
                    firstParagraphIndex
                  ) {
                    return [
                      completedParagraph,
                    ];
                  }

                  return paragraphIndexSet.has(
                    blockIndex
                  )
                    ? []
                    : [block];
                }
              ),
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
   * 只隐藏/恢复当前段落的模块外观，不改变模块结构、文字和排版。
   */
  const handleToggleModuleVisibility =
    useCallback(() => {
      setSections(
        (previousSections) => {
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
                      isEditableInlineBlock(block) &&
                      String(block.id) ===
                        preferredId
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

              const blockIndex =
                section.mode ===
                  "editing" &&
                Array.isArray(
                  section.blocks
                )
                  ? section.blocks.findLastIndex(
                      isEditableInlineBlock
                    )
                  : -1;

              if (blockIndex >= 0) {
                targetSectionIndex =
                  sectionIndex;
                targetBlockIndex =
                  blockIndex;
                break;
              }
            }
          }

          if (
            targetSectionIndex < 0 ||
            targetBlockIndex < 0
          ) {
            return previousSections;
          }

          const sourceBlocks =
            previousSections[
              targetSectionIndex
            ].blocks;

          const paragraphIndices =
            getInlineParagraphBlockIndices(
              sourceBlocks,
              targetBlockIndex
            );

          if (
            paragraphIndices.length ===
            0
          ) {
            return previousSections;
          }

          const shouldHide =
            paragraphIndices
              .map(
                (blockIndex) =>
                  sourceBlocks[blockIndex]
              )
              .some(
                (block) =>
                  block
                    ?.isModuleHidden !==
                  true
              );

          const nextSections =
            cloneSections(
              previousSections
            );

          nextSections[
            targetSectionIndex
          ].blocks =
            nextSections[
              targetSectionIndex
            ].blocks.map(
              (block, blockIndex) =>
                paragraphIndices.includes(
                  blockIndex
                )
                  ? {
                      ...block,
                      isModuleHidden:
                        shouldHide,
                    }
                  : block
            );

          pushHistorySnapshot(
            previousSections
          );

          return nextSections;
        }
      );

      setStatusText("");
    }, [
      selectedIds,
      setSections,
      pushHistorySnapshot,
      setStatusText,
    ]);

  /**
   * 双击已完成的纯文字段落时，
   * 在原位置恢复它保存的全部模块。
   */
  const handleRestoreCompletedParagraph =
    useCallback(
      (
        completedBlockId,
        latestCompletedText = null
      ) => {
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

                  let restoredBlocks =
                    restoreCompletedParagraphBlocks(
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

                  const originalCompletedText =
                    makeCompletedText(
                      restoredBlocks
                    );

                  const textToRestore =
                    latestCompletedText !=
                    null
                      ? String(
                          latestCompletedText
                        )
                      : String(
                          completedBlock.text ??
                            ""
                        );

                  if (
                    textToRestore.trim() !==
                    String(
                      originalCompletedText
                    ).trim()
                  ) {
                    restoredBlocks =
                      distributeCompletedText(
                        textToRestore,
                        restoredBlocks
                      );
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

            /**
             * 双击发生在 contentEditable 的 blur 之前。
             * 如果用户刚编辑完文字就直接双击，React state 里仍可能
             * 是旧文字。撤销“恢复模块”时应回到已经编辑好的完整段落，
             * 所以历史快照也要写入这次从 DOM 读取到的最新文字。
             */
            const historySections =
              latestCompletedText == null
                ? previousSections
                : previousSections.map(
                    (section) => ({
                      ...section,
                      blocks:
                        Array.isArray(
                          section.blocks
                        )
                          ? section.blocks.map(
                              (block) =>
                                block
                                  ?.isCompletedParagraph &&
                                String(
                                  block.id
                                ) === targetId
                                  ? {
                                      ...block,
                                      text:
                                        String(
                                          latestCompletedText
                                        ),
                                    }
                                  : block
                            )
                          : section.blocks,
                    })
                  );

            pushHistorySnapshot(
              historySections
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
   * 为审阅派生一份完整模块快照。
   *
   * 这里必须保持只读：点击“审阅”不能 setSections，也不能创建历史记录。
   * 旧实现会把派生快照重新写回画布；一旦快照中含旧 placement、段落起点
   * 或 floating 坐标，通常排在首位的模块就会在审阅开始时发生漂移。
   */
  const handleRestoreAllCompletedForReview =
    useCallback(() => {
      const restoredSections =
        cloneSections(sections).map((section) => {
          if (!Array.isArray(section.blocks)) {
            return section;
          }

          const restoredBlocks = section.blocks.flatMap((block) => {
            if (!block?.isCompletedParagraph) {
              return [{
                ...block,
                isModuleHidden: false,
              }];
            }

            let sourceBlocks = restoreCompletedParagraphBlocks(
              block.completedBlocks || []
            );
            if (!sourceBlocks.length) {
              return [];
            }

            const completedText = String(block.text || "");
            const originalText = makeCompletedText(sourceBlocks);
            if (completedText.trim() !== originalText.trim()) {
              sourceBlocks = distributeCompletedText(completedText, sourceBlocks);
            }

            return sourceBlocks.map((sourceBlock) => ({
              ...sourceBlock,
              isModuleHidden: false,
            }));
          });

          return {
            ...section,
            blocks: restoredBlocks,
          };
        });

      return restoredSections;
    }, [
      sections,
    ]);

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
    redoLastAction,

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
    generationFailure,
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
    setStatusText,
    showTemporaryStatus,

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
    isDraggingTemplate:
      draggingType != null,

    endBlockDrag,

    /**
     * 页面布局。
     */
    editableBlockCount,
    activeParagraphModulesHidden,

    sectionLayouts,
    totalContentHeight,

    /**
     * 左侧模块和页面拖拽。
     */
    handleTemplateMouseDown,
    cancelTemplateDrag,
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
    handleToggleModuleVisibility,
    handleRestoreCompletedParagraph,
    handleRestoreCompletedSection,
    handleRestoreAllCompletedForReview,
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
    redoLastAction,
    canUndo,
    canRedo,
    pushHistorySnapshot,

    /**
     * AI 生成。
     */
    generateFromSelectedBlocks,
    retryFailedGeneration,
    dismissGenerationFailure,
    stopGenerating,
  };
}

export default useEditor;
