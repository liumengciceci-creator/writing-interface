import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { generateBlocksStream } from "../../api/generateBlocksStream";
import {
  createResearchActionId,
  logResearchEvent,
} from "../../research/researchLogger.js";
import {
  getGenerationSnapshotText,
  inspectRenderedGenerationBlock,
} from "./generationSnapshot";
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

const TARGET_FORM_GUIDES = {
  Title: [
    "当前模块是标题或章节标题。",
    "将用户输入润色为简洁、明确、能够概括相邻内容的标题；用户只给出主题时，直接生成一个合适的标题。",
    "只输出标题文字，不写解释、正文、冒号后的长段落或多个备选项。",
    "通常控制在一个短语或一个短句内；中文标题一般不超过20个汉字，英文标题一般不超过12个单词。",
    "除非标题本身是疑问句，否则结尾不添加句号。",
  ],
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
    "当前模块是原因。",
    "说明相关现象、观点或结果为何发生，补足真正缺失的因果机制或逻辑联系。",
    "逻辑已经清楚时不要重复前文；确有断层时才适当展开。",
  ],
  Counter: [
    "当前模块是反论。",
    "提出与相邻论点直接相关的限制、反例或不同观点，不要转向无关主题。",
  ],
  Compare: [
    "当前模块是对比。",
    "围绕同一个明确维度比较相邻的两个或多个对象、观点、条件或结果。",
    "既指出有意义的差异，也可在必要时说明关键共同点；不要分别写成互不关联的背景介绍。",
    "只保留对当前论证有作用的比较结果，不扩展成冗长综述。",
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
  Title: "标题",
  Claim: "论点",
  Evidence: "证据",
  Reason: "原因",
  Counter: "反论",
  Compare: "对比",
  Conclusion: "结论",
  Question: "问题",
  Transition: "过渡",
};

function getBlockDirective(block) {
  const storedDirective = String(
    block?.generationDirective || ""
  ).trim();
  if (storedDirective) return storedDirective;

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

function getSpecialIntentGuides(text, { webSearchAllowed = false } = {}) {
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
      webSearchAllowed
        ? "本次用户明确要求量化证据：检索并核验与当前论点直接相关的研究或调查，再写出研究对象、样本或测量范围以及关键数值；不得用笼统的‘研究表明’代替数据，也不得虚构无法确认的精确数字。即使用户只输入‘数据’二字，也要把它当作生成命令执行，绝不能原样返回。"
        : "本次用户明确要求量化证据，但网页搜索当前关闭。结合现有上下文和你有较高把握的知识生成完整证据句；不要声称已经检索或核验来源，不要虚构论文题目、年份或无法确认的精确数字，也绝不能只返回‘数据’二字。"
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
  { ignoreExistingText = false, webSearchAllowed = false } = {}
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
    ...getSpecialIntentGuides(userInput, { webSearchAllowed }),
    ...formGuide,
    "执行规则：",
    "1. 用户输入决定具体内容与意图，模块标签决定其论证功能；不得把‘加数据’‘加学者观点’等命令原样写进正文。",
    "2. 输入是命令或占位语时直接执行；输入是半截句子时保留原意并自然续完；输入是完整草稿时以它为核心进行实质性改写和提升，不另起主题，但不得原样返回用户输入。",
    "3. 根据文章当前缺少的信息决定长度。表达完整后立即停止，不能为了显得充分而扩写。",
    "4. 保持与前后模块连贯，避免重复相邻内容。结论必须吸收所有在它之前、本轮新生成的有效内容。",
    block?.type === "Title"
      ? "5. 不得编造精确来源、引文、年份或统计值。只输出可直接放进标题模块的最终标题，不输出分析、建议、正文或 Markdown。"
      : "5. 不得编造精确来源、引文、年份或统计值。只输出可直接放进文本框的最终正文，不输出标题、分析、建议或 Markdown。",
  ].join("\n");
}

