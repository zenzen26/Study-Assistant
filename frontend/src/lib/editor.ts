import type { EditorJsData } from "@/lib/api";

type ListItem = string | { content: string; items?: ListItem[] };
type ParagraphSize = "p1" | "p2" | "p3";
type TextAlign = "left" | "center" | "right" | "justify";

const PARAGRAPH_SIZES: ParagraphSize[] = ["p1", "p2", "p3"];

function stripHtml(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|h4|figcaption)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

function isParagraphSize(value: unknown): value is ParagraphSize {
  return typeof value === "string" && PARAGRAPH_SIZES.includes(value as ParagraphSize);
}

function isTextAlign(value: unknown): value is TextAlign {
  return value === "left" || value === "center" || value === "right" || value === "justify";
}

function normalizeListItem(item: unknown): ListItem | null {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return null;

  const candidate = item as { content?: unknown; items?: unknown };
  const content = typeof candidate.content === "string" ? candidate.content : "";
  const nested = Array.isArray(candidate.items) ? candidate.items.map(normalizeListItem).filter(Boolean) : [];
  return { content, items: nested as ListItem[] };
}

function flattenList(items: ListItem[], ordered: boolean, level = 0): string[] {
  const lines: string[] = [];
  items.forEach((item, index) => {
    const prefix = "  ".repeat(level) + (ordered ? `${index + 1}. ` : "- ");
    if (typeof item === "string") {
      lines.push(`${prefix}${stripHtml(item)}`);
      return;
    }
    lines.push(`${prefix}${stripHtml(item.content)}`);
    if (item.items?.length) {
      lines.push(...flattenList(item.items, ordered, level + 1));
    }
  });
  return lines;
}

type ParsedBlock = EditorJsData["blocks"][number];

function normalizeTunes(tunes: unknown): Record<string, unknown> | undefined {
  if (!tunes || typeof tunes !== "object" || Array.isArray(tunes)) return undefined;
  return tunes as Record<string, unknown>;
}

function normalizeParagraphBlock(
  block: EditorJsData["blocks"][number],
  sourceData: Record<string, unknown>,
): ParsedBlock {
  const text = typeof sourceData.text === "string" ? sourceData.text : "";
  const size = isParagraphSize(sourceData.size) ? sourceData.size : "p1";
  const alignment = isTextAlign(sourceData.alignment) ? sourceData.alignment : "left";
  return {
    id: block.id,
    type: "paragraph",
    data: {
      text,
      size,
      alignment,
    },
    tunes: normalizeTunes(block.tunes),
  };
}

function normalizeHeaderBlock(
  block: EditorJsData["blocks"][number],
  sourceData: Record<string, unknown>,
  forcedLevel?: 1 | 2 | 3,
): ParsedBlock {
  const candidateLevel = Number(sourceData.level);
  const level = forcedLevel ?? (candidateLevel === 1 || candidateLevel === 2 || candidateLevel === 3 ? candidateLevel : 2);
  const text = typeof sourceData.text === "string" ? sourceData.text : "";
  
  // Map to specific h1, h2, h3 types based on level
  const type = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
  
  return {
    id: block.id,
    type,
    data: {
      text,
      level,
    },
    tunes: normalizeTunes(block.tunes),
  };
}

function normalizeListBlock(
  block: EditorJsData["blocks"][number],
  sourceData: Record<string, unknown>,
  forcedStyle?: "ordered" | "unordered",
): ParsedBlock {
  const style = forcedStyle ?? (sourceData.style === "ordered" ? "ordered" : "unordered");
  const items = Array.isArray(sourceData.items) ? sourceData.items.map(normalizeListItem).filter(Boolean) : [];
  
  // Map to specific list types
  const type = style === "ordered" ? "numberList" : "bulletList";
  
  return {
    id: block.id,
    type,
    data: {
      style,
      items,
    },
    tunes: normalizeTunes(block.tunes),
  };
}

function normalizeTableBlock(block: EditorJsData["blocks"][number], sourceData: Record<string, unknown>): ParsedBlock {
  const rows = Array.isArray(sourceData.content)
    ? sourceData.content.map((row) =>
        Array.isArray(row) ? row.map((cell) => stripHtml(String(cell ?? ""))) : [stripHtml(String(row ?? ""))],
      )
    : [];

  return {
    id: block.id,
    type: "table",
    data: {
      withHeadings: Boolean(sourceData.withHeadings),
      content: rows,
    },
    tunes: normalizeTunes(block.tunes),
  };
}

function normalizeCodeBlock(block: EditorJsData["blocks"][number], sourceData: Record<string, unknown>): ParsedBlock {
  return {
    id: block.id,
    type: "code",
    data: {
      code: typeof sourceData.code === "string" ? sourceData.code : "",
      language: typeof sourceData.language === "string" ? sourceData.language : "markup",
    },
    tunes: normalizeTunes(block.tunes),
  };
}

function normalizeImageBlock(block: EditorJsData["blocks"][number], sourceData: Record<string, unknown>): ParsedBlock {
  const fileUrl =
    (sourceData.file && typeof sourceData.file === "object" && typeof (sourceData.file as { url?: unknown }).url === "string"
      ? (sourceData.file as { url: string }).url
      : undefined) ??
    (typeof sourceData.url === "string" ? sourceData.url : "");
  
  return {
    id: block.id,
    type: "image",
    data: {
      caption: typeof sourceData.caption === "string" ? sourceData.caption : "",
      file: { url: fileUrl },
      stretched: Boolean(sourceData.stretched),
      withBackground: Boolean(sourceData.withBackground),
      withBorder: Boolean(sourceData.withBorder),
    },
    tunes: normalizeTunes(block.tunes),
  };
}

