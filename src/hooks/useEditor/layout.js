import {
  BLOCK_HEIGHT,
  BLOCK_WIDTH,
  CONTENT_HEIGHT,
  CONTENT_WIDTH,
  ROW_HEIGHT,
} from "../../constants";

import {
  looksLikeEnglishText,
  splitEnglishLineByWidth,
} from "./englishLayout";

const DEBUG_LAYOUT = false;

const FRAGMENT_HEIGHT = 40;
const FRAGMENT_GAP_X = 8;
const FRAGMENT_MIN_WIDTH = 120;
const FRAGMENT_PADDING_X = 10;
const FRAGMENT_FONT =
  '14px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const SECTION_GAP = 16;

const TEXT_WIDTH_SAFETY = 10;

export function measureTextWidth(text, font = FRAGMENT_FONT) {
  if (typeof document === "undefined") return (text || "").length * 14;

  const canvas =
    measureTextWidth._canvas ||
    (measureTextWidth._canvas = document.createElement("canvas"));
  const context = canvas.getContext("2d");
  context.font = font;
  return context.measureText(text || "").width;
}

export function estimateBlockHeight(text, width = BLOCK_WIDTH) {
  const safeText = text || "";

  if (!safeText.trim()) return BLOCK_HEIGHT;

  const charsPerLine = Math.max(18, Math.floor(width / 16));
  const lines = safeText
    .split("\n")
    .reduce(
      (sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)),
      0
    );

  const lineHeight = 20;
  const verticalPadding = 20;
  const labelOffset = 8;

  return Math.max(
    BLOCK_HEIGHT,
    lines * lineHeight + verticalPadding + labelOffset
  );
}

function getMeasuredFragmentWidth(text) {
  return Math.ceil(
    measureTextWidth(text) + FRAGMENT_PADDING_X * 2 + 2 + TEXT_WIDTH_SAFETY
  );
}

function splitLineByWidth(text, availableWidth) {
  if (!text) return { fitted: "", rest: "" };

  if (looksLikeEnglishText(text)) {
    return splitEnglishLineByWidth(
      text,
      availableWidth,
      getMeasuredFragmentWidth
    );
  }

  let fitted = "";

  for (let i = 0; i < text.length; i += 1) {
    const candidate = text.slice(0, i + 1);
    const width = getMeasuredFragmentWidth(candidate);

    if (width <= availableWidth || fitted.length === 0) {
      fitted = candidate;
    } else {
      break;
    }
  }

  if (!fitted) {
    return {
      fitted: text[0],
      rest: text.slice(1),
    };
  }

  while (
    fitted.length > 1 &&
    /^[，。！？；：、】【）》〉」、,.!?;:)\]}>]/.test(text.slice(fitted.length))
  ) {
    fitted = fitted.slice(0, -1);
  }

  return {
    fitted,
    rest: text.slice(fitted.length),
  };
}

function buildParagraphTailBlockIdSet(blocks) {
  const tailSet = new Set();
  if (!blocks.length) return tailSet;

  // 保守规则：
  // 先只把 section 里最后一个有文字的 block 视为“段的最后一句”
  // 这样不会把倒数第二个 block 误判成段尾
  const lastNonEmptyBlock = [...blocks]
    .reverse()
    .find((block) => (block?.text || "").trim());

  if (lastNonEmptyBlock) {
    tailSet.add(lastNonEmptyBlock.id);
  }

  return tailSet;
}

/**
 * 规则：
 * 1. 如果这个 fragment 在当前这一行结束后，右边没有别的模块接上，就铺满
 * 2. 但如果它属于“段的最后一句”的最后一个 fragment，就不铺满
 * 3. 如果它右边还有别的模块接上，也不铺满
 */
