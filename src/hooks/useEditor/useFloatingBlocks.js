import { useCallback, useMemo, useRef, useState } from "react";
import {
  CONTENT_LEFT,
  CONTENT_TOP,
  CONTENT_WIDTH,
} from "../../constants";

export function useFloatingBlocks({
  zoom,
  stageRef,
  pageRef,
  totalContentHeight,
  sectionLayouts,
  draggingBlockId,
  getBlockById,
  updateBlockPlacement,
  handleCanvasMouseUp,
}) {
  const [dragPointer, setDragPointer] = useState(null);
  const [dragPointerRaw, setDragPointerRaw] = useState(null);

  const dragStartRef = useRef(null);
  const pointerOffsetRef = useRef({ x: 0, y: 0 });

  

  const getStagePoint = useCallback(
    (event) => {
      if (!stageRef?.current) return null;

      const rect = stageRef.current.getBoundingClientRect();

      return {
        x: (event.clientX - rect.left) / zoom,
        y: (event.clientY - rect.top) / zoom,
      };
    },
    [stageRef, zoom]
  );

  const getPagePoint = useCallback(
    (event) => {
      if (!pageRef?.current) return null;

      const rect = pageRef.current.getBoundingClientRect();

      return {
        x: (event.clientX - rect.left) / zoom,
        y: (event.clientY - rect.top) / zoom,
      };
    },
    [pageRef, zoom]
  );

  const getPagePointFromStagePoint = useCallback(
    (stagePoint) => {
      if (!stagePoint || !pageRef?.current || !stageRef?.current) return null;

      const stageRect = stageRef.current.getBoundingClientRect();
      const pageRect = pageRef.current.getBoundingClientRect();

      return {
        x: stagePoint.x - (pageRect.left - stageRect.left) / zoom,
        y: stagePoint.y - (pageRect.top - stageRect.top) / zoom,
      };
    },
    [pageRef, stageRef, zoom]
  );

  const isInsidePageArea = useCallback(
    (pagePoint) => {
      if (!pagePoint || !pageRef?.current) return false;

      return (
        pagePoint.x >= 0 &&
        pagePoint.x <= pageRef.current.offsetWidth &&
        pagePoint.y >= 0 &&
        pagePoint.y <= pageRef.current.offsetHeight
      );
    },
    [pageRef]
  );

  const isInsideContentArea = useCallback(
    (pagePoint) => isInsidePageArea(pagePoint),
    [isInsidePageArea]
  );

  const beginDragTracking = useCallback(
    (event, block) => {
      const point = getStagePoint(event);
      if (!point || !stageRef?.current) return;

      dragStartRef.current = point;
      setDragPointer(point);
      setDragPointerRaw({
        clientX: event.clientX,
        clientY: event.clientY,
      });

      const stageRect = stageRef.current.getBoundingClientRect();

      if (block?.placement === "floating") {
        const blockLeft = block.floatingX ?? 0;
        const blockTop = block.floatingY ?? 0;

        pointerOffsetRef.current = {
          x: event.clientX - stageRect.left - blockLeft,
          y: event.clientY - stageRect.top - blockTop,
        };
      } else {
        pointerOffsetRef.current = {
          x: 24,
          y: 20,
        };
      }
    },
    [getStagePoint, stageRef]
  );

  const updateDragPointer = useCallback(
    (event) => {
      if (!dragStartRef.current) return;

      const point = getStagePoint(event);
      if (!point) return;

      setDragPointer(point);
      setDragPointerRaw({
        clientX: event.clientX,
        clientY: event.clientY,
      });
    },
    [getStagePoint]
  );

  const clearDragPointer = useCallback(() => {
    setDragPointer(null);
    setDragPointerRaw(null);
    dragStartRef.current = null;
    pointerOffsetRef.current = { x: 0, y: 0 };
  }, []);

  const dragOffset = useMemo(() => {
    if (!dragPointer || !dragStartRef.current) {
      return { x: 0, y: 0 };
    }

    return {
      x: dragPointer.x - dragStartRef.current.x,
      y: dragPointer.y - dragStartRef.current.y,
    };
  }, [dragPointer]);

  const currentPagePoint = useMemo(() => {
    return getPagePointFromStagePoint(dragPointer);
  }, [dragPointer, getPagePointFromStagePoint]);

  const isDraggingOutsidePage = useMemo(() => {
    if (draggingBlockId == null) return false;
    if (!dragPointer) return false;

    return !isInsidePageArea(currentPagePoint);
  }, [draggingBlockId, dragPointer, currentPagePoint, isInsidePageArea]);

  const isDraggingOutsideContent = isDraggingOutsidePage;

  const shouldHideInlineBlock = useCallback(
    (blockId) => {
      return (
        draggingBlockId != null &&
        blockId === draggingBlockId &&
        isDraggingOutsidePage
      );
    },
    [draggingBlockId, isDraggingOutsidePage]
  );

  // 页面外的 floating preview
const draggingFloatingPreview = useMemo(() => {
  if (draggingBlockId == null) return null;
  if (!dragPointer) return null;
  if (!dragPointerRaw) return null;
  if (!stageRef?.current) return null;

  const block = getBlockById?.(draggingBlockId);
  if (!block) return null;

  // inline 原生拖拽全程使用这一份自定义预览。
  // floating 模块位于页面内时使用 draggingBackToPagePreview，
  // 避免同时显示两个方框。
  if (
    block.placement === "floating" &&
    !isDraggingOutsidePage
  ) {
    return null;
  }

  const stageRect = stageRef.current.getBoundingClientRect();

  return {
    block,
    width: block.floatingWidth ?? 180,
    x: dragPointerRaw.clientX - stageRect.left - pointerOffsetRef.current.x,
    y: dragPointerRaw.clientY - stageRect.top - pointerOffsetRef.current.y,
  };
}, [
  draggingBlockId,
  dragPointer,
  dragPointerRaw,
  isDraggingOutsidePage,
  getBlockById,
  stageRef,
]);

  // 从 floating 拖回页面时的页面内 preview
  const draggingBackToPagePreview = useMemo(() => {
    if (draggingBlockId == null) return null;
    if (!dragPointer) return null;
    if (isDraggingOutsidePage) return null;

    const block = getBlockById?.(draggingBlockId);
    if (!block) return null;
    if (block.placement !== "floating") return null;
    if (!currentPagePoint) return null;

    const width = Math.min(block.floatingWidth ?? 180, CONTENT_WIDTH);
    const offsetX = pointerOffsetRef.current.x / zoom;
    const offsetY = pointerOffsetRef.current.y / zoom;

    const rawX = currentPagePoint.x - CONTENT_LEFT - offsetX;
    const rawY = currentPagePoint.y - CONTENT_TOP - offsetY;

    const clampedX = Math.max(0, Math.min(CONTENT_WIDTH - width, rawX));
    const clampedY = Math.max(
      0,
      Math.min(Math.max(0, totalContentHeight - 40), rawY)
    );

    return {
      block,
      width,
      x: clampedX,
      y: clampedY,
    };
  }, [
    draggingBlockId,
    dragPointer,
    isDraggingOutsidePage,
    getBlockById,
    currentPagePoint,
    zoom,
    totalContentHeight,
  ]);

  const handleFloatingDrop = useCallback(
    (event, blockId) => {
      const stagePoint = getStagePoint(event);
      const pagePoint = getPagePoint(event);

      if (!stagePoint || !pagePoint) {
        clearDragPointer();
        return { type: "none" };
      }

      const block = getBlockById?.(blockId);
      if (!block) {
        clearDragPointer();
        return { type: "none" };
      }

      const insidePage = isInsidePageArea(pagePoint);
      const isFloating = block.placement === "floating";

      if (!insidePage) {
        if (!stageRef?.current) {
          clearDragPointer();
          return { type: "none" };
        }

        const stageRect = stageRef.current.getBoundingClientRect();

         const nextX = event.clientX - stageRect.left - pointerOffsetRef.current.x;
         const nextY = event.clientY - stageRect.top - pointerOffsetRef.current.y;

        const moved =
          block.floatingX !== nextX || block.floatingY !== nextY;

        updateBlockPlacement?.(blockId, {
          placement: "floating",
          floatingX: nextX,
          floatingY: nextY,
          floatingWidth: block.floatingWidth ?? 180,
        });

        clearDragPointer();
        return {
          type: isFloating ? "floating-move" : "to-floating",
          moved,
        };
      }

      if (insidePage && isFloating) {
        /**
         * 浮动模块拖回页面时只转换 placement。
         * 旧的 handleCanvasMouseUp 会再次移动同一个模块，
         * 与 placement 更新产生状态竞争，导致模块仍留在外面。
         */
        updateBlockPlacement?.(blockId, {
          placement: "inline",
          floatingX: null,
          floatingY: null,
          floatingWidth: null,
        });

        clearDragPointer();
        return { type: "to-inline" };
      }

      if (insidePage && !isFloating) {
        handleCanvasMouseUp?.(event);
        clearDragPointer();
        return { type: "inline-move" };
      }

      clearDragPointer();
      return { type: "none" };
    },
    [
      getStagePoint,
      getPagePoint,
      getBlockById,
      isInsidePageArea,
      updateBlockPlacement,
      handleCanvasMouseUp,
      clearDragPointer,
      stageRef,
    ]
  );

  const floatingBlocks = useMemo(() => {
    const result = [];

    for (const section of sectionLayouts || []) {
      for (const block of section.blocks || []) {
        if (block.placement === "floating") {
          result.push(block);
        }
      }
    }

    return result;
  }, [sectionLayouts]);

  return {
    beginDragTracking,
    dragOffset,
    updateDragPointer,
    clearDragPointer,
    isInsideContentArea,
    isDraggingOutsideContent,
    isDraggingOutsidePage,
    shouldHideInlineBlock,
    draggingFloatingPreview,
    draggingBackToPagePreview,
    handleFloatingDrop,
    floatingBlocks,
  };
}
