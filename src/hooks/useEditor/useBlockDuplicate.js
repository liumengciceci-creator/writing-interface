import {
  useCallback,
} from "react";

import {
  BLOCK_WIDTH,
} from "../../constants";

import {
  cloneSections,
  findBlockLocation,
  normalizeSections,
} from "./sectionHelpers";

function normalizeId(value) {
  return value == null
    ? ""
    : String(value);
}

function escapeAttributeValue(
  value
) {
  const text =
    String(value ?? "");

  if (
    typeof CSS !==
      "undefined" &&
    typeof CSS.escape ===
      "function"
  ) {
    return CSS.escape(
      text
    );
  }

  return text.replace(
    /["\\]/g,
    "\\$&"
  );
}

function getCompactWidth(
  block
) {
  if (
    Number.isFinite(
      block?.floatingWidth
    )
  ) {
    return Math.max(
      72,
      block.floatingWidth
    );
  }

  if (
    Number.isFinite(
      block?.width
    )
  ) {
    return Math.max(
      72,
      block.width
    );
  }

  const text =
    String(
      block?.label ||
        block?.text ||
        block?.type ||
        ""
    );

  let estimatedWidth = 0;

  for (
    const character of text
  ) {
    estimatedWidth +=
      /[\u4e00-\u9fff]/.test(
        character
      )
        ? 16
        : 8;
  }

  return Math.max(
    72,
    Math.min(
      280,
      estimatedWidth + 32
    )
  );
}

/**
 * 模块复制 Hook。
 *
 * 统一规则：
 * 1. 无论源模块是 inline 还是 floating，
 *    副本初始状态始终是 floating。
 * 2. Command + C 可在原模块附近生成副本。
 * 3. Option + Shift + 左键可在按下位置创建副本，
 *    并把 draggingBlockId 切换到副本。
 * 4. 副本之后可通过现有 floating -> inline
 *    逻辑拖进正文的指定位置。
 */
export function useBlockDuplicate({
  sections = [],

  stageRef,
  zoom = 1,

  setSections,
  setSelectedIds,
  setDraggingBlockId,

  nextBlockIdRef,

  getBlockById,

  pushHistorySnapshot,
  createEditingSectionFn,
}) {
  /**
 * 获取副本在 Stage 中的初始 floating 坐标。
 *
 * 规则：
 * 1. 拖拽复制时，从鼠标附近创建。
 * 2. floating 源模块，在原模块右下方创建。
 * 3. inline 源模块，根据真实 DOM 位置，在右下方创建。
 */
const getSourceStagePosition =
  useCallback(
    (
      block,
      options = {}
    ) => {
      const {
        clientX,
        clientY,

        /**
         * 默认让副本出现在原模块右下方。
         */
        offsetX = 24,
        offsetY = 24,

        index = 0,
      } = options;

      /**
       * 同时复制多个模块时逐个错开，
       * 避免所有副本完全重叠。
       */
      const cascadeX =
        offsetX +
        index * 14;

      const cascadeY =
        offsetY +
        index * 14;

      const stageElement =
        stageRef?.current;

      const stageRect =
        stageElement
          ?.getBoundingClientRect();

      /**
       * Option + Shift 拖拽复制。
       *
       * 直接在鼠标附近创建，
       * 方便副本立即跟随鼠标拖动。
       */
      if (
        stageRect &&
        Number.isFinite(
          clientX
        ) &&
        Number.isFinite(
          clientY
        )
      ) {
        return {
          x:
            clientX -
            stageRect.left -
            24,

          y:
            clientY -
            stageRect.top -
            20,
        };
      }

      /**
       * 源模块本身已经是 floating。
       *
       * 直接根据原模块保存的位置，
       * 在右下方生成副本。
       */
      if (
        block?.placement ===
          "floating"
      ) {
        return {
          x:
            Number(
              block.floatingX
            ) +
            cascadeX,

          y:
            Number(
              block.floatingY
            ) +
            cascadeY,
        };
      }

      /**
       * inline 模块。
       *
       * 读取原模块在页面中的真实 DOM 坐标，
       * 再转换成相对于 Stage 的坐标。
       */
      if (
        stageElement &&
        stageRect
      ) {
        const selector =
          `[data-semantic-block-id="${escapeAttributeValue(
            block?.id
          )}"]`;

        const blockElements =
          stageElement.querySelectorAll(
            selector
          );

        /**
         * inline 模块可能跨行，
         * 同一个模块可能存在多个 DOM fragment。
         *
         * 这里寻找最右下方的 fragment，
         * 让副本出现在整个模块的右下附近。
         */
        if (
          blockElements.length >
          0
        ) {
          let sourceRect =
            null;

          blockElements.forEach(
            (element) => {
              const rect =
                element.getBoundingClientRect();

              if (!sourceRect) {
                sourceRect =
                  rect;

                return;
              }

              const currentBottom =
                sourceRect.bottom;

              const nextBottom =
                rect.bottom;

              if (
                nextBottom >
                  currentBottom ||
                (
                  nextBottom ===
                    currentBottom &&
                  rect.right >
                    sourceRect.right
                )
              ) {
                sourceRect =
                  rect;
              }
            }
          );

          if (sourceRect) {
            return {
              x:
                sourceRect.left -
                stageRect.left +
                cascadeX,

              y:
                sourceRect.top -
                stageRect.top +
                cascadeY,
            };
          }
        }
      }

      /**
       * 找不到源模块 DOM 时，
       * 放到页面左上方的安全位置。
       */
      return {
        x:
          64 +
          index * 14,

        y:
          64 +
          index * 14,
      };
    },
    [
      stageRef,
    ]
  );

  /**
   * 找到可保存 floating 副本的 section。
   *
   * 优先：
   * - 源模块所在 section
   * - 第一个 editing section
   * - 第一个非 completed section
   */
  const getTargetSectionId =
    useCallback(
      (
        sourceBlockId
      ) => {
        const source =
          findBlockLocation(
            sections,
            sourceBlockId
          );

        if (source?.sectionId != null) {
          return source.sectionId;
        }

        const editingSection =
          sections.find(
            (section) =>
              section?.mode ===
              "editing"
          );

        if (
          editingSection?.id !=
          null
        ) {
          return editingSection.id;
        }

        const activeSection =
          sections.find(
            (section) =>
              section?.mode !==
              "completed"
          );

        return (
          activeSection?.id ??
          sections[0]?.id ??
          null
        );
      },
      [sections]
    );

  /**
   * 复制一个或多个模块。
   *
   * 返回：
   * {
   *   blocks: 新副本数组,
   *   ids: 新 ID 数组,
   *   primaryBlock: 第一个副本,
   *   primaryId: 第一个副本 ID
   * }
   */
  const duplicateBlocks =
    useCallback(
      (
        blockIds,
        options = {}
      ) => {
        const ids = Array.from(
          new Set(
            (
              Array.isArray(
                blockIds
              )
                ? blockIds
                : [blockIds]
            )
              .filter(
                (id) =>
                  id != null
              )
              .map(
                normalizeId
              )
          )
        );

        if (
          ids.length === 0 ||
          !nextBlockIdRef
        ) {
          return {
            blocks: [],
            ids: [],
            primaryBlock:
              null,
            primaryId: null,
          };
        }

        const {
          clientX,
          clientY,
          offsetX = 20,
          offsetY = 20,
          startDragging =
            false,
        } = options;

        const copies = [];

        for (
          let index = 0;
          index < ids.length;
          index += 1
        ) {
          const sourceId =
            ids[index];

          const sourceBlock =
            getBlockById?.(
              sourceId
            );

          if (!sourceBlock) {
            continue;
          }

          const targetSectionId =
            getTargetSectionId(
              sourceId
            );

          if (
            targetSectionId ==
            null
          ) {
            continue;
          }

          const position =
            getSourceStagePosition(
              sourceBlock,
              {
                clientX,
                clientY,
                offsetX,
                offsetY,
                index,
              }
            );

          const newId =
            nextBlockIdRef
              .current++;

          const floatingWidth =
            getCompactWidth(
              sourceBlock
            );

          const copiedBlock = {
            ...sourceBlock,

            id: newId,

            /**
             * 副本永远先脱离正文流。
             */
            placement:
              "floating",

            floatingX:
              position.x,

            floatingY:
              position.y,

            floatingWidth,

            width:
              sourceBlock.width ??
              BLOCK_WIDTH,

            /**
             * 复制后不再归属于旧的完成组。
             */
            completionGroupId:
              null,

            /**
             * 避免复制编辑器内部临时状态。
             */
            isEditing: false,
            isSelected: false,
            isDragging: false,
          };

          copies.push({
            block:
              copiedBlock,

            sectionId:
              targetSectionId,
          });
        }

        if (
          copies.length === 0
        ) {
          return {
            blocks: [],
            ids: [],
            primaryBlock:
              null,
            primaryId: null,
          };
        }

        setSections?.(
          (
            previousSections
          ) => {
            const nextSections =
              cloneSections(
                previousSections
              );

            pushHistorySnapshot?.(
              previousSections
            );

            for (
              const copy of
              copies
            ) {
              const targetSection =
                nextSections.find(
                  (section) =>
                    normalizeId(
                      section.id
                    ) ===
                    normalizeId(
                      copy.sectionId
                    )
                ) ||
                nextSections.find(
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
                continue;
              }

              if (
                !Array.isArray(
                  targetSection.blocks
                )
              ) {
                targetSection.blocks =
                  [];
              }

              targetSection.blocks.push(
                copy.block
              );
            }

            return normalizeSections(
              nextSections,
              createEditingSectionFn
            );
          }
        );

        const copiedBlocks =
          copies.map(
            (copy) =>
              copy.block
          );

        const copiedIds =
          copiedBlocks.map(
            (block) =>
              block.id
          );

        setSelectedIds?.(
          copiedIds
        );

        /**
         * Option + Shift 拖拽复制时，
         * 让后续拖拽逻辑操作新副本而不是原模块。
         */
        if (
          startDragging &&
          copiedIds.length > 0
        ) {
          setDraggingBlockId?.(
            copiedIds[0]
          );
        }

        return {
          blocks:
            copiedBlocks,

          ids:
            copiedIds,

          primaryBlock:
            copiedBlocks[0] ??
            null,

          primaryId:
            copiedIds[0] ??
            null,
        };
      },
      [
        nextBlockIdRef,
        getBlockById,
        getTargetSectionId,
        getSourceStagePosition,

        setSections,
        setSelectedIds,
        setDraggingBlockId,

        pushHistorySnapshot,
        createEditingSectionFn,
      ]
    );

/**
 * Cmd/Ctrl + V：
 * 在原模块右下方创建 floating 副本。
 */
const duplicateSelectedBlocks =
  useCallback(
    (
      selectedIds,
      options = {}
    ) => {
      return duplicateBlocks(
        selectedIds,
        {
          offsetX: 24,
          offsetY: 24,

          ...options,

          startDragging:
            false,
        }
      );
    },
    [duplicateBlocks]
  );

  /**
   * Option + Shift + 左键：
   * 创建一个 floating 副本，
   * 并立即把拖拽目标切换为该副本。
   */
  const beginDuplicateDrag =
    useCallback(
      (
        event,
        blockId
      ) => {
        if (
          !event ||
          blockId == null
        ) {
          return {
            blocks: [],
            ids: [],
            primaryBlock:
              null,
            primaryId: null,
          };
        }

        return duplicateBlocks(
          [blockId],
          {
            clientX:
              event.clientX,

            clientY:
              event.clientY,

            offsetX: 0,
            offsetY: 0,

            startDragging:
              true,
          }
        );
      },
      [duplicateBlocks]
    );

  return {
    duplicateBlocks,
    duplicateSelectedBlocks,
    beginDuplicateDrag,
  };
}