const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8000";

export type SettingsResponse = {
  has_api_key: boolean;
  masked_api_key: string | null;
  provider_model: string;
};

export type ResourceRecord = {
  id: string;
  name: string;
  file_name: string;
  stored_path: string;
  file_type: string;
  category: string | null;
  subcategory: string | null;
  description: string | null;
  created_at: string;
};

export type EditorJsData = {
  time?: number;
  version?: string;
  blocks: Array<{
    id?: string;
    type: string;
    data: Record<string, unknown>;
    tunes?: Record<string, unknown>;
  }>;
};

export type LectureRecord = {
  id: string;
  title: string;
  content: string;
  content_blocks: EditorJsData | null;
  category: string | null;
  subcategory: string | null;
  description: string | null;
  source_resource_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Flashcard = {
  question: string;
  answer: string;
};

export type FlashcardSetRecord = {
  id: string;
  title: string;
  category: string | null;
  subcategory: string | null;
  description: string | null;
  source_resource_id: string | null;
  cards: Flashcard[];
  created_at: string;
  updated_at: string;
};

type LectureSavePayload = {
  title: string;
  content: string;
  content_blocks?: EditorJsData | null;
  category?: string;
  subcategory?: string;
  description?: string;
  source_resource_id?: string;
};

type FlashcardSetSavePayload = {
  title: string;
  category?: string;
  subcategory?: string;
  description?: string;
  source_resource_id?: string;
  cards: Flashcard[];
};

async function parseJsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    let detail = fallback;
    try {
      const payload = (await res.json()) as { detail?: string };
      if (payload?.detail) {
        detail = payload.detail;
      }
    } catch {
      // no-op
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export async function getSettings(): Promise<SettingsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/settings`, { cache: "no-store" });
  return parseJsonOrThrow<SettingsResponse>(res, "Failed to load settings");
}

export async function saveApiKey(apiKey: string): Promise<{ masked_api_key: string }> {
  const res = await fetch(`${API_BASE_URL}/api/settings/api-key`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });
  return parseJsonOrThrow<{ masked_api_key: string }>(res, "Failed to save API key");
}

export async function listResources(): Promise<ResourceRecord[]> {
  const res = await fetch(`${API_BASE_URL}/api/resources`, { cache: "no-store" });
  return parseJsonOrThrow<ResourceRecord[]>(res, "Failed to fetch resources");
}

export async function uploadResource(input: {
  file: File;
  category?: string;
  subcategory?: string;
  description?: string;
}): Promise<ResourceRecord> {
  const form = new FormData();
  form.append("source_file", input.file);
  if (input.category?.trim()) form.append("category", input.category.trim());
  if (input.subcategory?.trim()) form.append("subcategory", input.subcategory.trim());
  if (input.description?.trim()) form.append("description", input.description.trim());

  const res = await fetch(`${API_BASE_URL}/api/resources/upload`, {
    method: "POST",
    body: form,
  });

  return parseJsonOrThrow<ResourceRecord>(res, "Failed to upload resource");
}

export async function generateLecture(input: {
  resourceId?: string;
  file?: File;
  saveUploadToResources?: boolean;
  category?: string;
  subcategory?: string;
  description?: string;
  systemPrompt?: string;
}): Promise<{ generated_content: string; source_resource: ResourceRecord | null }> {
  const form = new FormData();
  if (input.resourceId) form.append("resource_id", input.resourceId);
  if (input.file) form.append("source_file", input.file);
  if (input.saveUploadToResources) form.append("save_upload_to_resources", "true");
  if (input.category?.trim()) form.append("category", input.category.trim());
  if (input.subcategory?.trim()) form.append("subcategory", input.subcategory.trim());
  if (input.description?.trim()) form.append("description", input.description.trim());
  if (input.systemPrompt?.trim()) form.append("system_prompt", input.systemPrompt.trim());

  const res = await fetch(`${API_BASE_URL}/api/generate/lecture`, {
    method: "POST",
    body: form,
  });
  return parseJsonOrThrow<{ generated_content: string; source_resource: ResourceRecord | null }>(
    res,
    "Lecture generation failed",
  );
}

export async function generateFlashcards(input: {
  resourceId?: string;
  file?: File;
  saveUploadToResources?: boolean;
  category?: string;
  subcategory?: string;
  description?: string;
  numCards: number;
  topic?: string;
}): Promise<{ cards: Flashcard[]; source_resource: ResourceRecord | null }> {
  const form = new FormData();
  if (input.resourceId) form.append("resource_id", input.resourceId);
  if (input.file) form.append("source_file", input.file);
  if (input.saveUploadToResources) form.append("save_upload_to_resources", "true");
  if (input.category?.trim()) form.append("category", input.category.trim());
  if (input.subcategory?.trim()) form.append("subcategory", input.subcategory.trim());
  if (input.description?.trim()) form.append("description", input.description.trim());
  form.append("num_cards", String(input.numCards));
  if (input.topic?.trim()) form.append("topic", input.topic.trim());

  const res = await fetch(`${API_BASE_URL}/api/generate/flashcards`, {
    method: "POST",
    body: form,
  });
  return parseJsonOrThrow<{ cards: Flashcard[]; source_resource: ResourceRecord | null }>(
    res,
    "Flashcard generation failed",
  );
}

export async function listLectures(): Promise<LectureRecord[]> {
  const res = await fetch(`${API_BASE_URL}/api/lectures`, { cache: "no-store" });
  return parseJsonOrThrow<LectureRecord[]>(res, "Failed to fetch lectures");
}

export async function getLecture(id: string): Promise<LectureRecord> {
  const res = await fetch(`${API_BASE_URL}/api/lectures/${id}`, { cache: "no-store" });
  return parseJsonOrThrow<LectureRecord>(res, "Failed to fetch lecture");
}

export async function createLecture(payload: LectureSavePayload): Promise<LectureRecord> {
  const res = await fetch(`${API_BASE_URL}/api/lectures`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<LectureRecord>(res, "Failed to save lecture");
}

export async function updateLecture(id: string, payload: LectureSavePayload): Promise<LectureRecord> {
  const res = await fetch(`${API_BASE_URL}/api/lectures/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<LectureRecord>(res, "Failed to update lecture");
}

export async function deleteLecture(id: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`${API_BASE_URL}/api/lectures/${id}`, {
    method: "DELETE",
  });
  return parseJsonOrThrow<{ deleted: boolean }>(res, "Failed to delete lecture");
}

