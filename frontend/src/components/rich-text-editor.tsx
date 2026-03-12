"use client";

import type EditorJS from "@editorjs/editorjs";
import { useEffect, useId, useRef, useState } from "react";

import type { EditorJsData } from "@/lib/api";
import { editorDataToPlainText, normalizeEditorData } from "@/lib/editor";

type RichTextEditorProps = {
  initialData?: EditorJsData | null;
  placeholder?: string;
  readOnly?: boolean;
  instanceKey?: string | number;
  onChange?: (data: EditorJsData, plainText: string) => void;
};

type EditorSelectionApi = {
  expandToTag: (element: HTMLElement) => void;
  findParentTag: (tagName: string, className?: string) => HTMLElement | null;
};

type EditorStylesApi = {
  inlineToolButton: string;
  inlineToolButtonActive: string;
};

type EditorApi = {
  selection: EditorSelectionApi;
  styles: EditorStylesApi;
};

type EditorInlineToolConstructorArgs = {
  api: EditorApi;
};

type EditorInlineTool = {
  render: () => HTMLElement;
  surround: (range: Range) => void;
  checkState: () => void;
};

type EditorJsInlineToolClass = {
  new (args: EditorInlineToolConstructorArgs): EditorInlineTool;
  isInline?: boolean;
  sanitize?: Record<string, object>;
  title?: string;
};

type TextAlign = "left" | "center" | "right" | "justify";

type EditorBlockApi = {
  id?: string;
  name?: string;
  holder: HTMLElement;
};

type EditorBlocksApi = {
  getCurrentBlockIndex: () => number;
  getBlockByIndex: (index: number) => EditorBlockApi | null;
  insert: (
    type?: string,
    data?: Record<string, unknown>,
    config?: Record<string, unknown>,
    index?: number,
    needToFocus?: boolean,
  ) => void;
  delete: (index?: number) => void;
};

type EditorCaretApi = {
  setToBlock: (index?: number) => void;
};

type EditorCoreApi = {
  blocks: EditorBlocksApi;
  caret: EditorCaretApi;
};

type EditorBlockTuneConstructorArgs = {
  api: EditorCoreApi;
  block: EditorBlockApi;
  data?: {
    alignment?: TextAlign;
  };
};

type EditorBlockTune = {
  render: () => HTMLElement;
  save: () => Record<string, unknown>;
  wrap?: (blockContent: HTMLElement) => HTMLElement;
};

type EditorJsBlockTuneClass = {
  new (args: EditorBlockTuneConstructorArgs): EditorBlockTune;
  isTune?: boolean;
};

type ColorPickerConstructorArgs = {
  api: EditorApi;
  config?: {
    colors?: string[];
    columns?: number;
  };
};

type ColorPickerLike = {
  new (args: ColorPickerConstructorArgs): {
    api: EditorApi;
    tag?: string;
    render: () => HTMLElement;
    surround: (range: Range) => void;
    renderActions?: () => HTMLElement;
  };
  sanitize?: Record<string, unknown>;
};

function unwrapNode(element: HTMLElement) {
  const textNode = document.createTextNode(element.textContent ?? "");
  element.replaceWith(textNode);
}

function unwrapElementPreservingChildren(element: HTMLElement) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

