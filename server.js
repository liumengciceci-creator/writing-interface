console.log("=== 最新版 server.js 已启动 2026-04-06 ===");

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { fetch, ProxyAgent } from "undici";
import fs from "node:fs/promises";
import path from "node:path";

import { buildAdjustStylePrompt } from "./src/serverPrompts/adjustStylePrompt.js";
import { buildMultiBlockPrompt } from "./src/serverPrompts/multiBlockPrompt.js";

dotenv.config();

console.log("🚀 我是新的 server");
console.log(
  "OPENAI key exists:",
  !!process.env.OPENAI_API_KEY
);
console.log(
  "OPENAI key prefix:",
  process.env.OPENAI_API_KEY?.slice(0, 7)
);

const app = express();

const PORT =
  Number(process.env.PORT) ||
  3001;

const WRITING_MODEL =
  process.env.OPENAI_WRITING_MODEL ||
  "gpt-5.6";

const LENGTH_ADJUST_MODEL =
  process.env.OPENAI_LENGTH_MODEL ||
  "gpt-5.6-terra";

const WEB_SEARCH_CONTEXT_SIZE =
  process.env.OPENAI_WEB_SEARCH_CONTEXT_SIZE ||
  "medium";


const proxyUrl =
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.ALL_PROXY ||
  "";

const proxyAgent = proxyUrl
  ? new ProxyAgent(proxyUrl)
  : null;

const openaiConfig = {
  apiKey:
    process.env.OPENAI_API_KEY,
  fetch,
};

if (proxyAgent) {
  openaiConfig.fetchOptions = {
    dispatcher: proxyAgent,
  };
}

const openai =
  new OpenAI(openaiConfig);

console.log(
  "OpenAI proxy enabled:",
  Boolean(proxyAgent)
);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const RESEARCH_LOG_DIR = path.resolve(
  process.env.RESEARCH_LOG_DIR || "./data/research-logs"
);
const RESEARCH_EXPORT_TOKEN = String(
  process.env.RESEARCH_EXPORT_TOKEN || ""
).trim();
const SUPABASE_URL = String(process.env.SUPABASE_URL || "")
  .trim()
  .replace(/\/$/, "");
const SUPABASE_SECRET_KEY = String(
  process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
).trim();

/**
 * Supabase's current sb_secret_* keys are opaque API keys, not JWTs. Sending
 * them as an Authorization bearer token makes PostgREST try to parse them as
 * a JWT and reject an otherwise valid server request. Legacy service_role
 * keys are JWTs, so retain the bearer header only for that older format.
 */
function createSupabaseRestHeaders(additionalHeaders = {}) {
  const headers = {
    apikey: SUPABASE_SECRET_KEY,
    ...additionalHeaders,
  };
  const isOpaqueSupabaseKey = /^sb_(?:secret|publishable)_/i.test(
    SUPABASE_SECRET_KEY
  );
  if (!isOpaqueSupabaseKey) {
    headers.Authorization = `Bearer ${SUPABASE_SECRET_KEY}`;
  }
  return headers;
}

function normalizeResearchIdentifier(value, maxLength = 120) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .slice(0, maxLength);
}

function normalizeResearchEvent(value) {
  if (!value || typeof value !== "object") return null;
  const participantId = normalizeResearchIdentifier(value.participant_id, 80);
  const sessionId = normalizeResearchIdentifier(value.session_id, 120);
  const eventId = normalizeResearchIdentifier(value.event_id, 140);
  const eventType = String(value.event_type || "").trim().slice(0, 120);
  if (!participantId || !sessionId || !eventId || !eventType) return null;

  return {
    event_id: eventId,
    participant_id: participantId,
    session_id: sessionId,
    condition: String(value.condition || "").trim().slice(0, 80),
    sequence: Number.isFinite(Number(value.sequence))
      ? Math.max(0, Math.round(Number(value.sequence)))
      : null,
    event_type: eventType,
    action_id: normalizeResearchIdentifier(value.action_id, 140),
    target_block_ids: Array.isArray(value.target_block_ids)
      ? value.target_block_ids.map((id) => String(id).slice(0, 140)).slice(0, 120)
      : [],
    occurred_at: Number.isNaN(Date.parse(value.timestamp))
      ? new Date().toISOString()
      : new Date(value.timestamp).toISOString(),
    payload:
      value.payload && typeof value.payload === "object"
        ? value.payload
        : {},
    app_version: String(value.app_version || "").slice(0, 40),
    interface_language: String(value.interface_language || "").slice(0, 20),
    received_at: new Date().toISOString(),
  };
}

async function persistResearchEvents(events) {
  if (SUPABASE_URL && SUPABASE_SECRET_KEY) {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/research_events`,
      {
        method: "POST",
        headers: createSupabaseRestHeaders({
          "Content-Type": "application/json",
          Prefer: "resolution=ignore-duplicates,return=minimal",
        }),
        body: JSON.stringify(events),
      }
    );
    if (!response.ok) {
      throw new Error(
        `Supabase research log write failed (${response.status}): ${await response.text()}`
      );
    }
    return "supabase";
  }

  await fs.mkdir(RESEARCH_LOG_DIR, { recursive: true });
  const grouped = new Map();
  events.forEach((event) => {
    const list = grouped.get(event.participant_id) || [];
    list.push(event);
    grouped.set(event.participant_id, list);
  });
  await Promise.all(
    Array.from(grouped.entries()).map(async ([participantId, participantEvents]) => {
      const filePath = path.join(RESEARCH_LOG_DIR, `${participantId}.ndjson`);
      let existingEventIds = new Set();
      try {
        const existing = await fs.readFile(filePath, "utf8");
        existingEventIds = new Set(
          existing
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              try {
                return JSON.parse(line).event_id;
              } catch {
                return "";
              }
            })
            .filter(Boolean)
        );
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      const freshEvents = participantEvents.filter(
        (event) => !existingEventIds.has(event.event_id)
      );
      if (freshEvents.length === 0) return;
      await fs.appendFile(
        filePath,
        `${freshEvents.map((event) => JSON.stringify(event)).join("\n")}\n`,
        "utf8"
      );
    })
  );
  return "file";
}

function canExportResearchLogs(req) {
  if (!RESEARCH_EXPORT_TOKEN) {
    return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip);
  }
  const authorization = String(req.get("authorization") || "");
  return authorization === `Bearer ${RESEARCH_EXPORT_TOKEN}`;
}

/**
 * 将模块数组格式化为模型容易理解的文本。
 */
function formatBlocks(blocks = []) {
  return blocks
    .map((block) => {
      return `id: ${block.id}
type: ${block.type}
text: ${block.text || ""}
userInput: ${block.userInput || ""}
directive: ${block.directive || block.userInput || ""}
originalText: ${block.originalText || ""}
userInputMode: ${block.userInputMode || "empty"}
requiredPrefix: ${block.requiredPrefix || ""}
instruction: ${block.instruction || ""}
searchPolicy: ${block.searchPolicy || "disabled"}`;
    })
    .join("\n\n---\n\n");
}

/**
 * 清理模型返回的 JSON 文本。
 *
 * 模型有时会在 JSON 外面添加：
 * ```json
 * ...
 * ```
 *
 * 这里将代码块标记清除。
 */
function cleanModelJsonText(rawText) {
  let cleanedText = String(
    rawText || ""
  ).trim();

  if (cleanedText.startsWith("```")) {
    cleanedText = cleanedText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
  }

  return cleanedText;
}

/**
 * 将模型输出解析成 JSON。
 */
function parseModelJson(
  rawText,
  errorMessage =
    "模型没有返回有效 JSON"
) {
  const cleanedText =
    cleanModelJsonText(
      rawText
    );

  if (!cleanedText) {
    const error = new Error(
      "AI 没有返回有效文本"
    );

    error.details = rawText;

    throw error;
  }

  try {
    return JSON.parse(
      cleanedText
    );
  } catch (parseError) {
    console.error(
      "❌ 双模块 JSON 解析失败：",
      parseError
    );

    console.error(
      "模型原始输出：",
      rawText
    );

    const error = new Error(
      errorMessage
    );

    error.details = rawText;

    throw error;
  }
}

/**
 * 验证并整理一个模块。
 */
function normalizeWritingBlock(
  block,
  fieldName
) {
  if (
    !block ||
    typeof block !== "object"
  ) {
    const error = new Error(
      `缺少 ${fieldName}`
    );

    error.statusCode = 400;

    throw error;
  }

  if (block.id == null) {
    const error = new Error(
      `${fieldName} 缺少 id`
    );

    error.statusCode = 400;

    throw error;
  }

  const normalizedText =
    String(
      block.text || ""
    ).trim();

  if (!normalizedText) {
    const error = new Error(
      `${fieldName} 没有可处理的文本`
    );

    error.statusCode = 400;

    throw error;
  }

  return {
    id: block.id,

    type:
      String(
        block.type ||
          "Unknown"
      ).trim() ||
      "Unknown",

    text:
      normalizedText,
  };
}

/**
 * 验证和整理双模块请求。
 */
function normalizeMultiBlockRequest(
  body
) {
  const {
    operation,
    firstBlock,
    secondBlock,
    options = {},
  } = body || {};

  const supportedOperations =
    new Set([
      "join",
      "merge",
      "imitate",
      "relate",
    ]);

  if (
    !supportedOperations.has(
      operation
    )
  ) {
    const error = new Error(
      "不支持的双模块操作"
    );

    error.statusCode = 400;

    throw error;
  }

  const normalizedFirstBlock =
    normalizeWritingBlock(
      firstBlock,
      "firstBlock"
    );

  const normalizedSecondBlock =
    normalizeWritingBlock(
      secondBlock,
      "secondBlock"
    );

  if (
    String(
      normalizedFirstBlock.id
    ) ===
    String(
      normalizedSecondBlock.id
    )
  ) {
    const error = new Error(
      "请选择两个不同的模块"
    );

    error.statusCode = 400;

    throw error;
  }

  const normalizedOptions =
    options &&
    typeof options === "object"
      ? {
          ...options,
        }
      : {};

  /**
   * 融合长度限制到 -100 至 100。
   */
  if (
    operation === "merge"
  ) {
    normalizedOptions.length =
      Math.max(
        -100,
        Math.min(
          100,
          Number(
            normalizedOptions.length
          ) || 0
        )
      );
  }

  /**
   * 建立联系目前只支持：
   * contrast：对比
   * cause：因果
   */
 if (
  operation === "relate"
) {
  const supportedRelationTypes =
    new Set([
      "cause",
      "contrast",
      "progressive",
      "transition",
    ]);

  normalizedOptions.relationType =
    supportedRelationTypes.has(
      normalizedOptions.relationType
    )
      ? normalizedOptions.relationType
      : "contrast";
}

  return {
    operation,

    firstBlock:
      normalizedFirstBlock,

    secondBlock:
      normalizedSecondBlock,

    options:
      normalizedOptions,
  };
}

/**
 * 整理双模块操作的模型返回结果。
 *
 * 不同操作返回不同结构：
 *
 * join:
 * {
 *   text: "过渡句"
 * }
 *
 * merge:
 * {
 *   text: "融合文本"
 * }
 *
 * imitate:
 * {
 *   secondBlock: {
 *     id,
 *     text
 *   }
 * }
 *
 * relate:
 * {
 *   firstBlock: {
 *     id,
 *     text
 *   },
 *   secondBlock: {
 *     id,
 *     text
 *   }
 * }
 */
function normalizeMultiBlockResult({
  operation,
  firstBlock,
  secondBlock,
  parsed,
}) {
  if (
    !parsed ||
    typeof parsed !== "object"
  ) {
    throw new Error(
      "AI 返回的数据格式无效"
    );
  }

  /**
   * 拼接和融合只返回 text。
   */
  if (
    operation === "join" ||
    operation === "merge"
  ) {
    const text =
      String(
        parsed.text || ""
      ).trim();

    if (!text) {
      throw new Error(
        operation === "join"
          ? "AI 没有生成有效的过渡句"
          : "AI 没有生成有效的融合文本"
      );
    }

    return {
      text,
    };
  }

  /**
   * 模仿只修改第二个模块。
   */
  if (
    operation === "imitate"
  ) {
    const text =
      String(
        parsed.secondBlock
          ?.text ||
          parsed.text ||
          ""
      ).trim();

    if (!text) {
      throw new Error(
        "AI 没有生成有效的模仿文本"
      );
    }

    return {
      secondBlock: {
        id:
          parsed.secondBlock
            ?.id ??
          secondBlock.id,

        text,
      },
    };
  }

  /**
   * 建立联系同时修改两个模块。
   */
  const firstText =
    String(
      parsed.firstBlock
        ?.text ||
        ""
    ).trim();

  const secondText =
    String(
      parsed.secondBlock
        ?.text ||
        ""
    ).trim();

  if (
    !firstText ||
    !secondText
  ) {
    throw new Error(
      "AI 没有生成有效的关联文本"
    );
  }

  return {
    firstBlock: {
      id:
        parsed.firstBlock
          ?.id ??
        firstBlock.id,

      text:
        firstText,
    },

    secondBlock: {
      id:
        parsed.secondBlock
          ?.id ??
        secondBlock.id,

      text:
        secondText,
    },
  };
}

/**
 * 向 NDJSON 流中写入一行数据。
 */
function canWriteResponse(res) {
  return Boolean(
    res &&
      !res.writableEnded &&
      !res.destroyed
  );
}

function writeLine(res, payload) {
  if (!canWriteResponse(res)) {
    return false;
  }

  try {
    res.write(`${JSON.stringify(payload)}\n`);
    return true;
  } catch (error) {
    console.warn(
      "⚠️ 流式响应写入失败：",
      error?.message || error
    );
    return false;
  }
}

/**
 * 兼容新旧两种生成请求格式。
 */
function resolveTargetBlocks(body) {
  const {
    targetBlocks: rawTargetBlocks,
    contextBlocks = [],
    blocks,
  } = body;

  const targetBlocks =
    rawTargetBlocks &&
    Array.isArray(rawTargetBlocks) &&
    rawTargetBlocks.length > 0
      ? rawTargetBlocks
      : blocks;

  if (
    !targetBlocks ||
    !Array.isArray(targetBlocks) ||
    targetBlocks.length === 0
  ) {
    const error = new Error(
      "targetBlocks is required"
    );

    error.statusCode = 400;
    throw error;
  }

  const normalizedTargetIds = targetBlocks.map((block) =>
    String(block?.id ?? "").trim()
  );
  if (normalizedTargetIds.some((id) => !id)) {
    const error = new Error("Every target block must have a non-empty id");
    error.statusCode = 400;
    throw error;
  }
  if (new Set(normalizedTargetIds).size !== normalizedTargetIds.length) {
    const error = new Error("Target block ids must be unique");
    error.statusCode = 400;
    throw error;
  }

  const normalizedTargetBlocks = targetBlocks.map((block) => ({
    ...block,
    // 是否使用网页搜索完全服从前端开关，不再根据模块类型自动开启。
    searchPolicy: normalizeSearchPolicy(block?.searchPolicy),
  }));

  return {
    targetBlocks: normalizedTargetBlocks,
    contextBlocks:
      Array.isArray(contextBlocks)
        ? contextBlocks
        : [],
  };
}

function normalizeSearchPolicy(value) {
  const policy = String(value || "disabled").toLowerCase();

  if (policy === "required" || policy === "auto") {
    return policy;
  }

  return "disabled";
}

function getWebSearchMode(targetBlocks = []) {
  const policies = targetBlocks.map((block) =>
    normalizeSearchPolicy(block?.searchPolicy)
  );

  if (policies.includes("required")) return "required";
  if (policies.includes("auto")) return "auto";
  return "disabled";
}

/**
 * 真流式接口不能使用完整 JSON Schema：JSON 只有全部闭合后才能可靠解析，
 * 会把模型已经生成的第一个模块继续挡在服务器里。这里改用很小的纯文本
 * 标签协议，正文 delta 到达时即可逐块解析和下发。
 */
