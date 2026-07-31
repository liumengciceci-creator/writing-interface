import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { generateBlocksStream } from "../../api/generateBlocksStream";
import { estimateBlockHeight } from "./layout";

const DEBUG_AI_GENERATION = true;

function aiDebug(label, payload) {
  if (!DEBUG_AI_GENERATION) return;

  let serialized;

  try {
    serialized = JSON.stringify(payload, null, 2);
  } catch {
    serialized = String(payload);
  }

  console.log(`[AI Debug] ${label}\n${serialized}`);
}

function inspectGenerationText(value) {
  const text = String(value || "");
  const codePoints = Array.from(text)
    .slice(0, 160)
    .map((character) =>
      `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`
    );

  return {
    text,
    json: JSON.stringify(text),
    length: text.length,
    normalized: normalizeGenerationComparison(text),
    codePoints,
  };
}

function findRenderedGenerationBlock(blockId) {
  if (
    typeof document === "undefined"
  ) {
    return null;
  }

  const targetId =
    String(blockId);

  return (
    Array.from(
      document.querySelectorAll(
        "[data-semantic-block-id]"
      )
    ).find(
      (element) =>
        String(
          element.getAttribute(
            "data-semantic-block-id"
          ) || ""
        ) === targetId
    ) || null
  );
}

function inspectRenderedGenerationBlock(blockId) {
  const blockElement =
    findRenderedGenerationBlock(
      blockId
    );

  if (!blockElement) {
    return {
      found: false,
      text: inspectGenerationText(""),
      dataEditing: null,
      contentEditable: null,
      isActiveElement: false,
    };
  }

  const contentElement =
    blockElement.querySelector(
      "[data-semantic-block-content='true']"
    );

  const textElement =
    contentElement ||
    blockElement;

  return {
    found: true,
    text: inspectGenerationText(
      textElement.textContent || ""
    ),
    dataEditing:
      blockElement.getAttribute(
        "data-editing"
      ),
    contentEditable:
      blockElement.isContentEditable,
    isActiveElement:
      document.activeElement ===
      blockElement,
  };
}

function getLiveEditingText(block) {
  const rendered =
    inspectRenderedGenerationBlock(
      block?.id
    );

  const isEditing =
    rendered.found &&
    (
      rendered.dataEditing ===
        "true" ||
      rendered.contentEditable ||
      rendered.isActiveElement
    );

  if (!isEditing) {
    return String(
      block?.text || ""
    );
  }

  return String(
    rendered.text.text || ""
  )
    .replace(
      /[\u200B-\u200D\uFEFF]/g,
      ""
    )
    .replace(/\r\n?/g, "\n");
}

const TARGET_FORM_GUIDES = {
  Claim: [
    "当前模块是论点。",
    "只表达一个明确、可论证的核心主张，不要写成证据综述或大段背景介绍。",
    "根据上下文补足必要限定；主张已经清楚时保持一句或一个紧凑复句。",
  ],
  Evidence: [
    "当前模块是证据，必须直接支持相邻论点。",
    "严格区分证据种类：数据是量化结果；研究发现是研究观察或结论；事实是可核验事实；案例是具体对象、情境与结果；学者观点是具体学者提出的可归属观点。",
    "用户要求学者观点时，必须给出一位与主题真正相关、可识别的具体学者姓名，并准确概括其相关观点；不得写成‘相关学者普遍指出’。不要编造年份、论文题目、原话或精确出处；不能可靠确认时宁可不写年份。",
    "用户要求数据时才提供数字、比例、样本量或对比值；用户只要求研究发现或学者观点时，不要为了像证据而硬塞数字。",
  ],
  Reason: [
    "当前模块是推理。",
    "说明前述证据为什么支持论点，补足真正缺失的因果机制或逻辑联系。",
    "逻辑已经清楚时不要重复前文；确有断层时才适当展开。",
  ],
  Counter: [
    "当前模块是反论。",
    "提出与相邻论点直接相关的限制、反例或不同观点，不要转向无关主题。",
  ],
  Conclusion: [
    "当前模块是结论。",
    "必须重新阅读它之前的全部有效上下文，尤其纳入本轮刚生成的新论点、新证据和新推理，再重新收束，而不是沿用旧结论。",
    "回应核心论点并综合最重要的论证结果，不逐句复述，不引入新证据或新主题。",
    "篇幅与实际论证复杂度相称：论证简单时一句即可，信息较多时才使用必要的两句。",
  ],
  Question: [
    "当前模块是问题。",
    "输出一个清晰、可继续讨论的问题；只有在理解问题所必需时才增加限定。",
  ],
  Transition: [
    "当前模块是过渡。",
    "先判断前后内容的语义距离：关系已经清楚时只用一个连接短语或短分句；确有主题转折时才写一句简短过渡。",
    "只负责衔接，不复述前文，不提前展开后文，不添加证据、解释或总结。",
    "优先短于普通正文模块，通常不超过一个短句；能够删去的词都删去。",
  ],
};

