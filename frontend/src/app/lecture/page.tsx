"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { RichTextEditor } from "@/components/rich-text-editor";
import { createLecture, EditorJsData, generateLecture, listResources, ResourceRecord } from "@/lib/api";
import { editorDataToPlainText, markdownLikeTextToEditorData, normalizeEditorData } from "@/lib/editor";

type SourceMode = "upload" | "resource";

export default function LecturePage() {
  const [resources, setResources] = useState<ResourceRecord[]>([]);
  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [resourceId, setResourceId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saveUpload, setSaveUpload] = useState(false);
  const [resourceCategory, setResourceCategory] = useState("");
  const [resourceSubcategory, setResourceSubcategory] = useState("");
  const [resourceDescription, setResourceDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");

  const [generatedBlocks, setGeneratedBlocks] = useState<EditorJsData>({ blocks: [] });
  const [generatedPlainText, setGeneratedPlainText] = useState("");
  const [sourceResourceId, setSourceResourceId] = useState<string | null>(null);
  const [lectureTitle, setLectureTitle] = useState("");
  const [editorInstanceKey, setEditorInstanceKey] = useState(0);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    refreshResources();
  }, []);

  const canGenerate = useMemo(() => {
    if (sourceMode === "upload") return Boolean(file);
    return Boolean(resourceId);
  }, [file, resourceId, sourceMode]);

  async function refreshResources() {
    try {
      setResources(await listResources());
    } catch {
      setStatus("Failed to load resources.");
    }
  }

  async function onGenerate(event: FormEvent) {
    event.preventDefault();
    if (!canGenerate) return;
    if (sourceMode === "upload" && saveUpload && !resourceCategory.trim()) {
      setStatus("Category is required in resource metadata when saving upload to resources.");
      return;
    }

    setIsGenerating(true);
    setStatus("Generating lecture...");
    try {
      const result = await generateLecture({
        resourceId: sourceMode === "resource" ? resourceId : undefined,
        file: sourceMode === "upload" ? file ?? undefined : undefined,
        saveUploadToResources: sourceMode === "upload" ? saveUpload : false,
        category: resourceCategory.trim(),
        subcategory: resourceSubcategory.trim(),
        description: resourceDescription.trim(),
        systemPrompt,
      });

      const parsedBlocks = normalizeEditorData(markdownLikeTextToEditorData(result.generated_content));
      setGeneratedBlocks(parsedBlocks);
      setGeneratedPlainText(editorDataToPlainText(parsedBlocks));
      setEditorInstanceKey((current) => current + 1);
      setSourceResourceId(result.source_resource?.id ?? (sourceMode === "resource" ? resourceId : null));
      setLectureTitle((current) => current || "Generated Lecture");
      setStatus("Lecture generated. Review and edit before saving.");

      if (result.source_resource) {
        await refreshResources();
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function onSaveToLibrary() {
    if (!generatedPlainText.trim() || !lectureTitle.trim()) {
      setStatus("Lecture name and content are required.");
      return;
    }
    if (!category.trim()) {
      setStatus("Category is required.");
      return;
    }

    setIsSaving(true);
    setStatus("Saving lecture to library...");
    try {
      await createLecture({
        title: lectureTitle.trim(),
        content: generatedPlainText.trim(),
        content_blocks: generatedBlocks,
        category: category.trim(),
        subcategory: subcategory.trim() || undefined,
        description: description.trim() || undefined,
        source_resource_id: sourceResourceId ?? undefined,
      });
      setStatus("Lecture saved to library.");
      setLectureTitle("");
      setGeneratedBlocks({ blocks: [] });
      setGeneratedPlainText("");
      setEditorInstanceKey((current) => current + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="h2 mono">Lecture Retell</h2>
        <p className="b2 text-muted">Generate, review in Editor.js, edit, then save to library.</p>
      </header>

      <form onSubmit={onGenerate} className="panel space-y-5 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <p className="label">Source Mode</p>
            <div className="source-mode-tabs" role="tablist" aria-label="Source mode">
              <button
                type="button"
                role="tab"
                aria-selected={sourceMode === "upload"}
                className={`source-mode-tab ${sourceMode === "upload" ? "is-active" : ""}`}
                onClick={() => setSourceMode("upload")}
              >
                Upload PDF / DOCX / TXT
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sourceMode === "resource"}
                className={`source-mode-tab ${sourceMode === "resource" ? "is-active" : ""}`}
                onClick={() => setSourceMode("resource")}
              >
                Use Resource
              </button>
            </div>
          </div>

          {sourceMode === "resource" ? (
            <div className="space-y-2">
              <p className="label">Resource</p>
              <select className="select" value={resourceId} onChange={(event) => setResourceId(event.target.value)}>
                <option value="">Select a resource</option>
                {resources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="label">Upload File</p>
              <input
                className="input"
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
          )}

          {sourceMode === "upload" && (
            <div className="flex flex-col space-y-4 md:col-span-2">
              <label className="label cursor-pointer flex gap-3">
                <input type="checkbox" checked={saveUpload} onChange={(event) => setSaveUpload(event.target.checked)} />
                <span>Save Upload to Resource Library</span>
              </label>
              {saveUpload && (
                <div className="grid gap-3 md:grid-cols-3">
                  <input
                    className="input"
                    value={resourceCategory}
                    onChange={(event) => setResourceCategory(event.target.value)}
                    placeholder="Resource Category (Required)"
                  />
                  <input
                    className="input"
                    value={resourceSubcategory}
                    onChange={(event) => setResourceSubcategory(event.target.value)}
                    placeholder="Resource Subcategory (Optional)"
                  />
                  <input
                    className="input"
                    value={resourceDescription}
                    onChange={(event) => setResourceDescription(event.target.value)}
                    placeholder="Resource Description (Optional)"
                  />
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 md:col-span-2">
            <p className="label">System Prompt (Retell style)</p>
            <textarea
              className="textarea min-h-28"
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              placeholder="Example: Explain with game analogies and bullet points."
            />
          </div>
        </div>

        <button className="btn btn-primary" disabled={!canGenerate || isGenerating} type="submit">
          {isGenerating ? "Generating..." : "Generate Lecture"}
        </button>
      </form>

      <section className="panel space-y-4 p-5">
        <p className="label">Review and edit before save</p>
        <div className="grid gap-3 md:grid-cols-4">
          <input
            className="input"
            value={lectureTitle}
            onChange={(event) => setLectureTitle(event.target.value)}
            placeholder="Name (Required)"
          />
          <input
            className="input"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Category (Required)"
          />
          <input
            className="input"
            value={subcategory}
            onChange={(event) => setSubcategory(event.target.value)}
            placeholder="Subcategory (Optional)"
          />
          <input
            className="input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Short description (Optional)"
          />
        </div>
        <RichTextEditor
          instanceKey={editorInstanceKey}
          initialData={generatedBlocks}
          onChange={(data, plainText) => {
            setGeneratedBlocks(data);
            setGeneratedPlainText(plainText);
          }}
        />
        <button
          className="btn btn-primary"
          onClick={onSaveToLibrary}
          disabled={!generatedPlainText.trim() || !lectureTitle.trim() || isSaving}
          type="button"
        >
          {isSaving ? "Saving..." : "Save to Library"}
        </button>
        {status && <p className="b2 text-muted">{status}</p>}
      </section>
    </section>
  );
}
