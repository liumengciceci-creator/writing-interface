import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(root, 'src/components/PageCanvas/useSemanticMeasurements.js');
const source = fs.readFileSync(file, 'utf8');

assert.match(
  source,
  /forceLineBreakBefore:\s*fragmentIndex === 0 &&\s*element\.dataset\s*\.forceLineBreakBefore ===\s*"true"/s,
  'forceLineBreakBefore must only be attached to fragmentIndex 0'
);

assert.match(
  source,
  /const shouldFillRow =\s*rowIndex <[\s\S]*isRightmost &&[\s\S]*!endsBeforeForcedRow/,
  'automatic wrapped rows must still fill the previous row to editorRight'
);

console.log('PASS: wrapped fragments do not inherit forceLineBreakBefore; automatic-wrap right-fill remains enabled.');
