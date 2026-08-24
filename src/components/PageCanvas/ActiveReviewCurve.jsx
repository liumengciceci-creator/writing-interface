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

function findSuggestionElement(issueId) {
  const normalizedId = normalizeId(issueId);
  if (!normalizedId) return null;

  return Array.from(
    document.querySelectorAll("[data-review-suggestion-for]")
  ).find(
    (element) => normalizeId(element.getAttribute("data-review-suggestion-for")) === normalizedId
  ) || null;
}

function getCombinedRect(elements) {
  if (!elements.length) return null;

  const rects = elements
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);

  if (!rects.length) return null;

  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return {
    left,
    top,
    right,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

function createCurve(sourceRect, suggestionRect) {
  const movingRight = suggestionRect.centerX >= sourceRect.centerX;
  const startX = movingRight ? sourceRect.right + 4 : sourceRect.left - 4;
  const endX = movingRight ? suggestionRect.left - 9 : suggestionRect.right + 9;
  const startY = sourceRect.centerY;
  const endY = suggestionRect.centerY;
  const horizontalDistance = Math.abs(endX - startX);
  const controlDistance = Math.max(42, horizontalDistance * 0.44);
  const direction = movingRight ? 1 : -1;
  const firstControlX = startX + controlDistance * direction;
  const secondControlX = endX - controlDistance * direction;

  return `M ${startX} ${startY} C ${firstControlX} ${startY}, ${secondControlX} ${endY}, ${endX} ${endY}`;
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

    if (!stage || sourceId == null || !issue?.id) {
      setCurve(null);
      return undefined;
    }

    setCurve(null);

    let frameId = null;
    let retryFrameId = null;
    let retryCount = 0;
    let resizeObserver = null;
    let observedSuggestion = null;

    const measure = () => {
      frameId = null;
      const sourceElements = findBlockElements(stage, sourceId);
      const suggestionElement = findSuggestionElement(issue.id);
      const sourceRect = getCombinedRect(sourceElements);
      const suggestionRect = suggestionElement?.getBoundingClientRect();

      if (!sourceRect || !suggestionRect?.width || !suggestionRect?.height) {
        setCurve(null);
        if (retryCount < 10) {
          retryCount += 1;
          retryFrameId = requestAnimationFrame(() => {
            retryFrameId = null;
            measure();
          });
        }
        return;
      }

      retryCount = 0;
      if (resizeObserver && suggestionElement !== observedSuggestion) {
        if (observedSuggestion) resizeObserver.unobserve(observedSuggestion);
        resizeObserver.observe(suggestionElement);
        observedSuggestion = suggestionElement;
      }

      setCurve({
        path: createCurve(sourceRect, {
          left: suggestionRect.left,
          right: suggestionRect.right,
          centerX: (suggestionRect.left + suggestionRect.right) / 2,
          centerY: (suggestionRect.top + suggestionRect.bottom) / 2,
        }),
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    const requestMeasure = () => {
      if (frameId != null) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(measure);
    };

    requestMeasure();
    window.addEventListener("resize", requestMeasure);
    window.addEventListener("scroll", requestMeasure, true);

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(requestMeasure);
      resizeObserver.observe(stage);
      findBlockElements(stage, sourceId).forEach((element) => resizeObserver.observe(element));
      const suggestionElement = findSuggestionElement(issue.id);
      if (suggestionElement) {
        resizeObserver.observe(suggestionElement);
        observedSuggestion = suggestionElement;
      }
    }

    return () => {
      if (frameId != null) cancelAnimationFrame(frameId);
      if (retryFrameId != null) cancelAnimationFrame(retryFrameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", requestMeasure);
      window.removeEventListener("scroll", requestMeasure, true);
    };
  }, [issue?.id, issue?.relationSourceId, stageRef]);

  if (!issue || !curve) return null;

  const color = issue.sourceBlock?.color || "#d6a31a";

  return (
    <svg
      aria-hidden="true"
      width={curve.width}
      height={curve.height}
      viewBox={`0 0 ${curve.width} ${curve.height}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2400,
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
