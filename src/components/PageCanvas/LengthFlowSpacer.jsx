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
const MIN_CHUNK_WIDTH = 1;
const MAX_CHUNK_WIDTH = 3;

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
   * 常规编辑器中通常约为 1–3px，
   * 可以显著减少跨行以后累计的排版误差。
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