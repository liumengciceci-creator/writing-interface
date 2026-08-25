import { useEffect, useRef } from "react";
import {
  getResearchSessionInfo,
  logResearchEvent,
} from "./researchLogger.js";

export function serializeResearchDocument(sections = []) {
  const blocks = [];
  sections.forEach((section, sectionIndex) => {
    (section?.blocks || []).forEach((block, blockIndex) => {
      blocks.push({
        id: String(block.id),
        section_id: String(section.id || sectionIndex),
        section_index: sectionIndex,
        block_index: blockIndex,
        type: block.type || "Unknown",
        label: block.label || "",
        text: String(block.text || ""),
        placement: block.placement || "inline",
        force_line_break_before: block.forceLineBreakBefore === true,
        floating_x: block.floatingX ?? null,
        floating_y: block.floatingY ?? null,
        floating_width: block.floatingWidth ?? null,
        floating_height: block.floatingHeight ?? null,
        is_generated: block.isGenerated === true,
      });
    });
  });
  return blocks;
}

function compareDocuments(previous = [], next = []) {
  const previousById = new Map(previous.map((block) => [block.id, block]));
  const nextById = new Map(next.map((block) => [block.id, block]));
  const changes = [];

  next.forEach((block) => {
    const before = previousById.get(block.id);
    if (!before) {
      changes.push({ kind: "block_added", block });
      return;
    }
    if (before.text !== block.text) {
      changes.push({
        kind: "block_text_changed",
        block_id: block.id,
        before_text: before.text,
        after_text: block.text,
      });
    }
    if (
      before.section_index !== block.section_index ||
      before.block_index !== block.block_index ||
      before.placement !== block.placement
    ) {
      changes.push({
        kind: "block_moved",
        block_id: block.id,
        before: {
          section_index: before.section_index,
          block_index: before.block_index,
          placement: before.placement,
        },
        after: {
          section_index: block.section_index,
          block_index: block.block_index,
          placement: block.placement,
        },
      });
    }
    if (before.type !== block.type || before.label !== block.label) {
      changes.push({
        kind: "block_type_changed",
        block_id: block.id,
        before: { type: before.type, label: before.label },
        after: { type: block.type, label: block.label },
      });
    }
    if (
      before.floating_x !== block.floating_x ||
      before.floating_y !== block.floating_y ||
      before.floating_width !== block.floating_width ||
      before.floating_height !== block.floating_height
    ) {
      changes.push({
        kind: "floating_bounds_changed",
        block_id: block.id,
        before: {
          x: before.floating_x,
          y: before.floating_y,
          width: before.floating_width,
          height: before.floating_height,
        },
        after: {
          x: block.floating_x,
          y: block.floating_y,
          width: block.floating_width,
          height: block.floating_height,
        },
      });
    }
  });

  previous.forEach((block) => {
    if (!nextById.has(block.id)) {
      changes.push({ kind: "block_deleted", block });
    }
  });
  return changes;
}

export function useResearchDocumentLogger(sections) {
  const committedRef = useRef(null);
  const latestRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!getResearchSessionInfo().enabled) return undefined;
    latestRef.current = serializeResearchDocument(sections);

    if (committedRef.current == null) {
      committedRef.current = latestRef.current;
      logResearchEvent("document_loaded", {
        document: latestRef.current,
      });
      return undefined;
    }

    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const nextDocument = latestRef.current;
      const changes = compareDocuments(committedRef.current, nextDocument);
      if (changes.length > 0) {
        logResearchEvent("document_changed", {
          changes,
        }, {
          targetBlockIds: changes
            .map((change) => change.block_id || change.block?.id)
            .filter(Boolean),
        });
      }
      committedRef.current = nextDocument;
    }, 700);

    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [sections]);
}
