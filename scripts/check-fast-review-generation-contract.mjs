import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const generationHook = fs.readFileSync(
  path.join(root, "src/hooks/useEditor/useStreamingGenerate.js"),
  "utf8"
);

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
      server.includes("summary 只用一句短判断"),
  },
];

const failed = checks.filter((check) => !check.pass);
if (failed.length) {
  failed.forEach((check) => console.error(`FAIL: ${check.name}`));
  process.exit(1);
}

console.log("fast review and generation regression checks passed");
