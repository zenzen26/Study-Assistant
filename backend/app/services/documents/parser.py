from __future__ import annotations

import re
from pathlib import Path

from docx import Document
from pypdf import PdfReader


SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt"}


def extract_text_from_path(file_path: Path) -> str:
    ext = file_path.suffix.lower()
    if ext == ".pdf":
        return _extract_pdf_text(file_path)
    if ext == ".docx":
        return _extract_docx_text(file_path)
    if ext == ".txt":
        return _extract_txt_text(file_path)
    raise ValueError(f"Unsupported file type: {ext}")


def _extract_pdf_text(file_path: Path) -> str:
    reader = PdfReader(str(file_path))
    text_parts: list[str] = []
    for index, page in enumerate(reader.pages, start=1):
        page_text = page.extract_text() or ""
        if page_text.strip():
            text_parts.append(f"--- Page {index} ---\n{page_text}")
    return _clean_text("\n".join(text_parts))


def _extract_docx_text(file_path: Path) -> str:
    doc = Document(str(file_path))
    text_parts = [paragraph.text for paragraph in doc.paragraphs if paragraph.text.strip()]
    return _clean_text("\n".join(text_parts))


def _extract_txt_text(file_path: Path) -> str:
    return _clean_text(file_path.read_text(encoding="utf-8", errors="ignore"))


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def chunk_text(text: str, max_chars: int = 6000) -> list[str]:
    if len(text) <= max_chars:
        return [text]

    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks: list[str] = []
    current_chunk = ""

    for sentence in sentences:
        if len(current_chunk) + len(sentence) + 1 <= max_chars:
            current_chunk = f"{current_chunk} {sentence}".strip()
        else:
            if current_chunk:
                chunks.append(current_chunk)
            current_chunk = sentence.strip()

    if current_chunk:
        chunks.append(current_chunk)

    return chunks

