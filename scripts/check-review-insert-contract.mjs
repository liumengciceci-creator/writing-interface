import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [server, app, reviewApi, reviewCurve, reviewPanel, i18n] = await Promise.all([
  read("server.js"),
  read("src/App.jsx"),
  read("src/api/reviewBlockCompatibility.js"),
  read("src/components/PageCanvas/ActiveReviewCurve.jsx"),
  read("src/components/ReviewIssuesPanel.jsx"),
  read("src/i18n.jsx"),
]);

const checks = [
  [
    server.includes('"action":"revise或insert"') &&
      server.includes("增强建议没有固定数量") &&
      server.includes("不要设置或追求固定字数"),
    "review prompt must allow revise/insert without fixed suggestion or word counts",
  ],
  [
    server.includes("insertType 必须严格选用上方标签栏中的一个 type") &&
      server.includes("targetIndex !== sourceIndex + 1"),
    "server must validate the inserted type and the adjacent insertion gap",
  ],
  [
    app.includes("generateReviewInsertedBlockStream") &&
      app.includes('if (item.action === "insert")') &&
      app.includes("handleInsertInlineBlock"),
    "accepting an insert review must create and generate a real block",
  ],
  [
    reviewApi.includes("generateBlocksStream") &&
      reviewApi.includes("review-insert-target"),
    "inserted review blocks must reuse the validated streaming generation path",
  ],
  [
    reviewCurve.includes("createGapAnchorRect") &&
      reviewCurve.includes("issue?.insertAfterId") &&
      reviewCurve.includes("issue?.insertBeforeId"),
    "insert review curve must originate from the gap between adjacent blocks",
  ],
  [
    reviewPanel.includes('whiteSpace: "pre-wrap"') &&
      reviewPanel.includes('selectedItem.action === "insert"'),
    "review panel must preserve bullet layout and render insert suggestions",
  ],
  [
    i18n.includes('"review.insertInstruction"') &&
      i18n.includes('"review.insertPositionChanged"'),
    "insert-review UI messages must be translated",
  ],
];

const failures = checks.filter(([passed]) => !passed).map(([, message]) => message);

if (failures.length) {
  console.error("Review insert contract checks failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("review insert contract checks passed");
