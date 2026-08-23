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

  return {
    targetBlocks,
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

    const retryInstruction = lastInvalid.length
      ? `\n\nCORRECTION REQUIRED: The previous answer failed for target ids ${lastInvalid
          .map((item) => item.id)
          .join(", ")}. Each failed target was empty, missing, or merely repeated its directive. Regenerate ALL targets. Execute every directive and produce visibly new final prose.`
      : "";

    lastResponse = await openai.responses.create(
      buildWritingRequestOptions({
        prompt: `${prompt}${retryInstruction}`,
        targetBlocks,
      }),
      signal ? { signal } : undefined
    );

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

    const rawText = getCompletedResponseText(lastResponse);
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

      const response =
        await openai.responses.create({
          model: WRITING_MODEL,
          input: prompt,
        });

      const resultText =
        String(
          response.output_text || ""
        ).trim();

      if (!resultText) {
        return res.status(500).json({
          error: "AI 没有返回有效文本",
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

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    writeLine(res, { type: "ready", blockIds: blocks.map((block) => block.id) });

    const maxRelations = Math.min(5, Math.max(1, blocks.length));

    const prompt = `你是一名严谨的中文论证写作编辑。请实时审阅以下模块，并严格按审阅进度逐行输出 NDJSON。每完成一个判断就立刻输出一行，禁止等待全部分析完成后再统一输出，禁止代码块和额外文字。

模块（数组顺序即写作顺序）：
${JSON.stringify(blocks, null, 2)}

输出顺序与格式：
这不是线性大纲，而是一张可能跨段、回指和分支的论证关系图。按照写作顺序理解模块，但必须同时检查当前模块与全部其他模块的真实语义联系，不能只比较相邻模块。

先按写作顺序输出模块。每输出一个模块后，立即将它与所有已经输出的模块比较，并只输出你确认的关键直接关系；只有两个端点的模块行都已输出后才能输出关系行。全部模块输出后，再快速复查一次并补充此前遗漏的必要关系。每完成一个判断就立即换行输出，不能等到最后统一输出。

模块行格式：
{"type":"module","id":"模块id","focus":"10至20个汉字，说明当前正在检查这个模块的哪项内容作用"}
模块行只用于驱动画布上的实时闪烁反馈，因此必须简短，不要输出概括段落、narrative 或原文复述。

关系行格式：
{"type":"relation","sourceId":"主动提供证据、解释、质疑、限定或推进的模块id","targetId":"被支持、解释、质疑、限定或推进的模块id","relation":"由两段具体内容决定的2至6字关系词","importance":1到5的整数}
sourceId 与 targetId 必须体现语义方向，而不是写作先后。例如证据指向它支持的论点，原因指向它解释的论点，反论指向它质疑或限定的论点。不要强迫相邻模块连线，也不要遗漏有直接语义联系的非相邻模块。不要生成仅因位置相邻而成立的关系，也不要让所有模块彼此互连。关系词应具体，例如提供数据、解释机制、质疑前提、限定结论、转向实践。同一对模块的同一关系只输出一次。

关系图必须简洁：总共最多输出 ${maxRelations} 条最关键关系。优先保留“证据→核心论点、原因→核心论点、反论→它质疑或限定的论点、结论→它归纳的核心论点”等决定论证成立与否的联系。若 A→B、B→C 已足以说明推进过程，不要再输出仅可由这两条推导出的 A→C；不要输出重复、弱相关或装饰性关系。重要关系优先输出，importance=5 表示不可缺少，1 表示较弱。

全部模块与关键关系完成后，做一次内容把关，再输出最后一行：
- 论点是否清楚、可论证且范围适当；
- 原因是否真正解释了论点中的因果或机制；
- 证据是否相关、具体、可信且数量与力度足以支持观点，相关性不能被当成因果性；
- 反论是否直接回应核心论点，正文是否对它作出回应或合理限定；
- 结论是否覆盖所选段落的核心论点、主要机制、关键证据及必要限定，是否遗漏前文重要部分或加入未经支持的新判断；
- 是否存在逻辑跳跃、概念偷换、重复论点、缺少限定或过度概括。

最后一行格式：
{"type":"final","enhancements":[{"sourceId":"需要加强的模块id","targetId":"与问题直接相关的模块id","category":"证据充分性/结论覆盖度/机制解释/反论回应/论点边界/逻辑衔接之一","criterion":"本条具体检查标准","summary":"一句具体判断","suggestion":"可执行且不虚构事实的修改办法","suggestedText":"不虚构事实的加强后来源模块全文"}]}
增强点可以位于任意两个相关模块之间，sourceId 与 targetId 必须对应此前输出的一条关系。只要存在实质改进空间，4个及以上模块通常给出2至5条互不重复的增强建议；不要只检查相邻模块，也不要为了凑数虚构问题或事实。`;

    let textBuffer = "";
    const validIds = new Set(blocks.map((block) => block.id));
    const emitParsedLine = (rawLine) => {
      const line = String(rawLine || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
      if (!line) return;
      try {
        const item = JSON.parse(line);
        if (item.type === "module" && validIds.has(String(item.id))) {
          writeLine(res, {
            type: "module",
            id: String(item.id),
            focus: String(item.focus || item.summary || "检查模块在论证中的作用")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 24),
          });
        } else if (
          item.type === "relation" &&
          validIds.has(String(item.sourceId)) &&
          validIds.has(String(item.targetId)) &&
          String(item.sourceId) !== String(item.targetId)
        ) {
          writeLine(res, {
            type: "relation",
            sourceId: String(item.sourceId),
            targetId: String(item.targetId),
            relation: String(item.relation || "关联").replace(/\s+/g, " ").trim().slice(0, 8),
            importance: Math.max(1, Math.min(5, Number(item.importance) || 3)),
          });
        } else if (item.type === "final") {
          writeLine(res, {
            type: "final",
            enhancements: Array.isArray(item.enhancements) ? item.enhancements : [],
          });
        }
      } catch (error) {
        console.warn("跳过无法解析的审阅流行：", line, error.message);
      }
    };

    try {
      const stream = await openai.responses.create({
        model: WRITING_MODEL,
        input: prompt,
        reasoning: { effort: "low" },
        stream: true,
      });

      for await (const event of stream) {
        if (event.type !== "response.output_text.delta") continue;
        textBuffer += String(event.delta || "");
        const lines = textBuffer.split("\n");
        textBuffer = lines.pop() || "";
        lines.forEach(emitParsedLine);
      }
      if (textBuffer.trim()) emitParsedLine(textBuffer);
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

    const prompt = `你是一名严谨的中文论证写作编辑。用户刚刚点开一条潜在修改点，请重新阅读相关模块和上下文，给出真正针对内容的详细意见。

需要加强的模块：
${JSON.stringify(sourceBlock, null, 2)}

与它直接相关的模块：
${JSON.stringify(targetBlock, null, 2)}

所选内容的上下文：
${JSON.stringify(contextBlocks, null, 2)}

初步检查结果：
${JSON.stringify(issue, null, 2)}

输出要求：
1. 直接输出给作者看的中文意见，不要输出 JSON、Markdown、标题符号或思考过程。
2. 总长度控制在120至220个汉字，依次写清“判断：”“原因：”“修改建议：”三部分。
3. 必须具体说明这两个模块的内容如何关联，不能只说“可以加强”或复述模块标签。
4. 从内容上把关：证据是否足以支持观点、原因是否真正解释机制、反论是否回应核心论点、结论是否覆盖整段内容；只选择与当前问题有关的标准。
5. 不得虚构原文没有提供的数据、研究、来源或事实。`;

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

        const prompt = `你是一名严谨的中文论证写作编辑。请通读所有模块，并完成两个任务：

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
- suggestion 只指出一个最关键的内容问题。
- suggestedText 在保留来源模块原意的基础上补足逻辑，不得虚构数据或事实。

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

      const prompt = `你是一名严谨的中文论证写作编辑。请审阅一条论证关系。

检查标准：${criterion}
来源模块：${JSON.stringify({ id: sourceBlock.id, type: sourceBlock.type, text: sourceText }, null, 2)}
目标模块：${JSON.stringify({ id: targetBlock.id, type: targetBlock.type, text: targetText }, null, 2)}
上下文：${JSON.stringify(contextBlocks, null, 2)}

要求：
1. 根据具体内容判断，不得只复述模块类型。
2. summary 用一句简短的话直接判断这条关系。
3. suggestion 只说明内容上最值得加强的一点，例如原因机制偏弱、证据缺少来源、结论没有回扣关键证据。
4. 如果关系已经充分，suggestedText 必须原样返回来源模块文本，不要为了修改而修改。
5. 如果确需加强，suggestedText 在保留原意的基础上补足关键逻辑，不添加未经提供的数据或事实。

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
