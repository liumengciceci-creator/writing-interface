import {
  useCallback,
} from "react";

import {
  applyDocumentModelToSections,
  createDocumentBlockId,
  createDocumentModelFromSections,
  normalizeDocumentBlock,
} from "../../models/DocumentModel";

import {
  normalizeSections,
} from "./sectionHelpers";

/**
 * 管理 inline 文档流中的结构操作。
 *
 * 包括：
 * 1. 插入模块
 * 2. 移动模块
 * 3. 删除模块
 *
 * SingleSemanticEditor 只负责识别用户操作，
 * 具体的数据修改在这里完成。
 */
export function useInlineDocumentActions({
  sections,
  setSections,

  selectedIds,
  setSelectedIds,

  pushHistorySnapshot,
  createEditingSectionFn,
}) {
  /**
   * 创建一个不会与当前文档冲突的 ID。
   */
  const createUniqueBlockId =
    useCallback(
      (preferredId) => {
        const currentModel =
          createDocumentModelFromSections(
            sections
          );

        let nextId =
          preferredId !==
            null &&
          preferredId !==
            undefined &&
          preferredId !== ""
            ? String(
                preferredId
              )
            : createDocumentBlockId();

        while (
          currentModel.hasBlock(
            nextId
          )
        ) {
          nextId =
            createDocumentBlockId();
        }

        return nextId;
      },
      [sections]
    );

  /**
   * 将新的 DocumentModel 写回 sections。
   */
  const writeModelToSections =
    useCallback(
      (
        previousSections,
        nextModel
      ) => {
        const nextSections =
          applyDocumentModelToSections(
            previousSections,
            nextModel,
            createEditingSectionFn
          );

        return normalizeSections(
          nextSections,
          createEditingSectionFn
        );
      },
      [
        createEditingSectionFn,
      ]
    );

  /**
   * 插入一个 inline 模块。
   *
   * 调用方式：
   * handleInsertInlineBlock(block, index)
   */
  const handleInsertInlineBlock =
    useCallback(
      (
        block,
        index
      ) => {
        if (
          !block ||
          typeof block !==
            "object"
        ) {
          return null;
        }

        const nextId =
          createUniqueBlockId(
            block.id
          );

        const nextBlock =
          normalizeDocumentBlock({
            ...block,

            id: nextId,

            placement:
              "inline",

            text:
              String(
                block.text ?? ""
              ),
          });

        setSections(
          (previousSections) => {
            const currentModel =
              createDocumentModelFromSections(
                previousSections
              );

            const targetIndex =
              index ===
                undefined ||
              index === null
                ? currentModel.length
                : Number(index);

            const nextModel =
              currentModel.insertBlock(
                nextBlock,
                targetIndex
              );

            let finalModel =
              nextModel;

            if (
              nextBlock.forceLineBreakBefore
            ) {
              const insertedIndex =
                finalModel.getIndex(
                  nextId
                );

              const nextBlockInRow =
                finalModel.getBlockAt(
                  insertedIndex + 1
                );

              if (
                nextBlockInRow?.forceLineBreakBefore
              ) {
                finalModel =
                  finalModel.updateBlock(
                    nextBlockInRow.id,
                    {
                      forceLineBreakBefore:
                        false,
                    }
                  );
              }
            }

            pushHistorySnapshot?.(
              previousSections
            );

            return writeModelToSections(
              previousSections,
              finalModel
            );
          }
        );

        setSelectedIds?.([
          nextId,
        ]);

        return nextBlock;
      },
      [
        createUniqueBlockId,
        pushHistorySnapshot,
        setSections,
        setSelectedIds,
        writeModelToSections,
      ]
    );

  /**
   * 移动一个 inline 模块。
   *
   * targetIndex 表示移动完成后的最终位置。
   */
  const handleReorderInlineBlocks =
    useCallback(
      (
        blockId,
        targetIndex,
        options = {}
      ) => {
        if (
          blockId === null ||
          blockId === undefined
        ) {
          return null;
        }

        const targetId =
          String(blockId);

        let movedBlock =
          null;

        setSections(
          (previousSections) => {
            const currentModel =
              createDocumentModelFromSections(
                previousSections
              );

            if (
              !currentModel.hasBlock(
                targetId
              )
            ) {
              return previousSections;
            }

            const sourceIndex =
              currentModel.getIndex(
                targetId
              );

            const sourceBlock =
              currentModel.getBlock(
                targetId
              );

            const originalNextBlock =
              currentModel.getBlockAt(
                sourceIndex + 1
              );

            const safeTargetIndex =
              Math.max(
                0,
                Math.min(
                  Number(
                    targetIndex
                  ) || 0,
                  Math.max(
                    0,
                    currentModel.length -
                      1
                  )
                )
              );

            movedBlock =
              sourceBlock;

            let preparedModel =
              currentModel;

            /**
             * 如果被拖走的模块原本就是行首，
             * 让它后面的模块继承原行首，避免旧行被合并。
             */
            if (
              sourceBlock?.forceLineBreakBefore &&
              originalNextBlock
            ) {
              preparedModel =
                preparedModel.updateBlock(
                  originalNextBlock.id,
                  {
                    forceLineBreakBefore:
                      true,
                  }
                );
            }

            let nextModel =
              preparedModel.moveBlock(
                targetId,
                safeTargetIndex
              );

            nextModel =
              nextModel.updateBlock(
                targetId,
                {
                  forceLineBreakBefore:
                    Boolean(
                      options.forceLineBreakBefore
                    ),
                }
              );

            /**
             * 新模块成为行首时，紧随其后的旧行首取消换行，
             * 两者自然排列在同一新行。
             */
            if (
              options.forceLineBreakBefore
            ) {
              const movedIndex =
                nextModel.getIndex(
                  targetId
                );

              const nextBlockInRow =
                nextModel.getBlockAt(
                  movedIndex + 1
                );

              if (
                nextBlockInRow?.forceLineBreakBefore
              ) {
                nextModel =
                  nextModel.updateBlock(
                    nextBlockInRow.id,
                    {
                      forceLineBreakBefore:
                        false,
                    }
                  );
              }
            }

            if (
              nextModel ===
              currentModel
            ) {
              return previousSections;
            }

            pushHistorySnapshot?.(
              previousSections
            );

            return writeModelToSections(
              previousSections,
              nextModel
            );
          }
        );

        setSelectedIds?.([
          targetId,
        ]);

        return movedBlock;
      },
      [
        pushHistorySnapshot,
        setSections,
        setSelectedIds,
        writeModelToSections,
      ]
    );

  /**
   * 将一个模块移动到另一个模块前面。
   */
  const handleMoveInlineBlockBefore =
    useCallback(
      (
        blockId,
        targetBlockId
      ) => {
        const sourceId =
          String(blockId);

        const targetId =
          String(targetBlockId);

        setSections(
          (previousSections) => {
            const currentModel =
              createDocumentModelFromSections(
                previousSections
              );

            if (
              !currentModel.hasBlock(
                sourceId
              ) ||
              !currentModel.hasBlock(
                targetId
              )
            ) {
              return previousSections;
            }

            const nextModel =
              currentModel.moveBefore(
                sourceId,
                targetId
              );

            if (
              nextModel ===
              currentModel
            ) {
              return previousSections;
            }

            pushHistorySnapshot?.(
              previousSections
            );

            return writeModelToSections(
              previousSections,
              nextModel
            );
          }
        );

        setSelectedIds?.([
          sourceId,
        ]);
      },
      [
        pushHistorySnapshot,
        setSections,
        setSelectedIds,
        writeModelToSections,
      ]
    );

  /**
   * 将一个模块移动到另一个模块后面。
   */
  const handleMoveInlineBlockAfter =
    useCallback(
      (
        blockId,
        targetBlockId
      ) => {
        const sourceId =
          String(blockId);

        const targetId =
          String(targetBlockId);

        setSections(
          (previousSections) => {
            const currentModel =
              createDocumentModelFromSections(
                previousSections
              );

            if (
              !currentModel.hasBlock(
                sourceId
              ) ||
              !currentModel.hasBlock(
                targetId
              )
            ) {
              return previousSections;
            }

            const nextModel =
              currentModel.moveAfter(
                sourceId,
                targetId
              );

            if (
              nextModel ===
              currentModel
            ) {
              return previousSections;
            }

            pushHistorySnapshot?.(
              previousSections
            );

            return writeModelToSections(
              previousSections,
              nextModel
            );
          }
        );

        setSelectedIds?.([
          sourceId,
        ]);
      },
      [
        pushHistorySnapshot,
        setSections,
        setSelectedIds,
        writeModelToSections,
      ]
    );

  /**
   * 删除一个 inline 模块。
   */
  const handleDeleteInlineBlock =
    useCallback(
      (blockId) => {
        if (
          blockId === null ||
          blockId === undefined
        ) {
          return;
        }

        const targetId =
          String(blockId);

        setSections(
          (previousSections) => {
            const currentModel =
              createDocumentModelFromSections(
                previousSections
              );

            if (
              !currentModel.hasBlock(
                targetId
              )
            ) {
              return previousSections;
            }

            const nextModel =
              currentModel.deleteBlock(
                targetId
              );

            pushHistorySnapshot?.(
              previousSections
            );

            return writeModelToSections(
              previousSections,
              nextModel
            );
          }
        );

        setSelectedIds?.(
          (
            previousSelectedIds
          ) =>
            previousSelectedIds.filter(
              (id) =>
                String(id) !==
                targetId
            )
        );
      },
      [
        pushHistorySnapshot,
        setSections,
        setSelectedIds,
        writeModelToSections,
      ]
    );

  /**
   * 删除多个 inline 模块。
   */
  const handleDeleteInlineBlocks =
    useCallback(
      (blockIds) => {
        const targetIds =
          Array.isArray(
            blockIds
          )
            ? blockIds.map(
                (id) =>
                  String(id)
              )
            : [];

        if (
          targetIds.length === 0
        ) {
          return;
        }

        const targetIdSet =
          new Set(targetIds);

        setSections(
          (previousSections) => {
            const currentModel =
              createDocumentModelFromSections(
                previousSections
              );

            const existingIds =
              targetIds.filter(
                (id) =>
                  currentModel.hasBlock(
                    id
                  )
              );

            if (
              existingIds.length ===
              0
            ) {
              return previousSections;
            }

            const nextModel =
              currentModel.deleteBlocks(
                existingIds
              );

            pushHistorySnapshot?.(
              previousSections
            );

            return writeModelToSections(
              previousSections,
              nextModel
            );
          }
        );

        setSelectedIds?.(
          (
            previousSelectedIds
          ) =>
            previousSelectedIds.filter(
              (id) =>
                !targetIdSet.has(
                  String(id)
                )
            )
        );
      },
      [
        pushHistorySnapshot,
        setSections,
        setSelectedIds,
        writeModelToSections,
      ]
    );

  return {
    handleInsertInlineBlock,
    handleReorderInlineBlocks,

    handleMoveInlineBlockBefore,
    handleMoveInlineBlockAfter,

    handleDeleteInlineBlock,
    handleDeleteInlineBlocks,
  };
}

export default useInlineDocumentActions;
