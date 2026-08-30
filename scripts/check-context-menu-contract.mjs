import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const expectSource = (source, pattern, message) => {
  if (!pattern.test(source)) throw new Error(message);
};

const canvas = read("src/components/PageCanvas/PageCanvas.jsx");
const composer = read("src/components/PageCanvas/QuickInstructionComposer.jsx");
const editor = read("src/components/PageCanvas/SingleSemanticEditor.jsx");
const highlight = read("src/components/PageCanvas/SemanticHighlightLayer.jsx");
const generation = read("src/hooks/useEditor/useStreamingGenerate.js");

for (const key of [
  "instruction.add",
  "contextMenu.regenerate",
  "contextMenu.restorePrevious",
  "contextMenu.editText",
  "contextMenu.delete",
]) {
  expectSource(canvas, new RegExp(key.replace(".", "\\.")), `Missing context action: ${key}`);
}

expectSource(canvas, /contextInstructionIds=\{/, "Instruction focus ids are not passed to the editor");
expectSource(canvas, /contextEditingIds=\{/, "Group editing ids are not passed to the editor");
expectSource(canvas, /setContextHighlightIds\(blockContextMenu\.targetIds \|\| \[\]\)/, "Opening the instruction dialog does not freeze the selection shadow ids");
expectSource(canvas, /__ARGUWEAVE_CONTEXT_DEBUG__/, "Context instruction debug state is unavailable");
expectSource(canvas, /activeBlockId:[\s\S]*avoidElement: currentAnchor/, "Dialog does not inspect the currently generated block for overlap");
expectSource(canvas, /borderTop:[\s\S]*1px solid #e5e7eb/, "Context actions are missing separators");
expectSource(canvas, /width:\s*176[\s\S]*maxWidth:\s*"calc\(100vw - 16px\)"/, "Context menu does not use the compact fixed width");
expectSource(canvas, /function ContextMenuIcon[\s\S]*type === "instruction"[\s\S]*type === "regenerate"[\s\S]*type === "restore"[\s\S]*type === "edit"/, "Context menu action icons are missing");
expectSource(canvas, /<ContextMenuIcon type=\{item\.key\}/, "Context menu items do not render their action icons");
expectSource(canvas, /handleApplyInstructionToBlock\([\s\S]*onTextStart:[\s\S]*slice\(targetIndex \+ 1\)/, "Selection shadow is not retained until generated text actually starts");
expectSource(canvas, /setBatchInstructionEffects\(startingEffects\)[\s\S]*setTimeout\(resolve, 660\)[\s\S]*phase: "waiting"/, "Batch instructions do not reuse the single-module color transition lifecycle");
expectSource(canvas, /contextInstructionEffects=\{[\s\S]*batchInstructionEffects/, "Batch instruction color effects are not passed to inline blocks");
expectSource(canvas, /contextInstructionEffect=\{[\s\S]*contextInstructionEffect/, "Batch instruction color effects are not passed to floating blocks");
expectSource(editor, /visualFocusedIdSet\.has\(blockId\)/, "Unselected blocks are not dimmed by focus group");
expectSource(editor, /contextHighlightIds\.forEach[\s\S]*next\.add/, "Frozen context shadow ids are not rendered independently of selectedIds");
expectSource(editor, /contextEditingIdSet\.has\(blockId\)[\s\S]*\? "text"/, "Group text editing does not use the text cursor");
expectSource(highlight, /selected &&[\s\S]*drop-shadow[\s\S]*showingGenerationPulse/, "Generation waiting state overrides the selected shadow too early");
expectSource(highlight, /instructionEffects\.find[\s\S]*activeInstructionEffect\.phase/, "Inline batch targets do not render their own color transitions");
expectSource(composer, /isSubmitting[\s\S]*onStop/, "Instruction composer has no stop state");
expectSource(composer, /followAnchorResize = true[\s\S]*avoidElement = null/, "Composer has no stationary collision-avoidance mode");
expectSource(composer, /overlapsHorizontally[\s\S]*reachesPanel[\s\S]*nextTop = moduleRect\.bottom \+ 6/, "Composer does not move only when generated content overlaps it");
expectSource(composer, /background:\s*"#ffffff"/, "Stop icon is not a white square");
expectSource(generation, /lastGenerationPrompt/, "Last generation prompt is not retained");
expectSource(generation, /regenerateBlocksFromLastPrompt/, "Regeneration does not use the retained prompt");
expectSource(generation, /contentHistory/, "Generation does not retain the previous module content");

console.log("Context menu interaction contract checks passed");
