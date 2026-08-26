import {
  useCallback,
} from "react";

import {
  BLOCK_WIDTH,
} from "../../constants";

import {
  applyDocumentModelToSections,
  createDocumentModelFromSections,
  deleteDocumentBlocksPreservingParagraphStarts,
} from "../../models/DocumentModel";

import {
  estimateBlockHeight,
} from "./layout";

import {
  normalizeSections,
} from "./sectionHelpers";

/**
 * 管理语义模块的状态操作。
 *
 * DocumentModel.js 负责纯数据结构；
 * useBlockActions.js 负责把这些操作接入 React 的 sections 状态。
 */
export function useBlockActions({
  sections,
  setSections,

  selectedIds,
  setSelectedIds,

  pushHistorySnapshot,
  createEditingSectionFn,
}) {
  /**
   * 根据 ID 查找模块。
   */
  const getBlockById =
    useCallback(
      (blockId) => {
        const targetId =
          String(blockId);

        for (
          const section of
          sections
        ) {
          if (
            !Array.isArray(
              section?.blocks
            )
          ) {
            continue;
          }

          const matchedBlock =
            section.blocks.find(
              (block) =>
                String(
                  block.id
                ) === targetId
            );

          if (matchedBlock) {
            return matchedBlock;
          }
        }

        return null;
      },
      [sections]
    );

  /**
   * 更新 floating 模块文本。
   */
  const handleUpdateFloatingBlockText =
    useCallback(
      (blockId, text) => {
        const targetId =
          String(blockId);

        setSections(
          (previousSections) => {
            let hasChanges =
              false;

            const nextSections =
              previousSections.map(
                (section) => {
                  if (
                    !Array.isArray(
                      section?.blocks
                    )
                  ) {
                    return section;
                  }

                  const nextBlocks =
                    section.blocks.map(
                      (block) => {
                        if (
                          String(
                            block.id
                          ) !==
                          targetId
                        ) {
                          return block;
                        }

                        const nextText =
                          String(
                            text ?? ""
                          );

                        if (
                          String(
                            block.text ??
                              ""
                          ) === nextText
                        ) {
                          return block;
                        }

                        hasChanges =
                          true;

                        const width =
                          Number(
                            block.floatingWidth ??
                              block.width ??
                              BLOCK_WIDTH
                          ) ||
                          BLOCK_WIDTH;

                        return {
                          ...block,

                          text:
                            nextText,

                          height:
                            estimateBlockHeight(
                              nextText,
                              width
                            ),
                        };
                      }
                    );

                  return {
                    ...section,
                    blocks:
                      nextBlocks,
                  };
                }
              );

            if (!hasChanges) {
              return previousSections;
            }

            return normalizeSections(
              nextSections,
              createEditingSectionFn
            );
          }
        );
      },
      [
        setSections,
        createEditingSectionFn,
      ]
    );

  /**
   * 更新 floating 模块宽度。
   */
  const handleUpdateFloatingBlockWidth =
    useCallback(
      (
        blockId,
        floatingWidthOrBounds
      ) => {
        const targetId =
          String(blockId);

        const bounds =
          floatingWidthOrBounds &&
          typeof floatingWidthOrBounds ===
            "object"
            ? floatingWidthOrBounds
            : {
                floatingWidth:
                  floatingWidthOrBounds,
              };

        const nextWidth =
          Math.max(
            80,
            Number(
              bounds.floatingWidth
            ) || BLOCK_WIDTH
          );

        const nextHeight =
          Number.isFinite(
            Number(
              bounds.floatingHeight
            )
          )
            ? Math.max(
                40,
                Number(
                  bounds.floatingHeight
                )
              )
            : null;

        setSections(
          (previousSections) => {
            let hasChanges =
              false;

            const nextSections =
              previousSections.map(
                (section) => {
                  if (
                    !Array.isArray(
                      section?.blocks
                    )
                  ) {
                    return section;
                  }

                  const nextBlocks =
                    section.blocks.map(
                      (block) => {
                        if (
                          String(
                            block.id
                          ) !==
                          targetId
                        ) {
                          return block;
                        }

                        hasChanges =
                          true;

                        return {
                          ...block,

                          ...(Number.isFinite(
                            Number(
                              bounds.floatingX
                            )
                          )
                            ? {
                                floatingX:
                                  Number(
                                    bounds.floatingX
                                  ),
                              }
                            : {}),

                          ...(Number.isFinite(
                            Number(
                              bounds.floatingY
                            )
                          )
                            ? {
                                floatingY:
                                  Number(
                                    bounds.floatingY
                                  ),
                              }
                            : {}),

                          floatingWidth:
                            nextWidth,

                          width:
                            nextWidth,

                          ...(nextHeight !=
                          null
                            ? {
                                floatingHeight:
                                  nextHeight,
                                height:
                                  nextHeight,
                              }
                            : {
                                height:
                                  estimateBlockHeight(
                                    String(
                                      block.text ??
                                        ""
                                    ),
                                    nextWidth
                                  ),
                              }),
                        };
                      }
                    );

                  return {
                    ...section,
                    blocks:
                      nextBlocks,
                  };
                }
              );

            if (!hasChanges) {
              return previousSections;
            }

            return normalizeSections(
              nextSections,
              createEditingSectionFn
            );
          }
        );
      },
      [
        setSections,
        createEditingSectionFn,
      ]
    );

  /**
   * 更新模块的 placement。
   *
   * 例如：
   * inline -> floating
   * floating -> inline
   */
  const updateBlockPlacement =
    useCallback(
      (
        blockId,
        updates = {}
      ) => {
        const updateEntries =
          Array.isArray(blockId)
            ? blockId
                .map((entry) => ({
                  targetId: String(
                    entry?.blockId ??
                    entry?.id ??
                    ""
                  ),
                  updates:
                    entry?.updates || {},
                }))
                .filter(
                  (entry) =>
                    entry.targetId
                )
            : [
                {
                  targetId:
                    String(blockId),
                  updates,
                },
              ];

        const updatesById =
          new Map(
            updateEntries.map(
              (entry) => [
                entry.targetId,
                entry.updates,
              ]
            )
          );

        setSections(
          (previousSections) => {
            let hasChanges =
              false;

            const nextSections =
              previousSections.map(
                (section) => {
                  if (
                    section?.mode !==
                      "editing" ||
                    !Array.isArray(
                      section.blocks
                    )
                  ) {
                    return section;
                  }

                  const outgoingParagraphHeadIds =
                    new Set(
                      section.blocks
                        .filter((block) => {
                          const blockUpdates =
                            updatesById.get(
                              String(block.id)
                            );

                          return (
                            block.placement !== "floating" &&
                            Boolean(block.forceLineBreakBefore) &&
                            blockUpdates?.placement === "floating"
                          );
                        })
                        .map((block) => String(block.id))
                    );

                  const followerIdsThatMustKeepParagraphStart =
                    new Set();

                  if (outgoingParagraphHeadIds.size > 0) {
                    section.blocks.forEach((block, index) => {
                      if (
                        !outgoingParagraphHeadIds.has(
                          String(block.id)
                        )
                      ) {
                        return;
                      }

                      for (
                        let followerIndex = index + 1;
                        followerIndex < section.blocks.length;
                        followerIndex += 1
                      ) {
                        const follower =
                          section.blocks[followerIndex];
                        const followerUpdates =
                          updatesById.get(
                            String(follower.id)
                          );

                        const willBeFloating =
                          followerUpdates?.placement === "floating" ||
                          (
                            !followerUpdates &&
                            follower.placement === "floating"
                          );

                        if (willBeFloating) {
                          continue;
                        }

                        followerIdsThatMustKeepParagraphStart.add(
                          String(follower.id)
                        );
                        break;
                      }
                    });
                  }

                  const nextBlocks =
                    section.blocks.map(
                      (block) => {
                        const blockUpdates =
                          updatesById.get(
                            String(block.id)
                          );

                        if (!blockUpdates) {
                          if (
                            followerIdsThatMustKeepParagraphStart.has(
                              String(block.id)
                            ) &&
                            !block.forceLineBreakBefore
                          ) {
                            hasChanges =
                              true;

                            return {
                              ...block,
                              forceLineBreakBefore:
                                true,
                            };
                          }

                          return block;
                        }

                        hasChanges =
                          true;

                        const nextBlock = {
                          ...block,
                          ...blockUpdates,
                          ...(followerIdsThatMustKeepParagraphStart.has(
                            String(block.id)
                          )
                            ? {
                                forceLineBreakBefore:
                                  true,
                              }
                            : {}),
                        };

                        /**
                         * 转为 inline 后，
                         * 删除旧的画布定位信息。
                         */
                        if (
                          nextBlock.placement !==
                          "floating"
                        ) {
                          delete nextBlock.x;
                          delete nextBlock.y;
                          delete nextBlock.width;
                          delete nextBlock.height;

                          delete nextBlock.floatingX;
                          delete nextBlock.floatingY;
                          delete nextBlock.floatingWidth;
                          delete nextBlock.floatingHeight;
                        }

                        return nextBlock;
                      }
                    );

                  return {
                    ...section,
                    blocks:
                      nextBlocks,
                  };
                }
              );

            if (!hasChanges) {
              return previousSections;
            }

            pushHistorySnapshot?.(
              previousSections
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
   * 更新模块的类型和颜色。
   */
  const handleUpdateBlockAppearance =
    useCallback(
      ({
        blockId,
        type,
        color,
        fill,
        label,
        recordHistory = true,
      }) => {
        if (
          blockId === null ||
          blockId ===
            undefined ||
          blockId === ""
        ) {
          throw new Error(
            "缺少模块 ID。"
          );
        }

        const normalizedType =
          String(
            type ?? ""
          ).trim();

        const normalizedColor =
          String(
            color ?? ""
          ).trim();

        const normalizedFill =
          String(
            fill ?? ""
          ).trim();

        if (!normalizedType) {
          throw new Error(
            "模块类型不能为空。"
          );
        }

        if (!normalizedColor) {
          throw new Error(
            "模块边框颜色不能为空。"
          );
        }

        if (!normalizedFill) {
          throw new Error(
            "模块背景颜色不能为空。"
          );
        }

        const targetId =
          String(blockId);

        const updatedBlock = {
          ...getBlockById(
            targetId
          ),

          id: targetId,
          type:
            normalizedType,
          color:
            normalizedColor,
          fill:
            normalizedFill,

          ...(label !==
          undefined
            ? {
                label:
                  String(label),
              }
            : {}),
        };

        setSections(
          (previousSections) => {
            let hasChanges =
              false;

            const nextSections =
              previousSections.map(
                (section) => {
                  if (
                    !Array.isArray(
                      section?.blocks
                    )
                  ) {
                    return section;
                  }

                  const nextBlocks =
                    section.blocks.map(
                      (block) => {
                        if (
                          String(
                            block.id
                          ) !==
                          targetId
                        ) {
                          return block;
                        }

                        hasChanges =
                          true;

                        return {
                          ...block,

                          type:
                            normalizedType,

                          color:
                            normalizedColor,

                          fill:
                            normalizedFill,

                          ...(label !==
                          undefined
                            ? {
                                label:
                                  String(
                                    label
                                  ),
                              }
                            : {}),
                        };
                      }
                    );

                  return {
                    ...section,
                    blocks:
                      nextBlocks,
                  };
                }
              );

            if (!hasChanges) {
              return previousSections;
            }

            if (recordHistory) {
              pushHistorySnapshot?.(
                previousSections
              );
            }

            return normalizeSections(
              nextSections,
              createEditingSectionFn
            );
          }
        );

        return updatedBlock;
      },
      [
        getBlockById,
        setSections,
        pushHistorySnapshot,
        createEditingSectionFn,
      ]
    );

  /**
   * 更新单个模块文本。
   *
   * 这个方法主要用于旧组件和 floating 模块。
   * SingleSemanticEditor 输入时不会每个字符都调用它。
   */
  const handleChangeText =
    useCallback(
      (blockId, value, options = {}) => {
        const targetId =
          String(blockId);

        const nextText =
          String(value ?? "");
        const nextIsGenerated =
          typeof options?.isGenerated === "boolean"
            ? options.isGenerated
            : undefined;

        setSections(
          (previousSections) => {
            let hasChanges =
              false;

            const nextSections =
              previousSections.map(
                (section) => {
                  if (
                    section?.mode !==
                      "editing" ||
                    !Array.isArray(
                      section.blocks
                    )
                  ) {
                    return section;
                  }

                  const nextBlocks =
                    section.blocks.map(
                      (block) => {
                        if (
                          String(
                            block.id
                          ) !==
                          targetId
                        ) {
                          return block;
                        }

                        if (
                          String(block.text ?? "") === nextText &&
                          (
                            nextIsGenerated === undefined ||
                            block.isGenerated === nextIsGenerated
                          )
                        ) {
                          return block;
                        }

                        hasChanges =
                          true;

                        /**
                         * inline 模块由浏览器自然排版，
                         * 不需要计算 width 和 height。
                         */
                        if (
                          block.placement !==
                          "floating"
                        ) {
                          const nextBlock = {
                            ...block,
                            text:
                              nextText,
                            ...(nextIsGenerated !== undefined
                              ? { isGenerated: nextIsGenerated }
                              : {}),
                            generationDirective: "",
                            generationError: null,
                          };

                          delete nextBlock.x;
                          delete nextBlock.y;
                          delete nextBlock.width;
                          delete nextBlock.height;

                          delete nextBlock.floatingX;
                          delete nextBlock.floatingY;
                          delete nextBlock.floatingWidth;
                          delete nextBlock.floatingHeight;

                          return nextBlock;
                        }

                        const width =
                          Number(
                            block.floatingWidth ??
                              block.width ??
                              BLOCK_WIDTH
                          ) ||
                          BLOCK_WIDTH;

                        return {
                          ...block,

                          text:
                            nextText,

                          ...(nextIsGenerated !== undefined
                            ? { isGenerated: nextIsGenerated }
                            : {}),

                          generationDirective:
                            "",

                          generationError:
                            null,

                          height:
                            estimateBlockHeight(
                              nextText,
                              width
                            ),
                        };
                      }
                    );

                  return {
                    ...section,
                    blocks:
                      nextBlocks,
                  };
                }
              );

            if (!hasChanges) {
              return previousSections;
            }

            return normalizeSections(
              nextSections,
              createEditingSectionFn
            );
          }
        );
      },
      [
        setSections,
        createEditingSectionFn,
      ]
    );

  /**
   * 批量提交 SingleSemanticEditor 中的文本。
   *
   * updates 格式：
   *
   * [
   *   {
   *     id: "block-1",
   *     text: "新的文本"
   *   }
   * ]
   */
  const handleBatchChangeText =
    useCallback(
      (updates) => {
        if (
          !Array.isArray(
            updates
          ) ||
          updates.length === 0
        ) {
          return;
        }

        const updateMap =
          new Map();

        updates.forEach(
          (update) => {
            if (
              update?.id ===
                undefined ||
              update?.id ===
                null
            ) {
              return;
            }

            updateMap.set(
              String(
                update.id
              ),
              String(
                update.text ?? ""
              )
            );
          }
        );

        if (
          updateMap.size === 0
        ) {
          return;
        }

        setSections(
          (previousSections) => {
            let hasChanges =
              false;

            const nextSections =
              previousSections.map(
                (section) => {
                  if (
                    section?.mode !==
                      "editing" ||
                    !Array.isArray(
                      section.blocks
                    )
                  ) {
                    return section;
                  }

                  const nextBlocks =
                    section.blocks.map(
                      (block) => {
                        const blockKey =
                          String(
                            block.id
                          );

                        if (
                          !updateMap.has(
                            blockKey
                          )
                        ) {
                          return block;
                        }

                        const nextText =
                          updateMap.get(
                            blockKey
                          );

                        if (
                          String(
                            block.text ??
                              ""
                          ) === nextText
                        ) {
                          return block;
                        }

                        hasChanges =
                          true;

                        if (
                          block.placement !==
                          "floating"
                        ) {
                          const nextBlock = {
                            ...block,
                            text:
                              nextText,
                            generationDirective: "",
                            generationError: null,
                          };

                          delete nextBlock.x;
                          delete nextBlock.y;
                          delete nextBlock.width;
                          delete nextBlock.height;

                          delete nextBlock.floatingX;
                          delete nextBlock.floatingY;
                          delete nextBlock.floatingWidth;
                          delete nextBlock.floatingHeight;

                          return nextBlock;
                        }

                        const width =
                          Number(
                            block.floatingWidth ??
                              block.width ??
                              BLOCK_WIDTH
                          ) ||
                          BLOCK_WIDTH;

                        return {
                          ...block,

                          text:
                            nextText,

                          generationDirective:
                            "",

                          generationError:
                            null,

                          height:
                            estimateBlockHeight(
                              nextText,
                              width
                            ),
                        };
                      }
                    );

                  return {
                    ...section,
                    blocks:
                      nextBlocks,
                  };
                }
              );

            if (!hasChanges) {
              return previousSections;
            }

            pushHistorySnapshot?.(
              previousSections
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
   * SingleSemanticEditor 已经在 blur 前统一提交 DOM，
   * 因此这里暂时不重复修改状态。
   */
  const handleTextBlur =
    useCallback(
      () => {},
      []
    );

  /**
   * 删除当前选中的模块。
   */
  const handleDeleteSelected =
    useCallback(
      () => {
        if (
          !Array.isArray(
            selectedIds
          ) ||
          selectedIds.length ===
            0
        ) {
          return;
        }

        const selectedIdSet =
          new Set(
            selectedIds.map(
              (id) =>
                String(id)
            )
          );

        setSections(
          (previousSections) => {
            const currentModel =
              createDocumentModelFromSections(
                previousSections
              );

            const inlineSelectedIds =
              [...selectedIdSet].filter(
                (blockId) =>
                  currentModel.hasBlock(
                    blockId
                  )
              );

            const hasSelectedFloatingBlock =
              previousSections.some(
                (section) =>
                  Array.isArray(
                    section?.blocks
                  ) &&
                  section.blocks.some(
                    (block) =>
                      block?.placement ===
                        "floating" &&
                      selectedIdSet.has(
                        String(block.id)
                      )
                  )
              );

            if (
              inlineSelectedIds.length === 0 &&
              !hasSelectedFloatingBlock
            ) {
              return previousSections;
            }

            let nextSections =
              previousSections;

            if (
              inlineSelectedIds.length > 0
            ) {
              const nextModel =
                deleteDocumentBlocksPreservingParagraphStarts(
                  currentModel,
                  inlineSelectedIds
                );

              nextSections =
                applyDocumentModelToSections(
                  previousSections,
                  nextModel,
                  createEditingSectionFn
                );
            }

            if (
              hasSelectedFloatingBlock
            ) {
              nextSections =
                nextSections.map(
                  (section) => ({
                    ...section,
                    blocks: Array.isArray(
                      section?.blocks
                    )
                      ? section.blocks.filter(
                          (block) =>
                            !(
                              block?.placement ===
                                "floating" &&
                              selectedIdSet.has(
                                String(block.id)
                              )
                            )
                        )
                      : section?.blocks,
                  })
                );
            }

            pushHistorySnapshot?.(
              previousSections
            );

            return normalizeSections(
              nextSections,
              createEditingSectionFn
            );
          }
        );

        setSelectedIds([]);
      },
      [
        selectedIds,
        setSelectedIds,
        setSections,
        pushHistorySnapshot,
        createEditingSectionFn,
      ]
    );

  return {
    getBlockById,

    handleUpdateFloatingBlockText,
    handleUpdateFloatingBlockWidth,

    updateBlockPlacement,
    handleUpdateBlockAppearance,

    handleChangeText,
    handleBatchChangeText,
    handleTextBlur,

    handleDeleteSelected,
  };
}

export default useBlockActions;