function createScriptInlineTool(tag: "sub" | "sup", label: string): EditorJsInlineToolClass {
  class ScriptInlineTool implements EditorInlineTool {
    static isInline = true;
    static title = label;
    static sanitize = { sub: {}, sup: {} };

    private readonly api: EditorApi;
    private readonly button: HTMLButtonElement;
    private readonly tag: "sub" | "sup";

    constructor({ api }: EditorInlineToolConstructorArgs) {
      this.api = api;
      this.tag = tag;
      this.button = document.createElement("button");
      this.button.type = "button";
    }

    render(): HTMLElement {
      this.button.classList.add(this.api.styles.inlineToolButton);
      this.button.innerHTML = this.tag === "sub" ? "X<sub>2</sub>" : "X<sup>2</sup>";
      return this.button;
    }

    surround(range: Range) {
      if (!range) return;
      const selected = range.toString().trim();
      if (!selected) return;

      const sameTag = this.api.selection.findParentTag(this.tag);
      if (sameTag) {
        unwrapNode(sameTag);
        return;
      }

      const oppositeTag = this.api.selection.findParentTag(this.tag === "sub" ? "sup" : "sub");
      if (oppositeTag) {
        return;
      }

      const wrapper = document.createElement(this.tag);
      wrapper.textContent = selected;
      range.deleteContents();
      range.insertNode(wrapper);
      this.api.selection.expandToTag(wrapper);
    }

    checkState() {
      const activeTag = this.api.selection.findParentTag(this.tag);
      const oppositeTag = this.api.selection.findParentTag(this.tag === "sub" ? "sup" : "sub");
      this.button.disabled = Boolean(oppositeTag);
      this.button.classList.toggle(this.api.styles.inlineToolButtonActive, Boolean(activeTag));
    }
  }

  return ScriptInlineTool;
}

function createParagraphSizeInlineTool(size: "p1" | "p2" | "p3", label: string): EditorJsInlineToolClass {
  class ParagraphSizeInlineTool implements EditorInlineTool {
    static isInline = true;
    static title = label;
    static sanitize = { span: { class: true, "data-text-size": true } };

    private readonly api: EditorApi;
    private readonly button: HTMLButtonElement;
    private readonly size: "p1" | "p2" | "p3";

    constructor({ api }: EditorInlineToolConstructorArgs) {
      this.api = api;
      this.size = size;
      this.button = document.createElement("button");
      this.button.type = "button";
    }

    render(): HTMLElement {
      this.button.classList.add(this.api.styles.inlineToolButton);
      this.button.textContent = label;
      return this.button;
    }

    surround(range: Range) {
      if (!range) return;
      const paragraph = this.api.selection.findParentTag("DIV");
      if (paragraph?.classList.contains("ce-paragraph")) {
        paragraph.dataset.paragraphSize = this.size;
        paragraph.classList.remove("text-size-p1", "text-size-p2", "text-size-p3");
        paragraph.classList.add(`text-size-${this.size}`);
      }
    }

    checkState() {
      const paragraph = this.api.selection.findParentTag("DIV");
      const currentSize =
        paragraph?.classList.contains("ce-paragraph") && paragraph.dataset.paragraphSize
          ? paragraph.dataset.paragraphSize
          : null;
      this.button.classList.toggle(this.api.styles.inlineToolButtonActive, currentSize === this.size);
    }
  }

  return ParagraphSizeInlineTool;
}

type MainToolType = "h1" | "h2" | "h3" | "paragraph" | "bulletList" | "numberList" | "table" | "image" | "code";

function extractListItems(block: EditorBlockApi): string[] {
  const listItems = Array.from(block.holder.querySelectorAll("li"))
    .map((item) => item.textContent?.trim() ?? "")
    .filter(Boolean);
  if (listItems.length) return listItems;
  const fallback = block.holder.textContent?.trim() ?? "";
  return fallback ? [fallback] : ["Item"];
}

function extractBlockText(block: EditorBlockApi): string {
  const paragraph = block.holder.querySelector(".ce-paragraph");
  if (paragraph?.textContent?.trim()) return paragraph.textContent.trim();

  const header = block.holder.querySelector(".ce-header");
  if (header?.textContent?.trim()) return header.textContent.trim();

  const code = block.holder.querySelector("code");
  if (code?.textContent?.trim()) return code.textContent.trim();

  const list = block.holder.querySelector("li");
  if (list?.textContent?.trim()) return list.textContent.trim();

  const text = block.holder.textContent?.trim() ?? "";
  return text;
}

function dataForConvertedBlock(targetType: MainToolType, currentBlock: EditorBlockApi): Record<string, unknown> {
  const text = extractBlockText(currentBlock);
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  switch (targetType) {
    case "h1":
      return { text, level: 1 };
    case "h2":
      return { text, level: 2 };
    case "h3":
      return { text, level: 3 };
    case "paragraph":
      return { text, size: "p1", alignment: "left" };
    case "bulletList":
      return { style: "unordered", items: extractListItems(currentBlock) };
    case "numberList":
      return { style: "ordered", items: extractListItems(currentBlock) };
    case "table":
      return {
        withHeadings: false,
        content: [lines.length ? lines : [text || ""]],
      };
    case "image":
      return {
        caption: text,
        file: { url: "" },
        withBorder: false,
        withBackground: false,
        stretched: false,
      };
    case "code":
      return { code: text, language: "markup" };
    default:
      return { text };
  }
}

