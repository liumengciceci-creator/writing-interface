import { API_BASE_URL } from "../apiConfig";
import { generateBlocksStream } from "./generateBlocksStream";

const REVIEW_URL = `${API_BASE_URL}/api/review-block-compatibility`;
const REVIEW_STREAM_URL = `${API_BASE_URL}/api/review-framework-stream`;
const REVIEW_DETAIL_STREAM_URL = `${API_BASE_URL}/api/review-enhancement-detail-stream`;
const APPLY_REVIEW_INSTRUCTION_URL = `${API_BASE_URL}/api/apply-review-instruction`;
const APPLY_REVIEW_INSTRUCTION_STREAM_URL = `${API_BASE_URL}/api/apply-review-instruction-stream`;

export async function reviewArgumentFrameworkStream({
  blocks = [],
  templates = [],
  onEvent,
  signal,
}) {
  const response = await fetch(REVIEW_STREAM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks, templates }),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `整体审阅失败：${response.status}`);
  }
  if (!response.body) throw new Error("当前浏览器不支持流式审阅");

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "error") throw new Error(event.message || "整体审阅失败");
        await onEvent?.(event);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) await onEvent?.(JSON.parse(buffer));
  } finally {
    reader.releaseLock();
  }
}

/**
 * 接受“两个模块之间缺少一个模块”的审阅意见后，复用正文生成流，
 * 为刚插入的模块生成内容。这里只构造一个明确的单模块任务，真正的
 * 流式协议和返回校验仍由 generateBlocksStream 统一负责。
 */
export async function generateReviewInsertedBlockStream({
  instruction,
  insertType,
  insertLabel,
  sourceBlock,
  targetBlock,
  contextBlocks = [],
  onEvent,
  signal,
}) {
  const normalizedInstruction = String(instruction || "").trim();
  const normalizedType = String(insertType || "Generated").trim();
  const normalizedLabel = String(insertLabel || normalizedType).trim();

  if (!normalizedInstruction) {
    throw new Error("缺少新增模块的生成指令");
  }

  const targetId = "review-insert-target";
  const generationInstruction = [
    "你正在为一篇论证文本生成一个审阅后确认缺失的新模块。",
    `新模块类型：${normalizedType}`,
    `新模块标签：${normalizedLabel}`,
    `前一个模块：${String(sourceBlock?.text || "").trim()}`,
    `后一个模块：${String(targetBlock?.text || "").trim()}`,
    `审阅确认的补充要求：${normalizedInstruction}`,
    "生成能够真正补足这处论证缺口的正文，使前后模块在逻辑上成立并自然衔接。",
    "只使用上下文已经出现的观点和材料；不得虚构数据、研究、来源、案例或外部事实。",
    "如果是过渡模块，只写完成衔接所必需的短语或短句；如果是原因、论点、反论、对比或结论模块，则完成该类型真正承担的论证功能。",
    "只输出可直接写入新模块的正文，不输出标签、解释、修改说明、Markdown或引号，也不得原样复述审阅指令。",
  ].join("\n");

  return generateBlocksStream({
    targetBlocks: [
      {
        id: targetId,
        type: normalizedType,
        text: "",
        directive: normalizedInstruction,
        originalText: normalizedLabel,
        userInput: normalizedInstruction,
        userInputMode: "instruction",
        requiredPrefix: "",
        instruction: generationInstruction,
        searchPolicy: "disabled",
      },
    ],
    contextBlocks: (Array.isArray(contextBlocks) ? contextBlocks : [])
      .filter((block) => block && String(block.text || "").trim())
      .map((block, index) => ({
        ...block,
        id: `review-context-${index + 1}`,
      })),
    onEvent,
    signal,
  });
}

