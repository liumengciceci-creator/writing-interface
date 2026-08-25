import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  BLOCK_WIDTH,
} from "../../constants";

import {
  adjustBlockLength,
} from "../../api/adjustBlockLength";

import {
  adjustBlockStyle,
} from "../../api/adjustBlockStyle";

import {
  estimateBlockHeight,
} from "./layout";

import {
  normalizeSections,
} from "./sectionHelpers";

export function useAIActions({
  setSections,
  getBlockById,
  pushHistorySnapshot,
  showTemporaryStatus,
  setStatusText,
  clearStatusTimer,
  createEditingSectionFn,
}) {
  /**
   * 调整长度请求控制器。
   */
  const adjustLengthAbortControllerRef =
    useRef(null);

  /**
   * 调整文本风格请求控制器。
   */
  const adjustStyleAbortControllerRef =
    useRef(null);

  /**
   * 调整长度状态。
   */
  const [
    isAdjustingLength,
    setIsAdjustingLength,
  ] = useState(false);

  const [
    adjustLengthError,
    setAdjustLengthError,
  ] = useState("");

  const [
    adjustingLengthBlockId,
    setAdjustingLengthBlockId,
  ] = useState(null);

  /**
   * 调整文本风格状态。
   */
  const [
    isAdjustingStyle,
    setIsAdjustingStyle,
  ] = useState(false);

  const [
    adjustingStyleBlockId,
    setAdjustingStyleBlockId,
  ] = useState(null);

  const [
    adjustStyleError,
    setAdjustStyleError,
  ] = useState("");

  /**
   * 将 AI 返回的文本更新到对应模块。
   */
  const applyGeneratedText =
    useCallback(
      (
        result,
        {
          recordHistory = true,
          markGenerated = true,
        } = {}
      ) => {
        setSections(
          (previousSections) => {
            if (recordHistory) {
              pushHistorySnapshot(
                previousSections
              );
            }

            const nextSections =
              previousSections.map(
                (section) => {
                  if (
                    !section.blocks
                      ?.length
                  ) {
                    return section;
                  }

                  return {
                    ...section,

                    blocks:
                      section.blocks.map(
                        (block) => {
                          if (
                            String(
                              block.id
                            ) !==
                            String(
                              result.blockId
                            )
                          ) {
                            return block;
                          }

                          const widthForHeight =
                            block.floatingWidth ||
                            block.width ||
                            BLOCK_WIDTH;

                          return {
                            ...block,

                            text:
                              result.text,

                            height:
                              estimateBlockHeight(
                                result.text,
                                widthForHeight
                              ),

                            isGenerated:
                              markGenerated
                                ? true
                                : block.isGenerated,
                          };
                        }
                      ),
                  };
                }
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
   * 将完整的 AI 结果逐段写回模块，形成稳定的流式出字效果。
   * 历史记录只在第一段写入时保存一次。
   */
  const revealGeneratedText =
    useCallback(
      async (
        result,
        signal
      ) => {
        const characters =
          Array.from(
            String(
              result?.text || ""
            )
          );

        if (!characters.length) {
          return;
        }

        const chunkSize =
          Math.max(
            1,
            Math.ceil(
              characters.length /
                48
            )
          );

        let isFirstChunk = true;

        for (
          let end = chunkSize;
          end <=
          characters.length +
            chunkSize;
          end += chunkSize
        ) {
          if (signal?.aborted) {
            const abortError =
              new Error(
                "生成已取消"
              );

            abortError.name =
              "AbortError";

            throw abortError;
          }

          const visibleEnd =
            Math.min(
              end,
              characters.length
            );

          applyGeneratedText(
            {
              ...result,
              text:
                characters
                  .slice(
                    0,
                    visibleEnd
                  )
                  .join(""),
            },
            {
              recordHistory:
                isFirstChunk,
              markGenerated:
                visibleEnd ===
                characters.length,
            }
          );

          isFirstChunk = false;

          if (
            visibleEnd ===
            characters.length
          ) {
            break;
          }

          await new Promise(
            (resolve) =>
              window.setTimeout(
                resolve,
                24
              )
          );
        }
      },
      [applyGeneratedText]
    );

  /**
   * 调整模块长度。
   */
  const handleApplyBlockLength =
    useCallback(
      async (
        blockOrId,
        valueOrOptions
      ) => {
        const suppliedBlock =
          typeof blockOrId ===
            "object" &&
          blockOrId !== null
            ? blockOrId
            : null;

        /**
         * 面板操作可能持有旧 block；优先按 ID 读取画布中的最新模块。
         */
        const blockId =
          suppliedBlock?.id ??
          blockOrId;

        const block =
          getBlockById(blockId) ||
          suppliedBlock;

        if (!block) {
          const error =
            new Error(
              "没有找到当前模块"
            );

          setAdjustLengthError(
            error.message
          );

          throw error;
        }

        const currentText =
          String(
            block.text || ""
          ).trim();

        if (!currentText) {
          const error =
            new Error(
              "当前模块没有可调整的文本"
            );

          setAdjustLengthError(
            error.message
          );

          throw error;
        }

        const lengthOptions =
          typeof valueOrOptions ===
            "object" &&
          valueOrOptions !== null
            ? valueOrOptions
            : {
                value:
                  valueOrOptions,
              };

        const normalizedValue =
          Math.max(
            -100,
            Math.min(
              100,
              Number(
                lengthOptions.value
              ) || 0
            )
          );

        const targetLength =
          Number.isFinite(
            Number(
              lengthOptions.targetLength
            )
          )
            ? Math.max(
                1,
                Math.round(
                  Number(
                    lengthOptions.targetLength
                  )
                )
              )
            : undefined;

        const lengthUnit =
          lengthOptions.lengthUnit ===
            "words"
            ? "words"
            : "characters";

        if (
          normalizedValue === 0 &&
          targetLength == null
        ) {
          return {
            blockId: block.id,
            text: currentText,
          };
        }

        /**
         * 取消上一次尚未完成的长度请求。
         */
        adjustLengthAbortControllerRef.current?.abort();

        const controller =
          new AbortController();

        adjustLengthAbortControllerRef.current =
          controller;

        setIsAdjustingLength(
          true
        );

        setAdjustingLengthBlockId(
          String(block.id)
        );

        setAdjustLengthError("");

        clearStatusTimer?.();

        setStatusText(
          targetLength != null
            ? `正在将模块调整到约 ${targetLength}${
                lengthUnit ===
                "words"
                  ? "词"
                  : "字"
              }...`
            : "正在调整模块长度..."
        );

        try {
          const result =
            await adjustBlockLength({
              blockId: block.id,

              text:
                currentText,

              type:
                block.type ||
                "Unknown",

              value:
                normalizedValue,

              targetLength,

              lengthUnit,

              signal:
                controller.signal,
            });

          await revealGeneratedText(
            result,
            controller.signal
          );

          showTemporaryStatus(
            "模块长度调整完成"
          );

          setAdjustLengthError("");

          return result;
        } catch (error) {
          if (
            error?.name ===
            "AbortError"
          ) {
            return null;
          }

          console.error(
            "[useAIActions] 调整模块长度失败：",
            error
          );

          const message =
            error?.message ||
            "调整模块长度失败";

          setAdjustLengthError(
            message
          );

          setStatusText(message);

          throw error;
        } finally {
          if (
            adjustLengthAbortControllerRef.current ===
            controller
          ) {
            adjustLengthAbortControllerRef.current =
              null;
          }

          setIsAdjustingLength(
            false
          );

          setAdjustingLengthBlockId(
            null
          );
        }
      },
      [
        getBlockById,
        revealGeneratedText,
        showTemporaryStatus,
        setStatusText,
        clearStatusTimer,
      ]
    );

  /**
   * 调整模块文本风格。
   *
   * 参数格式：
   * {
   *   block,
   *   style,
   *   styleLabel,
   *   isCustom
   * }
   */
  const handleApplyBlockStyle =
    useCallback(
      async ({
        block: blockOrId,
        style,
        styleLabel = "",
        isCustom = false,
        onTextStart,
      }) => {
        const suppliedBlock =
          typeof blockOrId ===
            "object" &&
          blockOrId !== null
            ? blockOrId
            : null;

        /**
         * 快速指令会在动画后延迟触发，不能直接使用点击时捕获的旧 block。
         * 每次都先按 ID 读取画布中的最新模块，避免旧文字的改写结果被新状态覆盖。
         */
        const blockId =
          suppliedBlock?.id ??
          blockOrId;

        const block =
          getBlockById(blockId) ||
          suppliedBlock;

        if (!block) {
          const error =
            new Error(
              "没有找到当前模块"
            );

          setAdjustStyleError(
            error.message
          );

          throw error;
        }

        const currentText =
          String(
            block.text || ""
          ).trim();

        if (!currentText) {
          const error =
            new Error(
              "当前模块没有可调整的文本"
            );

          setAdjustStyleError(
            error.message
          );

          throw error;
        }

        const normalizedStyle =
          String(
            style || ""
          ).trim();

        if (!normalizedStyle) {
          const error =
            new Error(
              "请选择或输入文本风格"
            );

          setAdjustStyleError(
            error.message
          );

          throw error;
        }

        /**
         * 取消上一次尚未完成的风格请求。
         */
        adjustStyleAbortControllerRef.current?.abort();

        const controller =
          new AbortController();

        adjustStyleAbortControllerRef.current =
          controller;

        setIsAdjustingStyle(
          true
        );

        setAdjustingStyleBlockId(
          String(block.id)
        );

        setAdjustStyleError("");

        clearStatusTimer?.();

        setStatusText(
          "正在根据指令内容修改"
        );

        try {
          const result =
            await adjustBlockStyle({
              blockId: block.id,

              text:
                currentText,

              type:
                block.type ||
                "Unknown",

              style:
                normalizedStyle,

              styleLabel:
                String(
                  styleLabel || ""
                ).trim(),

              isCustom:
                Boolean(
                  isCustom
                ),

              signal:
                controller.signal,
            });

          onTextStart?.();

          await revealGeneratedText(
            result,
            controller.signal
          );

          setStatusText("");

          setAdjustStyleError("");

          return result;
        } catch (error) {
          if (
            error?.name ===
            "AbortError"
          ) {
            return null;
          }

          console.error(
            "[useAIActions] 调整文本风格失败：",
            error
          );

          const message =
            error?.message ||
            "调整文本风格失败";

          setAdjustStyleError(
            message
          );

          setStatusText(message);

          throw error;
        } finally {
          if (
            adjustStyleAbortControllerRef.current ===
            controller
          ) {
            adjustStyleAbortControllerRef.current =
              null;
          }

          setIsAdjustingStyle(
            false
          );

          setAdjustingStyleBlockId(
            null
          );
        }
      },
      [
        getBlockById,
        revealGeneratedText,
	        setStatusText,
        clearStatusTimer,
      ]
    );

  /**
   * 组件卸载时取消未完成请求。
   */
  useEffect(() => {
    return () => {
      adjustLengthAbortControllerRef.current?.abort();
      adjustStyleAbortControllerRef.current?.abort();
    };
  }, []);

  return {
    isAdjustingLength,
    adjustLengthError,
    adjustingLengthBlockId,

    isAdjustingStyle,
    adjustingStyleBlockId,
    adjustStyleError,

    handleApplyBlockLength,
    handleApplyBlockStyle,
  };
}
