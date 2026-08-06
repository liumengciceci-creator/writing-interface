function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getSectionText(section) {
  if (section?.mode === "completed") {
    return String(section.completedText ?? "").trim();
  }

  return (Array.isArray(section?.blocks) ? section.blocks : [])
    .map((block) => String(block?.text ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function isTitleSection(section) {
  return (
    Array.isArray(section?.blocks) &&
    section.blocks.some(
      (block) =>
        block?.type === "Title" &&
        block?.placement !== "floating"
    )
  );
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
  return `<w:p>
    <w:pPr><w:spacing w:before="${isTitle ? 200 : 0}" w:after="${isTitle ? 240 : 200}" w:line="${isTitle ? 520 : 420}" w:lineRule="auto"/><w:jc w:val="${isTitle ? "left" : "both"}"/></w:pPr>
    <w:r>
      <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体"/>${isTitle ? "<w:b/><w:bCs/>" : ""}<w:sz w:val="${isTitle ? 36 : 24}"/><w:szCs w:val="${isTitle ? 36 : 24}"/></w:rPr>
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
    .map((section) => ({
      text: getSectionText(section),
      isTitle: isTitleSection(section),
    }))
    .filter((paragraph) => Boolean(paragraph.text))
    .flatMap((paragraph) =>
      paragraph.text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((text) => ({
          text,
          isTitle: paragraph.isTitle,
        }))
    );

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