export async function streamReviewEnhancementDetail({
  issue,
  sourceBlock,
  targetBlock,
  contextBlocks = [],
  onDelta,
  signal,
}) {
  const response = await fetch(REVIEW_DETAIL_STREAM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ issue, sourceBlock, targetBlock, contextBlocks }),
    signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `详细审阅失败：${response.status}`);
  }
  if (!response.body) throw new Error("当前浏览器不支持流式审阅");

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "error") {
          throw new Error(event.message || "详细审阅失败");
        }
        if (event.type === "delta") onDelta?.(String(event.delta || ""));
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      const event = JSON.parse(buffer);
      if (event.type === "error") throw new Error(event.message || "详细审阅失败");
      if (event.type === "delta") onDelta?.(String(event.delta || ""));
    }
  } finally {
    reader.releaseLock();
  }
}

export async function applyReviewInstruction({
  instruction,
  sourceBlock,
  targetBlock,
  contextBlocks = [],
  signal,
}) {
  const response = await fetch(APPLY_REVIEW_INSTRUCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction, sourceBlock, targetBlock, contextBlocks }),
    signal,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `执行修改指令失败：${response.status}`);
  }

  const text = String(data.text || "").trim();
  if (!text) throw new Error("模型没有返回修改后的模块内容");
  return text;
}

export async function applyReviewInstructionStream({
  instruction,
  sourceBlock,
  targetBlock,
  contextBlocks = [],
  onEvent,
  signal,
}) {
  const response = await fetch(APPLY_REVIEW_INSTRUCTION_STREAM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction, sourceBlock, targetBlock, contextBlocks }),
    signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `执行修改指令失败：${response.status}`);
  }
  if (!response.body) throw new Error("当前浏览器不支持流式修改");

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let completed = false;

  const dispatch = async (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "error") {
      throw new Error(event.message || "执行修改指令失败");
    }
    if (event.type === "done") completed = true;
    await onEvent?.(event);
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) await dispatch(line);
    }

    buffer += decoder.decode();
    if (buffer.trim()) await dispatch(buffer);
    if (!completed) throw new Error("修改结果未完整返回，请重试");
  } finally {
    reader.releaseLock();
  }
}

function cleanOneSentence(value, fallback = "尚未填写内容") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  const sentence = text.match(/^.*?[。！？!?](?=\s|$)/)?.[0] || text;
  return sentence.replace(/\s+/g, " ").trim();
}

