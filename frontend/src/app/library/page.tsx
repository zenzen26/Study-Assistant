"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  deleteFlashcardSet,
  deleteLecture,
  deleteResource,
  FlashcardSetRecord,
  getResourceDownloadUrl,
  getResourcePreviewUrl,
  LectureRecord,
  listFlashcardSets,
  listLectures,
  listResources,
  ResourceRecord,
  updateResource,
  uploadResource,
} from "@/lib/api";

const tabs = ["Resources", "FlashCards Generated", "Lecture Generated"] as const;
type Tab = (typeof tabs)[number];
type SortMode = "uploaded" | "name";

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().trim();
}

function toTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Resources");
  const [resources, setResources] = useState<ResourceRecord[]>([]);
  const [flashcardSets, setFlashcardSets] = useState<FlashcardSetRecord[]>([]);
  const [lectures, setLectures] = useState<LectureRecord[]>([]);

  const [resourceFile, setResourceFile] = useState<File | null>(null);
  const [resourceCategory, setResourceCategory] = useState("");
  const [resourceSubcategory, setResourceSubcategory] = useState("");
  const [resourceDescription, setResourceDescription] = useState("");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortMode>("uploaded");

  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [resourceDraft, setResourceDraft] = useState({
    name: "",
    category: "",
    subcategory: "",
    description: "",
  });
  const [resourceDraftInitial, setResourceDraftInitial] = useState({
    name: "",
    category: "",
    subcategory: "",
    description: "",
  });

  const [status, setStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingResource, setIsSavingResource] = useState(false);
  const [isDeletingResourceId, setIsDeletingResourceId] = useState<string | null>(null);
  const [isDeletingFlashcardSetId, setIsDeletingFlashcardSetId] = useState<string | null>(null);
  const [isDeletingLectureId, setIsDeletingLectureId] = useState<string | null>(null);

  useEffect(() => {
    refreshAll();
  }, []);

  const resourcesById = useMemo(() => new Map(resources.map((resource) => [resource.id, resource])), [resources]);

  const filteredResources = useMemo(() => {
    const searchValue = normalize(search);
    const categoryValue = normalize(categoryFilter);
    return [...resources]
      .filter((resource) => {
        if (categoryValue && normalize(resource.category) !== categoryValue) return false;
        if (!searchValue) return true;
        const searchable = [resource.name, resource.file_name, resource.category, resource.subcategory, resource.description]
          .map((value) => normalize(value))
          .join(" ");
        return searchable.includes(searchValue);
      })
      .sort((a, b) =>
        sortBy === "name"
          ? a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
          : toTimestamp(b.created_at) - toTimestamp(a.created_at),
      );
  }, [categoryFilter, resources, search, sortBy]);

  const filteredFlashcardSets = useMemo(() => {
    const searchValue = normalize(search);
    const categoryValue = normalize(categoryFilter);
    return [...flashcardSets]
      .filter((setRecord) => {
        if (categoryValue && normalize(setRecord.category) !== categoryValue) return false;
        if (!searchValue) return true;
        const sourceFileName = setRecord.source_resource_id ? resourcesById.get(setRecord.source_resource_id)?.file_name ?? "" : "";
        const searchable = [
          setRecord.title,
          sourceFileName,
          setRecord.category,
          setRecord.subcategory,
          setRecord.description,
        ]
          .map((value) => normalize(value))
          .join(" ");
        return searchable.includes(searchValue);
      })
      .sort((a, b) =>
        sortBy === "name"
          ? a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
          : toTimestamp(b.created_at) - toTimestamp(a.created_at),
      );
  }, [categoryFilter, flashcardSets, resourcesById, search, sortBy]);

  const filteredLectures = useMemo(() => {
    const searchValue = normalize(search);
    const categoryValue = normalize(categoryFilter);
    return [...lectures]
      .filter((lecture) => {
        if (categoryValue && normalize(lecture.category) !== categoryValue) return false;
        if (!searchValue) return true;
        const sourceFileName = lecture.source_resource_id ? resourcesById.get(lecture.source_resource_id)?.file_name ?? "" : "";
        const searchable = [lecture.title, sourceFileName, lecture.category, lecture.subcategory, lecture.description]
          .map((value) => normalize(value))
          .join(" ");
        return searchable.includes(searchValue);
      })
      .sort((a, b) =>
        sortBy === "name"
          ? a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
          : toTimestamp(b.created_at) - toTimestamp(a.created_at),
      );
  }, [categoryFilter, lectures, resourcesById, search, sortBy]);

  const categoryOptions = useMemo(() => {
    if (activeTab === "Resources") {
      return Array.from(new Set(resources.map((resource) => resource.category).filter(Boolean))) as string[];
    }
    if (activeTab === "FlashCards Generated") {
      return Array.from(new Set(flashcardSets.map((setRecord) => setRecord.category).filter(Boolean))) as string[];
    }
    return Array.from(new Set(lectures.map((lecture) => lecture.category).filter(Boolean))) as string[];
  }, [activeTab, flashcardSets, lectures, resources]);

  async function refreshAll() {
    try {
      const [resourceData, setData, lectureData] = await Promise.all([
        listResources(),
        listFlashcardSets(),
        listLectures(),
      ]);
      setResources(resourceData);
      setFlashcardSets(setData);
      setLectures(lectureData);
    } catch {
      setStatus("Failed to load library.");
    }
  }

  async function onUploadResource() {
    if (!resourceFile) {
      setStatus("Select a file to upload.");
      return;
    }
    if (!resourceCategory.trim()) {
      setStatus("Category is required.");
      return;
    }

    setIsUploading(true);
    setStatus("Uploading resource...");
    try {
      await uploadResource({
        file: resourceFile,
        category: resourceCategory.trim(),
        subcategory: resourceSubcategory.trim(),
        description: resourceDescription.trim(),
      });
      setStatus("Resource uploaded.");
      setResourceFile(null);
      setResourceCategory("");
      setResourceSubcategory("");
      setResourceDescription("");
      await refreshAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  function startEditResource(resource: ResourceRecord) {
    const draft = {
      name: resource.name,
      category: resource.category ?? "",
      subcategory: resource.subcategory ?? "",
      description: resource.description ?? "",
    };
    setEditingResourceId(resource.id);
    setResourceDraft(draft);
    setResourceDraftInitial(draft);
  }

  function cancelResourceEdit() {
    const hasChanges = JSON.stringify(resourceDraft) !== JSON.stringify(resourceDraftInitial);
    if (hasChanges && !window.confirm("Discard unsaved changes?")) {
      return;
    }
    setEditingResourceId(null);
  }

  async function onSaveResource(resourceId: string) {
    if (!resourceDraft.name.trim()) {
      setStatus("Resource name is required.");
      return;
    }
    if (!resourceDraft.category.trim()) {
      setStatus("Resource category is required.");
      return;
    }
    setIsSavingResource(true);
    setStatus("Saving resource metadata...");
    try {
      await updateResource(resourceId, {
        name: resourceDraft.name.trim(),
        category: resourceDraft.category.trim(),
        subcategory: resourceDraft.subcategory.trim(),
        description: resourceDraft.description.trim(),
      });
      setEditingResourceId(null);
      setStatus("Resource updated.");
      await refreshAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to update resource.");
    } finally {
      setIsSavingResource(false);
    }
  }

  async function onDeleteResource(resource: ResourceRecord) {
    const confirmed = window.confirm(`Delete resource "${resource.name}"?`);
    if (!confirmed) return;

    setIsDeletingResourceId(resource.id);
    setStatus("Deleting resource...");
    try {
      await deleteResource(resource.id);
      setStatus("Resource deleted.");
      await refreshAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setIsDeletingResourceId(null);
    }
  }

  async function onDeleteFlashcardSet(setRecord: FlashcardSetRecord) {
    const confirmed = window.confirm(`Delete flashcard set "${setRecord.title}"?`);
    if (!confirmed) return;

    setIsDeletingFlashcardSetId(setRecord.id);
    setStatus("Deleting flashcard set...");
    try {
      await deleteFlashcardSet(setRecord.id);
      setStatus("Flashcard set deleted.");
      await refreshAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setIsDeletingFlashcardSetId(null);
    }
  }

  async function onDeleteLectureEntry(lecture: LectureRecord) {
    const confirmed = window.confirm(`Delete lecture "${lecture.title}"?`);
    if (!confirmed) return;

    setIsDeletingLectureId(lecture.id);
    setStatus("Deleting lecture...");
    try {
      await deleteLecture(lecture.id);
      setStatus("Lecture deleted.");
      await refreshAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setIsDeletingLectureId(null);
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="h2 mono">Library</h2>
        <p className="b2 text-muted">Store and manage resources, flashcards, and lecture retells with metadata.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`btn ${activeTab === tab ? "btn-primary" : "btn-muted"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <section className="panel space-y-4 p-5">
        <div className="grid gap-3 lg:grid-cols-4">
          <input
            className="input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search file name, name, category..."
          />
          <select className="select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">All categories</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <select className="select" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortMode)}>
            <option value="uploaded">Sort by Uploaded Time</option>
            <option value="name">Sort by Name</option>
          </select>
          <button
            className="btn btn-muted"
            type="button"
            onClick={() => {
              setSearch("");
              setCategoryFilter("");
              setSortBy("uploaded");
            }}
          >
            Clear Filters
          </button>
        </div>

        {activeTab === "Resources" && (
          <div className="space-y-4">
            <p className="label">Upload PDF / DOCX / TXT (record name will match uploaded file name)</p>
            <div className="grid gap-3 lg:grid-cols-4">
              <input
                className="input"
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={(event) => setResourceFile(event.target.files?.[0] ?? null)}
              />
              <input
                className="input"
                value={resourceCategory}
                onChange={(event) => setResourceCategory(event.target.value)}
                placeholder="Category (Required)"
              />
              <input
                className="input"
                value={resourceSubcategory}
                onChange={(event) => setResourceSubcategory(event.target.value)}
                placeholder="Subcategory (Optional)"
              />
              <input
                className="input"
                value={resourceDescription}
                onChange={(event) => setResourceDescription(event.target.value)}
                placeholder="Short description (Optional)"
              />
            </div>
            <button className="btn btn-primary" type="button" onClick={onUploadResource} disabled={isUploading}>
              {isUploading ? "Uploading..." : "Upload Resource"}
            </button>

            <div className="space-y-2">
              {filteredResources.length === 0 && (
                <div className="rounded-xl border border-dashed border-[var(--border)] p-4 b2 text-muted">
                  No matching resources found.
                </div>
              )}
              {filteredResources.map((resource) => {
                const isEditing = editingResourceId === resource.id;
                const isPdf = resource.file_type.toLowerCase() === "pdf";
                return (
                  <div key={resource.id} className="panel-strong space-y-3 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="chip">{resource.file_type.toUpperCase()}</span>
                      <p className="h4">{resource.name}</p>
                      <p className="b3 text-muted">File: {resource.file_name}</p>
                    </div>
                    {isEditing ? (
                      <div className="grid gap-3 lg:grid-cols-4">
                        <input
                          className="input"
                          value={resourceDraft.name}
                          onChange={(event) =>
                            setResourceDraft((current) => ({ ...current, name: event.target.value }))
                          }
                          placeholder="Name"
                        />
                        <input
                          className="input"
                          value={resourceDraft.category}
                          onChange={(event) =>
                            setResourceDraft((current) => ({ ...current, category: event.target.value }))
                          }
                          placeholder="Category"
                        />
                        <input
                          className="input"
                          value={resourceDraft.subcategory}
                          onChange={(event) =>
                            setResourceDraft((current) => ({ ...current, subcategory: event.target.value }))
                          }
                          placeholder="Subcategory"
                        />
                        <input
                          className="input"
                          value={resourceDraft.description}
                          onChange={(event) =>
                            setResourceDraft((current) => ({ ...current, description: event.target.value }))
                          }
                          placeholder="Short description"
                        />
                      </div>
                    ) : (
                      <p className="b3 text-muted">
                        Category: {resource.category || "No category"}
                        {resource.subcategory ? ` | Subcategory: ${resource.subcategory}` : ""}
                        {resource.description ? ` | ${resource.description}` : ""}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {!isEditing && (
                        <>
                          <button className="btn btn-muted" onClick={() => startEditResource(resource)} type="button">
                            Rename / Edit Metadata
                          </button>
                          <button
                            className="btn btn-muted"
                            onClick={() => window.open(getResourcePreviewUrl(resource.id), "_blank", "noopener,noreferrer")}
                            type="button"
                            disabled={!isPdf}
                            title={isPdf ? "Open PDF preview in a new tab" : "Preview is only available for PDF files."}
                          >
                            Preview PDF
                          </button>
                          <a className="btn btn-muted" href={getResourceDownloadUrl(resource.id)}>
                            Download
                          </a>
                          <button
                            className="btn btn-muted"
                            onClick={() => onDeleteResource(resource)}
                            type="button"
                            disabled={isDeletingResourceId === resource.id}
                          >
                            {isDeletingResourceId === resource.id ? "Deleting..." : "Delete"}
                          </button>
                        </>
                      )}
                      {isEditing && (
                        <>
                          <button
                            className="btn btn-primary"
                            onClick={() => onSaveResource(resource.id)}
                            type="button"
                            disabled={isSavingResource}
                          >
                            {isSavingResource ? "Saving..." : "Save Metadata"}
                          </button>
                          <button
                            className="btn btn-muted"
                            onClick={cancelResourceEdit}
                            type="button"
                            disabled={isSavingResource}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "FlashCards Generated" && (
          <div className="space-y-2">
            {filteredFlashcardSets.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--border)] p-4 b2 text-muted">
                No matching flashcard sets found.
              </div>
            )}
            {filteredFlashcardSets.map((setRecord) => (
              <div key={setRecord.id} className="panel-strong p-3">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/library/flashcards/${setRecord.id}`}
                    className="block flex-1 space-y-1 transition hover:opacity-90"
                  >
                    <p className="h4">{setRecord.title}</p>
                    <p className="b3 text-muted">
                      {setRecord.cards.length} cards | Category: {setRecord.category || "No category"}
                      {setRecord.subcategory ? ` | Subcategory: ${setRecord.subcategory}` : ""}
                    </p>
                    {setRecord.description && <p className="b3 text-muted">{setRecord.description}</p>}
                  </Link>
                  <button
                    className="btn btn-muted p-2"
                    type="button"
                    aria-label={`Delete flashcard set ${setRecord.title}`}
                    title="Delete flashcard set"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onDeleteFlashcardSet(setRecord);
                    }}
                    disabled={isDeletingFlashcardSetId === setRecord.id}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "Lecture Generated" && (
          <div className="space-y-2">
            {filteredLectures.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--border)] p-4 b2 text-muted">
                No matching lectures found.
              </div>
            )}
            {filteredLectures.map((lecture) => (
              <div key={lecture.id} className="panel-strong p-3">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/library/lectures/${lecture.id}`} className="block flex-1 space-y-1 transition hover:opacity-90">
                    <p className="h4">{lecture.title}</p>
                    <p className="b3 text-muted">
                      Category: {lecture.category || "No category"}
                      {lecture.subcategory ? ` | Subcategory: ${lecture.subcategory}` : ""}
                    </p>
                    {lecture.description && <p className="b3 text-muted">{lecture.description}</p>}
                  </Link>
                  <button
                    className="btn btn-muted p-2"
                    type="button"
                    aria-label={`Delete lecture ${lecture.title}`}
                    title="Delete lecture"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onDeleteLectureEntry(lecture);
                    }}
                    disabled={isDeletingLectureId === lecture.id}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {status && <p className="b2 text-muted">{status}</p>}
    </section>
  );
}
