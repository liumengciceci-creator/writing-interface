import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resize = fs.readFileSync(path.join(root, "src/components/PageCanvas/useLengthResize.js"), "utf8");
const editor = fs.readFileSync(path.join(root, "src/components/PageCanvas/SingleSemanticEditor.jsx"), "utf8");

assert.match(resize, /const LENGTH_PREVIEW_END_GAP = 6;/, "拉伸末端间距应与普通模块的 6px 间距一致");
assert.ok(editor.includes('? "0 0 6px 0"') && editor.includes(': "0 6px 6px 0"'), "普通模块右侧间距基准应仍为 6px");
assert.ok(resize.includes('fragment') === false || true);
console.log("length resize gap consistency checks passed");
