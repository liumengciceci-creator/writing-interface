import {
  EMPTY_TEXT,
  isNodeInside,
} from "./semanticEditorUtils";

/**
 * 先让模块获得焦点，再调用这个函数。
 *
 * 如果传入鼠标坐标，就尽量把光标放在鼠标点击的位置。
 * 如果无法获取有效位置，就把光标放到模块文字末尾。
 */
export function placeCaret(
  blockElement,
  clientX = null,
  clientY = null
) {
  if (!blockElement) {
    return;
  }

  const selection =
    window.getSelection();

  if (!selection) {
    return;
  }

  let range = null;

  if (
    Number.isFinite(clientX) &&
    Number.isFinite(clientY)
  ) {
    if (
      document.caretPositionFromPoint
    ) {
      const position =
        document.caretPositionFromPoint(
          clientX,
          clientY
        );

      if (
        position &&
        isNodeInside(
          position.offsetNode,
          blockElement
        )
      ) {
        range =
          document.createRange();

        range.setStart(
          position.offsetNode,
          position.offset
        );

        range.collapse(true);
      }
    } else if (
      document.caretRangeFromPoint
    ) {
      const pointRange =
        document.caretRangeFromPoint(
          clientX,
          clientY
        );

      if (
        pointRange &&
        isNodeInside(
          pointRange.startContainer,
          blockElement
        )
      ) {
        range =
          pointRange.cloneRange();

        range.collapse(true);
      }
    }
  }

  /**
   * 浏览器没有返回有效位置时，
   * 把光标放到模块文字末尾。
   */
  if (!range) {
    range =
      document.createRange();

    range.selectNodeContents(
      blockElement
    );

    range.collapse(false);
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * 向当前 contentEditable 模块插入纯文本。
 *
 * 返回 true 表示插入成功。
 */
export function insertPlainText(
  blockElement,
  text
) {
  if (!blockElement) {
    return false;
  }

  const selection =
    window.getSelection();

  if (!selection) {
    return false;
  }

  let range = null;

  if (
    selection.rangeCount > 0
  ) {
    const currentRange =
      selection.getRangeAt(0);

    const startInside =
      isNodeInside(
        currentRange.startContainer,
        blockElement
      );

    const endInside =
      isNodeInside(
        currentRange.endContainer,
        blockElement
      );

    if (
      startInside &&
      endInside
    ) {
      range =
        currentRange.cloneRange();
    }
  }

  /**
   * 当前 selection 不在模块内部时，
   * 默认插入到模块末尾。
   */
  if (!range) {
    range =
      document.createRange();

    range.selectNodeContents(
      blockElement
    );

    range.collapse(false);
  }

  range.deleteContents();

  /**
   * 清除空模块使用的零宽字符。
   */
  if (
    blockElement.textContent ===
    EMPTY_TEXT
  ) {
    blockElement.textContent =
      "";

    range.selectNodeContents(
      blockElement
    );

    range.collapse(false);
  }

  const textNode =
    document.createTextNode(text);

  range.insertNode(textNode);

  /**
   * 插入完成后，把光标移动到新文字后面。
   */
  const nextRange =
    document.createRange();

  nextRange.setStartAfter(
    textNode
  );

  nextRange.collapse(true);

  selection.removeAllRanges();
  selection.addRange(nextRange);

  /**
   * 合并相邻文本节点，
   * 避免连续输入后产生大量零碎文本节点。
   */
  blockElement.normalize();

  return true;
}