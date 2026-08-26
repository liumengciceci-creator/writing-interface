const BLOCK_TYPE_LABELS = {
  Title: "标题",
  Claim: "论点",
  Evidence: "证据",
  Reason: "原因",
  Counter: "反论",
  Compare: "对比",
  Conclusion: "结论",
  Question: "问题",
  Generated: "生成",
  Transition: "过渡",
  Merged: "融合",
};

export const BLOCK_SELECTOR =
  "[data-semantic-block-id]";

export const EMPTY_TEXT = "\u200B";

export function normalizeId(value) {
  return value == null
    ? ""
    : String(value);
}

export function normalizeText(value) {
  return String(value ?? "")
    .replaceAll(EMPTY_TEXT, "")
    .replace(/\r\n?/g, "\n");
}

export function getWritingLengthInfo(
  value
) {
  const text =
    normalizeText(value).trim();

  const cjkCharacters =
    text.match(
      /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g
    ) || [];

  const latinWords =
    text.match(
      /[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g
    ) || [];

  if (
    cjkCharacters.length > 0 &&
    cjkCharacters.length >=
      latinWords.length
  ) {
    return {
      count:
        (
          text.match(
            /[\p{L}\p{N}]/gu
          ) || []
        ).length,
      unit: "characters",
      label: "字",
    };
  }

  return {
    count: latinWords.length,
    unit: "words",
    label: "词",
  };
}

/**
 * 判断画布内的模块是否应提供句尾长度调整手柄。
 *
 * 复制模块在尚未生成内容时可以沿用旧的隐藏规则；一旦 AI 已经
 * 生成内容，旧的 hideResizeHandle 不能继续让该模块缺少句尾圆点。
 * 浮动模块的边框缩放由 FloatingEditableBlock 单独控制。
 */
export function shouldShowInlineLengthResizeHandle(
  block
) {
  if (
    !block ||
    block.isCompletedParagraph === true ||
    !String(block.text || "").trim()
  ) {
    return false;
  }

  return (
    block.hideResizeHandle !== true ||
    block.isGenerated === true
  );
}

export function getTypeLabel(type) {
  return (
    BLOCK_TYPE_LABELS[type] ||
    type ||
    "标签"
  );
}

export function isNodeInside(
  node,
  element
) {
  if (!node || !element) {
    return false;
  }

  return (
    node === element ||
    element.contains(node)
  );
}

export function findBlockById(
  editor,
  blockId
) {
  if (!editor) {
    return null;
  }

  return (
    Array.from(
      editor.querySelectorAll(
        BLOCK_SELECTOR
      )
    ).find(
      (element) =>
        normalizeId(
          element.dataset
            .semanticBlockId
        ) ===
        normalizeId(blockId)
    ) || null
  );
}
