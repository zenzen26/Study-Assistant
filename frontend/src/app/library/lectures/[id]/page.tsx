"use client";

import { ArrowLeft, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { RichTextEditor } from "@/components/rich-text-editor";
import { deleteLecture, EditorJsData, getLecture, LectureRecord, updateLecture } from "@/lib/api";
import { editorDataToPlainText, markdownLikeTextToEditorData, normalizeEditorData } from "@/lib/editor";

export default function LectureDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const lectureId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [record, setRecord] = useState<LectureRecord | null>(null);
  const [editorBlocks, setEditorBlocks] = useState<EditorJsData>({ blocks: [] });
  const [editorInstanceKey, setEditorInstanceKey] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState<{ record: LectureRecord; blocks: EditorJsData } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!lectureId) return;
    loadLecture(lectureId);
  }, [lectureId]);

  async function loadLecture(id: string) {
    try {
      const lecture = await getLecture(id);
      const hasValidBlocks =
        lecture.content_blocks &&
        typeof lecture.content_blocks === "object" &&
        Array.isArray((lecture.content_blocks as EditorJsData).blocks) &&
        (lecture.content_blocks as EditorJsData).blocks.length > 0;
      const blocks = hasValidBlocks
        ? normalizeEditorData(lecture.content_blocks as EditorJsData)
        : normalizeEditorData(markdownLikeTextToEditorData(lecture.content));
      setRecord({
        ...lecture,
        content_blocks: blocks,
        content: editorDataToPlainText(blocks),
      });
      setEditorBlocks(blocks);
      setEditorInstanceKey((current) => current + 1);
      setEditMode(false);
      setEditSnapshot(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load lecture.");
    }
  }

  function enterEditMode() {
    if (!record) return;
    setEditSnapshot({
      record: JSON.parse(JSON.stringify(record)) as LectureRecord,
      blocks: JSON.parse(JSON.stringify(editorBlocks)) as EditorJsData,
    });
    setEditMode(true);
  }

  function cancelEditMode() {
    if (!record) return;
    if (!editSnapshot) {
      setEditMode(false);
      return;
    }
    const hasChanges =
      JSON.stringify(record) !== JSON.stringify(editSnapshot.record) ||
      JSON.stringify(editorBlocks) !== JSON.stringify(editSnapshot.blocks);
    if (hasChanges && !window.confirm("Discard unsaved changes?")) {
      return;
    }
    setRecord(editSnapshot.record);
    setEditorBlocks(editSnapshot.blocks);
    setEditorInstanceKey((current) => current + 1);
    setEditMode(false);
    setEditSnapshot(null);
    setStatus(null);
  }

  async function onSave() {
    if (!record) return;
    if (!record.title.trim() || !record.content.trim()) {
      setStatus("Name and content are required.");
      return;
    }
    if (!record.category?.trim()) {
      setStatus("Category is required.");
      return;
    }

    setIsSaving(true);
    setStatus("Saving...");
    try {
      const updated = await updateLecture(record.id, {
        title: record.title.trim(),
        content: record.content.trim(),
        content_blocks: normalizeEditorData(editorBlocks),
        category: record.category.trim(),
        subcategory: record.subcategory?.trim() || undefined,
        description: record.description?.trim() || undefined,
        source_resource_id: record.source_resource_id || undefined,
      });
      setRecord({
        ...updated,
        content_blocks: normalizeEditorData(updated.content_blocks ?? editorBlocks),
      });
      setEditMode(false);
      setEditSnapshot(null);
      setStatus("Saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function onDeleteLecture() {
    if (!record || isDeleting || isSaving) return;
    if (!window.confirm("Delete this lecture entry? This cannot be undone.")) {
      return;
    }

    setIsDeleting(true);
    setStatus("Deleting lecture...");
    try {
      await deleteLecture(record.id);
      router.push("/library");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Delete failed.");
      setIsDeleting(false);
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
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              className="btn btn-muted p-2"
              onClick={() => router.push("/library")}
              title="Back to Library"
              type="button"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h2 className="h2 mono">Lecture Entry</h2>
          </div>
          <button
            className="btn btn-muted"
            onClick={onDeleteLecture}
            disabled={isDeleting || isSaving}
            type="button"
          >
            <Trash2 className="mr-1 h-4 w-4" />
            {isDeleting ? "Deleting..." : "Delete Lecture"}
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
        <div className="flex gap-2">
          {!editMode && (
            <button className="btn btn-muted" onClick={enterEditMode} type="button">
              Edit Mode
            </button>
          )}
          {editMode && (
            <>
              <button className="btn btn-primary" onClick={onSave} disabled={isSaving} type="button">
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
              <button className="btn btn-muted" onClick={cancelEditMode} disabled={isSaving} type="button">
                Cancel
              </button>
            </>
          )}
        </div>
      </header>

      <section className="panel p-5">
        <RichTextEditor
          instanceKey={`${editorInstanceKey}-${editMode ? "edit" : "read"}`}
          initialData={editorBlocks}
          readOnly={!editMode}
          onChange={(data, plainText) => {
            setEditorBlocks(data);
            setRecord((current) => (current ? { ...current, content: plainText, content_blocks: data } : current));
          }}
        />
      </section>

      {status && <p className="b2 text-muted">{status}</p>}
    </section>
  );
}
