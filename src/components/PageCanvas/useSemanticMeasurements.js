import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  BLOCK_SELECTOR,
  normalizeId,
} from "./semanticEditorUtils";

/**
 * 将数值限制为有效的有限数字。
 */
function toFiniteNumber(
  value,
  fallback = 0
) {
  return Number.isFinite(value)
    ? value
    : fallback;
}

/**
 * 对测量结果进行轻量取整。
 *
 * 避免浏览器产生极小的小数变化，
 * 导致 React 反复更新 lineExtensions。
 */
function roundMeasurement(value) {
  return (
    Math.round(value * 100) /
    100
  );
}

/**
 * 比较两次数组测量结果是否相同。
 *
 * 防止 ResizeObserver 或 selectionchange
 * 触发无意义的重复 setState。
 */
function areMeasurementsEqual(
  previous,
  next
) {
  if (previous === next) {
    return true;
  }

  if (
    !Array.isArray(previous) ||
    !Array.isArray(next) ||
    previous.length !== next.length
  ) {
    return false;
  }

  for (
    let index = 0;
    index < previous.length;
    index += 1
  ) {
    const first =
      previous[index];

    const second =
      next[index];

    if (
      first.blockId !==
        second.blockId ||
      first.fragmentIndex !==
        second.fragmentIndex ||
      first.left !==
        second.left ||
      first.top !==
        second.top ||
      first.width !==
        second.width ||
      first.naturalWidth !==
        second.naturalWidth ||
      first.height !==
        second.height ||
      first.right !==
        second.right ||
      first.naturalRight !==
        second.naturalRight ||
      first.bottom !==
        second.bottom
    ) {
      return false;
    }
  }

  return true;
}

/**
 * 测量所有 semantic block 的视觉片段。
 *
 * 一个 inline block 跨越多行时，
 * getClientRects() 会返回多个 DOMRect。
 */
