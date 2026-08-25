import fs from "node:fs";
import { shouldAttachDropToPreviousParagraph } from "../src/components/PageCanvas/dragPositionUtils.js";

const editor = fs.readFileSync(
  new URL("../src/components/PageCanvas/SingleSemanticEditor.jsx", import.meta.url),
  "utf8"
);

const floating = fs.readFileSync(
  new URL("../src/hooks/useEditor/useFloatingBlocks.js", import.meta.url),
  "utf8"
);

const dragPosition = fs.readFileSync(
  new URL("../src/components/PageCanvas/dragPositionUtils.js", import.meta.url),
  "utf8"
);

const duplicate = fs.readFileSync(
  new URL("../src/hooks/useEditor/useBlockDuplicate.js", import.meta.url),
  "utf8"
);

const canvasDrop = fs.readFileSync(
  new URL("../src/hooks/useEditor/useCanvasDrop.jsx", import.meta.url),
  "utf8"
);

const sidebar = fs.readFileSync(
  new URL("../src/components/Sidebar.jsx", import.meta.url),
  "utf8"
);

const pageCanvas = fs.readFileSync(
  new URL("../src/components/PageCanvas/PageCanvas.jsx", import.meta.url),
  "utf8"
);

const app = fs.readFileSync(
  new URL("../src/App.jsx", import.meta.url),
  "utf8"
);

const floatingBlock = fs.readFileSync(
  new URL("../src/components/PageCanvas/FloatingEditableBlock.jsx", import.meta.url),
  "utf8"
);

const blockActions = fs.readFileSync(
  new URL("../src/hooks/useEditor/useBlockActions.js", import.meta.url),
  "utf8"
);

const templateDrag = fs.readFileSync(
  new URL("../src/utils/templateDrag.js", import.meta.url),
  "utf8"
);

