import { CONTENT_WIDTH } from "../constants";
import { layoutInlineFragments } from "../hooks/useEditor/layout";

export function deriveSectionMetrics(localFragments) {
  if (!localFragments.length) {
    return {
      rowTops: [0],
      height: 40,
    };
  }

  const rowTops = Array.from(new Set(localFragments.map((f) => f.y))).sort(
    (a, b) => a - b
  );

  const height = Math.max(
    40,
    ...localFragments.map((f) => (f.y || 0) + (f.height || 40))
  );

  return { rowTops, height };
}

export function buildLivePreviewSectionLayouts(
  sectionLayouts,
  editingBlockId,
  editingDraft
) {
  if (!editingBlockId) return sectionLayouts;

  const editingSectionIndex = sectionLayouts.findIndex(
    (section) =>
      section.mode === "editing" &&
      section.blocks?.some((block) => block.id === editingBlockId)
  );

  if (editingSectionIndex === -1) return sectionLayouts;

  const gaps = [];
  for (let i = 0; i < sectionLayouts.length - 1; i += 1) {
    const current = sectionLayouts[i];
    const next = sectionLayouts[i + 1];
    gaps.push(next.top - (current.top + current.height));
  }

  const baseTop = sectionLayouts[0]?.top ?? 0;

  const nextSections = sectionLayouts.map((section, index) => {
    if (index !== editingSectionIndex || section.mode !== "editing") {
      return { ...section };
    }

    const nextBlocks = section.blocks.map((block) =>
      block.id === editingBlockId ? { ...block, text: editingDraft } : block
    );

    const nextLocalFragments = layoutInlineFragments(nextBlocks, CONTENT_WIDTH);
    const metrics = deriveSectionMetrics(nextLocalFragments);

    return {
      ...section,
      blocks: nextBlocks,
      localFragments: nextLocalFragments,
      rowTops: metrics.rowTops,
      height: metrics.height,
    };
  });

  let runningTop = baseTop;

  return nextSections.map((section, index) => {
    const nextSection = {
      ...section,
      top: runningTop,
    };

    if (index < nextSections.length - 1) {
      runningTop = nextSection.top + nextSection.height + (gaps[index] ?? 0);
    }

    return nextSection;
  });
} 