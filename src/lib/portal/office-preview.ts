import { inflateRawSync } from "node:zlib";

const MAX_PREVIEW_CHARS = 20_000;

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Lee una entrada de un ZIP con tamaño en la cabecera local (docx/xlsx de Office). */
function readZipEntry(buf: Buffer, entryName: string): string | null {
  let offset = 0;
  while (offset + 30 <= buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) return null;
    const method = buf.readUInt16LE(offset + 8);
    const flags = buf.readUInt16LE(offset + 6);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.toString("utf8", offset + 30, offset + 30 + nameLen);
    const dataStart = offset + 30 + nameLen + extraLen;
    if (dataStart > buf.length) return null;
    if (name === entryName && (flags & 0x8) === 0) {
      const data = buf.subarray(dataStart, dataStart + compSize);
      try {
        const raw = method === 0 ? data : method === 8 ? inflateRawSync(data) : null;
        return raw ? raw.toString("utf8") : null;
      } catch {
        return null;
      }
    }
    if ((flags & 0x8) !== 0 || compSize === 0) return null;
    offset = dataStart + compSize;
  }
  return null;
}

export function previewDocx(buf: Buffer): string | null {
  const xml = readZipEntry(buf, "word/document.xml");
  if (!xml) return null;
  const text = decodeXml(
    xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.slice(0, MAX_PREVIEW_CHARS);
}

export function previewXlsx(buf: Buffer): string | null {
  const sharedXml = readZipEntry(buf, "xl/sharedStrings.xml") ?? "";
  const strings = [...sharedXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) =>
    decodeXml(m[1] ?? "")
  );
  const sheet =
    readZipEntry(buf, "xl/worksheets/sheet1.xml") ??
    readZipEntry(buf, "xl/worksheets/sheet.xml");
  if (!sheet) return strings.length > 0 ? strings.join("\n").slice(0, MAX_PREVIEW_CHARS) : null;

  const rows: string[] = [];
  for (const row of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cell of (row[1] ?? "").matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cell[1] ?? "";
      const body = cell[2] ?? "";
      const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
      if (/\bt="s"/.test(attrs)) {
        cells.push(strings[Number(value)] ?? "");
      } else if (/\bt="inlineStr"/.test(attrs)) {
        cells.push(decodeXml(/<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] ?? ""));
      } else {
        cells.push(decodeXml(value));
      }
    }
    const line = cells.join("\t").trim();
    if (line) rows.push(line);
    if (rows.length >= 80) break;
  }
  const text = rows.join("\n").trim();
  return text ? text.slice(0, MAX_PREVIEW_CHARS) : null;
}