const checks = [
  {
	  name: "paragraph boundary drops distinguish the previous end from the next head",
	  pass:
	    editor.includes("function getParagraphAwareDropPlacement") &&
	    editor.includes("attachesToPreviousParagraph") &&
	    dragPosition.includes("shouldAttachDropToPreviousParagraph") &&
	    editor.includes("getParagraphAwareDropPlacement(") &&
	    dragPosition.includes("resolveDropForceLineBreak") &&
	    shouldAttachDropToPreviousParagraph(
	      310,
	      116,
	      { left: 100, right: 300, top: 100, bottom: 132, height: 32 },
	      { left: 100, right: 260, top: 170, bottom: 202, height: 32 }
	    ) &&
	    !shouldAttachDropToPreviousParagraph(
	      92,
	      184,
	      { left: 100, right: 300, top: 100, bottom: 132, height: 32 },
	      { left: 100, right: 260, top: 170, bottom: 202, height: 32 }
	    ),
  },
  {
    name: "floating copy drop indicator uses an initialized rectangle",
    pass:
      editor.includes("nearestEntry.rect.bottom") &&
      editor.includes("const anchorRect =") &&
      !editor.includes("event.clientY >\n              nearestRect.bottom"),
  },
  {
    name: "the first floating drag locks to the rendered DOM position",
    pass:
      floating.includes("const useExplicitSnapshot =") &&
      floating.includes("sourceRect.left -") &&
      floating.includes("sourceRect.top -"),
  },
  {
    name: "copied blocks expose resize only in the gray floating workspace",
    pass:
      duplicate.includes("copiedBlock.isDuplicatedCopy =") &&
      duplicate.includes("copiedBlock.hideResizeHandle =") &&
      duplicate.includes("copiedBlock.hideFloatingResizeHandle =") &&
      floating.includes("block.isDuplicatedCopy") &&
      floating.includes("item.block\n                      ?.isDuplicatedCopy") &&
      floating.includes("hideResizeHandle:\n                      false") &&
      floating.includes("hideFloatingResizeHandle:\n                      false") &&
      canvasDrop.includes("movingBlock.isDuplicatedCopy") &&
      canvasDrop.includes("movingBlock.hideResizeHandle =") &&
      canvasDrop.includes("movingBlock.hideFloatingResizeHandle ="),
  },
  {
    name: "labels can leave sidebar toward either gray workspace side",
    pass:
      sidebar.includes("Math.abs(\n                    horizontalDistance") &&
      sidebar.includes("Math.abs(\n                      event.clientX -"),
  },
  {
    name: "left gray gutter reuses the canvas drop path for labels and blocks",
    pass:
      app.includes('data-workspace-drop-zone="left-gutter"') &&
      app.includes('data-workspace-drop-ignore="true"') &&
      pageCanvas.includes("function hasWorkspaceBlockPayload") &&
      pageCanvas.includes("function isLeftWorkspaceGutterTarget") &&
      pageCanvas.includes('window.addEventListener(\n      "dragover"') &&
      pageCanvas.includes('window.addEventListener(\n      "drop"') &&
      pageCanvas.includes("handleStageDrop(event)") &&
      pageCanvas.includes("isDraggingTemplate ||") &&
      app.includes("isDraggingTemplate={"),
  },
  {
    name: "template gestures use native copy feedback and cannot leak stale drag state",
    pass:
      sidebar.includes('event.dataTransfer.effectAllowed =\n        "copy"') &&
      !sidebar.includes('data-template-copy-cue="true"') &&
      !pageCanvas.includes('data-template-drop-cue="true"') &&
      sidebar.includes('document.createElement("canvas")') &&
      sidebar.includes("context.clearRect(") &&
      sidebar.includes("dataTransfer.setDragImage(") &&
      sidebar.includes("event.clientX -\n          sourceRect.left") &&
      sidebar.includes("onTemplateDragEnd?.()") &&
      canvasDrop.includes("const cancelTemplateDrag =") &&
      app.includes("onTemplateDragEnd={") &&
      app.includes("cancelTemplateDrag"),
  },
  {
    name: "template drops recover payload data and recreate an empty editing target",
    pass:
      canvasDrop.includes("function readTemplateDragPayload(event)") &&
      canvasDrop.includes("draggingType ||\n          readTemplateDragPayload(event)") &&
      canvasDrop.includes("getActiveTemplateDragData()") &&
      templateDrag.includes("let activeTemplateDragData = null") &&
      sidebar.includes("setActiveTemplateDragData(") &&
      canvasDrop.includes("!draggedTemplate") &&
      canvasDrop.includes("normalizeSections(\n                  previousSections") &&
      canvasDrop.includes("if (draggedTemplate)"),
  },
  {
    name: "floating modules commit when released outside the stage",
    pass:
      pageCanvas.includes('window.addEventListener(\n      "mouseup"') &&
      pageCanvas.includes("stageRef.current.contains(") &&
      pageCanvas.includes("handleFloatingDrop(\n            event,\n            activeBlockId") &&
      pageCanvas.includes("onDragEnd?.()"),
  },
  {
    name: "floating drag preview keeps the type badge anchored",
    pass:
      pageCanvas.includes('const isTitleBlock =\n    block.type === "Title"') &&
      pageCanvas.includes("left: 7") &&
      pageCanvas.includes("isTitleBlock\n              ? -14\n              : -12") &&
      !pageCanvas.includes('matchesInlineAppearance\n              ? 7\n              : 0'),
  },
  {
    name: "inline drag preview keeps the real pointer anchor instead of a fixed offset",
    pass:
      floating.includes("event.clientX -\n                  sourceRect.left") &&
      floating.includes("event.clientY -\n                  sourceRect.top") &&
      !floating.includes("x: 24,\n              y: 20,"),
  },
  {
    name: "floating labels align with inline labels and resize from every edge",
    pass:
      floatingBlock.includes('direction: "nw"') &&
      floatingBlock.includes('direction: "se"') &&
      floatingBlock.includes('cursor: "ns-resize"') &&
      floatingBlock.includes('cursor: "ew-resize"') &&
      floatingBlock.includes('cursor: "nwse-resize"') &&
      floatingBlock.includes('cursor: "nesw-resize"') &&
      floatingBlock.includes("data-resize-direction=") &&
      floatingBlock.includes('background:\n                  "transparent"') &&
      floatingBlock.includes("isTitleBlock\n              ? -14\n              : -12") &&
      blockActions.includes("floatingWidthOrBounds") &&
      blockActions.includes("bounds.floatingHeight") &&
      blockActions.includes("bounds.floatingX") &&
      blockActions.includes("bounds.floatingY"),
  },
  {
    name: "floating blocks follow canvas zoom without compounding resize measurements",
    pass:
      pageCanvas.includes("zoom={zoom}") &&
      floatingBlock.includes("const visualZoom =") &&
      floatingBlock.includes("`scale(${visualZoom})`") &&
      floatingBlock.includes("resizing.zoom") &&
      floatingBlock.includes("rootRect.width /") &&
      floatingBlock.includes("rootRect.height /") &&
      floating.includes("rect.width / zoom") &&
      floating.includes("rect.height / zoom"),
  },
  {
    name: "drag previews preserve the active canvas zoom for the whole gesture",
    pass:
      pageCanvas.includes("visualScale = 1") &&
      pageCanvas.includes("`scale(${previewScale})`") &&
      pageCanvas.includes("visualScale={zoom}") &&
      floating.includes("collectInlineDragLineFragments(") &&
      floating.includes("sourceRect.width /\n                  zoom") &&
      floating.includes("sourceRect.height /\n                  zoom"),
  },
];

const failed = checks.filter((check) => !check.pass);

if (failed.length > 0) {
  failed.forEach((check) => console.error(`FAIL: ${check.name}`));
  process.exit(1);
}

console.log("drag placement regression checks passed");
