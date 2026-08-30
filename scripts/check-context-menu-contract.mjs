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
expectSource(canvas, /activeBlockId:[\s\S]*anchorElement: currentAnchor/, "Dialog does not follow the currently generated block");
expectSource(canvas, /borderTop:[\s\S]*1px solid #e5e7eb/, "Context actions are missing separators");
expectSource(canvas, /handleApplyInstructionToBlock\([\s\S]*onTextStart:[\s\S]*slice\(targetIndex \+ 1\)/, "Selection shadow is not retained until generated text actually starts");
expectSource(editor, /visualFocusedIdSet\.has\(blockId\)/, "Unselected blocks are not dimmed by focus group");
expectSource(editor, /contextEditingIdSet\.has\(blockId\)[\s\S]*\? "text"/, "Group text editing does not use the text cursor");
expectSource(highlight, /selected &&[\s\S]*drop-shadow[\s\S]*showingGenerationPulse/, "Generation waiting state overrides the selected shadow too early");
expectSource(composer, /isSubmitting[\s\S]*onStop/, "Instruction composer has no stop state");
expectSource(composer, /background:\s*"#ffffff"/, "Stop icon is not a white square");
expectSource(generation, /lastGenerationPrompt/, "Last generation prompt is not retained");
expectSource(generation, /regenerateBlocksFromLastPrompt/, "Regeneration does not use the retained prompt");
expectSource(generation, /contentHistory/, "Generation does not retain the previous module content");

console.log("Context menu interaction contract checks passed");
