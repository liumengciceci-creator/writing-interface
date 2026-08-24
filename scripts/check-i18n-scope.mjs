import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const editorPath = resolve(
  process.cwd(),
  "src/components/PageCanvas/SingleSemanticEditor.jsx"
);

const source = await readFile(editorPath, "utf8");
const componentStart = source.indexOf("function SingleSemanticEditor(");
const firstEditorRef = source.indexOf("const editorRef", componentStart);

if (componentStart < 0 || firstEditorRef < 0) {
  throw new Error("Unable to locate SingleSemanticEditor component scope.");
}

const helperSection = source.slice(0, componentStart);
const componentPrelude = source.slice(componentStart, firstEditorRef);

if (helperSection.includes("useI18n()")) {
  throw new Error(
    "useI18n() must not be called from a non-React helper before SingleSemanticEditor."
  );
}

if (
  !componentPrelude.includes("blockTypeLabel") ||
  !componentPrelude.includes("t,") ||
  !componentPrelude.includes("useI18n()")
) {
  throw new Error(
    "SingleSemanticEditor must obtain blockTypeLabel and t from useI18n() at component scope."
  );
}

console.log("i18n component-scope regression checks passed");
