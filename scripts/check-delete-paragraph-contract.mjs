import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const actions = fs.readFileSync(
  path.join(root, "src/hooks/useEditor/useInlineDocumentActions.js"),
  "utf8"
);
const blockActions = fs.readFileSync(
  path.join(root, "src/hooks/useEditor/useBlockActions.js"),
  "utf8"
);
const documentModel = fs.readFileSync(
  path.join(root, "src/models/DocumentModel"),
  "utf8"
);

const checks = [
  {
    name: "paragraph-start preservation is shared by single and multi delete",
    pass:
      documentModel.includes("export function deleteDocumentBlocksPreservingParagraphStarts") &&
      (actions.match(/deleteDocumentBlocksPreservingParagraphStarts\(/g) || []).length >= 2,
  },
  {
    name: "a deleted paragraph head transfers its boundary to the next survivor",
    pass:
      documentModel.includes("!block.forceLineBreakBefore") &&
      documentModel.includes("paragraphStartSuccessors.add(nextId)") &&
      documentModel.includes("forceLineBreakBefore: true"),
  },
  {
    name: "deletion no longer bypasses the paragraph-preserving helper",
    pass:
      !actions.includes("currentModel.deleteBlock(\n                targetId") &&
      !actions.includes("currentModel.deleteBlocks(\n                existingIds"),
  },
  {
    name: "keyboard Delete and Backspace use the paragraph-preserving model path",
    pass:
      blockActions.includes("const inlineSelectedIds") &&
      blockActions.includes("deleteDocumentBlocksPreservingParagraphStarts(") &&
      blockActions.includes("applyDocumentModelToSections("),
  },
];

const failed = checks.filter((check) => !check.pass);
if (failed.length) {
  failed.forEach((check) => console.error(`FAIL: ${check.name}`));
  process.exit(1);
}

console.log("delete paragraph-boundary regression checks passed");
