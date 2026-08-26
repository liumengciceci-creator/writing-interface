import fs from "node:fs";

const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../src/api/adjustBlockLength.js", import.meta.url), "utf8");
const actions = fs.readFileSync(new URL("../src/hooks/useEditor/useAIActions.js", import.meta.url), "utf8");

const required = [
  [server.includes('const LENGTH_ADJUST_MODEL ='), "dedicated length model"],
  [server.includes('stream: true'), "server true streaming"],
  [server.includes('"application/x-ndjson; charset=utf-8"'), "NDJSON response"],
  [server.includes('reasoning: {') && server.includes('effort: "low"'), "low reasoning effort"],
  [api.includes('response.body.getReader()'), "frontend stream reader"],
  [api.includes('onDelta?.('), "frontend delta callback"],
  [actions.includes('onDelta: ('), "AI action consumes real deltas"],
];

for (const [ok, label] of required) {
  if (!ok) throw new Error(`Missing ${label}`);
}

const lengthSectionStart = actions.indexOf("const handleApplyBlockLength");
const lengthSectionEnd = actions.indexOf("const handleApplyBlockStyle", lengthSectionStart);
const lengthSection = actions.slice(lengthSectionStart, lengthSectionEnd);

if (lengthSection.includes("await revealGeneratedText(")) {
  throw new Error("Length adjustment still uses fake revealGeneratedText");
}

console.log("fast length-adjustment regression checks passed");