const TYPE_PLACEHOLDER_TEXT = {
  Claim: "论点",
  Evidence: "证据",
  Reason: "推理",
  Counter: "反论",
  Conclusion: "结论",
  Question: "问题",
  Transition: "过渡",
};

function getBlockDirective(block) {
  const text = String(block?.text || "").trim();
  if (!text) return "";

  const placeholders = new Set(
    [
      block?.type,
      block?.label,
      TYPE_PLACEHOLDER_TEXT[block?.type],
    ]
      .filter(Boolean)
      .map((value) => normalizeGenerationComparison(value))
  );

  return placeholders.has(normalizeGenerationComparison(text))
    ? ""
    : text;
}

function getSpecialIntentGuides(text) {
  const normalized = String(text || "").trim();
  const guides = [];

  if (
    /学者|专家|研究者/.test(normalized) &&
    /观点|认为|指出|主张|看法|理论/.test(normalized)
  ) {
    guides.push(
      "本次用户明确要求‘学者观点’：正文中必须出现一位具体且真实相关的学者姓名，以及该学者与当前论点直接相关的观点。不要用泛称代替人名，也不要输出推荐或任务说明。"
    );
  }

  if (/数据|比例|百分比|样本|统计/.test(normalized)) {
    guides.push(
      "本次用户明确要求量化证据：结果必须包含与当前论点直接相关的数值信息；不得用笼统的‘研究表明’代替数据，也不得虚构无法确认的精确数字。"
    );
  }

  if (/研究发现|研究表明|实证研究/.test(normalized)) {
    guides.push(
      "本次用户明确要求研究发现：直接陈述研究观察或结论，并交代必要的研究对象或情境；除非用户同时要求数据，否则不要强行添加数字。"
    );
  }

  return guides;
}

function normalizeGenerationComparison(value) {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .replace(/[。！？.!?]+$/g, "")
    .trim();
}

function createGenerationInstruction(
  block,
  { ignoreExistingText = false } = {}
) {
  const userInput = ignoreExistingText
    ? ""
    : String(block?.text || "").trim();

  const formGuide =
    TARGET_FORM_GUIDES[block?.type] || [
      `当前模块类型为“${block?.type || "自定义模块"}”。`,
      "按照该模块在上下文中的实际功能生成可直接使用的正文。",
    ];

  return [
    "你正在生成文章中的一个语义模块。上下文按文章顺序提供。",
    `模块标签：${block?.type || "Unknown"}`,
    userInput
      ? `用户输入：${userInput}`
      : "用户没有提供草稿，请根据上下文补全这个模块。",
    ...getSpecialIntentGuides(userInput),
    ...formGuide,
    "执行规则：",
    "1. 用户输入决定具体内容与意图，模块标签决定其论证功能；不得把‘加数据’‘加学者观点’等命令原样写进正文。",
    "2. 输入是命令或占位语时直接执行；输入是半截句子时保留原意并自然续完；输入是完整草稿时以它为核心进行实质性改写和提升，不另起主题，但不得原样返回用户输入。",
    "3. 根据文章当前缺少的信息决定长度。表达完整后立即停止，不能为了显得充分而扩写。",
    "4. 保持与前后模块连贯，避免重复相邻内容。结论必须吸收所有在它之前、本轮新生成的有效内容。",
    "5. 不得编造精确来源、引文、年份或统计值。只输出可直接放进文本框的最终正文，不输出标题、分析、建议或 Markdown。",
  ].join("\n");
}

function getSearchPolicy(block, userInput) {
  const type = String(block?.type || "");
  const input = String(userInput || "");

  if (type === "Transition" || type === "Conclusion") {
    return "disabled";
  }

  if (type === "Evidence") {
    return "required";
  }

  if (
    /学者|专家|研究者|数据|统计|比例|百分比|样本|研究发现|研究表明|事实|案例|来源|文献|年份/.test(
      input
    )
  ) {
    return "required";
  }

  return "disabled";
}