function getSearchPolicy(block, userInput) {
  const type = String(block?.type || "");
  const input = String(userInput || "");

  if (
    type === "Title" ||
    type === "Transition" ||
    type === "Conclusion"
  ) {
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
      // “完成”会暂时隐藏模块外观。生成已经重新激活该模块，
      // 所有流式分片都必须保持可见，不能等点击审阅才恢复。
      isModuleHidden: false,
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
  pushHistorySnapshot,
  selectedIds,
  setSelectedIds,
}) {
  const webSearchStorageKey =
    "editor-web-search-enabled-v2";

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingBlockIds, setGeneratingBlockIds] = useState([]);
  const [generatingBlinkOn, setGeneratingBlinkOn] = useState(false);
  const [generationStatus, setGenerationStatus] = useState("");
  const [generationFailure, setGenerationFailure] = useState(null);
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
  const generationCommitGuardRef = useRef(false);
  const generationCommitGuardTimerRef = useRef(null);
  const repairedGeneratedTextIdsRef = useRef(new Set());
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
    if (generationCommitGuardTimerRef.current != null) {
      clearTimeout(generationCommitGuardTimerRef.current);
    }
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  useEffect(() => {
    if (
      !generationCommitGuardRef.current ||
      !expectedGeneratedTextRef.current.size
    ) return;

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

    const mismatchedChecks = checks.filter((check) => !check.matches);

    if (mismatchedChecks.length) {
      console.error(
        "[AI Debug] 生成文字写入后被其他状态覆盖",
        mismatchedChecks
      );

      const idsToRepair = new Set(
        mismatchedChecks
          .map((check) => check.blockId)
          .filter(
            (blockId) =>
              !repairedGeneratedTextIdsRef.current.has(blockId)
          )
      );

      if (idsToRepair.size) {
        const repairTextById = new Map(
          Array.from(idsToRepair).map((blockId) => [
            blockId,
            expectedGeneratedTextRef.current.get(blockId),
          ])
        );

        idsToRepair.forEach((blockId) =>
          repairedGeneratedTextIdsRef.current.add(blockId)
        );

        setSections((previous) =>
          patchBlocks(previous, (block) => {
            const blockId = String(block.id);
            if (!idsToRepair.has(blockId)) return block;

            const expectedText = repairTextById.get(blockId);
            if (expectedText == null) return block;

            return {
              ...block,
              text: expectedText,
              height: estimateBlockHeight(expectedText, block.width),
              isGenerated: true,
              isModuleHidden: false,
              generationDirective: "",
              generationError: null,
            };
          })
        );
      }
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
  }, [sections, setSections]);

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
    // 暂停时先提交已经收到但尚未来得及绘制的最后一批字符，
    // 保证用户看到的部分结果与实际收到的流完全一致。
    flushPendingDeltas();
    stopBlinking();
    generationCommitGuardRef.current = false;
    expectedGeneratedTextRef.current = new Map();
    repairedGeneratedTextIdsRef.current = new Set();
    if (generationCommitGuardTimerRef.current != null) {
      clearTimeout(generationCommitGuardTimerRef.current);
      generationCommitGuardTimerRef.current = null;
    }
    setIsGenerating(false);
    setGeneratingBlockIds([]);
    setGenerationStatus("");
  }, [flushPendingDeltas, stopBlinking]);

  const generateFromSelectedBlocks = useCallback(async (requestedTargetIds = null) => {
    if (isGenerating) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    /**
     * 在任何 selection/state 清理之前冻结本次生成快照。
     * 画布内容节点存在时一律读取页面上真实可见的文字，避免 toolbar
     * mousedown -> contentEditable blur -> onClick 的事件顺序让旧 state
     * 混进请求。
     */
    const snapshotDiagnostics = [];
    const entries =
      flattenBlockEntries(
        sections
      ).map((entry) => {
        const snapshot =
          getGenerationSnapshotText(
            entry.block
          );
        const liveText =
          snapshot.text;

        snapshotDiagnostics.push({
          blockId: String(
            entry.block?.id || ""
          ),
          type:
            entry.block?.type ||
            "Unknown",
          source: snapshot.source,
          stateText:
            inspectGenerationText(
              entry.block?.text
            ),
          snapshotText:
            inspectGenerationText(
              liveText
            ),
          dom: snapshot.rendered,
        });

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
    const selectionForRequest = Array.isArray(requestedTargetIds)
      ? requestedTargetIds
      : selectedIds;
    const targets = collectGenerationTargets(entries, selectionForRequest);
    const uniqueSelectedIds = Array.from(
      new Set((selectionForRequest || []).map(String))
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
      snapshots:
        snapshotDiagnostics.filter(
          (item) =>
            uniqueSelectedIds.includes(
              item.blockId
            )
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
    setGenerationFailure(null);
    const researchActionId = createResearchActionId("generation");
    const generationStartedAt = performance.now();
    let firstTextAt = null;
    const selectedIdSet = new Set(targetIds);
    const requestIdToTarget = new Map(
      targets.map((entry, index) => [String(index + 1), entry])
    );
    const generatedTextByRequestId = new Map();
    const startedRequestIds = new Set();
    const completedRequestIds = new Set();
    const renderedRequestIds = new Set();

    const requestTargetBlocks = targets.map((entry, index) => {
      const directive = getBlockDirective(entry.block);

      return {
        id: index + 1,
        type: entry.block?.type || "Unknown",
        text: "",
        directive,
        originalText: String(entry.block?.text || ""),
        // 保留 userInput 字段以兼容旧后端，但它与 directive 含义一致：
        // 都是用户希望模型执行的写作要求，而不是允许原样返回的正文。
        userInput: directive,
        userInputMode: directive ? "instruction" : "empty",
        requiredPrefix: "",
        instruction: [
          createGenerationInstruction(entry.block, {
            webSearchAllowed: webSearchEnabled,
          }),
          directive
            ? `最高优先级写作指令：${directive}`
            : "当前文本只是空模块或标签占位文字，请依据上下文主动补全。",
          "本次会同时生成全部选中模块。必须结合其他目标模块的要求，先规划完整、连贯的段落，再为本模块输出新的正文。",
          "指令可能是命令、主题、半截句或已有草稿：都必须转化成新的最终正文，绝不能把指令本身原样返回。",
        ].join("\n"),
        searchPolicy:
          webSearchEnabled &&
          getSearchPolicy(entry.block, directive) === "required"
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

    logResearchEvent(
      "ai_generation_started",
      {
        web_search_enabled: webSearchEnabled,
        targets: requestTargetBlocks.map((target, index) => ({
          block_id: String(targets[index].block.id),
          type: target.type,
          directive: target.directive,
          original_text: target.originalText,
          search_policy: target.searchPolicy,
        })),
        context_block_ids: requestContextBlocks.map((block) => String(block.id)),
      },
      { actionId: researchActionId, targetBlockIds: targetIds }
    );

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
        originalText: inspectGenerationText(target.originalText),
        searchPolicy: target.searchPolicy,
        userInput: inspectGenerationText(target.userInput),
        instruction: target.instruction,
      })),
    });

    const directiveByRealId = new Map(
      targets.map((entry, index) => [
        String(entry.block.id),
        String(requestTargetBlocks[index]?.directive || ""),
      ])
    );
    const originalBlockByRealId = new Map(
      targets.map((entry) => [String(entry.block.id), entry.block])
    );

    /**
     * 一次 AI 生成无论包含多少模块、多少流式分片，都只记为一个 action。
     * 快照必须在任何 generationDirective、正文或错误状态写入之前保存。
     */
    pushHistorySnapshot?.(sections);

    setSelectedIds?.([]);
    cancelledRef.current = false;
    pendingDeltaMapRef.current = new Map();
    expectedGeneratedTextRef.current = new Map();
    generationCommitGuardRef.current = false;
    repairedGeneratedTextIdsRef.current = new Set();
    if (generationCommitGuardTimerRef.current != null) {
      clearTimeout(generationCommitGuardTimerRef.current);
      generationCommitGuardTimerRef.current = null;
    }
    lastPostRenderDebugKeyRef.current = "";
    setIsGenerating(true);
    setGeneratingBlockIds(targetIds);
    // 这个 hook 只由工具栏“AI生成”和生成快捷键调用。
    // 模块中的草稿、主题或命令属于生成素材，不能据此把操作误判成“指令修改”。
    setGenerationStatus("正在根据所选模块内容生成");
    setSections((previous) =>
      patchBlocks(previous, (block) => {
        const blockId = String(block.id);
        if (!selectedIdSet.has(blockId)) return block;

        return {
          ...block,
          // 生成目标可能残留“完成段落”的隐藏标记。强制重挂载前先清除，
          // 否则正文仍在 state 中，但边框和标签会像模块消失一样不可见。
          isModuleHidden: false,
          // 手动编辑、换行或浏览器原生撤销可能会移除 contentEditable
          // 内部的正文标记。每次开始生成时强制重挂载该模块的 DOM，
          // 确保后续流式文字写入真实的正文节点，而不是留在旧文本节点上。
          generationRenderRevision:
            (Number(block.generationRenderRevision) || 0) + 1,
          generationDirective: directiveByRealId.get(blockId) || "",
          generationError: null,
        };
      })
    );
    startBlinking();

    try {
      await generateBlocksStream({
        targetBlocks: requestTargetBlocks,
        contextBlocks: requestContextBlocks,
        signal: controller.signal,
        onEvent: (event) => {
          if (cancelledRef.current) return;

          if (event.type === "heartbeat") {
            return;
          }

          if (event.type !== "chunk") {
            aiDebug(`03 stream event: ${event.type}`, event);
          }

          if (event.type === "error") {
            aiDebug("ERROR server event", {
              error: event.error,
              details: event.details,
            });
            const streamError = new Error(
              event.error || "生成服务返回错误"
            );
            streamError.code = event.code || "GENERATION_FAILED";
            streamError.failedIds = Array.isArray(event.failedIds)
              ? event.failedIds.map(String)
              : [];
            throw streamError;
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

          if (
            (event.type === "block_start" || event.type === "chunk") &&
            !startedRequestIds.has(requestId)
          ) {
            startedRequestIds.add(requestId);
            generatedTextByRequestId.set(requestId, "");
            setGenerationStatus("正在根据所选模块内容生成");
          }

          if (event.type === "chunk") {
            const delta = String(event.delta || "");
            if (firstTextAt == null) {
              firstTextAt = performance.now();
              logResearchEvent(
                "ai_generation_first_text",
                {
                  latency_ms: Math.round(firstTextAt - generationStartedAt),
                  first_block_id: realBlockId,
                },
                { actionId: researchActionId, targetBlockIds: targetIds }
              );
            }
            generatedTextByRequestId.set(
              requestId,
              `${generatedTextByRequestId.get(requestId) || ""}${delta}`
            );

            if (!renderedRequestIds.has(requestId)) {
              renderedRequestIds.add(requestId);
              setSections((previous) =>
                patchBlocks(previous, (block) => {
                  if (String(block.id) !== realBlockId) return block;

                  return {
                    ...block,
                    text: delta,
                    height: estimateBlockHeight(delta, block.width),
                    isGenerated: true,
                    isModuleHidden: false,
                    generationError: null,
                  };
                })
              );
            } else {
              pendingDeltaMapRef.current.set(
                realBlockId,
                `${pendingDeltaMapRef.current.get(realBlockId) || ""}${delta}`
              );
              scheduleFlush();
            }
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
        const originalText = String(
          directiveByRealId.get(String(targetEntry.block.id)) ||
            targetEntry.block?.text ||
            ""
        ).trim();
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
      generationCommitGuardRef.current = true;
      repairedGeneratedTextIdsRef.current = new Set();
      if (generationCommitGuardTimerRef.current != null) {
        clearTimeout(generationCommitGuardTimerRef.current);
      }
      generationCommitGuardTimerRef.current = setTimeout(() => {
        generationCommitGuardRef.current = false;
        expectedGeneratedTextRef.current = new Map();
        repairedGeneratedTextIdsRef.current = new Set();
        generationCommitGuardTimerRef.current = null;
      }, 1600);

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

          if (
            block.placement !==
            "floating"
          ) {
            const nextBlock = {
              ...block,
              text: cleanedText,
              isGenerated: true,
              isModuleHidden: false,
              generationDirective: "",
              generationError: null,
            };

            delete nextBlock.x;
            delete nextBlock.y;
            delete nextBlock.width;
            delete nextBlock.height;
            delete nextBlock.floatingX;
            delete nextBlock.floatingY;
            delete nextBlock.floatingWidth;
            delete nextBlock.floatingHeight;

            return nextBlock;
          }

          const floatingWidth =
            Number(
              block.floatingWidth ??
                block.width ??
                180
            ) || 180;

          return {
            ...block,
            text: cleanedText,
            height:
              estimateBlockHeight(
                cleanedText,
                floatingWidth
              ),
            isGenerated: true,
            isModuleHidden: false,
            generationDirective: "",
            generationError: null,
          };
        })
      );

      setGenerationStatus("");
      aiDebug("06 generation succeeded", {
        targetIds,
        completedRequestIds: Array.from(completedRequestIds),
      });
      logResearchEvent(
        "ai_generation_completed",
        {
          duration_ms: Math.round(performance.now() - generationStartedAt),
          first_text_latency_ms:
            firstTextAt == null ? null : Math.round(firstTextAt - generationStartedAt),
          outputs: Array.from(cleanedTextByRealId.entries()).map(
            ([blockId, text]) => ({ block_id: blockId, text })
          ),
        },
        { actionId: researchActionId, targetBlockIds: targetIds }
      );
    } catch (error) {
      if (error?.name === 'AbortError') {
        logResearchEvent(
          "ai_generation_cancelled",
          { duration_ms: Math.round(performance.now() - generationStartedAt) },
          { actionId: researchActionId, targetBlockIds: targetIds }
        );
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
      generationCommitGuardRef.current = false;
      repairedGeneratedTextIdsRef.current = new Set();
      if (generationCommitGuardTimerRef.current != null) {
        clearTimeout(generationCommitGuardTimerRef.current);
        generationCommitGuardTimerRef.current = null;
      }
      const validTextByRealId = new Map();
      const failedTargetIds = [];

      targets.forEach((entry, index) => {
        const requestId = String(index + 1);
        const realBlockId = String(entry.block.id);
        const originalText = String(
          directiveByRealId.get(realBlockId) || entry.block?.text || ""
        ).trim();
        const generatedText = sanitizeGeneratedText(
          generatedTextByRequestId.get(requestId) || ""
        );
        const valid = Boolean(
          completedRequestIds.has(requestId) &&
            generatedText &&
            normalizeGenerationComparison(generatedText) !==
              normalizeGenerationComparison(originalText)
        );

        if (valid) {
          validTextByRealId.set(realBlockId, generatedText);
        } else {
          failedTargetIds.push(realBlockId);
        }
      });

      setSections((previous) =>
        patchBlocks(previous, (block) => {
          const blockId = String(block.id);
          if (!selectedIdSet.has(blockId)) return block;

          const validText = validTextByRealId.get(blockId);
          if (validText) {
            if (
              block.placement !==
              "floating"
            ) {
              const nextBlock = {
                ...block,
                text: validText,
                isGenerated: true,
                isModuleHidden: false,
                generationDirective: "",
                generationError: null,
              };

              delete nextBlock.x;
              delete nextBlock.y;
              delete nextBlock.width;
              delete nextBlock.height;
              delete nextBlock.floatingX;
              delete nextBlock.floatingY;
              delete nextBlock.floatingWidth;
              delete nextBlock.floatingHeight;

              return nextBlock;
            }

            const floatingWidth =
              Number(
                block.floatingWidth ??
                  block.width ??
                  180
              ) || 180;

            return {
              ...block,
              text: validText,
              height:
                estimateBlockHeight(
                  validText,
                  floatingWidth
                ),
              isGenerated: true,
              isModuleHidden: false,
              generationDirective: "",
              generationError: null,
            };
          }

          const originalBlock = originalBlockByRealId.get(blockId);
          const originalText = String(originalBlock?.text || "");

          if (
            block.placement !==
            "floating"
          ) {
            const nextBlock = {
              ...block,
              text: originalText,
              sources: Array.isArray(originalBlock?.sources)
                ? originalBlock.sources
                : [],
              isGenerated: originalBlock?.isGenerated,
              isModuleHidden: false,
              generationDirective: directiveByRealId.get(blockId) || "",
              generationError: null,
            };

            delete nextBlock.x;
            delete nextBlock.y;
            delete nextBlock.width;
            delete nextBlock.height;
            delete nextBlock.floatingX;
            delete nextBlock.floatingY;
            delete nextBlock.floatingWidth;
            delete nextBlock.floatingHeight;

            return nextBlock;
          }

          const floatingWidth =
            Number(
              block.floatingWidth ??
                block.width ??
                180
            ) || 180;

          return {
            ...block,
            text: originalText,
            sources: Array.isArray(originalBlock?.sources)
              ? originalBlock.sources
              : [],
            height:
              estimateBlockHeight(
                originalText,
                floatingWidth
              ),
            isGenerated: originalBlock?.isGenerated,
            isModuleHidden: false,
            generationDirective: directiveByRealId.get(blockId) || "",
            generationError: null,
          };
        })
      );
      setGenerationStatus("");
      setGenerationFailure({
        message: error?.message || "生成失败",
        targetIds,
        failedTargetIds,
      });
      logResearchEvent(
        "ai_generation_failed",
        {
          duration_ms: Math.round(performance.now() - generationStartedAt),
          error: error?.message || "generation failed",
          failed_block_ids: failedTargetIds,
          partial_outputs: Array.from(validTextByRealId.entries()).map(
            ([blockId, text]) => ({ block_id: blockId, text })
          ),
        },
        { actionId: researchActionId, targetBlockIds: targetIds }
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
    pushHistorySnapshot,
    setSelectedIds,
    scheduleFlush,
    flushPendingDeltas,
    startBlinking,
    stopBlinking,
	    clearPendingFrame,
	    webSearchEnabled,
	  ]);

  const dismissGenerationFailure = useCallback(() => {
    setGenerationFailure(null);
  }, []);

  const retryFailedGeneration = useCallback(() => {
    const retryTargetIds = generationFailure?.targetIds || [];
    if (isGenerating || retryTargetIds.length === 0) return;

    setGenerationFailure(null);
    return generateFromSelectedBlocks(retryTargetIds);
  }, [generateFromSelectedBlocks, generationFailure, isGenerating]);

  return {
    isGenerating,
    generatingBlockIds,
    generatingBlinkOn,
    generationStatus,
    generationFailure,
    webSearchEnabled,
    toggleWebSearch,
    generateFromSelectedBlocks,
    retryFailedGeneration,
    dismissGenerationFailure,
    stopGenerating,
  };
}
