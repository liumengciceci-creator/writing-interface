import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  BLOCK_HEIGHT,
  BLOCK_WIDTH,
} from "../../constants";

import {
  multiBlockOperation,
} from "../../api/multiBlockOperation";

import {
  estimateBlockHeight,
} from "./layout";

import {
  cloneSections,
  findBlockLocation,
  normalizeSections,
} from "./sectionHelpers";

/**
 * 过渡模块样式。
 */
const TRANSITION_COLOR =
  "#5c7cfa";

const TRANSITION_FILL =
  "#eef3ff";

/**
 * 融合模块样式。
 */
const MERGED_COLOR =
  "#7c5dfa";

const MERGED_FILL =
  "#f2edff";

/**
 * 将模块转换成发送给后端的简化格式。
 */
function serializeBlock(block) {
  return {
    id: block.id,

    type:
      block.type ||
      "Unknown",

    text:
      String(
        block.text || ""
      ).trim(),
  };
}

/**
 * 根据接口返回值读取文本。
 */
function getResultText(result) {
  if (
    typeof result ===
    "string"
  ) {
    return result.trim();
  }

  return String(
    result?.text ||
      result?.resultText ||
      result?.content ||
      ""
  ).trim();
}

/**
 * 创建 AI 生成的新模块。
 */
