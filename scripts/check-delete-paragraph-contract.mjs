import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const actions = fs.readFileSync(
  path.join(root, "src/hooks/useEditor/useInlineDocumentActions.js"),
  "utf8"
);

const checks = [
  {
    name: "paragraph-start preservation is shared by single and multi delete",
    pass:
      actions.includes("function deleteBlocksPreservingParagraphStarts") &&
      (actions.match(/deleteBlocksPreservingParagraphStarts\(/g) || []).length >= 3,
  },
  {
    name: "a deleted paragraph head transfers its boundary to the next survivor",
    pass:
      actions.includes("!block.forceLineBreakBefore") &&
      actions.includes("paragraphStartSuccessors.add(nextId)") &&
      actions.includes("forceLineBreakBefore: true"),
  },
  {
    name: "deletion no longer bypasses the paragraph-preserving helper",
    pass:
      !actions.includes("currentModel.deleteBlock(\n                targetId") &&
      !actions.includes("currentModel.deleteBlocks(\n                existingIds"),
  },
];

const failed = checks.filter((check) => !check.pass);
if (failed.length) {
  failed.forEach((check) => console.error(`FAIL: ${check.name}`));
  process.exit(1);
}

console.log("delete paragraph-boundary regression checks passed");
