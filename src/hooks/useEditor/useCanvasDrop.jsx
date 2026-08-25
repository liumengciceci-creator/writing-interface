import {
  useCallback,
} from "react";

import {
  BLOCK_HEIGHT,
  BLOCK_WIDTH,
  CONTENT_LEFT,
  CONTENT_TOP,
  CONTENT_WIDTH,
} from "../../constants";

import {
  clamp,
} from "../../utils";

import {
  getInsertIndexFromPointer,
} from "./layout";

import {
  cloneSections,
  findBlockLocation,
  normalizeSections,
} from "./sectionHelpers";

import {
  SEMANTIC_BLOCK_MIME,
  WRITING_BLOCK_MIME,
  clearActiveTemplateDragData,
  getActiveTemplateDragData,
  getTemplateFloatingWidth,
} from "../../utils/templateDrag.js";

/**
 * 判断鼠标事件是否发生在新的语义编辑器中。
 */
function isInsideSingleSemanticEditor(
  event
) {
  const target =
    event?.target;

  if (
    !target ||
    !(target instanceof Element)
  ) {
    return false;
  }

  return Boolean(
    target.closest(
      "[data-single-semantic-editor='true']"
    )
  );
}

/**
 * drop 阶段直接恢复 Sidebar 标签数据。
 * React 的临时 draggingType 可能因 dragend、删除后的重渲染或浏览器
 * 事件顺序提前清空；原生 DataTransfer 才是本次手势的最终数据源。
 */
function readTemplateDragPayload(event) {
  const dataTransfer =
    event?.dataTransfer;

  if (!dataTransfer) {
    return null;
  }

  const types = [
    WRITING_BLOCK_MIME,
    SEMANTIC_BLOCK_MIME,
    "application/json",
  ];

  for (const type of types) {
    const raw =
      dataTransfer.getData(type);

    if (!raw) {
      continue;
    }

    try {
      const payload = JSON.parse(raw);

      if (
        payload?.kind === "existing-block" ||
        payload?.source === "semantic-editor"
      ) {
        return null;
      }

      if (payload?.type || payload?.label) {
        return payload;
      }
    } catch {
      // 继续尝试下一个 ArguWeave 数据格式。
    }
  }

  return getActiveTemplateDragData();
}


/**
 * 获取 PageCanvas 最外层 Stage。
 *
 * handleCanvasMouseUp 通常绑定在 Stage 上，
 * 因此优先使用 event.currentTarget。
 */
function getStageElement(
  event,
  pageElement
) {
  const currentTarget =
    event?.currentTarget;

  if (
    currentTarget instanceof
      Element &&
    pageElement &&
    currentTarget.contains(
      pageElement
    )
  ) {
    return currentTarget;
  }

  return (
    pageElement?.parentElement
      ?.parentElement ||
    null
  );
}

