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
      pageCanvas.includes("handleStageDrop(event)"),
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
];

const failed = checks.filter((check) => !check.pass);

if (failed.length > 0) {
  failed.forEach((check) => console.error(`FAIL: ${check.name}`));
  process.exit(1);
}

console.log("drag placement regression checks passed");
