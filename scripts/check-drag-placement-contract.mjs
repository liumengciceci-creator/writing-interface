import fs from "node:fs";

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

const checks = [
  {
	  name: "paragraph heads expose one near drop line that becomes the new head",
	  pass:
	    editor.includes("function getParagraphAwareDropPlacement") &&
	    editor.includes("不再显示段间的") &&
	    editor.includes("forceLineBreakBefore: true") &&
	    editor.includes("getParagraphAwareDropPlacement(") &&
	    dragPosition.includes("resolveDropForceLineBreak"),
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
];

const failed = checks.filter((check) => !check.pass);

if (failed.length > 0) {
  failed.forEach((check) => console.error(`FAIL: ${check.name}`));
  process.exit(1);
}

console.log("drag placement regression checks passed");