function createMainToolsTune(): EditorJsBlockTuneClass {
  const ALIGNMENTS: Array<{ value: TextAlign; label: string }> = [
    { value: "left", label: "Left" },
    { value: "center", label: "Center" },
    { value: "right", label: "Right" },
    { value: "justify", label: "Justify" },
  ];

  class MainToolsTune implements EditorBlockTune {
    static isTune = true;

    private readonly api: EditorCoreApi;
    private readonly block: EditorBlockApi;
    private alignment: TextAlign;
    private readonly alignmentButtons: Partial<Record<TextAlign, HTMLButtonElement>> = {};

    constructor({ api, block, data }: EditorBlockTuneConstructorArgs) {
      this.api = api;
      this.block = block;
      this.alignment = data?.alignment ?? "left";
    }

    render() {
      const wrapper = document.createElement("div");
      wrapper.className = "ce-main-tools-tune";

      const menuItems: Array<{ label: string; onClick: () => void; align?: TextAlign }> = [
        { label: "H1", onClick: () => this.convertBlock("h1") },
        { label: "H2", onClick: () => this.convertBlock("h2") },
        { label: "H3", onClick: () => this.convertBlock("h3") },
        { label: "Paragraph", onClick: () => this.convertBlock("paragraph") },
        { label: "Bullet List", onClick: () => this.convertBlock("bulletList") },
        { label: "Number List", onClick: () => this.convertBlock("numberList") },
        { label: "Table", onClick: () => this.convertBlock("table") },
        { label: "Image", onClick: () => this.convertBlock("image") },
        { label: "Code", onClick: () => this.convertBlock("code") },
      ];

      menuItems.forEach(({ label, onClick }) => {
        wrapper.appendChild(this.createMenuButton(label, onClick));
      });

      const alignMenu = document.createElement("div");
      alignMenu.className = "ce-main-tools-align-list";
      ALIGNMENTS.forEach(({ value, label }) => {
        const alignButton = this.createMenuButton(`Text align: ${label}`, () => this.setAlignment(value));
        alignButton.classList.add("ce-main-tools-align-button");
        this.alignmentButtons[value] = alignButton;
        alignMenu.appendChild(alignButton);
      });
      wrapper.appendChild(alignMenu);

      const detectedAlignment = this.detectCurrentAlignment();
      if (detectedAlignment) {
        this.alignment = detectedAlignment;
      }
      this.updateAlignmentButtons();
      setTimeout(() => this.applyAlignment(), 0);
      return wrapper;
    }

    wrap(blockContent: HTMLElement) {
      this.applyAlignment(blockContent);
      return blockContent;
    }

    save() {
      return {
        alignment: this.alignment,
      };
    }

    private convertBlock(targetType: MainToolType) {
      const index = this.api.blocks.getCurrentBlockIndex();
      const current = this.api.blocks.getBlockByIndex(index);
      if (!current) return;

      const data = dataForConvertedBlock(targetType, current);
      this.api.blocks.insert(targetType, data, {}, index, true);
      this.api.blocks.delete(index + 1);
      this.api.caret.setToBlock(index);
      window.setTimeout(() => {
        const convertedBlock = this.api.blocks.getBlockByIndex(index);
        if (!convertedBlock) return;
        this.applyAlignmentToHolder(convertedBlock.holder);
      }, 0);
    }

    private createMenuButton(label: string, onClick: () => void) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ce-main-tools-tune-button";
      button.textContent = label;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      });
      return button;
    }

    private setAlignment(alignment: TextAlign) {
      this.alignment = alignment;
      this.updateAlignmentButtons();
      this.applyAlignment();
    }

    private updateAlignmentButtons() {
      (Object.keys(this.alignmentButtons) as TextAlign[]).forEach((value) => {
        const button = this.alignmentButtons[value];
        if (!button) return;
        button.classList.toggle("is-active", this.alignment === value);
      });
    }

    private applyAlignment(blockContent?: HTMLElement) {
      const holder = this.getBlockHolder();
      if (!holder) return;
      const content = blockContent ?? (holder.querySelector(".ce-block__content") as HTMLElement | null);
      if (!content) return;
      this.applyAlignmentToElement(content);

      const paragraph = holder.querySelector(".ce-paragraph") as HTMLDivElement | null;
      if (!paragraph) return;
      this.applyAlignmentToElement(paragraph);
      paragraph.dataset.textAlign = this.alignment;
    }

    private applyAlignmentToHolder(holder: HTMLElement) {
      const content = holder.querySelector(".ce-block__content") as HTMLElement | null;
      if (content) {
        this.applyAlignmentToElement(content);
      }
      const paragraph = holder.querySelector(".ce-paragraph") as HTMLDivElement | null;
      if (paragraph) {
        this.applyAlignmentToElement(paragraph);
        paragraph.dataset.textAlign = this.alignment;
      }
    }

    private applyAlignmentToElement(element: HTMLElement) {
      element.style.textAlign = this.alignment;
      element.dataset.blockAlign = this.alignment;
    }

    private detectCurrentAlignment(): TextAlign | null {
      const holder = this.getBlockHolder();
      if (!holder) return null;
      const paragraph = holder.querySelector(".ce-paragraph") as HTMLDivElement | null;
      const paragraphAlign = paragraph?.dataset.textAlign ?? paragraph?.style.textAlign;
      if (paragraphAlign === "left" || paragraphAlign === "center" || paragraphAlign === "right" || paragraphAlign === "justify") {
        return paragraphAlign;
      }

      const content = holder.querySelector(".ce-block__content") as HTMLElement | null;
      const contentAlign = content?.dataset.blockAlign ?? content?.style.textAlign;
      if (contentAlign === "left" || contentAlign === "center" || contentAlign === "right" || contentAlign === "justify") {
        return contentAlign;
      }
      return null;
    }

    private getBlockHolder(): HTMLElement | null {
      const candidate = (this.block as { holder?: unknown }).holder;
      return candidate instanceof HTMLElement ? candidate : null;
    }
  }

  return MainToolsTune;
}

