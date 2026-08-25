
import {
  BLOCK_SELECTOR,
  normalizeId,
} from "./semanticEditorUtils.js";

/**
 * 获取编辑器中的所有语义模块元素。
 *
 * excludedBlockId 用于拖动已有模块时，
 * 排除当前正在被拖动的模块。
 */
function getSemanticBlockElements(
  editor,
  excludedBlockId = null
) {
  if (!editor) {
    return [];
  }

  const normalizedExcludedIds =
    new Set(
      (
        Array.isArray(
          excludedBlockId
        )
          ? excludedBlockId
          : [excludedBlockId]
      )
        .map(normalizeId)
        .filter(Boolean)
    );

  return Array.from(
    editor.querySelectorAll(
      BLOCK_SELECTOR
    )
  ).filter((element) => {
    const blockId =
      normalizeId(
        element.dataset
          .semanticBlockId
      );

    if (
      normalizedExcludedIds.has(
        blockId
      )
    ) {
      return false;
    }

    return true;
  });
}

/**
 * 将一个模块可能跨行产生的多个 DOMRect，
 * 整理成可以用于拖拽判断的位置数据。
 */
function getVisualFragments(
  editor,
  excludedBlockId = null
) {
  const elements =
    getSemanticBlockElements(
      editor,
      excludedBlockId
    );

  const fragments = [];

  elements.forEach(
    (element, blockIndex) => {
      const rects =
        Array.from(
          element.getClientRects()
        ).filter(
          (rect) =>
            rect.width > 0 &&
            rect.height > 0
        );

      /**
       * 某些情况下 getClientRects 没有结果，
       * 使用 getBoundingClientRect 作为兜底。
       */
      if (rects.length === 0) {
        const fallbackRect =
          element.getBoundingClientRect();

        if (
          fallbackRect.width > 0 ||
          fallbackRect.height > 0
        ) {
          rects.push(
            fallbackRect
          );
        }
      }

      rects.forEach(
        (rect, fragmentIndex) => {
          fragments.push({
            element,
            blockIndex,
            fragmentIndex,
            rect,
          });
        }
      );
    }
  );

  return {
    elements,
    fragments,
  };
}

/**
 * 按视觉上的行对模块片段进行分组。
 */
function groupFragmentsByLine(
  fragments
) {
  const sorted = [
    ...fragments,
  ].sort((a, b) => {
    const verticalDifference =
      a.rect.top - b.rect.top;

    if (
      Math.abs(
        verticalDifference
      ) > 4
    ) {
      return verticalDifference;
    }

    return (
      a.rect.left -
      b.rect.left
    );
  });

  const lines = [];

  sorted.forEach((fragment) => {
    const centerY =
      fragment.rect.top +
      fragment.rect.height / 2;

    let matchedLine = null;

    for (const line of lines) {
      const verticalTolerance =
        Math.max(
          6,
          Math.min(
            line.height,
            fragment.rect.height
          ) * 0.5
        );

      if (
        Math.abs(
          centerY -
          line.centerY
        ) <= verticalTolerance
      ) {
        matchedLine = line;
        break;
      }
    }

    if (!matchedLine) {
      matchedLine = {
        fragments: [],
        top:
          fragment.rect.top,
        bottom:
          fragment.rect.bottom,
        centerY,
        height:
          fragment.rect.height,
      };

      lines.push(
        matchedLine
      );
    }

    matchedLine.fragments.push(
      fragment
    );

    matchedLine.top =
      Math.min(
        matchedLine.top,
        fragment.rect.top
      );

    matchedLine.bottom =
      Math.max(
        matchedLine.bottom,
        fragment.rect.bottom
      );

    matchedLine.height =
      matchedLine.bottom -
      matchedLine.top;

    matchedLine.centerY =
      matchedLine.top +
      matchedLine.height / 2;
  });

  lines.forEach((line) => {
    line.fragments.sort(
      (a, b) =>
        a.rect.left -
        b.rect.left
    );
  });

  lines.sort(
    (a, b) =>
      a.top - b.top
  );

  return lines;
}

