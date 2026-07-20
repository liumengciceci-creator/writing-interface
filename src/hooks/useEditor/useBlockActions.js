import {
  useCallback,
} from "react";

import {
  BLOCK_WIDTH,
} from "../../constants";

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
        floatingWidth
      ) => {
        const targetId =
          String(blockId);

        const nextWidth =
          Math.max(
            80,
            Number(
              floatingWidth
            ) || BLOCK_WIDTH
          );

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

                        if (
                          Number(
                            block.floatingWidth
                          ) ===
                          nextWidth
                        ) {
                          return block;
                        }

                        hasChanges =
                          true;

                        return {
                          ...block,

                          floatingWidth:
                            nextWidth,

                          width:
                            nextWidth,

                          height:
                            estimateBlockHeight(
                              String(
                                block.text ??
                                  ""
                              ),
                              nextWidth
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

                        hasChanges =
                          true;

                        const nextBlock = {
                          ...block,
                          ...updates,
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

            pushHistorySnapshot?.(
              previousSections
            );

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
      (blockId, value) => {
        const targetId =
          String(blockId);

        const nextText =
          String(value ?? "");

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
                          String(
                            block.text ??
                              ""
                          ) === nextText
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
                    section.blocks.filter(
                      (block) => {
                        const shouldDelete =
                          selectedIdSet.has(
                            String(
                              block.id
                            )
                          );

                        if (
                          shouldDelete
                        ) {
                          hasChanges =
                            true;
                        }

                        return !shouldDelete;
                      }
                    );

                  if (
                    nextBlocks ===
                    section.blocks
                  ) {
                    return section;
                  }

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