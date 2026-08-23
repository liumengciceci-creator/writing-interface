import { cloneBlocks } from "../../utils";

export function cloneSections(sections) {
  return sections.map((section) => ({
    ...section,
    blocks: cloneBlocks(section.blocks),
  }));
}

export function createEditingSection(nextSectionIdRef) {
  return {
    id: nextSectionIdRef.current++,
    mode: "editing",
    blocks: [],
  };
}

export function normalizeSections(sections, createEditingSectionFn) {
  const next = cloneSections(sections).filter((section, index, arr) => {
    if (section.mode === "completed") return true;
    const isLast = index === arr.length - 1;
    return isLast || section.blocks.length > 0;
  });

  if (next.length === 0 || next[next.length - 1].mode !== "editing") {
    next.push(createEditingSectionFn());
    return next;
  }

  if (next[next.length - 1].blocks.length > 0) {
    next.push(createEditingSectionFn());
    return next;
  }

  return next;
}

export function getSectionGroupEntries(section) {
  const groups = [];
  const map = new Map();

  for (const block of section.blocks) {
    const key =
      block.completionGroupId != null
        ? `ai-${block.completionGroupId}`
        : `manual-${section.id}`;

    if (!map.has(key)) {
      const entry = { key, blocks: [] };
      map.set(key, entry);
      groups.push(entry);
    }

    map.get(key).blocks.push({ ...block });
  }

  return groups;
}

export function findBlockLocation(
  sectionsToSearch,
  blockId
) {
  for (
    let sectionIndex = 0;
    sectionIndex <
    sectionsToSearch.length;
    sectionIndex += 1
  ) {
    const section =
      sectionsToSearch[
        sectionIndex
      ];

    if (
      section.mode !==
      "editing"
    ) {
      continue;
    }

    const blockIndex =
      section.blocks.findIndex(
        (block) =>
          String(block.id) ===
          String(blockId)
      );

    if (
      blockIndex !== -1
    ) {
      return {
        sectionId:
          section.id,

        sectionIndex,

        blockIndex,

        block:
          section.blocks[
            blockIndex
          ],
      };
    }
  }

  return null;
}