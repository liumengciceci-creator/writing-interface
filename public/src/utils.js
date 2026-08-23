export function rectsIntersect(a, b) {
  return !(
    a.x + a.width < b.x ||
    a.x > b.x + b.width ||
    a.y + a.height < b.y ||
    a.y > b.y + b.height
  );
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

export function roundZoom(value) {
  return Math.round(value * 10) / 10;
}

export function cloneBlocks(blocks) {
  return blocks.map((block) => ({ ...block }));
}