function cleanParagraph(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function compactFallbackSummary(text, type) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^(例如|比如|因此|所以|综上|此外|同时|然而|但是|这是因为)[，,:：\s]*/, "")
    .trim();
  if (!normalized) return "尚未填写内容";

  const clauses = normalized.split(/[。！？!?；;]/).map((item) => item.trim()).filter(Boolean);
  const preferredPatterns = {
    Claim: /会|能够|可能|导致|影响|削弱|增强|取代|依赖/,
    Reason: /因为|由于|导致|减少|缺少|接受|依赖|训练/,
    Evidence: /学生|研究|数据|案例|调查|实验|结果|直接|核验/,
    Counter: /然而|但是|相反|局限|不足|并非/,
    Compare: /相比|不同|差异|而/,
    Conclusion: /因此|总体|最终|导致|表明|依赖|削弱/,
  };
  const chosen = clauses.find((clause) => preferredPatterns[type]?.test(clause)) || clauses[0] || normalized;
  const compact = chosen
    .replace(/^(例如|比如|因此|所以|综上|此外|同时|然而|但是|这是因为)[，,:：\s]*/, "")
    .replace(/[“”"']/g, "")
    .trim();
  return compact.length > 30 ? `${compact.slice(0, 29)}…` : compact;
}

function isUsableModelSummary(summary, original) {
  const result = cleanParagraph(summary).replace(/[。！？!?]$/, "");
  const source = cleanParagraph(original).replace(/[。！？!?]$/, "");
  if (!result || result.length > 32) return false;
  if (source.length > 32 && (result === source || source.startsWith(result) && result.length > 28)) return false;
  return true;
}

function createFrameworkFallback(blocks, relations) {
  const moduleSummaries = {};
  blocks.forEach((block) => {
    moduleSummaries[String(block.id)] = compactFallbackSummary(block.text, block.type);
  });
  return {
    moduleSummaries,
    graphEdges: [],
    enhancements: [],
    frameworkSummary: relations.length
      ? "所选模块已经形成基本论证链，但整体关系仍需结合逐条审阅结果进一步判断。"
      : "所选模块尚未形成可识别的完整论证关系。",
  };
}

/**
 * 让模型先通读全部所选模块，再统一概括节点并判断整套论证框架。
 * 这一步与逐条关系审阅分开，避免用模块类型机械拼接总体总结。
 */
export async function reviewArgumentFramework({ blocks = [], relations = [], signal }) {
  const compactRelations = relations.map(({ relationType, relationLabel, criterion, sourceBlock, targetBlock }) => ({
    relationType,
    relationLabel,
    criterion,
    sourceId: String(sourceBlock?.id),
    targetId: String(targetBlock?.id),
  }));

  try {
    const response = await fetch(REVIEW_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewMode: "argumentFramework",
        blocks,
        relations: compactRelations,
        outputRequirements: {
          moduleSummaries: "逐个理解模块原文后，提炼核心意思。每项只写一句15至28个汉字的概括判断，不照抄原句，不保留例子、过程细节或连接词，禁止超过32个汉字",
          graphEdges: "根据实际语义自主识别模块之间的直接联系，为每条联系生成内容相关的短关系词，不使用固定关系分类",
          frameworkSummary: "使用‘这里你提出了……基于这一点……根据这个……最后你……’的连续语言具体讲述写作过程，再判断整体衔接",
        },
      }),
      signal,
    });
    if (!response.ok) throw new Error(`整体框架审阅失败：${response.status}`);
    const data = await response.json();
    const rawSummaries = data?.moduleSummaries || data?.summaries;
    const frameworkSummary = cleanParagraph(data?.frameworkSummary || data?.overallAnalysis);
    if (!rawSummaries || typeof rawSummaries !== "object" || !frameworkSummary) throw new Error("整体框架审阅结果不完整");

    const moduleSummaries = {};
    blocks.forEach((block) => {
      const generated = cleanOneSentence(rawSummaries[String(block.id)] ?? rawSummaries[block.id], "");
      moduleSummaries[String(block.id)] = isUsableModelSummary(generated, block.text)
        ? generated.replace(/[。！？!?]$/, "")
        : compactFallbackSummary(block.text, block.type);
    });
    const graphEdges = Array.isArray(data?.graphEdges) ? data.graphEdges : [];
    const enhancements = Array.isArray(data?.enhancements) ? data.enhancements : [];
    return { moduleSummaries, graphEdges, enhancements, frameworkSummary };
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    console.error("整体论证框架调用失败，已使用本地保底概括：", error);
    return createFrameworkFallback(blocks, relations);
  }
}

const RELATION_RULES = {
  reasonExplainsClaim: { title: "原因是否解释论点", goodTitle: "原因能够解释论点", weakTitle: "原因与论点的解释关系不够明确", connector: "之所以如此，是因为" },
  evidenceSupportsClaim: { title: "证据是否支持论点", goodTitle: "证据能够支持论点", weakTitle: "证据与论点的支持关系不够明确", connector: "这一论点可以从以下事实得到支持：" },
  counterChallengesClaim: { title: "反论是否回应论点", goodTitle: "反论能够回应论点", weakTitle: "反论尚未直接回应论点", connector: "针对这一论点，也需要考虑：" },
  compareClarifiesClaim: { title: "对比是否阐明论点", goodTitle: "对比能够阐明论点", weakTitle: "对比与论点的关联不够明确", connector: "与之相比，" },
  conclusionSummarizesDocument: { title: "结论是否总结全文", goodTitle: "结论能够总结全文", weakTitle: "结论尚未充分回扣全文", connector: "综上，" },
};

function getTextUnits(text) {
  const normalized = String(text || "").replace(/[，。；：、！？,.!?;:\s]/g, "");
  const units = new Set();
  for (let index = 0; index < normalized.length - 1; index += 1) units.add(normalized.slice(index, index + 2));
  return units;
}

function compactTarget(text) {
  const firstClause = String(text || "").split(/[，,。；;：:！？!?]/).find(Boolean) || "该论点";
  return firstClause.trim();
}

