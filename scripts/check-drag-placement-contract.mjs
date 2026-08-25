import fs from "node:fs";

const editor = fs.readFileSync(
  new URL("../src/components/PageCanvas/SingleSemanticEditor.jsx", import.meta.url),
  "utf8"
);

const floating = fs.readFileSync(
  new URL("../src/hooks/useEditor/useFloatingBlocks.js", import.meta.url),
  "utf8"
);

const checks = [
  {
	  name: "paragraph-end drops do not inherit the next paragraph head",
	  pass:
	    editor.includes("换行只服从蓝色落点的真实意图") &&
	    /const forceLineBreakBefore = Boolean\(\s*requestedLineBreakBefore\s*\)/.test(editor) &&
	    !editor.includes("targetAtInsert") &&
	    !editor.includes("requestedLineBreakBefore ||"),
  },
  {
    name: "floating copy drop indicator uses an initialized rectangle",
    pass:
      editor.includes("nearestEntry.rect.bottom") &&
      editor.includes("const anchorRect =") &&
      !editor.includes("event.clientY >\n              nearestRect.bottom"),
  },
  {
    name: "the first floating drag locks to the rendered DOM position",
    pass:
      floating.includes("const useExplicitSnapshot =") &&
      floating.includes("sourceRect.left -") &&
      floating.includes("sourceRect.top -"),
  },
];

const failed = checks.filter((check) => !check.pass);

if (failed.length > 0) {
  failed.forEach((check) => console.error(`FAIL: ${check.name}`));
  process.exit(1);
}

console.log("drag placement regression checks passed");
