console.log("=== 最新版 server.js 已启动 2026-04-06 ===");

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { fetch, ProxyAgent } from "undici";

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
app.use(express.json());

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

function buildWritingRequestOptions({
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
  };

  if (webSearchMode !== "disabled") {
    options.tools = [
      {
        type: "web_search",
        search_context_size: WEB_SEARCH_CONTEXT_SIZE,
      },
    ];

    options.tool_choice =
      webSearchMode === "required"
        ? "required"
        : "auto";

    options.include = [
      "web_search_call.action.sources",
    ];
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
 * Read the model response as an upstream stream, even though block text is
 * validated before it is exposed to the editor. This prevents a long silent
 * provider request from being cut off by an intermediary before any body data
 * is received.
 */
async function createCompletedWritingResponse({
  prompt,
  targetBlocks,
  signal,
}) {
  const stream = await openai.responses.create(
    {
      ...buildWritingRequestOptions({
        prompt,
        targetBlocks,
      }),
      stream: true,
    },
    signal ? { signal } : undefined
  );

  let outputText = "";
  let completedResponse = null;

  for await (const event of stream) {
    if (signal?.aborted) {
      const error = new Error("生成已取消");
      error.name = "AbortError";
      throw error;
    }

    if (event.type === "response.output_text.delta") {
      outputText += String(event.delta || "");
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

  const response =
    completedResponse ||
    {
      output_text: outputText,
      output: [],
    };
  const rawText = outputText.trim() || getCompletedResponseText(response);

  if (!rawText) {
    const error = new Error("模型流结束但没有返回正文");
    error.code = "EMPTY_MODEL_STREAM";
    throw error;
  }

  return {
    response,
    rawText,
  };
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
11. Keep the same ids as TARGET BLOCKS.
12. Do not skip any target id.
13. Do not generate results for CONTEXT BLOCKS.

Output format:
{
  "results": [
    { "id": 1, "text": "..." },
    { "id": 2, "text": "..." }
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

  const targetIds = targetBlocks
    .map((block) => block.id)
    .join(", ");

  const outputRules =
    targetBlocks.length === 1
      ? `
Very important output rules:
1. Output ONLY the final text for this one target block.
2. Do not output block tags, JSON, Markdown, explanations, labels, source lists, or quotation marks around the answer.
3. Start immediately with the block content and stop immediately after it.
`
      : `
Very important output rules:
1. Output PLAIN TEXT only. Do NOT output JSON, Markdown, or explanations.
2. For each target block, use exactly this format: [[BLOCK:ID]]content[[/BLOCK]]
3. Replace ID with the real block id and output every target in the requested order.
4. Do not use block-tag strings inside content and do not add text outside the tags.

Required target ids: ${targetIds}
`;

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
11. Before writing any target, silently plan one coherent passage across ALL target blocks. Then output every requested target exactly once and in order. Never omit a target because its directive already contains text.
12. Treat the directive as an instruction to follow, not as text to preserve. Returning it unchanged is a failed answer.

${outputRules}

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

  let lengthInstruction = "";

  const normalizedTargetLength =
    Number.isFinite(
      Number(targetLength)
    )
      ? Math.max(
          1,
          Math.round(
            Number(targetLength)
          )
        )
      : null;

  const normalizedLengthUnit =
    lengthUnit === "words"
      ? "words"
      : "Chinese characters";

  if (
    normalizedTargetLength != null
  ) {
    const originalLength =
      countWritingLength(
        text,
        lengthUnit
      );

    const difference =
      normalizedTargetLength -
      originalLength;

    const smallChange =
      Math.abs(difference) <=
      Math.max(
        3,
        Math.ceil(
          originalLength * 0.12
        )
      );

    lengthInstruction = `
Rewrite the block to approximately ${normalizedTargetLength} ${normalizedLengthUnit}.

The current length is approximately ${originalLength} ${normalizedLengthUnit}.

${
  difference > 0
    ? `Add approximately ${difference} ${normalizedLengthUnit}.`
    : difference < 0
    ? `Remove approximately ${Math.abs(
        difference
      )} ${normalizedLengthUnit}.`
    : "Keep the current length and only improve wording where necessary."
}

${
  smallChange
    ? "This is a small length adjustment. Make only local additions or deletions and preserve the original sentence structure as much as possible. Do not rewrite the whole block unnecessarily."
    : "Make the amount of expansion or compression visibly match the requested target while preserving the block's meaning and rhetorical role."
}

The target is a writing-length constraint, not a request to add filler. Stop when the target is reached.
`.trim();
  } else if (normalizedValue < 0) {
    const shortenPercentage = Math.abs(
      normalizedValue
    );

    lengthInstruction = `
Shorten the text by approximately ${shortenPercentage}%.

Remove repetition, secondary details, and unnecessary wording.

Preserve:
- the core meaning;
- the rhetorical function;
- essential evidence or reasoning;
- the original language.
`.trim();
  } else if (normalizedValue > 0) {
    lengthInstruction = `
Expand the text by approximately ${normalizedValue}%.

Add useful clarification, explanation, logical detail, or elaboration.

Do not:
- introduce an unrelated topic;
- change the original claim;
- add unsupported factual information;
- repeat the same idea unnecessarily.
`.trim();
  } else {
    lengthInstruction = `
Keep the text approximately the same length.

Only improve clarity, fluency, and academic expression where necessary.
`.trim();
  }

  return `
You are an academic writing assistant for a modular writing interface.

The user wants to adjust the length of one writing block.

BLOCK TYPE:
${type || "Unknown"}

ORIGINAL TEXT:
${text}

LENGTH INSTRUCTION:
${lengthInstruction}

Requirements:
1. Keep the same language as the original text.
2. Preserve the original meaning.
3. Preserve the rhetorical role of the block type.
4. Maintain an appropriate academic writing style.
5. Do not introduce unrelated content.
6. Do not output explanations.
7. Do not output quotation marks around the result.
8. Do not output markdown.
9. Output only the revised text.
10. When a target length is supplied, follow it closely. A difference of one unit is acceptable for very short text; otherwise stay within about 8% of the target.
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
      id: Number(item.id),
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

/**
 * 解析流式模块输出。
 */
function createBlockStreamParser({ res, expectedIds = [] }) {
  const START_PREFIX = "[[BLOCK:";
  const END_TAG = "[[/BLOCK]]";

  let buffer = "";
  let currentBlockId = null;
  const startedIds = new Set();
  const completedIds = new Set();
  const expectedIdSet = new Set(expectedIds.map(String));
  const textById = new Map();

  function emitChunk(id, delta) {
    if (!delta) return;

    const key = String(id);
    textById.set(key, `${textById.get(key) || ""}${delta}`);

    writeLine(res, {
      type: "chunk",
      id,
      delta,
    });
  }

  function emitBlockStart(id) {
    if (expectedIdSet.size && !expectedIdSet.has(String(id))) {
      throw new Error(`Model returned unknown block id: ${id}`);
    }

    if (startedIds.has(id)) return;

    startedIds.add(id);

    writeLine(res, {
      type: "block_start",
      id,
    });
  }

  function emitBlockDone(id) {
    const key = String(id);
    if (!String(textById.get(key) || "").trim()) {
      throw new Error(`Model returned empty block: ${id}`);
    }

    completedIds.add(key);

    writeLine(res, {
      type: "block_done",
      id,
    });
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

        const match = tagBody.match(
          /^\[\[BLOCK:(\d+)\]\]$/
        );

        if (!match) {
          buffer = buffer.slice(1);
          continue;
        }

        currentBlockId = Number(
          match[1]
        );

        emitBlockStart(
          currentBlockId
        );

        buffer = buffer.slice(
          closeIndex + 2
        );

        continue;
      }

      const endIndex =
        buffer.indexOf(END_TAG);

      if (endIndex === -1) {
        if (force) {
          if (buffer.length > 0) {
            emitChunk(
              currentBlockId,
              buffer
            );

            buffer = "";
          }

          emitBlockDone(
            currentBlockId
          );

          currentBlockId = null;
          continue;
        }

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

          emitChunk(
            currentBlockId,
            safeText
          );

          buffer = buffer.slice(
            safeLength
          );
        }

        return;
      }

      const textBeforeEnd =
        buffer.slice(0, endIndex);

      emitChunk(
        currentBlockId,
        textBeforeEnd
      );

      buffer = buffer.slice(
        endIndex + END_TAG.length
      );

      emitBlockDone(
        currentBlockId
      );

      currentBlockId = null;
    }
  }

  function flush() {
    processBuffer(true);
  }

  function hasOutput() {
    return startedIds.size > 0;
  }

  function validate() {
    const missingIds = Array.from(expectedIdSet).filter(
      (id) =>
        !completedIds.has(id) ||
        !String(textById.get(id) || "").trim()
    );

    if (missingIds.length) {
      throw new Error(
        `Model omitted target blocks: ${missingIds.join(", ")}`
      );
    }
  }

  return {
    push,
    flush,
    hasOutput,
    validate,
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

function parseBufferedBlockOutput(rawText, targetBlocks) {
  const result = new Map();

  if (targetBlocks.length === 1) {
    result.set(
      String(targetBlocks[0].id),
      sanitizeServerGeneratedText(rawText)
    );
    return result;
  }

  const blockPattern = /\[\[BLOCK:(\d+)\]\]([\s\S]*?)\[\[\/BLOCK\]\]/g;
  let match;

  while ((match = blockPattern.exec(String(rawText || ""))) !== null) {
    result.set(String(match[1]), sanitizeServerGeneratedText(match[2]));
  }

  return result;
}

async function generateValidatedBufferedBlocks({
  prompt,
  targetBlocks,
  res,
  signal,
  isClientClosed = () => false,
}) {
  const maxAttempts = 3;
  let lastInvalid = [];
  let lastResponse = null;
  const validTextById = new Map();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (isClientClosed() || signal?.aborted) {
      const error = new Error("客户端已断开，生成已取消");
      error.name = "AbortError";
      throw error;
    }

    if (getWebSearchMode(targetBlocks) !== "disabled") {
      writeLine(res, {
        type: "search_progress",
        phase: "searching",
        attempt,
      });
    }

    const retryEvidenceInstruction =
      getWebSearchMode(targetBlocks) === "disabled"
        ? "Web search is disabled by the user. Use the supplied context and only knowledge you are confident about; do not claim that you searched or verified a source, and do not invent a paper title, year, or uncertain exact statistic. Still turn 数据 into a complete evidence sentence instead of repeating the directive."
        : "Use the retrieved sources and write a complete, directly relevant quantitative evidence sentence containing the study population or sample and the key numerical finding.";

    const retryInstruction = lastInvalid.length
      ? `\n\nCORRECTION REQUIRED: The previous answer failed for target ids ${lastInvalid
          .map((item) => item.id)
          .join(", ")}. Each failed target was empty, missing, or merely repeated its directive. Regenerate ALL targets. Execute every directive and produce visibly new final prose. If a directive asks for 数据 or the target is Evidence: ${retryEvidenceInstruction} Never output the word 数据 as the answer.`
      : "";

    const completed = await createCompletedWritingResponse({
        prompt: `${prompt}${retryInstruction}`,
        targetBlocks,
        signal,
      });

    lastResponse = completed.response;

    if (isClientClosed() || signal?.aborted) {
      const error = new Error("客户端已断开，生成已取消");
      error.name = "AbortError";
      throw error;
    }

    if (getWebSearchMode(targetBlocks) !== "disabled") {
      writeLine(res, {
        type: "search_progress",
        phase: "completed",
        attempt,
      });
    }

    const rawText = completed.rawText;
    const textById = parseBufferedBlockOutput(rawText, targetBlocks);

    lastInvalid = targetBlocks.flatMap((block) => {
      const id = String(block.id);
      const text = String(textById.get(id) || "").trim();
      const directive = String(block.directive || block.userInput || "").trim();
      const comparisonText = directive || String(block.originalText || "").trim();
      const unchanged = Boolean(
        comparisonText &&
          normalizeGeneratedComparison(text) ===
            normalizeGeneratedComparison(comparisonText)
      );

      return !text || unchanged
        ? [{ id, empty: !text, unchanged, directive: comparisonText, returnedText: text }]
        : [];
    });

    const invalidIdSet = new Set(lastInvalid.map((item) => String(item.id)));
    targetBlocks.forEach((block) => {
      const id = String(block.id);
      const text = String(textById.get(id) || "").trim();
      if (!invalidIdSet.has(id) && text) {
        validTextById.set(id, text);
      }
    });

    writeLine(res, {
      type: "debug",
      stage: "server_attempt_validated",
      attempt,
      invalid: lastInvalid,
      results: targetBlocks.map((block) => ({
        id: block.id,
        directive: String(block.directive || block.userInput || ""),
        returnedText: String(textById.get(String(block.id)) || ""),
      })),
    });

    if (!lastInvalid.length) {
      return { textById, response: lastResponse, attempt };
    }
  }

  const error = new Error(
    `模型连续 ${maxAttempts} 次未执行模块指令：${lastInvalid
      .map((item) => item.id)
      .join(", ")}`
  );
  error.code = "GENERATION_VALIDATION_FAILED";
  error.failedIds = lastInvalid.map((item) => String(item.id));
  error.partialTextById = validTextById;
  error.partialBlocks = targetBlocks.filter((block) =>
    validTextById.has(String(block.id))
  );
  error.details = lastInvalid;
  throw error;
}

async function emitBufferedBlocks(
  res,
  targetBlocks,
  textById,
  isClientClosed = () => false
) {
  for (const block of targetBlocks) {
    if (isClientClosed() || !canWriteResponse(res)) {
      return;
    }

    const text = String(textById.get(String(block.id)) || "");

    writeLine(res, { type: "block_start", id: block.id });

    const characters = Array.from(text);
    for (let index = 0; index < characters.length; index += 6) {
      if (isClientClosed() || !canWriteResponse(res)) {
        return;
      }

      writeLine(res, {
        type: "chunk",
        id: block.id,
        delta: characters.slice(index, index + 6).join(""),
      });

      await new Promise((resolve) => setTimeout(resolve, 8));
    }

    writeLine(res, { type: "block_done", id: block.id });
  }
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
    try {
      console.log(
        "🔥 /api/adjust-length 被调用了"
      );

      const {
        blockId,
        text,
        type,
        value,
        targetLength,
        lengthUnit,
      } = req.body || {};

      if (blockId == null) {
        return res
          .status(400)
          .json({
            error: "缺少 blockId",
          });
      }

      const normalizedText =
        String(text || "").trim();

      if (!normalizedText) {
        return res
          .status(400)
          .json({
            error:
              "当前模块没有可调整的文本",
          });
      }

      const normalizedValue =
        Math.max(
          -100,
          Math.min(
            100,
            Number(value) || 0
          )
        );

      const prompt =
        buildAdjustLengthPrompt({
          text: normalizedText,
          type:
            type || "Unknown",
          value: normalizedValue,
          targetLength,
          lengthUnit,
        });

      console.log(
        "调整长度请求参数：",
        {
          blockId,
          type:
            type || "Unknown",
          value: normalizedValue,
          targetLength:
            Number.isFinite(
              Number(targetLength)
            )
              ? Math.max(
                  1,
                  Math.round(
                    Number(targetLength)
                  )
                )
              : null,
          lengthUnit:
            lengthUnit === "words"
              ? "words"
              : "characters",
          originalLength:
            countWritingLength(
              normalizedText,
              lengthUnit
            ),
        }
      );

      const normalizedTargetLength =
        Number.isFinite(
          Number(targetLength)
        )
          ? Math.max(
              1,
              Math.round(
                Number(targetLength)
              )
            )
          : null;

      const normalizedLengthUnit =
        lengthUnit === "words"
          ? "words"
          : "characters";

      const originalWritingLength =
        countWritingLength(
          normalizedText,
          normalizedLengthUnit
        );

      let resultText = "";
      let resultWritingLength = 0;
      let attemptPrompt = prompt;

      /**
       * 单次请求模式：
       * 长度调整只调用一次模型，不再为了字数误差自动发起第二次请求。
       *
       * 其余逻辑保持不变：
       * - Prompt 不变
       * - 长度计算不变
       * - 返回格式不变
       * - 前端调用方式不变
       */
      for (
        let attempt = 1;
        attempt <= 1;
        attempt += 1
      ) {
        /**
         * 长度调整属于明确的文本改写任务，不需要较高推理强度。
         *
         * 这里只降低推理强度，不改变：
         * - 最多两次生成与自动纠正逻辑
         * - 目标长度误差范围
         * - 扩写或缩写方向检查
         * - Prompt 内容
         * - 返回数据结构
         *
         * 因此不会改变现有功能，只减少模型在该任务上的推理等待。
         */
        const response =
          await openai.responses.create({
            model: WRITING_MODEL,

            reasoning: {
              effort: "low",
            },

            input:
              attemptPrompt,
          });

        resultText = String(
          response.output_text || ""
        ).trim();

        resultWritingLength =
          countWritingLength(
            resultText,
            normalizedLengthUnit
          );

        if (
          normalizedTargetLength == null ||
          !resultText
        ) {
          break;
        }

        const tolerance =
          Math.max(
            1,
            Math.ceil(
              normalizedTargetLength *
                0.08
            )
          );

        const directionCorrect =
          normalizedTargetLength >
          originalWritingLength
            ? resultWritingLength >
              originalWritingLength
            : normalizedTargetLength <
              originalWritingLength
            ? resultWritingLength <
              originalWritingLength
            : true;

        const closeEnough =
          Math.abs(
            resultWritingLength -
              normalizedTargetLength
          ) <= tolerance;

        if (
          directionCorrect &&
          closeEnough
        ) {
          break;
        }

        attemptPrompt = `${prompt}

CORRECTION REQUIRED:
The previous result contained approximately ${resultWritingLength} ${normalizedLengthUnit}, but the requested target is ${normalizedTargetLength}.
Adjust the wording again. The result must move in the requested direction and stay close to the target. Output only the revised text.`;
      }

      console.log(
        "调整长度后的文本：",
        {
          text: resultText,
          resultLength:
            resultWritingLength,
          targetLength:
            normalizedTargetLength,
          lengthUnit:
            normalizedLengthUnit,
        }
      );

      if (!resultText) {
        return res
          .status(500)
          .json({
            error:
              "AI 没有返回有效文本",
          });
      }

      return res.json({
        blockId,
        text: resultText,
      });
    } catch (error) {
      console.error(
        "❌ adjust-length error:",
        error
      );

      return res
        .status(
          error.statusCode || 500
        )
        .json({
          error:
            error.message ||
            "调整长度失败",

          details:
            error.details ||
            error.message,
        });
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
 * 流式整体论证审阅。
 * 模型每确认一个模块概括或一条关系，立即以 NDJSON 推送给前端。
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
          }))
      : [];

    if (blocks.length < 2) {
      return res.status(400).json({ error: "至少需要两个有效模块" });
    }

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

    const maxRelations = Math.min(5, Math.max(1, blocks.length));
    const validIds = new Set(blocks.map((block) => block.id));
    const emittedModuleIds = new Set();
    const emittedRelationKeys = new Set();
    const confirmedRelations = [];
    let overallSummary = "";
    let summaryHighlights = [];

    const relationshipPrompt = `你是一名严谨的多语言论证写作编辑。现在只完成第一遍审阅：识别模块作用、关键关系，并简洁概括整体论证。严格按进度逐行输出 NDJSON；每确认一个模块或关系就立刻输出一行，不要等待全部分析完成，不要输出代码块或额外文字。

语言规则：先判断模块正文的主要语言。focus、relation、overallSummary 和 summaryHighlights 必须使用与正文相同的主要语言，界面语言不影响输出语言。

模块（数组顺序即写作顺序）：
${JSON.stringify(blocks, null, 2)}

这不是线性大纲，而是一张可能跨段、回指和分支的论证关系图。按顺序阅读，但同时检查相邻与非相邻模块的真实语义联系。

先按顺序逐一输出：
{"type":"module","id":"模块id","focus":"一句简短文字，说明正在检查的内容作用"}
focus 只用于实时反馈，必须简短，不要复述整段原文。

确认一条关键直接关系时立即输出：
{"type":"relation","sourceId":"主动提供解释、支持、质疑、限定或推进的模块id","targetId":"被作用的模块id","relation":"具体而简短的关系词","importance":1到5的整数}
语义方向不能由位置先后决定。只保留决定论证成立的直接关系，总数最多 ${maxRelations} 条；不要因为相邻而连线，不要输出能够由其他关系间接推出的冗余连线。

最后输出且只输出一行整体概括：
{"type":"framework","overallSummary":"简洁的整体论证叙述","summaryHighlights":["可在概括中逐字找到的关键短语"]}
overallSummary 必须说明作者实际写了什么、各部分怎样推进。语言可参考“你先写了……，提出……；随后从……角度说明……，这支持了……；你又提出……；最后总结……”，但不要机械套用。必须写出具体观点和证明角度，不能只说模块名称。这里只概括现有内容及关系，不评价不足、不提出建议、不列审阅标准、不使用箭头链或分点，保持简洁。`;

    const emitRelationshipLine = (rawLine) => {
      const line = String(rawLine || "")
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```$/, "")
        .trim();
      if (!line) return;

      try {
        const item = JSON.parse(line);
        if (item.type === "module" && validIds.has(String(item.id))) {
          const id = String(item.id);
          if (emittedModuleIds.has(id)) return;
          emittedModuleIds.add(id);
          writeLine(res, {
            type: "module",
            id,
            focus: String(item.focus || "检查模块在论证中的作用")
              .replace(/\s+/g, " ")
              .trim(),
          });
          return;
        }

        if (
          item.type === "relation" &&
          validIds.has(String(item.sourceId)) &&
          validIds.has(String(item.targetId)) &&
          String(item.sourceId) !== String(item.targetId)
        ) {
          const relation = {
            sourceId: String(item.sourceId),
            targetId: String(item.targetId),
            relation: String(item.relation || "关联").replace(/\s+/g, " ").trim(),
            importance: Math.max(1, Math.min(5, Number(item.importance) || 3)),
          };
          const key = `${relation.sourceId}::${relation.targetId}::${relation.relation}`;
          if (emittedRelationKeys.has(key) || confirmedRelations.length >= maxRelations) return;
          emittedRelationKeys.add(key);
          confirmedRelations.push(relation);
          writeLine(res, { type: "relation", ...relation });
          return;
        }

        if (item.type === "framework") {
          overallSummary = String(item.overallSummary || "")
            .replace(/[ \t]+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
          summaryHighlights = Array.isArray(item.summaryHighlights)
            ? item.summaryHighlights
                .map((value) => String(value || "").replace(/\s+/g, " ").trim())
                .filter((value) => value && overallSummary.includes(value))
                .slice(0, 5)
            : [];
        }
      } catch (error) {
        console.warn("跳过无法解析的关系审阅流行：", line, error.message);
      }
    };

    const collectResponseText = async (input, effort) => {
      let output = "";
      const stream = await openai.responses.create({
        model: WRITING_MODEL,
        input,
        reasoning: { effort },
        stream: true,
      });
      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          output += String(event.delta || "");
        }
      }
      return output;
    };

    try {
      let relationshipBuffer = "";
      const relationshipStream = await openai.responses.create({
        model: WRITING_MODEL,
        input: relationshipPrompt,
        reasoning: { effort: "low" },
        stream: true,
      });

      for await (const event of relationshipStream) {
        if (event.type !== "response.output_text.delta") continue;
        relationshipBuffer += String(event.delta || "");
        const lines = relationshipBuffer.split("\n");
        relationshipBuffer = lines.pop() || "";
        lines.forEach(emitRelationshipLine);
      }
      if (relationshipBuffer.trim()) emitRelationshipLine(relationshipBuffer);

      writeLine(res, { type: "phase", phase: "enhancements" });

      const diagnosticPrompt = `你是一名以 GRE 分析性写作核心标准审阅论证的高级编辑。现在进行独立的第二遍诊断。不要重复概括全文；先诊断论证缺口，再选择最小但足够的干预方式。最终只输出一个合法 JSON 对象，不要代码块或额外文字。

语言规则：所有 category、criterion、summary、suggestion 和 insertLabel 必须使用模块正文的主要语言。

模块：
${JSON.stringify(blocks, null, 2)}

第一遍确认的关键关系：
${JSON.stringify(confirmedRelations, null, 2)}

当前已有标签（可以复用，但不是白名单）：
${JSON.stringify(templates, null, 2)}

请全面检查以下维度，而不是优先寻找数据或实证：
1. 核心主张与任务焦点是否明确并保持一致；
2. 理由能否推出主张，是否缺少必要前提、中间推理、因果机制或一般化依据；
3. 分析是否真正解释“为什么”和“如何”，还是只重复结论、罗列现象；
4. 理论是否被准确用于解释材料，而不是只出现名称；
5. 理由、例子、理论与证据是否相关且足以承担作者赋予的证明作用，作者是否解释支持关系；
6. 多个理由是递进、并列还是重复，是否构成有深度的分析；
7. 替代解释、关键假设和反论是否得到有效处理；
8. 段落之间是否缺少独立过渡或逻辑桥梁；
9. 结论是否由前文推出并覆盖主要论证链，是否引入未建立的新判断。

GRE 分析性写作要求有洞察、有深度的分析，以及合乎逻辑且有说服力的理由和例子；它不要求每个主张都配实证数据。必须遵守：
- 能靠补足推理、机制、理论运用或解释支持关系解决的问题，不得建议新增 Evidence/数据模块。
- 原文已有材料但没有解释它为什么支持主张时，应加强分析或推理，不得再添加一份证据。
- 只有涉及事实、因果、范围推广或效果判断，并且确实需要外部可验证材料才能成立时，才可建议新增证据或数据；此时 supportNeeded 必须为 "empirical"。
- 理论名称已经出现但运用不足，通常是局部加强理论分析，不等于缺少实证。
- 不得把增加“可能”“也许”、补泛泛限定、换词、调整语气或“更学术”作为独立建议。

每个问题只能选择一种动作：
- action="revise", rewriteScope="local"：模块方向正确，但关键分析、推理、机制或支持关系不充分。保留核心内容，只加强现有模块。
- action="revise", rewriteScope="full"：证据、理由或反论方向错误，实际不能承担当前论证功能。接受后重写整个 sourceId 模块。
- action="insert"：两个相邻模块之间缺少一个真正独立的论证功能，局部修改任何一个模块都无法清楚承担。接受后在两者之间新增模块。

新增模块采用开放类型：你可以复用现有标签，也可以按真实缺口新定义“理论、理论分析、机制、推理、前提、概念界定、假设、反例、综合、方法说明”等任何必要的短标签。不要受默认标签限制，也不要把所有缺口映射成原因或证据。若创建新标签，insertType 与 insertLabel 使用同一个简短、明确的显示名称；若已有标签语义完全一致，则复用已有 type 和 label，避免同义重复。insert 的 sourceId 必须是缺口前一个模块，targetId 必须是紧邻其后的模块。

先在内部识别全部问题，再只保留最重要且互不重复的根本问题。一个根本缺口只输出一条建议；如果补足一段机制或推理可以解决多个表面症状，只输出这一个机制或推理建议。建议数量没有上下限，也不得为了凑数输出次要问题。

输出格式：
{"enhancements":[{"action":"revise或insert","rewriteScope":"local、full或空字符串","sourceId":"模块id","targetId":"相关模块id","insertType":"新增时的类型，否则空字符串","insertLabel":"新增时的显示标签，否则空字符串","gapDimension":"taskFocus/development/warrant/assumption/causality/theoryUse/support/counterargument/organization/conclusion","supportNeeded":"reasoning/example/theory/empirical/none","rootIssueKey":"同一根本问题的稳定短标识","priority":1到5,"category":"具体问题类别","criterion":"本条判断标准","summary":"一句清楚判断","suggestion":"分点的可执行修改指令"}]}

suggestion 不设字数限制，必须排版成 2—4 个以“• ”开头的完整要点，并根据具体内容依次讲清：
- 现在哪里不充分或方向为何错误；
- 应怎样修改现有模块，或新增模块需要完成什么独立论证任务；
- 修改后哪一步推理、解释或整体论证链会变得成立或更有说服力。
不要机械复制固定句式，但每个要点必须是能独立读懂的完整句子。不要给出“修正为……”后的完整替换正文，也不要虚构原文没有的理论、数据、研究、来源或事实。若确需外部材料，清楚说明作者需要提供哪类材料以及它必须验证什么。`;

      const diagnosticText = await collectResponseText(diagnosticPrompt, "medium");
      const parsedDiagnostic = JSON.parse(cleanModelJsonText(diagnosticText));
      const seenRootIssues = new Set();
      const enhancements = (Array.isArray(parsedDiagnostic?.enhancements)
        ? parsedDiagnostic.enhancements
        : [])
        .map((enhancement) => {
          const action = enhancement?.action === "insert" ? "insert" : "revise";
          const rewriteScope = action === "revise"
            ? enhancement?.rewriteScope === "full" ? "full" : "local"
            : "";
          const sourceId = String(enhancement?.sourceId || "");
          const targetId = String(enhancement?.targetId || "");
          if (!validIds.has(sourceId) || !validIds.has(targetId) || sourceId === targetId) {
            return null;
          }

          const insertType = String(enhancement?.insertType || enhancement?.insertLabel || "").trim();
          const insertLabel = String(enhancement?.insertLabel || enhancement?.insertType || "").trim();
          const supportNeeded = String(enhancement?.supportNeeded || "none").trim();
          if (action === "insert") {
            const sourceIndex = blocks.findIndex((block) => block.id === sourceId);
            const targetIndex = blocks.findIndex((block) => block.id === targetId);
            if (targetIndex !== sourceIndex + 1 || !insertType || !insertLabel) return null;

            const evidenceLike = /evidence|empirical|data|证据|数据|实证/i.test(
              `${insertType} ${insertLabel}`
            );
            if (evidenceLike && supportNeeded !== "empirical") return null;
          }

          const rootIssueKey = String(
            enhancement?.rootIssueKey ||
              `${sourceId}:${targetId}:${enhancement?.gapDimension || action}`
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
            supportNeeded,
            rootIssueKey,
            priority: Math.max(1, Math.min(5, Number(enhancement?.priority) || 3)),
            suggestion: String(enhancement?.suggestion || "")
              .replace(/[ \t]+/g, " ")
              .replace(/\n{3,}/g, "\n\n")
              .trim(),
          };
        })
        .filter((enhancement) => enhancement?.suggestion)
        .sort((first, second) => second.priority - first.priority);

      writeLine(res, {
        type: "final",
        overallSummary,
        summaryHighlights,
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
      rewriteScope: body.issue?.rewriteScope === "full" ? "full" : "local",
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
5. rewriteScope="local" 时建议局部加强，保留原模块的核心内容和可用材料；rewriteScope="full" 时说明当前模块为什么没有承担正确的论证功能，并要求围绕相关主张重构整个模块，不能用一两句连接语掩盖方向错误。
6. 不得把加入“可能”“也许”“一定程度上”等缓和词、补充泛泛限定、调整语气、替换词语或“让表达更学术”作为建议。只有措辞直接造成逻辑错误时才可提及，而且必须说明它破坏了哪条推理关系。结论过强时，应修复主张与理由或证据的匹配，而不是只弱化语气。
7. 不得要求或虚构新的数据、研究、文献、来源、案例、外部事实、新论点或新模块。现有材料不足时，要求利用现有内容重建论证关系，或把主张调整到现有推理真正能够推出的层级。
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
      const rewriteScope = body.rewriteScope === "full" ? "full" : "local";
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

      const scopeRequirement = rewriteScope === "full"
        ? `本条意见已经判定来源模块的论证方向错误。允许并要求重构整个来源模块：删除或替换不能支持相关主张的内容，围绕相关模块所表达的真实主张重新完成当前模块应承担的论证功能，不必保留原句结构或错误材料。若当前模块必须提供真实数据、研究或理论来源，而上下文没有这些材料，绝对不得编造；请输出一个明确的方括号证据槽，准确写明需要补充哪类材料以及它必须证明什么。`
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
5. 保持原文语言和模块类型。rewriteScope=${rewriteScope}；不得把增加“可能”等缓和词或一般语言润色当作完成指令。`;

      let revisedText = "";
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const response = await openai.responses.create({
          model: WRITING_MODEL,
          input: attempt === 1
            ? basePrompt
            : rewriteScope === "full"
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
    const rewriteScope = body.rewriteScope === "full" ? "full" : "local";
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

    const scopeRequirement = rewriteScope === "full"
      ? `本条意见已经判定来源模块的论证方向错误。允许并要求重构整个来源模块：删除或替换不能支持相关主张的内容，围绕相关模块所表达的真实主张重新完成当前模块应承担的论证功能，不必保留原句结构或错误材料。若当前模块必须提供真实数据、研究或理论来源，而上下文没有这些材料，绝对不得编造；请输出一个明确的方括号证据槽，准确写明需要补充哪类材料以及它必须证明什么。`
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
6. 保持原文语言和模块类型。rewriteScope=${rewriteScope}。`;

    try {
      let revisedText = "";

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        let rawText = "";
        const stream = await openai.responses.create({
          model: WRITING_MODEL,
          input: attempt === 1
            ? basePrompt
            : rewriteScope === "full"
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

      const prompt =
        buildStreamingPrompt({
          targetBlocks,
          contextBlocks,
        });

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
        textById,
        response: completedResponse,
        attempt,
      } = await generateValidatedBufferedBlocks({
        prompt,
        targetBlocks,
        res,
        signal: abortController.signal,
        isClientClosed: () => clientClosed,
      });

      if (clientClosed || abortController.signal.aborted) {
        return;
      }

      writeLine(res, {
        type: "debug",
        stage: "server_all_target_ids_validated",
        expectedIds: targetBlocks.map((block) => block.id),
        attempt,
      });

      await emitBufferedBlocks(
        res,
        targetBlocks,
        textById,
        () => clientClosed
      );

      if (clientClosed || !canWriteResponse(res)) {
        return;
      }

      const sources = collectWebSources(completedResponse);

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

      if (
        !wasAborted &&
        Array.isArray(error?.partialBlocks) &&
        error.partialBlocks.length > 0 &&
        error?.partialTextById instanceof Map &&
        canWriteResponse(res)
      ) {
        await emitBufferedBlocks(
          res,
          error.partialBlocks,
          error.partialTextById,
          () => clientClosed
        );
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

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `服务器已启动，端口：${PORT}`
    );
  }
);
