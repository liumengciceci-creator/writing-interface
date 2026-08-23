const SEMANTIC_BLOCK_SELECTOR =
  "[data-semantic-block-id]";

const SEMANTIC_TEXT_SELECTOR =
  "[data-semantic-text='true']";

export function normalizeSemanticText(text) {
  return String(text ?? "")
    .replace(/\u200B/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function isElement(node) {
  return Boolean(
    node &&
      node.nodeType ===
        Node.ELEMENT_NODE
  );
}

function getNodeElement(node) {
  if (!node) {
    return null;
  }

  if (isElement(node)) {
    return node;
  }

  return node.parentElement || null;
}

export function getSemanticBlockElements(
  editorElement
) {
  if (!editorElement) {
    return [];
  }

  return Array.from(
    editorElement.querySelectorAll(
      SEMANTIC_BLOCK_SELECTOR
    )
  );
}

export function getSemanticBlockElement(
  editorElement,
  blockId
) {
  if (
    !editorElement ||
    blockId === null ||
    blockId === undefined
  ) {
    return null;
  }

  const targetId =
    String(blockId);

  return (
    getSemanticBlockElements(
      editorElement
    ).find(
      (element) =>
        String(
          element.getAttribute(
            "data-semantic-block-id"
          )
        ) === targetId
    ) || null
  );
}

export function findSemanticBlockElement(
  node,
  editorElement
) {
  const element =
    getNodeElement(node);

  if (!element) {
    return null;
  }

  const blockElement =
    element.closest(
      SEMANTIC_BLOCK_SELECTOR
    );

  if (
    !blockElement ||
    !editorElement?.contains(
      blockElement
    )
  ) {
    return null;
  }

  return blockElement;
}

export function getSemanticTextElement(
  blockElement
) {
  if (!blockElement) {
    return null;
  }

  if (
    blockElement.matches(
      "[data-semantic-text='true']"
    )
  ) {
    return blockElement;
  }

  return blockElement.querySelector(
    "[data-semantic-text='true']"
  );
}
export function getSemanticBlockId(
  blockElement
) {
  if (!blockElement) {
    return null;
  }

  const blockId =
    blockElement.getAttribute(
      "data-semantic-block-id"
    );

  if (
    blockId === null ||
    blockId === ""
  ) {
    return null;
  }

  return String(blockId);
}

export function readSemanticBlockText(
  blockElement
) {
  const textElement =
    getSemanticTextElement(
      blockElement
    );

  if (!textElement) {
    return "";
  }

  return normalizeSemanticText(
    textElement.textContent
  );
}

export function readSemanticBlocksFromDom(
  editorElement
) {
  return getSemanticBlockElements(
    editorElement
  )
    .map((blockElement) => {
      const id =
        getSemanticBlockId(
          blockElement
        );

      if (!id) {
        return null;
      }

      return {
        id,
        text:
          readSemanticBlockText(
            blockElement
          ),
      };
    })
    .filter(Boolean);
}

export function isSelectionInsideEditor(
  editorElement,
  selection = window.getSelection()
) {
  if (
    !editorElement ||
    !selection ||
    selection.rangeCount === 0
  ) {
    return false;
  }

  const range =
    selection.getRangeAt(0);

  return (
    editorElement.contains(
      range.startContainer
    ) &&
    editorElement.contains(
      range.endContainer
    )
  );
}

function getTextOffset(
  textElement,
  node,
  nodeOffset
) {
  if (
    !textElement ||
    !node ||
    !(
      node === textElement ||
      textElement.contains(node)
    )
  ) {
    return null;
  }

  try {
    const range =
      document.createRange();

    range.selectNodeContents(
      textElement
    );

    range.setEnd(
      node,
      nodeOffset
    );

    return normalizeSemanticText(
      range.toString()
    ).length;
  } catch {
    return null;
  }
}

function getDomPointFromTextOffset(
  textElement,
  targetOffset
) {
  if (!textElement) {
    return null;
  }

  const safeOffset =
    Math.max(
      0,
      Number(targetOffset) || 0
    );

  const walker =
    document.createTreeWalker(
      textElement,
      NodeFilter.SHOW_TEXT
    );

  let visibleOffset = 0;
  let textNode =
    walker.nextNode();

  while (textNode) {
    const rawText =
      textNode.textContent || "";

    for (
      let index = 0;
      index <= rawText.length;
      index += 1
    ) {
      const visibleLength =
        normalizeSemanticText(
          rawText.slice(0, index)
        ).length;

      if (
        visibleOffset +
          visibleLength >=
        safeOffset
      ) {
        return {
          node: textNode,
          offset: index,
        };
      }
    }

    visibleOffset +=
      normalizeSemanticText(
        rawText
      ).length;

    textNode =
      walker.nextNode();
  }

  if (
    !textElement.firstChild
  ) {
    const emptyTextNode =
      document.createTextNode(
        "\u200B"
      );

    textElement.appendChild(
      emptyTextNode
    );

    return {
      node: emptyTextNode,
      offset: 0,
    };
  }

  const lastChild =
    textElement.lastChild;

  if (
    lastChild?.nodeType ===
    Node.TEXT_NODE
  ) {
    return {
      node: lastChild,
      offset:
        lastChild.textContent
          ?.length || 0,
    };
  }

  return {
    node: textElement,
    offset:
      textElement.childNodes
        .length,
  };
}

function createSelectionPoint(
  editorElement,
  node,
  nodeOffset
) {
  const blockElement =
    findSemanticBlockElement(
      node,
      editorElement
    );

  if (!blockElement) {
    return null;
  }

  const blockId =
    getSemanticBlockId(
      blockElement
    );

  const textElement =
    getSemanticTextElement(
      blockElement
    );

  if (
    !blockId ||
    !textElement ||
    !(
      node === textElement ||
      textElement.contains(node)
    )
  ) {
    return null;
  }

  const offset =
    getTextOffset(
      textElement,
      node,
      nodeOffset
    );

  if (offset === null) {
    return null;
  }

  return {
    blockId,
    offset,
  };
}

export function saveSemanticSelection(
  editorElement
) {
  const selection =
    window.getSelection();

  if (
    !isSelectionInsideEditor(
      editorElement,
      selection
    )
  ) {
    return null;
  }

  const anchor =
    createSelectionPoint(
      editorElement,
      selection.anchorNode,
      selection.anchorOffset
    );

  const focus =
    createSelectionPoint(
      editorElement,
      selection.focusNode,
      selection.focusOffset
    );

  if (
    !anchor ||
    !focus
  ) {
    return null;
  }

  return {
    anchor,
    focus,
    isCollapsed:
      selection.isCollapsed,
  };
}

function resolveSelectionPoint(
  editorElement,
  point
) {
  if (
    !editorElement ||
    !point
  ) {
    return null;
  }

  const blockElement =
    getSemanticBlockElement(
      editorElement,
      point.blockId
    );

  const textElement =
    getSemanticTextElement(
      blockElement
    );

  return getDomPointFromTextOffset(
    textElement,
    point.offset
  );
}

export function restoreSemanticSelection(
  editorElement,
  bookmark
) {
  if (
    !editorElement ||
    !bookmark
  ) {
    return false;
  }

  const anchorPoint =
    resolveSelectionPoint(
      editorElement,
      bookmark.anchor
    );

  const focusPoint =
    resolveSelectionPoint(
      editorElement,
      bookmark.focus
    );

  if (
    !anchorPoint ||
    !focusPoint
  ) {
    return false;
  }

  const selection =
    window.getSelection();

  if (!selection) {
    return false;
  }

  try {
    editorElement.focus({
      preventScroll: true,
    });

    selection.removeAllRanges();

    if (
      typeof selection.setBaseAndExtent ===
      "function"
    ) {
      selection.setBaseAndExtent(
        anchorPoint.node,
        anchorPoint.offset,
        focusPoint.node,
        focusPoint.offset
      );
    } else {
      const range =
        document.createRange();

      range.setStart(
        anchorPoint.node,
        anchorPoint.offset
      );

      range.setEnd(
        focusPoint.node,
        focusPoint.offset
      );

      selection.addRange(range);
    }

    return true;
  } catch {
    return false;
  }
}

export function placeCaretInSemanticBlock(
  editorElement,
  blockId,
  options = {}
) {
  const {
    atEnd = true,
    offset,
    preventScroll = true,
  } = options;

  if (!editorElement) {
    return false;
  }

  const blockElement =
    getSemanticBlockElement(
      editorElement,
      blockId
    );

  const textElement =
    getSemanticTextElement(
      blockElement
    );

  if (!textElement) {
    return false;
  }

  /**
   * 确保空模块中存在可放置光标的 Text 节点。
   */
  if (
    !textElement.firstChild
  ) {
    textElement.appendChild(
      document.createTextNode(
        "\u200B"
      )
    );
  }

  const textLength =
    normalizeSemanticText(
      textElement.textContent
    ).length;

  const targetOffset =
    offset !== undefined
      ? Math.max(
          0,
          Math.min(
            Number(offset) || 0,
            textLength
          )
        )
      : atEnd
        ? textLength
        : 0;

  const domPoint =
    getDomPointFromTextOffset(
      textElement,
      targetOffset
    );

  if (!domPoint) {
    return false;
  }

  const selection =
    window.getSelection();

  if (!selection) {
    return false;
  }

  try {
    editorElement.focus({
      preventScroll,
    });

    const range =
      document.createRange();

    range.setStart(
      domPoint.node,
      domPoint.offset
    );

    range.collapse(true);

    selection.removeAllRanges();
    selection.addRange(range);

    return true;
  } catch {
    return false;
  }
}

export function placeCaretFromPoint(
  editorElement,
  clientX,
  clientY,
  preferredBlockId = null
) {
  if (!editorElement) {
    return false;
  }

  /**
   * 优先使用点击事件已经确认的模块 ID，
   * 避免跨行 inline 边框导致命中相邻模块。
   */
  let blockElement =
    preferredBlockId !==
      null &&
    preferredBlockId !==
      undefined
      ? getSemanticBlockElement(
          editorElement,
          preferredBlockId
        )
      : null;

  if (!blockElement) {
    const hitElement =
      document.elementFromPoint(
        clientX,
        clientY
      );

    blockElement =
      findSemanticBlockElement(
        hitElement,
        editorElement
      );
  }

  if (!blockElement) {
    return false;
  }

  const blockId =
    getSemanticBlockId(
      blockElement
    );

  const textElement =
    getSemanticTextElement(
      blockElement
    );

  if (
    !blockId ||
    !textElement
  ) {
    return false;
  }

  let node = null;
  let offset = 0;

  if (
    typeof document.caretPositionFromPoint ===
    "function"
  ) {
    const position =
      document.caretPositionFromPoint(
        clientX,
        clientY
      );

    node =
      position?.offsetNode ||
      null;

    offset =
      position?.offset || 0;
  } else if (
    typeof document.caretRangeFromPoint ===
    "function"
  ) {
    const pointRange =
      document.caretRangeFromPoint(
        clientX,
        clientY
      );

    node =
      pointRange?.startContainer ||
      null;

    offset =
      pointRange?.startOffset ||
      0;
  }

  const pointInsideCurrentText =
    node &&
    (
      node === textElement ||
      textElement.contains(node)
    );

  /**
   * 点击标签、边框或 padding 时，
   * 将光标放到当前模块正文末尾。
   */
  if (
    !pointInsideCurrentText
  ) {
    return placeCaretInSemanticBlock(
      editorElement,
      blockId,
      {
        atEnd: true,
        preventScroll: true,
      }
    );
  }

  const selection =
    window.getSelection();

  if (!selection) {
    return false;
  }

  try {
    editorElement.focus({
      preventScroll: true,
    });

    const range =
      document.createRange();

    range.setStart(
      node,
      offset
    );

    range.collapse(true);

    selection.removeAllRanges();
    selection.addRange(range);

    return true;
  } catch {
    return placeCaretInSemanticBlock(
      editorElement,
      blockId,
      {
        atEnd: true,
        preventScroll: true,
      }
    );
  }
}

export function getSelectedSemanticBlockIds(
  editorElement
) {
  const selection =
    window.getSelection();

  if (
    !isSelectionInsideEditor(
      editorElement,
      selection
    )
  ) {
    return [];
  }

  const range =
    selection.getRangeAt(0);

  return getSemanticBlockElements(
    editorElement
  )
    .filter(
      (blockElement) => {
        try {
          return range.intersectsNode(
            blockElement
          );
        } catch {
          return false;
        }
      }
    )
    .map(
      getSemanticBlockId
    )
    .filter(Boolean);
}

export function getCaretSemanticBlockId(
  editorElement
) {
  const selection =
    window.getSelection();

  if (
    !selection ||
    selection.rangeCount === 0
  ) {
    return null;
  }

  const blockElement =
    findSemanticBlockElement(
      selection.focusNode,
      editorElement
    );

  return getSemanticBlockId(
    blockElement
  );
}

export function hasCollapsedCaret(
  editorElement
) {
  const selection =
    window.getSelection();

  return Boolean(
    isSelectionInsideEditor(
      editorElement,
      selection
    ) &&
      selection.isCollapsed
  );
}

export function clearBrowserSelection() {
  window
    .getSelection()
    ?.removeAllRanges();
}