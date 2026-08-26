import fs from "node:fs";

const floating = fs.readFileSync(
  new URL("../src/hooks/useEditor/useFloatingBlocks.js", import.meta.url),
  "utf8"
);
const ai = fs.readFileSync(
  new URL("../src/hooks/useEditor/useAIActions.js", import.meta.url),
  "utf8"
);
const generation = fs.readFileSync(
  new URL("../src/hooks/useEditor/useStreamingGenerate.js", import.meta.url),
  "utf8"
);

if (!floating.includes("COMPACT_FLOATING_POINTER_ANCHOR_X = 24")) {
  throw new Error("Missing stable compact floating anchor");
}
if (floating.includes("Math.min(\n                  pointerOffsetRef.current\n                    .x,\n                  floatingWidth - 20")) {
  throw new Error("Old length-dependent compact floating anchor remains");
}
if (!ai.includes("delete nextBlock.height;")) {
  throw new Error("AI writeback still retains inline geometry");
}
if (!generation.includes("delete nextBlock.floatingWidth;")) {
  throw new Error("Generation writeback still retains inline floating geometry");
}

console.log("generated left-floating regression checks passed");