export function useCanvasDrop({
  pageRef,
  zoom,

  sectionLayouts,
  totalContentHeight,

  draggingType,
  setDraggingType,

  draggingBlockId,
  setDraggingBlockId,

  selectedIds = [],

  isSelecting,
  selectionRect,

  setSections,
  setSelectedIds,

  nextBlockIdRef,

  pushHistorySnapshot,
  createEditingSectionFn,
}) {
  /**
   * 开始拖动左侧模板。
   */
  const handleTemplateMouseDown =
    useCallback(
      (item) => {
        setDraggingType(
          item
        );
      },
      [setDraggingType]
    );

  /**
   * 原生 dragend 无论是成功放置、取消，还是浏览器拒绝 drop 都会触发。
   * 这里只清除 Sidebar 模板，避免一次失败的拖拽污染下一次手势。
   */
  const cancelTemplateDrag =
    useCallback(() => {
      setDraggingType(null);
    }, [setDraggingType]);

  /**
   * 开始拖动已有模块。
   */
  const handleBlockDragStart =
    useCallback(
      (blockId) => {
        setDraggingBlockId(
          blockId
        );
      },
      [
        setDraggingBlockId,
      ]
    );

  /**
   * 清除当前拖拽状态。
   */
  const clearDragState =
    useCallback(() => {
      setDraggingType(
        null
      );

      setDraggingBlockId(
        null
      );
    }, [
      setDraggingType,
      setDraggingBlockId,
    ]);

  /**
   * 结束已有模块拖动。
   */
  const endBlockDrag =
    useCallback(() => {
      setDraggingBlockId(
        null
      );
    }, [
      setDraggingBlockId,
    ]);

  /**
   * 根据鼠标纵向坐标找到目标 editing section。
   */
  const getTargetEditingLayout =
    useCallback(
      (pointerY) => {
        const editingLayouts =
          sectionLayouts.filter(
            (section) =>
              section.mode ===
              "editing"
          );

        if (
          editingLayouts.length ===
          0
        ) {
          return null;
        }

        /**
         * 鼠标位于某个编辑区内部。
         */
        const inside =
          editingLayouts.find(
            (section) =>
              pointerY >=
                section.top &&
              pointerY <=
                section.top +
                  section.height
          );

        if (inside) {
          return inside;
        }

        /**
         * 鼠标位于第一个编辑区上方。
         */
        if (
          pointerY <
          editingLayouts[0].top
        ) {
          return editingLayouts[0];
        }

        /**
         * 其他情况放入最后一个编辑区。
         */
        return editingLayouts[
          editingLayouts.length -
            1
        ];
      },
      [sectionLayouts]
    );

  /**
   * 鼠标在画布上松开。
   *
   * 负责：
   * 1. 旧画布区域中的模板放置
   * 2. 旧的已有模块移动
   *
   * 如果鼠标位于 SingleSemanticEditor 内，
   * 新模块插入交给编辑器自己的 onDrop。
   */
  const handleCanvasMouseUp =
    useCallback(
      (event) => {
        const draggedTemplate =
          draggingType ||
          readTemplateDragPayload(event);

        /**
         * 正在框选时不执行拖拽放置。
         */
        if (
          (
            isSelecting ||
            selectionRect
          ) &&
          !draggedTemplate
        ) {
          clearDragState();

          return;
        }

        /**
         * Sidebar 模板直接放进新的语义编辑器时，
         * 不在这里重复创建。
         *
         * SingleSemanticEditor 自己的 onDrop 会把模块
         * 插入到精确的文字 inline 位置。
         */
        if (
          draggedTemplate &&
          isInsideSingleSemanticEditor(
            event
          )
        ) {
          clearDragState();

          return;
        }

        if (
          !pageRef.current
        ) {
          clearDragState();

          return;
        }

        const pageElement =
          pageRef.current;

        const pageRect =
          pageElement.getBoundingClientRect();

        /**
         * 鼠标相对于整个白色页面的坐标。
         * Page 位于缩放容器中，因此要除以 zoom。
         */
        const pageX =
          (event.clientX -
            pageRect.left) /
          zoom;

        const pageY =
          (event.clientY -
            pageRect.top) /
          zoom;

        /**
         * 鼠标相对于正文内容区的坐标。
         */
        const x =
          pageX -
          CONTENT_LEFT;

        const y =
          pageY -
          CONTENT_TOP;

        /**
         * 只要放在白色页面中，就创建为 inline。
         * 即使放在页边距，也会吸附到最近的正文位置。
         */
        const insidePage =
          pageX >= 0 &&
          pageX <=
            pageElement.offsetWidth &&
          pageY >= 0 &&
          pageY <=
            pageElement.offsetHeight;

        /**
         * 原有正文区域判断继续用于已有模块移动。
         */
        const insideContent =
          x >= 0 &&
          x <=
            CONTENT_WIDTH &&
          y >= 0 &&
          y <=
            totalContentHeight;

        /**
         * 情况一：
         * 从 Sidebar 创建新模块。
         *
         * 白色页面 -> inline
         * 灰色区域 -> floating
         */
        if (draggedTemplate) {
          const newBlockId =
            nextBlockIdRef
              .current++;

          const blockWidth =
            draggedTemplate.width ??
            BLOCK_WIDTH;

          /**
           * 新建模块优先使用 Sidebar 标签本身的文字。
           */
          const templateText =
            String(
              draggedTemplate.label ||
                draggedTemplate.text ||
                draggedTemplate.type ||
                ""
            );

          /**
           * floating 初始宽度只包住标签文字，
           * 避免创建后变成长条。
           */
          const initialFloatingWidth =
            getTemplateFloatingWidth(
              templateText
            );

          /**
           * 白色页面中的鼠标位置吸附到正文范围，
           * 以便计算 inline 插入位置。
           */
          const inlineX =
            clamp(
              x,
              0,
              CONTENT_WIDTH
            );

          const inlineY =
            clamp(
              y,
              0,
              Math.max(
                0,
                totalContentHeight
              )
            );

          const targetLayout =
            insidePage
              ? getTargetEditingLayout(
                  inlineY
                )
              : null;

          const localY =
            targetLayout
              ? clamp(
                  inlineY -
                    targetLayout.top,
                  0,
                  targetLayout.height
                )
              : 0;

          /**
           * floating 坐标相对于整个 Stage。
           * 坐标体系与 useFloatingBlocks 完全一致。
           */
          const stageElement =
            getStageElement(
              event,
              pageElement
            );

          const stageRect =
            stageElement
              ?.getBoundingClientRect();

          const floatingX =
            stageRect
              ? event.clientX -
                stageRect.left -
                Math.min(
                  initialFloatingWidth / 2,
                  60
                )
              : 0;

          const floatingY =
            stageRect
              ? event.clientY -
                stageRect.top -
                20
              : 0;

          const newBlock = {
            id:
              newBlockId,

            width:
              blockWidth,

            height:
              BLOCK_HEIGHT,

            text:
              templateText,

            type:
              draggedTemplate.type,

            label:
              draggedTemplate.label,

            color:
              draggedTemplate.color,

            fill:
              draggedTemplate.fill,

            isGenerated:
              false,

            completionGroupId:
              null,

            placement:
              insidePage
                ? "inline"
                : "floating",

            floatingX:
              insidePage
                ? null
                : floatingX,

            floatingY:
              insidePage
                ? null
                : floatingY,

            floatingWidth:
              insidePage
                ? null
                : initialFloatingWidth,
          };

          setSections(
            (
              previousSections
            ) => {
              const nextSections =
                normalizeSections(
                  previousSections,
                  createEditingSectionFn
                );

              /**
               * inline 存入对应 editing section。
               *
               * floating 不参与文字流，但仍然保存在相同的
               * blocks 数据结构中，所以之后可以拖回页面，
               * 再转换为 inline。
               */
              const targetSection =
                insidePage &&
                targetLayout
                  ? nextSections.find(
                      (section) =>
                        String(
                          section.id
                        ) ===
                        String(
                          targetLayout.id
                        )
                    )
                  : nextSections.find(
                      (section) =>
                        section.mode ===
                        "editing"
                    ) ||
                    nextSections.find(
                      (section) =>
                        section.mode !==
                        "completed"
                    ) ||
                    nextSections[0];

              if (
                !targetSection
              ) {
                return previousSections;
              }

              /**
               * 放在白色页面时必须找到正文 editing layout，
               * 才能确定准确的 inline 插入位置。
               */
              if (
                insidePage &&
                !targetLayout
              ) {
                return previousSections;
              }

              pushHistorySnapshot?.(
                previousSections
              );

              if (
                insidePage &&
                targetLayout
              ) {
                const insertIndex =
                  getInsertIndexFromPointer(
                    targetLayout.blocks,
                    targetLayout.localFragments,
                    inlineX,
                    localY
                  );

                targetSection.blocks.splice(
                  insertIndex,
                  0,
                  newBlock
                );
              } else {
                /**
                 * floating 模块不进入正文排版流。
                 */
                targetSection.blocks.push(
                  newBlock
                );
              }

              return normalizeSections(
                nextSections,
                createEditingSectionFn
              );
            }
          );

          /**
           * 创建后直接选中。
           */
          setSelectedIds([
            newBlockId,
          ]);

          setDraggingType(
            null
          );

          clearActiveTemplateDragData();

          return;
        }

        /**
         * 情况二：
         * 使用原有逻辑移动已有 inline 模块。
         *
         * 已有模块与灰色区域之间的转换继续交给
         * useFloatingBlocks.handleFloatingDrop。
         */
        if (
          !insideContent
        ) {
          clearDragState();

          return;
        }

        const targetLayout =
          getTargetEditingLayout(
            y
          );

        if (
          !targetLayout
        ) {
          clearDragState();

          return;
        }

        const localY =
          clamp(
            y -
              targetLayout.top,
            0,
            targetLayout.height
          );

        if (
          draggingBlockId !=
          null
        ) {
          setSections(
            (
              previousSections
            ) => {
              const nextSections =
                cloneSections(
                  previousSections
                );

              const selectedKeySet =
                new Set(
                  selectedIds.map(
                    (id) => String(id)
                  )
                );

              const shouldMoveGroup =
                selectedKeySet.size > 1 &&
                selectedKeySet.has(
                  String(
                    draggingBlockId
                  )
                );

              const movingIds =
                shouldMoveGroup
                  ? selectedKeySet
                  : new Set([
                      String(
                        draggingBlockId
                      ),
                    ]);

              const source =
                findBlockLocation(
                  nextSections,
                  draggingBlockId
                );

              if (!source) {
                return previousSections;
              }

              const sourceSection =
                nextSections.find(
                  (section) =>
                    String(
                      section.id
                    ) ===
                    String(
                      source.sectionId
                    )
                );

              const targetSection =
                nextSections.find(
                  (section) =>
                    String(
                      section.id
                    ) ===
                    String(
                      targetLayout.id
                    )
                );

              if (
                !sourceSection ||
                !targetSection
              ) {
                return previousSections;
              }

              /**
               * 按文档顺序收集并删除整组选中模块。这样跨 section
               * 框选后拖动，也能保持组内原来的前后顺序。
               */
              const movingBlocks = [];

              nextSections.forEach(
                (section) => {
                  if (
                    !Array.isArray(
                      section.blocks
                    )
                  ) {
                    return;
                  }

                  const remaining = [];

                  section.blocks.forEach(
                    (candidate) => {
                      if (
                        movingIds.has(
                          String(
                            candidate.id
                          )
                        )
                      ) {
                        movingBlocks.push(
                          candidate
                        );
                      } else {
                        remaining.push(
                          candidate
                        );
                      }
                    }
                  );

                  section.blocks =
                    remaining;
                }
              );

              if (
                movingBlocks.length === 0
              ) {
                return previousSections;
              }

              /**
               * floating 模块拖回白色正文后，
               * 自动恢复为 inline，并清除 floating 坐标。
               *
               * 后续仍然会根据鼠标位置计算 insertIndex，
               * 所以它会插入到正确的文字流位置。
               */
              movingBlocks.forEach(
                (movingBlock) => {
                  movingBlock.placement =
                    "inline";
                  movingBlock.floatingX =
                    null;
                  movingBlock.floatingY =
                    null;
                  movingBlock.floatingWidth =
                    null;
                  movingBlock.floatingHeight =
                    null;

                  /**
                   * 副本回到正文后再次隐藏缩放手柄；普通模块不改动
                   * 自己原有的手柄配置。
                   */
                  if (
                    movingBlock.isDuplicatedCopy
                  ) {
                    movingBlock.hideResizeHandle =
                      true;
                    movingBlock.hideFloatingResizeHandle =
                      true;
                  }
                }
              );

              /**
               * 同一 section 内移动时，
               * 使用删除模块后的 blocks。
               */
              const currentTargetBlocks =
                String(
                  sourceSection.id
                ) ===
                String(
                  targetSection.id
                )
                  ? sourceSection.blocks
                  : targetSection.blocks;

              /**
               * 同一 section 内移动时，
               * 从布局片段中排除当前模块。
               */
              const currentTargetFragments =
                String(
                  sourceSection.id
                ) ===
                String(
                  targetSection.id
                )
                  ? (
                      targetLayout.localFragments ||
                      []
                    ).filter(
                      (
                        fragment
                      ) =>
                        !movingIds.has(
                          String(
                            fragment.blockId
                          )
                        )
                    )
                  : targetLayout.localFragments ||
                    [];

              const insertIndex =
                getInsertIndexFromPointer(
                  currentTargetBlocks,
                  currentTargetFragments,
                  x,
                  localY
                );

              pushHistorySnapshot?.(
                previousSections
              );

              targetSection.blocks.splice(
                insertIndex,
                0,
                ...movingBlocks
              );

              return normalizeSections(
                nextSections,
                createEditingSectionFn
              );
            }
          );

          setSelectedIds(
            selectedIds.length > 1 &&
              selectedIds.some(
                (id) =>
                  String(id) ===
                  String(
                    draggingBlockId
                  )
              )
              ? selectedIds
              : [draggingBlockId]
          );

          setDraggingBlockId(
            null
          );
        }
      },
      [
        isSelecting,
        selectionRect,

        pageRef,
        zoom,

        totalContentHeight,

        getTargetEditingLayout,
        clearDragState,

        draggingType,
        draggingBlockId,

        selectedIds,

        nextBlockIdRef,

        setSections,
        setSelectedIds,

        setDraggingType,
        setDraggingBlockId,

        pushHistorySnapshot,
        createEditingSectionFn,
      ]
    );

  /**
   * 外部拖拽放置。
   *
   * 如果事件发生在 SingleSemanticEditor 内，
   * 编辑器自己的 onDrop 会处理，旧逻辑不再执行。
   */
  const handleExternalDrop =
    useCallback(
      (event) => {
        if (
          isInsideSingleSemanticEditor(
            event
          )
        ) {
          clearDragState();

          return;
        }

        handleCanvasMouseUp(
          event
        );
      },
      [
        clearDragState,
        handleCanvasMouseUp,
      ]
    );

  /**
   * 鼠标在画布外松开时清除拖拽状态。
   */
  const handleGlobalMouseUp =
    useCallback(() => {
      if (
        !draggingType &&
        draggingBlockId ==
          null
      ) {
        return;
      }

      clearDragState();
    }, [
      draggingType,
      draggingBlockId,
      clearDragState,
    ]);

  return {
    handleTemplateMouseDown,
    cancelTemplateDrag,

    handleBlockDragStart,
    endBlockDrag,

    handleCanvasMouseUp,
    handleExternalDrop,

    handleGlobalMouseUp,
  };
}
