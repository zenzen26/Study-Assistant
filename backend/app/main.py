from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from backend.app.core.store import (
    NVIDIA_API_KEY_ENV,
    UPLOADS_DIR,
    delete_env_value,
    mask_api_key,
    new_id,
    now_iso,
    read_env_value,
    read_store,
    write_env_value,
    write_store,
)
from backend.app.services.documents.parser import SUPPORTED_EXTENSIONS, extract_text_from_path
from backend.app.services.langchain.flashcard_generator import FlashcardGeneratorModule
from backend.app.services.langchain.lecture_retell import LectureRetellModule

app = FastAPI(title="Lecture Buddy API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ApiKeyPayload(BaseModel):
    api_key: str = Field(min_length=1)


class LectureCreate(BaseModel):
    title: str = Field(min_length=1)
    content: str = Field(min_length=1)
    content_blocks: dict[str, Any] | None = None
    category: str | None = None
    subcategory: str | None = None
    description: str | None = None
    source_resource_id: str | None = None


class FlashCard(BaseModel):
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)


class FlashCardSetCreate(BaseModel):
    title: str = Field(min_length=1)
    category: str | None = None
    subcategory: str | None = None
    description: str | None = None
    source_resource_id: str | None = None
    cards: list[FlashCard] = Field(default_factory=list)


class ResourceUpdate(BaseModel):
    name: str = Field(min_length=1)
    category: str | None = None
    subcategory: str | None = None
    description: str | None = None


def _get_resource_by_id(store: dict[str, Any], resource_id: str) -> tuple[int, dict[str, Any]]:
    for index, resource in enumerate(store["resources"]):
        if resource["id"] == resource_id:
            return index, resource
    raise HTTPException(status_code=404, detail="Resource not found")


def _get_lecture_by_id(store: dict[str, Any], lecture_id: str) -> tuple[int, dict[str, Any]]:
    for index, lecture in enumerate(store["lectures"]):
        if lecture["id"] == lecture_id:
            return index, lecture
    raise HTTPException(status_code=404, detail="Lecture not found")


def _get_flashcard_set_by_id(store: dict[str, Any], set_id: str) -> tuple[int, dict[str, Any]]:
    for index, set_record in enumerate(store["flashcard_sets"]):
        if set_record["id"] == set_id:
            return index, set_record
    raise HTTPException(status_code=404, detail="Flashcard set not found")


def _validate_upload_name(file_name: str) -> str:
    ext = Path(file_name).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        allowed = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Allowed: {allowed}")
    return ext


async def _write_upload_file(upload_file: UploadFile, prefix: str) -> Path:
    if not upload_file.filename:
        raise HTTPException(status_code=400, detail="Uploaded file name is missing")

    ext = _validate_upload_name(upload_file.filename)
    file_path = UPLOADS_DIR / f"{prefix}_{new_id()}{ext}"
    content = await upload_file.read()
    file_path.write_bytes(content)
    return file_path


def _extract_text_or_400(file_path: Path) -> str:
    try:
        text = extract_text_from_path(file_path)
    except Exception as exc:  # pragma: no cover - defensive parser boundary
        raise HTTPException(status_code=400, detail=f"Failed to extract text: {exc}") from exc

    if len(text) < 80:
        raise HTTPException(status_code=400, detail="Document has too little extractable text")
    return text


def _append_resource_record(
    store: dict[str, Any],
    *,
    file_path: Path,
    original_file_name: str,
    category: str | None,
    subcategory: str | None,
    description: str | None,
) -> dict[str, Any]:
    record = {
        "id": new_id(),
        "name": original_file_name.strip(),
        "file_name": original_file_name,
        "stored_path": str(file_path),
        "file_type": file_path.suffix.lower().lstrip("."),
        "category": (category or "").strip() or None,
        "subcategory": (subcategory or "").strip() or None,
        "description": (description or "").strip() or None,
        "created_at": now_iso(),
    }
    store["resources"].append(record)
    return record


def _read_api_key(store: dict[str, Any]) -> str:
    env_key = read_env_value(NVIDIA_API_KEY_ENV)
    if env_key:
        return env_key
    return store.get("settings", {}).get("nvidia_api_key", "").strip()


def _require_api_key(store: dict[str, Any]) -> str:
    api_key = _read_api_key(store)
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="NVIDIA API key is missing. Add it in Settings before generating.",
        )
    return api_key