export async function listFlashcardSets(): Promise<FlashcardSetRecord[]> {
  const res = await fetch(`${API_BASE_URL}/api/flashcard-sets`, { cache: "no-store" });
  return parseJsonOrThrow<FlashcardSetRecord[]>(res, "Failed to fetch flashcard sets");
}

export async function getFlashcardSet(id: string): Promise<FlashcardSetRecord> {
  const res = await fetch(`${API_BASE_URL}/api/flashcard-sets/${id}`, { cache: "no-store" });
  return parseJsonOrThrow<FlashcardSetRecord>(res, "Failed to fetch flashcard set");
}

export async function createFlashcardSet(payload: FlashcardSetSavePayload): Promise<FlashcardSetRecord> {
  const res = await fetch(`${API_BASE_URL}/api/flashcard-sets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<FlashcardSetRecord>(res, "Failed to save flashcard set");
}

export async function updateResource(
  id: string,
  payload: {
    name: string;
    category?: string;
    subcategory?: string;
    description?: string;
  },
): Promise<ResourceRecord> {
  const res = await fetch(`${API_BASE_URL}/api/resources/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<ResourceRecord>(res, "Failed to update resource");
}

export async function deleteResource(id: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`${API_BASE_URL}/api/resources/${id}`, {
    method: "DELETE",
  });
  return parseJsonOrThrow<{ deleted: boolean }>(res, "Failed to delete resource");
}

export function getResourceDownloadUrl(id: string): string {
  return `${API_BASE_URL}/api/resources/${id}/download`;
}

export function getResourcePreviewUrl(id: string): string {
  return `${API_BASE_URL}/api/resources/${id}/preview`;
}

export async function updateFlashcardSet(
  id: string,
  payload: FlashcardSetSavePayload,
): Promise<FlashcardSetRecord> {
  const res = await fetch(`${API_BASE_URL}/api/flashcard-sets/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<FlashcardSetRecord>(res, "Failed to update flashcard set");
}

export async function deleteFlashcardSet(id: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`${API_BASE_URL}/api/flashcard-sets/${id}`, {
    method: "DELETE",
  });
  return parseJsonOrThrow<{ deleted: boolean }>(res, "Failed to delete flashcard set");
}
