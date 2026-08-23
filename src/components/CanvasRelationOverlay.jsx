import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

function getBlockRect(blockId) {
  if (blockId == null) return null;
  const targetId = String(blockId);
  const nodes = Array.from(document.querySelectorAll("[data-semantic-block-id], [data-block-id]"))
    .filter((node) => String(node.getAttribute("data-semantic-block-id") || node.getAttribute("data-block-id")) === targetId);

  if (nodes.length === 0) return null;
  const rects = nodes.map((node) => node.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0);
  if (rects.length === 0) return null;

  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    right: Math.max(...rects.map((rect) => rect.right)),
    top: Math.min(...rects.map((rect) => rect.top)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  };
}

function relationLabel(criterion) {
  if (criterion.includes("解释")) return "解释论点";
  if (criterion.includes("支持")) return "支持论点";
  if (criterion.includes("回应")) return "回应论点";
  if (criterion.includes("阐明")) return "阐明论点";
  if (criterion.includes("总结")) return "总结全文";
  return "逻辑关联";
}

export default function CanvasRelationOverlay({ edges = [], activeEdgeId = null, blinkOn = false }) {
  const [paths, setPaths] = useState([]);

  useLayoutEffect(() => {
    const measure = () => {
      const nextPaths = edges.flatMap((edge, index) => {
        const source = getBlockRect(edge.sourceId);
        const target = getBlockRect(edge.targetDomId);
        if (!source || !target) return [];

        const routeX = Math.max(source.right, target.right) + 24 + (index % 3) * 12;
        const startX = source.right + 5;
        const startY = (source.top + source.bottom) / 2;
        const endX = target.right + 5;
        const endY = (target.top + target.bottom) / 2;

        return [{
          ...edge,
          path: `M ${startX} ${startY} C ${routeX} ${startY}, ${routeX} ${endY}, ${endX} ${endY}`,
          labelX: routeX + 5,
          labelY: (startY + endY) / 2,
          label: relationLabel(edge.criterion),
        }];
      });
      setPaths(nextPaths);
    };

    measure();
    const frame = window.requestAnimationFrame(measure);
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (resizeObserver) {
      document.querySelectorAll("[data-semantic-block-id], [data-block-id]").forEach((node) => resizeObserver.observe(node));
    }
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [edges]);

  if (paths.length === 0) return null;

  return createPortal(
    <svg
      aria-label="画布论证关系"
      width="100%"
      height="100%"
      style={{ position: "fixed", inset: 0, zIndex: 39, overflow: "visible", pointerEvents: "none" }}
    >
      <defs>
        {paths.map((item) => (
          <marker key={item.id} id={`arrow-${item.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 8 4 L 0 8 z" fill={item.sourceColor} />
          </marker>
        ))}
      </defs>

      {paths.map((item) => {
        const active = item.id === activeEdgeId;
        const opacity = active && !blinkOn ? 0.3 : 0.92;
        const labelWidth = Math.max(54, item.label.length * 12 + 14);
        return (
          <g key={item.id} style={{ opacity, transition: "opacity 180ms ease" }}>
            <path
              d={item.path}
              fill="none"
              stroke={item.sourceColor}
              strokeWidth={active && blinkOn ? 3 : 2}
              strokeLinecap="round"
              markerEnd={`url(#arrow-${item.id})`}
              style={{ filter: active && blinkOn ? `drop-shadow(0 0 4px ${item.sourceColor})` : "none" }}
            />
            <rect x={item.labelX - 4} y={item.labelY - 11} width={labelWidth} height="22" rx="7" fill="white" stroke={`${item.sourceColor}66`} />
            <text x={item.labelX + 4} y={item.labelY + 4} fill={item.sourceColor} fontSize="11" fontWeight="700">
              {item.label}
            </text>
          </g>
        );
      })}
    </svg>,
    document.body
  );
}
