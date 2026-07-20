import { CONTENT_WIDTH } from "../../constants";
import { layoutInlineFragments } from "../../hooks/useEditor/layout";

export function isEnglishText(text) {
  if (!text) return false;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  return latin > cjk;
}

export function getPreviewTextStyle(text) {
  const isEnglish = isEnglishText(text);

  return {
    display: "block",
    width: "100%",
    fontSize: 14,
    color: "#333",
    lineHeight: "20px",
    textAlign: "left",
    whiteSpace: isEnglish ? "normal" : "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "break-word",
    pointerEvents: "none",
  };
}

export function isGeneratedBlock(block) {
  if (!block) return false;
  return block.isGenerated === true || block.type === "Generated";
}

export function deriveInlineMetrics(localFragments) {
  if (!localFragments || localFragments.length === 0) {
    return {
      rowTops: [0],
      height: 40,
    };
  }

  const rowTops = Array.from(
    new Set(localFragments.map((f) => f.y || 0))
  ).sort((a, b) => a - b);

  const height = Math.max(
    40,
    ...localFragments.map((f) => (f.y || 0) + (f.height || 40))
  );

  return { rowTops, height };
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function detectRowStep(rowTops) {
  const tops = uniqueSorted((rowTops || []).filter((v) => Number.isFinite(v)));
  if (tops.length < 2) return 58;

  const diffs = [];
  for (let i = 1; i < tops.length; i += 1) {
    const diff = tops[i] - tops[i - 1];
    if (diff > 0) diffs.push(diff);
  }

  return diffs.length ? Math.min(...diffs) : 58;
}

function snapDownToRow(value, rowStep) {
  return Math.ceil(value / rowStep) * rowStep;
}

function simplifyFragments(fragments = []) {
  return fragments.map((f) => ({
    id: f.id,
    blockId: f.blockId,
    type: f.type,
    text: f.text,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
  }));
}

function simplifyBlocks(blocks = []) {
  return blocks.map((b) => ({
    id: b.id,
    type: b.type,
    text: b.text,
    width: b.width,
    placement: b.placement,
    isGenerated: b.isGenerated,
  }));
}

export function buildInlineEditingPreview({
  sectionLayouts,
  editingBlockId,
  editingDraft,
  editingMeasuredHeight = null,
  debug = false,
}) {
  const safeSections = (sectionLayouts || []).map((section) => ({
    ...section,
    blocks: section.blocks || [],
    localFragments: section.localFragments || [],
    rowTops: section.rowTops || [0],
    height: section.height || 40,
    top: section.top || 0,
  }));

  if (!editingBlockId) {
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
    if (debug) {
      console.group("[buildInlineEditingPreview:SECTION_NOT_FOUND]");
      console.log("editingBlockId =", editingBlockId);
      console.log(
        "section ids =",
        safeSections.map((s) => ({
          id: s.id,
          mode: s.mode,
          blockIds: (s.blocks || []).map((b) => b.id),
        }))
      );
      console.groupEnd();
    }

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
    return {
      displaySectionLayouts: safeSections,
      editingSectionId: null,
      editingOverlayBlock: null,
    };
  }

  const originalEditingBlock = blocks[targetIndex];

  const visibleFragments = allFragments
    .filter((fragment) => fragment.blockId === editingBlockId)
    .sort((a, b) => {
      if ((a.y || 0) !== (b.y || 0)) return (a.y || 0) - (b.y || 0);
      return (a.x || 0) - (b.x || 0);
    });

  if (!visibleFragments.length) {
    return {
      displaySectionLayouts: safeSections,
      editingSectionId: editingSection.id,
      editingOverlayBlock: null,
    };
  }

  const visibleLeft = Math.min(...visibleFragments.map((f) => f.x || 0));
  const visibleRight = Math.max(
    ...visibleFragments.map((f) => (f.x || 0) + (f.width || 0))
  );
  const visibleTop = Math.min(...visibleFragments.map((f) => f.y || 0));

const firstFragment = visibleFragments[0];


 const stableWidth =
  firstFragment?.width != null
    ? firstFragment.width
    : originalEditingBlock?.width || 180;

  const estimatedLineCount = Math.max(1, visibleFragments.length);

// ⭐ 新增：是否真的发生“换行”
const isMultiLine = estimatedLineCount > 1;
  const estimatedOverlayHeight = Math.max(
    40,
    estimatedLineCount * 20 + 24
  );

  const overlayHeight = isMultiLine
  ? Math.max(40, editingMeasuredHeight ?? estimatedOverlayHeight)
  : 40;

  const overlayBottom = visibleTop + overlayHeight;

  const beforeBlocks = blocks.slice(0, targetIndex);
  const afterBlocks = blocks.slice(targetIndex + 1);

  const beforeBlockIds = new Set(beforeBlocks.map((b) => b.id));

  const keptBeforeFragments = allFragments.filter(
    (fragment) =>
      fragment.blockId !== editingBlockId && beforeBlockIds.has(fragment.blockId)
  );

const reflowStartY = isMultiLine
  ? snapDownToRow(overlayBottom + 16, rowStep)
  : null;

const relaidAfterLocal = isMultiLine
  ? layoutInlineFragments(afterBlocks, CONTENT_WIDTH).map((fragment) => ({
      ...fragment,
      y: (fragment.y || 0) + reflowStartY,
    }))
  : allFragments.filter(
      (f) =>
        f.blockId !== editingBlockId &&
        !beforeBlockIds.has(f.blockId)
    );

  const finalFragments = [...keptBeforeFragments, ...relaidAfterLocal];

  const metrics = deriveInlineMetrics(finalFragments);

  const rowTops = uniqueSorted([...(metrics.rowTops || []), visibleTop]);

  const contentBottom =
    finalFragments.length > 0
      ? Math.max(...finalFragments.map((f) => (f.y || 0) + (f.height || 40)))
      : 0;

  const liveSectionHeight = isMultiLine
  ? Math.max(40, overlayBottom, contentBottom)
  : Math.max(40, contentBottom);

  if (debug) {
    console.group("[buildInlineEditingPreview:START]");
    console.log("editingBlockId =", editingBlockId);
    console.log("editingDraft =", editingDraft);
    console.log("editingSectionIndex =", editingSectionIndex);
    console.log("editingSection.id =", editingSection.id);
    console.log("originalEditingBlock =", originalEditingBlock);
    console.log("rowStep =", rowStep);
    console.log("visibleFragments =", simplifyFragments(visibleFragments));
    console.log("visibleLeft =", visibleLeft);
    console.log("visibleRight =", visibleRight);
    console.log("visibleTop =", visibleTop);
    console.log("stableWidth =", stableWidth);
    console.log("estimatedLineCount =", estimatedLineCount);
    console.log("estimatedOverlayHeight =", estimatedOverlayHeight);
    console.log("editingMeasuredHeight =", editingMeasuredHeight);
    console.log("overlayHeight =", overlayHeight);
    console.log("overlayBottom =", overlayBottom);
    console.log("reflowStartY =", reflowStartY);
    console.log(
      "beforeBlocks =",
      simplifyBlocks(beforeBlocks)
    );
    console.log(
      "afterBlocks =",
      simplifyBlocks(afterBlocks)
    );
    console.log(
      "keptBeforeFragments =",
      simplifyFragments(keptBeforeFragments)
    );
    console.log(
      "relaidAfterLocal =",
      simplifyFragments(relaidAfterLocal)
    );
    console.log(
      "finalFragments =",
      simplifyFragments(finalFragments)
    );
    console.log("liveSectionHeight =", liveSectionHeight);
    console.groupEnd();
  }

  const rebuiltSections = safeSections.map((section, index) => {
    if (index !== editingSectionIndex) return { ...section };

    return {
      ...section,
      blocks,
      localFragments: finalFragments,
      rowTops,
      height: liveSectionHeight,
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

  if (debug) {
    console.group("[SECTION TOP DEBUG]");
    console.log(
      displaySectionLayouts.map((section) => ({
        id: section.id,
        mode: section.mode,
        top: section.top,
        height: section.height,
        rowTops: section.rowTops,
        blockIds: (section.blocks || []).map((b) => b.id),
      }))
    );
    console.groupEnd();
  }

  const liveEditingSection = displaySectionLayouts[editingSectionIndex];
  const firstEditingFragment = visibleFragments[0];

  const result = {
    displaySectionLayouts,
    editingSectionId: liveEditingSection.id,
    editingOverlayBlock: {
      blockId: editingBlockId,
      sectionId: liveEditingSection.id,
      x: visibleLeft,
      y: liveEditingSection.top + visibleTop,
      localY: visibleTop,
      width: stableWidth,
      height: overlayHeight,
      color: firstEditingFragment.color,
      fill: firstEditingFragment.fill,
      type: firstEditingFragment.type,
      text: editingDraft,
      fragments: visibleFragments,
    },
  };

  if (debug) {
    console.group("[FINAL RESULT]");
    console.log("editingSectionId =", result.editingSectionId);
    console.log("editingOverlayBlock =", result.editingOverlayBlock);
    console.log(
      "editingSection.localFragments(after) =",
      simplifyFragments(liveEditingSection.localFragments)
    );
    console.groupEnd();
  }

  return result;
}