function stretchLastFragmentToRowEnd(fragments, blocks, contentWidth) {
  if (!fragments.length) return fragments;

  const paragraphTailBlockIdSet = buildParagraphTailBlockIdSet(blocks);

  const blockFragmentCountMap = new Map();
  const rowsMap = new Map();

  for (const fragment of fragments) {
    blockFragmentCountMap.set(
      fragment.blockId,
      (blockFragmentCountMap.get(fragment.blockId) || 0) + 1
    );

    if (!rowsMap.has(fragment.y)) {
      rowsMap.set(fragment.y, []);
    }
    rowsMap.get(fragment.y).push(fragment);
  }

  for (const rowFragments of rowsMap.values()) {
    rowFragments.sort((a, b) => a.x - b.x);
  }

  for (const fragment of fragments) {
    const fragmentCountOfThisBlock =
      blockFragmentCountMap.get(fragment.blockId) || 1;

    const parts = String(fragment.id).split("-");
    const partIndex = Number(parts[parts.length - 1]);
    const isLastFragmentOfBlock = partIndex === fragmentCountOfThisBlock - 1;
    const isParagraphTailBlock = paragraphTailBlockIdSet.has(fragment.blockId);

    const rowFragments = rowsMap.get(fragment.y) || [];
    const fragmentIndexInRow = rowFragments.findIndex((f) => f.id === fragment.id);
    const hasNextFragmentInSameRow =
      fragmentIndexInRow !== -1 && fragmentIndexInRow < rowFragments.length - 1;

    // 当前行右边还有别的模块接上：不铺满
    if (hasNextFragmentInSameRow) {
      continue;
    }

    // “段的最后一句”的最后一个 fragment：不铺满
    if (isParagraphTailBlock && isLastFragmentOfBlock) {
      continue;
    }

    // 其他情况：铺满到行尾
    fragment.width = Math.max(
      FRAGMENT_MIN_WIDTH,
      contentWidth - fragment.x
    );
  }

  return fragments;
}

export function layoutInlineFragments(blocks, contentWidth) {
  const orderedBlocks = [...blocks];
  const fragments = [];
  let cursorX = 0;
  let cursorY = 0;

  for (const block of orderedBlocks) {
    const rawText = (block.text || "").replace(/\n+/g, " ").trim();

    if (!rawText) {
      fragments.push({
        id: `${block.id}-0`,
        blockId: block.id,
        type: block.type,
        text: "",
        x: cursorX,
        y: cursorY,
        width: FRAGMENT_MIN_WIDTH,
        height: FRAGMENT_HEIGHT,
        color: block.color,
        fill: block.fill,
        showLabel: true,
      });

      cursorX += FRAGMENT_MIN_WIDTH + FRAGMENT_GAP_X;

      if (cursorX >= contentWidth - FRAGMENT_MIN_WIDTH) {
        cursorX = 0;
        cursorY += ROW_HEIGHT;
      }

      continue;
    }

    let remaining = rawText;
    let partIndex = 0;
    let isFirstFragment = true;

    while (remaining.length > 0) {
      let availableWidth = contentWidth - cursorX;

      if (availableWidth < FRAGMENT_MIN_WIDTH) {
        cursorX = 0;
        cursorY += ROW_HEIGHT;
        availableWidth = contentWidth;
      }

   const { fitted, rest } = splitLineByWidth(remaining, availableWidth);
const nextRest = rest;
const hasMore = nextRest.length > 0;

let fragmentWidth;
const isEnglish = looksLikeEnglishText(block.text);

if (hasMore) {
  // 只要后面还有内容，这一行仍然占满当前剩余宽度
  fragmentWidth = availableWidth;
} else {
  // 只有最后一个 fragment 才按内容宽度决定
  fragmentWidth = Math.min(
    availableWidth,
    isEnglish
      ? getMeasuredFragmentWidth(fitted)
      : Math.max(FRAGMENT_MIN_WIDTH, getMeasuredFragmentWidth(fitted))
  );
}

      fragments.push({
        id: `${block.id}-${partIndex}`,
        blockId: block.id,
        type: block.type,
        text: fitted,
        x: cursorX,
        y: cursorY,
        width: fragmentWidth,
        height: FRAGMENT_HEIGHT,
        color: block.color,
        fill: block.fill,
        showLabel: isFirstFragment,
      });

     remaining = nextRest;
      partIndex += 1;
      isFirstFragment = false;

      if (hasMore) {
        cursorX = 0;
        cursorY += ROW_HEIGHT;
      } else {
        cursorX += fragmentWidth + FRAGMENT_GAP_X;

        if (cursorX >= contentWidth - FRAGMENT_MIN_WIDTH) {
          cursorX = 0;
          cursorY += ROW_HEIGHT;
        }
      }
    }
  }

const result = fragments;

  if (DEBUG_LAYOUT) {
    console.log(
      "[layoutInlineFragments]",
      result.map((f) => ({
        id: f.id,
        blockId: f.blockId,
        type: f.type,
        text: f.text,
        x: f.x,
        y: f.y,
        width: f.width,
      }))
    );
  }

  return result;
}

