"use client";

import { ArrowLeft, Plus, SquarePen, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Flashcard, FlashcardSetRecord, getFlashcardSet, updateFlashcardSet } from "@/lib/api";

function emptyCard(): Flashcard {
  return { question: "", answer: "" };
}

export default function FlashcardSetDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const setId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [record, setRecord] = useState<FlashcardSetRecord | null>(null);
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  const [editMode, setEditMode] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState<FlashcardSetRecord | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!setId) return;
    loadSet(setId);
  }, [setId]);

  async function loadSet(id: string) {
    try {
      const data = await getFlashcardSet(id);
      setRecord(data);
      setEditMode(false);
      setEditSnapshot(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load flashcard set.");
    }
  }

  function updateCard(index: number, field: "question" | "answer", value: string) {
    if (!record) return;
    setRecord({
      ...record,
      cards: record.cards.map((card, cardIndex) => (cardIndex === index ? { ...card, [field]: value } : card)),
    });
  }

  function addCard() {
    if (!record) return;
    setRecord({ ...record, cards: [...record.cards, emptyCard()] });
  }

  function deleteCard(index: number) {
    if (!record) return;
    setRecord({ ...record, cards: record.cards.filter((_, cardIndex) => cardIndex !== index) });
  }

  function enterEditMode() {
    if (!record) return;
    setEditSnapshot(JSON.parse(JSON.stringify(record)) as FlashcardSetRecord);
    setEditMode(true);
  }

  function cancelEditMode() {
    if (!record) return;
    if (!editSnapshot) {
      setEditMode(false);
      return;
    }
    const hasChanges = JSON.stringify(record) !== JSON.stringify(editSnapshot);
    if (hasChanges && !window.confirm("Discard unsaved changes?")) {
      return;
    }
    setRecord(editSnapshot);
    setEditMode(false);
    setEditSnapshot(null);
    setStatus(null);
  }

  async function onSave() {
    if (!record) return;
    if (!record.title.trim()) {
      setStatus("Set name is required.");
      return;
    }
    if (!record.category?.trim()) {
      setStatus("Category is required.");
      return;
    }
    if (!record.cards.length) {
      setStatus("At least one card is required.");
      return;
    }
    if (record.cards.some((card) => !card.question.trim() || !card.answer.trim())) {
      setStatus("Every card must have both question and answer.");
      return;
    }

    setIsSaving(true);
    setStatus("Saving...");
    try {
      const updated = await updateFlashcardSet(record.id, {
        title: record.title.trim(),
        category: record.category.trim(),
        subcategory: record.subcategory?.trim() || undefined,
        description: record.description?.trim() || undefined,
        source_resource_id: record.source_resource_id || undefined,
        cards: record.cards.map((card) => ({ question: card.question.trim(), answer: card.answer.trim() })),
      });
      setRecord(updated);
      setEditMode(false);
      setEditSnapshot(null);
      setStatus("Saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!record) {
    return (
      <section className="panel p-5">
        <p className="b2 text-muted">{status || "Loading..."}</p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="panel space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              className="btn btn-muted p-2"
              onClick={() => router.push("/library")}
              title="Back to Library"
              type="button"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h2 className="h2 mono">Flashcard Set</h2>
          </div>
          <button
            className="btn btn-muted p-2"
            onClick={() => (editMode ? cancelEditMode() : enterEditMode())}
            title={editMode ? "Exit Edit Mode" : "Edit Mode"}
            type="button"
          >
            <SquarePen className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <input
            className="input"
            value={record.title}
            onChange={(event) => setRecord({ ...record, title: event.target.value })}
            disabled={!editMode}
            placeholder="Name"
          />
          <input
            className="input"
            value={record.category ?? ""}
            onChange={(event) => setRecord({ ...record, category: event.target.value || null })}
            placeholder="Category"
            disabled={!editMode}
          />
          <input
            className="input"
            value={record.subcategory ?? ""}
            onChange={(event) => setRecord({ ...record, subcategory: event.target.value || null })}
            placeholder="Subcategory"
            disabled={!editMode}
          />
          <input
            className="input"
            value={record.description ?? ""}
            onChange={(event) => setRecord({ ...record, description: event.target.value || null })}
            placeholder="Short description"
            disabled={!editMode}
          />
        </div>

        {editMode && (
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={onSave} disabled={isSaving} type="button">
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
            <button className="btn btn-muted" onClick={cancelEditMode} disabled={isSaving} type="button">
              Cancel
            </button>
            <button className="btn btn-muted" onClick={addCard} type="button">
              <Plus className="mr-1 h-4 w-4" />
              Add Card
            </button>
          </div>
        )}
      </header>

      {!editMode && (
        <div className="grid gap-4 lg:grid-cols-2">
          {record.cards.map((card, index) => (
            <button
              key={`${card.question}-${index}`}
              className={`flip-card text-left ${flipped[index] ? "is-flipped" : ""}`}
              onClick={() => setFlipped((state) => ({ ...state, [index]: !state[index] }))}
              type="button"
            >
              <div className="flip-card-inner">
                <div className="flip-card-face panel-strong flex flex-col gap-3 p-4">
                  <span className="chip self-start">Card {index + 1}</span>
                  <div className="flex min-h-[140px] flex-1 items-center justify-center">
                    <p className="b1 text-center">{card.question}</p>
                  </div>
                </div>
                <div className="flip-card-face flip-card-back panel-strong flex flex-col gap-3 p-4">
                  <span className="chip self-start">Answer</span>
                  <div className="flex min-h-[140px] flex-1 items-center justify-center">
                    <p className="b1 text-center">{card.answer}</p>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {editMode && (
        <div className="space-y-3">
          {record.cards.length === 0 && (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-4 b2 text-muted">
              No cards yet. Use &quot;Add Card&quot; to create one.
            </div>
          )}
          {record.cards.map((card, index) => (
            <div key={`edit-${index}`} className="panel-strong space-y-3 p-4">
              <div className="flex items-center justify-between">
                <span className="chip">Card {index + 1}</span>
                <button className="btn btn-muted" onClick={() => deleteCard(index)} type="button">
                  <Trash2 className="mr-1 h-4 w-4" />
                  Delete Card
                </button>
              </div>
              <input
                className="input"
                value={card.question}
                onChange={(event) => updateCard(index, "question", event.target.value)}
                placeholder="Question"
              />
              <textarea
                className="textarea min-h-24"
                value={card.answer}
                onChange={(event) => updateCard(index, "answer", event.target.value)}
                placeholder="Answer"
              />
            </div>
          ))}
        </div>
      )}

      {status && <p className="b2 text-muted">{status}</p>}
    </section>
  );
}
