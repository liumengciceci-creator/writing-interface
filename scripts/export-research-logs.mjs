import fs from "node:fs/promises";
import path from "node:path";

const participantId = String(process.argv[2] || "")
  .trim()
  .replace(/[^A-Za-z0-9_-]/g, "-")
  .slice(0, 80);

if (!participantId) {
  console.error("Usage: node scripts/export-research-logs.mjs P01 [output-file]");
  process.exit(1);
}

const outputPath = path.resolve(
  process.argv[3] || `${participantId}-research-events.ndjson`
);
const apiUrl = String(process.env.RESEARCH_API_URL || "").replace(/\/$/, "");
const exportToken = String(process.env.RESEARCH_EXPORT_TOKEN || "");

if (apiUrl) {
  if (!exportToken) {
    console.error("RESEARCH_EXPORT_TOKEN is required for remote export.");
    process.exit(1);
  }
  const response = await fetch(
    `${apiUrl}/api/research-events/export?participant=${encodeURIComponent(participantId)}`,
    { headers: { Authorization: `Bearer ${exportToken}` } }
  );
  if (!response.ok) {
    console.error(`Export failed (${response.status}): ${await response.text()}`);
    process.exit(1);
  }
  await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  console.log(`Research log exported to ${outputPath}`);
  process.exit(0);
}

const logDirectory = path.resolve(
  process.env.RESEARCH_LOG_DIR || "./data/research-logs"
);
const localPath = path.join(logDirectory, `${participantId}.ndjson`);
await fs.copyFile(localPath, outputPath);
console.log(`Research log exported to ${outputPath}`);
