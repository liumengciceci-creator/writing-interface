/**
 * 清理并限制传入文本。
 */
function normalizeText(value) {
  return String(value || "").trim();
}

/**
 * 将模块整理为 Prompt 中使用的格式。
 */
function formatBlock(
  label,
  block
) {
  return [
    `${label}：`,
    `ID：${block?.id ?? ""}`,
    `类型：${block?.type || "Unknown"}`,
    `文本：${normalizeText(block?.text)}`,
  ].join("\n");
}

/**
 * 根据长度值生成融合长度要求。
 *
 * length:
 * -100：明显压缩
 * 0：保持适中
 * 100：明显扩展
 */
function getLengthInstruction(
  length
) {
  const normalizedLength =
    Math.max(
      -100,
      Math.min(
        100,
        Number(length) || 0
      )
    );

  if (normalizedLength <= -70) {
    return [
      "显著压缩融合后的文本。",
      "只保留两个模块最核心的信息，",
      "避免重复和不必要的解释。",
    ].join("");
  }

  if (normalizedLength <= -30) {
    return [
      "适度压缩融合后的文本。",
      "删除重复表达，保持简洁。",
    ].join("");
  }

  if (normalizedLength < 30) {
    return [
      "融合后的文本长度保持适中，",
      "尽量接近两个原模块合并后的合理长度。",
    ].join("");
  }

  if (normalizedLength < 70) {
    return [
      "适度扩展融合后的文本，",
      "可以补充必要的逻辑说明，",
      "但不要加入与原文无关的信息。",
    ].join("");
  }

  return [
    "明显扩展融合后的文本，",
    "充分解释两个模块之间的逻辑关系，",
    "但不要编造事实或加入无关内容。",
  ].join("");
}

/**
 * 1. 拼接 Prompt
 *
 * 只生成一段用于连接两个模块的过渡句，
 * 不修改两个原模块。
 */
export function buildJoinPrompt({
  firstBlock,
  secondBlock,
}) {
  return `
你是一名专业的中文学术写作助手。

请根据下面两个写作模块，生成一段能够自然连接它们的过渡文本。

${formatBlock(
  "第一个模块",
  firstBlock
)}

${formatBlock(
  "第二个模块",
  secondBlock
)}

要求：
1. 只生成用于连接两个模块的过渡句。
2. 不要重复两个模块已有的完整内容。
3. 过渡句需要体现两个模块之间的逻辑关系。
4. 保持表达自然、准确、简洁。
5. 不要加入原文没有提供的新事实。
6. 通常控制在一句到两句话。
7. 不要输出解释、标题或 Markdown。

请严格返回以下 JSON 格式：
{
  "text": "生成的过渡句"
}
`.trim();
}

/**
 * 2. 融合 Prompt
 *
 * 将两个模块融合成一段新的完整文本。
 */
export function buildMergePrompt({
  firstBlock,
  secondBlock,
  options = {},
}) {
  const lengthInstruction =
    getLengthInstruction(
      options.length
    );

  return `
你是一名专业的中文学术写作助手。

请将下面两个写作模块在语义上进行融合，生成一个新的完整模块。

${formatBlock(
  "第一个模块",
  firstBlock
)}

${formatBlock(
  "第二个模块",
  secondBlock
)}

要求：
1. 保留两个模块的核心信息。
2. 消除重复、冲突和生硬拼接。
3. 重新组织句子，使融合后的文本成为一个连贯整体。
4. 不要只是简单地把两个原文前后连接。
5. 保持原有事实和主要观点，不要编造新信息。
6. ${lengthInstruction}
7. 不要输出解释、标题或 Markdown。

请严格返回以下 JSON 格式：
{
  "text": "融合后的完整文本"
}
`.trim();
}

/**
 * 3. 模仿 Prompt
 *
 * 第一个模块提供表达风格，
 * 第二个模块保留原意并按照第一个模块的风格改写。
 */
