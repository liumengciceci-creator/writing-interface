import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const LANGUAGE_STORAGE_KEY = "arguweave-interface-language";

const BLOCK_LABELS = {
  zh: {
    Title: "标题",
    Claim: "论点",
    Evidence: "证据",
    Reason: "原因",
    Counter: "反论",
    Compare: "对比",
    Conclusion: "结论",
    Question: "问题",
    Generated: "生成",
    Transition: "过渡",
    Merged: "融合",
  },
  en: {
    Title: "Title",
    Claim: "Claim",
    Evidence: "Evidence",
    Reason: "Reason",
    Counter: "Counterargument",
    Compare: "Comparison",
    Conclusion: "Conclusion",
    Question: "Question",
    Generated: "Generated",
    Transition: "Transition",
    Merged: "Merged",
  },
};

const MESSAGES = {
  zh: {
    "toolbar.canvasTools": "画布工具",
    "toolbar.mainActions": "主要写作操作",
    "toolbar.webSearch": "联网搜索：{state}",
    "toolbar.on": "开",
    "toolbar.off": "关",
    "toolbar.generate": "AI生成",
    "toolbar.review": "审阅",
    "toolbar.complete": "完成",
    "toolbar.undo": "撤销",
    "toolbar.redo": "重做",
    "toolbar.generateTitle": "生成所选模块",
    "toolbar.reviewNeedTwo": "请选择至少两个模块，或清除选择以审阅全文",
    "toolbar.reviewSelected": "审阅所选模块",
    "toolbar.reviewAll": "审阅全文；已完成内容会先恢复为模块",
    "toolbar.switchLanguage": "切换为英文界面",
    "toolbar.language": "中文 / EN",
    "language.openMenu": "打开界面设置",
    "language.closeMenu": "关闭界面设置",
    "language.switchToEnglish": "切换语言为英文",
    "language.switchToChinese": "切换语言为中文",
    "status.reviewing": "正在审阅模块关系...",
    "status.generating": "正在生成...",
    "status.resizing": "正在调整模块长度...",
    "app.totalCharacters": "总字数",
    "app.noSpaces": "不包含空格和换行",
    "app.exportWord": "导出Word",
    "app.exportWordTitle": "将当前线性正文导出为 Word 文档",
    "app.bottomHelp": "Shift 多选模块　|　长按显示抓手后拖动排序　|　选中模块后拖动右侧长度柄，Enter 应用　|　Delete 删除模块　|　生成：按钮或 Enter",
    "app.busyGenerating": "AI 正在生成，请等待本轮生成完成。",
    "app.busyReviewing": "正在审阅模块关系，请等待本轮审阅完成。",
    "app.busyResizing": "正在调整模块长度，请等待当前操作完成。",
    "app.selectToGenerate": "请先选择至少一个模块，再使用 AI 生成。",
    "app.needTwoReview": "全文至少需要两个非空模块才能进行审阅。",
    "app.selectTwoReview": "请至少选择两个模块；清除选择后可直接审阅全文。",
    "app.nothingToComplete": "当前没有可以完成的模块。",
    "app.reviewWhole": "正在整体判断所选模块之间的关系…",
    "app.reviewSuggestions": "正在生成潜在修改建议…",
    "app.reviewOrganizing": "正在整理潜在增强点…",
    "app.reviewDoneIssues": "审阅完成：发现 {count} 个潜在增强点",
    "app.reviewDoneModules": "审阅完成：已检查 {count} 个模块",
    "app.reviewFailed": "整体审阅失败，请稍后重试",
    "app.module": "模块",
    "app.document": "全文",
    "app.related": "关联",
    "app.contentReview": "内容关系把关",
    "app.modelRelation": "模型识别出的内容关系",
    "app.canStrengthen": "这条关系可以进一步加强。",
    "relation.reasonClaim": "原因 → 论点",
    "relation.reasonCriterion": "原因是否解释论点",
    "relation.evidenceClaim": "证据 → 论点",
    "relation.evidenceCriterion": "证据是否支持论点",
    "relation.counterClaim": "反论 → 论点",
    "relation.counterCriterion": "反论是否回应论点",
    "relation.compareClaim": "对比 → 论点",
    "relation.compareCriterion": "对比是否阐明论点",
    "relation.conclusionDocument": "结论 → 全文",
    "relation.conclusionCriterion": "结论是否总结全文",
    "relation.pairCriterion": "这两个模块形成“{relation}”的内容关系",
    "relation.checkingModule": "正在检查{type}：{text}",
    "relation.checkingRole": "正在检查{type}在整体论证中的作用…",
    "relation.judging": "正在判断：{source}与{target}形成“{relation}”",
    "sidebar.labels": "标签",
    "sidebar.addLabel": "添加自定义标签",
    "sidebar.editLabel": "编辑标签",
    "sidebar.labelName": "标签名称",
    "sidebar.labelNamePlaceholder": "例如：示例",
    "sidebar.labelColor": "标签颜色",
    "sidebar.customColor": "打开自选色谱",
    "sidebar.dragToCanvas": "拖动到画布",
    "sidebar.editLabelTitle": "编辑标签 {label}",
    "sidebar.deleteLabel": "删除标签",
    "sidebar.deleteConfirm": "确定删除标签“{label}”吗？\n已经放在画布上的模块不会被删除。",
    "sidebar.nameRequired": "请输入标签名称",
    "sidebar.nameExists": "这个标签名称已经存在",
    "common.cancel": "取消",
    "common.save": "保存",
    "common.add": "添加",
    "common.apply": "应用",
    "common.processing": "处理中...",
    "review.overall": "整体关系判断",
    "review.result": "本轮审阅结果",
    "review.close": "关闭审阅结果",
    "review.summary": "整体论证关系总结",
    "review.found": "发现 {count} 处潜在修改点",
    "review.completed": "本轮审阅已完成",
    "review.selectDot": "选择圆点，查看对应模块关系",
    "review.none": "暂未发现需要立即修改的内容关系。",
    "review.issueNumbers": "潜在修改点编号",
    "review.viewIssue": "查看第 {count} 处潜在修改点",
    "review.issue": "修改点 {count}",
    "review.instruction": "{label}修改指令",
    "review.insertInstruction": "添加{label}模块",
    "review.applying": "正在按指令修改…",
    "review.inserting": "正在添加并生成…",
    "review.apply": "按此指令修改",
    "review.insert": "添加并生成",
    "review.skip": "暂不修改",
    "review.applyFailed": "按照指令修改失败，请重试",
    "review.insertFailed": "新增模块生成失败，请重试",
    "review.insertPositionChanged": "相关模块的位置已经变化，请重新审阅后再添加模块",
    "review.insertTypeMissing": "审阅结果没有提供有效的模块类型",
    "instruction.title": "指令",
    "instruction.add": "添加修改指令",
    "instruction.edit": "编辑修改指令",
    "instruction.name": "指令名称",
    "instruction.namePlaceholder": "例如：更加有逻辑性",
    "instruction.detail": "指令说明",
    "instruction.detailPlaceholder": "可选：进一步说明希望 AI 如何修改。留空时直接使用上面的名称。",
    "instruction.color": "指令颜色",
    "instruction.nameRequired": "请输入指令名称",
    "instruction.sendToAI": "发送给 AI 的具体指令",
    "instruction.drag": "拖到模块上：{instruction}",
    "instruction.dragLabel": "拖动指令：{label}",
    "instruction.editTitle": "编辑指令 {label}",
    "instruction.delete": "删除指令",
    "instruction.chooseColor": "选择颜色 {color}",
    "instruction.customColor": "打开自选指令色谱",
    "property.label": "标签",
    "property.editLabel": "修改当前模块的标签名称和颜色",
    "property.length": "调整长度",
    "property.lengthHelp": "调整当前模块内容的长度",
    "property.shorter": "更短",
    "property.medium": "适中",
    "property.longer": "更长",
    "property.style": "文本风格调整",
    "property.styleHelp": "选择或自定义文本风格",
    "property.customStyle": "自定义风格",
    "property.applyCustomStyle": "应用自定义风格",
    "property.applyStyle": "应用文本风格",
    "property.twoSelected": "已选择 2 个模块。模仿和关系操作会按照选择顺序执行。",
    "property.concatenate": "拼接",
    "property.merge": "融合",
    "property.imitate": "模仿",
    "property.applySelected": "应用所选操作",
    "property.multiTitle": "对两个模块进行操作",
    "property.relate": "建立联系",
    "property.tooMany": "当前双模块操作只支持选择两个模块，请取消多余选择后再操作。",
    "canvas.resizeWidth": "调整窗口宽度",
    "canvas.dragResizeWidth": "左右拖动调整宽度",
    "canvas.adjustLength": "调整模块长度",
    "canvas.dragAdjustLength": "拖动调整长度",
    "canvas.word": "词",
    "canvas.character": "字",
    "canvas.sources": "生成内容来源",
    "canvas.copyParagraph": "复制段落",
    "quickInstruction.open": "打开快速修改指令",
    "quickInstruction.dialog": "修改指令",
    "quickInstruction.placeholder": "输入修改指令",
    "quickInstruction.customPlaceholder": "输入自定义修改指令，按回车添加",
    "quickInstruction.send": "发送修改指令",
    "quickInstruction.presets": "常用修改指令",
    "quickInstruction.move": "拖动修改指令窗口",
    "property.labelPlaceholder": "输入标签名称",
    "property.chooseColor": "选择颜色 {color}",
    "property.customStylePlaceholder": "例如：语言更正式，并突出研究贡献。",
    "style.logical": "更加逻辑化",
    "style.explanatory": "更强调解释",
    "style.causal": "更强调因果关系",
    "style.evidence": "更强调证据",
    "style.temporal": "更强调时间顺序",
    "style.critical": "更强调批判性",
    "style.comparison": "更强调比较",
    "style.subjective": "更主观",
    "style.viewpoint": "更强调观点",
    "style.objective": "更客观",
    "relation.cause": "因果",
    "relation.contrast": "对比",
    "relation.progressive": "递进",
    "relation.transition": "转折",
  },
  en: {
    "toolbar.canvasTools": "Canvas tools",
    "toolbar.mainActions": "Main writing actions",
    "toolbar.webSearch": "Web search: {state}",
    "toolbar.on": "On",
    "toolbar.off": "Off",
    "toolbar.generate": "AI Generate",
    "toolbar.review": "Review",
    "toolbar.complete": "Complete",
    "toolbar.undo": "Undo",
    "toolbar.redo": "Redo",
    "toolbar.generateTitle": "Generate selected modules",
    "toolbar.reviewNeedTwo": "Select at least two modules, or clear the selection to review the full text",
    "toolbar.reviewSelected": "Review selected modules",
    "toolbar.reviewAll": "Review the full text; completed text will first return to modules",
    "toolbar.switchLanguage": "Switch to Chinese interface",
    "toolbar.language": "中 / English",
    "language.openMenu": "Open interface settings",
    "language.closeMenu": "Close interface settings",
    "language.switchToEnglish": "Switch interface to English",
    "language.switchToChinese": "Switch interface to Chinese",
    "status.reviewing": "Reviewing module relationships...",
    "status.generating": "Generating...",
    "status.resizing": "Adjusting module length...",
    "app.totalCharacters": "Characters",
    "app.noSpaces": "Spaces and line breaks are excluded",
    "app.exportWord": "Export Word",
    "app.exportWordTitle": "Export the current linear text as a Word document",
    "app.bottomHelp": "Shift: multi-select  |  Long press, then drag to reorder  |  Drag the right length handle and press Enter to apply  |  Delete: remove module  |  Generate: button or Enter",
    "app.busyGenerating": "AI is generating. Please wait for this generation to finish.",
    "app.busyReviewing": "Module relationships are being reviewed. Please wait for this review to finish.",
    "app.busyResizing": "Module length is being adjusted. Please wait for the current action to finish.",
    "app.selectToGenerate": "Select at least one module before using AI Generate.",
    "app.needTwoReview": "At least two non-empty modules are required to review the full text.",
    "app.selectTwoReview": "Select at least two modules, or clear the selection to review the full text.",
    "app.nothingToComplete": "There are no modules available to complete.",
    "app.reviewWhole": "Assessing the overall relationships among the selected modules…",
    "app.reviewSuggestions": "Generating potential revision suggestions…",
    "app.reviewOrganizing": "Organizing potential improvements…",
    "app.reviewDoneIssues": "Review complete: {count} potential improvements found",
    "app.reviewDoneModules": "Review complete: {count} modules checked",
    "app.reviewFailed": "Overall review failed. Please try again later.",
    "app.module": "Module",
    "app.document": "Full text",
    "app.related": "Related",
    "app.contentReview": "Content relationship check",
    "app.modelRelation": "Content relationship identified by the model",
    "app.canStrengthen": "This relationship could be strengthened.",
    "relation.reasonClaim": "Reason → Claim",
    "relation.reasonCriterion": "Does the reason explain the claim?",
    "relation.evidenceClaim": "Evidence → Claim",
    "relation.evidenceCriterion": "Does the evidence support the claim?",
    "relation.counterClaim": "Counterargument → Claim",
    "relation.counterCriterion": "Does the counterargument respond to the claim?",
    "relation.compareClaim": "Comparison → Claim",
    "relation.compareCriterion": "Does the comparison clarify the claim?",
    "relation.conclusionDocument": "Conclusion → Full text",
    "relation.conclusionCriterion": "Does the conclusion cover the full text?",
    "relation.pairCriterion": "These modules form a “{relation}” content relationship",
    "relation.checkingModule": "Checking {type}: {text}",
    "relation.checkingRole": "Checking the role of {type} in the overall argument…",
    "relation.judging": "Assessing: {source} and {target} form a “{relation}” relationship",
    "sidebar.labels": "Labels",
    "sidebar.addLabel": "Add custom label",
    "sidebar.editLabel": "Edit label",
    "sidebar.labelName": "Label name",
    "sidebar.labelNamePlaceholder": "e.g. Example",
    "sidebar.labelColor": "Label color",
    "sidebar.customColor": "Open custom color spectrum",
    "sidebar.dragToCanvas": "Drag to canvas",
    "sidebar.editLabelTitle": "Edit label {label}",
    "sidebar.deleteLabel": "Delete label",
    "sidebar.deleteConfirm": "Delete the label “{label}”?\nModules already placed on the canvas will not be deleted.",
    "sidebar.nameRequired": "Enter a label name",
    "sidebar.nameExists": "This label name already exists",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.add": "Add",
    "common.apply": "Apply",
    "common.processing": "Processing...",
    "review.overall": "Overall relationship assessment",
    "review.result": "Review results",
    "review.close": "Close review results",
    "review.summary": "Overall argument relationship summary",
    "review.found": "{count} potential improvements found",
    "review.completed": "Review complete",
    "review.selectDot": "Select a dot to inspect the related modules",
    "review.none": "No content relationships require immediate revision.",
    "review.issueNumbers": "Potential improvement numbers",
    "review.viewIssue": "View potential improvement {count}",
    "review.issue": "Improvement {count}",
    "review.instruction": "Revision instruction for {label}",
    "review.insertInstruction": "Add a {label} module",
    "review.applying": "Revising according to the instruction…",
    "review.inserting": "Adding and generating…",
    "review.apply": "Apply this instruction",
    "review.insert": "Add and generate",
    "review.skip": "Not now",
    "review.applyFailed": "Revision failed. Please try again.",
    "review.insertFailed": "The new module could not be generated. Please try again.",
    "review.insertPositionChanged": "The related modules have moved. Review the text again before inserting a module.",
    "review.insertTypeMissing": "The review did not provide a valid module type.",
    "instruction.title": "Instructions",
    "instruction.add": "Add revision instruction",
    "instruction.edit": "Edit revision instruction",
    "instruction.name": "Instruction name",
    "instruction.namePlaceholder": "e.g. Improve logical flow",
    "instruction.detail": "Instruction details",
    "instruction.detailPlaceholder": "Optional: explain how the AI should revise the text. If left blank, the name above will be used.",
    "instruction.color": "Instruction color",
    "instruction.nameRequired": "Enter an instruction name",
    "instruction.sendToAI": "Instruction sent to AI",
    "instruction.drag": "Drag onto a module: {instruction}",
    "instruction.dragLabel": "Drag instruction: {label}",
    "instruction.editTitle": "Edit instruction {label}",
    "instruction.delete": "Delete instruction",
    "instruction.chooseColor": "Choose color {color}",
    "instruction.customColor": "Open custom instruction color spectrum",
    "property.label": "Label",
    "property.editLabel": "Edit the current module's label name and color",
    "property.length": "Adjust length",
    "property.lengthHelp": "Adjust the length of the current module",
    "property.shorter": "Shorter",
    "property.medium": "Medium",
    "property.longer": "Longer",
    "property.style": "Text style",
    "property.styleHelp": "Choose or customize a text style",
    "property.customStyle": "Custom style",
    "property.applyCustomStyle": "Apply custom style",
    "property.applyStyle": "Apply text style",
    "property.twoSelected": "2 modules selected. Imitation and relationship operations follow the selection order.",
    "property.concatenate": "Concatenate",
    "property.merge": "Merge",
    "property.imitate": "Imitate",
    "property.applySelected": "Apply selected operation",
    "property.multiTitle": "Operate on two modules",
    "property.relate": "Relate",
    "property.tooMany": "Two-module operations support exactly two modules. Deselect the extra modules to continue.",
    "canvas.resizeWidth": "Resize window width",
    "canvas.dragResizeWidth": "Drag horizontally to resize",
    "canvas.adjustLength": "Adjust module length",
    "canvas.dragAdjustLength": "Drag to adjust length",
    "canvas.word": "words",
    "canvas.character": "characters",
    "canvas.sources": "Generated content sources",
    "canvas.copyParagraph": "Copy paragraph",
    "quickInstruction.open": "Open quick revision instruction",
    "quickInstruction.dialog": "Revision instruction",
    "quickInstruction.placeholder": "Enter a revision instruction",
    "quickInstruction.customPlaceholder": "Enter a custom revision instruction and press Enter to add",
    "quickInstruction.send": "Send revision instruction",
    "quickInstruction.presets": "Common revision instructions",
    "quickInstruction.move": "Move revision instruction window",
    "property.labelPlaceholder": "Enter a label name",
    "property.chooseColor": "Choose color {color}",
    "property.customStylePlaceholder": "e.g. Use more formal language and emphasize the research contribution.",
    "style.logical": "Improve logical flow",
    "style.explanatory": "Emphasize explanation",
    "style.causal": "Emphasize causality",
    "style.evidence": "Emphasize evidence",
    "style.temporal": "Emphasize chronology",
    "style.critical": "Increase criticality",
    "style.comparison": "Emphasize comparison",
    "style.subjective": "More subjective",
    "style.viewpoint": "Emphasize the claim",
    "style.objective": "More objective",
    "relation.cause": "Causal",
    "relation.contrast": "Contrast",
    "relation.progressive": "Progression",
    "relation.transition": "Transition",
  },
};

