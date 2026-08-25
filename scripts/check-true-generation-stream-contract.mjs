import assert from "node:assert/strict";
import fs from "node:fs";

const serverSource = fs.readFileSync(
  new URL("../server.js", import.meta.url),
  "utf8"
);
const parserStart = serverSource.indexOf("function getBlockEchoCandidates");
const parserEnd = serverSource.indexOf("function createOrderedBlockEmitter");

assert(parserStart >= 0 && parserEnd > parserStart, "stream parser source must exist");

const parserFactory = new Function(
  `${serverSource.slice(parserStart, parserEnd)}\nreturn { createBlockStreamParser };`
)();

function runParser(expectedBlocks, fragments) {
  const events = [];
  const parser = parserFactory.createBlockStreamParser({
    expectedBlocks,
    onBlockStart: (id) => events.push({ type: "block_start", id }),
    onChunk: (id, delta) => events.push({ type: "chunk", id, delta }),
    onBlockDone: (id) => events.push({ type: "block_done", id }),
  });

  fragments.forEach((fragment) => parser.push(fragment));
  parser.flush();
  return {
    events,
    invalid: parser.getInvalidDetails(),
    valid: parser.getValidTextById(),
  };
}

const echoed = runParser(
  [{ id: "1", directive: "补充一项调查数据" }],
  ["[[BLO", "CK:1]]补充一项", "调查数据。[[/BLOCK]]"]
);
assert.deepEqual(echoed.events, [], "an echoed directive must never reach the browser");
assert.equal(echoed.invalid[0]?.reason, "unchanged_user_input");

const liveEvents = [];
const liveParser = parserFactory.createBlockStreamParser({
  expectedBlocks: [{ id: "1", directive: "补充一项调查数据" }],
  onBlockStart: (id) => liveEvents.push({ type: "block_start", id }),
  onChunk: (id, delta) => liveEvents.push({ type: "chunk", id, delta }),
  onBlockDone: (id) => liveEvents.push({ type: "block_done", id }),
});
liveParser.push("[[BLOCK:1]]一项针对城市居民的调查显示，超过半数受访者");
assert(
  liveEvents.some((event) => event.type === "chunk"),
  "a substantively different first block must stream before its closing tag"
);
assert(
  !liveEvents.some((event) => event.type === "block_done"),
  "the first chunk must be visible before the whole block is complete"
);
liveParser.push("支持这一观点。[[/BLOCK]]");
liveParser.flush();
assert.equal(liveParser.getInvalidDetails().length, 0);

const completion = runParser(
  [{
    id: "2",
    userInputMode: "completion",
    requiredPrefix: "因此，",
    userInput: "因此，",
  }],
  ["[[BLOCK:2]]因此，这一机制能够解释前述差异。[[/BLOCK]]"]
);
assert.equal(completion.invalid.length, 0, "completion may preserve its prefix only when extended");
assert.equal(completion.valid.get("2"), "因此，这一机制能够解释前述差异。");

const unchangedOriginal = runParser(
  [{ id: "3", directive: "", originalText: "原来的模块正文" }],
  ["[[BLOCK:3]]原来的模块正文[[/BLOCK]]"]
);
assert.deepEqual(
  unchangedOriginal.events,
  [],
  "an unchanged original block must also stay behind the server guard"
);

assert(
  serverSource.includes("const orderedEmitter = createOrderedBlockEmitter") &&
    serverSource.includes("pendingBlocks = pendingBlocks.filter") &&
    serverSource.includes("Only regenerate target ids") &&
    !serverSource.includes("emitBufferedBlocks"),
  "the endpoint must retry only invalid blocks and must not replay a fake stream"
);

console.log("true generation streaming regression checks passed");