function createMarkerColorTool(ColorPicker: ColorPickerLike): EditorJsInlineToolClass {
  class MarkerColorTool extends (ColorPicker as unknown as new (args: ColorPickerConstructorArgs) => {
    api: EditorApi;
    tag?: string;
    render: () => HTMLElement;
    surround: (range: Range) => void;
    renderActions?: () => HTMLElement;
  }) {
    static get title() {
      return "Highlight";
    }

    static get sanitize() {
      return {
        span: {
          style: {
            "background-color": true,
            backgroundColor: true,
          },
        },
      };
    }

    renderActions = () => {
      const actions = super.renderActions ? super.renderActions() : document.createElement("div");
      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = "editorjs__color-selector__container-item editorjs__color-selector__container-item-clear";
      clearButton.textContent = "None";
      clearButton.title = "Remove highlight";
      clearButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.clearHighlight();
      });
      actions.prepend(clearButton);
      return actions;
    };

    wrapAndColor(range: Range | null, color: string) {
      if (!range) return;
      const selected = range.extractContents();
      const wrapperTag = (this.tag ?? "SPAN").toUpperCase();
      const wrapper = document.createElement(wrapperTag);
      wrapper.classList.add("cdx-bg-color");
      wrapper.appendChild(selected);
      wrapper.style.backgroundColor = color;
      range.insertNode(wrapper);
      this.api.selection.expandToTag(wrapper);
    }

    private clearHighlight() {
      const highlighted = this.api.selection.findParentTag("SPAN", "cdx-bg-color");
      if (highlighted) {
        unwrapElementPreservingChildren(highlighted);
        return;
      }
      const selectionRange = (this as unknown as { lastRange?: Range | null }).lastRange;
      if (!selectionRange) return;
      const partialHighlight = selectionRange.commonAncestorContainer.parentElement?.closest(".cdx-bg-color");
      if (partialHighlight instanceof HTMLElement) {
        unwrapElementPreservingChildren(partialHighlight);
      }
    }
  }

  return MarkerColorTool as unknown as EditorJsInlineToolClass;
}

