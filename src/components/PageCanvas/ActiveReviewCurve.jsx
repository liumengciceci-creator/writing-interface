import {
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

function normalizeId(value) {
  return value == null ? "" : String(value);
}

function findBlockElements(stage, blockId) {
  const normalizedId = normalizeId(blockId);
  if (!stage || !normalizedId) return [];

  return Array.from(
    stage.querySelectorAll(
      "[data-semantic-block-id], [data-block-root='true'][data-block-id]"
    )
  ).filter((element) => (
    normalizeId(element.getAttribute("data-semantic-block-id")) === normalizedId ||
    normalizeId(element.getAttribute("data-block-id")) === normalizedId
  ));
}

function getCombinedRect(elements, stageRect) {
  if (!elements.length) return null;

  const rects = elements
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);

  if (!rects.length) return null;

  const left = Math.min(...rects.map((rect) => rect.left)) - stageRect.left;
  const top = Math.min(...rects.map((rect) => rect.top)) - stageRect.top;
  const right = Math.max(...rects.map((rect) => rect.right)) - stageRect.left;
  const bottom = Math.max(...rects.map((rect) => rect.bottom)) - stageRect.top;

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

function createCurve(from, to) {
  const verticalGap = Math.abs(from.centerY - to.centerY);

  if (verticalGap > 48) {
    const startX = from.right + 4;
    const startY = from.centerY;
    const endX = to.right + 8;
    const endY = to.centerY;
    const controlX = Math.max(from.right, to.right) + 52;

    return `M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`;
  }

  const movingRight = to.centerX >= from.centerX;
  const startX = movingRight ? from.right + 4 : from.left - 4;
  const endX = movingRight ? to.left - 8 : to.right + 8;
  const bendY = Math.min(from.top, to.top) - 30;
  const middleX = (startX + endX) / 2;

  return `M ${startX} ${from.centerY} C ${middleX} ${bendY}, ${middleX} ${bendY}, ${endX} ${to.centerY}`;
}

export default function ActiveReviewCurve({ stageRef, issue }) {
  const [curve, setCurve] = useState(null);
  const markerId = useMemo(
    () => `review-arrow-${normalizeId(issue?.id).replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    [issue?.id]
  );

  useLayoutEffect(() => {
    const stage = stageRef?.current;
    const sourceId = issue?.relationSourceId;
    const relatedId = issue?.relationTargetId;

    if (!stage || sourceId == null || relatedId == null) {
      setCurve(null);
      return undefined;
    }

    setCurve(null);

    let frameId = null;
    let resizeObserver = null;

    const measure = () => {
      frameId = null;
      const sourceElements = findBlockElements(stage, sourceId);
      const relatedElements = findBlockElements(stage, relatedId);
      const stageRect = stage.getBoundingClientRect();
      const sourceRect = getCombinedRect(sourceElements, stageRect);
      const relatedRect = getCombinedRect(relatedElements, stageRect);

      if (!sourceRect || !relatedRect) {
        setCurve(null);
        return;
      }

      setCurve({
        path: createCurve(relatedRect, sourceRect),
        width: Math.max(stage.scrollWidth, stage.clientWidth),
        height: Math.max(stage.scrollHeight, stage.clientHeight),
      });
    };

    const requestMeasure = () => {
      if (frameId != null) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(measure);
    };

    requestMeasure();
    window.addEventListener("resize", requestMeasure);

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(requestMeasure);
      resizeObserver.observe(stage);
      findBlockElements(stage, sourceId).forEach((element) => resizeObserver.observe(element));
      findBlockElements(stage, relatedId).forEach((element) => resizeObserver.observe(element));
    }

    return () => {
      if (frameId != null) cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", requestMeasure);
    };
  }, [issue?.id, issue?.relationSourceId, issue?.relationTargetId, stageRef]);

  if (!issue || !curve) return null;

  const color = issue.sourceBlock?.color || "#d6a31a";

  return (
    <svg
      aria-hidden="true"
      width={curve.width}
      height={curve.height}
      viewBox={`0 0 ${curve.width} ${curve.height}`}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 6000,
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="8.2"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
        </marker>
      </defs>
      <path
        key={issue.id}
        d={curve.path}
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        markerEnd={`url(#${markerId})`}
        pathLength="1"
        style={{
          strokeDasharray: 1,
          strokeDashoffset: 0,
          animation: "review-active-curve-draw 520ms ease-out both",
        }}
      />
    </svg>
  );
}