function collectLineExtensions(
  editor
) {
  if (!editor) {
    return [];
  }

  const editorRect =
    editor.getBoundingClientRect();

  const scaleX =
    editor.offsetWidth > 0
      ? editorRect.width /
        editor.offsetWidth
      : 1;

  const scaleY =
    editor.offsetHeight > 0
      ? editorRect.height /
        editor.offsetHeight
      : scaleX;

  const safeScaleX =
    Number.isFinite(scaleX) &&
    scaleX > 0
      ? scaleX
      : 1;

  const safeScaleY =
    Number.isFinite(scaleY) &&
    scaleY > 0
      ? scaleY
      : 1;

  const scrollLeft =
    editor.scrollLeft || 0;

  const scrollTop =
    editor.scrollTop || 0;

  const computedEditorStyle =
    window.getComputedStyle(
      editor
    );

  const paddingRight =
    Number.parseFloat(
      computedEditorStyle
        .paddingRight
    ) || 0;

  /**
   * 所有自动换行行的右侧统一终点。
   */
  const editorRight =
    Math.max(
      0,
      editor.offsetWidth -
        paddingRight
    );

  const visualFragments = [];

  const elements =
    Array.from(
      editor.querySelectorAll(
        BLOCK_SELECTOR
      )
    );

  elements.forEach(
    (
      element,
      blockIndex
    ) => {
      /**
       * 完成段落不参与 inline 模块的
       * 右边界补齐逻辑。
       */
      if (
        element.dataset
          .completedInline ===
        "true"
      ) {
        return;
      }

      const blockId =
        normalizeId(
          element.dataset
            .semanticBlockId
        );

      if (!blockId) {
        return;
      }

      let rects =
        Array.from(
          element.getClientRects()
        ).filter(
          (rect) =>
            rect.width > 0 &&
            rect.height > 0
        );

      if (
        rects.length === 0
      ) {
        const fallbackRect =
          element
            .getBoundingClientRect();

        if (
          fallbackRect.width > 0 &&
          fallbackRect.height > 0
        ) {
          rects = [
            fallbackRect,
          ];
        }
      }

      rects.forEach(
        (
          rect,
          fragmentIndex
        ) => {
          const left =
            (
              rect.left -
              editorRect.left
            ) /
              safeScaleX +
            scrollLeft;

          const right =
            (
              rect.right -
              editorRect.left
            ) /
              safeScaleX +
            scrollLeft;

          const top =
            (
              rect.top -
              editorRect.top
            ) /
              safeScaleY +
            scrollTop;

          const height =
            rect.height /
            safeScaleY;

          visualFragments.push({
            blockId,
            blockIndex,
            fragmentIndex,

            /**
             * 用户主动要求该模块另起一行。
             */
            /**
             * “强制另起一行”只发生在模块的第一个视觉片段之前。
             *
             * 一个带 forceLineBreakBefore 的模块如果自身自动换行，
             * 第二行 / 第三行仍然只是浏览器自动换行，不能继续继承
             * forceLineBreakBefore。旧逻辑把 element 的标记复制给每个
             * fragment，导致末行只剩 1–2 个字符（例如“险。”）时，
             * 上一行被误判为“人工换行前一行”，从而不再补齐到右边界，
             * 长度拉伸的行尾安全距离也会表现异常。
             */
            forceLineBreakBefore:
              fragmentIndex === 0 &&
              element.dataset
                .forceLineBreakBefore ===
                "true",

            left,
            right,
            top,
            height,
          });
        }
      );
    }
  );

  /**
   * 根据 top 坐标整理真实视觉行。
   */
  const visualRows = [];

  visualFragments
    .sort(
      (
        first,
        second
      ) =>
        first.top -
          second.top ||
        first.left -
          second.left ||
        first.blockIndex -
          second.blockIndex
    )
    .forEach(
      (fragment) => {
        const existingRow =
          visualRows.find(
            (row) =>
              Math.abs(
                row.top -
                  fragment.top
              ) <= 4
          );

        if (existingRow) {
          existingRow
            .fragments
            .push(
              fragment
            );

          return;
        }

        visualRows.push({
          top:
            fragment.top,

          fragments: [
            fragment,
          ],
        });
      }
    );

  visualRows.sort(
    (
      first,
      second
    ) =>
      first.top -
      second.top
  );

  const result = [];

  visualRows.forEach(
    (
      row,
      rowIndex
    ) => {
      row.fragments.sort(
        (
          first,
          second
        ) =>
          first.left -
            second.left ||
          first.blockIndex -
            second.blockIndex
      );

      const nextRow =
        visualRows[
          rowIndex + 1
        ];

      /**
       * 获取下一视觉行最左侧的模块片段。
       */
      const nextRowFirstFragment =
        nextRow?.fragments.reduce(
          (
            current,
            fragment
          ) =>
            !current ||
            fragment.left <
              current.left
              ? fragment
              : current,
          null
        );

      /**
       * 下一行如果是用户主动换行，
       * 当前行保持自然宽度。
       *
       * 下一行如果只是浏览器自动换行，
       * 当前行最右模块补齐到编辑器右边界。
       */
      const endsBeforeForcedRow =
        Boolean(
          nextRowFirstFragment
            ?.forceLineBreakBefore
        );

      const rightmostFragment =
        row.fragments.reduce(
          (
            current,
            fragment
          ) =>
            !current ||
            fragment.right >
              current.right
              ? fragment
              : current,
          null
        );

      if (!rightmostFragment) {
        return;
      }

      row.fragments.forEach(
        (fragment) => {
          const isRightmost =
            fragment ===
            rightmostFragment;

          /**
           * 只有以下情况才补齐：
           *
           * 1. 当前行不是最后一行
           * 2. 当前片段是这一行最右侧模块
           * 3. 下一行不是用户主动换行
           */
          const shouldFillRow =
            rowIndex <
              visualRows.length -
                1 &&
            isRightmost &&
            !endsBeforeForcedRow;

          const finalRight =
            shouldFillRow
              ? editorRight
              : fragment.right;

          const left =
            roundMeasurement(
              toFiniteNumber(
                fragment.left
              )
            );

          const top =
            roundMeasurement(
              toFiniteNumber(
                fragment.top
              )
            );

          /**
           * 用于视觉边框绘制的宽度。
           *
           * 当当前行属于自动换行时，
           * 最右侧模块可能会补齐到编辑器右边。
           */
          const width =
            roundMeasurement(
              Math.max(
                1,
                toFiniteNumber(
                  finalRight -
                    fragment.left
                )
              )
            );

          /**
           * 模块片段在真实文档流中的自然宽度。
           *
           * 这个值不会因为视觉补齐而变大，
           * 长度拉伸计算必须使用这个字段。
           */
          const naturalWidth =
            roundMeasurement(
              Math.max(
                1,
                toFiniteNumber(
                  fragment.right -
                    fragment.left
                )
              )
            );

          const naturalRight =
            roundMeasurement(
              toFiniteNumber(
                fragment.right
              )
            );

          const height =
            roundMeasurement(
              Math.max(
                0,
                toFiniteNumber(
                  fragment.height
                )
              )
            );

          result.push({
            key: [
              "row",
              rowIndex,
              fragment.blockId,
              fragment.fragmentIndex,
            ].join("-"),

            blockId:
              fragment.blockId,

            blockIndex:
              fragment.blockIndex,

            fragmentIndex:
              fragment.fragmentIndex,

            left,
            top,

            /**
             * SVG、高亮层使用的视觉宽度。
             */
            width,

            /**
             * 长度拉伸使用的真实宽度。
             */
            naturalWidth,

            height,

            /**
             * 视觉补齐后的右边界。
             */
            right:
              roundMeasurement(
                left + width
              ),

            /**
             * DOM 片段真实右边界。
             */
            naturalRight,

            bottom:
              roundMeasurement(
                top + height
              ),
          });
        }
      );
    }
  );

  return result;
}