function createSizedParagraphTool() {
  class SizedParagraphTool {
    static get isReadOnlySupported() {
      return true;
    }

    static get toolbox() {
      return [
        {
          icon: "<span>P</span>",
          title: "Paragraph",
          data: { size: "p1", alignment: "left" },
        },
        {
          icon: "<span>J</span>",
          title: "Text Align Justify",
          data: { size: "p1", alignment: "justify" },
        },
        {
          icon: "<span>C</span>",
          title: "Text Align Center",
          data: { size: "p1", alignment: "center" },
        },
        {
          icon: "<span>L</span>",
          title: "Text Align Left",
          data: { size: "p1", alignment: "left" },
        },
        {
          icon: "<span>R</span>",
          title: "Text Align Right",
          data: { size: "p1", alignment: "right" },
        },
      ];
    }

    static get conversionConfig() {
      return {
        export: "text",
        import: "text",
      };
    }

    static get sanitize() {
      return {
        text: true,
        size: true,
        alignment: true,
      };
    }

    private data: { text: string; size: "p1" | "p2" | "p3"; alignment: TextAlign };
    private readonly readOnly: boolean;
    private element: HTMLDivElement | null = null;

    constructor({
      data,
      readOnly,
    }: {
      data?: { text?: string; size?: "p1" | "p2" | "p3"; alignment?: TextAlign };
      readOnly: boolean;
    }) {
      this.readOnly = readOnly;
      this.data = {
        text: data?.text ?? "",
        size: data?.size ?? "p1",
        alignment: data?.alignment ?? "left",
      };
      if (!["p1", "p2", "p3"].includes(this.data.size)) {
        this.data.size = "p1";
      }
      if (!["left", "center", "right", "justify"].includes(this.data.alignment)) {
        this.data.alignment = "left";
      }
    }

    render() {
      const element = document.createElement("div");
      element.classList.add("ce-paragraph", `text-size-${this.data.size}`);
      element.dataset.paragraphSize = this.data.size;
      element.dataset.textAlign = this.data.alignment;
      element.style.textAlign = this.data.alignment;
      element.contentEditable = this.readOnly ? "false" : "true";
      element.innerHTML = this.data.text;
      this.element = element;
      return element;
    }

    save(blockContent: HTMLElement) {
      return {
        text: blockContent.innerHTML,
        size: (blockContent.dataset.paragraphSize as "p1" | "p2" | "p3" | undefined) ?? "p1",
        alignment: (blockContent.dataset.textAlign as TextAlign | undefined) ?? "left",
      };
    }

    renderSettings() {
      return [
        {
          icon: "<span>P1</span>",
          label: "P1",
          onActivate: () => this.applySize("p1"),
        },
        {
          icon: "<span>P2</span>",
          label: "P2",
          onActivate: () => this.applySize("p2"),
        },
        {
          icon: "<span>P3</span>",
          label: "P3",
          onActivate: () => this.applySize("p3"),
        },
      ];
    }

    private applySize(size: "p1" | "p2" | "p3") {
      if (!this.element) return;
      this.element.dataset.paragraphSize = size;
      this.element.classList.remove("text-size-p1", "text-size-p2", "text-size-p3");
      this.element.classList.add(`text-size-${size}`);
    }
  }

  return SizedParagraphTool;
}

type PrismLanguageMap = Record<string, { highlight: (code: string) => string }>;
type PrismLike = {
  languages: PrismLanguageMap;
  highlight: (code: string, language: { highlight: (source: string) => string }, name: string) => string;
};