export function groupFragmentsByRow(fragments) {
  const rows = [];
  const tolerance = 6;

  for (const fragment of fragments) {
    const existingRow = rows.find(
      (row) => Math.abs(row.y - fragment.y) <= tolerance
    );

    if (existingRow) {
      existingRow.fragments.push(fragment);
    } else {
      rows.push({
        y: fragment.y,
        fragments: [fragment],
      });
    }
  }

  rows.forEach((row) => {
    row.fragments.sort((a, b) => a.x - b.x);
  });

  rows.sort((a, b) => a.y - b.y);

  return rows;
}

export function getInsertIndexFromPointer(
  blocks,
  fragments,
  pointerX,
  pointerY,
  draggingBlockId = null
) {
  if (blocks.length === 0) return 0;

  const filteredFragments =
    draggingBlockId == null
      ? fragments
      : fragments.filter((fragment) => fragment.blockId !== draggingBlockId);

  if (filteredFragments.length === 0) return 0;

  const rows = groupFragmentsByRow(filteredFragments);

  for (const fragment of filteredFragments) {
    const withinX =
      pointerX >= fragment.x && pointerX <= fragment.x + fragment.width;
    const withinY =
      pointerY >= fragment.y && pointerY <= fragment.y + fragment.height;

    if (withinX && withinY) {
      const blockIndex = blocks.findIndex((b) => b.id === fragment.blockId);
      const midpointX = fragment.x + fragment.width / 2;
      return pointerX < midpointX ? blockIndex : blockIndex + 1;
    }
  }

  let targetRow = null;
  let minRowDistance = Infinity;

  for (const row of rows) {
    const rowTop = row.y;
    const rowBottom = row.y + FRAGMENT_HEIGHT;

    let distance = 0;
    if (pointerY < rowTop) distance = rowTop - pointerY;
    else if (pointerY > rowBottom) distance = pointerY - rowBottom;

    if (distance < minRowDistance) {
      minRowDistance = distance;
      targetRow = row;
    }
  }

  if (!targetRow) return blocks.length;

  const rowFragments = targetRow.fragments;

  if (pointerX <= rowFragments[0].x) {
    return blocks.findIndex((b) => b.id === rowFragments[0].blockId);
  }

  for (let i = 0; i < rowFragments.length - 1; i += 1) {
    const leftFrag = rowFragments[i];
    const rightFrag = rowFragments[i + 1];

    const gapStart = leftFrag.x + leftFrag.width;
    const gapEnd = rightFrag.x;

    if (pointerX >= gapStart && pointerX <= gapEnd) {
      const leftIndex = blocks.findIndex((b) => b.id === leftFrag.blockId);
      const rightIndex = blocks.findIndex((b) => b.id === rightFrag.blockId);
      const gapMid = (gapStart + gapEnd) / 2;
      return pointerX < gapMid ? leftIndex + 1 : rightIndex;
    }
  }

  

  const lastFrag = rowFragments[rowFragments.length - 1];
  const lastIndex = blocks.findIndex((b) => b.id === lastFrag.blockId);

  if (pointerX >= lastFrag.x + lastFrag.width) {
    return lastIndex + 1;
  }

  let nearestFragment = rowFragments[0];
  let minDistance = Infinity;

  for (const fragment of rowFragments) {
    const centerX = fragment.x + fragment.width / 2;
    const dist = Math.abs(pointerX - centerX);
    if (dist < minDistance) {
      minDistance = dist;
      nearestFragment = fragment;
    }
  }

  const nearestIndex = blocks.findIndex((b) => b.id === nearestFragment.blockId);
  const nearestMidX = nearestFragment.x + nearestFragment.width / 2;

  return pointerX < nearestMidX ? nearestIndex : nearestIndex + 1;
}

