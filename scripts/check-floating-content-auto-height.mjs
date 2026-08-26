import fs from "node:fs";

const source = fs.readFileSync(
  new URL(
    "../src/components/PageCanvas/FloatingEditableBlock.jsx",
    import.meta.url
  ),
  "utf8"
);

if (!/height:\s*"auto"/m.test(source)) {
  throw new Error(
    "Floating block root must use content-driven auto height"
  );
}

if (
  !source.includes("block.floatingHeight") ||
  !source.includes("Math.max(")
) {
  throw new Error(
    "Existing floatingHeight must remain as a minimum-size constraint"
  );
}

if (
  /height:\s*block\.floatingHeight\s*\?\?/m.test(source)
) {
  throw new Error(
    "Old hard floatingHeight CSS rule still exists"
  );
}

console.log(
  "floating content auto-height regression checks passed"
);