function createMarkdownCodeTool(Prism: PrismLike) {
  const LANGUAGES = ["markup", "javascript", "typescript", "python", "json", "bash"];

  class MarkdownCodeTool {
    static get isReadOnlySupported() {
      return true;
    }

    private data: { code: string; language: string };
    private readonly readOnly: boolean;
    private container: HTMLDivElement | null = null;
    private textarea: HTMLTextAreaElement | null = null;
    private select: HTMLSelectElement | null = null;
    private previewCode: HTMLElement | null = null;

    static get sanitize() {
      return {
        code: true,
        language: true,
      };
    }

    static get conversionConfig() {
      return {
        export: (data: { code?: string }) => data.code ?? "",
        import: (text: string) => ({ code: text ?? "", language: "markup" }),
      };
    }

    constructor({
      data,
      readOnly,
    }: {
      data?: { code?: string; language?: string };
      readOnly: boolean;
    }) {
      this.readOnly = readOnly;
      this.data = {
        code: data?.code ?? "",
        language: data?.language ?? "markup",
      };
    }

    render() {
      const container = document.createElement("div");
      container.className = "markdown-code-block";
      this.container = container;

      if (this.readOnly) {
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.className = `language-${this.data.language}`;
        code.innerHTML = this.highlight(this.data.code, this.data.language);
        pre.appendChild(code);
        container.appendChild(pre);
        return container;
      }

      const toolbar = document.createElement("div");
      toolbar.className = "markdown-code-toolbar";

      const select = document.createElement("select");
      select.className = "select";
      LANGUAGES.forEach((language) => {
        const option = document.createElement("option");
        option.value = language;
        option.textContent = language;
        select.appendChild(option);
      });
      select.value = this.data.language;
      this.select = select;

      const textarea = document.createElement("textarea");
      textarea.className = "textarea min-h-28";
      textarea.placeholder = "Write markdown code...";
      textarea.value = this.data.code;
      this.textarea = textarea;

      const preview = document.createElement("pre");
      const code = document.createElement("code");
      code.className = `language-${this.data.language}`;
      code.innerHTML = this.highlight(this.data.code, this.data.language);
      preview.appendChild(code);
      this.previewCode = code;

      const updatePreview = () => {
        if (!this.previewCode || !this.textarea || !this.select) return;
        const language = this.select.value;
        this.previewCode.className = `language-${language}`;
        this.previewCode.innerHTML = this.highlight(this.textarea.value, language);
      };

      select.addEventListener("change", updatePreview);
      textarea.addEventListener("input", updatePreview);

      toolbar.appendChild(select);
      container.appendChild(toolbar);
      container.appendChild(textarea);
      container.appendChild(preview);

      return container;
    }

    save() {
      return {
        code: this.textarea?.value ?? this.data.code,
        language: this.select?.value ?? this.data.language,
      };
    }

    private highlight(source: string, language: string): string {
      const grammar = Prism.languages[language] ?? Prism.languages.markup;
      if (!grammar) return source;
      try {
        return Prism.highlight(source, grammar, language);
      } catch {
        return source;
      }
    }
  }

  return MarkdownCodeTool;
}

const FONT_COLORS = ["#2C241B", "#C9A227", "#B85C5C", "#5C7A99", "#FFFBF5"];
const HIGHLIGHTER_COLORS = ["#2C241B", "#C9A227", "#B85C5C", "#5C7A99", "#FFFBF5"];