export function buildImitatePrompt({
  firstBlock,
  secondBlock,
}) {
  return `
你是一名专业的中文写作风格分析与改写助手。

请分析第一个模块的表达风格，然后按照这种风格改写第二个模块。

${formatBlock(
  "风格参考模块",
  firstBlock
)}

${formatBlock(
  "需要改写的模块",
  secondBlock
)}

要求：
1. 第一个模块只作为风格参考，不需要改写。
2. 第二个模块的核心含义和事实必须保持不变。
3. 模仿第一个模块的句式、语气、逻辑组织、正式程度和表达节奏。
4. 不要直接复制第一个模块的具体内容。
5. 不要增加原文没有提供的新事实。
6. 不要输出风格分析过程。
7. 不要输出解释、标题或 Markdown。

请严格返回以下 JSON 格式：
{
  "secondBlock": {
    "id": ${JSON.stringify(
      secondBlock?.id ?? ""
    )},
    "text": "按照第一个模块风格改写后的第二个模块"
  }
}
`.trim();
}

/**
 * 4A. 建立对比关系 Prompt
 *
 * 同时改写两个模块，
 * 让二者形成清晰的对比关系。
 */
export function buildContrastPrompt({
  firstBlock,
  secondBlock,
}) {
  return `
你是一名专业的中文学术写作助手。

请同时改写下面两个模块，使它们之间形成清晰、自然的对比关系。

${formatBlock(
  "第一个模块",
  firstBlock
)}

${formatBlock(
  "第二个模块",
  secondBlock
)}

要求：
1. 保留两个模块各自的核心含义和事实。
2. 通过措辞和逻辑组织突出二者的差异。
3. 可以合理使用“相比之下”“然而”“不同的是”等对比表达。
4. 不要把两个模块合并为一个模块。
5. 两个模块改写后仍然需要各自完整、独立。
6. 不要制造原文不存在的对立。
7. 不要加入新的事实。
8. 不要输出解释、标题或 Markdown。

请严格返回以下 JSON 格式：
{
  "firstBlock": {
    "id": ${JSON.stringify(
      firstBlock?.id ?? ""
    )},
    "text": "改写后的第一个模块"
  },
  "secondBlock": {
    "id": ${JSON.stringify(
      secondBlock?.id ?? ""
    )},
    "text": "改写后的第二个模块"
  }
}
`.trim();
}

/**
 * 4B. 建立因果关系 Prompt
 *
 * 选择顺序代表：
 * firstBlock = 原因
 * secondBlock = 结果
 */
export function buildCausePrompt({
  firstBlock,
  secondBlock,
}) {
  return `
你是一名专业的中文学术写作助手。

请同时改写下面两个模块，使它们形成清晰、自然的因果关系。

选择顺序规定：
第一个模块表示原因或前提。
第二个模块表示结果、影响或后续发展。

${formatBlock(
  "原因模块",
  firstBlock
)}

${formatBlock(
  "结果模块",
  secondBlock
)}

要求：
1. 保留两个模块各自的核心含义和事实。
2. 强化第一个模块作为原因、条件或前提的表达。
3. 强化第二个模块作为结果、影响或后续发展的表达。
4. 可以合理使用“因此”“由此”“从而”“这使得”等因果连接方式。
5. 不要把两个模块融合为一个模块。
6. 不要为了建立因果而编造原文不存在的事实。
7. 如果原始内容只能支持较弱的因果关系，应使用谨慎表达，例如“可能促使”“有助于”。
8. 不要输出解释、标题或 Markdown。

请严格返回以下 JSON 格式：
{
  "firstBlock": {
    "id": ${JSON.stringify(
      firstBlock?.id ?? ""
    )},
    "text": "改写后的原因模块"
  },
  "secondBlock": {
    "id": ${JSON.stringify(
      secondBlock?.id ?? ""
    )},
    "text": "改写后的结果模块"
  }
}
`.trim();
}

/**
 * 根据 operation 统一创建 Prompt。
 */
export function buildMultiBlockPrompt({
  operation,
  firstBlock,
  secondBlock,
  options = {},
}) {
  switch (operation) {
    case "join":
      return buildJoinPrompt({
        firstBlock,
        secondBlock,
      });

    case "merge":
      return buildMergePrompt({
        firstBlock,
        secondBlock,
        options,
      });

    case "imitate":
      return buildImitatePrompt({
        firstBlock,
        secondBlock,
      });

    case "relate": {
      const relationType =
        options.relationType ===
        "cause"
          ? "cause"
          : "contrast";

      if (
        relationType ===
        "cause"
      ) {
        return buildCausePrompt({
          firstBlock,
          secondBlock,
        });
      }

      return buildContrastPrompt({
        firstBlock,
        secondBlock,
      });
    }

    default:
      throw new Error(
        `不支持的双模块操作：${operation}`
      );
  }
}