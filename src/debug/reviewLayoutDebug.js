function serializeRect(rect) {
  if (!rect) return null;

  return {
    left: Math.round(rect.left * 100) / 100,
    top: Math.round(rect.top * 100) / 100,
    right: Math.round(rect.right * 100) / 100,
    bottom: Math.round(rect.bottom * 100) / 100,
    width: Math.round(rect.width * 100) / 100,
    height: Math.round(rect.height * 100) / 100,
  };
}

function getCombinedElementRect(elements) {
  const rects = elements
    .flatMap((element) => Array.from(element.getClientRects?.() || []))
    .filter((rect) => rect.width > 0 && rect.height > 0);

  if (!rects.length) return null;

  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return serializeRect({
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  });
}

function getBlockElements(stage, blockId) {
  if (!stage || blockId == null) return [];

  const normalizedId = String(blockId);
  return Array.from(
    stage.querySelectorAll(
      "[data-semantic-block-id], [data-block-root='true'][data-block-id]"
    )
  ).filter((element) =>
    String(
      element.getAttribute("data-semantic-block-id") ??
        element.getAttribute("data-block-id") ??
        ""
    ) === normalizedId
  );
}

/**
 * 审阅布局诊断快照。
 * 同时记录 React 数据坐标与浏览器真实 DOM 坐标，用于区分：
 * 1. block 数据被改写；
 * 2. 面板进入文档流后把整个画布推移。
 */
export function captureReviewLayoutSnapshot({
  label,
  sections,
  stage,
  page,
  content,
  baseline = null,
}) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  const baselineBlocks = new Map(
    (baseline?.blocks || []).map((block) => [String(block.id), block])
  );
  const blocks = [];
  let paragraph = 1;
  let paragraphHasBody = false;

  (Array.isArray(sections) ? sections : []).forEach((section, sectionIndex) => {
    (Array.isArray(section?.blocks) ? section.blocks : []).forEach(
      (block, blockIndex) => {
        if (!block || block.isCompletedParagraph) return;

        if (
          block.type !== "Title" &&
          block.forceLineBreakBefore &&
          paragraphHasBody
        ) {
          paragraph += 1;
          paragraphHasBody = false;
        }

        const domRect = getCombinedElementRect(
          getBlockElements(stage, block.id)
        );
        const previous = baselineBlocks.get(String(block.id));

        blocks.push({
          id: String(block.id),
          type: String(block.type || ""),
          sectionId: String(section.id ?? ""),
          sectionIndex,
          blockIndex,
          paragraph: block.type === "Title" ? 0 : paragraph,
          placement: block.placement || "inline",
          forceLineBreakBefore: Boolean(block.forceLineBreakBefore),
          floatingX: block.floatingX ?? null,
          floatingY: block.floatingY ?? null,
          domLeft: domRect?.left ?? null,
          domTop: domRect?.top ?? null,
          domWidth: domRect?.width ?? null,
          domHeight: domRect?.height ?? null,
          deltaLeft:
            domRect && previous?.domLeft != null
              ? Math.round((domRect.left - previous.domLeft) * 100) / 100
              : null,
          deltaTop:
            domRect && previous?.domTop != null
              ? Math.round((domRect.top - previous.domTop) * 100) / 100
              : null,
          text: String(block.text || "").slice(0, 36),
        });

        if (block.type !== "Title" && block.placement !== "floating") {
          paragraphHasBody = true;
        }
      }
    );
  });

  const panel = document.querySelector(".review-issues-panel");
  const panelStyle = panel ? window.getComputedStyle(panel) : null;
  const root = document.getElementById("root");

  return {
    label,
    timestamp: new Date().toISOString(),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      rootScrollTop: root?.scrollTop ?? null,
      rootScrollLeft: root?.scrollLeft ?? null,
    },
    panel: {
      found: Boolean(panel),
      position: panelStyle?.position || null,
      rect: serializeRect(panel?.getBoundingClientRect?.()),
    },
    stageRect: serializeRect(stage?.getBoundingClientRect?.()),
    pageRect: serializeRect(page?.getBoundingClientRect?.()),
    contentRect: serializeRect(content?.getBoundingClientRect?.()),
    paragraphCount: Math.max(0, paragraphHasBody ? paragraph : paragraph - 1),
    blocks,
  };
}

export function logReviewLayoutSnapshot(snapshot) {
  if (!snapshot) return;

  console.groupCollapsed?.(`[Review Layout Debug] ${snapshot.label}`);
  console.log("layout", snapshot);
  console.table?.(snapshot.blocks);
  console.groupEnd?.();
}
