import fs from 'node:fs';

const resize = fs.readFileSync(new URL('../src/components/PageCanvas/useLengthResize.js', import.meta.url), 'utf8');
const ai = fs.readFileSync(new URL('../src/hooks/useEditor/useAIActions.js', import.meta.url), 'utf8');

const checks = [
  [
    'blank click cancels an idle resize draft',
    resize.includes('handleBlankPointerDown') &&
      resize.includes("[data-single-semantic-editor='true']") &&
      resize.includes("[data-semantic-block-id]") &&
      resize.includes('lengthResizeDraftRef.current =\n          null') &&
      resize.includes('setLengthResizeDraft(\n          null')
  ],
  [
    'successful length adjustment explicitly records one pre-write history snapshot',
    ai.includes('长度缩放本身必须作为一个独立的可撤销动作') &&
      ai.includes('pushHistorySnapshot(\n              previousSections') &&
      ai.includes('{ recordHistory: false }')
  ],
  [
    'stream helper supports disabling its automatic first-chunk snapshot',
    ai.includes('{ recordHistory = true } = {}') &&
      ai.includes('recordHistory &&\n                isFirstChunk')
  ]
];

for (const [name, ok] of checks) {
  if (!ok) {
    console.error(`FAIL: ${name}`);
    process.exit(1);
  }
}

console.log('length resize undo regression checks passed');