export function makeCompletedText(blocks) {
  return blocks
    .map((block) => (block.text || "").trim())
    .filter(Boolean)
    .join(" ");
}

export function estimateCompletedHeight(text) {
  const safeText = (text || "").trim();

  if (!safeText) return 56;

  // CompletedSection 里的实际文字样式
  const font =
    '14px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  // CompletedSection 左右几乎没有 padding，但留一点安全距离
  const availableWidth = CONTENT_WIDTH - 8;

  const paragraphs = safeText.split("\n");
  let visualLines = 0;

  for (const paragraph of paragraphs) {
    const lineText = paragraph.trim();

    if (!lineText) {
      visualLines += 1;
      continue;
    }

    // 英文：按单词宽度断行
    if (looksLikeEnglishText(lineText)) {
      let remaining = lineText;

      while (remaining.length > 0) {
        const { fitted, rest } = splitEnglishLineByWidth(
          remaining,
          availableWidth,
          (value) => measureTextWidth(value, font)
        );

        if (!fitted) {
          visualLines += 1;
          break;
        }

        visualLines += 1;
        remaining = rest.trimStart();
      }
    } else {
      // 中文 / 混合文本：按字符逐步试宽
      let remaining = lineText;

      while (remaining.length > 0) {
        let fitted = "";

        for (let i = 0; i < remaining.length; i += 1) {
          const candidate = remaining.slice(0, i + 1);
          const width = measureTextWidth(candidate, font);

          if (width <= availableWidth || fitted.length === 0) {
            fitted = candidate;
          } else {
            break;
          }
        }

        if (!fitted) {
          visualLines += 1;
          break;
        }

        visualLines += 1;
        remaining = remaining.slice(fitted.length);
      }
    }
  }

  const lineHeight = 28;
  const verticalPadding = 12;

  return Math.max(56, visualLines * lineHeight + verticalPadding);
}
export function buildSectionLayouts(sections) {
  const layouts = [];
  const globalFragments = [];

  let top = 0;

  sections.forEach((section, index) => {
    const isLast = index === sections.length - 1;

if (section.mode === "completed") {
  const text = section.completedText ?? makeCompletedText(section.blocks);
  const height = estimateCompletedHeight(text);

  layouts.push({
    id: section.id,
    mode: "completed",
    top,
    height,
    text,
    blocks: section.blocks,
    completedText: section.completedText,
  });

  top += height + SECTION_GAP;
  return;
}

    const inlineBlocks = section.blocks.filter(
  (block) => block.placement !== "floating"
);

const localFragments = layoutInlineFragments(inlineBlocks, CONTENT_WIDTH);

    const usedHeight = localFragments.length
      ? Math.max(...localFragments.map((fragment) => fragment.y)) + ROW_HEIGHT
      : ROW_HEIGHT;

    const height = isLast
      ? Math.max(usedHeight, Math.max(ROW_HEIGHT, CONTENT_HEIGHT - top))
      : usedHeight;

    const rowTops = [];
    let rowY = 0;
    while (rowY + BLOCK_HEIGHT <= height) {
      rowTops.push(rowY);
      rowY += ROW_HEIGHT;
    }

    const layout = {
      id: section.id,
      mode: "editing",
      top,
      height,
      rowTops,
      localFragments,
      blocks: section.blocks,
      isTrailing: isLast,
    };

    layouts.push(layout);

    localFragments.forEach((fragment) => {
      globalFragments.push({
        ...fragment,
        sectionId: section.id,
        y: top + fragment.y,
      });
    });

    top += height + SECTION_GAP;
  });

  const totalContentHeight =
    layouts.length > 0
      ? Math.max(CONTENT_HEIGHT, top - SECTION_GAP)
      : CONTENT_HEIGHT;

  return {
    sectionLayouts: layouts,
    globalFragments,
    totalContentHeight,
  };
}
