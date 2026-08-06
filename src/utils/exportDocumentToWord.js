function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function isTitleBlock(block) {
  return (
    block?.type === "Title" ||
    block?.isCompletedTitle === true ||
    (
      block?.isCompletedParagraph === true &&
      Array.isArray(block?.completedBlocks) &&
      block.completedBlocks.length > 0 &&
      block.completedBlocks.every(
        (sourceBlock) =>
          sourceBlock?.type === "Title"
      )
    )
  );
}

function pushTextLines(
  paragraphs,
  text,
  isTitle
) {
  String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      paragraphs.push({
        text: line,
        isTitle,
      });
    });
}

/**
 * 按真实段落边界整理导出内容。
 *
 * 旧逻辑先把一个 section 的所有模块拼成一个字符串，只要其中含有
 * Title，就会把后面的正文也全部导出成标题。这里保留模块类型，只有
 * 连续的同类型 inline 模块才会合并；标题、已完成段落和显式换行都
 * 会形成独立的 Word 段落。
 */
function getSectionParagraphs(section) {
  const blocks = (
    Array.isArray(section?.blocks)
      ? section.blocks
      : []
  ).filter(
    (block) =>
      block?.placement !== "floating" &&
      String(block?.text ?? "").trim()
  );

  if (blocks.length === 0) {
    const fallback = [];
    pushTextLines(
      fallback,
      section?.completedText,
      false
    );
    return fallback;
  }

  const paragraphs = [];
  let current = null;

  const flushCurrent = () => {
    if (!current?.text) {
      current = null;
      return;
    }

    paragraphs.push(current);
    current = null;
  };

  blocks.forEach((block) => {
    const isTitle =
      isTitleBlock(block);
    const isCompletedParagraph =
      block?.isCompletedParagraph === true;
    const lines = String(
      block?.text ?? ""
    )
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return;
    }

    if (
      block?.forceLineBreakBefore ||
      isCompletedParagraph ||
      (
        current &&
        current.isTitle !== isTitle
      )
    ) {
      flushCurrent();
    }

    if (isCompletedParagraph) {
      lines.forEach((line) => {
        paragraphs.push({
          text: line,
          isTitle,
        });
      });
      return;
    }

    lines.forEach((line, index) => {
      if (index > 0) {
        flushCurrent();
      }

      if (!current) {
        current = {
          text: line,
          isTitle,
        };
      } else {
        current.text =
          `${current.text} ${line}`;
      }
    });
  });

  flushCurrent();
  return paragraphs;
}

function makeFileName() {
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

  return `写作文档-${stamp}.docx`;
}

function makeCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let current = index;
    for (let bit = 0; bit < 8; bit += 1) {
      current = current & 1
        ? 0xedb88320 ^ (current >>> 1)
        : current >>> 1;
    }
    return current >>> 0;
  });
}

const CRC_TABLE = makeCrcTable();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function concatBytes(parts) {
  const result = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0)
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/**
 * 创建无压缩 ZIP。DOCX 本质上是一个包含 OOXML 文件的 ZIP，
 * 因此这里不依赖额外 npm 包也能在浏览器端生成真正的 .docx。
 */
function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  files.forEach(({ name, content }) => {
    const nameBytes = encoder.encode(name);
    const dataBytes = encoder.encode(content);
    const checksum = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint16(localHeader, 6, 0x0800);
    writeUint16(localHeader, 8, 0);
    writeUint32(localHeader, 14, checksum);
    writeUint32(localHeader, 18, dataBytes.length);
    writeUint32(localHeader, 22, dataBytes.length);
    writeUint16(localHeader, 26, nameBytes.length);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    writeUint32(centralHeader, 0, 0x02014b50);
    writeUint16(centralHeader, 4, 20);
    writeUint16(centralHeader, 6, 20);
    writeUint16(centralHeader, 8, 0x0800);
    writeUint16(centralHeader, 10, 0);
    writeUint32(centralHeader, 16, checksum);
    writeUint32(centralHeader, 20, dataBytes.length);
    writeUint32(centralHeader, 24, dataBytes.length);
    writeUint16(centralHeader, 28, nameBytes.length);
    writeUint32(centralHeader, 42, localOffset);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, dataBytes);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + dataBytes.length;
  });

  const centralDirectory = concatBytes(centralParts);
  const endRecord = new Uint8Array(22);
  writeUint32(endRecord, 0, 0x06054b50);
  writeUint16(endRecord, 8, files.length);
  writeUint16(endRecord, 10, files.length);
  writeUint32(endRecord, 12, centralDirectory.length);
  writeUint32(endRecord, 16, localOffset);

  return concatBytes([...localParts, centralDirectory, endRecord]);
}

function paragraphXml({ text, isTitle = false }) {
  const fontSize =
    isTitle ? 30 : 24;
  const lineHeight =
    isTitle ? 390 : 360;

  return `<w:p>
    <w:pPr><w:spacing w:before="0" w:after="${isTitle ? 160 : 120}" w:line="${lineHeight}" w:lineRule="exact"/><w:jc w:val="${isTitle ? "left" : "both"}"/></w:pPr>
    <w:r>
      <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="PingFang SC"/>${isTitle ? "<w:b/><w:bCs/>" : "<w:b w:val=\"0\"/><w:bCs w:val=\"0\"/>"}<w:color w:val="202124"/><w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/></w:rPr>
      <w:t xml:space="preserve">${escapeXml(text)}</w:t>
    </w:r>
  </w:p>`;
}

/**
 * 将线性正文导出为真正的 Office Open XML (.docx) 文件。
 * 浮动画布中的构思模块不属于正文顺序，因此不会被导出。
 */
export function exportDocumentToWord(sections) {
  const paragraphs = (Array.isArray(sections) ? sections : [])
    .flatMap(getSectionParagraphs);

  if (paragraphs.length === 0) {
    window.alert("当前没有可以导出的正文内容。");
    return false;
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.map(paragraphXml).join("\n")}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const files = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    },
    {
      name: "word/document.xml",
      content: documentXml,
    },
  ];

  const docxBytes = createZip(files);
  const blob = new Blob([docxBytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = makeFileName();
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  return true;
}