const BUILTIN_INSTRUCTIONS = {
  "instruction-more-logical": {
    enLabel: "Improve logical flow",
    enInstruction: "Improve the logical flow of this text by strengthening causal links, argumentative order, and transitions between sentences.",
  },
  "instruction-more-causal": {
    enLabel: "Emphasize causality",
    enInstruction: "Clarify the connections among causes, processes, and outcomes in this text.",
  },
  "instruction-emphasize-viewpoint": {
    enLabel: "Emphasize the claim",
    enInstruction: "Make the central claim more prominent so that the position and emphasis are clear.",
  },
  "instruction-emphasize-explanation": {
    enLabel: "Strengthen explanation",
    enInstruction: "Add the necessary explanation so that the meaning of this text is clearer.",
  },
};

function formatMessage(template, variables = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(variables, key)
      ? String(variables[key])
      : `{${key}}`
  );
}

function loadLanguage() {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(loadLanguage);

  useEffect(() => {
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // The interface still switches when storage is unavailable.
    }
  }, [language]);

  const toggleLanguage = useCallback(() => {
    setLanguage((current) => (current === "zh" ? "en" : "zh"));
  }, []);

  const value = useMemo(() => {
    const t = (key, variables) => formatMessage(
      MESSAGES[language]?.[key] ?? MESSAGES.zh[key] ?? key,
      variables
    );

    const blockTypeLabel = (type, fallback = "") =>
      BLOCK_LABELS[language]?.[type] || fallback || type || t("app.module");

    const instructionLabel = (instruction) => {
      if (language !== "en") return instruction?.label || "";
      return BUILTIN_INSTRUCTIONS[instruction?.id]?.enLabel || instruction?.label || "";
    };

    const instructionText = (instruction) => {
      if (language !== "en") return instruction?.instruction || "";
      return BUILTIN_INSTRUCTIONS[instruction?.id]?.enInstruction || instruction?.instruction || "";
    };

    const localizeStatus = (status) => {
      const text = String(status || "").trim();
      if (language !== "en" || !text) return text;

      let match = text.match(/^生成完成\s+(\d+)\/(\d+)$/);
      if (match) return `Generation complete ${match[1]}/${match[2]}`;
      match = text.match(/^已完成校验，正在接收\s+(\d+)\/(\d+)\s+个模块…$/);
      if (match) return `Validation complete. Receiving module ${match[1]}/${match[2]}…`;
      if (text === "网页搜索完成，正在整体组织段落…") {
        return "Web search complete. Organizing the full paragraph…";
      }
      if (text === "模块长度调整完成") return "Module length adjusted";
      if (text === "文本风格调整完成") return "Text style adjusted";
      return text;
    };

    return {
      language,
      isEnglish: language === "en",
      setLanguage,
      toggleLanguage,
      t,
      blockTypeLabel,
      instructionLabel,
      instructionText,
      localizeStatus,
    };
  }, [language, toggleLanguage]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useI18n must be used inside LanguageProvider");
  return context;
}
