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
 * 根据模板标签文字计算 floating 模块初始宽度。
 *
 * 目标：
 * - 只包住标签自带文字
 * - 不使用默认长条宽度
 * - 与拖到白色页面时的紧凑模块尺寸接近
 */
function getTemplateFloatingWidth(
  text
) {
  const value =
    String(text || "");

  let estimatedTextWidth = 0;

  for (const character of value) {
    estimatedTextWidth +=
      /[\u4e00-\u9fff]/.test(
        character
      )
        ? 16
        : 8;
  }

  return clamp(
    estimatedTextWidth + 32,
    72,
    280
  );
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
        /**
         * 正在框选时不执行拖拽放置。
         */
        if (
          isSelecting ||
          selectionRect
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
          draggingType &&
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
        if (draggingType) {
          const newBlockId =
            nextBlockIdRef
              .current++;

          const blockWidth =
            draggingType.width ??
            BLOCK_WIDTH;

          /**
           * 新建模块优先使用 Sidebar 标签本身的文字。
           */
          const templateText =
            String(
              draggingType.label ||
                draggingType.text ||
                draggingType.type ||
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
              draggingType.type,

            label:
              draggingType.label,

            color:
              draggingType.color,

            fill:
              draggingType.fill,

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
                cloneSections(
                  previousSections
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
               * 先从原位置删除模块。
               */
              const [
                movingBlock,
              ] =
                sourceSection.blocks.splice(
                  source.blockIndex,
                  1
                );

              if (
                !movingBlock
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
              movingBlock.placement =
                "inline";

              movingBlock.floatingX =
                null;

              movingBlock.floatingY =
                null;

              movingBlock.floatingWidth =
                null;

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
                        String(
                          fragment.blockId
                        ) !==
                        String(
                          draggingBlockId
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
                movingBlock
              );

              return normalizeSections(
                nextSections,
                createEditingSectionFn
              );
            }
          );

          setSelectedIds([
            draggingBlockId,
          ]);

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

    handleBlockDragStart,
    endBlockDrag,

    handleCanvasMouseUp,
    handleExternalDrop,

    handleGlobalMouseUp,
  };
}