async def _resolve_source_text(
    *,
    store: dict[str, Any],
    resource_id: str | None,
    source_file: UploadFile | None,
    save_upload_to_resources: bool,
    category: str | None,
    subcategory: str | None,
    description: str | None,
) -> tuple[str, dict[str, Any] | None]:
    if bool(resource_id) == bool(source_file):
        raise HTTPException(status_code=400, detail="Provide exactly one source: resource_id or source_file")

    if resource_id:
        _, resource = _get_resource_by_id(store, resource_id)
        file_path = Path(resource["stored_path"])
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Resource file is missing on disk")
        return _extract_text_or_400(file_path), resource

    assert source_file is not None
    if save_upload_to_resources:
        saved_path = await _write_upload_file(source_file, "resource")
        text = _extract_text_or_400(saved_path)
        resource_record = _append_resource_record(
            store,
            file_path=saved_path,
            original_file_name=source_file.filename or saved_path.name,
            category=category,
            subcategory=subcategory,
            description=description,
        )
        write_store(store)
        return text, resource_record

    temp_path = await _write_upload_file(source_file, "temp")
    try:
        return _extract_text_or_400(temp_path), None
    finally:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/settings")
def get_settings() -> dict[str, Any]:
    store = read_store()
    key = _read_api_key(store)
    return {
        "has_api_key": bool(key),
        "masked_api_key": mask_api_key(key) if key else None,
        "provider_model": "nvidia/nemotron-3-nano-30b-a3b",
    }


@app.put("/api/settings/api-key")
def save_api_key(payload: ApiKeyPayload) -> dict[str, Any]:
    api_key = payload.api_key.strip()
    write_env_value(NVIDIA_API_KEY_ENV, api_key)

    store = read_store()
    store.setdefault("settings", {})
    store["settings"]["nvidia_api_key"] = ""
    write_store(store)
    return {"saved": True, "masked_api_key": mask_api_key(api_key)}


@app.delete("/api/settings/api-key")
def delete_api_key() -> dict[str, Any]:
    delete_env_value(NVIDIA_API_KEY_ENV)
    store = read_store()
    store.setdefault("settings", {})
    store["settings"]["nvidia_api_key"] = ""
    write_store(store)
    return {"deleted": True}


@app.get("/api/resources")
def list_resources() -> list[dict[str, Any]]:
    store = read_store()
    resources = list(reversed(store["resources"]))
    for resource in resources:
        resource.setdefault("subcategory", None)
    return resources


@app.get("/api/resources/{resource_id}")
def get_resource(resource_id: str) -> dict[str, Any]:
    store = read_store()
    _, resource = _get_resource_by_id(store, resource_id)
    resource.setdefault("subcategory", None)
    return resource


@app.put("/api/resources/{resource_id}")
def update_resource(resource_id: str, payload: ResourceUpdate) -> dict[str, Any]:
    store = read_store()
    index, resource = _get_resource_by_id(store, resource_id)
    updated = {
        **resource,
        "name": payload.name.strip(),
        "category": (payload.category or "").strip() or None,
        "subcategory": (payload.subcategory or "").strip() or None,
        "description": (payload.description or "").strip() or None,
    }
    store["resources"][index] = updated
    write_store(store)
    return updated


@app.delete("/api/resources/{resource_id}")
def delete_resource(resource_id: str) -> dict[str, Any]:
    store = read_store()
    index, resource = _get_resource_by_id(store, resource_id)
    file_path = Path(resource["stored_path"])
    if file_path.exists():
        file_path.unlink(missing_ok=True)
    store["resources"].pop(index)
    write_store(store)
    return {"deleted": True}


