from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from backend.app.services.documents.parser import chunk_text
from backend.app.services.langchain.base import LangChainModule


class FlashcardGeneratorModule(LangChainModule):
    SYSTEM_PROMPT = (
        "You create high-quality study flashcards from source material. "
        "Prioritize conceptual clarity and avoid duplicate cards."
    )

    def generate(self, source_text: str, num_cards: int, topic: str | None = None) -> list[dict[str, str]]:
        chunks = chunk_text(source_text, max_chars=8000)
        cards_per_chunk = max(1, num_cards // max(1, len(chunks)))
        collected: list[dict[str, str]] = []

        for index, chunk in enumerate(chunks, start=1):
            if len(collected) >= num_cards:
                break

            chunk_target = min(cards_per_chunk, num_cards - len(collected))
            topic_line = f"Focus topic: {topic.strip()}." if topic and topic.strip() else "Cover the most important points."
            messages = [
                SystemMessage(content=self.SYSTEM_PROMPT),
                HumanMessage(
                    content=(
                        f"{topic_line}\n"
                        f"Generate exactly {chunk_target} cards from chunk {index}/{len(chunks)}.\n"
                        "Return valid JSON only in this shape:\n"
                        '{"cards":[{"question":"...","answer":"..."}]}\n\n'
                        f"Source:\n{chunk}"
                    )
                ),
            ]
            response = self.llm.invoke(messages)
            content = response.content if isinstance(response.content, str) else str(response.content)
            parsed_cards = self._parse_cards(content, chunk_target)
            collected.extend(parsed_cards)

        while len(collected) < num_cards:
            fallback_index = len(collected) + 1
            collected.append(
                {
                    "question": f"Key concept {fallback_index}",
                    "answer": "Review the material to reinforce this concept.",
                }
            )

        return collected[:num_cards]

    def _parse_cards(self, text: str, expected_count: int) -> list[dict[str, str]]:
        parsed = self._parse_from_json(text)
        if not parsed:
            parsed = self._parse_fallback_lines(text)

        cleaned: list[dict[str, str]] = []
        for card in parsed:
            question = str(card.get("question", "")).strip()
            answer = str(card.get("answer", "")).strip()
            if question and answer:
                cleaned.append({"question": question, "answer": answer})

        return cleaned[:expected_count]

    def _parse_from_json(self, text: str) -> list[dict[str, Any]]:
        try:
            payload = json.loads(text)
            if isinstance(payload, dict) and isinstance(payload.get("cards"), list):
                return payload["cards"]
            if isinstance(payload, list):
                return payload
        except json.JSONDecodeError:
            pass

        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                payload = json.loads(match.group(0))
                if isinstance(payload, dict) and isinstance(payload.get("cards"), list):
                    return payload["cards"]
            except json.JSONDecodeError:
                return []

        return []

    def _parse_fallback_lines(self, text: str) -> list[dict[str, str]]:
        cards: list[dict[str, str]] = []
        current_q: str | None = None
        current_a: str | None = None

        for line in text.splitlines():
            normalized = line.strip()
            if not normalized:
                continue

            if normalized.lower().startswith(("q:", "question:")):
                if current_q and current_a:
                    cards.append({"question": current_q, "answer": current_a})
                current_q = normalized.split(":", 1)[1].strip() if ":" in normalized else normalized
                current_a = None
            elif normalized.lower().startswith(("a:", "answer:")):
                current_a = normalized.split(":", 1)[1].strip() if ":" in normalized else normalized

        if current_q and current_a:
            cards.append({"question": current_q, "answer": current_a})

        return cards

