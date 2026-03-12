"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  createFlashcardSet,
  Flashcard,
  generateFlashcards,
  listResources,
  ResourceRecord,
} from "@/lib/api";

type Mode = "manual" | "ai";
type SourceMode = "upload" | "resource";

export default function FlashcardsPage() {
  const [mode, setMode] = useState<Mode>("manual");
  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [resources, setResources] = useState<ResourceRecord[]>([]);
  const [resourceId, setResourceId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saveUpload, setSaveUpload] = useState(false);
  const [resourceCategory, setResourceCategory] = useState("");
  const [resourceSubcategory, setResourceSubcategory] = useState("");
  const [resourceDescription, setResourceDescription] = useState("");

  const [setTitle, setSetTitle] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [description, setDescription] = useState("");
  const [topic, setTopic] = useState("");
  const [numCards, setNumCards] = useState(10);
  const [cards, setCards] = useState<Flashcard[]>([]);

  const [manualQuestion, setManualQuestion] = useState("");
  const [manualAnswer, setManualAnswer] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    refreshResources();
  }, []);

  const canGenerate = useMemo(() => {
    if (mode !== "ai") return false;
    if (sourceMode === "upload") return Boolean(file);
    return Boolean(resourceId);
  }, [file, mode, resourceId, sourceMode]);

  async function refreshResources() {
    try {
      setResources(await listResources());
    } catch {
      setStatus("Failed to load resources.");
    }
  }

  function addManualCard() {
    if (!manualQuestion.trim() || !manualAnswer.trim()) {
      setStatus("Question and answer are required.");
      return;
    }

    setCards((current) => [...current, { question: manualQuestion.trim(), answer: manualAnswer.trim() }]);
    setManualQuestion("");
    setManualAnswer("");
    setStatus("Manual card added.");
  }

  function removeCard(index: number) {
    setCards((current) => current.filter((_, cardIndex) => cardIndex !== index));
  }

  async function onGenerate(event: FormEvent) {
    event.preventDefault();
    if (!canGenerate) return;
    if (sourceMode === "upload" && saveUpload && !resourceCategory.trim()) {
      setStatus("Category is required in resource metadata when saving upload to resources.");
      return;
    }

    setIsGenerating(true);
    setStatus("Generating flashcards...");
    try {
      const result = await generateFlashcards({
        resourceId: sourceMode === "resource" ? resourceId : undefined,
        file: sourceMode === "upload" ? file ?? undefined : undefined,
        saveUploadToResources: sourceMode === "upload" ? saveUpload : false,
        category: resourceCategory.trim(),
        subcategory: resourceSubcategory.trim(),
        description: resourceDescription.trim(),
        numCards,
        topic,
      });
      setCards(result.cards);
      setStatus("Flashcards generated. Review and edit before saving.");
      if (result.source_resource) {
        await refreshResources();
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function onSave() {
    if (!setTitle.trim()) {
      setStatus("Name is required.");
      return;
    }
    if (!category.trim()) {
      setStatus("Category is required.");
      return;
    }
    if (!cards.length) {
      setStatus("Add at least one flashcard before saving.");
      return;
    }

    setIsSaving(true);
    setStatus("Saving flashcard set...");
    try {
      await createFlashcardSet({
        title: setTitle.trim(),
        category: category.trim(),
        subcategory: subcategory.trim() || undefined,
        description: description.trim() || undefined,
        source_resource_id: sourceMode === "resource" ? resourceId || undefined : undefined,
        cards,
      });
      setStatus("Flashcard set saved to library.");
      setSetTitle("");
      setCards([]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="h2 mono">FlashCards</h2>
        <p className="b2 text-muted">Manual creation or AI generation with editable review.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          className={`btn ${mode === "manual" ? "btn-primary" : "btn-muted"}`}
          onClick={() => setMode("manual")}
          type="button"
        >
          Manual Mode
        </button>
        <button
          className={`btn ${mode === "ai" ? "btn-primary" : "btn-muted"}`}
          onClick={() => setMode("ai")}
          type="button"
        >
          AI Mode
        </button>
      </div>

      {mode === "manual" ? (
        <section className="panel space-y-4 p-5">
          <p className="label">Create your own cards</p>
          <input
            className="input"
            value={manualQuestion}
            onChange={(event) => setManualQuestion(event.target.value)}
            placeholder="Question"
          />
          <textarea
            className="textarea min-h-24"
            value={manualAnswer}
            onChange={(event) => setManualAnswer(event.target.value)}
            placeholder="Answer"
          />
          <button className="btn btn-primary" onClick={addManualCard} type="button">
            Add Card
          </button>
        </section>
      ) : (
        <form onSubmit={onGenerate} className="panel grid gap-4 p-5 lg:grid-cols-2">
          <div className="space-y-2 lg:col-span-2">
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

          {sourceMode === "upload" ? (
            <div className="space-y-2">
              <p className="label">Upload File</p>
              <input
                className="input"
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
          ) : (
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
          )}

          {sourceMode === "upload" && (
            <div className="flex flex-col space-y-4">
              <label className="label cursor-pointer flex gap-3">
                <input
                  type="checkbox"
                  checked={saveUpload}
                  onChange={(event) => setSaveUpload(event.target.checked)}
                />
                <span>Save Upload to Resource Library</span>
              </label>
              {saveUpload && (
                <div className="grid gap-3 lg:grid-cols-3">
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

          <div className="space-y-2">
            <p className="label">Number of Cards</p>
            <input
              className="input"
              min={1}
              max={50}
              type="number"
              value={numCards}
              onChange={(event) => setNumCards(Number(event.target.value))}
            />
          </div>
          <div className="space-y-2">
            <p className="label">Topic Focus</p>
            <input
              className="input"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="lg:col-span-2">
            <button className="btn btn-primary" disabled={!canGenerate || isGenerating} type="submit">
              {isGenerating ? "Generating..." : "Generate Cards"}
            </button>
          </div>
        </form>
      )}

      <section className="panel space-y-4 p-5">
        <p className="label">Review cards, edit, then save to library</p>
        <div className="grid gap-3 md:grid-cols-4">
          <input
            className="input"
            value={setTitle}
            onChange={(event) => setSetTitle(event.target.value)}
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

        <div className="space-y-3">
          {cards.length === 0 && (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-4 b2 text-muted">No cards yet.</div>
          )}
          {cards.map((card, index) => (
            <div key={`${card.question}-${index}`} className="panel-strong space-y-2 p-3">
              <div className="flex items-center justify-between">
                <span className="chip">Card {index + 1}</span>
                <button className="btn btn-muted" onClick={() => removeCard(index)} type="button">
                  Remove
                </button>
              </div>
              <input
                className="input"
                value={card.question}
                onChange={(event) =>
                  setCards((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, question: event.target.value } : item,
                    ),
                  )
                }
                placeholder="Question"
              />
              <textarea
                className="textarea min-h-20"
                value={card.answer}
                onChange={(event) =>
                  setCards((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, answer: event.target.value } : item,
                    ),
                  )
                }
                placeholder="Answer"
              />
            </div>
          ))}
        </div>

        <button className="btn btn-primary" disabled={isSaving || !cards.length} onClick={onSave} type="button">
          {isSaving ? "Saving..." : "Save to Library"}
        </button>
        {status && <p className="b2 text-muted">{status}</p>}
      </section>
    </section>
  );
}
