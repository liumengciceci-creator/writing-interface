import { useCallback, useEffect, useRef, useState } from "react";

export function useDragController({
  zoom,
  onDragStartBlock,
  onDropBlock,
  onCancelLongPress,
}) {
  const [draggingBlockId, setDraggingBlockId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const startPointerRef = useRef(null);

  const beginDrag = useCallback(
    (event, fragment) => {
      if (!fragment?.blockId) return;

      const startPoint = {
        x: event.clientX,
        y: event.clientY,
      };

      startPointerRef.current = startPoint;
      setDraggingBlockId(fragment.blockId);
      setDragOffset({ x: 0, y: 0 });

      if (typeof onDragStartBlock === "function") {
        onDragStartBlock(fragment.blockId);
      }
    },
    [onDragStartBlock]
  );

  const handlePointerMove = useCallback(
    (event) => {
      if (draggingBlockId == null || !startPointerRef.current) return;

      const dx = (event.clientX - startPointerRef.current.x) / zoom;
      const dy = (event.clientY - startPointerRef.current.y) / zoom;

      setDragOffset({
        x: dx,
        y: dy,
      });
    },
    [draggingBlockId, zoom]
  );

  const endDrag = useCallback(
    (event) => {
      if (draggingBlockId == null) return;

      if (typeof onDropBlock === "function") {
        onDropBlock(event);
      }

      setDraggingBlockId(null);
      setDragOffset({ x: 0, y: 0 });
      startPointerRef.current = null;
    },
    [draggingBlockId, onDropBlock]
  );

  const cancelDrag = useCallback(() => {
    setDraggingBlockId(null);
    setDragOffset({ x: 0, y: 0 });
    startPointerRef.current = null;
  }, []);

  useEffect(() => {
    if (draggingBlockId == null) return;

    const handleWindowMouseMove = (event) => {
      handlePointerMove(event);
    };

    const handleWindowMouseUp = (event) => {
      if (typeof onCancelLongPress === "function") {
        onCancelLongPress();
      }
      endDrag(event);
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [draggingBlockId, handlePointerMove, endDrag, onCancelLongPress]);

  return {
    draggingPreviewBlockId: draggingBlockId,
    dragOffset,
    beginDrag,
    cancelDrag,
  };
}