function buildStreamingWritingRequestOptions({
  prompt,
  targetBlocks,
}) {
  const webSearchMode = getWebSearchMode(targetBlocks);
  const options = {
    model: WRITING_MODEL,
    max_output_tokens: Math.min(
      16000,
      Math.max(4000, targetBlocks.length * 800)
    ),
    reasoning: {
      effort: webSearchMode === "required" ? "medium" : "low",
    },
    input: prompt,
    text: {
      format: {
        type: "text",
      },
    },
  };

  if (webSearchMode !== "disabled") {
    options.tools = [
      {
        type: "web_search",
        search_context_size: WEB_SEARCH_CONTEXT_SIZE,
      },
    ];
    options.tool_choice = webSearchMode === "required" ? "required" : "auto";
    options.include = ["web_search_call.action.sources"];
  }

  return options;
}

function collectWebSources(response) {
  const sourcesByUrl = new Map();

  for (const item of response?.output || []) {
    if (item?.type !== "message") continue;

    for (const content of item?.content || []) {
      if (content?.type !== "output_text") continue;

      for (const annotation of content?.annotations || []) {
        if (annotation?.type !== "url_citation") continue;

        const citation = annotation?.url_citation || annotation;
        const url = citation?.url;

        if (typeof url !== "string" || !url.startsWith("http")) {
          continue;
        }

        sourcesByUrl.set(url, {
          url,
          title:
            typeof citation?.title === "string" &&
            citation.title.trim()
              ? citation.title.trim()
              : url,
        });
      }
    }
  }

  return Array.from(sourcesByUrl.values()).slice(0, 5);
}

