import { API_BASE_URL } from "../apiConfig";

const DEFAULT_API_URL =
  `${API_BASE_URL}/api/adjust-style`;

function normalizeStyleComparison(value) {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .replace(/[。！？.!?]+$/g, "")
    .trim();
}

/**
 * 调整单个模块的文本风格。
 *
 * @param {Object} params
 * @param {string|number} params.blockId 模块 ID
 * @param {string} params.text 原始文本
 * @param {string} params.type 模块类型
 * @param {string} params.style 风格 ID 或风格说明
 * @param {string} [params.styleLabel] 风格中文名称
 * @param {boolean} [params.isCustom] 是否为自定义风格
 * @param {AbortSignal} [params.signal] 用于取消请求
 *
 * @returns {Promise<{
 *   blockId: string|number,
 *   text: string
 * }>}
 */
export async function adjustBlockStyle({
  blockId,
  text,
  type,
  style,
  styleLabel,
  isCustom = false,
  signal,
}) {
  if (blockId == null) {
    throw new Error("缺少 blockId");
  }

  const normalizedText =
    String(text || "").trim();

  if (!normalizedText) {
    throw new Error(
      "当前模块没有可调整的文本"
    );
  }

  const normalizedStyle =
    String(style || "").trim();

  if (!normalizedStyle) {
    throw new Error(
      "请选择或输入文本风格"
    );
  }

  const response = await fetch(
    DEFAULT_API_URL,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      signal,

      body: JSON.stringify({
        blockId,
        text: normalizedText,
        type:
          type || "Unknown",
        style:
          normalizedStyle,
        styleLabel:
          String(
            styleLabel || ""
          ).trim(),
        isCustom:
          Boolean(isCustom),
      }),
    }
  );

  let data = null;

  try {
    data =
      await response.json();
  } catch {
    throw new Error(
      "服务器返回的数据格式不正确"
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
        data?.message ||
        `调整文本风格失败：${response.status}`
    );
  }

  const resultText =
    String(
      data?.text ??
        data?.result?.text ??
        ""
    ).trim();

  if (!resultText) {
    throw new Error(
      "AI 没有返回有效文本"
    );
  }

  if (
    normalizeStyleComparison(resultText) ===
    normalizeStyleComparison(normalizedText)
  ) {
    throw new Error(
      "模型没有实际改变文本风格，请重试或选择更明确的风格"
    );
  }

  return {
    blockId:
      data?.blockId ??
      blockId,

    text: resultText,
  };
}
