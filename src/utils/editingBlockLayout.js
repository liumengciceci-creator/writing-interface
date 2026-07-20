import { CONTENT_WIDTH } from "../constants";
import { layoutInlineFragments } from "../hooks/useEditor/layout";

const DEBUG_ADAPTIVE_LAYOUT = true;

const EDITOR_FONT =
  '14px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const EDITOR_PADDING_X = 28;
const EDITOR_LINE_HEIGHT = 20;
const EDITOR_MIN_HEIGHT = 40;

const EDITOR_GAP_BOTTOM = 16;
const DEFAULT_ROW_STEP = 58;

function debugLog(...args) {
  if (!DEBUG_ADAPTIVE_LAYOUT) return;
  console.log("[buildAdaptiveEditingPreview]", ...args);
}

function measureTextWidth(text, font = EDITOR_FONT) {
  if (typeof document === "undefined") {
    return (text || "").length * 14;
  }

  const canvas =
    measureTextWidth._canvas ||
    (measureTextWidth._canvas = document.createElement("canvas"));
  const context = canvas.getContext("2d");
  context.font = font;
  return context.measureText(text || "").width;
}

function ensureSafeSection(section) {
  return {
    ...section,
    blocks: section.blocks || [],
    localFragments: section.localFragments || [],
    rowTops: section.rowTops || [0],
    height: section.height || 40,
    top: section.top || 0,
  };
}