function getCompletedResponseText(response) {
  const directText = String(response?.output_text || "").trim();
  if (directText) return directText;

  const parts = [];

  for (const item of response?.output || []) {
    if (item?.type !== "message") continue;

    for (const content of item?.content || []) {
      if (
        content?.type === "output_text" &&
        typeof content?.text === "string"
      ) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("").trim();
}

/**
 * 普通 JSON 生成接口使用的提示词。
 */
function buildJsonPrompt({
  targetBlocks,
  contextBlocks,
}) {
  const formattedTargets =
    formatBlocks(targetBlocks);

  const formattedContext =
    formatBlocks(contextBlocks);

  return `
You are an academic writing assistant for a modular writing interface.

You will receive:
1. TARGET BLOCKS: blocks that must be generated or improved now.
2. CONTEXT BLOCKS: nearby blocks before and after the target position. These provide local semantic context and argument flow. Do NOT rewrite them.

Your task:
1. Read TARGET BLOCKS together with CONTEXT BLOCKS.
2. Generate or improve content for EACH TARGET BLOCK separately.
3. Keep the same language as the user's input.
4. If multiple TARGET BLOCKS are provided, generate them in their given order and make them coherent with each other.
5. If only one TARGET BLOCK is provided, make it fit naturally between the surrounding CONTEXT BLOCKS.
6. The generated content must be semantically consistent with the nearby context.
7. Do NOT introduce a new unrelated topic.
8. Respect the intended rhetorical role of the target block type:
   - Claim: concise academic claim
   - Evidence: concrete supporting evidence or example
   - Reason: explanation that connects ideas logically
   - Counter: counterargument or limitation
   - Conclusion: concise synthesis
   - Question: analytical or research question
9. Return JSON ONLY.
10. Do not use markdown code fences.
11. Keep the same ids as TARGET BLOCKS. Return every id as the exact string required by the response schema.
12. Do not skip any target id.
13. Do not generate results for CONTEXT BLOCKS.

Output format:
{
  "results": [
    { "id": "1", "text": "..." },
    { "id": "2", "text": "..." }
  ]
}

CONTEXT BLOCKS:
${formattedContext || "(none)"}

TARGET BLOCKS:
${formattedTargets}
`.trim();
}

/**
 * 流式生成接口使用的提示词。
 */
function buildStreamingPrompt({
  targetBlocks,
  contextBlocks,
}) {
  const formattedTargets =
    formatBlocks(targetBlocks);

  const formattedContext =
    formatBlocks(contextBlocks);

  const targetIds = targetBlocks.map((block) => block.id).join(", ");

  return `
You are a careful academic writing assistant for a modular writing interface.

You will receive:
1. TARGET BLOCKS: blocks that must be generated or improved now. Each target has a real rhetorical type, optional userInput, detailed instruction, and searchPolicy.
2. CONTEXT BLOCKS: the available article context in document order. Do NOT rewrite context blocks.

Your task:
1. The target's directive is the highest-priority writing instruction. It may be a command (such as “add data”), a topic, a partial sentence, or an existing draft. Execute its intended meaning and turn it into NEW final prose. Never print the directive itself as the answer. The type controls rhetorical form only.
2. Obey userInputMode exactly:
   - generate/instruction: execute directive as a mandatory writing requirement. If it is a command, perform it. If it is a topic or draft, rewrite it into contextually connected final prose. If it is partial, complete it. In every case, the answer must not equal directive/userInput after whitespace and terminal punctuation are ignored.
   - completion: the result MUST begin with requiredPrefix exactly as provided, then continue naturally from that exact text.
   - draft: preserve every substantive claim, named entity, fact, and topic in userInput; revise or extend it without replacing it with a different idea.
   - empty: infer the missing content from context and block type.
3. Keep the same language as the article and make the result fit naturally at the target position.
4. Read all provided context before deciding what information and length are actually needed. Stop as soon as the target function is complete.
5. Claim must remain a focused claim; Evidence must directly support the relevant claim; Reason must explain the logical mechanism; Counter must state a relevant limitation; Transition must only bridge adjacent ideas; Conclusion must synthesize all preceding context, including newly generated content.
6. A Transition should be a linking phrase or one short sentence whenever possible. It must not become a new paragraph, evidence review, or mini-conclusion.
7. A Conclusion must be rewritten from the preceding context rather than preserving an outdated conclusion.
8. If searchPolicy is required, you MUST use web search before writing. Search specifically for material that answers userInput and supports the relevant contextual claim.
9. Use a named scholar, quantitative value, study finding, date, or factual claim only when supported by a retrieved source. Never let a loosely related search result change the user's requested subject.
10. Do not place raw URLs, a bibliography, source list, Markdown links, or task commentary inside the block text. Source metadata is returned separately by the API.
11. Before writing any target, silently plan one coherent passage across ALL target blocks. Then write every requested target exactly once and in order. Never omit a target because its directive already contains text.
12. Treat the directive as an instruction to follow, not as text to preserve. Returning it unchanged is a failed answer.
13. Required target ids, in exact output order: ${targetIds}.
14. Use this exact streaming protocol and output nothing outside it:
[[BLOCK:id]]final block prose[[/BLOCK]]
Replace id with the requested id. Put each target in its own tag pair. Do not use JSON, Markdown fences, labels, analysis, source lists, or quotation marks around the answer. Never put the protocol tags inside block prose.

Example shape only:
[[BLOCK:1]]First block's final prose.[[/BLOCK]]
[[BLOCK:2]]Second block's final prose.[[/BLOCK]]

CONTEXT BLOCKS:
${formattedContext || "(none)"}

TARGET BLOCKS:
${formattedTargets}
`.trim();
}

function countWritingLength(
  value,
  lengthUnit = "characters"
) {
  const text =
    String(value || "").trim();

  if (!text) {
    return 0;
  }

  if (lengthUnit === "words") {
    return (
      text.match(
        /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu
      ) || []
    ).length;
  }

  return (
    text.match(
      /[\p{L}\p{N}]/gu
    ) || []
  ).length;
}

/**
 * 调整模块长度接口使用的提示词。
 */
function buildAdjustLengthPrompt({
  text,
  type,
  value,
  targetLength,
  lengthUnit,
}) {
  const normalizedValue = Math.max(
    -100,
    Math.min(100, Number(value) || 0)
  );

  const normalizedTargetLength =
    Number.isFinite(Number(targetLength))
      ? Math.max(1, Math.round(Number(targetLength)))
      : null;

  const normalizedLengthUnit =
    lengthUnit === "words"
      ? "words"
      : "Chinese characters";

  const originalLength =
    countWritingLength(text, lengthUnit);

  let lengthInstruction = "";

  if (normalizedTargetLength != null) {
    const difference =
      normalizedTargetLength - originalLength;

    const smallChange =
      Math.abs(difference) <=
      Math.max(3, Math.ceil(originalLength * 0.12));

    lengthInstruction = difference > 0
      ? `Expand from about ${originalLength} to about ${normalizedTargetLength} ${normalizedLengthUnit}. Add only useful clarification, reasoning, or necessary detail.`
      : difference < 0
        ? `Compress from about ${originalLength} to about ${normalizedTargetLength} ${normalizedLengthUnit}. Remove repetition and secondary wording before removing substantive reasoning.`
        : `Keep the text at about ${normalizedTargetLength} ${normalizedLengthUnit}; only improve wording where needed.`;

    if (smallChange) {
      lengthInstruction +=
        " This is a small adjustment: preserve the sentence structure and make only local additions or deletions.";
    }
  } else if (normalizedValue < 0) {
    lengthInstruction =
      `Shorten by about ${Math.abs(normalizedValue)}%. Remove repetition and nonessential detail while keeping the substantive reasoning.`;
  } else if (normalizedValue > 0) {
    lengthInstruction =
      `Expand by about ${normalizedValue}%. Add useful explanation or logical detail without adding unsupported facts.`;
  } else {
    lengthInstruction =
      "Keep approximately the same length and only improve clarity where necessary.";
  }

  return `
Rewrite this single academic-writing block.

Block role: ${type || "Unknown"}
Original:
${text}

Length task:
${lengthInstruction}

Keep the original language, meaning, rhetorical role, and academic tone. Do not introduce unrelated claims, fabricated facts, sources, or filler. When a target length is given, stay close to it (about 8% tolerance; one unit is acceptable for very short text). Output only the revised block text, with no explanation, quotation marks, labels, or Markdown.
`.trim();
}

/**
 * 执行普通 JSON 模块生成。
 */
async function generateResultsFromRequest(body) {
  const {
    targetBlocks,
    contextBlocks,
  } = resolveTargetBlocks(body);

  const prompt = buildJsonPrompt({
    targetBlocks,
    contextBlocks,
  });

  const response =
    await openai.responses.create({
      model: WRITING_MODEL,
      input: prompt,
    });

  console.log(
    "✅ OpenAI response received"
  );

  const rawText =
    response.output_text?.trim();

  console.log(
    "模型原始输出:",
    rawText
  );

  if (!rawText) {
    throw new Error(
      "Empty model output"
    );
  }

 const parsed = parseModelJson(
  rawText,
  "Model did not return valid JSON"
);

  if (
    !parsed.results ||
    !Array.isArray(parsed.results)
  ) {
    const error = new Error(
      "Model output missing results array"
    );

    error.details = parsed;
    throw error;
  }

  const targetIds = targetBlocks.map(
    (block) => block.id
  );

  const safeResults = parsed.results.map(
    (item) => ({
	      id: String(item.id ?? ""),
      text:
        typeof item.text === "string"
          ? item.text.trim()
          : "",
    })
  );

  const finalResults = targetIds.map(
    (id) => {
      const found = safeResults.find(
        (result) =>
          String(result.id) === String(id)
      );

      return {
        id,
        text: found?.text || "",
      };
    }
  );

  return {
    results: finalResults,
    targetBlocks,
    contextBlocks,
  };
}

function getBlockEchoCandidates(block = {}) {
  const rawCandidates = [
    block.directive,
    block.userInput,
    block.originalText,
    block.userInputMode === "completion" ? block.requiredPrefix : "",
  ];
  const seen = new Set();

  return rawCandidates.flatMap((value) => {
    const text = String(value || "").trim();
    const normalized = normalizeGeneratedComparison(text);
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [{ text, normalized }];
  });
}

function validateStreamedBlockText(block, value) {
  const text = String(value || "").trim();
  const normalized = normalizeGeneratedComparison(text);
  const echoCandidates = getBlockEchoCandidates(block);

  if (!normalized) {
    return { valid: false, reason: "empty" };
  }

  const echoedCandidate = echoCandidates.find(
    (candidate) => candidate.normalized === normalized
  );
  if (echoedCandidate) {
    return { valid: false, reason: "unchanged_user_input" };
  }

  const requiredPrefix = String(block?.requiredPrefix || "");
  if (
    block?.userInputMode === "completion" &&
    requiredPrefix &&
    !text.startsWith(requiredPrefix)
  ) {
    return { valid: false, reason: "missing_required_prefix" };
  }

  return { valid: true, reason: "" };
}

/**
 * 只有当当前正文已经不可能再变成“用户输入的原样副本”时才放行。
 * 模型流只会在末尾追加字符，所以一旦规范化文本与每个候选输入都出现
 * 实质分叉，之后就不可能重新变回完全相同的字符串。
 */
function canReleaseGuardedText(block, value) {
  const text = String(value || "");
  const normalized = normalizeGeneratedComparison(text);
  if (!normalized) return false;

  const requiredPrefix = String(block?.requiredPrefix || "");
  if (block?.userInputMode === "completion" && requiredPrefix) {
    if (requiredPrefix.startsWith(text)) return false;
    if (!text.startsWith(requiredPrefix)) return false;
  }

  return getBlockEchoCandidates(block).every(
    (candidate) => !candidate.normalized.startsWith(normalized)
  );
}

/**
 * 解析模型的标签协议，并在每个模块内部执行“禁止照抄”闸门。
 */
function createBlockStreamParser({
  expectedBlocks = [],
  onBlockStart = () => {},
  onChunk = () => {},
  onBlockDone = () => {},
}) {
  const START_PREFIX = "[[BLOCK:";
  const END_TAG = "[[/BLOCK]]";

  let buffer = "";
  let currentBlockId = null;
  let discardCurrentBlock = false;
  const expectedBlockById = new Map(
    expectedBlocks.map((block) => [String(block.id), block])
  );
  const encounteredIds = new Set();
  const validTextById = new Map();
  const invalidReasonById = new Map();
  let currentState = null;

  function appendCurrentText(delta) {
    if (!delta || discardCurrentBlock || !currentState) return;
    currentState.text += delta;

    if (!currentState.released) {
      if (!canReleaseGuardedText(currentState.block, currentState.text)) {
        return;
      }
      currentState.released = true;
      onBlockStart(currentBlockId);
      onChunk(currentBlockId, currentState.text);
      return;
    }

    onChunk(currentBlockId, delta);
  }

  function finishCurrentBlock() {
    if (discardCurrentBlock || !currentState) return;

    const validation = validateStreamedBlockText(
      currentState.block,
      currentState.text
    );
    if (!validation.valid) {
      invalidReasonById.set(String(currentBlockId), validation.reason);
      return;
    }

    if (!currentState.released) {
      currentState.released = true;
      onBlockStart(currentBlockId);
      onChunk(currentBlockId, currentState.text);
    }

    validTextById.set(String(currentBlockId), currentState.text.trim());
    onBlockDone(currentBlockId);
  }

  function push(deltaText) {
    if (!deltaText) return;

    buffer += deltaText;
    processBuffer();
  }

  function processBuffer(force = false) {
    while (true) {
      if (currentBlockId == null) {
        const startIndex =
          buffer.indexOf(START_PREFIX);

        if (startIndex === -1) {
          if (
            buffer.length >
            START_PREFIX.length
          ) {
            buffer = buffer.slice(
              -(START_PREFIX.length - 1)
            );
          }

          return;
        }

        if (startIndex > 0) {
          buffer =
            buffer.slice(startIndex);
        }

        const closeIndex =
          buffer.indexOf("]]");

        if (closeIndex === -1) {
          return;
        }

        const tagBody = buffer.slice(
          0,
          closeIndex + 2
        );

        const match = tagBody.match(/^\[\[BLOCK:([^\]\r\n]+)\]\]$/);

        if (!match) {
          buffer = buffer.slice(1);
          continue;
        }

        currentBlockId = String(match[1]).trim();
        const block = expectedBlockById.get(currentBlockId);
        discardCurrentBlock = !block || encounteredIds.has(currentBlockId);
        if (!discardCurrentBlock) {
          encounteredIds.add(currentBlockId);
          currentState = {
            block,
            text: "",
            released: false,
          };
        } else {
          currentState = null;
        }

        buffer = buffer.slice(
          closeIndex + 2
        );

        continue;
      }

      const endIndex =
        buffer.indexOf(END_TAG);

      if (endIndex === -1) {
        if (force) return;

        const safeLength = Math.max(
          0,
          buffer.length -
            (END_TAG.length - 1)
        );

        if (safeLength > 0) {
          const safeText =
            buffer.slice(
              0,
              safeLength
            );

          appendCurrentText(safeText);

          buffer = buffer.slice(
            safeLength
          );
        }

        return;
      }

      const textBeforeEnd =
        buffer.slice(0, endIndex);

      appendCurrentText(textBeforeEnd);

      buffer = buffer.slice(
        endIndex + END_TAG.length
      );

      finishCurrentBlock();

      currentBlockId = null;
      currentState = null;
      discardCurrentBlock = false;
    }
  }

  function flush() {
    processBuffer(true);
  }

  function getInvalidDetails() {
    return expectedBlocks.flatMap((block) => {
      const id = String(block.id);
      if (validTextById.has(id)) return [];
      return [{
        id,
        reason: invalidReasonById.get(id) || "missing_or_malformed",
      }];
    });
  }

  return {
    push,
    flush,
    getInvalidDetails,
    getValidTextById: () => new Map(validTextById),
  };
}

function normalizeGeneratedComparison(value) {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .replace(/[。！？.!?]+$/g, "")
    .trim();
}

function sanitizeServerGeneratedText(value) {
  return String(value || "")
    .replace(/\uE200?cite\uE202[^\uE201]*\uE201/g, "")
    .replace(/cite[^]*/g, "")
    .replace(/https?:\/\/[^\s<>()\[\]{}]+/gi, "")
    .replace(/www\.[^\s<>()\[\]{}]+/gi, "")
    .replace(/\b(?:[a-z0-9-]+\.)+(?:com|org|edu|gov|net|cn|io|ai|co)(?:\/[^\s<>()\[\]{}]*)?/gi, "")
    .replace(/[（(]\s*[）)]/g, "")
    .replace(/\s+([，。！？；：,.!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * 即使模型偶尔乱序返回，浏览器也只会按用户选中的模块顺序看到事件。
 * 当前模块仍在实时输出；较后的模块若提前到达，则暂存在服务器内。
 */
function createOrderedBlockEmitter(res, targetBlocks) {
  const orderedIds = targetBlocks.map((block) => String(block.id));
  const stateById = new Map(
    orderedIds.map((id) => [id, {
      started: false,
      done: false,
      emittedStart: false,
      pendingChunks: [],
    }])
  );
  let nextIndex = 0;

  function drain() {
    while (nextIndex < orderedIds.length) {
      const id = orderedIds[nextIndex];
      const state = stateById.get(id);
      if (!state?.started) return;

      if (!state.emittedStart) {
        state.emittedStart = true;
        writeLine(res, { type: "block_start", id });
      }

      while (state.pendingChunks.length) {
        writeLine(res, {
          type: "chunk",
          id,
          delta: state.pendingChunks.shift(),
        });
      }

      if (!state.done) return;
      writeLine(res, { type: "block_done", id });
      nextIndex += 1;
    }
  }

  return {
    start(id) {
      const state = stateById.get(String(id));
      if (!state) return;
      state.started = true;
      drain();
    },
    chunk(id, delta) {
      const state = stateById.get(String(id));
      if (!state || !delta) return;
      state.started = true;
      state.pendingChunks.push(String(delta));
      drain();
    },
    done(id) {
      const state = stateById.get(String(id));
      if (!state) return;
      state.started = true;
      state.done = true;
      drain();
    },
  };
}

async function generateValidatedStreamingBlocks({
  targetBlocks,
  contextBlocks,
  res,
  signal,
  isClientClosed = () => false,
}) {
  const maxAttempts = 3;
  const orderedEmitter = createOrderedBlockEmitter(res, targetBlocks);
  const completedTextById = new Map();
  const completedResponses = [];
  let pendingBlocks = [...targetBlocks];
  let lastInvalid = [];

  for (let attempt = 1; attempt <= maxAttempts && pendingBlocks.length; attempt += 1) {
    if (isClientClosed() || signal?.aborted) {
      const error = new Error("客户端已断开，生成已取消");
      error.name = "AbortError";
      throw error;
    }

    const webSearchMode = getWebSearchMode(pendingBlocks);
    if (webSearchMode !== "disabled") {
      writeLine(res, { type: "search_progress", phase: "searching", attempt });
    }

    const completedTargets = targetBlocks.filter((block) =>
      completedTextById.has(String(block.id))
    );
    const completedPassage = completedTargets.length
      ? `\n\nALREADY GENERATED TARGETS (do not output these again; use them only to keep the retry coherent):\n${formatBlocks(
          completedTargets.map((block) => ({
            ...block,
            text: completedTextById.get(String(block.id)),
            directive: "",
            userInput: "",
            originalText: "",
          }))
        )}`
      : "";
    const correctionInstruction = attempt > 1
      ? `\n\nCORRECTION REQUIRED: Only regenerate target ids ${pendingBlocks
          .map((block) => block.id)
          .join(", ")}. Their previous output was missing, malformed, empty, or exactly echoed user-supplied text. Produce genuinely new final prose and follow the tag protocol exactly.`
      : "";
    const prompt = `${buildStreamingPrompt({
      targetBlocks: pendingBlocks,
      contextBlocks,
    })}${completedPassage}${correctionInstruction}`;

    const parser = createBlockStreamParser({
      expectedBlocks: pendingBlocks,
      onBlockStart: (id) => orderedEmitter.start(id),
      onChunk: (id, delta) => orderedEmitter.chunk(id, delta),
      onBlockDone: (id) => orderedEmitter.done(id),
    });

    const stream = await openai.responses.create(
      {
        ...buildStreamingWritingRequestOptions({ prompt, targetBlocks: pendingBlocks }),
        stream: true,
      },
      signal ? { signal } : undefined
    );
    let completedResponse = null;

    for await (const event of stream) {
      if (isClientClosed() || signal?.aborted) {
        const error = new Error("生成已取消");
        error.name = "AbortError";
        throw error;
      }

      if (event.type === "response.output_text.delta") {
        parser.push(String(event.delta || ""));
        continue;
      }
      if (event.type === "response.completed") {
        completedResponse = event.response || null;
        continue;
      }
      if (
        event.type === "response.failed" ||
        event.type === "response.incomplete" ||
        event.type === "error"
      ) {
        const error = new Error(
          event?.error?.message ||
            event?.response?.error?.message ||
            "模型流未能完整生成"
        );
        error.code = "UPSTREAM_STREAM_INCOMPLETE";
        error.details = event;
        throw error;
      }
    }

    parser.flush();
    if (completedResponse) completedResponses.push(completedResponse);

    const validTextById = parser.getValidTextById();
    validTextById.forEach((text, id) => completedTextById.set(id, text));
    lastInvalid = parser.getInvalidDetails();
    const invalidIdSet = new Set(lastInvalid.map((item) => String(item.id)));
    pendingBlocks = pendingBlocks.filter((block) => invalidIdSet.has(String(block.id)));

    writeLine(res, {
      type: "debug",
      stage: "server_stream_attempt_validated",
      attempt,
      completedIds: Array.from(validTextById.keys()),
      invalid: lastInvalid,
    });

    if (webSearchMode !== "disabled") {
      writeLine(res, { type: "search_progress", phase: "completed", attempt });
    }
  }

  if (pendingBlocks.length) {
    const failedIds = pendingBlocks.map((block) => String(block.id));
    const error = new Error(
      `模型连续 ${maxAttempts} 次仍未生成有效正文：${failedIds.join(", ")}`
    );
    error.code = "GENERATION_VALIDATION_FAILED";
    error.failedIds = failedIds;
    error.details = lastInvalid;
    throw error;
  }

  return {
    textById: completedTextById,
    responses: completedResponses,
  };
}

/**
 * 普通模块生成接口。
 */
app.post(
  "/api/generate",
  async (req, res) => {
    try {
      console.log(
        "🔥 /api/generate 被调用了"
      );

      const { results } =
        await generateResultsFromRequest(
          req.body
        );

      res.json({
        results,
      });
    } catch (error) {
      console.error(
        "❌ OpenAI generate error:",
        error
      );

      res
        .status(
          error.statusCode || 500
        )
        .json({
          error:
            error.message ||
            "OpenAI request failed",

          details:
            error.details ||
            error.message,
        });
    }
  }
);
app.post(
  "/api/adjust-style",
  async (req, res) => {
    try {
      console.log(
        "🔥 /api/adjust-style 被调用了"
      );

      const {
        blockId,
        text,
        type,
        style,
        styleLabel,
        isCustom,
      } = req.body || {};

      if (blockId == null) {
        return res.status(400).json({
          error: "缺少 blockId",
        });
      }

      const normalizedText =
        String(text || "").trim();

      if (!normalizedText) {
        return res.status(400).json({
          error: "当前模块没有可调整的文本",
        });
      }

      const normalizedStyle =
        String(style || "").trim();

      if (!normalizedStyle) {
        return res.status(400).json({
          error: "请选择或输入文本风格",
        });
      }

      const prompt =
        buildAdjustStylePrompt({
          text: normalizedText,
          type: type || "Unknown",
          style: normalizedStyle,
          styleLabel:
            String(styleLabel || "").trim(),
          isCustom: isCustom === true,
        });

      let resultText = "";

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const response =
          await openai.responses.create({
            model: WRITING_MODEL,
            input:
              attempt === 1
                ? prompt
                : `${prompt}\n\nYour previous answer did not make a meaningful stylistic change. Rewrite the text again so the requested style is visibly expressed through structure, emphasis, transitions, or wording. Do not return the original text unchanged.`,
            reasoning: { effort: "low" },
          });

        resultText =
          sanitizeServerGeneratedText(
            response.output_text || ""
          )
            .replace(/^(?:修改后|改写后|修订后|调整后)\s*[:：]\s*/i, "")
            .replace(/^[“"]([\s\S]*)[”"]$/u, "$1")
            .trim();

        if (
          resultText &&
          normalizeGeneratedComparison(resultText) !==
            normalizeGeneratedComparison(normalizedText)
        ) {
          break;
        }
      }

      if (!resultText) {
        return res.status(502).json({
          error: "AI 没有返回有效文本",
        });
      }

      if (
        normalizeGeneratedComparison(resultText) ===
        normalizeGeneratedComparison(normalizedText)
      ) {
        return res.status(502).json({
          error: "模型没有实际改变文本风格，请重试或选择更明确的风格",
        });
      }

      return res.json({
        blockId,
        text: resultText,
      });
    } catch (error) {
      console.error(
        "❌ adjust-style error:",
        error
      );

      return res
        .status(error.statusCode || 500)
        .json({
          error:
            error.message ||
            "调整文本风格失败",

          details:
            error.details ||
            error.cause?.message ||
            error.message,
        });
    }
  }
);
/**
 * 调整单个模块长度接口。
 */
app.post(
  "/api/adjust-length",
  async (req, res) => {
    const {
      blockId,
      text,
      type,
      value,
      targetLength,
      lengthUnit,
    } = req.body || {};

    if (blockId == null) {
      return res.status(400).json({
        error: "缺少 blockId",
      });
    }

    const normalizedText =
      String(text || "").trim();

    if (!normalizedText) {
      return res.status(400).json({
        error: "当前模块没有可调整的文本",
      });
    }

    const normalizedValue =
      Math.max(
        -100,
        Math.min(100, Number(value) || 0)
      );

    const normalizedTargetLength =
      Number.isFinite(Number(targetLength))
        ? Math.max(1, Math.round(Number(targetLength)))
        : null;

    const normalizedLengthUnit =
      lengthUnit === "words"
        ? "words"
        : "characters";

    const prompt =
      buildAdjustLengthPrompt({
        text: normalizedText,
        type: type || "Unknown",
        value: normalizedValue,
        targetLength: normalizedTargetLength,
        lengthUnit: normalizedLengthUnit,
      });

    console.log(
      "调整长度请求参数：",
      {
        blockId,
        model: LENGTH_ADJUST_MODEL,
        type: type || "Unknown",
        value: normalizedValue,
        targetLength: normalizedTargetLength,
        lengthUnit: normalizedLengthUnit,
        originalLength:
          countWritingLength(
            normalizedText,
            normalizedLengthUnit
          ),
      }
    );

    res.setHeader(
      "Content-Type",
      "application/x-ndjson; charset=utf-8"
    );
    res.setHeader(
      "Cache-Control",
      "no-cache, no-transform"
    );
    res.setHeader(
      "Connection",
      "keep-alive"
    );
    res.setHeader(
      "X-Accel-Buffering",
      "no"
    );
    res.flushHeaders?.();

    writeLine(res, {
      type: "ready",
      blockId,
    });

    let resultText = "";

    try {
      const stream =
        await openai.responses.create({
          model:
            LENGTH_ADJUST_MODEL,

          reasoning: {
            effort: "low",
          },

          input:
            prompt,

          stream: true,
        });

      for await (const event of stream) {
        if (
          event.type !==
          "response.output_text.delta"
        ) {
          continue;
        }

        if (!canWriteResponse(res)) {
          return;
        }

        const delta =
          String(
            event.delta || ""
          );

        if (!delta) {
          continue;
        }

        resultText +=
          delta;

        writeLine(res, {
          type: "delta",
          blockId,
          delta,
        });
      }

      resultText =
        resultText.trim();

      if (!resultText) {
        throw new Error(
          "AI 没有返回有效文本"
        );
      }

      const resultWritingLength =
        countWritingLength(
          resultText,
          normalizedLengthUnit
        );

      console.log(
        "调整长度后的文本：",
        {
          resultLength:
            resultWritingLength,
          targetLength:
            normalizedTargetLength,
          lengthUnit:
            normalizedLengthUnit,
        }
      );

      if (canWriteResponse(res)) {
        writeLine(res, {
          type: "done",
          blockId,
          text: resultText,
          resultLength:
            resultWritingLength,
          targetLength:
            normalizedTargetLength,
        });

        res.end();
      }
    } catch (error) {
      console.error(
        "❌ adjust-length error:",
        error
      );

      if (!res.writableEnded) {
        writeLine(res, {
          type: "error",
          message:
            error.message ||
            "调整长度失败",
        });

        res.end();
      }
    }
  }
);

/**
 * 双模块操作接口。
 *
 * operation 支持：
 *
 * join
 * 在两个模块之间生成过渡句。
 *
 * merge
 * 将两个模块融合成一个新模块。
 *
 * imitate
 * 第二个模块模仿第一个模块的表达风格。
 *
 * relate
 * 同时修改两个模块，建立对比或因果联系。
 */
app.post(
  "/api/multi-block-operation",
  async (req, res) => {
    try {
      console.log(
        "🔥 /api/multi-block-operation 被调用了"
      );

      /**
       * 验证和整理请求参数。
       */
      const {
        operation,
        firstBlock,
        secondBlock,
        options,
      } =
        normalizeMultiBlockRequest(
          req.body
        );

      console.log(
        "双模块操作参数：",
        {
          operation,

          firstBlock: {
            id:
              firstBlock.id,

            type:
              firstBlock.type,

            textLength:
              firstBlock.text
                .length,
          },

          secondBlock: {
            id:
              secondBlock.id,

            type:
              secondBlock.type,

            textLength:
              secondBlock.text
                .length,
          },

          options,
        }
      );

      /**
       * 根据操作类型构建 Prompt。
       */
      const prompt =
        buildMultiBlockPrompt({
          operation,

          firstBlock,

          secondBlock,

          options,
        });

      console.log(
        "正在执行双模块操作：",
        operation
      );

      /**
       * 调用 OpenAI。
       */
      const response =
        await openai.responses.create({
          model: WRITING_MODEL,

          input:
            prompt,
        });

      /**
       * 读取模型原始输出。
       */
      const rawText =
        String(
          response.output_text ||
            ""
        ).trim();

      console.log(
        "双模块操作模型原始输出：",
        rawText
      );

      if (!rawText) {
        return res
          .status(500)
          .json({
            error:
              "AI 没有返回有效文本",
          });
      }

      /**
       * Prompt 要求模型返回 JSON，
       * 因此这里解析 JSON。
       */
      const parsed =
        parseModelJson(
          rawText,
          "双模块操作没有返回有效 JSON"
        );

      /**
       * 根据不同操作类型，
       * 整理最终返回格式。
       */
      const result =
        normalizeMultiBlockResult({
          operation,

          firstBlock,

          secondBlock,

          parsed,
        });

      console.log(
        "✅ 双模块操作完成：",
        {
          operation,
          result,
        }
      );

      return res.json(
        result
      );
    } catch (error) {
      console.error(
        "❌ multi-block-operation error:",
        error
      );

      return res
        .status(
          error.statusCode ||
            500
        )
        .json({
          error:
            error.message ||
            "双模块操作失败",

          details:
            error.details ||
            error.cause
              ?.message ||
            error.message,
        });
    }
  }
);

/**
 * 单请求流式论证审阅：同一次全文理解先输出可见的整体概括，随后
 * 输出并锁定关系表，再按表中顺序逐项推送判断。首屏无需等待不可见
 * 的关系表，同时逐项结果仍受完整计划约束。
 */
app.post(
  "/api/review-framework-stream",
  async (req, res) => {
    const blocks = Array.isArray(req.body?.blocks)
      ? req.body.blocks
          .filter((block) => block && block.id != null && String(block.text || "").trim())
          .map((block) => ({
            id: String(block.id),
            type: String(block.type || "Unknown"),
            text: String(block.text || "").trim(),
            paragraph: Math.max(0, Number(block.reviewParagraphIndex) || 0),
            order: Math.max(0, Number(block.reviewDocumentIndex) || 0),
            startsParagraph: block.forceLineBreakBefore === true,
          }))
      : [];

    if (blocks.length < 2) {
      return res.status(400).json({ error: "至少需要两个有效模块" });
    }
    const interfaceLanguage = req.body?.interfaceLanguage === "en" ? "en" : "zh";
    const interfaceLabelRule = interfaceLanguage === "en"
      ? "insertLabel 和 replaceLabel 必须使用英文界面标签；模块正文仍跟随用户文本语言。"
      : "insertLabel 和 replaceLabel 必须使用中文界面标签；模块正文仍跟随用户文本语言。";

    const fallbackTemplates = [
      { type: "Claim", label: "论点" },
      { type: "Reason", label: "原因" },
      { type: "Evidence", label: "证据" },
      { type: "Counter", label: "反论" },
      { type: "Compare", label: "对比" },
      { type: "Question", label: "问题" },
      { type: "Transition", label: "过渡" },
      { type: "Conclusion", label: "结论" },
    ];
    const requestedTemplates = Array.isArray(req.body?.templates)
      ? req.body.templates
          .filter((item) => item && String(item.type || "").trim())
          .map((item) => ({
            type: String(item.type || "").trim(),
            label: String(item.label || item.type || "").trim(),
          }))
      : [];
    const templates = (requestedTemplates.length ? requestedTemplates : fallbackTemplates)
      .filter(
        (item, index, items) =>
          items.findIndex((candidate) => candidate.type === item.type) === index
      );

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    writeLine(res, { type: "ready", blockIds: blocks.map((block) => block.id) });

    const validIds = new Set(blocks.map((block) => block.id));
    let overallSummary = "";
    let summaryHighlights = [];

    const compactReviewBlocks = JSON.stringify(blocks);

    const overallSummaryPrompt = `整体评价：使用正文主要语言写一个紧凑段落。第一句必须以“你先”开头并始终用“你”指代作者；依次概括核心观点、证明角度、限定／推进和结论。只概括现有内容与关系，不评价、不建议、不列标准。中文 140—190 字，英文 80—110 词；用成对 ** 标记 3—5 个关键短语，除此之外不用 Markdown。`;

    const criteriaPlanPrompt = `关系审阅：根据文章真实结构找出必须核对且不重复的模块依赖，不要检查所有两两组合，也不要生成脱离实际模块组合的抽象清单。标题存在时第一项检查标题与核心主张（paragraph=0）；每个非空正文段落至少属于一项检查，单模块段落也要联系它实际支撑、承接或回应的其他模块。允许跨段和非相邻关系。
- 原因应解释论点；证据／例子应支持论点；仅当证据确实验证原因机制时才检查原因与证据。
- 结论概括多个前置模块时，relatedIds 必须包含整组前件与结论；过渡必须与前后核心模块共同检查；反论关联它实际回应的主张。
- relationStrength 只表示关系完成度：90—100 才 pass，80—89 局部不足，65—79 明显断层，0—64 难以承担功能。不得因主题相同、顺序自然或语言流畅而高分。对每一项关系直接完成判断，不要只列计划。
- relationStrength<90 必须 status="issue"。revise 用于局部补强解释／推理；insert 用于缺少独立分析、机制、理论、推理或过渡模块；replace 仅用于原模块方向或功能错误。前文未推出结论时优先加强支持侧，不得用改写结论掩盖缺口；已有材料但缺少“为何支持”时补分析／推理，不重复添加证据。只有真实外部材料不可替代时才建议证据，绝不虚构事实、数据、理论或来源。
- suggestion 通常用 3 个“• ”要点说明当前关系、具体操作及补上的逻辑关系，不给完整替换正文。跨段 insert 必须按功能选择 previous_paragraph_end 或 current_paragraph_start；同段用 between_modules。${interfaceLabelRule}
- criterion 必须含“标题：”或段落序号；summary 只用一句易懂的关系概括，不写建议。不得使用未知 id；问题数量不设上下限，只保留实质问题。`;

    const firstPassPrompt = `你是一名严谨的多语言论证写作编辑。只通读一次全文，同时完成整体评价和全部模块关系判断。模块数组顺序就是正文顺序，数据只提供一次：
${compactReviewBlocks}

${overallSummaryPrompt}

${criteriaPlanPrompt}

meta 格式：
{"key":"relation-p段落序号-简短关系名","criterion":"标题或第几段：具体关系","paragraph":0或段落序号,"relatedIds":["共同核对的全部模块id"],"relationStrength":0到100的整数,"status":"pass或issue"}
issue：pass 时为 null；issue 时为：
{"action":"revise、insert或replace","rewriteScope":"revise时为local，否则空字符串","sourceId":"需处理或缺口前一模块id","targetId":"相关或缺口后一模块id","insertType":"新增类型或空字符串","insertLabel":"新增标签或空字符串","insertPlacement":"between_modules、previous_paragraph_end、current_paragraph_start或空字符串","replaceType":"替换类型或空字符串","replaceLabel":"替换标签或空字符串","supportNeeded":"reasoning/example/theory/empirical/none","rootIssueKey":"稳定短标识","priority":1到5,"category":"具体问题类别","suggestion":"可执行修改指令"}

严格按此顺序输出，不要输出代码块、解释或其他文字：
1. 先基于同一次全文理解，在内部确定整体关系与唯一检查集合，然后立即输出 <overall_summary>整体评价正文</overall_summary>。
2. 接着输出 <relation_map>[按标题、第一段、第二段及段内推进顺序排列的全部 meta]</relation_map>。这是本次审阅唯一一次关系识别；关闭后不得增删、重排或重新分析检查项。
3. 严格按 relation_map 顺序逐项输出；criterion_meta 必须原样复制对应 meta：
<criterion_meta>{单项 meta}</criterion_meta>
<criterion_summary>一句关系结论</criterion_summary>
<criterion_issue>{issue JSON 或 null}</criterion_issue>
4. 一项结束立即输出下一项，全部结束输出 <review_complete></review_complete>。整体评价、relation_map 与逐项结果必须来自同一次全文理解。`;

    const reviewUsesCjk = blocks.some((block) => /[\u3400-\u9fff]/.test(block.text));
    const titleBlock = blocks.find((block) => block.type.toLowerCase() === "title");

    try {
      writeLine(res, { type: "phase", phase: "summary" });
      const firstPassStream = await openai.responses.create({
        model: WRITING_MODEL,
        input: firstPassPrompt,
        reasoning: { effort: "low" },
        stream: true,
      });

      const summaryCharacterLimit = reviewUsesCjk ? 210 : 820;
      let summaryWasTruncated = false;
      let parsedPlan = null;
      let firstPassBuffer = "";
      let summaryStarted = false;
      let summaryClosed = false;
      const summaryOpenTag = "<overall_summary>";
      const summaryCloseTag = "</overall_summary>";
      const relationMapOpenTag = "<relation_map>";
      const relationMapCloseTag = "</relation_map>";
      const criterionMetaOpenTag = "<criterion_meta>";
      const criterionMetaCloseTag = "</criterion_meta>";
      const criterionSummaryOpenTag = "<criterion_summary>";
      const criterionSummaryCloseTag = "</criterion_summary>";
      const criterionIssueOpenTag = "<criterion_issue>";
      const criterionIssueCloseTag = "</criterion_issue>";
      const streamedCriterionItems = [];
      let activeCriterionMeta = null;
      let activeCriterionSummary = "";
      let criterionSummaryStarted = false;
      let criterionSummaryClosed = false;
      let relationMapClosed = false;
      let plannedRelationMap = [];
      const streamedCriterionKeys = new Set();

      const emitSummaryText = (value) => {
        const delta = String(value || "");
        if (!delta) return;
        const remaining = summaryCharacterLimit - overallSummary.length;
        if (remaining <= 0) {
          summaryWasTruncated = true;
          return;
        }
        const acceptedDelta = delta.slice(0, remaining);
        if (acceptedDelta.length < delta.length) summaryWasTruncated = true;
        overallSummary += acceptedDelta;
        if (acceptedDelta) writeLine(res, { type: "summary_delta", delta: acceptedDelta });
      };

      const emitCriterionSummaryText = (value) => {
        const delta = String(value || "");
        if (!delta || !activeCriterionMeta) return;
        activeCriterionSummary += delta;
        writeLine(res, {
          type: "criterion_summary_delta",
          key: activeCriterionMeta.key,
          delta,
        });
      };

      const normalizeCriterionMeta = (
        value,
        index,
        seenKeys
      ) => {
        const relatedIds = Array.from(new Set(
          (Array.isArray(value?.relatedIds) ? value.relatedIds : [])
            .map(String)
            .filter((id) => validIds.has(id))
        ));
        const includesTitle = Boolean(titleBlock && relatedIds.includes(titleBlock.id));
        const isTitleCriterion = includesTitle && index === 0;
        const key = isTitleCriterion
          ? "relation-title-core"
          : String(value?.key || `custom-${index + 1}`).trim();
        const criterion = String(value?.criterion || "").replace(/\s+/g, " ").trim();
        if (!key || !criterion || !relatedIds.length || seenKeys.has(key)) {
          return null;
        }
	        const relatedParagraphs = relatedIds
          .map((id) => blocks.find((block) => block.id === id)?.paragraph)
	          .map(Number)
	          .filter((paragraph) => Number.isFinite(paragraph) && paragraph > 0);
	        const requestedParagraph = Math.max(1, Math.round(Number(value?.paragraph) || 1));
	        const paragraph = isTitleCriterion
	          ? 0
	          : relatedParagraphs.includes(requestedParagraph)
	            ? requestedParagraph
	            : relatedParagraphs.length
	              ? Math.min(...relatedParagraphs)
	              : requestedParagraph;
        const requestedStatus = value?.status === "issue" ? "issue" : "pass";
        const parsedStrength = Number(value?.relationStrength);
        const relationStrength = Math.max(0, Math.min(100,
          Number.isFinite(parsedStrength)
            ? Math.round(parsedStrength)
            : requestedStatus === "issue" ? 75 : 90
        ));
        seenKeys.add(key);
        return {
          key,
          criterion,
          paragraph,
          relatedIds,
          relationStrength,
          status: requestedStatus === "issue" || relationStrength < 90 ? "issue" : "pass",
        };
      };

      const processRelationMapBuffer = () => {
        if (!summaryClosed || relationMapClosed) return;
        const mapStart = firstPassBuffer.indexOf(relationMapOpenTag);
        if (mapStart < 0) return;
        const mapEnd = firstPassBuffer.indexOf(
          relationMapCloseTag,
          mapStart + relationMapOpenTag.length
        );
        if (mapEnd < 0) return;

        const mapText = firstPassBuffer.slice(
          mapStart + relationMapOpenTag.length,
          mapEnd
        ).trim();
        const parsedMap = JSON.parse(cleanModelJsonText(mapText));
        if (!Array.isArray(parsedMap) || !parsedMap.length) {
          throw new Error("整体审阅没有返回有效关系表");
        }

        const relationMapKeys = new Set();
        plannedRelationMap = parsedMap.map((item, index) =>
          normalizeCriterionMeta(item, index, relationMapKeys)
        );
        if (plannedRelationMap.some((item) => !item)) {
          throw new Error("整体审阅关系表包含无效或重复检查项");
        }

        relationMapClosed = true;
        firstPassBuffer = firstPassBuffer.slice(
          mapEnd + relationMapCloseTag.length
        );
        writeLine(res, {
          type: "criteria_ready",
          total: plannedRelationMap.length,
        });
      };

      const sameCriterionMeta = (first, second) =>
        first?.key === second?.key &&
        first?.criterion === second?.criterion &&
        first?.paragraph === second?.paragraph &&
        first?.relationStrength === second?.relationStrength &&
        first?.status === second?.status &&
        JSON.stringify(first?.relatedIds || []) ===
          JSON.stringify(second?.relatedIds || []);

      const processCriterionBuffer = () => {
        while (summaryClosed && relationMapClosed) {
          if (!activeCriterionMeta) {
            const metaStart = firstPassBuffer.indexOf(criterionMetaOpenTag);
            if (metaStart < 0) return;
            const metaEnd = firstPassBuffer.indexOf(
              criterionMetaCloseTag,
              metaStart + criterionMetaOpenTag.length
            );
            if (metaEnd < 0) return;
            const metaText = firstPassBuffer.slice(
              metaStart + criterionMetaOpenTag.length,
              metaEnd
            ).trim();
            firstPassBuffer = firstPassBuffer.slice(metaEnd + criterionMetaCloseTag.length);
            const streamedMeta = normalizeCriterionMeta(
              JSON.parse(cleanModelJsonText(metaText)),
              streamedCriterionItems.length,
              streamedCriterionKeys
            );
            const expectedMeta =
              plannedRelationMap[streamedCriterionItems.length];
            if (
              !streamedMeta ||
              !expectedMeta ||
              !sameCriterionMeta(streamedMeta, expectedMeta)
            ) {
              throw new Error(
                "逐项审阅未严格复用已锁定的关系表"
              );
            }
            activeCriterionMeta = expectedMeta;
            activeCriterionSummary = "";
            criterionSummaryStarted = false;
            criterionSummaryClosed = false;
            if (!activeCriterionMeta) continue;
            writeLine(res, {
              type: "criterion_start",
              ...activeCriterionMeta,
              index: streamedCriterionItems.length,
              total: plannedRelationMap.length,
            });
          }

          if (!criterionSummaryStarted) {
            const summaryStart = firstPassBuffer.indexOf(criterionSummaryOpenTag);
            if (summaryStart < 0) return;
            firstPassBuffer = firstPassBuffer.slice(
              summaryStart + criterionSummaryOpenTag.length
            );
            criterionSummaryStarted = true;
          }

          if (!criterionSummaryClosed) {
            const relationSummaryEnd = firstPassBuffer.indexOf(criterionSummaryCloseTag);
            if (relationSummaryEnd < 0) {
              const safeLength = Math.max(
                0,
                firstPassBuffer.length - criterionSummaryCloseTag.length + 1
              );
              if (safeLength > 0) {
                emitCriterionSummaryText(firstPassBuffer.slice(0, safeLength));
                firstPassBuffer = firstPassBuffer.slice(safeLength);
              }
              return;
            }

            emitCriterionSummaryText(firstPassBuffer.slice(0, relationSummaryEnd));
            firstPassBuffer = firstPassBuffer.slice(
              relationSummaryEnd + criterionSummaryCloseTag.length
            );
            criterionSummaryClosed = true;
          }

          const issueStart = firstPassBuffer.indexOf(criterionIssueOpenTag);
          if (issueStart < 0) return;
          const issueEnd = firstPassBuffer.indexOf(
            criterionIssueCloseTag,
            issueStart + criterionIssueOpenTag.length
          );
          if (issueEnd < 0) return;
          const issueText = firstPassBuffer.slice(
            issueStart + criterionIssueOpenTag.length,
            issueEnd
          ).trim();
          firstPassBuffer = firstPassBuffer.slice(issueEnd + criterionIssueCloseTag.length);

          const parsedIssue = /^(?:null|none)$/i.test(issueText)
            ? null
            : JSON.parse(cleanModelJsonText(issueText));
          const rawResult = {
            ...activeCriterionMeta,
            summary: activeCriterionSummary.replace(/\s+/g, " ").trim(),
            issue: activeCriterionMeta.status === "issue" ? parsedIssue : null,
          };
          streamedCriterionItems.push(rawResult);
          writeLine(res, {
            type: "criterion_result",
            ...rawResult,
          });
          activeCriterionMeta = null;
          activeCriterionSummary = "";
          criterionSummaryStarted = false;
          criterionSummaryClosed = false;
        }
      };

      for await (const event of firstPassStream) {
        if (event.type !== "response.output_text.delta") continue;
        const delta = String(event.delta || "");
        if (!delta) continue;
        firstPassBuffer += delta;

        if (!summaryClosed && !summaryStarted) {
          const summaryStart = firstPassBuffer.indexOf(summaryOpenTag);
          if (summaryStart < 0) continue;
          summaryStarted = true;
          firstPassBuffer = firstPassBuffer.slice(summaryStart + summaryOpenTag.length);
        }

        if (!summaryClosed && summaryStarted) {
          const summaryEnd = firstPassBuffer.indexOf(summaryCloseTag);
          if (summaryEnd >= 0) {
            emitSummaryText(firstPassBuffer.slice(0, summaryEnd));
            firstPassBuffer = firstPassBuffer.slice(summaryEnd + summaryCloseTag.length);
            summaryClosed = true;
            writeLine(res, {
              type: "summary_done",
              overallSummary: overallSummary.trim(),
              summaryHighlights: [],
            });
            writeLine(res, { type: "phase", phase: "criteria", total: 0 });
          } else {
            // 保留一小段尾部，避免结束标签跨流分片时被误显示在评价文字中。
            const safeLength = Math.max(0, firstPassBuffer.length - summaryCloseTag.length + 1);
            if (safeLength > 0) {
              emitSummaryText(firstPassBuffer.slice(0, safeLength));
              firstPassBuffer = firstPassBuffer.slice(safeLength);
            }
          }
        }

        if (summaryClosed) {
          processRelationMapBuffer();
          processCriterionBuffer();
        }
      }

      if (!summaryStarted) throw new Error("整体审阅没有返回整体评价");
      if (!summaryClosed) throw new Error("整体审阅没有完整结束整体评价");
      processRelationMapBuffer();
      if (!relationMapClosed) throw new Error("整体审阅没有完整结束关系表");
      processCriterionBuffer();
      if (streamedCriterionItems.length !== plannedRelationMap.length) {
        throw new Error(
          `整体审阅关系结果不完整：仅完成 ${streamedCriterionItems.length}/${plannedRelationMap.length} 项`
        );
      }
      parsedPlan = { criteria: streamedCriterionItems };
      if (!streamedCriterionItems.length) throw new Error("整体审阅没有返回模块关系判断");

      overallSummary = overallSummary
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (summaryWasTruncated) {
        overallSummary = overallSummary.replace(/[，,；;：:\s]+$/u, "");
        const boldMarkerCount = (overallSummary.match(/\*\*/g) || []).length;
        if (boldMarkerCount % 2 === 1) overallSummary += "**";
        overallSummary += "…";
      }

      summaryHighlights = [];
      const seenCriterionKeys = new Set();
      const plannedItems = (Array.isArray(parsedPlan?.criteria) ? parsedPlan.criteria : [])
        .map((item, index) => {
          const includesTitle = Boolean(
            titleBlock && (Array.isArray(item?.relatedIds) ? item.relatedIds : [])
              .map(String)
              .includes(titleBlock.id)
          );
          const isTitleCriterion = includesTitle && index === 0;
          const key = isTitleCriterion
            ? "relation-title-core"
            : String(item?.key || `custom-${index + 1}`).trim();
          const criterion = String(item?.criterion || "").replace(/\s+/g, " ").trim();
          const relatedIds = Array.from(new Set(
            (Array.isArray(item?.relatedIds) ? item.relatedIds : [])
              .map(String)
              .filter((id) => validIds.has(id))
          ));
          if (!criterion || !relatedIds.length || seenCriterionKeys.has(key)) return null;
          seenCriterionKeys.add(key);
	          const relatedParagraphs = relatedIds
            .map((id) => blocks.find((block) => block.id === id)?.paragraph)
	            .map(Number)
	            .filter((value) => Number.isFinite(value) && value > 0);
	          const requestedParagraph = Math.max(1, Math.round(Number(item?.paragraph) || 1));
	          const paragraph = isTitleCriterion
	            ? 0
	            : relatedParagraphs.includes(requestedParagraph)
	              ? requestedParagraph
	              : relatedParagraphs.length
	                ? Math.min(...relatedParagraphs)
	                : requestedParagraph;
          return {
            key,
            criterion,
            relatedIds,
            paragraph,
            planOrder: index,
            rawResult: { ...item, key, criterion, relatedIds, paragraph },
          };
        })
        .filter(Boolean)
        .sort((first, second) => (
          first.paragraph - second.paragraph || first.planOrder - second.planOrder
        ));
      if (titleBlock && !plannedItems.some((item) => item.paragraph === 0)) {
        throw new Error("整体审阅缺少标题与核心主张的关系判断");
      }
      const plannedCriteria = plannedItems.map(({ planOrder, rawResult, ...item }) => item);
      const plannedCriterionResults = plannedItems.map((item) => item.rawResult);

      if (!plannedCriteria.length) {
        writeLine(res, {
          type: "final",
          overallSummary,
          summaryHighlights,
          criteria: [],
          enhancements: [],
        });
        writeLine(res, { type: "done" });
        return res.end();
      }

      const diagnosticPrompt = `你是一名以 GRE 论证逻辑标准审阅模块化文章的高级编辑。现在逐一检查计划中的真实模块关系。严格按计划顺序，每完成一项就立即输出一行 NDJSON，不要等待全部检查完成。

语言规则：category、criterion、summary 和 suggestion 必须使用模块正文的主要语言；${interfaceLabelRule}

模块：
${JSON.stringify(blocks, null, 2)}

第一阶段的整体概括：
${overallSummary}

已选择的检查计划：
${JSON.stringify(plannedCriteria, null, 2)}

当前已有标签（可以复用，但不是白名单）：
${JSON.stringify(templates, null, 2)}

GRE 分析性写作要求有洞察、有深度的分析，以及合乎逻辑且有说服力的理由和例子；它不要求每个主张都配实证数据。必须遵守：
- 检查重点是 relatedIds 中各模块能否形成真实的解释、支持、限定、回应、衔接或归纳关系，而不是分别评价每个模块写得好不好。
- 两个模块时明确判断前者是否承担了后者需要的关系；多个模块时判断它们组成的前置论证是否共同推出最后一个模块。
- 对过渡模块，检查它是否准确承接前一核心内容并引向后一核心内容；不能把过渡当作原因或证据。
- 对非相邻模块，只有它们确实存在直接论证依赖时才判断支持关系。
- 能靠补足推理、机制、理论运用或解释支持关系解决的问题，不得建议新增 Evidence/数据模块。
- 原文已有材料但没有解释它为什么支持主张时，应加强分析或推理，不得再添加一份证据。
- 审阅对象是模块之间的论证关系，不是单独挑剔某个模块的措辞严谨度。不要仅因为例证可以补充比较条件、概念可以定义得更细或表述可以更精确，就生成修改点；只有这些问题真实破坏了当前模块与相关主张之间的支持关系时才处理。
- 当证据已经提供了与论点相关的现象或材料，但“该材料如何推出论点”的解释缺失时，应加强已有分析／推理模块；若证据后直接连接结论且没有分析模块，则在二者之间新增“分析”或“推理”模块。不得把这种关系缺口改判为“让证据更严谨”。
- 只有涉及事实、因果、范围推广或效果判断，并且确实需要外部可验证材料才能成立时，才可建议新增证据或数据；此时 supportNeeded 必须为 "empirical"。
- 理论名称已经出现但运用不足，通常是局部加强理论分析，不等于缺少实证。
- 不得把增加“可能”“也许”、补泛泛限定、换词、调整语气或“更学术”作为独立建议。

每一项必须先给出 relationStrength（0—100 的整数），表示当前模块关系已经完成到什么程度。它不是语言质量分，也不是模型置信度，而是论证关系强度。按以下标准评分：
- 90—100：关系不仅方向正确，而且支持、解释、限定、回应或归纳已经明确且完整，没有值得单独提出的实质增强点。只有这一档可以 status="pass"。
- 80—89：关系基本成立，但支持作用、推理桥梁、理论运用或覆盖范围仍有可见缺口；必须 status="issue"，通常局部加强。
- 65—79：方向有关联，但存在显著推理断层、遗漏独立环节或支撑不足；必须 status="issue"，根据缺口选择 revise 或 insert。
- 0—64：当前材料很难承担所需功能，或方向明显错误；必须 status="issue"，根据真实情况选择 insert 或 replace。
不得因为两个模块主题相同、顺序自然或措辞流畅就给 90 分以上。评分时分别检查：前一模块是否真正完成后一模块需要的功能、关键中间推理是否显式存在、支持范围是否覆盖后续判断、多个模块共同指向结论时是否遗漏主要分支。分数只帮助判断强弱，不能机械决定动作。

若本项达到 90 分并通过，status="pass"，summary 只用一句容易理解的关系概括，例如：
- “第二段：原因解释了论点，二者关系成立”
- “第二段：证据进一步支持了该论点”
- “第二段：结论概括了前面的论点、原因和证据”
- “第三段：过渡承接前一观点并引出了后续反论”
若 relationStrength 低于 90，必须 status="issue" 并提供完整 issue；summary 也只写一句关系判断，例如“第二段：原因说明了认知投入减少，但还不能推出思辨能力弱化”。详细分析只能放入 issue.suggestion，不能塞进 summary。
summary 必须以 criterion 的分组前缀开头：标题检查使用“标题：”，段落检查使用“第几段：”（英文正文使用对应英文前缀）。随后直接说明哪些模块形成了什么关系或哪一步没有接上。只显示一个完整短句，不写 GRE 术语，不复述模块正文，不写修改建议，不列分点，不加“✓”“○”（界面会自动显示符号）。不要把补“可能”“也许”、调整语气或换词当成问题。
问题数量没有上下限；只标记真正影响论证质量的根本问题，不得为了凑数输出次要建议。

每个问题选择最合适的处理动作：
- action="revise", rewriteScope="local"：模块方向正确，但关键分析、推理、机制或支持关系不充分。保留核心内容，只加强现有模块。
- action="insert"：两个相邻模块之间缺少一个真正独立的论证功能，局部修改任何一个模块都无法清楚承担。接受后在两者之间新增模块。
- action="replace"：sourceId 模块的材料方向或论证功能本身错误，无法通过补充解释建立所需关系。接受后整块重构该模块；若需要改为理论、分析、数据、例证等另一论证功能，同时更换模块类型与标签。

动作判断必须按以下顺序进行：
1. 先判断相关模块之间需要建立什么关系，以及当前模块是否真正完成了这个功能。
2. 当前方向正确、只是解释不充分时用 revise；不要因为还能写得更丰富就 insert 或 replace。
3. 当前模块都各自合理，但两者之间缺少可独立成段的分析、机制、理论、推理或过渡时用 insert。
4. 当前材料即使补充解释也无法支撑相关主张，或当前模块承担了错误的论证功能时才用 replace。数据、理论和例子没有固定优劣；replaceType 必须由真实缺失的功能决定：证明普遍性可用数据，解释原因可用机制或理论，展示抽象观点可用例子，把证据推到结论可用分析或推理。

必须先定位“缺口属于哪一侧”，再选择 sourceId 和动作：
- 某个结论或主张尚未被前文充分推出，不等于结论模块本身写错。若结论表达的是作者要建立的核心判断，而缺的是从现有材料到该判断的中间机制、证据解释或理论分析，应修改已有的原因／分析／推理模块；没有能承载该任务的模块时，在最后一个前置模块与结论之间新增“分析”“推理”“机制”或确有必要的“证据”模块。不得为了省事直接把 sourceId 指向结论。
- 例如，前文只说明“错误信息会造成误判”，却没有说明误判为何会进一步削弱“证据意识与质疑能力”，这是前置论证缺少中间分析：优先加强已有原因／分析模块，或在结论前新增分析模块；不是改写结论措辞。
- 只有结论遗漏了前文已经建立的重要分支、曲解了前文，或在没有合理补足路径的情况下引入了与全文目标不一致的新判断，才修改结论模块。
- 已有证据方向相关但没有说明其证明作用时，缺口属于分析／推理，不属于结论；证据方向本身错误时才整块重构证据；只有外部可验证材料确实不可替代时才新增证据。
- revise 的 sourceId 必须是真正需要改变内容的模块，targetId 是它需要解释、支持、回应或归纳的相关模块。insert 的 sourceId／targetId 必须分别是缺口两侧的相邻模块。

新增模块采用开放类型：你可以复用现有标签，也可以按真实缺口新定义“理论、理论分析、机制、推理、前提、概念界定、假设、反例、综合、方法说明”等任何必要的短标签。不要受默认标签限制，也不要把所有缺口映射成原因或证据。若创建新标签，insertType 与 insertLabel 使用同一个简短、明确的显示名称；若已有标签语义完全一致，则复用已有 type 和 label，避免同义重复。insert 的 sourceId 必须是缺口前一个模块，targetId 必须是紧邻其后的模块。若二者跨段，必须根据新增模块的论证功能设置 insertPlacement：继续完成前段时用 previous_paragraph_end，开启或引导后段时用 current_paragraph_start；同段中间用 between_modules。

replace 也采用开放类型。若只是把方向错误的例子换成更合适的证据，replaceType／replaceLabel 可以仍是原证据类型；若需要把例子或证据改为理论、分析、机制、推理等不同功能，则填写新的 replaceType 与 replaceLabel。不得仅因数据看起来更正式就用数据替换例子，也不得虚构数据、理论、研究或来源。

严格按计划顺序，每项只输出一行：
{"type":"criterion_result","key":"计划中的key","criterion":"计划中的criterion","relationStrength":0到100的整数,"status":"pass或issue","summary":"可直接显示在右侧的完整判断","relatedIds":["本判断实际涉及的模块id"],"issue":null或{"action":"revise、insert或replace","rewriteScope":"revise时为local，否则空字符串","sourceId":"需加强或替换的模块id，或缺口前一模块id","targetId":"相关模块id，或缺口后一模块id","insertType":"新增时的类型，否则空字符串","insertLabel":"新增时的显示标签，否则空字符串","insertPlacement":"新增时为between_modules、previous_paragraph_end或current_paragraph_start，否则空字符串","replaceType":"替换后的模块类型，否则空字符串","replaceLabel":"替换后的显示标签，否则空字符串","supportNeeded":"reasoning/example/theory/empirical/none","rootIssueKey":"根本问题的稳定短标识","priority":1到5,"category":"具体问题类别","suggestion":"分点的可执行修改指令"}}

relationStrength>=90 且 status="pass" 时 issue 必须是 null；relationStrength<90 时 status 必须是 "issue" 且 issue 必须完整。不输出代码块、数组外壳或额外文字。

suggestion 不设字数限制，通常排版成 3 个以“• ”开头的完整要点：
- 第一条直接写“当前 A 模块说明了什么，但还没有解释／支持／推出 B 模块中的什么判断”，明确指出缺失的模块关系。
- 第二条直接写“建议加强哪个现有模块”或“建议在何处新增什么模块”，并说明它需要完成哪一步推理。
- replace 时，第二条直接说明“建议将哪个模块整块重构为哪种方向／类型”，以及新模块必须完成的论证功能；不要提供完整替换正文。
- 第三条直接写“这样可以补上哪条支持、解释、回应或归纳关系”，说明后续论点或结论如何因此获得支撑。
语言要简洁，不写“问题不在于……而在于……”“缺口属于……侧”“保留结论作为需要被论证的判断”等元分析或自我解释。重点说明模块之间尚未建立的关系以及操作指令，不单独评价措辞严谨度。每个要点必须能独立读懂；不要给出完整替换正文，也不要虚构原文没有的理论、数据、研究、来源或事实。若确需外部材料，清楚说明作者需要提供哪类材料以及它必须验证什么。`;

      const seenRootIssues = new Set();
      const completedCriteria = [];
      const enhancements = [];
      let diagnosticProtocolError = null;

      const emitCriterionStart = (index) => {
        const criterion = plannedCriteria[index];
        if (!criterion) return;
        writeLine(res, { type: "criterion_start", ...criterion, index, total: plannedCriteria.length });
      };

      const normalizeEnhancement = (enhancement, criterionItem, criterionSummary = "") => {
          let action = enhancement?.action === "insert"
            ? "insert"
            : enhancement?.action === "replace" || enhancement?.rewriteScope === "full"
              ? "replace"
              : "revise";
          let rewriteScope = action === "revise"
            ? "local"
            : "";
          let sourceId = String(enhancement?.sourceId || "");
          let targetId = String(enhancement?.targetId || "");
          if (!validIds.has(sourceId) || !validIds.has(targetId)) {
            return null;
          }

          let insertType = String(enhancement?.insertType || enhancement?.insertLabel || "").trim();
          let insertLabel = String(enhancement?.insertLabel || enhancement?.insertType || "").trim();
          let insertPlacement = String(enhancement?.insertPlacement || "").trim();
          let replaceType = String(
            enhancement?.replaceType || enhancement?.replaceLabel || ""
          ).trim();
          let replaceLabel = String(
            enhancement?.replaceLabel || enhancement?.replaceType || ""
          ).trim();
          const supportNeeded = String(enhancement?.supportNeeded || "none").trim().toLowerCase();
          let suggestion = String(enhancement?.suggestion || "")
            .replace(/[ \t]+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

          const sourceBlock = blocks.find((block) => block.id === sourceId);
          const targetBlock = blocks.find((block) => block.id === targetId);
          const relatedBlocks = (criterionItem?.relatedIds || [])
            .map((id) => blocks.find((block) => block.id === String(id)))
            .filter(Boolean)
            .sort((first, second) => first.order - second.order);
          const sourceIsConclusion = /^(?:conclusion|结论)$/i.test(
            String(sourceBlock?.type || "").trim()
          );
          const sourceIsEvidence = /evidence|data|empirical|证据|数据|实证/i.test(
            String(sourceBlock?.type || "").trim()
          );
          const targetNeedsSupport = /claim|conclusion|论点|主张|结论/i.test(
            String(targetBlock?.type || "").trim()
          );
          const missingSupportLanguage = /尚未|不能|不足以|缺少|未说明|未解释|not\s+(?:yet\s+)?(?:establish|explain|show)|does\s+not\s+(?:establish|explain|show)|insufficient\s+to|missing\s+(?:reasoning|analysis|mechanism)/i.test(
            `${criterionSummary} ${suggestion}`
          );

          // 模型偶尔会把“前置论证缺少支持”错误归到结论模块。
          // 当它已经明确要求 reasoning/theory/example/empirical 支持时，
          // 将动作重新归到支持侧，避免用户接受后只改写结论、掩盖真实缺口。
          let ownershipCorrected = false;
          if (
            action === "revise" &&
            sourceIsConclusion &&
            supportNeeded !== "none" &&
            missingSupportLanguage
          ) {
            const conclusionBlock = sourceBlock;
            const supportTypePattern = supportNeeded === "empirical"
              ? /evidence|data|empirical|证据|数据|实证/i
              : supportNeeded === "theory"
                ? /theory|理论/i
                : supportNeeded === "example"
                  ? /example|case|例子|案例|例证/i
                  : /reason|analysis|mechanism|inference|explanation|原因|分析|机制|推理|解释/i;
            const existingSupportBlock = [...relatedBlocks]
              .reverse()
              .find((block) => block.id !== conclusionBlock.id && supportTypePattern.test(block.type));

            if (existingSupportBlock) {
              sourceId = existingSupportBlock.id;
              targetId = conclusionBlock.id;
              rewriteScope = "local";
              ownershipCorrected = true;
            } else {
              const conclusionIndex = blocks.findIndex((block) => block.id === conclusionBlock.id);
              const precedingBlock = conclusionIndex > 0 ? blocks[conclusionIndex - 1] : null;
              if (precedingBlock) {
                action = "insert";
                rewriteScope = "";
                sourceId = precedingBlock.id;
                targetId = conclusionBlock.id;
                const suggestedType = supportNeeded === "empirical"
                  ? { type: "Evidence", label: reviewUsesCjk ? "证据" : "Evidence" }
                  : supportNeeded === "theory"
                    ? { type: reviewUsesCjk ? "理论" : "Theory", label: reviewUsesCjk ? "理论" : "Theory" }
                    : supportNeeded === "example"
                      ? { type: reviewUsesCjk ? "例证" : "Example", label: reviewUsesCjk ? "例证" : "Example" }
                      : { type: reviewUsesCjk ? "分析" : "Analysis", label: reviewUsesCjk ? "分析" : "Analysis" };
                insertType = suggestedType.type;
                insertLabel = suggestedType.label;
                ownershipCorrected = true;
              }
            }

          }

          // 证据方向相关、但证据与结论之间缺少解释时，新增分析关系，
          // 而不是把“进一步提高证据本身的严谨度”当作修改任务。
          if (
            !ownershipCorrected &&
            action === "revise" &&
            rewriteScope === "local" &&
            sourceIsEvidence &&
            targetNeedsSupport &&
            supportNeeded === "reasoning" &&
            missingSupportLanguage
          ) {
            const sourceIndex = blocks.findIndex((block) => block.id === sourceId);
            const targetIndex = blocks.findIndex((block) => block.id === targetId);
            const insertionTarget = targetIndex === sourceIndex + 1
              ? targetBlock
              : blocks[sourceIndex + 1]?.paragraph === sourceBlock?.paragraph
                ? blocks[sourceIndex + 1]
                : null;
            if (insertionTarget) {
              action = "insert";
              rewriteScope = "";
              targetId = insertionTarget.id;
              insertType = "Analysis";
              insertLabel = interfaceLanguage === "en" ? "Analysis" : "分析";
              ownershipCorrected = true;
            }
          }

          if (ownershipCorrected) {
            const relationText = String(criterionSummary || "")
              .replace(/^(?:标题|Title|第[^：:]{1,8}段|Paragraph\s+\d+)[：:]\s*/i, "")
              .replace(/^当前\s*/u, "")
              .replace(/[。.!！?？\s]+$/u, "")
              .trim();
            const correctedSourceBlock = blocks.find((block) => block.id === sourceId);
            const correctedSourceLabel = templates.find(
              (template) => template.type === correctedSourceBlock?.type
            )?.label || correctedSourceBlock?.type || (reviewUsesCjk ? "分析" : "analysis");
            suggestion = reviewUsesCjk
              ? `• 当前${relationText || "前置模块已经提供了相关材料，但还没有充分支持后续判断"}。\n• ${action === "insert" ? `建议在“${correctedSourceLabel}”模块之后新增“${insertLabel}”模块，具体解释现有材料如何推出后续论点或结论。` : `建议加强现有“${correctedSourceLabel}”模块，具体解释它如何连接前置材料与后续论点或结论。`}\n• 这样可以补上从现有材料到后续判断的中间推理，使两个模块形成明确的支持关系。`
              : `• Currently, ${relationText || "the preceding module provides relevant material but does not yet support the subsequent claim"}.\n• ${action === "insert" ? `Add an ${insertLabel} module after the ${correctedSourceLabel} module to explain how the existing material leads to the subsequent claim or conclusion.` : `Strengthen the existing ${correctedSourceLabel} module so it explicitly connects the preceding material to the subsequent claim or conclusion.`}\n• This adds the missing inferential step and establishes a clear support relation between the modules.`;
          }

          if (action === "insert") {
            const sourceIndex = blocks.findIndex((block) => block.id === sourceId);
            const targetIndex = blocks.findIndex((block) => block.id === targetId);
            if (targetIndex !== sourceIndex + 1 || !insertType || !insertLabel) return null;

            const normalizedSourceBlock = blocks[sourceIndex];
            const normalizedTargetBlock = blocks[targetIndex];
            const crossesParagraphBoundary =
              normalizedTargetBlock?.startsParagraph === true &&
              normalizedSourceBlock?.paragraph !== normalizedTargetBlock?.paragraph;

            if (crossesParagraphBoundary) {
              if (
                insertPlacement !== "previous_paragraph_end" &&
                insertPlacement !== "current_paragraph_start"
              ) {
                // 跨段新增必须有明确归属。模型遗漏时按本项主要评价的段落
                // 兜底，而不是只看数组索引。
                insertPlacement =
                  Number(criterionItem?.paragraph) ===
                  Number(normalizedTargetBlock?.paragraph)
                    ? "current_paragraph_start"
                    : "previous_paragraph_end";
              }
            } else {
              insertPlacement = "between_modules";
            }

            const evidenceLike = /evidence|empirical|data|证据|数据|实证/i.test(
              `${insertType} ${insertLabel}`
            );
            if (evidenceLike && supportNeeded !== "empirical") return null;
          }

          if (action === "replace") {
            if (!replaceType || !replaceLabel) {
              replaceType = String(sourceBlock?.type || "").trim();
              replaceLabel = templates.find(
                (template) => template.type === sourceBlock?.type
              )?.label || replaceType;
            }
            if (!replaceType || !replaceLabel) return null;
            replaceType = replaceType.slice(0, 32);
            replaceLabel = replaceLabel.slice(0, 20);
            const dataReplacement = /(?:^|\b)(?:data|empirical)(?:\b|$)|数据|实证/i.test(
              `${replaceType} ${replaceLabel}`
            );
            if (dataReplacement && supportNeeded !== "empirical") return null;
          }

          const rootIssueKey = String(
            enhancement?.rootIssueKey ||
              `${criterionItem?.key || "criterion"}:${sourceId}:${targetId}:${action}`
          ).trim();
          if (seenRootIssues.has(rootIssueKey)) return null;
          seenRootIssues.add(rootIssueKey);

          return {
            ...enhancement,
            action,
            rewriteScope,
            sourceId,
            targetId,
            insertType: action === "insert" ? insertType : "",
            insertLabel: action === "insert" ? insertLabel : "",
            insertPlacement: action === "insert" ? insertPlacement : "",
            replaceType: action === "replace" ? replaceType : "",
            replaceLabel: action === "replace" ? replaceLabel : "",
            supportNeeded,
            rootIssueKey,
            priority: Math.max(1, Math.min(5, Number(enhancement?.priority) || 3)),
            criterionKey: criterionItem?.key || "",
            criterion: criterionItem?.criterion || "",
            suggestion,
          };
      };

      const emitCriterionResultLine = (
        rawLine,
        { emitEvents = true } = {}
      ) => {
        const line = String(rawLine || "")
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/```$/, "")
          .trim();
        if (!line) return;

        try {
          const parsed = JSON.parse(line);
          if (parsed?.type !== "criterion_result") return;
          const expected = plannedCriteria[completedCriteria.length];
          if (!expected || String(parsed.key || "") !== expected.key) return;

          const requestedStatus = parsed.status === "issue" ? "issue" : "pass";
          const parsedStrength = Number(parsed.relationStrength);
          const relationStrength = Math.max(
            0,
            Math.min(
              100,
              Number.isFinite(parsedStrength)
                ? Math.round(parsedStrength)
                : requestedStatus === "issue" ? 75 : 90
            )
          );
          const status = requestedStatus === "issue" || relationStrength < 90
            ? "issue"
            : "pass";
          const relatedIds = Array.from(new Set(
            (Array.isArray(parsed.relatedIds) ? parsed.relatedIds : expected.relatedIds)
              .map(String)
              .filter((id) => validIds.has(id))
          ));
          const rawSummary = String(parsed.summary || "").replace(/\s+/g, " ").trim();
          if (!rawSummary) return;
          const groupPrefix = String(expected.criterion || "").match(
            /^([^：:]{1,24})[：:]/
          )?.[1];
          const prefixedSummary = groupPrefix && !rawSummary.startsWith(groupPrefix)
            ? `${groupPrefix}：${rawSummary.replace(/^(?:标题|Title|第[^：:]{1,8}段|Paragraph\s+\d+)[：:]\s*/i, "")}`
            : rawSummary;
          const containsCjk = /[\u3400-\u9fff]/.test(prefixedSummary);
          const softLimit = containsCjk ? 64 : 150;
          const summary = prefixedSummary.length > softLimit
            ? `${prefixedSummary.slice(0, softLimit).replace(/[，,；;：:\s]+$/u, "")}…`
            : prefixedSummary;

          const issue = status === "issue"
            ? normalizeEnhancement(parsed.issue, expected, summary)
            : null;
          if (status === "issue" && !issue) {
            diagnosticProtocolError = new Error(
              `检查项 ${expected.key} 的修改意见不完整`
            );
            return;
          }
          const normalizedStatus = issue ? "issue" : "pass";
          const result = {
            key: expected.key,
            criterion: expected.criterion,
            paragraph: expected.paragraph,
            status: normalizedStatus,
            relationStrength: normalizedStatus === "issue"
              ? Math.min(relationStrength, 89)
              : relationStrength,
            summary,
            relatedIds: relatedIds.length ? relatedIds : expected.relatedIds,
            issue,
          };
          completedCriteria.push(result);
          if (issue) enhancements.push(issue);
          if (emitEvents) {
            emitCriterionStart(completedCriteria.length - 1);
            writeLine(res, { type: "criterion_result", ...result });
          }
        } catch (error) {
          console.warn("跳过无法解析的 GRE 检查流行：", line, error.message);
        }
      };

      // 关系判断与整体评价来自同一次模型调用。这里仅校验并按既定顺序
      // 发送模型已经生成的结果，不再把全文交给第二个模型请求重复识别。
      plannedCriterionResults.forEach((item) => {
        emitCriterionResultLine(JSON.stringify({
          ...item,
          type: "criterion_result",
        }), { emitEvents: false });
      });
      if (diagnosticProtocolError) throw diagnosticProtocolError;
      if (completedCriteria.length !== plannedCriteria.length) {
        throw new Error(
          `审阅结果不完整：仅完成 ${completedCriteria.length}/${plannedCriteria.length} 项检查`
        );
      }

      writeLine(res, {
        type: "criteria_final",
        total: completedCriteria.length,
        criteria: completedCriteria,
        enhancements,
      });

      writeLine(res, {
        type: "final",
        overallSummary,
        summaryHighlights,
        criteria: completedCriteria,
        enhancements,
      });
      writeLine(res, { type: "done" });
      return res.end();
    } catch (error) {
      console.error("❌ review-framework-stream error:", error);
      if (!res.writableEnded) {
        writeLine(res, { type: "error", message: error.message || "整体审阅失败" });
        res.end();
      }
    }
  }
);

/**
 * 用户点开某个增强点后，针对真实的两个模块再次调用模型，
 * 将详细判断按模型输出进度直接流给前端。
 */
app.post(
  "/api/review-enhancement-detail-stream",
  async (req, res) => {
    const body = req.body || {};
    const sourceBlock = body.sourceBlock && typeof body.sourceBlock === "object"
      ? {
          id: String(body.sourceBlock.id || "source"),
          type: String(body.sourceBlock.type || "Unknown"),
          text: String(body.sourceBlock.text || "").trim(),
        }
      : null;
    const targetBlock = body.targetBlock && typeof body.targetBlock === "object"
      ? {
          id: String(body.targetBlock.id || "target"),
          type: String(body.targetBlock.type || "Unknown"),
          text: String(body.targetBlock.text || "").trim(),
        }
      : null;

    if (!sourceBlock?.text || !targetBlock?.text) {
      return res.status(400).json({ error: "缺少需要详细审阅的模块内容" });
    }

    const issue = {
      category: String(body.issue?.category || "内容关系把关"),
      criterion: String(body.issue?.criterion || "检查两个模块之间的内容关系"),
      summary: String(body.issue?.summary || body.issue?.comment || "").trim(),
      suggestion: String(body.issue?.suggestion || "").trim(),
      action: body.issue?.action === "replace" ? "replace" : body.issue?.action === "insert" ? "insert" : "revise",
      rewriteScope: body.issue?.action === "replace" || body.issue?.rewriteScope === "full" ? "full" : "local",
      replaceType: String(body.issue?.replaceType || body.issue?.suggestedModule?.type || "").trim(),
      replaceLabel: String(body.issue?.replaceLabel || body.issue?.suggestedModule?.label || "").trim(),
    };
    const contextBlocks = Array.isArray(body.contextBlocks)
      ? body.contextBlocks
          .filter((block) => block && String(block.text || "").trim())
          .slice(0, 16)
          .map((block) => ({
            id: String(block.id || ""),
            type: String(block.type || "Unknown"),
            text: String(block.text || "").trim(),
          }))
      : [];

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    writeLine(res, { type: "ready" });

    const prompt = `你是一名严谨的多语言论证写作编辑。用户刚刚点开一条潜在修改点，请重新阅读相关模块和上下文，给出真正针对内容的详细意见。

需要加强的模块：
${JSON.stringify(sourceBlock, null, 2)}

与它直接相关的模块：
${JSON.stringify(targetBlock, null, 2)}

所选内容的上下文：
${JSON.stringify(contextBlocks, null, 2)}

初步检查结果：
${JSON.stringify(issue, null, 2)}

输出要求：
1. 直接输出给作者看的意见，并严格使用与原文相同的主要语言；不要根据界面语言翻译内容，不要输出 JSON、Markdown、标题符号或思考过程。
2. 不设置字数限制。用几句长度适中、彼此自然承接的话说明当前具体不足、为何构成问题、应怎样调整现有表述，以及调整后哪一步推理会变得成立。不要把“保留、补足、区分、重组、说明、再把”等多个操作压进一个长句，也不要把材料和命令堆成密集清单。内容较复杂时可用“• ”分成少量完整要点，但不得写成标签、短语串或互不衔接的命令；不要机械列出固定标题，也不要让所有意见套用同一句式。
3. 必须具体说明这两个模块的内容如何关联，不能只说“可以加强”或复述模块标签。
4. 按 GRE 分析性写作的核心论证标准从现有文本内部把关：主张能否由理由推出，是否缺少关键中间推理或因果机制；已有证据是否真正支撑主张并得到解释；多个理由是否共同推进分析而非重复结论；反论是否击中并回应关键前提；结论是否由前文推出。优先诊断论证结构与推理，不做一般语言润色。
5. action="revise" 时建议局部加强，保留原模块的核心内容和可用材料；action="insert" 时说明需要在两个模块之间新增什么独立论证环节；action="replace" 时说明当前模块为什么无法承担所需功能，并要求将它整块重构为 replaceLabel 指定的方向，不能用一两句连接语掩盖方向错误。
6. 不得把加入“可能”“也许”“一定程度上”等缓和词、补充泛泛限定、调整语气、替换词语或“让表达更学术”作为建议。只有措辞直接造成逻辑错误时才可提及，而且必须说明它破坏了哪条推理关系。结论过强时，应修复主张与理由或证据的匹配，而不是只弱化语气。
7. 不得虚构新的数据、研究、文献、来源、案例或外部事实。若 action="insert" 或 action="replace" 确实需要新的理论、数据、例证或分析方向，可以明确要求作者补充哪类材料、它必须建立什么关系，但不得替作者编造具体材料；若无需外部材料，则优先利用现有内容重建论证关系。
8. 不得自行发明原文没有建立的阅读情境、使用条件、行为后果或中间事实。只有证据本来就在支持同一主张的不同必要环节时，才说明证明分工；如果证据方向与当前主张不一致，必须要求重构该证据模块，不能替它另找一个子主张。`;

    try {
      const stream = await openai.responses.create({
        model: WRITING_MODEL,
        input: prompt,
        reasoning: { effort: "low" },
        stream: true,
      });

      for await (const event of stream) {
        if (event.type !== "response.output_text.delta") continue;
        if (!canWriteResponse(res)) return;
        writeLine(res, { type: "delta", delta: String(event.delta || "") });
      }

      if (canWriteResponse(res)) {
        writeLine(res, { type: "done" });
        res.end();
      }
    } catch (error) {
      console.error("❌ review-enhancement-detail-stream error:", error);
      if (!res.writableEnded) {
        writeLine(res, { type: "error", message: error.message || "详细审阅失败" });
        res.end();
      }
    }
  }
);

/**
 * 用户接受一条论证修改指令后，才根据指令重写对应模块。
 * 审阅阶段只负责诊断和给指令，不提前生成替换文本。
 */
app.post(
  "/api/apply-review-instruction",
  async (req, res) => {
    try {
      const body = req.body || {};
      const sourceBlock = body.sourceBlock && typeof body.sourceBlock === "object"
        ? {
            id: String(body.sourceBlock.id || "source"),
            type: String(body.sourceBlock.type || "Unknown"),
            text: String(body.sourceBlock.text || "").trim(),
          }
        : null;
      const targetBlock = body.targetBlock && typeof body.targetBlock === "object"
        ? {
            id: String(body.targetBlock.id || "target"),
            type: String(body.targetBlock.type || "Unknown"),
            text: String(body.targetBlock.text || "").trim(),
          }
        : null;
      const instruction = String(body.instruction || "").trim();
      const action = body.action === "replace" || body.rewriteScope === "full"
        ? "replace"
        : "revise";
      const rewriteScope = action === "replace" ? "full" : "local";
      const replaceType = String(body.replaceType || sourceBlock?.type || "").trim();
      const replaceLabel = String(body.replaceLabel || replaceType).trim();
      const contextBlocks = Array.isArray(body.contextBlocks)
        ? body.contextBlocks
            .filter((block) => block && String(block.text || "").trim())
            .slice(0, 18)
            .map((block) => ({
              id: String(block.id || ""),
              type: String(block.type || "Unknown"),
              text: String(block.text || "").trim(),
            }))
        : [];

      if (!sourceBlock?.text || !targetBlock?.text || !instruction) {
        return res.status(400).json({ error: "缺少执行修改指令所需的模块或指令" });
      }

      const scopeRequirement = action === "replace"
        ? `本条意见已经判定来源模块的方向或论证功能错误。将整个模块重构为“${replaceLabel || replaceType}”模块，并按照 ${replaceType || replaceLabel} 的论证功能生成全新内容；删除无法支持相关主张的原有材料，不必保留原句结构。若该方向必须提供真实数据、研究或理论来源，而上下文没有这些材料，绝对不得编造；请输出一个明确的方括号材料槽，准确写明作者需要补充什么以及它必须证明什么。`
        : `本条意见只需要局部加强。保留原模块的核心观点、可用材料、句子骨架和大部分措辞，只在必要位置补足推理、解释证据作用或修复模块关系，不得整段另写。`;

      const basePrompt = `你是一名严谨的多语言论证写作编辑。现在作者已经接受了一条修改指令，请按照该指令重写“需要修改的模块”。

需要修改的模块：
${JSON.stringify(sourceBlock, null, 2)}

与它直接相关的模块：
${JSON.stringify(targetBlock, null, 2)}

所选内容上下文：
${JSON.stringify(contextBlocks, null, 2)}

作者接受的修改指令：
${instruction}

执行要求：
1. 输出修改后的来源模块全文，只输出可直接写回模块的正文，不输出标题、解释、修改说明、Markdown或引号。
2. 按 GRE 分析性写作的核心论证标准执行指令，只处理它指出的主张与理由不匹配、关键推理缺失、因果机制断裂、证据作用未解释、反论未回应或结论未由前文推出等实质问题；不要把修改指令复述进正文。
3. ${scopeRequirement}
4. 只能使用来源模块、相关模块和上下文已经出现的信息。不得新增论文、数据、研究、文献、来源、案例、外部事实、新论点或新模块；材料不足时不得假装获得了不存在的支撑。
5. 保持原文语言。action=${action}；${action === "replace" ? `输出必须承担“${replaceLabel || replaceType}”模块的功能，不再受原模块类型约束。` : "保持原模块类型。"}不得把增加“可能”等缓和词或一般语言润色当作完成指令。`;

      let revisedText = "";
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const response = await openai.responses.create({
          model: WRITING_MODEL,
          input: attempt === 1
            ? basePrompt
            : action === "replace"
              ? `${basePrompt}\n\n上一次输出与原文相同，但本条意见要求整块重构。请真正删除不支持相关主张的内容并重新完成该模块的论证功能；没有实际证据时使用明确的方括号证据槽，不得编造。`
              : `${basePrompt}\n\n上一次输出与原文相同。请只在必要位置作出清楚可见的局部调整，解决指令指出的问题，但不要整段重写或添加任何新材料。`,
          reasoning: { effort: "low" },
          max_output_tokens: 1800,
        });

        revisedText = sanitizeServerGeneratedText(getCompletedResponseText(response))
          .replace(/^(?:修改后|改写后|修订后|建议文本)\s*[:：]\s*/i, "")
          .trim();

        if (
          revisedText &&
          normalizeGeneratedComparison(revisedText) !==
            normalizeGeneratedComparison(sourceBlock.text)
        ) {
          break;
        }
      }

      if (
        !revisedText ||
        normalizeGeneratedComparison(revisedText) ===
          normalizeGeneratedComparison(sourceBlock.text)
      ) {
        const error = new Error("模型未能按照修改指令产生有效新内容");
        error.statusCode = 502;
        throw error;
      }

      return res.json({ text: revisedText });
    } catch (error) {
      console.error("❌ apply-review-instruction error:", error);
      return res.status(error.statusCode || 500).json({
        error: error.message || "执行修改指令失败",
      });
    }
  }
);

/**
 * 接受审阅指令后的模块改写流。
 *
 * 模型推理期间前端保持目标模块闪烁；服务端确认结果有效后，才以小段
 * 增量写回画布，避免无效或与原文相同的内容覆盖用户文本。
 */
app.post(
  "/api/apply-review-instruction-stream",
  async (req, res) => {
    const body = req.body || {};
    const sourceBlock = body.sourceBlock && typeof body.sourceBlock === "object"
      ? {
          id: String(body.sourceBlock.id || "source"),
          type: String(body.sourceBlock.type || "Unknown"),
          text: String(body.sourceBlock.text || "").trim(),
        }
      : null;
    const targetBlock = body.targetBlock && typeof body.targetBlock === "object"
      ? {
          id: String(body.targetBlock.id || "target"),
          type: String(body.targetBlock.type || "Unknown"),
          text: String(body.targetBlock.text || "").trim(),
        }
      : null;
    const instruction = String(body.instruction || "").trim();
    const action = body.action === "replace" || body.rewriteScope === "full"
      ? "replace"
      : "revise";
    const rewriteScope = action === "replace" ? "full" : "local";
    const replaceType = String(body.replaceType || sourceBlock?.type || "").trim();
    const replaceLabel = String(body.replaceLabel || replaceType).trim();
    const contextBlocks = Array.isArray(body.contextBlocks)
      ? body.contextBlocks
          .filter((block) => block && String(block.text || "").trim())
          .slice(0, 18)
          .map((block) => ({
            id: String(block.id || ""),
            type: String(block.type || "Unknown"),
            text: String(block.text || "").trim(),
          }))
      : [];

    if (!sourceBlock?.text || !targetBlock?.text || !instruction) {
      return res.status(400).json({ error: "缺少执行修改指令所需的模块或指令" });
    }

    const scopeRequirement = action === "replace"
      ? `本条意见已经判定来源模块的方向或论证功能错误。将整个模块重构为“${replaceLabel || replaceType}”模块，并按照 ${replaceType || replaceLabel} 的论证功能生成全新内容；删除无法支持相关主张的原有材料，不必保留原句结构。若该方向必须提供真实数据、研究或理论来源，而上下文没有这些材料，绝对不得编造；请输出一个明确的方括号材料槽，准确写明作者需要补充什么以及它必须证明什么。`
      : `本条意见只需要局部加强。保留原模块的核心观点、可用材料、句子骨架和大部分措辞，只在必要位置补足推理、解释证据作用或修复模块关系，不得整段另写。`;

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    writeLine(res, { type: "ready", blockId: sourceBlock.id });

    const basePrompt = `你是一名严谨的多语言论证写作编辑。作者已经接受了一条审阅修改指令，请按照该指令重写“需要修改的模块”。

需要修改的模块：
${JSON.stringify(sourceBlock, null, 2)}

与它直接相关的模块：
${JSON.stringify(targetBlock, null, 2)}

所选内容上下文：
${JSON.stringify(contextBlocks, null, 2)}

作者接受的修改指令：
${instruction}

执行要求：
1. 输出修改后的来源模块全文，只输出可直接写回模块的正文，不输出标题、解释、修改说明、Markdown或引号。
2. 按 GRE 分析性写作的核心论证标准识别指令针对的具体缺口，例如主张无法由理由推出、关键中间推理或因果机制缺失、已有证据与观点的支持关系未解释、多个理由只是重复结论、反论没有回应关键前提，或结论没有由前文推出。
3. ${scopeRequirement}
4. 不要把修改指令复述进正文，也不得把增加“可能”等缓和词或一般语言润色当作完成指令。
5. 只能使用来源模块、相关模块和上下文已经出现的信息。不得新增论文、数据、研究、文献、来源、案例、外部事实、新论点或新模块；材料不足时不得假装获得了不存在的支撑。
6. 保持原文语言。action=${action}；${action === "replace" ? `输出必须承担“${replaceLabel || replaceType}”模块的功能，不再受原模块类型约束。` : "保持原模块类型。"}`;

    try {
      let revisedText = "";

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        let rawText = "";
        const stream = await openai.responses.create({
          model: WRITING_MODEL,
          input: attempt === 1
            ? basePrompt
            : action === "replace"
              ? `${basePrompt}\n\n上一次输出与原文相同，但本条意见要求整块重构。请真正删除不支持相关主张的内容并重新完成该模块的论证功能；没有实际证据时使用明确的方括号证据槽，不得编造。`
              : `${basePrompt}\n\n上一次输出与原文相同。请在必要位置作出清楚可见的局部调整，解决指令指出的问题，但不要整段重写或加入任何新材料。`,
          reasoning: { effort: "low" },
          max_output_tokens: 1800,
          stream: true,
        });

        for await (const event of stream) {
          if (event.type === "response.output_text.delta") {
            rawText += String(event.delta || "");
          }
        }

        revisedText = sanitizeServerGeneratedText(rawText)
          .replace(/^(?:修改后|改写后|修订后|建议文本)\s*[:：]\s*/i, "")
          .trim();

        if (
          revisedText &&
          normalizeGeneratedComparison(revisedText) !==
            normalizeGeneratedComparison(sourceBlock.text)
        ) {
          break;
        }
      }

      if (
        !revisedText ||
        normalizeGeneratedComparison(revisedText) ===
          normalizeGeneratedComparison(sourceBlock.text)
      ) {
        throw new Error("模型未能按照修改指令产生有效新内容");
      }

      if (!canWriteResponse(res)) return;
      writeLine(res, { type: "text_start", blockId: sourceBlock.id });

      const characters = Array.from(revisedText);
      for (let index = 0; index < characters.length; index += 3) {
        if (!canWriteResponse(res)) return;
        writeLine(res, {
          type: "delta",
          blockId: sourceBlock.id,
          delta: characters.slice(index, index + 3).join(""),
        });
        await new Promise((resolve) => setTimeout(resolve, 18));
      }

      if (canWriteResponse(res)) {
        writeLine(res, {
          type: "done",
          blockId: sourceBlock.id,
          text: revisedText,
        });
        res.end();
      }
    } catch (error) {
      console.error("❌ apply-review-instruction-stream error:", error);
      if (!res.writableEnded) {
        writeLine(res, {
          type: "error",
          message: error.message || "执行修改指令失败",
        });
        res.end();
      }
    }
  }
);

/**
 * 论证框架与模块关系审阅接口。
 *
 * reviewMode === "argumentFramework"：
 * 通读全部模块，为每个模块生成一句概括，并分析整体论证是否合理。
 *
 * 其他情况：
 * 审阅一条具体的模块关系，并在确有必要时给出内容加强版本。
 */
app.post(
  "/api/review-block-compatibility",
  async (req, res) => {
    try {
      const body = req.body || {};

      if (body.reviewMode === "argumentFramework") {
        const blocks = Array.isArray(body.blocks)
          ? body.blocks
              .filter((block) => block && block.id != null)
              .map((block) => ({
                id: String(block.id),
                type: String(block.type || "Unknown"),
                text: String(block.text || "").trim(),
              }))
          : [];
        const relations = Array.isArray(body.relations) ? body.relations : [];

        if (blocks.length === 0) {
          return res.status(400).json({ error: "没有可审阅的模块" });
        }

        const prompt = `你是一名严谨的多语言论证写作编辑。请通读所有模块，并完成以下任务。所有概括、关系、总结和建议必须使用与模块正文相同的主要语言；不要根据界面语言翻译作者内容。

任务一：概括每个模块
- 必须理解内容后重新概括，不能照抄原句。
- 每个概括只保留一个核心判断，15至28个汉字，绝对不得超过32个汉字。
- 删除例子、过程细节、引导词和重复信息。
- 概括必须能够替代原文成为论证图节点的小字。

任务二：自主识别并图示化模块关系
- 不要使用预设的“解释、支持、回应、总结”等固定关系，也不要仅根据模块类型判断。
- 根据每个模块的真实语义与上下文，判断哪些模块直接建立了联系。
- 为每条联系写一个2至6个汉字的具体关系词，例如“引出后果”“补充机制”“提供实例”“形成转折”“收束前文”；关系词应由内容决定。
- sourceId 表示主动补充、推进或处理另一个模块的节点；targetId 表示它所基于、推进或处理的节点。
- 只保留理解这套论证所必需的直接关系，避免所有模块互相连接。

任务三：用连续语言讲清论证过程
- 使用“这里你提出了……。基于这一点，你……。根据这个……，你又……。最后你……”这种面向作者的自然语言。
- 必须写出各模块的具体内容，不能只说“写了论点、补充了原因”。
- 根据实际模块数量灵活组织，不得虚构不存在的步骤。
- 最后再用一句话判断整体衔接是否合理；共3至5句。

任务四：一次性给出必要的增强意见
- 只针对确实薄弱的直接关系提出意见；关系充分则不要生成。
- suggestion 按 GRE 分析性写作标准只指出一个可通过局部编辑解决的问题，不得要求新增数据、研究、来源、案例、新论点或新模块。
- suggestedText 必须保留来源模块的核心内容、句子骨架和大部分措辞，只在必要处加强清晰度、推理连接、限定或衔接，不得整段另写。

模块：
${JSON.stringify(blocks, null, 2)}

模块顺序：数组中的先后顺序就是作者当前的写作顺序。

只返回严格 JSON，不要代码块，不要解释。格式必须是：
{
  "moduleSummaries": {
    "模块id": "15至28个汉字的概括"
  },
  "graphEdges": [
    {
      "sourceId": "主动推进关系的模块id",
      "targetId": "被它推进或处理的模块id",
      "relation": "2至6个汉字的内容关系词"
    }
  ],
  "frameworkSummary": "这里你提出了……。基于这一点，你……。根据这个……，你又……。最后你……。整体……。",
  "enhancements": [
    {
      "sourceId": "需要加强的来源模块id",
      "targetId": "与它相关的目标模块id",
      "summary": "一句具体关系判断",
      "suggestion": "一句内容问题",
      "suggestedText": "加强后的来源模块全文"
    }
  ]
}`;

        const response = await openai.responses.create({
          model: WRITING_MODEL,
          input: prompt,
          reasoning: { effort: "low" },
        });
        const parsed = parseModelJson(
          response.output_text,
          "整体论证框架没有返回有效 JSON"
        );

        if (!parsed?.moduleSummaries || typeof parsed.moduleSummaries !== "object") {
          const error = new Error("AI 没有返回模块概括");
          error.statusCode = 502;
          throw error;
        }
        if (!String(parsed.frameworkSummary || "").trim()) {
          const error = new Error("AI 没有返回整体关系分析");
          error.statusCode = 502;
          throw error;
        }
        if (!Array.isArray(parsed.graphEdges)) {
          const error = new Error("AI 没有返回模块关系图");
          error.statusCode = 502;
          throw error;
        }

        const moduleSummaries = {};
        for (const block of blocks) {
          const summary = String(parsed.moduleSummaries[block.id] || "")
            .replace(/\s+/g, " ")
            .replace(/[。！？!?]+$/, "")
            .trim();
          if (!summary) {
            const error = new Error(`AI 未概括模块 ${block.id}`);
            error.statusCode = 502;
            throw error;
          }
          moduleSummaries[block.id] = summary.length > 32
            ? `${summary.slice(0, 31)}…`
            : summary;
        }

        const validIds = new Set(blocks.map((block) => block.id));
        const graphEdges = parsed.graphEdges
          .map((edge) => ({
            sourceId: String(edge?.sourceId || ""),
            targetId: String(edge?.targetId || ""),
            relation: String(edge?.relation || "关联").replace(/\s+/g, " ").trim().slice(0, 8),
          }))
          .filter((edge) => edge.sourceId !== edge.targetId && validIds.has(edge.sourceId) && validIds.has(edge.targetId));
        const enhancements = (Array.isArray(parsed.enhancements) ? parsed.enhancements : [])
          .map((item) => ({
            sourceId: String(item?.sourceId || ""),
            targetId: String(item?.targetId || ""),
            summary: String(item?.summary || "").replace(/\s+/g, " ").trim(),
            suggestion: String(item?.suggestion || "").replace(/\s+/g, " ").trim(),
            suggestedText: String(item?.suggestedText || "").trim(),
          }))
          .filter((item) => validIds.has(item.sourceId) && validIds.has(item.targetId) && item.suggestion && item.suggestedText);

        return res.json({
          moduleSummaries,
          graphEdges,
          enhancements,
          frameworkSummary: String(parsed.frameworkSummary).replace(/\s+/g, " ").trim(),
        });
      }

      const relationType = String(body.relationType || "");
      const sourceBlock = body.sourceBlock || {};
      const targetBlock = body.targetBlock || {};
      const sourceText = String(sourceBlock.text || "").trim();
      const targetText = String(targetBlock.text || "").trim();

      if (!relationType || !sourceText || !targetText) {
        return res.status(400).json({ error: "模块关系审阅参数不完整" });
      }

      const relationCriteria = {
        reasonExplainsClaim: "原因是否具体解释了论点为何成立",
        evidenceSupportsClaim: "证据是否直接、充分地支持论点，而非仅与主题相关",
        counterChallengesClaim: "反论是否直接回应或限制了原论点",
        compareClarifiesClaim: "对比是否具有明确维度并阐明了论点",
        conclusionSummarizesDocument: "结论是否准确回扣前文论点、原因和证据",
      };
      const criterion = relationCriteria[relationType] || String(body.criterion || "两个模块的关系是否合理");
      const contextBlocks = Array.isArray(body.contextBlocks)
        ? body.contextBlocks.map((block) => ({ id: block.id, type: block.type, text: block.text }))
        : [];

      const prompt = `你是一名严谨的多语言论证写作编辑。请审阅一条论证关系。所有面向作者的标题、总结、评论、建议和修订文本必须使用与原文相同的主要语言；不要根据界面语言翻译作者内容。

检查标准：${criterion}
来源模块：${JSON.stringify({ id: sourceBlock.id, type: sourceBlock.type, text: sourceText }, null, 2)}
目标模块：${JSON.stringify({ id: targetBlock.id, type: targetBlock.type, text: targetText }, null, 2)}
上下文：${JSON.stringify(contextBlocks, null, 2)}

要求：
1. 根据具体内容判断，不得只复述模块类型。
2. summary 用一句简短的话直接判断这条关系。
3. suggestion 按 GRE 分析性写作标准只说明一个可通过局部编辑解决的问题，例如核心判断不够明确、原因与结果的连接没有说清、已有证据未解释其作用、结论表述过强或没有回扣前文。
4. 如果关系已经充分，suggestedText 必须原样返回来源模块文本，不要为了修改而修改。
5. 如果确需加强，suggestedText 必须保留原模块的核心内容、句子骨架和大部分措辞，只作必要的明确、限定、删减、句序调整或衔接补强；不得整段重写，不得添加数据、研究、文献、来源、案例、外部事实、新论点或新模块。

只返回严格 JSON：
{
  "score": 0到100的整数,
  "title": "简短标题",
  "summary": "一句具体判断",
  "comment": "1至2句分析",
  "suggestion": "一句内容加强建议",
  "suggestedText": "加强后的来源模块全文，或关系充分时的原文"
}`;

      const response = await openai.responses.create({
        model: WRITING_MODEL,
        input: prompt,
      });
      const parsed = parseModelJson(
        response.output_text,
        "模块关系审阅没有返回有效 JSON"
      );
      const suggestedText = String(parsed?.suggestedText || "").trim();
      if (!suggestedText || !String(parsed?.comment || "").trim()) {
        const error = new Error("AI 返回的关系审阅结果不完整");
        error.statusCode = 502;
        throw error;
      }

      return res.json({
        score: Math.max(0, Math.min(100, Number(parsed.score) || 70)),
        title: String(parsed.title || "论证关系建议").trim(),
        summary: String(parsed.summary || parsed.comment).trim(),
        comment: String(parsed.comment).trim(),
        suggestion: String(parsed.suggestion || "可以进一步加强这条论证关系。").trim(),
        suggestedText,
      });
    } catch (error) {
      console.error("❌ review-block-compatibility error:", error);
      return res.status(error.statusCode || 500).json({
        error: error.message || "模块关系审阅失败",
        details: error.details || error.cause?.message || error.message,
      });
    }
  }
);
/**
 * 流式模块生成接口。
 */
app.post(
  "/api/generate-stream",
  async (req, res) => {
    const abortController = new AbortController();
    const streamTimeoutMs = Math.max(
      30000,
      Number(process.env.OPENAI_STREAM_TIMEOUT_MS) || 180000
    );

    let clientClosed = false;
    let requestFinished = false;

    const markClientClosed = (reason) => {
      if (requestFinished || clientClosed) {
        return;
      }

      clientClosed = true;
      console.warn(`⚠️ generate-stream 客户端连接已关闭：${reason}`);

      if (!abortController.signal.aborted) {
        abortController.abort(
          new Error("客户端已断开")
        );
      }
    };

    const handleRequestAborted = () => {
      markClientClosed("request aborted");
    };

    const handleResponseClose = () => {
      if (!res.writableEnded) {
        markClientClosed("response socket closed");
      }
    };

    req.once("aborted", handleRequestAborted);
    res.once("close", handleResponseClose);

    const timeoutId = setTimeout(() => {
      if (!abortController.signal.aborted) {
        console.error(
          `❌ generate-stream 超过 ${streamTimeoutMs}ms，已取消 OpenAI 请求`
        );
        abortController.abort(
          new Error("OpenAI 流式生成超时")
        );
      }
    }, streamTimeoutMs);

    let heartbeatId = null;

    try {
      console.log(
        "🔥 /api/generate-stream 被调用了"
      );

      const {
        targetBlocks,
        contextBlocks,
      } = resolveTargetBlocks(
        req.body
      );

      res.setHeader(
        "Content-Type",
        "application/x-ndjson; charset=utf-8"
      );

      res.setHeader(
        "Cache-Control",
        "no-cache, no-transform"
      );

      res.setHeader(
        "Connection",
        "keep-alive"
      );

      res.setHeader(
        "X-Accel-Buffering",
        "no"
      );

      res.flushHeaders?.();

      writeLine(res, {
        type: "ready",
        ids: targetBlocks.map(
          (block) => block.id
        ),
      });

      writeLine(res, {
        type: "debug",
        stage: "server_request_received",
        targetCount: targetBlocks.length,
        contextCount: contextBlocks.length,
        model: WRITING_MODEL,
        targets: targetBlocks.map((block) => ({
          id: block.id,
          type: block.type,
          directive: String(block.directive || block.userInput || ""),
          originalText: String(block.originalText || ""),
          userInput: String(block.userInput || ""),
          userInputMode: block.userInputMode || "empty",
          searchPolicy: block.searchPolicy || "disabled",
          instructionLength: String(block.instruction || "").length,
        })),
      });

      /**
       * Render may close an NDJSON response that stays silent while the model
       * reasons. Keep the connection active without exposing synthetic text
       * to the editor. The client intentionally ignores these heartbeat rows.
       */
      heartbeatId = setInterval(() => {
        if (
          !clientClosed &&
          !requestFinished &&
          canWriteResponse(res)
        ) {
          writeLine(res, {
            type: "heartbeat",
          });
        }
      }, 8000);

      const {
        responses: completedResponses,
      } = await generateValidatedStreamingBlocks({
        targetBlocks,
        contextBlocks,
        res,
        signal: abortController.signal,
        isClientClosed: () => clientClosed,
      });

      if (clientClosed || abortController.signal.aborted) {
        return;
      }

      writeLine(res, {
        type: "debug",
        stage: "server_all_target_ids_streamed_and_validated",
        expectedIds: targetBlocks.map((block) => block.id),
      });

      if (clientClosed || !canWriteResponse(res)) {
        return;
      }

      const sourcesByUrl = new Map();
      completedResponses.forEach((response) => {
        collectWebSources(response).forEach((source) => {
          sourcesByUrl.set(source.url, source);
        });
      });
      const sources = Array.from(sourcesByUrl.values()).slice(0, 5);

      if (sources.length) {
        writeLine(res, {
          type: "sources",
          id: targetBlocks[0]?.id,
          sources,
        });
      }

      writeLine(res, {
        type: "done",
      });

      requestFinished = true;
      res.end();
    } catch (error) {
      const wasAborted =
        abortController.signal.aborted ||
        error?.name === "AbortError";

      if (clientClosed) {
        console.log(
          "ℹ️ generate-stream 因客户端断开而结束"
        );
        return;
      }

      console.error(
        "❌ OpenAI generate-stream error:",
        error
      );

      if (canWriteResponse(res)) {
        writeLine(res, {
          type: "error",
          code: error?.code || (wasAborted ? "GENERATION_ABORTED" : "GENERATION_FAILED"),
          failedIds: Array.isArray(error?.failedIds) ? error.failedIds : [],
          error: wasAborted
            ? "生成请求超时或已取消"
            : error.message || "OpenAI request failed",
          details:
            error.details ||
            error.cause?.message ||
            error.message,
        });

        requestFinished = true;
        res.end();
      }
    } finally {
      clearTimeout(timeoutId);
      if (heartbeatId) {
        clearInterval(heartbeatId);
      }
      req.off("aborted", handleRequestAborted);
      res.off("close", handleResponseClose);
    }
  }
);

/**
 * 研究日志接收端。
 * 浏览器会批量提交；event_id 为幂等键，网络重试不会产生重复记录。
 */
app.post("/api/research-events", async (req, res) => {
  try {
    const inputEvents = Array.isArray(req.body?.events)
      ? req.body.events.slice(0, 250)
      : [];
    const events = inputEvents.map(normalizeResearchEvent).filter(Boolean);
    if (events.length === 0) {
      return res.status(400).json({ error: "没有有效的研究日志事件" });
    }

    const storage = await persistResearchEvents(events);
    return res.json({ ok: true, accepted: events.length, storage });
  } catch (error) {
    console.error("研究日志写入失败：", error);
    return res.status(500).json({
      error: "研究日志写入失败",
      details: error?.message || String(error),
    });
  }
});

/**
 * 研究者导出接口。正式部署必须设置 RESEARCH_EXPORT_TOKEN。
 * GET /api/research-events/export?participant=P01
 * Authorization: Bearer <RESEARCH_EXPORT_TOKEN>
 */
app.get("/api/research-events/export", async (req, res) => {
  if (!canExportResearchLogs(req)) {
    return res.status(401).json({ error: "无权导出研究日志" });
  }

  const participantId = normalizeResearchIdentifier(req.query.participant, 80);
  if (!participantId) {
    return res.status(400).json({ error: "缺少 participant 参数" });
  }

  try {
    if (SUPABASE_URL && SUPABASE_SECRET_KEY) {
      const query = new URLSearchParams({
        select: "*",
        participant_id: `eq.${participantId}`,
        order: "sequence.asc",
      });
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/research_events?${query.toString()}`,
        {
          headers: createSupabaseRestHeaders(),
        }
      );
      if (!response.ok) {
        throw new Error(`Supabase export failed: ${await response.text()}`);
      }
      const rows = await response.json();
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${participantId}-research-events.json"`
      );
      return res.json({ participant_id: participantId, events: rows });
    }

    const filePath = path.join(RESEARCH_LOG_DIR, `${participantId}.ndjson`);
    const content = await fs.readFile(filePath, "utf8");
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${participantId}-research-events.ndjson"`
    );
    return res.send(content);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return res.status(404).json({ error: "没有找到该参与者的日志" });
    }
    console.error("研究日志导出失败：", error);
    return res.status(500).json({
      error: "研究日志导出失败",
      details: error?.message || String(error),
    });
  }
});

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `服务器已启动，端口：${PORT}`
    );
  }
);