/**
 * 找出鼠标当前位置最接近的视觉行。
 */
function findClosestLine(
  lines,
  clientY
) {
  if (lines.length === 0) {
    return null;
  }

  let closestLine =
    lines[0];

  let closestDistance =
    Infinity;

  lines.forEach((line) => {
    let distance = 0;

    if (
      clientY < line.top
    ) {
      distance =
        line.top - clientY;
    } else if (
      clientY > line.bottom
    ) {
      distance =
        clientY -
        line.bottom;
    }

    if (
      distance <
      closestDistance
    ) {
      closestDistance =
        distance;

      closestLine = line;
    }
  });

  return closestLine;
}

function getPointToRectDistance(
  clientX,
  clientY,
  rect
) {
  if (!rect) return Infinity;

  const horizontalDistance =
    clientX < rect.left
      ? rect.left - clientX
      : clientX > rect.right
        ? clientX - rect.right
        : 0;

  const verticalDistance =
    clientY < rect.top
      ? rect.top - clientY
      : clientY > rect.bottom
        ? clientY - rect.bottom
        : 0;

  return Math.hypot(
    horizontalDistance,
    verticalDistance
  );
}

/**
 * 同一个文档索引既可能表示“上一段末尾”，也可能表示“下一段段首”。
 * 不能只凭插入索引决定段落归属；需要比较鼠标更靠近哪一个视觉锚点。
 */
export function shouldAttachDropToPreviousParagraph(
  clientX,
  clientY,
  previousEndRect,
  nextParagraphHeadRect
) {
  if (
    !previousEndRect ||
    !nextParagraphHeadRect
  ) {
    return false;
  }

  const previousHeight =
    Math.max(
      1,
      Number(previousEndRect.height) ||
        previousEndRect.bottom -
          previousEndRect.top
    );

  const withinPreviousLineBand =
    clientY >=
      previousEndRect.top - 4 &&
    clientY <=
      previousEndRect.bottom +
        Math.max(8, previousHeight * 0.45);

  const pointsTowardPreviousLineEnd =
    clientX >=
      previousEndRect.left +
        Math.max(
          8,
          (previousEndRect.right -
            previousEndRect.left) *
            0.45
        );

  if (
    withinPreviousLineBand &&
    pointsTowardPreviousLineEnd
  ) {
    return true;
  }

  return (
    getPointToRectDistance(
      clientX,
      clientY,
      previousEndRect
    ) <
    getPointToRectDistance(
      clientX,
      clientY,
      nextParagraphHeadRect
    )
  );
}

/**
 * 根据鼠标位置计算模块插入索引。
 *
 * 返回值范围：
 * 0 到剩余模块数量之间。
 */
export function getDropIndex(
  editor,
  clientX,
  clientY,
  excludedBlockId = null,
  startsNewLine = false
) {
  if (!editor) {
    return 0;
  }

  const {
    elements,
    fragments,
  } = getVisualFragments(
    editor,
    excludedBlockId
  );

  if (
    elements.length === 0
  ) {
    return 0;
  }

  const lines =
    groupFragmentsByLine(
      fragments
    );

  if (
    lines.length === 0
  ) {
    return elements.length;
  }

  const firstLine =
    lines[0];

  const lastLine =
    lines[
      lines.length - 1
    ];

  /** 鼠标在首行上方时，可以表示从文档第一行开始。 */
  if (
    clientY <
    firstLine.top
  ) {
    return 0;
  }

  /**
   * 鼠标在所有内容下方。
   */
  if (
    clientY >
    lastLine.bottom
  ) {
    return elements.length;
  }

  const closestLine =
    findClosestLine(
      lines,
      clientY
    );

  if (
    !closestLine ||
    closestLine.fragments
      .length === 0
  ) {
    return elements.length;
  }

  const lineFragments =
    closestLine.fragments;

  /**
   * 换行提示只有两种含义：位于当前行上半部时插到该行之前；
   * 位于当前行下方时插到该行之后。蓝线可以显示在新行开头，
   * 但不会进入任何模块内部。
   */
  if (startsNewLine) {
    if (
      clientY <=
      closestLine.centerY
    ) {
      return lineFragments[0]
        .blockIndex;
    }

    const finalFragment =
      lineFragments[
        lineFragments.length - 1
      ];

    return Math.min(
      elements.length,
      finalFragment.blockIndex + 1
    );
  }

  /**
   * 左半边表示插到当前模块之前，右半边表示插到之后。
   * 这使已有首模块之前仍然存在可达的索引 0。
   */
  for (
    let index = 0;
    index <
    lineFragments.length;
    index += 1
  ) {
    const fragment =
      lineFragments[index];

    const midpoint =
      fragment.rect.left +
      fragment.rect.width / 2;

    if (
      clientX < midpoint
    ) {
      return Math.max(
        0,
        fragment.blockIndex
      );
    }
  }

  const lastFragment =
    lineFragments[
      lineFragments.length - 1
    ];

  return Math.min(
    elements.length,
    lastFragment.blockIndex + 1
  );
}

