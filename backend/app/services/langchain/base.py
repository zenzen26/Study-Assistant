from __future__ import annotations

from langchain_nvidia_ai_endpoints import ChatNVIDIA


class LangChainModule:
    def __init__(
        self,
        api_key: str,
        model: str = "nvidia/nemotron-3-nano-30b-a3b",
        temperature: float = 0.4,
    ) -> None:
        self.model = model
        self.api_key = api_key.strip()
        self.llm = ChatNVIDIA(
            model=self.model,
            api_key=self.api_key,
            temperature=temperature,
            top_p=0.9,
            max_tokens=4096,
        )