/**
 * 管理 inline semantic block 的 DOM 测量。
 */
export default function useSemanticMeasurements({
  editorRef,

  /**
   * blocks 变化时重新测量。
   */
  blocks = [],

  /**
   * 文本编辑状态变化时重新测量。
   */
  editingBlockId = null,

  /**
   * AI 流式生成过程中需要持续测量。
   */
  isGenerating = false,

  /**
   * 长度调整期间重新测量。
   */
  isAdjustingLength = false,

  /**
   * 其他会影响布局的依赖。
   * 可以传字符串、数字或布尔值。
   */
  layoutVersion = null,
} = {}) {
  const [
    lineExtensions,
    setLineExtensions,
  ] = useState([]);

  const frameRef =
    useRef(null);

  const mountedRef =
    useRef(true);

  const measurementKeyRef =
    useRef("");

  /**
   * 立即执行一次真实 DOM 测量。
   */
  const measureLineExtensions =
    useCallback(() => {
      const editor =
        editorRef?.current;

      if (
        !editor ||
        !mountedRef.current
      ) {
        return [];
      }

      const nextMeasurements =
        collectLineExtensions(
          editor
        );

      setLineExtensions(
        (previous) =>
          areMeasurementsEqual(
            previous,
            nextMeasurements
          )
            ? previous
            : nextMeasurements
      );

      return nextMeasurements;
    }, [editorRef]);

  /**
   * 把多次测量请求合并到同一帧。
   */
  const scheduleMeasurement =
    useCallback(() => {
      if (
        typeof window ===
        "undefined"
      ) {
        return;
      }

      if (
        frameRef.current != null
      ) {
        window.cancelAnimationFrame(
          frameRef.current
        );
      }

      frameRef.current =
        window.requestAnimationFrame(
          () => {
            frameRef.current =
              null;

            measureLineExtensions();
          }
        );
    }, [
      measureLineExtensions,
    ]);

  /**
   * 组件首次渲染，以及主要布局依赖变化后，
   * 在浏览器绘制前重新测量。
   */
  useLayoutEffect(() => {
    scheduleMeasurement();
  }, [
    blocks,
    editingBlockId,
    isAdjustingLength,
    isGenerating,
    layoutVersion,
    scheduleMeasurement,
  ]);

  /**
   * 根据 block 的 ID、文本和换行属性生成测量 key。
   *
   * 避免父组件每次创建新 blocks 数组时，
   * 无条件重复测量。
   */
  useEffect(() => {
    const nextKey =
      blocks
        .map((block) => {
          return [
            normalizeId(
              block?.id
            ),

            String(
              block?.text ?? ""
            ),

            block
              ?.forceLineBreakBefore
              ? "1"
              : "0",

            block
              ?.isCompletedParagraph
              ? "1"
              : "0",
          ].join(":");
        })
        .join("|");

    if (
      measurementKeyRef.current ===
      nextKey
    ) {
      return;
    }

    measurementKeyRef.current =
      nextKey;

    scheduleMeasurement();
  }, [
    blocks,
    scheduleMeasurement,
  ]);

  /**
   * 监听编辑器自身和模块元素的尺寸变化。
   */
  useEffect(() => {
    const editor =
      editorRef?.current;

    if (!editor) {
      return undefined;
    }

    if (
      typeof ResizeObserver ===
      "undefined"
    ) {
      const handleWindowResize =
        () => {
          scheduleMeasurement();
        };

      window.addEventListener(
        "resize",
        handleWindowResize
      );

      return () => {
        window.removeEventListener(
          "resize",
          handleWindowResize
        );
      };
    }

    const resizeObserver =
      new ResizeObserver(() => {
        scheduleMeasurement();
      });

    resizeObserver.observe(
      editor
    );

    const blockElements =
      editor.querySelectorAll(
        BLOCK_SELECTOR
      );

    blockElements.forEach(
      (element) => {
        resizeObserver.observe(
          element
        );
      }
    );

    return () => {
      resizeObserver.disconnect();
    };
  }, [
    blocks,
    editorRef,
    scheduleMeasurement,
  ]);

  /**
   * 监听 DOM 内容变化。
   *
   * contentEditable、AI 流式输出和 spacer 改变时，
   * React state 变化可能晚于真实 DOM，因此需要
   * MutationObserver 作为补充。
   */
  useEffect(() => {
    const editor =
      editorRef?.current;

    if (
      !editor ||
      typeof MutationObserver ===
        "undefined"
    ) {
      return undefined;
    }

    const mutationObserver =
      new MutationObserver(
        (mutations) => {
          const hasRelevantChange =
            mutations.some(
              (mutation) =>
                mutation.type ===
                  "characterData" ||
                mutation.type ===
                  "childList" ||
                (
                  mutation.type ===
                    "attributes" &&
                  (
                    mutation.attributeName ===
                      "style" ||
                    mutation.attributeName ===
                      "class" ||
                    mutation.attributeName ===
                      "data-semantic-block-id" ||
                    mutation.attributeName ===
                      "data-force-line-break-before"
                  )
                )
            );

          if (
            hasRelevantChange
          ) {
            scheduleMeasurement();
          }
        }
      );

    mutationObserver.observe(
      editor,
      {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,

        attributeFilter: [
          "style",
          "class",
          "data-semantic-block-id",
          "data-force-line-break-before",
        ],
      }
    );

    return () => {
      mutationObserver
        .disconnect();
    };
  }, [
    editorRef,
    scheduleMeasurement,
  ]);

  /**
   * 页面滚动、编辑器滚动以及字体加载完成后，
   * 位置可能发生变化，需要重新测量。
   */
  useEffect(() => {
    const editor =
      editorRef?.current;

    if (!editor) {
      return undefined;
    }

    const handleScroll =
      () => {
        scheduleMeasurement();
      };

    const handleWindowResize =
      () => {
        scheduleMeasurement();
      };

    editor.addEventListener(
      "scroll",
      handleScroll,
      {
        passive: true,
      }
    );

    window.addEventListener(
      "resize",
      handleWindowResize
    );

    let cancelled = false;

    if (
      document.fonts?.ready
    ) {
      document.fonts.ready.then(
        () => {
          if (!cancelled) {
            scheduleMeasurement();
          }
        }
      );
    }

    return () => {
      cancelled = true;

      editor.removeEventListener(
        "scroll",
        handleScroll
      );

      window.removeEventListener(
        "resize",
        handleWindowResize
      );
    };
  }, [
    editorRef,
    scheduleMeasurement,
  ]);

  /**
   * AI 流式生成时，文字可能快速变化。
   * 使用 requestAnimationFrame 持续更新边框。
   */
  useEffect(() => {
    if (
      !isGenerating &&
      !isAdjustingLength
    ) {
      return undefined;
    }

    let frameId = null;
    let cancelled = false;

    const update = () => {
      if (cancelled) {
        return;
      }

      measureLineExtensions();

      frameId =
        window.requestAnimationFrame(
          update
        );
    };

    frameId =
      window.requestAnimationFrame(
        update
      );

    return () => {
      cancelled = true;

      if (frameId != null) {
        window.cancelAnimationFrame(
          frameId
        );
      }
    };
  }, [
    isAdjustingLength,
    isGenerating,
    measureLineExtensions,
  ]);

  /**
   * 组件卸载清理。
   */
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current =
        false;

      if (
        frameRef.current != null
      ) {
        window.cancelAnimationFrame(
          frameRef.current
        );

        frameRef.current =
          null;
      }
    };
  }, []);

  return {
    lineExtensions,
    measureLineExtensions,
    scheduleMeasurement,
  };
}