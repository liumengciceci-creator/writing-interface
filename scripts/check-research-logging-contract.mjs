import fs from "node:fs";

function read(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const logger = read("src/research/researchLogger.js");
const documentLogger = read("src/research/useResearchDocumentLogger.js");
const app = read("src/App.jsx");
const history = read("src/hooks/useEditor/useHistory.js");
const generation = read("src/hooks/useEditor/useStreamingGenerate.js");
const aiActions = read("src/hooks/useEditor/useAIActions.js");
const server = read("server.js");
const languageMenu = read("src/components/LanguageMenu.jsx");

const checks = [
  [
    "logging is opt-in through an anonymous participant URL",
    logger.includes('params.get("participant")') &&
      logger.includes('params.get("pid")') &&
      logger.includes("enabled = Boolean(participantId)"),
  ],
  [
    "the browser retains a local queue and flushes on exit",
    logger.includes("pendingEvents") &&
      logger.includes("navigator.sendBeacon") &&
      logger.includes("flushResearchEvents"),
  ],
  [
    "document changes are semantic rather than pointer-move noise",
    documentLogger.includes('kind: "block_added"') &&
      documentLogger.includes('kind: "block_deleted"') &&
      documentLogger.includes('kind: "block_moved"') &&
      documentLogger.includes('kind: "block_text_changed"'),
  ],
  [
    "AI, review, instruction, undo and export actions are recorded",
    generation.includes('"ai_generation_completed"') &&
      aiActions.includes('"instruction_revision_completed"') &&
      app.includes('"review_relation_checked"') &&
      app.includes('"word_exported"') &&
      history.includes('"undo_performed"') &&
      history.includes('"redo_performed"'),
  ],
  [
    "participants can end the session and download a recovery log",
    languageMenu.includes("onFinishResearchSession") &&
      logger.includes("downloadResearchLog") &&
      logger.includes('"session_ended"'),
  ],
  [
    "the backend supports persistent ingestion and protected export",
    server.includes('app.post("/api/research-events"') &&
      server.includes('app.get("/api/research-events/export"') &&
      server.includes("SUPABASE_SECRET_KEY") &&
      server.includes("RESEARCH_EXPORT_TOKEN"),
  ],
];

const failed = checks.filter(([, pass]) => !pass);
if (failed.length > 0) {
  failed.forEach(([name]) => console.error(`FAIL: ${name}`));
  process.exit(1);
}

console.log("research logging regression checks passed");