@app.get("/api/resources/{resource_id}/download")
def download_resource(resource_id: str) -> FileResponse:
    store = read_store()
    _, resource = _get_resource_by_id(store, resource_id)
    file_path = Path(resource["stored_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Resource file is missing on disk")
    return FileResponse(path=file_path, filename=resource["file_name"], media_type="application/octet-stream")


@app.get("/api/resources/{resource_id}/preview")
def preview_resource(resource_id: str) -> FileResponse:
    store = read_store()
    _, resource = _get_resource_by_id(store, resource_id)
    file_path = Path(resource["stored_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Resource file is missing on disk")

    file_type = (resource.get("file_type") or "").lower()
    if file_type != "pdf":
        raise HTTPException(status_code=400, detail="Preview is only available for PDF files.")
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{resource["file_name"]}"'},
    )


@app.post("/api/resources/upload")
async def upload_resource(
    source_file: UploadFile = File(...),
    category: str | None = Form(None),
    subcategory: str | None = Form(None),
    description: str | None = Form(None),
) -> dict[str, Any]:
    store = read_store()
    file_path = await _write_upload_file(source_file, "resource")
    # Parse once at upload-time so invalid files are rejected early.
    _extract_text_or_400(file_path)
    resource = _append_resource_record(
        store,
        file_path=file_path,
        original_file_name=source_file.filename or file_path.name,
        category=category,
        subcategory=subcategory,
        description=description,
    )
    write_store(store)
    return resource


@app.post("/api/generate/lecture")
async def generate_lecture(
    resource_id: str | None = Form(None),
    source_file: UploadFile | None = File(None),
    save_upload_to_resources: bool = Form(False),
    category: str | None = Form(None),
    subcategory: str | None = Form(None),
    description: str | None = Form(None),
    system_prompt: str | None = Form(None),
) -> dict[str, Any]:
    store = read_store()
    api_key = _require_api_key(store)
    source_text, source_resource = await _resolve_source_text(
        store=store,
        resource_id=resource_id,
        source_file=source_file,
        save_upload_to_resources=save_upload_to_resources,
        category=category,
        subcategory=subcategory,
        description=description,
    )
    module = LectureRetellModule(api_key=api_key, temperature=0.45)
    generated = module.generate(source_text=source_text, user_style_prompt=system_prompt)
    return {"generated_content": generated, "source_resource": source_resource}


@app.post("/api/generate/flashcards")
async def generate_flashcards(
    resource_id: str | None = Form(None),
    source_file: UploadFile | None = File(None),
    save_upload_to_resources: bool = Form(False),
    category: str | None = Form(None),
    subcategory: str | None = Form(None),
    description: str | None = Form(None),
    num_cards: int = Form(10),
    topic: str | None = Form(None),
) -> dict[str, Any]:
    if num_cards < 1 or num_cards > 50:
        raise HTTPException(status_code=400, detail="num_cards must be between 1 and 50")

    store = read_store()
    api_key = _require_api_key(store)
    source_text, source_resource = await _resolve_source_text(
        store=store,
        resource_id=resource_id,
        source_file=source_file,
        save_upload_to_resources=save_upload_to_resources,
        category=category,
        subcategory=subcategory,
        description=description,
    )

    module = FlashcardGeneratorModule(api_key=api_key, temperature=0.35)
    cards = module.generate(source_text=source_text, num_cards=num_cards, topic=topic)
    return {"cards": cards, "source_resource": source_resource}


@app.get("/api/lectures")
def list_lectures() -> list[dict[str, Any]]:
    store = read_store()
    lectures = list(reversed(store["lectures"]))
    for lecture in lectures:
        lecture.setdefault("subcategory", None)
        lecture.setdefault("content_blocks", None)
    return lectures


@app.get("/api/lectures/{lecture_id}")
def get_lecture(lecture_id: str) -> dict[str, Any]:
    store = read_store()
    _, lecture = _get_lecture_by_id(store, lecture_id)
    lecture.setdefault("subcategory", None)
    lecture.setdefault("content_blocks", None)
    return lecture


@app.post("/api/lectures")
def create_lecture(payload: LectureCreate) -> dict[str, Any]:
    store = read_store()
    record = {"id": new_id(), "created_at": now_iso(), "updated_at": now_iso(), **payload.model_dump()}
    store["lectures"].append(record)
    write_store(store)
    return record


@app.put("/api/lectures/{lecture_id}")
def update_lecture(lecture_id: str, payload: LectureCreate) -> dict[str, Any]:
    store = read_store()
    index, lecture = _get_lecture_by_id(store, lecture_id)
    updated = {
        **lecture,
        **payload.model_dump(),
        "updated_at": now_iso(),
    }
    store["lectures"][index] = updated
    write_store(store)
    return updated


@app.delete("/api/lectures/{lecture_id}")
def delete_lecture(lecture_id: str) -> dict[str, Any]:
    store = read_store()
    index, _ = _get_lecture_by_id(store, lecture_id)
    store["lectures"].pop(index)
    write_store(store)
    return {"deleted": True}


@app.get("/api/flashcard-sets")
def list_flashcard_sets() -> list[dict[str, Any]]:
    store = read_store()
    records = list(reversed(store["flashcard_sets"]))
    for record in records:
        record.setdefault("subcategory", None)
    return records


@app.get("/api/flashcard-sets/{set_id}")
def get_flashcard_set(set_id: str) -> dict[str, Any]:
    store = read_store()
    _, set_record = _get_flashcard_set_by_id(store, set_id)
    set_record.setdefault("subcategory", None)
    return set_record


@app.post("/api/flashcard-sets")
def create_flashcard_set(payload: FlashCardSetCreate) -> dict[str, Any]:
    store = read_store()
    record = {"id": new_id(), "created_at": now_iso(), "updated_at": now_iso(), **payload.model_dump()}
    store["flashcard_sets"].append(record)
    write_store(store)
    return record


@app.put("/api/flashcard-sets/{set_id}")
def update_flashcard_set(set_id: str, payload: FlashCardSetCreate) -> dict[str, Any]:
    store = read_store()
    index, set_record = _get_flashcard_set_by_id(store, set_id)
    updated = {
        **set_record,
        **payload.model_dump(),
        "updated_at": now_iso(),
    }
    store["flashcard_sets"][index] = updated
    write_store(store)
    return updated


@app.delete("/api/flashcard-sets/{set_id}")
def delete_flashcard_set(set_id: str) -> dict[str, Any]:
    store = read_store()
    index, _ = _get_flashcard_set_by_id(store, set_id)
    store["flashcard_sets"].pop(index)
    write_store(store)
    return {"deleted": True}
