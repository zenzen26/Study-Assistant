# Local Infrastructure

## Prerequisites
- Node.js 22+
- Python 3.12+

## Install
1. `python -m venv .venv`
2. `.\\.venv\\Scripts\\python.exe -m pip install -r backend/requirements.txt`
3. `npm install`
4. `npm install --prefix frontend`
5. Optional: copy `backend/.env.example` to `backend/.env` and set `NVIDIA_API_KEY`

## Run both services
- `npm run dev`

Frontend: http://localhost:3000
Backend: http://localhost:8000
Docs: http://localhost:8000/docs

## Implemented Flows
- Settings:
  - Save masked NVIDIA API key (`nvidia/nemotron-3-nano-30b-a3b`) to `backend/.env`
  - Dark/Light mode toggle
- Lecture page:
  - Source from upload (PDF/DOCX/TXT) or existing resource
  - Optional save upload to Resources
  - Lecture generation via LangChain lecture module
  - Review/edit and save to Lecture Library
- FlashCards page:
  - Manual mode (build cards yourself)
  - AI mode (upload/resource + card count + topic)
  - Review/edit and save to FlashCards Library
- Library:
  - Resources tab with upload + metadata
  - FlashCards Generated tab with detail page (flip + edit mode)
  - Lecture Generated tab with detail page (edit mode)

## LangChain Module Separation
- `backend/app/services/langchain/lecture_retell.py`
- `backend/app/services/langchain/flashcard_generator.py`
- Shared text parsing/chunking:
  - `backend/app/services/documents/parser.py`
