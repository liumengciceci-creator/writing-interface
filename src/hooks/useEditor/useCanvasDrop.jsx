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
         * 侧边栏模板放进新的语义编辑器时，
         * 不在旧逻辑中再次创建模块。
         *
         * SingleSemanticEditor 的 onDrop 会读取
         * application/x-writing-block 并完成插入。
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

        const pageRect =
          pageRef.current.getBoundingClientRect();

        /**
         * 将鼠标坐标转换为内容区域坐标。
         */
        const x =
          (event.clientX -
            pageRect.left) /
            zoom -
          CONTENT_LEFT;

        const y =
          (event.clientY -
            pageRect.top) /
            zoom -
          CONTENT_TOP;

        /**
         * 判断是否位于旧的内容区域。
         */
        const insideContent =
          x >= 0 &&
          x <=
            CONTENT_WIDTH &&
          y >= 0 &&
          y <=
            totalContentHeight;

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

        /**
         * 情况一：
         * 使用旧画布逻辑创建模板模块。
         *
         * 只有不在 SingleSemanticEditor 内时，
         * 才会执行这里。
         */
        if (draggingType) {
          const newBlock = {
            id:
              nextBlockIdRef
                .current++,

            width:
              draggingType.width ??
              BLOCK_WIDTH,

            height:
              BLOCK_HEIGHT,

            text:
              String(
                draggingType.text ||
                  draggingType.label ||
                  draggingType.type ||
                  ""
              ),

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
              "inline",

            floatingX:
              null,

            floatingY:
              null,

            floatingWidth:
              null,
          };

          const insertIndex =
            getInsertIndexFromPointer(
              targetLayout.blocks,
              targetLayout.localFragments,
              x,
              localY
            );

          setSections(
            (
              previousSections
            ) => {
              const nextSections =
                cloneSections(
                  previousSections
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
                !targetSection
              ) {
                return previousSections;
              }

              pushHistorySnapshot?.(
                previousSections
              );

              targetSection.blocks.splice(
                insertIndex,
                0,
                newBlock
              );

              return normalizeSections(
                nextSections,
                createEditingSectionFn
              );
            }
          );

          setSelectedIds(
            []
          );

          setDraggingType(
            null
          );

          return;
        }

        /**
         * 情况二：
         * 使用旧画布逻辑移动已有模块。
         *
         * 新的 SingleSemanticEditor 内部重排
         * 由 onReorderBlocks 负责，不会进入这里。
         */
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