function flattenBlockEntries(sections) {
  const entries = [];

  (sections || []).forEach((section, sectionIndex) => {
    (section?.blocks || []).forEach((block, blockIndex) => {
      entries.push({
        block,
        section,
        sectionIndex,
        blockIndex,
        documentIndex: entries.length,
      });
    });
  });

  return entries;
}

function patchBlocks(sections, updater) {
  return sections.map((section) => ({
    ...section,
    blocks: (section.blocks || []).map((block) => updater(block)),
  }));
}

function clearSingleBlockText(sections, blockId) {
  return patchBlocks(sections, (block) => {
    if (String(block.id) !== String(blockId)) return block;

    return {
      ...block,
      text: "",
      sources: [],
      height: estimateBlockHeight("", block.width),
      isGenerated: true,
    };
  });
}

function setSingleBlockSources(sections, blockId, sources) {
  const normalizedSources = Array.isArray(sources)
    ? sources
        .filter((source) => source?.url)
        .map((source) => ({
          url: String(source.url),
          title: String(source.title || source.url),
        }))
    : [];

  return patchBlocks(sections, (block) => {
    if (String(block.id) !== String(blockId)) return block;
    return {
      ...block,
      sources: normalizedSources,
    };
  });
}

function sanitizeGeneratedText(value) {
  return String(value || "")
    .replace(/\uE200?cite\uE202[^\uE201]*\uE201/g, "")
    .replace(/cite[^]*/g, "")
    .replace(/【\s*\d+(?:\s*[-–—,，]\s*\d+)*\s*†[^】]*】/g, "")
    .replace(/\[(?:\d+(?:\s*[,，-]\s*\d+)*|source|来源)\]\(https?:\/\/[^)]+\)/gi, "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, "$1")
    .replace(/<a\b[^>]*href=["']https?:\/\/[^"']+["'][^>]*>(.*?)<\/a>/gi, "$1")
    .replace(/\n+(?:来源|参考来源|参考资料|sources?)\s*[:：][\s\S]*$/i, "")
    .replace(/(?:\s*[（(]\s*)?(?:来源|source)\s*[:：]?\s*https?:\/\/[^\s）)]+[）)]?/gi, "")
    .replace(/https?:\/\/[^\s<>()\[\]{}]+/gi, "")
    .replace(/www\.[^\s<>()\[\]{}]+/gi, "")
    .replace(/\b(?:[a-z0-9-]+\.)+(?:com|org|edu|gov|net|cn|io|ai|co)(?:\/[^\s<>()\[\]{}]*)?/gi, "")
    .replace(/[（(]\s*[）)]/g, "")
    .replace(/\bturn\d+(?:search|fetch|view|open)\d+\b/gi, "")
    .replace(/[【\[]\s*\d+(?:\s*[,，-]\s*\d+)*\s*[】\]]/g, "")
    .replace(/\s+([，。！？；：,.!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function appendDeltaMapToBlocks(sections, deltaMap) {
  return patchBlocks(sections, (block) => {
    const delta = deltaMap.get(String(block.id));
    if (!delta) return block;

    const nextText = `${block.text || ""}${delta}`;

    return {
      ...block,
      text: nextText,
      height: estimateBlockHeight(nextText, block.width),
      isGenerated: true,
    };
  });
}

function collectGenerationTargets(entries, selectedIds) {
  const selectedSet = new Set((selectedIds || []).map(String));
  return entries
    .filter((entry) =>
      selectedSet.has(String(entry.block.id))
    )
    .map((entry) => ({
      ...entry,
      isAutomaticConclusion: false,
    }));
}

export function useStreamingGenerate({
  sections,
  setSections,
  selectedIds,
  setSelectedIds,
}) {
  const webSearchStorageKey =
    "editor-web-search-enabled-v2";

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingBlockIds, setGeneratingBlockIds] = useState([]);
  const [generatingBlinkOn, setGeneratingBlinkOn] = useState(false);
  const [generationStatus, setGenerationStatus] = useState("");
  const [webSearchEnabled, setWebSearchEnabled] = useState(() => {
    try {
      return window.localStorage.getItem(
        webSearchStorageKey
      ) === "true";
    } catch {
      return false;
    }
  });

  const cancelledRef = useRef(false);
  const blinkIntervalRef = useRef(null);
  const pendingDeltaMapRef = useRef(new Map());
  const rafIdRef = useRef(null);
  const expectedGeneratedTextRef = useRef(new Map());
  const lastPostRenderDebugKeyRef = useRef("");
  const domVerificationFrameRef = useRef(null);
  const controllerRef = useRef(null);

  const clearPendingFrame = useCallback(() => {
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const flushPendingDeltas = useCallback(() => {
    clearPendingFrame();
    if (!pendingDeltaMapRef.current.size) return;

    const flushMap = new Map(pendingDeltaMapRef.current);
    pendingDeltaMapRef.current = new Map();
    setSections((previous) =>
      appendDeltaMapToBlocks(previous, flushMap)
    );
  }, [clearPendingFrame, setSections]);

  const scheduleFlush = useCallback(() => {
    if (rafIdRef.current != null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      flushPendingDeltas();
    });
  }, [flushPendingDeltas]);

  const startBlinking = useCallback(() => {
    if (blinkIntervalRef.current) return;
    setGeneratingBlinkOn(true);
    blinkIntervalRef.current = setInterval(() => {
      setGeneratingBlinkOn((previous) => !previous);
    }, 280);
  }, []);

  const stopBlinking = useCallback(() => {
    if (blinkIntervalRef.current) {
      clearInterval(blinkIntervalRef.current);
      blinkIntervalRef.current = null;
    }
    setGeneratingBlinkOn(false);
  }, []);

  useEffect(() => () => {
    if (blinkIntervalRef.current) {
      clearInterval(blinkIntervalRef.current);
    }
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current);
    }
    if (
      domVerificationFrameRef.current !=
      null
    ) {
      cancelAnimationFrame(
        domVerificationFrameRef.current
      );
    }
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  useEffect(() => {
    if (!expectedGeneratedTextRef.current.size) return;

    const actualTextById = new Map(
      flattenBlockEntries(sections).map((entry) => [
        String(entry.block.id),
        String(entry.block.text || ""),
      ])
    );

    const checks = Array.from(
      expectedGeneratedTextRef.current.entries()
    ).map(([blockId, expectedText]) => {
      const actualText = actualTextById.get(blockId);
      const matches =
        normalizeGenerationComparison(actualText) ===
        normalizeGenerationComparison(expectedText);

      return {
        blockId,
        matches,
        expected: inspectGenerationText(expectedText),
        actual: inspectGenerationText(actualText),
      };
    });

    const debugKey = JSON.stringify(
      checks.map((check) => ({
        blockId: check.blockId,
        matches: check.matches,
        actual: check.actual.normalized,
      }))
    );

    if (debugKey === lastPostRenderDebugKeyRef.current) return;
    lastPostRenderDebugKeyRef.current = debugKey;

    aiDebug("07 post-render state verification", {
      allMatched: checks.every((check) => check.matches),
      checks,
    });

    if (checks.some((check) => !check.matches)) {
      console.error(
        "[AI Debug] 生成文字写入后被其他状态覆盖",
        checks.filter((check) => !check.matches)
      );
    }

    if (
      domVerificationFrameRef.current !=
      null
    ) {
      cancelAnimationFrame(
        domVerificationFrameRef.current
      );
    }

    domVerificationFrameRef.current =
      requestAnimationFrame(() => {
        domVerificationFrameRef.current =
          requestAnimationFrame(() => {
            domVerificationFrameRef.current =
              null;

            const domChecks =
              Array.from(
                expectedGeneratedTextRef.current.entries()
              ).map(
                ([blockId, expectedText]) => {
                  const rendered =
                    inspectRenderedGenerationBlock(
                      blockId
                    );

                  const matches =
                    rendered.found &&
                    rendered.text.normalized ===
                      normalizeGenerationComparison(
                        expectedText
                      );

                  return {
                    blockId,
                    matches,
                    expected:
                      inspectGenerationText(
                        expectedText
                      ),
                    dom: rendered,
                  };
                }
              );

            aiDebug(
              "08 actual DOM verification",
              {
                allMatched:
                  domChecks.every(
                    (check) =>
                      check.matches
                  ),
                checks: domChecks,
              }
            );

            if (
              domChecks.some(
                (check) =>
                  !check.matches
              )
            ) {
              console.error(
                "[AI Debug] React 状态正确，但页面实际文字仍不一致",
                domChecks.filter(
                  (check) =>
                    !check.matches
                )
              );
            }
          });
      });
  }, [sections]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        webSearchStorageKey,
        String(webSearchEnabled)
      );
    } catch {
      // localStorage 不可用时仍保留当前会话状态。
    }
  }, [
    webSearchEnabled,
    webSearchStorageKey,
  ]);

  const toggleWebSearch = useCallback(() => {
    if (isGenerating) return;
    setWebSearchEnabled((previous) => !previous);
  }, [isGenerating]);

  const stopGenerating = useCallback(() => {
    cancelledRef.current = true;
    controllerRef.current?.abort();
    controllerRef.current = null;
    stopBlinking();
    clearPendingFrame();
    pendingDeltaMapRef.current = new Map();
    setIsGenerating(false);
    setGeneratingBlockIds([]);
    setGenerationStatus("");
  }, [clearPendingFrame, stopBlinking]);

  const generateFromSelectedBlocks = useCallback(async () => {
    if (isGenerating) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    /**
     * contentEditable 输入先存在于浏览器 DOM，blur 后才会提交到 sections。
     * 如果用户在光标仍位于模块中时用快捷键生成，直接读取 sections 会把
     * 旧文字发送给 AI。这里先把正在编辑的真实 DOM 文字覆盖到本次请求
     * 快照中；非编辑模块仍以 React state 为唯一数据源。
     */
    const entries =
      flattenBlockEntries(
        sections
      ).map((entry) => {
        const liveText =
          getLiveEditingText(
            entry.block
          );

        if (
          liveText ===
          String(
            entry.block?.text || ""
          )
        ) {
          return entry;
        }

        return {
          ...entry,
          block: {
            ...entry.block,
            text: liveText,
          },
        };
      });
    const targets = collectGenerationTargets(entries, selectedIds);
    const uniqueSelectedIds = Array.from(
      new Set((selectedIds || []).map(String))
    );
    const resolvedTargetIds = targets.map((entry) =>
      String(entry.block.id)
    );
    const missingSelectedIds = uniqueSelectedIds.filter(
      (id) => !resolvedTargetIds.includes(id)
    );

    aiDebug("01 selection resolved", {
      selectedIds: uniqueSelectedIds,
      selectedCount: uniqueSelectedIds.length,
      resolvedTargetIds,
      resolvedTargetCount: resolvedTargetIds.length,
      missingSelectedIds,
      allDocumentBlockIds: entries.map((entry) =>
        String(entry.block.id)
      ),
    });

    if (missingSelectedIds.length) {
      console.error(
        "[AI Debug] 选中模块未能从文档数据中解析",
        { missingSelectedIds }
      );
      setGenerationStatus(
        `错误：${missingSelectedIds.length} 个选中模块未进入生成请求，请查看控制台 [AI Debug]。`
      );
      return;
    }

    if (!targets.length) {
      setGenerationStatus("错误：没有找到选中的模块。");
      return;
    }

    const targetIds = targets.map((entry) => String(entry.block.id));
    const selectedIdSet = new Set(targetIds);
    const requestIdToTarget = new Map(
      targets.map((entry, index) => [String(index + 1), entry])
    );
    const generatedTextByRequestId = new Map();
    const startedRequestIds = new Set();
    const completedRequestIds = new Set();

    const requestTargetBlocks = targets.map((entry, index) => {
      const directive = getBlockDirective(entry.block);

      return {
        id: index + 1,
        type: entry.block?.type || "Unknown",
        text: "",
        directive,
        // 保留 userInput 字段以兼容旧后端，但它与 directive 含义一致：
        // 都是用户希望模型执行的写作要求，而不是允许原样返回的正文。
        userInput: directive,
        userInputMode: directive ? "instruction" : "empty",
        requiredPrefix: "",
        instruction: [
          createGenerationInstruction(entry.block),
          directive
            ? `最高优先级写作指令：${directive}`
            : "当前文本只是空模块或标签占位文字，请依据上下文主动补全。",
          "本次会同时生成全部选中模块。必须结合其他目标模块的要求，先规划完整、连贯的段落，再为本模块输出新的正文。",
          "指令可能是命令、主题、半截句或已有草稿：都必须转化成新的最终正文，绝不能把指令本身原样返回。",
        ].join("\n"),
        searchPolicy:
          getSearchPolicy(entry.block, directive) === "required" &&
          webSearchEnabled
            ? "required"
            : "disabled",
      };
    });

    const requestContextBlocks = entries
      .filter((entry) => {
        const id = String(entry.block.id);
        if (selectedIdSet.has(id)) return false;
        if (entry.block?.placement === "floating") return false;
        return Boolean(String(entry.block?.text || "").trim());
      })
      .map((entry, index) => ({
        ...entry.block,
        id: targets.length + index + 1,
      }));

    aiDebug("02 request prepared", {
      targetCount: requestTargetBlocks.length,
      contextCount: requestContextBlocks.length,
      webSearchEnabled,
      targets: requestTargetBlocks.map((target, index) => ({
        requestId: target.id,
        realBlockId: String(targets[index].block.id),
        type: target.type,
        userInputMode: target.userInputMode,
        directive: inspectGenerationText(target.directive),
        searchPolicy: target.searchPolicy,
        userInput: inspectGenerationText(target.userInput),
        instruction: target.instruction,
      })),
    });

    const restoreAllTargets = () => {
      const originalsById = new Map(
        targets.map((entry) => [String(entry.block.id), entry.block])
      );

      setSections((previous) =>
        patchBlocks(previous, (block) => {
          const original = originalsById.get(String(block.id));
          if (!original) return block;

          return {
            ...block,
            text: original.text || "",
            sources: Array.isArray(original.sources)
              ? original.sources
              : [],
            height: estimateBlockHeight(
              original.text || "",
              block.width
            ),
            isGenerated: original.isGenerated,
          };
        })
      );
    };

    setSelectedIds?.([]);
    cancelledRef.current = false;
    pendingDeltaMapRef.current = new Map();
    expectedGeneratedTextRef.current = new Map();
    lastPostRenderDebugKeyRef.current = "";
    setIsGenerating(true);
    setGeneratingBlockIds(targetIds);
    setGenerationStatus(
      `正在整体分析 ${targets.length} 个模块及其上下文…`
    );
    startBlinking();

    try {
      await generateBlocksStream({
        targetBlocks: requestTargetBlocks,
        contextBlocks: requestContextBlocks,
        signal: controller.signal,
        onEvent: (event) => {
          if (cancelledRef.current) return;

          if (event.type !== "chunk") {
            aiDebug(`03 stream event: ${event.type}`, event);
          }

          if (event.type === "error") {
            aiDebug("ERROR server event", {
              error: event.error,
              details: event.details,
            });
            throw new Error(event.error || "生成服务返回错误");
          }

          if (event.type === "debug") {
            aiDebug(`SERVER ${event.stage || "debug"}`, event);
            return;
          }

          if (event.type === "search_progress") {
            setGenerationStatus(
              event.phase === "completed"
                ? "网页搜索完成，正在整体组织段落…"
                : "正在搜索网页并核对资料…"
            );
            return;
          }

          if (event.type === "sources") {
            const sourceTarget =
              requestIdToTarget.get(String(event.id)) || targets[0];
            setSections((previous) =>
              setSingleBlockSources(
                previous,
                sourceTarget.block.id,
                event.sources
              )
            );
            return;
          }

          if (
            event.type !== "block_start" &&
            event.type !== "chunk" &&
            event.type !== "block_done"
          ) {
            return;
          }

          const requestId = String(event.id);
          const targetEntry = requestIdToTarget.get(requestId);
          if (!targetEntry) {
            throw new Error(`模型返回了未知模块：${requestId}`);
          }

          const realBlockId = String(targetEntry.block.id);
          const targetIndex = Number(requestId) - 1;

          if (
            (event.type === "block_start" || event.type === "chunk") &&
            !startedRequestIds.has(requestId)
          ) {
            startedRequestIds.add(requestId);
            generatedTextByRequestId.set(requestId, "");
            setGenerationStatus(
              `正在流式生成 ${targetIndex + 1}/${targets.length} 个模块…`
            );
            setGeneratingBlockIds((previousIds) =>
              previousIds.filter((id) => String(id) !== realBlockId)
            );
            setSections((previous) =>
              clearSingleBlockText(previous, realBlockId)
            );
          }

          if (event.type === "chunk") {
            const delta = String(event.delta || "");
            generatedTextByRequestId.set(
              requestId,
              `${generatedTextByRequestId.get(requestId) || ""}${delta}`
            );
            const pending =
              pendingDeltaMapRef.current.get(realBlockId) || "";
            pendingDeltaMapRef.current.set(realBlockId, pending + delta);
            scheduleFlush();
          }

          if (event.type === "block_done") {
            completedRequestIds.add(requestId);
            aiDebug("04 block stream completed", {
              requestId,
              realBlockId,
              type: targetEntry.block?.type,
              original: inspectGenerationText(targetEntry.block?.text),
              streamed: inspectGenerationText(
                generatedTextByRequestId.get(requestId) || ""
              ),
            });
          }
        },
      });

      flushPendingDeltas();

      const cleanedTextByRealId = new Map();

      for (let index = 0; index < targets.length; index += 1) {
        const requestId = String(index + 1);
        const targetEntry = targets[index];
        const originalText = String(targetEntry.block?.text || "").trim();
        const cleanedText = sanitizeGeneratedText(
          generatedTextByRequestId.get(requestId) || ""
        );

        const originalInspection = inspectGenerationText(originalText);
        const cleanedInspection = inspectGenerationText(cleanedText);
        const consideredIdentical = Boolean(
          originalText &&
          cleanedInspection.normalized === originalInspection.normalized
        );

        aiDebug("05 block validation", {
          requestId,
          realBlockId: String(targetEntry.block.id),
          type: targetEntry.block?.type,
          receivedBlockDone: completedRequestIds.has(requestId),
          original: originalInspection,
          cleaned: cleanedInspection,
          consideredIdentical,
        });

        if (!completedRequestIds.has(requestId) || !cleanedText) {
          throw new Error(`第 ${index + 1} 个模块没有返回完整正文`);
        }

        if (
          originalText &&
          consideredIdentical
        ) {
          throw new Error(`第 ${index + 1} 个模块仍然原样返回了输入文字`);
        }

        cleanedTextByRealId.set(
          String(targetEntry.block.id),
          cleanedText
        );
      }

      expectedGeneratedTextRef.current = new Map(cleanedTextByRealId);

      aiDebug("06A committing generated text", {
        blocks: Array.from(cleanedTextByRealId.entries()).map(
          ([blockId, text]) => ({
            blockId,
            text: inspectGenerationText(text),
          })
        ),
      });

      setSections((previous) =>
        patchBlocks(previous, (block) => {
          const cleanedText = cleanedTextByRealId.get(String(block.id));
          if (cleanedText == null) return block;

          return {
            ...block,
            text: cleanedText,
            height: estimateBlockHeight(cleanedText, block.width),
            isGenerated: true,
          };
        })
      );

      setGenerationStatus(`生成完成 ${targets.length}/${targets.length}`);
      aiDebug("06 generation succeeded", {
        targetIds,
        completedRequestIds: Array.from(completedRequestIds),
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }
      console.error("[useStreamingGenerate] 整体生成失败：", error);
      aiDebug("ERROR generation stopped", {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        selectedIds: uniqueSelectedIds,
        resolvedTargetIds,
        startedRequestIds: Array.from(startedRequestIds),
        completedRequestIds: Array.from(completedRequestIds),
        generatedTexts: Array.from(
          generatedTextByRequestId.entries()
        ).map(([requestId, text]) => ({
          requestId,
          text: inspectGenerationText(text),
        })),
      });
      clearPendingFrame();
      pendingDeltaMapRef.current = new Map();
      expectedGeneratedTextRef.current = new Map();
      restoreAllTargets();
      setSelectedIds?.(targetIds);
      setGenerationStatus(
        `错误：整体生成已停止。${error?.message || "生成失败"}`
      );
    } finally {
      stopBlinking();
      clearPendingFrame();
      pendingDeltaMapRef.current = new Map();
      setIsGenerating(false);
      setGeneratingBlockIds([]);
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [
    sections,
    selectedIds,
    setSections,
    setSelectedIds,
    scheduleFlush,
    flushPendingDeltas,
    startBlinking,
    stopBlinking,
    clearPendingFrame,
    webSearchEnabled,
  ]);

  return {
    isGenerating,
    generatingBlockIds,
    generatingBlinkOn,
    generationStatus,
    webSearchEnabled,
    toggleWebSearch,
    generateFromSelectedBlocks,
    stopGenerating,
  };
}
