function normalizeSnapshotComparison(value) {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .replace(/[。！？.!?]+$/g, "")
    .trim();
}

function inspectSnapshotText(value) {
  const text = String(value || "");

  return {
    text,
    json: JSON.stringify(text),
    length: text.length,
    normalized:
      normalizeSnapshotComparison(
        text
      ),
  };
}

function findRenderedGenerationBlock(blockId) {
  if (
    typeof document === "undefined"
  ) {
    return null;
  }

  const targetId = String(blockId);
  const candidates = Array.from(
    document.querySelectorAll(
      "[data-semantic-block-id]"
    )
  ).filter(
    (element) =>
      String(
        element.getAttribute(
          "data-semantic-block-id"
        ) || ""
      ) === targetId
  );

  if (!candidates.length) {
    return null;
  }

  const activeElement =
    document.activeElement;

  /**
   * 页面过渡期间同一模块可能短暂存在两个 DOM 节点。
   * 优先读取用户正在编辑的节点，不能取到旧副本。
   */
  return (
    candidates.find(
      (element) =>
        element === activeElement ||
        element.contains(activeElement)
    ) ||
    candidates.find(
      (element) =>
        element.getAttribute(
          "data-editing"
        ) === "true"
    ) ||
    candidates.find(
      (element) =>
        element.querySelector(
          "[data-semantic-block-content='true']"
        )
    ) ||
    candidates[0]
  );
}

export function inspectRenderedGenerationBlock(
  blockId
) {
  const blockElement =
    findRenderedGenerationBlock(
      blockId
    );

  if (!blockElement) {
    return {
      found: false,
      text: inspectSnapshotText(""),
      dataEditing: null,
      contentEditable: null,
      isActiveElement: false,
      hasContentElement: false,
    };
  }

  const contentElement =
    blockElement.matches(
      "[data-semantic-block-content='true']"
    )
      ? blockElement
      : blockElement.querySelector(
          "[data-semantic-block-content='true']"
        );

  const textElement =
    contentElement || blockElement;

  return {
    found: true,
    text: inspectSnapshotText(
      textElement.textContent || ""
    ),
    dataEditing:
      blockElement.getAttribute(
        "data-editing"
      ),
    contentEditable:
      blockElement.isContentEditable ||
      Boolean(
        contentElement?.isContentEditable
      ),
    isActiveElement:
      document.activeElement ===
        blockElement ||
      blockElement.contains(
        document.activeElement
      ),
    hasContentElement:
      Boolean(contentElement),
  };
}

function cleanRenderedGenerationText(value) {
  return String(value || "")
    .replace(
      /[\u200B-\u200D\uFEFF]/g,
      ""
    )
    .replace(/\r\n?/g, "\n");
}

/**
 * 取得本次生成真正应使用的文字。
 *
 * 不能只在 data-editing=true 时读取 DOM：点击顶部生成按钮时，
 * contentEditable 的 blur 与 React state 提交存在事件时序差。
 * 只要专用内容节点存在，就以画布实际可见文字为权威快照。
 */
export function getGenerationSnapshotText(
  block
) {
  const rendered =
    inspectRenderedGenerationBlock(
      block?.id
    );
  const stateText = String(
    block?.text || ""
  );

  if (
    !rendered.found ||
    !rendered.hasContentElement
  ) {
    return {
      text: stateText,
      source: "state",
      rendered,
    };
  }

  const domText =
    cleanRenderedGenerationText(
      rendered.text.text
    );

  return {
    text: domText,
    source:
      domText === stateText
        ? "dom-same-as-state"
        : "dom-newer-than-state",
    rendered,
  };
}