function estimateWrappedHeight(text, width) {
  const TEXT_WIDTH_FUDGE = 12;
const maxTextWidth = Math.max(40, width - EDITOR_PADDING_X - TEXT_WIDTH_FUDGE);
  const rawLines = String(text || "").split("\n");

  let visualLineCount = 0;

  for (const rawLine of rawLines) {
    const line = rawLine || "";

    if (!line) {
      visualLineCount += 1;
      continue;
    }

    let current = "";

    for (const ch of line) {
      const next = current + ch;
      if (measureTextWidth(next) <= maxTextWidth) {
        current = next;
      } else {
        visualLineCount += 1;
        current = ch;
      }
    }

    if (current.length > 0) {
      visualLineCount += 1;
    }
  }

  return Math.max(
    EDITOR_MIN_HEIGHT,
    visualLineCount * EDITOR_LINE_HEIGHT + 16
  );
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function detectRowStep(rowTops) {
  const tops = uniqueSorted((rowTops || []).filter((v) => Number.isFinite(v)));
  if (tops.length < 2) return DEFAULT_ROW_STEP;

  const diffs = [];
  for (let i = 1; i < tops.length; i += 1) {
    const diff = tops[i] - tops[i - 1];
    if (diff > 0) diffs.push(diff);
  }

  if (!diffs.length) return DEFAULT_ROW_STEP;
  return Math.min(...diffs);
}

function snapDownToRow(value, rowStep) {
  return Math.ceil(value / rowStep) * rowStep;
}

function buildBlockBoundsMap(fragments) {
  const map = new Map();

  for (const fragment of fragments || []) {
    const left = fragment.x || 0;
    const top = fragment.y || 0;
    const right = left + (fragment.width || 0);
    const bottom = top + (fragment.height || 40);

    const existing = map.get(fragment.blockId);
    if (!existing) {
      map.set(fragment.blockId, {
        left,
        top,
        right,
        bottom,
      });
    } else {
      existing.left = Math.min(existing.left, left);
      existing.top = Math.min(existing.top, top);
      existing.right = Math.max(existing.right, right);
      existing.bottom = Math.max(existing.bottom, bottom);
    }
  }

  return map;
}

function offsetFragmentsBySectionTop(fragments, sectionTop) {
  return (fragments || []).map((fragment) => ({
    ...fragment,
    y: (fragment.y || 0) + sectionTop,
  }));
}

export function buildAdaptiveEditingPreview({
  sectionLayouts,
  editingBlockId,
  editingDraft,
  lockedMoveDown = false,
}) {
  const safeSections = (sectionLayouts || []).map(ensureSafeSection);

  if (!editingBlockId) {
    debugLog("no editingBlockId");
    return {
      displaySectionLayouts: safeSections,
      editingSectionId: null,
      editingOverlayBlock: null,
    };
  }

  const editingSectionIndex = safeSections.findIndex(
    (section) =>
      section.mode === "editing" &&
      (section.blocks || []).some((block) => block.id === editingBlockId)
  );

  if (editingSectionIndex === -1) {
    debugLog("editing section not found", { editingBlockId });
    return {
      displaySectionLayouts: safeSections,
      editingSectionId: null,
      editingOverlayBlock: null,
    };
  }

  const gaps = [];
  for (let i = 0; i < safeSections.length - 1; i += 1) {
    const current = safeSections[i];
    const next = safeSections[i + 1];
    gaps.push((next.top || 0) - ((current.top || 0) + (current.height || 40)));
  }

  const editingSection = safeSections[editingSectionIndex];
  const blocks = editingSection.blocks || [];
  const allFragments = editingSection.localFragments || [];
  const rowStep = detectRowStep(editingSection.rowTops);

  const targetIndex = blocks.findIndex((block) => block.id === editingBlockId);

  if (targetIndex === -1) {
    debugLog("targetIndex not found", { editingBlockId });
    return {
      displaySectionLayouts: safeSections,
      editingSectionId: null,
      editingOverlayBlock: null,
    };
  }

  const targetFragments = allFragments
    .filter((fragment) => fragment.blockId === editingBlockId)
    .sort((a, b) => {
      if ((a.y || 0) !== (b.y || 0)) return (a.y || 0) - (b.y || 0);
      return (a.x || 0) - (b.x || 0);
    });

  if (!targetFragments.length) {
    debugLog("no targetFragments", { editingBlockId });
    return {
      displaySectionLayouts: safeSections,
      editingSectionId: editingSection.id,
      editingOverlayBlock: null,
    };
  }

  const boundsMap = buildBlockBoundsMap(allFragments);
  const targetBounds = boundsMap.get(editingBlockId);

  if (!targetBounds) {
    debugLog("no targetBounds", { editingBlockId });
    return {
      displaySectionLayouts: safeSections,
      editingSectionId: editingSection.id,
      editingOverlayBlock: null,
    };
  }

  const targetTop = targetBounds.top;
  const beforeBlocks = blocks.slice(0, targetIndex);
  const afterBlocks = blocks.slice(targetIndex + 1);

  const isFullRowEditing = editingSection.blocks.length === 1;

const overlayWidth = isFullRowEditing
  ? CONTENT_WIDTH
  : Math.max(120, targetBounds.right - targetBounds.left);

const overlayHeight = estimateWrappedHeight(editingDraft, overlayWidth);


// 第一行永远不下移
const isFirstRow = targetTop <= 0;
const isFirstBlockInSection = targetIndex === 0;

// 第一段的第一行
const isFirstParagraphFirstRow =
  editingSectionIndex === 0 && isFirstRow && isFirstBlockInSection;

// 只有不是第一段第一行时，才去判断展开后会不会遮挡
let willOverlapWhenExpanded = false;

if (!isFirstParagraphFirstRow) {
  const expandedLeft = isFullRowEditing ? 0 : targetBounds.left;
const expandedRight = isFullRowEditing
  ? CONTENT_WIDTH
  : targetBounds.left + overlayWidth;
const expandedTop = targetTop;
const expandedBottom = targetTop + overlayHeight;

  for (const [blockId, bounds] of boundsMap.entries()) {
    if (blockId === editingBlockId) continue;

    const overlapsHorizontally =
      !(expandedRight <= bounds.left || expandedLeft >= bounds.right);

    const overlapsVertically =
      !(expandedBottom <= bounds.top || expandedTop >= bounds.bottom);

    if (overlapsHorizontally && overlapsVertically) {
      willOverlapWhenExpanded = true;
      break;
    }
  }
}

const needMoveDown = isFirstParagraphFirstRow
  ? false
  : willOverlapWhenExpanded;

 

  const overlayLocalY = needMoveDown
    ? snapDownToRow(targetTop + rowStep, rowStep)
    : targetTop;

  const overlayBottom = overlayLocalY + overlayHeight;

  debugLog("layout inputs", {
    editingBlockId,
    lockedMoveDown,
    needMoveDown,
    rowStep,
    targetTop,
    overlayLocalY,
    overlayWidth,
    overlayHeight,
    targetBounds,
    targetFragments: targetFragments.map((f) => ({
      id: f.id,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      text: f.text,
    })),
  });

  const beforeBlockIds = new Set(beforeBlocks.map((b) => b.id));
  const keptBeforeFragments = allFragments.filter(
    (fragment) =>
      fragment.blockId !== editingBlockId && beforeBlockIds.has(fragment.blockId)
  );

  const reflowStartY = snapDownToRow(
    overlayBottom + EDITOR_GAP_BOTTOM,
    rowStep
  );

  const relaidAfterLocal = afterBlocks.length
    ? layoutInlineFragments(afterBlocks, CONTENT_WIDTH).map((fragment) => ({
        ...fragment,
        y: (fragment.y || 0) + reflowStartY,
      }))
    : [];

  const finalFragments = [...keptBeforeFragments, ...relaidAfterLocal];

  const overlayRowCount = Math.max(1, Math.ceil(overlayHeight / rowStep));
  const overlayRowTops = [];
  for (let i = 0; i < overlayRowCount; i += 1) {
    overlayRowTops.push(overlayLocalY + i * rowStep);
  }

  const rowTops = uniqueSorted([
    ...finalFragments.map((f) => f.y || 0),
    ...overlayRowTops,
  ]);

  const contentBottom =
    finalFragments.length > 0
      ? Math.max(...finalFragments.map((f) => (f.y || 0) + (f.height || 40)))
      : 0;

  const sectionHeight = Math.max(
    EDITOR_MIN_HEIGHT,
    overlayBottom,
    contentBottom
  );

  const rebuiltSections = safeSections.map((section, index) => {
    if (index !== editingSectionIndex) return { ...section };

    return {
      ...section,
      localFragments: finalFragments,
      rowTops: rowTops.length ? rowTops : [0],
      height: sectionHeight,
    };
  });

  const baseTop = rebuiltSections[0]?.top ?? 0;
  let runningTop = baseTop;

  const displaySectionLayouts = rebuiltSections.map((section, index) => {
    const nextSection = {
      ...section,
      top: runningTop,
      localFragments: section.localFragments || [],
      rowTops: section.rowTops || [0],
      height: section.height || 40,
      blocks: section.blocks || [],
    };

    if (index < rebuiltSections.length - 1) {
      runningTop = nextSection.top + nextSection.height + (gaps[index] ?? 0);
    }

    return nextSection;
  });

  const liveEditingSection = displaySectionLayouts[editingSectionIndex];
  const first = targetFragments[0];

  const editingOverlayBlock = {
    blockId: editingBlockId,
    sectionId: liveEditingSection.id,
    x: 0,
    y: liveEditingSection.top + overlayLocalY,
    localY: overlayLocalY,
    width: overlayWidth,
    height: overlayHeight,
    color: first.color,
    fill: first.fill,
    type: first.type,
    text: editingDraft,
    fragments: offsetFragmentsBySectionTop(
      targetFragments,
      liveEditingSection.top
    ),
  };

  debugLog("result", {
    editingSectionId: liveEditingSection.id,
    editingOverlayBlock,
    finalRowTops: rowTops,
    sectionHeight,
    reflowStartY,
  });

  return {
    displaySectionLayouts,
    editingSectionId: liveEditingSection.id,
    editingOverlayBlock,
  };
}