function createContentSuggestion(relationType, sourceText, targetText) {
  const target = compactTarget(targetText);
  const cleanSource = sourceText.replace(/[。！？!?]+$/, "");

  if (relationType === "reasonExplainsClaim") {
    return {
      suggestion: "这个原因偏概括，可以补充它如何具体导致论点成立。",
      text: `${cleanSource}。这一机制会直接影响${target}，从而解释该论点为何成立。`,
    };
  }
  if (relationType === "evidenceSupportsClaim") {
    return {
      suggestion: "这项证据还可以更具体，建议补充对象、数据来源或实际结果。",
      text: `${cleanSource}。这一具体事实为“${target}”提供了直接支持。`,
    };
  }
  if (relationType === "counterChallengesClaim") {
    return {
      suggestion: "这个反论可以进一步说明原论点在哪些条件下不成立。",
      text: `${cleanSource}。这一反面情况表明，原论点需要限定适用条件。`,
    };
  }
  if (relationType === "compareClarifiesClaim") {
    return {
      suggestion: "这组对比可以补充明确的比较维度，使差异更有解释力。",
      text: `${cleanSource}。从作用方式和结果来看，这一差异进一步阐明了“${target}”。`,
    };
  }
  return {
    suggestion: "这个结论可以更明确地回扣核心论点，并概括原因与证据。",
    text: `${cleanSource}。总体而言，上述原因与证据共同说明了全文的核心判断。`,
  };
}

function createLocalReview({ relationType, sourceBlock, targetBlock }) {
  const rule = RELATION_RULES[relationType] || RELATION_RULES.reasonExplainsClaim;
  const sourceText = String(sourceBlock?.text || "").trim();
  const targetText = String(targetBlock?.text || "").trim();

  if (!sourceText || !targetText) {
    return { score: 35, title: `${rule.title}：内容不完整`, summary: "相关模块内容不完整，暂时无法判断这条关系。", comment: "相关模块内容不完整，暂时无法判断这条关系。", suggestedText: sourceText };
  }

  const sourceUnits = getTextUnits(sourceText);
  const targetUnits = getTextUnits(targetText);
  let overlap = 0;
  sourceUnits.forEach((unit) => { if (targetUnits.has(unit)) overlap += 1; });

  const explicitRelation = /因为|由于|表明|说明|证明|例如|数据显示|相比|然而|综上|因此|由此/.test(sourceText);
  const connected = explicitRelation || overlap >= 2;
  const contentSuggestion = createContentSuggestion(relationType, sourceText, targetText);

  return {
    score: connected ? 86 : 64,
    title: connected ? rule.goodTitle : rule.weakTitle,
    summary: connected ? `${rule.goodTitle}。` : `${rule.weakTitle}，可以进一步加强。`,
    comment: connected ? `${rule.goodTitle}。` : `${rule.weakTitle}，可以进一步加强。`,
    suggestion: contentSuggestion.suggestion,
    suggestedText: contentSuggestion.text,
  };
}

export async function reviewBlockCompatibility({ relationType, sourceBlock, targetBlock, contextBlocks = [], signal }) {
  try {
    const response = await fetch(REVIEW_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relationType, sourceBlock, targetBlock, contextBlocks }),
      signal,
    });
    if (!response.ok) throw new Error(`审阅请求失败：${response.status}`);

    const data = await response.json();
    const suggestedText = String(data?.suggestedText ?? data?.revision ?? "").trim();
    if (!data?.comment || !suggestedText) throw new Error("审阅结果不完整");

    return {
      score: Number(data.score) || 70,
      title: String(data.title || RELATION_RULES[relationType]?.title || "论证关系建议"),
      comment: String(data.comment),
      summary: cleanOneSentence(data.summary || data.comment),
      suggestion: String(data.suggestion || data.recommendation || "可以进一步补充具体内容，使这条论证关系更充分。"),
      suggestedText,
    };
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return createLocalReview({ relationType, sourceBlock, targetBlock });
  }
}
