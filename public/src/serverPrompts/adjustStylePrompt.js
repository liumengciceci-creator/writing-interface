const STYLE_INSTRUCTIONS = {
  logical: `
Improve the logical structure of the text.

Requirements:
- make the progression of ideas clearer;
- strengthen connections between sentences;
- remove logical jumps or ambiguous references;
- preserve the original meaning and evidence.
`.trim(),

  explanatory: `
Strengthen the explanatory quality of the text.

Requirements:
- explain important ideas more clearly;
- clarify how and why the stated point works;
- make implicit reasoning more explicit;
- do not introduce unrelated information.
`.trim(),

  causal: `
Strengthen the causal relationships in the text.

Requirements:
- clearly identify causes, mechanisms, and consequences;
- use appropriate causal transitions;
- avoid claiming causation when the original text only supports association;
- preserve the original argument.
`.trim(),

  evidence: `
Strengthen the use and presentation of evidence.

Requirements:
- foreground the supporting evidence already contained in the text;
- clarify how the evidence supports the main point;
- improve evidential wording and analytical connection;
- do not invent sources, statistics, quotations, or factual claims.
`.trim(),

  temporal: `
Strengthen the chronological or temporal sequence.

Requirements:
- organize events or stages in a clearer order;
- use appropriate temporal transitions;
- clarify what happens before, during, and after;
- preserve the original meaning.
`.trim(),

  critical: `
Strengthen the critical and analytical quality of the text.

Requirements:
- identify limitations, assumptions, tensions, or alternative interpretations;
- avoid merely making the tone negative;
- retain the original central argument;
- do not introduce unsupported criticism.
`.trim(),

  comparison: `
Strengthen the comparative structure of the text.

Requirements:
- make similarities and differences more explicit;
- clarify the dimensions being compared;
- use suitable comparative transitions;
- do not introduce new comparison subjects.
`.trim(),

  subjective: `
Make the text more explicitly subjective and position-based.

Requirements:
- foreground the writer's interpretation or perspective;
- use academically appropriate first-person or evaluative phrasing where suitable;
- preserve the original argument;
- do not make the language informal.
`.trim(),

  viewpoint: `
Strengthen the expression of the central viewpoint.

Requirements:
- make the writer's main position more explicit;
- foreground the key evaluative or argumentative claim;
- reduce wording that weakens or obscures the position;
- retain necessary qualifications.
`.trim(),

  objective: `
Make the text more objective and academically neutral.

Requirements:
- reduce unnecessarily personal or emotional wording;
- use precise, evidence-oriented language;
- preserve appropriate qualifications and uncertainty;
- do not remove the original argument.
`.trim(),
};

export function buildAdjustStylePrompt({
  text,
  type,
  style,
  styleLabel,
  isCustom,
}) {
  const normalizedStyle =
    String(style || "").trim();

  const normalizedStyleLabel =
    String(styleLabel || "").trim();

  const styleInstruction =
    isCustom === true
      ? `
Apply the following user-defined writing instruction:

${normalizedStyle}
`.trim()
      : STYLE_INSTRUCTIONS[normalizedStyle] ||
        `
Revise the text according to this requested style:

${normalizedStyleLabel || normalizedStyle}
`.trim();

  return `
You are an academic writing assistant for a modular writing interface.

BLOCK TYPE:
${type || "Unknown"}

ORIGINAL TEXT:
${text}

REQUESTED STYLE:
${normalizedStyleLabel || normalizedStyle}

STYLE INSTRUCTION:
${styleInstruction}

Requirements:
1. Keep the same language as the original text.
2. Preserve the original core meaning and argument.
3. Preserve the rhetorical function of the block type.
4. Keep the length reasonably close to the original.
5. Improve only the requested stylistic dimension.
6. Do not invent facts, sources, quotations, references, or statistics.
7. Do not introduce unrelated arguments.
8. Output only the revised text.
9. Do not output markdown, quotation marks, or explanations.
`.trim();
}