function createGeneratedBlock({
  id,
  type,
  text,
  sourceBlock,
  color,
  fill,
}) {
  const width =
    sourceBlock?.width ||
    BLOCK_WIDTH;

  return {
    id,

    type,
    text,

    width,

    height:
      estimateBlockHeight(
        text,
        width
      ) || BLOCK_HEIGHT,

    color:
      color ||
      sourceBlock?.color ||
      "#6f86ef",

    fill:
      fill ||
      sourceBlock?.fill ||
      "#eef1ff",

    isGenerated: true,

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
}

/**
 * 判断两个模块是否位于同一 Section。
 */
function areBlocksInSameSection(
  firstLocation,
  secondLocation
) {
  return (
    String(
      firstLocation?.sectionId
    ) ===
    String(
      secondLocation?.sectionId
    )
  );
}

/**
 * 判断两个模块是否相邻。
 */
function areBlocksAdjacent(
  firstLocation,
  secondLocation
) {
  return (
    Math.abs(
      firstLocation.blockIndex -
        secondLocation.blockIndex
    ) === 1
  );
}

export function useMultiBlockActions({
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
}) {
  /**
   * 当前双模块请求控制器。
   */
  const abortControllerRef =
    useRef(null);

  /**
   * 请求状态。
   */
  const [
    isApplyingMultiAction,
    setIsApplyingMultiAction,
  ] = useState(false);

  /**
   * 请求错误。
   */
  const [
    multiActionError,
    setMultiActionError,
  ] = useState("");

  /**
   * 根据 selectedIds 的顺序获取两个模块。
   *
   * selectedIds[0]：
   * 第一个选中的模块。
   *
   * selectedIds[1]：
   * 第二个选中的模块。
   */
  const getSelectedBlockPair =
    useCallback(() => {
      if (
        selectedIds.length !==
        2
      ) {
        throw new Error(
          "请选择两个模块后再执行操作"
        );
      }

      const firstId =
        selectedIds[0];

      const secondId =
        selectedIds[1];

      let firstBlock =
        null;

      let secondBlock =
        null;

      for (
        const section of sections
      ) {
        if (
          section.mode !==
          "editing"
        ) {
          continue;
        }

        for (
          const block of
            section.blocks
        ) {
          if (
            String(
              block.id
            ) ===
            String(
              firstId
            )
          ) {
            firstBlock =
              block;
          }

          if (
            String(
              block.id
            ) ===
            String(
              secondId
            )
          ) {
            secondBlock =
              block;
          }
        }
      }

      if (
        !firstBlock ||
        !secondBlock
      ) {
        throw new Error(
          "没有找到当前选中的两个模块"
        );
      }

      return {
        firstBlock,
        secondBlock,
      };
    }, [
      sections,
      selectedIds,
    ]);

  /**
   * 获取两个模块的位置。
   */
  const getBlockPairLocations =
    useCallback(
      (
        firstBlock,
        secondBlock
      ) => {
        const firstLocation =
          findBlockLocation(
            sections,
            firstBlock.id
          );

        const secondLocation =
          findBlockLocation(
            sections,
            secondBlock.id
          );

        if (
          !firstLocation ||
          !secondLocation
        ) {
          throw new Error(
            "无法确定两个模块的位置"
          );
        }

        return {
          firstLocation,
          secondLocation,
        };
      },
      [sections]
    );

  /**
   * 检查两个模块是否能够执行
   * 拼接或融合。
   */
  const validateAdjacentPair =
    useCallback(
      ({
        firstLocation,
        secondLocation,
        operationLabel,
      }) => {
        if (
          !areBlocksInSameSection(
            firstLocation,
            secondLocation
          )
        ) {
          throw new Error(
            `${operationLabel}操作要求两个模块位于同一个编辑区域`
          );
        }

        if (
          !areBlocksAdjacent(
            firstLocation,
            secondLocation
          )
        ) {
          throw new Error(
            `${operationLabel}操作要求选择两个相邻模块`
          );
        }
      },
      []
    );

  /**
   * 创建并登记请求。
   */
  const beginRequest =
    useCallback(
      (
        statusMessage
      ) => {
        abortControllerRef.current?.abort();

        const controller =
          new AbortController();

        abortControllerRef.current =
          controller;

        setIsApplyingMultiAction(
          true
        );

        setMultiActionError(
          ""
        );

        clearStatusTimer?.();

        setStatusText(
          statusMessage
        );

        return controller;
      },
      [
        clearStatusTimer,
        setStatusText,
      ]
    );

  /**
   * 统一处理请求错误。
   */
  const handleRequestError =
    useCallback(
      (error) => {
        if (
          error?.name ===
          "AbortError"
        ) {
          return null;
        }

        console.error(
          "[useMultiBlockActions] 双模块操作失败：",
          error
        );

        const message =
          error?.message ||
          "双模块操作失败";

        setMultiActionError(
          message
        );

        setStatusText(
          message
        );

        throw error;
      },
      [setStatusText]
    );

  /**
   * 结束请求状态。
   */
  const finishRequest =
    useCallback(
      (controller) => {
        if (
          abortControllerRef.current ===
          controller
        ) {
          abortControllerRef.current =
            null;
        }

        setIsApplyingMultiAction(
          false
        );
      },
      []
    );

  /**
   * 1. 拼接
   *
   * 在两个相邻模块之间插入
   * 一个新的“过渡”模块。
   */
  const handleJoinBlocks =
    useCallback(
      async () => {
        const {
          firstBlock,
          secondBlock,
        } =
          getSelectedBlockPair();

        const {
          firstLocation,
          secondLocation,
        } =
          getBlockPairLocations(
            firstBlock,
            secondBlock
          );

        validateAdjacentPair({
          firstLocation,
          secondLocation,
          operationLabel:
            "拼接",
        });

        const controller =
          beginRequest(
            "正在生成过渡句..."
          );

        try {
          const result =
            await multiBlockOperation({
              operation:
                "join",

              firstBlock:
                serializeBlock(
                  firstBlock
                ),

              secondBlock:
                serializeBlock(
                  secondBlock
                ),

              options: {},

              signal:
                controller.signal,
            });

          const transitionText =
            getResultText(
              result
            );

          if (
            !transitionText
          ) {
            throw new Error(
              "没有生成有效的过渡句"
            );
          }

          const transitionId =
            nextBlockIdRef
              .current++;

          setSections(
            (
              previousSections
            ) => {
              pushHistorySnapshot(
                previousSections
              );

              const nextSections =
                cloneSections(
                  previousSections
                );

              const currentFirst =
                findBlockLocation(
                  nextSections,
                  firstBlock.id
                );

              const currentSecond =
                findBlockLocation(
                  nextSections,
                  secondBlock.id
                );

              if (
                !currentFirst ||
                !currentSecond
              ) {
                return previousSections;
              }

              if (
                !areBlocksInSameSection(
                  currentFirst,
                  currentSecond
                )
              ) {
                return previousSections;
              }

              if (
                !areBlocksAdjacent(
                  currentFirst,
                  currentSecond
                )
              ) {
                return previousSections;
              }

              const targetSection =
                nextSections.find(
                  (
                    section
                  ) =>
                    String(
                      section.id
                    ) ===
                    String(
                      currentFirst.sectionId
                    )
                );

              if (
                !targetSection
              ) {
                return previousSections;
              }

              const firstIndex =
                targetSection.blocks.findIndex(
                  (
                    block
                  ) =>
                    String(
                      block.id
                    ) ===
                    String(
                      firstBlock.id
                    )
                );

              const secondIndex =
                targetSection.blocks.findIndex(
                  (
                    block
                  ) =>
                    String(
                      block.id
                    ) ===
                    String(
                      secondBlock.id
                    )
                );

              if (
                firstIndex <
                  0 ||
                secondIndex <
                  0
              ) {
                return previousSections;
              }

              const earlierIndex =
                Math.min(
                  firstIndex,
                  secondIndex
                );

              const laterIndex =
                Math.max(
                  firstIndex,
                  secondIndex
                );

              const sourceBlock =
                targetSection
                  .blocks[
                    earlierIndex
                  ];

              const transitionBlock =
                createGeneratedBlock({
                  id:
                    transitionId,

                  type:
                    "Transition",

                  text:
                    transitionText,

                  sourceBlock,

                  color:
                    TRANSITION_COLOR,

                  fill:
                    TRANSITION_FILL,
                });

              /**
               * laterIndex 正好是
               * 第二个模块当前所在位置。
               *
               * 在这个索引插入后，
               * 新模块会位于两个模块之间。
               */
              targetSection.blocks.splice(
                laterIndex,
                0,
                transitionBlock
              );

              return normalizeSections(
                nextSections,
                createEditingSectionFn
              );
            }
          );

          /**
           * 生成后只选中新过渡模块。
           */
          setSelectedIds([
            transitionId,
          ]);

          showTemporaryStatus(
            "过渡模块已生成"
          );

          return {
            blockId:
              transitionId,

            text:
              transitionText,
          };
        } catch (error) {
          return handleRequestError(
            error
          );
        } finally {
          finishRequest(
            controller
          );
        }
      },
      [
        getSelectedBlockPair,
        getBlockPairLocations,
        validateAdjacentPair,
        beginRequest,
        nextBlockIdRef,
        setSections,
        pushHistorySnapshot,
        createEditingSectionFn,
        setSelectedIds,
        showTemporaryStatus,
        handleRequestError,
        finishRequest,
      ]
    );

  /**
   * 2. 融合
   *
   * 删除两个相邻原模块，
   * 并在原来较前的位置创建
   * 一个新的融合模块。
   *
   * length：
   * -100 = 明显压缩
   * 0 = 长度适中
   * 100 = 明显扩展
   */
  const handleMergeBlocks =
    useCallback(
      async ({
        length = 0,
      } = {}) => {
        const {
          firstBlock,
          secondBlock,
        } =
          getSelectedBlockPair();

        const {
          firstLocation,
          secondLocation,
        } =
          getBlockPairLocations(
            firstBlock,
            secondBlock
          );

        validateAdjacentPair({
          firstLocation,
          secondLocation,
          operationLabel:
            "融合",
        });

        const normalizedLength =
          Math.max(
            -100,
            Math.min(
              100,
              Number(
                length
              ) || 0
            )
          );

        const controller =
          beginRequest(
            "正在融合两个模块..."
          );

        try {
          const result =
            await multiBlockOperation({
              operation:
                "merge",

              firstBlock:
                serializeBlock(
                  firstBlock
                ),

              secondBlock:
                serializeBlock(
                  secondBlock
                ),

              options: {
                length:
                  normalizedLength,
              },

              signal:
                controller.signal,
            });

          const mergedText =
            getResultText(
              result
            );

          if (
            !mergedText
          ) {
            throw new Error(
              "没有生成有效的融合文本"
            );
          }

          const mergedBlockId =
            nextBlockIdRef
              .current++;

          setSections(
            (
              previousSections
            ) => {
              pushHistorySnapshot(
                previousSections
              );

              const nextSections =
                cloneSections(
                  previousSections
                );

              const currentFirst =
                findBlockLocation(
                  nextSections,
                  firstBlock.id
                );

              const currentSecond =
                findBlockLocation(
                  nextSections,
                  secondBlock.id
                );

              if (
                !currentFirst ||
                !currentSecond
              ) {
                return previousSections;
              }

              if (
                !areBlocksInSameSection(
                  currentFirst,
                  currentSecond
                )
              ) {
                return previousSections;
              }

              if (
                !areBlocksAdjacent(
                  currentFirst,
                  currentSecond
                )
              ) {
                return previousSections;
              }

              const targetSection =
                nextSections.find(
                  (
                    section
                  ) =>
                    String(
                      section.id
                    ) ===
                    String(
                      currentFirst.sectionId
                    )
                );

              if (
                !targetSection
              ) {
                return previousSections;
              }

              const firstIndex =
                targetSection.blocks.findIndex(
                  (
                    block
                  ) =>
                    String(
                      block.id
                    ) ===
                    String(
                      firstBlock.id
                    )
                );

              const secondIndex =
                targetSection.blocks.findIndex(
                  (
                    block
                  ) =>
                    String(
                      block.id
                    ) ===
                    String(
                      secondBlock.id
                    )
                );

              if (
                firstIndex <
                  0 ||
                secondIndex <
                  0
              ) {
                return previousSections;
              }

              const earlierIndex =
                Math.min(
                  firstIndex,
                  secondIndex
                );

              const laterIndex =
                Math.max(
                  firstIndex,
                  secondIndex
                );

              const sourceBlock =
                targetSection
                  .blocks[
                    earlierIndex
                  ];

              const mergedBlock =
                createGeneratedBlock({
                  id:
                    mergedBlockId,

                  type:
                    "Merged",

                  text:
                    mergedText,

                  sourceBlock,

                  color:
                    MERGED_COLOR,

                  fill:
                    MERGED_FILL,
                });

              /**
               * 先删除后面的模块，
               * 避免前面的索引变化。
               */
              targetSection.blocks.splice(
                laterIndex,
                1
              );

              /**
               * 使用新的融合模块
               * 替换前面的模块。
               */
              targetSection.blocks.splice(
                earlierIndex,
                1,
                mergedBlock
              );

              return normalizeSections(
                nextSections,
                createEditingSectionFn
              );
            }
          );

          /**
           * 融合后只选中新模块。
           */
          setSelectedIds([
            mergedBlockId,
          ]);

          showTemporaryStatus(
            "两个模块已融合"
          );

          return {
            blockId:
              mergedBlockId,

            text:
              mergedText,
          };
        } catch (error) {
          return handleRequestError(
            error
          );
        } finally {
          finishRequest(
            controller
          );
        }
      },
      [
        getSelectedBlockPair,
        getBlockPairLocations,
        validateAdjacentPair,
        beginRequest,
        nextBlockIdRef,
        setSections,
        pushHistorySnapshot,
        createEditingSectionFn,
        setSelectedIds,
        showTemporaryStatus,
        handleRequestError,
        finishRequest,
      ]
    );

  /**
   * 3. 模仿
   *
   * firstBlock：
   * 风格参考模块。
   *
   * secondBlock：
   * 被改写模块。
   *
   * 第一个模块保持不变，
   * 只修改第二个模块。
   */
  const handleImitateBlock =
    useCallback(
      async () => {
        const {
          firstBlock,
          secondBlock,
        } =
          getSelectedBlockPair();

        const controller =
          beginRequest(
            "正在模仿第一个模块的表达风格..."
          );

        try {
          const result =
            await multiBlockOperation({
              operation:
                "imitate",

              firstBlock:
                serializeBlock(
                  firstBlock
                ),

              secondBlock:
                serializeBlock(
                  secondBlock
                ),

              options: {},

              signal:
                controller.signal,
            });

          const rewrittenText =
            getResultText(
              result?.secondBlock ||
                result
            );

          if (
            !rewrittenText
          ) {
            throw new Error(
              "没有生成有效的模仿文本"
            );
          }

          setSections(
            (
              previousSections
            ) => {
              pushHistorySnapshot(
                previousSections
              );

              const nextSections =
                previousSections.map(
                  (
                    section
                  ) => ({
                    ...section,

                    blocks:
                      section.blocks.map(
                        (
                          block
                        ) => {
                          if (
                            String(
                              block.id
                            ) !==
                            String(
                              secondBlock.id
                            )
                          ) {
                            return block;
                          }

                          const width =
                            block.floatingWidth ||
                            block.width ||
                            BLOCK_WIDTH;

                          return {
                            ...block,

                            text:
                              rewrittenText,

                            height:
                              estimateBlockHeight(
                                rewrittenText,
                                width
                              ),

                            isGenerated:
                              true,
                          };
                        }
                      ),
                  })
                );

              return normalizeSections(
                nextSections,
                createEditingSectionFn
              );
            }
          );

          /**
           * 保留两个模块的选择顺序。
           */
          setSelectedIds([
            firstBlock.id,
            secondBlock.id,
          ]);

          showTemporaryStatus(
            "第二个模块已模仿第一个模块的风格"
          );

          return {
            blockId:
              secondBlock.id,

            text:
              rewrittenText,
          };
        } catch (error) {
          return handleRequestError(
            error
          );
        } finally {
          finishRequest(
            controller
          );
        }
      },
      [
        getSelectedBlockPair,
        beginRequest,
        setSections,
        pushHistorySnapshot,
        createEditingSectionFn,
        setSelectedIds,
        showTemporaryStatus,
        handleRequestError,
        finishRequest,
      ]
    );

  /**
   * 4. 建立联系
   *
   * relationType：
   * contrast = 对比
   * cause = 因果
   *
   * 该操作会同时更新两个模块。
   */
  const handleRelateBlocks =
    useCallback(
      async ({
        relationType =
          "contrast",
      } = {}) => {
        const {
          firstBlock,
          secondBlock,
        } =
          getSelectedBlockPair();

        const supportedRelationTypes =
  new Set([
    "cause",
    "contrast",
    "progressive",
    "transition",
  ]);

const normalizedRelationType =
  supportedRelationTypes.has(
    relationType
  )
    ? relationType
    : "contrast";

        const relationStatusMap = {
  cause:
    "正在建立因果联系...",

  contrast:
    "正在建立对比联系...",

  progressive:
    "正在建立递进联系...",

  transition:
    "正在建立转折联系...",
};

const statusMessage =
  relationStatusMap[
    normalizedRelationType
  ] ||
  "正在建立模块联系...";

        const controller =
          beginRequest(
            statusMessage
          );

        try {
          const result =
            await multiBlockOperation({
              operation:
                "relate",

              firstBlock:
                serializeBlock(
                  firstBlock
                ),

              secondBlock:
                serializeBlock(
                  secondBlock
                ),

              options: {
                relationType:
                  normalizedRelationType,
              },

              signal:
                controller.signal,
            });

          const firstText =
            getResultText(
              result?.firstBlock
            );

          const secondText =
            getResultText(
              result?.secondBlock
            );

          if (
            !firstText ||
            !secondText
          ) {
            throw new Error(
              "没有生成有效的关联文本"
            );
          }

          const resultMap =
            new Map([
              [
                String(
                  firstBlock.id
                ),
                firstText,
              ],

              [
                String(
                  secondBlock.id
                ),
                secondText,
              ],
            ]);

          setSections(
            (
              previousSections
            ) => {
              pushHistorySnapshot(
                previousSections
              );

              const nextSections =
                previousSections.map(
                  (
                    section
                  ) => ({
                    ...section,

                    blocks:
                      section.blocks.map(
                        (
                          block
                        ) => {
                          const nextText =
                            resultMap.get(
                              String(
                                block.id
                              )
                            );

                          if (
                            !nextText
                          ) {
                            return block;
                          }

                          const width =
                            block.floatingWidth ||
                            block.width ||
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

                            isGenerated:
                              true,
                          };
                        }
                      ),
                  })
                );

              return normalizeSections(
                nextSections,
                createEditingSectionFn
              );
            }
          );

          /**
           * 保留两个模块的选择顺序。
           */
          setSelectedIds([
            firstBlock.id,
            secondBlock.id,
          ]);

         const relationSuccessMap = {
  cause:
    "已建立因果联系",

  contrast:
    "已建立对比联系",

  progressive:
    "已建立递进联系",

  transition:
    "已建立转折联系",
};

showTemporaryStatus(
  relationSuccessMap[
    normalizedRelationType
  ] ||
  "已建立模块联系"
);
          return {
            firstBlock: {
              id:
                firstBlock.id,

              text:
                firstText,
            },

            secondBlock: {
              id:
                secondBlock.id,

              text:
                secondText,
            },
          };
        } catch (error) {
          return handleRequestError(
            error
          );
        } finally {
          finishRequest(
            controller
          );
        }
      },
      [
        getSelectedBlockPair,
        beginRequest,
        setSections,
        pushHistorySnapshot,
        createEditingSectionFn,
        setSelectedIds,
        showTemporaryStatus,
        handleRequestError,
        finishRequest,
      ]
    );

  /**
   * 清除错误。
   */
  const clearMultiActionError =
    useCallback(() => {
      setMultiActionError(
        ""
      );
    }, []);

  /**
   * 组件卸载时取消请求。
   */
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    isApplyingMultiAction,
    multiActionError,

    clearMultiActionError,

    handleJoinBlocks,
    handleMergeBlocks,
    handleImitateBlock,
    handleRelateBlocks,
  };
}