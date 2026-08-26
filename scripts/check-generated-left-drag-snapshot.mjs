import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../src/hooks/useEditor/useFloatingBlocks.js", import.meta.url),
  "utf8"
);

for (const marker of [
  "matchingSnapshotBlock",
  "dragStartLineFragments",
  "__dragStartPlacement",
  "usedCompactAnchor",
]) {
  if (!source.includes(marker)) {
    throw new Error(`Missing drag snapshot fix marker: ${marker}`);
  }
}

const stateFirstPattern =
  /const block\s*=\s*stateBlock\s*\|\|/;

if (stateFirstPattern.test(source)) {
  throw new Error(
    "Old stateBlock || snapshotBlock precedence still present"
  );
}

console.log(
  "generated left-drag snapshot regression checks passed"
);
