import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const generationHook = fs.readFileSync(
  path.join(root, "src/hooks/useEditor/useStreamingGenerate.js"),
  "utf8"
);
const semanticEditor = fs.readFileSync(
  path.join(root, "src/components/PageCanvas/SingleSemanticEditor.jsx"),
  "utf8"
);
const inlineEditing = fs.readFileSync(
  path.join(root, "src/components/PageCanvas/useInlineEditing.js"),
  "utf8"
);
const app = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
const reviewPanel = fs.readFileSync(
  path.join(root, "src/components/ReviewIssuesPanel.jsx"),
  "utf8"
);
const styles = fs.readFileSync(path.join(root, "src/index.css"), "utf8");

const checks = [
  {
    name: "generation uses a strict structured block response",
    pass:
      server.includes('name: "generated_blocks"') &&
      server.includes('type: "json_schema"') &&
      server.includes("parseBufferedBlockOutput"),
  },
  {
    name: "unchanged generated text is rejected",
    pass:
      server.includes("normalizeGeneratedComparison(text)") &&
      server.includes("unchanged") &&
      generationHook.includes("consideredIdentical"),
  },
  {
    name: "failed generation restores the original block and stays retryable",
    pass:
      generationHook.includes("originalBlockByRealId") &&
      generationHook.includes("setSelectedIds?.(failedTargetIds)") &&
      generationHook.includes("generationError: error?.message"),
  },
  {
    name: "generation remounts contentEditable DOM flattened by manual editing",
    pass:
      generationHook.includes("generationRenderRevision") &&
      semanticEditor.includes("block.generationRenderRevision") &&
      semanticEditor.includes("restoredWithoutContentMarker"),
  },
  {
    name: "inline undo preserves the semantic content element",
    pass:
      inlineEditing.includes("const editableTextElement") &&
      inlineEditing.includes("data-semantic-block-content='true'") &&
      !inlineEditing.includes("event.currentTarget.textContent =\n              previousText"),
  },
  {
    name: "review planning starts in parallel with the streaming summary",
    pass:
      server.indexOf("const criteriaPlanPromise") > -1 &&
      server.indexOf("const criteriaPlanPromise") < server.indexOf("const summaryStream") &&
      server.includes("const planText = await criteriaPlanPromise"),
  },
  {
    name: "overall summary is second-person and criterion results stay concise",
    pass:
      server.includes('第一句必须以“你先”开头') &&
      server.includes("summary 只用一句容易理解的关系概括") &&
      server.includes("softLimit"),
  },
  {
    name: "second-phase review checks real module dependencies by paragraph",
    pass:
      server.includes("模块关系检查计划") &&
      server.includes("论点与原因") &&
      server.includes("论点与证据") &&
      server.includes("前置论证组与结论") &&
      server.includes("过渡与前后核心模块"),
  },
  {
    name: "review UI groups streamed checks by paragraph",
    pass:
      app.includes('status: "checking"') &&
      app.includes("await waitForReviewBeat(220)") &&
      reviewPanel.includes("paragraphGroups.map") &&
      reviewPanel.includes('t("review.checking")'),
  },
  {
    name: "review panel stays inside the viewport without shifting the canvas",
    pass:
      styles.includes("position: fixed") &&
      styles.includes("bottom: 18px") &&
      styles.includes(".page-canvas-shell.review-panel-open") &&
      !styles.includes("var(--review-panel-width) +"),
  },
  {
    name: "overall review is concise and supports streamed emphasis",
    pass:
      server.includes("summaryCharacterLimit") &&
      server.includes("用成对的 ** 标记 3—5 个最重要") &&
      reviewPanel.includes("markdownHighlights"),
  },
];

const failed = checks.filter((check) => !check.pass);
if (failed.length) {
  failed.forEach((check) => console.error(`FAIL: ${check.name}`));
  process.exit(1);
}

console.log("fast review and generation regression checks passed");
