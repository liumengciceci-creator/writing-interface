export function getEditableNodes(container) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll("[data-editable-fragment='true']")
  ).sort(
    (a, b) =>
      Number(a.getAttribute("data-fragment-index")) -
      Number(b.getAttribute("data-fragment-index"))
  );
}

export function normalizeEditableText(text) {
  return (text || "")
    .replace(/\u200B/g, "")
    .replace(/\u00A0/g, " ");
}

export function toEditableDisplayText(text) {
  return text || "";
}

export function getJoinedEditableText(container) {
  const nodes = getEditableNodes(container);
  return nodes
    .map((node) => normalizeEditableText(node.textContent || ""))
    .join("");
}

export function getCaretOffsetWithin(container) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !container) return null;

  const range = selection.getRangeAt(0);
  if (!container.contains(range.endContainer)) return null;

  const editableNodes = getEditableNodes(container);
  if (!editableNodes.length) return null;

  let totalOffset = 0;

  for (const node of editableNodes) {
    if (node.contains(range.endContainer)) {
      const preRange = range.cloneRange();
      preRange.selectNodeContents(node);
      preRange.setEnd(range.endContainer, range.endOffset);
      return totalOffset + normalizeEditableText(preRange.toString()).length;
    }

    totalOffset += normalizeEditableText(node.textContent || "").length;
  }

  return totalOffset;
}

export function setCaretOffsetWithin(container, targetOffset) {
  if (!container) return;

  const selection = window.getSelection();
  if (!selection) return;

  const editableNodes = getEditableNodes(container);
  if (!editableNodes.length) return;

  let currentOffset = 0;

  for (const editableNode of editableNodes) {
    const walker = document.createTreeWalker(
      editableNode,
      NodeFilter.SHOW_TEXT,
      null
    );

    let textNode = walker.nextNode();

    while (textNode) {
      const rawText = textNode.textContent ?? "";
      const normalizedText = normalizeEditableText(rawText);
      const textLength = normalizedText.length;
      const nextOffset = currentOffset + textLength;

      if (targetOffset <= nextOffset) {
        const localOffset = Math.max(0, targetOffset - currentOffset);

        const range = document.createRange();
        range.setStart(textNode, Math.min(localOffset, rawText.length));
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }

      currentOffset = nextOffset;
      textNode = walker.nextNode();
    }
  }

  const lastNode = editableNodes[editableNodes.length - 1];
  if (lastNode) {
    lastNode.focus();
    const range = document.createRange();
    range.selectNodeContents(lastNode);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}