const TOOL_ICONS = {
  h1: "<span>H1</span>",
  h2: "<span>H2</span>",
  h3: "<span>H3</span>",
  bullet: "<span>&bull; List</span>",
  number: "<span>1.</span>",
  table: "<span>Table</span>",
  image: "<span>Image</span>",
  paragraph: "<span>P</span>",
  code: "<span>&lt;/&gt;</span>",
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

export function RichTextEditor({
  initialData,
  placeholder = "Write your content...",
  readOnly = false,
  instanceKey,
  onChange,
}: RichTextEditorProps) {
  const holderId = useId().replace(/:/g, "-");
  const editorRef = useRef<EditorJS | null>(null);
  const onChangeRef = useRef(onChange);
  const initialDataRef = useRef(initialData);
  const readyRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    initialDataRef.current = initialData;
  }, [initialData]);

  useEffect(() => {
    let disposed = false;
    let readOnlyTimeout: ReturnType<typeof setTimeout> | null = null;
    readyRef.current = false;
    setIsReady(false);
    setInitError(false);

    async function setupEditor() {
      try {
        const [
          { default: EditorJsConstructor },
          { default: Header },
          { default: List },
          { default: Table },
          { default: InlineCode },
          { default: ColorPicker },
          { default: ImageTool },
          { default: DragDrop },
          { default: Prism },
        ] = await Promise.all([
          import("@editorjs/editorjs"),
          import("@editorjs/header"),
          import("@editorjs/list"),
          import("@editorjs/table"),
          import("@editorjs/inline-code"),
          import("editorjs-color-picker"),
          import("@editorjs/image"),
          import("editorjs-drag-drop"),
          import("prismjs"),
        ]);

        // Prism components require Prism core to be initialized first.
        await Promise.all([
          import("prismjs/components/prism-markup"),
          import("prismjs/components/prism-javascript"),
          import("prismjs/components/prism-typescript"),
          import("prismjs/components/prism-python"),
          import("prismjs/components/prism-json"),
          import("prismjs/components/prism-bash"),
        ]);

        if (disposed) return;

        const ParagraphTool = createSizedParagraphTool();
        const MarkdownCodeTool = createMarkdownCodeTool(Prism as PrismLike);
        const MainToolsTune = createMainToolsTune();
        const MarkerColorTool = createMarkerColorTool(ColorPicker as unknown as ColorPickerLike);
        const EditorConstructor = EditorJsConstructor as unknown as new (config: Record<string, unknown>) => EditorJS;
        const editor = new EditorConstructor({
        holder: holderId,
        readOnly,
        defaultBlock: "paragraph",
        autofocus: !readOnly,
        placeholder,
        data: normalizeEditorData(initialDataRef.current ?? { blocks: [] }),
        tools: {
          mainTools: {
            class: MainToolsTune,
          },
          paragraph: {
            class: ParagraphTool,
            inlineToolbar: [
              "bold",
              "italic",
              "Color",
              "Marker",
              "p1",
              "p2",
              "p3",
              "inlineCode",
              "subscript",
              "superscript",
            ],
            tunes: ["mainTools"],
          },
          header: {
            class: Header,
            inlineToolbar: ["bold", "italic", "Color", "Marker", "inlineCode", "subscript", "superscript"],
            config: {
              levels: [1, 2, 3],
              defaultLevel: 2,
            },
            toolbox: false,
            tunes: ["mainTools"],
          },
          h1: {
            class: Header,
            inlineToolbar: ["bold", "italic", "Color", "Marker", "inlineCode", "subscript", "superscript"],
            config: {
              levels: [1],
              defaultLevel: 1,
            },
            toolbox: {
              title: "H1",
              icon: TOOL_ICONS.h1,
            },
            tunes: ["mainTools"],
          },
          h2: {
            class: Header,
            inlineToolbar: ["bold", "italic", "Color", "Marker", "inlineCode", "subscript", "superscript"],
            config: {
              levels: [2],
              defaultLevel: 2,
            },
            toolbox: {
              title: "H2",
              icon: TOOL_ICONS.h2,
            },
            tunes: ["mainTools"],
          },
          h3: {
            class: Header,
            inlineToolbar: ["bold", "italic", "Color", "Marker", "inlineCode", "subscript", "superscript"],
            config: {
              levels: [3],
              defaultLevel: 3,
            },
            toolbox: {
              title: "H3",
              icon: TOOL_ICONS.h3,
            },
            tunes: ["mainTools"],
          },
          list: {
            class: List,
            inlineToolbar: ["bold", "italic", "Color", "Marker", "inlineCode", "subscript", "superscript"],
            toolbox: false,
            config: {
              maxLevel: 1,
            },
            tunes: ["mainTools"],
          },
          bulletList: {
            class: List,
            inlineToolbar: ["bold", "italic", "Color", "Marker", "inlineCode", "subscript", "superscript"],
            config: {
              defaultStyle: "unordered",
              maxLevel: 1,
            },
            toolbox: {
              title: "Bullet List",
              icon: TOOL_ICONS.bullet,
            },
            tunes: ["mainTools"],
          },
          numberList: {
            class: List,
            inlineToolbar: ["bold", "italic", "Color", "Marker", "inlineCode", "subscript", "superscript"],
            config: {
              defaultStyle: "ordered",
              maxLevel: 1,
            },
            toolbox: {
              title: "Number List",
              icon: TOOL_ICONS.number,
            },
            tunes: ["mainTools"],
          },
          table: {
            class: Table,
            inlineToolbar: false,
            config: {
              withHeadings: true,
            },
            toolbox: {
              title: "Table",
              icon: TOOL_ICONS.table,
            },
            tunes: ["mainTools"],
          },
          code: {
            class: MarkdownCodeTool,
            toolbox: {
              title: "Code",
              icon: TOOL_ICONS.code,
            },
            tunes: ["mainTools"],
          },
          inlineCode: {
            class: InlineCode,
          },
          Color: {
            class: ColorPicker,
            config: {
              colors: FONT_COLORS,
              columns: 3,
            },
          },
          Marker: {
            class: MarkerColorTool,
            config: {
              colors: HIGHLIGHTER_COLORS,
              columns: 3,
            },
          },
          p1: {
            class: createParagraphSizeInlineTool("p1", "P1"),
          },
          p2: {
            class: createParagraphSizeInlineTool("p2", "P2"),
          },
          p3: {
            class: createParagraphSizeInlineTool("p3", "P3"),
          },
          subscript: {
            class: createScriptInlineTool("sub", "Subscript"),
          },
          superscript: {
            class: createScriptInlineTool("sup", "Superscript"),
          },
          image: {
            class: ImageTool,
            toolbox: {
              title: "Image",
              icon: TOOL_ICONS.image,
            },
            config: {
              features: {
                caption: true,
              },
              uploader: {
                uploadByFile: async (file: File) => {
                  const url = await fileToDataUrl(file);
                  return { success: 1, file: { url } };
                },
                uploadByUrl: async (url: string) => {
                  return { success: 1, file: { url } };
                },
              },
            },
            tunes: ["mainTools"],
          },
        } as Record<string, unknown>,
        onChange: async (api: { saver: { save: () => Promise<EditorJsData> } }) => {
          if (!onChangeRef.current || readOnly) return;
          const data = normalizeEditorData((await api.saver.save()) as EditorJsData);
          onChangeRef.current(data, editorDataToPlainText(data));
        },
      });

        try {
          await editor.isReady;
        } catch {
          if (!disposed) {
            readyRef.current = true;
            setInitError(true);
            setIsReady(true);
          }
          return;
        }

        if (disposed) {
          editor.destroy();
          return;
        }

        if (readOnlyTimeout) {
          clearTimeout(readOnlyTimeout);
          readOnlyTimeout = null;
        }

        if (!readOnly) {
          const DragDropConstructor = DragDrop as unknown as new (editor: EditorJS) => unknown;
          new DragDropConstructor(editor);
        }

        editorRef.current = editor;
        readyRef.current = true;
        setIsReady(true);
      } catch {
        if (!disposed) {
          readyRef.current = true;
          setInitError(true);
          setIsReady(true);
        }
      }
    }

    setupEditor();

    if (readOnly) {
      readOnlyTimeout = setTimeout(() => {
        if (!disposed && !readyRef.current) {
          readyRef.current = true;
          setInitError(true);
          setIsReady(true);
        }
      }, 2000);
    }

    return () => {
      disposed = true;
      if (readOnlyTimeout) {
        clearTimeout(readOnlyTimeout);
      }
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, [holderId, instanceKey, placeholder, readOnly]);

  return (
    <div className="editor-shell">
      {!isReady && <div className="b3 text-muted p-4">Loading editor...</div>}
      {initError ? (
        <div className="b2 p-4 whitespace-pre-wrap">{editorDataToPlainText(normalizeEditorData(initialData ?? { blocks: [] }))}</div>
      ) : (
        <div className={`editorjs-host p-3 ${isReady ? "" : "hidden"}`} id={holderId} />
      )}
    </div>
  );
}
