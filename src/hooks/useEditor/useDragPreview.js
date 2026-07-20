import { useState } from "react";
import {
  BLOCK_HEIGHT,
  BLOCK_WIDTH,
  CONTENT_WIDTH,
  PAGE_HEIGHT,
} from "../../constants";
import { clamp, cloneSections } from "../../utils";
import { findBlockLocation } from "./sectionHelpers";
import { getInsertIndexFromPointer } from "./layout";

export function useDragPreview({
  sections,
  blockBounds,
  contentRef,
  zoom,
  totalContentHeight,
  getTargetEditingLayout,
}) {
  const [dragPreview, setDragPreview] = useState(null);
  const [dropIndicator, setDropIndicator] = useState(null);

  const getContentPoint = (event) => {
    if (!contentRef.current) return null;

    const rect = contentRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / zoom;
    const y = (event.clientY - rect.top) / zoom;

    return {
      x: clamp(x, 0, CONTENT_WIDTH),
      y: clamp(y, 0, Math.max(totalContentHeight, PAGE_HEIGHT)),
    };
  };

  const startDragPreview = (blockId, event) => {
    const source = findBlockLocation(cloneSections(sections), blockId);
    if (!source) return false;

    const sourceSection = sections.find((section) => section.id === source.sectionId);
    if (!sourceSection) return false;

    const block = sourceSection.blocks[source.blockIndex];
    if (!block) return false;

    const bound = blockBounds.find((b) => b.blockId === blockId);
    if (!bound) return false;

    let offsetX = 24;
    let offsetY = 18;
    let previewX = bound.x;
    let previewY = bound.y;

    const point = getContentPoint(event);
    if (point) {
      offsetX = point.x - bound.x;
      offsetY = point.y - bound.y;
      previewX = point.x - offsetX;
      previewY = point.y - offsetY;
    }

    setDragPreview({
      blockId,
      text: block.text,
      type: block.type,
      color: block.color,
      fill: block.fill,
      width: bound.width || block.width || BLOCK_WIDTH,
      height: bound.height || block.height || BLOCK_HEIGHT,
      x: previewX,
      y: previewY,
      offsetX,
      offsetY,
    });

    setDropIndicator({
      sectionId: source.sectionId,
      insertIndex: source.blockIndex,
    });

    return true;
  };

  const updateDragPreview = (event, draggingBlockId) => {
    if (!dragPreview || draggingBlockId == null) return;

    const point = getContentPoint(event);
    if (!point) return;

    setDragPreview((prev) =>
      prev
        ? {
            ...prev,
            x: point.x - prev.offsetX,
            y: point.y - prev.offsetY,
          }
        : prev
    );

    const targetLayout = getTargetEditingLayout(point.y);
    if (!targetLayout) return;

    const localY = clamp(point.y - targetLayout.top, 0, targetLayout.height);

    const currentTargetFragments = targetLayout.localFragments.filter(
      (fragment) => fragment.blockId !== draggingBlockId
    );
    const currentTargetBlocks = targetLayout.blocks.filter(
      (block) => block.id !== draggingBlockId
    );

    const insertIndex = getInsertIndexFromPointer(
      currentTargetBlocks,
      currentTargetFragments,
      point.x,
      localY
    );

    setDropIndicator({
      sectionId: targetLayout.id,
      insertIndex,
    });
  };

  const clearDragPreview = () => {
    setDragPreview(null);
    setDropIndicator(null);
  };

  return {
    dragPreview,
    dropIndicator,
    startDragPreview,
    updateDragPreview,
    clearDragPreview,
  };
}