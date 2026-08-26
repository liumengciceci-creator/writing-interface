import {
  memo,
  useMemo,
} from "react";

/**
 * 限制占位块的宽度。
 *
 * 块太大会导致每一行末尾出现较大的换行误差；
 * 块太小则会产生过多 DOM 节点。
 */
/**
 * 使用亚像素粒度避免跨行累计误差。
 *
 * 旧值为 1–3px：每次换行最多会遗留接近一个 chunk 的空白，
 * 多行累积后会把固定 8px 间距放大成几十像素。
 * 0.5px 粒度使每行误差控制在半像素以内。
 */
const MIN_CHUNK_WIDTH = 0.5;
const MAX_CHUNK_WIDTH = 0.5;

/**
 * 长度拉伸时的流式占位器。
 *
 * 占位器被插入正在拉伸的模块之后，
 * 通过一系列很小的 inline-block 模拟文字继续向后流动。
 *
 * 每个小块都允许在块与块之间自然换行，
 * 从而推动后面的语义模块向后移动。
 */
function LengthFlowSpacer({
  lengthResizePreview,
}) {
  const spacerWidth = Math.max(
    0,
    Number(
      lengthResizePreview
        ?.spacerWidth
    ) || 0
  );

  /**
   * 固定安全距离不再由 spacer 自己渲染。
   *
   * spacer 现在会被放进正在缩放的 semantic block 内部，
   * 因此模块本身统一的 margin-right: 6px 就是唯一的安全距离。
   * 这样 gap 不会作为独立 inline-block 自己换行，也不会在
   * 不同模块上表现成忽大忽小。
   */

  /**
   * 编辑器可用宽度。
   *
   * useLengthResize 已经把 editorRight
   * 放进 lengthResizePreview 中。
   */
  const editorWidth = Math.max(
    1,
    Number(
      lengthResizePreview
        ?.editorRight
    ) || 1
  );

  /**
   * 根据编辑器宽度选择较细的占位粒度。
   *
   * 固定为 0.5px，保证不同画布宽度和缩放比例下都使用
   * 相同的高精度流式占位。
   */
  const chunkWidth = useMemo(
    () =>
      Math.max(
        MIN_CHUNK_WIDTH,
        Math.min(
          MAX_CHUNK_WIDTH,
          editorWidth / 320
        )
      ),
    [editorWidth]
  );

  const chunks = useMemo(() => {
    if (
      !Number.isFinite(
        spacerWidth
      ) ||
      spacerWidth <= 0
    ) {
      return [];
    }

    const fullChunkCount =
      Math.floor(
        spacerWidth /
          chunkWidth
      );

    const remainder =
      spacerWidth -
      fullChunkCount *
        chunkWidth;

    const result =
      Array.from(
        {
          length:
            fullChunkCount,
        },
        (_, index) => ({
          key: `full-${index}`,
          width: chunkWidth,
        })
      );

    /**
     * 把不足一个完整小块的剩余宽度也加入，
     * 保证所有块的总宽度与 spacerWidth 一致。
     */
    if (remainder > 0.01) {
      result.push({
        key: "remainder",
        width: remainder,
      });
    }

    return result;
  }, [
    chunkWidth,
    spacerWidth,
  ]);

  if (chunks.length === 0) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      data-length-flow-spacer="true"
      contentEditable={false}
      style={{
        display: "inline",

        margin: 0,
        padding: 0,
        border: 0,

        /**
         * 清除 spacer 自身的文本排版属性，
         * 避免它改变真实视觉行高。
         */
        fontSize: 0,
        lineHeight: 0,
        letterSpacing: 0,
        wordSpacing: 0,

        pointerEvents: "none",

        userSelect: "none",
        WebkitUserSelect:
          "none",

        opacity: 0,
      }}
    >
      {chunks.map(
        (chunk) => (
          <span
            key={chunk.key}
            aria-hidden="true"
            data-length-flow-spacer-chunk="true"
            contentEditable={false}
            style={{
              display:
                "inline-block",

              boxSizing:
                "border-box",

              width:
                chunk.width,

              minWidth:
                chunk.width,

              maxWidth:
                chunk.width,

              /**
               * 保留极小高度使元素能够稳定参与 inline 排版，
               * 但不明显改变当前文本行的高度。
               */
              height: 1,

              margin: 0,
              padding: 0,
              border: 0,

              fontSize: 0,
              lineHeight: 0,

              verticalAlign:
                "baseline",

              overflow:
                "hidden",

              pointerEvents:
                "none",

              userSelect:
                "none",

              WebkitUserSelect:
                "none",
            }}
          />
        )
      )}


    </span>
  );
}

export default memo(
  LengthFlowSpacer
);
