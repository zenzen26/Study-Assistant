from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage

from backend.app.services.documents.parser import chunk_text
from backend.app.services.langchain.base import LangChainModule


class LectureRetellModule(LangChainModule):
    BASE_SYSTEM_PROMPT = (
        "You are a precise tutor. Explain lecture content for a high-school student "
        "with clear language, accurate facts, and practical analogies. "
        "Do not invent facts not present in the provided source."
    )

    def generate(self, source_text: str, user_style_prompt: str | None = None) -> str:
        chunks = chunk_text(source_text, max_chars=7000)
        chunk_outputs: list[str] = []

        for index, chunk in enumerate(chunks, start=1):
            style_instruction = user_style_prompt.strip() if user_style_prompt else "Use a balanced teaching style."
            messages = [
                SystemMessage(content=self.BASE_SYSTEM_PROMPT),
                HumanMessage(
                    content=(
                        f"Style instruction: {style_instruction}\n"
                        f"Chunk {index}/{len(chunks)}:\n{chunk}\n\n"
                        "Output in markdown with these headings:\n"
                        "1) Summary\n2) Key Concepts\n3) Analogies\n4) Quick Recap\n5) Self-check Questions"
                    )
                ),
            ]
            response = self.llm.invoke(messages)
            chunk_outputs.append(response.content if isinstance(response.content, str) else str(response.content))

        if len(chunk_outputs) == 1:
            return chunk_outputs[0]
        return self._combine_chunks(chunk_outputs, user_style_prompt or "")

    def _combine_chunks(self, chunk_outputs: list[str], user_style_prompt: str) -> str:
        stitched = "\n\n".join(
            [f"Section {index}:\n{output}" for index, output in enumerate(chunk_outputs, start=1)]
        )
        messages = [
            SystemMessage(content=self.BASE_SYSTEM_PROMPT),
            HumanMessage(
                content=(
                    f"Style instruction: {user_style_prompt or 'Use a balanced teaching style.'}\n"
                    "Merge the section drafts into one coherent lesson with smooth transitions.\n"
                    "Preserve factual accuracy and remove repetition.\n\n"
                    f"{stitched}"
                )
            ),
        ]
        response = self.llm.invoke(messages)
        return response.content if isinstance(response.content, str) else str(response.content)

