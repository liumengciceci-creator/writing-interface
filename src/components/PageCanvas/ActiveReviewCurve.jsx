import {
  useLayoutEffect,
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

  return {
    path: `M ${startX} ${startY} C ${firstControlX} ${startY}, ${secondControlX} ${endY}, ${endX} ${endY}`,
  };
}

function createGapAnchorRect(firstRect, secondRect) {
  const sameRow = Math.abs(firstRect.centerY - secondRect.centerY) <= 18;
  const secondFollowsHorizontally = sameRow && secondRect.left >= firstRect.right;

  const anchorX = secondFollowsHorizontally
    ? (firstRect.right + secondRect.left) / 2
    : (firstRect.centerX + secondRect.centerX) / 2;
  const anchorY = secondFollowsHorizontally
    ? (firstRect.centerY + secondRect.centerY) / 2
    : (firstRect.bottom + secondRect.top) / 2;

  return {
    left: anchorX,
    right: anchorX,
    top: anchorY,
    bottom: anchorY,
    centerX: anchorX,
    centerY: anchorY,
  };
}

export default function ActiveReviewCurve({ stageRef, issue }) {
  const [curve, setCurve] = useState(null);

  useLayoutEffect(() => {
    const stage = stageRef?.current;
    const sourceId = issue?.action === "insert"
      ? issue?.insertAfterId
      : issue?.relationSourceId;
    const gapTargetId = issue?.action === "insert"
      ? issue?.insertBeforeId
      : null;

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
      const gapTargetElements = gapTargetId
        ? findBlockElements(stage, gapTargetId)
        : [];
      const suggestionElement = findSuggestionElement(issue.id);
      const sourceRect = getCombinedRect(sourceElements);
      const gapTargetRect = gapTargetId
        ? getCombinedRect(gapTargetElements)
        : null;
      const suggestionRect = suggestionElement?.getBoundingClientRect();

      if (
        !sourceRect ||
        (gapTargetId && !gapTargetRect) ||
        !suggestionRect?.width ||
        !suggestionRect?.height
      ) {
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
        ...createCurve(
          gapTargetRect
            ? createGapAnchorRect(sourceRect, gapTargetRect)
            : sourceRect,
          {
          left: suggestionRect.left,
          right: suggestionRect.right,
          centerX: (suggestionRect.left + suggestionRect.right) / 2,
          centerY: (suggestionRect.top + suggestionRect.bottom) / 2,
          }
        ),
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
      if (gapTargetId) {
        findBlockElements(stage, gapTargetId).forEach((element) => resizeObserver.observe(element));
      }
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
  }, [
    issue?.action,
    issue?.id,
    issue?.insertAfterId,
    issue?.insertBeforeId,
    issue?.relationSourceId,
    stageRef,
  ]);

  if (!issue || !curve) return null;

  const color = issue.action === "insert"
    ? issue.suggestedModule?.color || "#d6a31a"
    : issue.sourceBlock?.color || "#d6a31a";
  const curveDrawId = `review-curve-draw-${normalizeId(issue.id).replace(
    /[^a-zA-Z0-9_-]/g,
    "-"
  )}`;

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
      <path
        key={issue.id}
        d={curve.path}
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        pathLength="1"
        strokeDasharray="1"
        strokeDashoffset="1"
      >
        <animate
          id={curveDrawId}
          attributeName="stroke-dashoffset"
          from="1"
          to="0"
          dur="520ms"
          begin="0s"
          fill="freeze"
          calcMode="linear"
        />
      </path>
      <polygon
        key={`${issue.id}-arrowhead`}
        points="0,0 -10,-5 -10,5"
        fill={color}
        opacity="0"
      >
        <animateMotion
          path={curve.path}
          dur="520ms"
          begin={`${curveDrawId}.begin`}
          fill="freeze"
          rotate="auto"
          calcMode="linear"
        />
        <animate
          attributeName="opacity"
          values="0;0;1;1"
          keyTimes="0;0.025;0.04;1"
          dur="520ms"
          begin={`${curveDrawId}.begin`}
          fill="freeze"
          calcMode="linear"
        />
      </polygon>
    </svg>
  );
}
