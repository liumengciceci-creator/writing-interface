import { API_BASE_URL } from "../apiConfig";

const DEFAULT_API_URL =
  `${API_BASE_URL}/api/adjust-length`;

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
  onDelta,
  onTextStart,
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

  const normalizedValue =
    Math.max(
      -100,
      Math.min(100, Number(value) || 0)
    );

  const response =
    await fetch(DEFAULT_API_URL, {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
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

  if (!response.ok) {
    let message =
      `调整长度失败：${response.status}`;

    try {
      const data =
        await response.json();

      message =
        data?.error ||
        data?.message ||
        message;
    } catch {
      // 保留 HTTP 状态错误。
    }

    throw new Error(message);
  }

  if (!response.body) {
    throw new Error(
      "服务器没有返回流式结果"
    );
  }

  const reader =
    response.body.getReader();

  const decoder =
    new TextDecoder();

  let buffer = "";
  let resultText = "";
  let textStarted = false;

  const processLine = (line) => {
    const trimmed =
      String(line || "").trim();

    if (!trimmed) {
      return;
    }

    let event;

    try {
      event =
        JSON.parse(trimmed);
    } catch {
      throw new Error(
        "服务器返回的数据格式不正确"
      );
    }

    if (event.type === "error") {
      throw new Error(
        event.message ||
        "调整长度失败"
      );
    }

    if (event.type === "delta") {
      const delta =
        String(
          event.delta || ""
        );

      if (!delta) {
        return;
      }

      if (!textStarted) {
        textStarted = true;
        onTextStart?.();
      }

      resultText += delta;
      onDelta?.(
        delta,
        resultText
      );

      return;
    }

    if (event.type === "done") {
      const finalText =
        String(
          event.text || resultText
        ).trim();

      if (finalText) {
        resultText = finalText;
      }
    }
  };

  try {
    while (true) {
      const {
        value: chunk,
        done,
      } = await reader.read();

      if (done) {
        break;
      }

      buffer +=
        decoder.decode(
          chunk,
          {
            stream: true,
          }
        );

      const lines =
        buffer.split("\n");

      buffer =
        lines.pop() || "";

      lines.forEach(
        processLine
      );
    }

    buffer +=
      decoder.decode();

    if (buffer.trim()) {
      processLine(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  resultText =
    resultText.trim();

  if (!resultText) {
    throw new Error(
      "AI 没有返回有效文本"
    );
  }

  return {
    blockId,
    text: resultText,
  };
}
