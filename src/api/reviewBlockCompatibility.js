import { API_BASE_URL } from "../apiConfig";

const REVIEW_URL = `${API_BASE_URL}/api/review-block-compatibility`;

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

  return {
    score: connected ? 86 : 64,
    title: connected ? rule.goodTitle : rule.weakTitle,
    summary: connected ? `${rule.goodTitle}。` : `${rule.weakTitle}，可以进一步加强。`,
    comment: connected ? `${rule.goodTitle}。` : `${rule.weakTitle}，可以进一步加强。`,
    suggestedText: connected || sourceText.startsWith(rule.connector) ? sourceText : `${rule.connector}${sourceText}`,
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
      summary: String(data.summary || data.comment).split(/[。！？!?]/)[0].slice(0, 48) + "。",
      suggestedText,
    };
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return createLocalReview({ relationType, sourceBlock, targetBlock });
  }
}