export function normalizeEditorData(input: EditorJsData | null | undefined): EditorJsData {
  if (!input || !Array.isArray(input.blocks)) return { blocks: [] };

  const blocks = input.blocks
    .map((block) => {
      if (!block || typeof block !== "object") return null;
      const sourceData = block.data && typeof block.data === "object" ? block.data : {};

      switch (block.type) {
        case "paragraph":
          return normalizeParagraphBlock(block, sourceData);
        case "header":
          return normalizeHeaderBlock(block, sourceData);
        case "h1":
          return normalizeHeaderBlock(block, sourceData, 1);
        case "h2":
          return normalizeHeaderBlock(block, sourceData, 2);
        case "h3":
          return normalizeHeaderBlock(block, sourceData, 3);
        case "list":
          return normalizeListBlock(block, sourceData);
        case "bulletList":
          return normalizeListBlock(block, sourceData, "unordered");
        case "numberList":
          return normalizeListBlock(block, sourceData, "ordered");
        case "table":
          return normalizeTableBlock(block, sourceData);
        case "code":
        case "markdownCode":
          return normalizeCodeBlock(block, sourceData);
        case "image":
          return normalizeImageBlock(block, sourceData);
        default:
          // Try to convert unknown blocks to paragraphs if they have text
          if (typeof sourceData.text === "string") {
            return normalizeParagraphBlock(block, sourceData);
          }
          return null;
      }
    })
    .filter((block): block is ParsedBlock => Boolean(block));

  return {
    time: input.time,
    version: input.version,
    blocks,
  };
}

export function editorDataToPlainText(data: EditorJsData | null | undefined): string {
  const normalized = normalizeEditorData(data);
  if (!normalized.blocks.length) return "";

  const lines: string[] = [];
  normalized.blocks.forEach((block) => {
    switch (block.type) {
      case "h1":
      case "h2":
      case "h3":
      case "header":
        lines.push(stripHtml(String(block.data.text ?? "")));
        break;
      case "paragraph":
        lines.push(stripHtml(String(block.data.text ?? "")));
        break;
      case "bulletList":
      case "numberList":
      case "list": {
        const listItems = Array.isArray(block.data.items) ? (block.data.items as ListItem[]) : [];
        const ordered = block.type === "numberList" || String(block.data.style ?? "unordered") === "ordered";
        lines.push(...flattenList(listItems, ordered));
        break;
      }
      case "table": {
        const rows = Array.isArray(block.data.content)
          ? (block.data.content as string[][]).map((row) => row.map((cell) => stripHtml(String(cell))).join(" | "))
          : [];
        lines.push(...rows);
        break;
      }
      case "code":
        lines.push(String(block.data.code ?? "").trim());
        break;
      case "image": {
        const caption = stripHtml(String(block.data.caption ?? ""));
        lines.push(caption || "[Image]");
        break;
      }
    }
  });

  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Helper functions for creating blocks
function toParagraphBlock(text: string, size: ParagraphSize = "p1"): ParsedBlock {
  return { 
    type: "paragraph", 
    data: { text, size, alignment: "left" },
    id: crypto.randomUUID?.() || Math.random().toString(36).substr(2, 9)
  };
}

function parseTableLines(lines: string[]): ParsedBlock | null {
  const rows = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => stripHtml(cell.trim())))
    .filter((row) => row.length > 1);

  if (!rows.length) return null;

  return {
    id: crypto.randomUUID?.() || Math.random().toString(36).substr(2, 9),
    type: "table",
    data: {
      withHeadings: rows.length > 1,
      content: rows,
    },
  };
}

const CODE_FENCE_LANG_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  html: "markup",
  xml: "markup",
};

function normalizeFenceLanguage(raw: string | undefined): string {
  if (!raw?.trim()) return "markup";
  const normalized = raw.trim().toLowerCase();
  return CODE_FENCE_LANG_ALIASES[normalized] ?? normalized;
}

export function markdownLikeTextToEditorData(raw: string): EditorJsData {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return { blocks: [] };

  const lines = text.split("\n");
  const blocks: ParsedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length as 1 | 2 | 3;
      const type = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      blocks.push({
        id: crypto.randomUUID?.() || Math.random().toString(36).substr(2, 9),
        type,
        data: {
          level,
          text: headerMatch[2].trim(),
        },
      });
      i += 1;
      continue;
    }

    // Code blocks
    const codeFenceMatch = line.match(/^```([a-zA-Z0-9_+-]*)?\s*$/);
    if (codeFenceMatch) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({
        id: crypto.randomUUID?.() || Math.random().toString(36).substr(2, 9),
        type: "code",
        data: {
          code: codeLines.join("\n"),
          language: normalizeFenceLanguage(codeFenceMatch[1]),
        },
      });
      continue;
    }

    // Bullet list
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({
        id: crypto.randomUUID?.() || Math.random().toString(36).substr(2, 9),
        type: "bulletList",
        data: {
          style: "unordered",
          items,
        },
      });
      continue;
    }

    // Numbered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({
        id: crypto.randomUUID?.() || Math.random().toString(36).substr(2, 9),
        type: "numberList",
        data: {
          style: "ordered",
          items,
        },
      });
      continue;
    }

    // Table
    if (line.includes("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|")) {
        if (/^\s*\|?[-: ]+\|[-|: ]+\|?\s*$/.test(lines[i])) {
          i += 1;
          continue;
        }
        tableLines.push(lines[i]);
        i += 1;
      }
      const tableBlock = parseTableLines(tableLines);
      if (tableBlock) {
        blocks.push(tableBlock);
        continue;
      }
    }

    // Default to paragraph
    blocks.push(toParagraphBlock(line));
    i += 1;
  }

  return normalizeEditorData({ blocks });
}
