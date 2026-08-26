import fs from "node:fs";

const floating = fs.readFileSync(
  new URL("../src/hooks/useEditor/useFloatingBlocks.js", import.meta.url),
  "utf8"
);
const actions = fs.readFileSync(
  new URL("../src/hooks/useEditor/useBlockActions.js", import.meta.url),
  "utf8"
);
const component = fs.readFileSync(
  new URL("../src/components/PageCanvas/FloatingEditableBlock.jsx", import.meta.url),
  "utf8"
);
const debug = fs.readFileSync(
  new URL("../src/debug/leftDragDebug.js", import.meta.url),
  "utf8"
);

for (const marker of [
  "drop:resolved-block",
  "drop:outside-page-geometry",
  "drop:request-placement-update",
  "render:floating-block-list",
]) {
  if (!floating.includes(marker)) {
    throw new Error(`Missing floating debug marker: ${marker}`);
  }
}

for (const marker of [
  "state:placement-update-before",
  "state:placement-update-after",
]) {
  if (!actions.includes(marker)) {
    throw new Error(`Missing state debug marker: ${marker}`);
  }
}

if (!component.includes("render:floating-component")) {
  throw new Error("Missing floating component debug marker");
}

if (!debug.includes("window.dumpLeftDragDebug")) {
  throw new Error("Missing debug dump helper");
}

console.log("left drag debug regression checks passed");
