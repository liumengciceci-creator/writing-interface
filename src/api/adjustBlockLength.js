const DEFAULT_API_URL =
  "http://localhost:3001/api/adjust-length";

/**
 * 调整单个模块的文本长度。
 *
 * @param {Object} params
 * @param {string|number} params.blockId 模块 ID
 * @param {string} params.text 原始文本
 * @param {string} params.type 模块类型
 * @param {number} params.value 长度参数，范围 -100 到 100
 * @param {number} [params.targetLength] 拖拽后的目标字数或词数
 * @param {"characters"|"words"} [params.lengthUnit] 长度单位
 * @param {AbortSignal} [params.signal] 用于取消请求
 *
 * @returns {Promise<{
 *   blockId: string|number,
 *   text: string
 * }>}
 */
export async function adjustBlockLength({
  blockId,
  text,
  type,
  value,
  targetLength,
  lengthUnit,
  signal,
}) {
  if (blockId == null) {
    throw new Error("缺少 blockId");
  }

  const normalizedText = String(text || "").trim();

  if (!normalizedText) {
    throw new Error("当前模块没有可调整的文本");
  }

  const normalizedValue = Math.max(
    -100,
    Math.min(100, Number(value) || 0)
  );

  const response = await fetch(DEFAULT_API_URL, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    signal,

    body: JSON.stringify({
      blockId,
      text: normalizedText,
      type: type || "Unknown",
      value: normalizedValue,
      targetLength:
        Number.isFinite(
          Number(targetLength)
        )
          ? Math.max(
              1,
              Math.round(
                Number(targetLength)
              )
            )
          : undefined,
      lengthUnit:
        lengthUnit === "words"
          ? "words"
          : "characters",
    }),
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    throw new Error("服务器返回的数据格式不正确");
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
        data?.message ||
        `调整长度失败：${response.status}`
    );
  }

  const resultText = String(
    data?.text ?? data?.result?.text ?? ""
  ).trim();

  if (!resultText) {
    throw new Error("AI 没有返回有效文本");
  }

  return {
    blockId: data?.blockId ?? blockId,
    text: resultText,
  };
}
