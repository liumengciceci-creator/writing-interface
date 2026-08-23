import { API_BASE_URL } from "../apiConfig";

const REVIEW_URL = `${API_BASE_URL}/api/review-block-compatibility`;

function createLocalReview(firstBlock, secondBlock) {
  const firstText = String(firstBlock?.text || "").trim();
  const secondText = String(secondBlock?.text || "").trim();
  const firstLabel = String(firstBlock?.type || "前一模块");
  const secondLabel = String(secondBlock?.type || "后一模块");

  if (!firstText || !secondText) {
    return {
      score: 35,
      title: "内容衔接不完整",
      comment: `“${firstLabel}”与“${secondLabel}”中存在空白内容，暂时无法形成完整的逻辑关系。`,
      suggestedText: secondText,
    };
  }

  const hasTransition = /^(因此|所以|同时|此外|然而|但是|由此|具体而言|例如|这表明|相较之下)/.test(secondText);
  const score = hasTransition ? 88 : 68;
  const connector = firstBlock?.type === secondBlock?.type ? "进一步来说，" : "在此基础上，";

  return {
    score,
    title: hasTransition ? "模块衔接清楚" : "可补充显性衔接",
    comment: hasTransition
      ? `“${firstLabel}”与“${secondLabel}”之间已有明确的承接关系，可直接保留。`
      : `“${secondLabel}”的内容本身有效，但与前面的“${firstLabel}”之间缺少过渡提示，读者可能需要自行推断二者关系。`,
    suggestedText: hasTransition ? secondText : `${connector}${secondText}`,
  };
}

export async function reviewBlockCompatibility({
  firstBlock,
  secondBlock,
  signal,
}) {
  try {
    const response = await fetch(REVIEW_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstBlock, secondBlock }),
      signal,
    });

    if (!response.ok) throw new Error(`审阅请求失败：${response.status}`);

    const data = await response.json();
    const suggestedText = String(data?.suggestedText ?? data?.revision ?? "").trim();

    if (!data?.comment || !suggestedText) throw new Error("审阅结果不完整");

    return {
      score: Number(data.score) || 70,
      title: String(data.title || "模块匹配度建议"),
      comment: String(data.comment),
      suggestedText,
    };
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return createLocalReview(firstBlock, secondBlock);
  }
}