/**
 * 判断当前位置是否应该让新模块另起一行。
 *
 * 主要用于从工具栏拖入一个新模块时，
 * 决定是否设置 forceNewLine。
 */
export function shouldStartNewLine(
  editor,
  clientX,
  clientY,
  excludedBlockId = null
) {
  if (!editor) {
    return false;
  }

  const {
    fragments,
  } = getVisualFragments(
    editor,
    excludedBlockId
  );

  if (
    fragments.length === 0
  ) {
    return false;
  }

  const lines =
    groupFragmentsByLine(
      fragments
    );

  if (
    lines.length === 0
  ) {
    return false;
  }

  const closestLine =
    findClosestLine(
      lines,
      clientY
    );

  if (
    !closestLine ||
    closestLine.fragments
      .length === 0
  ) {
    return false;
  }

  const firstFragment =
    closestLine.fragments[0];

  const lastFragment =
    closestLine.fragments[
      closestLine.fragments
        .length - 1
    ];

  const lineLeft =
    firstFragment.rect.left;

  const lineRight =
    lastFragment.rect.right;

  const averageHeight =
    closestLine.fragments.reduce(
      (total, fragment) =>
        total +
        fragment.rect.height,
      0
    ) /
    closestLine.fragments.length;

  const verticalThreshold =
    Math.max(
      8,
      averageHeight * 0.45
    );

  /**
   * 鼠标明显位于当前行下方时，
   * 认为用户希望另起一行。
   */
  const belowCurrentLine =
    clientY >
    closestLine.bottom +
      verticalThreshold;

  if (belowCurrentLine) {
    return true;
  }

  /**
   * 鼠标靠近一行最左侧，
   * 且纵向位置接近行首时，
   * 也可以理解为另起一行。
   */
  const nearLineStart =
    clientX <
    lineLeft +
      Math.max(
        18,
        averageHeight
      );

  const nearTopHalf =
    clientY <=
    closestLine.centerY;

  if (
    nearLineStart &&
    nearTopHalf
  ) {
    return true;
  }

  /**
   * 鼠标在行尾很远的位置时，
   * 通常仍然表示接在当前行后，
   * 不强制换行。
   */
  if (
    clientX >
    lineRight
  ) {
    return false;
  }

  return false;
}

/**
 * 同一个段落边界会提供两个视觉落点：
 * 1. 靠近段首模块：把新模块插到它前面，并让新模块成为这一段的新段首；
 * 2. 位于段间空隙、离模块更远：把新模块接到上一段末尾，保留旧段首。
 *
 * 普通位置仍沿用 startsNewLine；只有正好插在现有段首前时才区分上述语义。
 */
export function resolveDropForceLineBreak(
  startsNewLine,
  insertsBeforeParagraphHead
) {
  if (insertsBeforeParagraphHead) {
    return !Boolean(startsNewLine);
  }

  return Boolean(startsNewLine);
}
