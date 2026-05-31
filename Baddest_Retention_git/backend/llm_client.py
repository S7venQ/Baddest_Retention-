"""
Baddest_Retention — LLM API 封装（多协议版）
VL（多模态提取）走 OpenAI 协议（百炼等）
文本（整理/分析）走 Anthropic 协议（DeepSeek 等）
"""

import json
import re
from openai import OpenAI
from anthropic import Anthropic


class LLMClient:
    def __init__(self,
                 api_key: str = "", base_url: str = "",
                 vl_model: str = "", text_model: str = "",
                 vl_api_key: str = "", vl_base_url: str = "",
                 text_api_key: str = "", text_base_url: str = "",
                 ):
        # --- VL 配置（OpenAI 协议）---
        self.vl_api_key = vl_api_key or api_key
        self.vl_base_url = vl_base_url or base_url
        self.vl_model = vl_model

        # --- 文本配置（Anthropic 协议）---
        self.text_api_key = text_api_key or api_key
        self.text_base_url = text_base_url or base_url
        self.text_model = text_model

        if not self.text_api_key:
            raise ValueError("文本 API Key 不能为空")
        if not self.text_base_url:
            raise ValueError("文本 Base URL 不能为空")
        if not self.text_model:
            raise ValueError("文本模型名不能为空")

        # VL 客户端（OpenAI 协议）
        self._vl_client = None
        if self.vl_api_key and self.vl_base_url:
            self._vl_client = OpenAI(api_key=self.vl_api_key, base_url=self.vl_base_url)

        # 文本客户端（Anthropic 协议）
        self._text_client = Anthropic(api_key=self.text_api_key, base_url=self.text_base_url)

    # ================================================================
    # 函数 1：图片提取文字（OpenAI 协议）
    # ================================================================
    def extract_from_image(self, image_base64: str, mime_type: str = "image/jpeg") -> str:
        if not self._vl_client or not self.vl_model:
            raise ValueError("未配置多模态模型")

        from prompts import EXTRACT_PROMPT

        def _call():
            response = self._vl_client.chat.completions.create(
                model=self.vl_model,
                max_tokens=16384,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": EXTRACT_PROMPT},
                        {"type": "image_url",
                         "image_url": {"url": f"data:{mime_type};base64,{image_base64}"}},
                    ],
                }],
            )
            return response.choices[0].message.content.strip()

        return self._call_with_retry(_call)

    # ================================================================
    # 函数 2：按风格整理（Anthropic 协议）
    # ================================================================
    def organize_with_style(self, raw_text: str, user_profile: dict) -> dict:
        from prompts import ORGANIZE_PROMPT

        hints_text = self._format_dimension_hints(user_profile.get("dimension_hints", []))
        habits_text = ", ".join(user_profile.get("unique_habits", ["无特殊习惯"]))

        prompt = ORGANIZE_PROMPT.format(
            style_preference=user_profile.get("style_preference", "structured"),
            dimension_hints=hints_text,
            language_style=user_profile.get("language_style", "balanced"),
            unique_habits=habits_text,
            raw_text=raw_text,
        )

        def _call():
            response = self._text_client.messages.create(
                model=self.text_model,
                max_tokens=16384,
                messages=[
                    {"role": "user", "content": prompt},
                    {"role": "assistant", "content": "{"},
                ],
            )
            raw = self._get_text(response)
            return self._parse_json(raw)

        return self._call_with_retry(_call)

    # ================================================================
    # 函数 3：分析用户风格画像（Anthropic 协议）
    # ================================================================
    def analyze_user_style(self, notes: list[dict]) -> dict:
        from prompts import PROFILE_ANALYSIS_PROMPT

        samples = []
        for i, note in enumerate(notes, 1):
            samples.append(
                f"--- 笔记 {i} ---\n"
                f"原文: {note.get('raw_text', '')}\n"
            )
        notes_text = "\n".join(samples)

        prompt = PROFILE_ANALYSIS_PROMPT.format(notes_sample=notes_text)

        def _call():
            response = self._text_client.messages.create(
                model=self.text_model,
                max_tokens=16384,
                messages=[
                    {"role": "user", "content": prompt},
                    {"role": "assistant", "content": "{"},
                ],
            )
            raw = self._get_text(response)
            if not raw.startswith("{"):
                raw = "{" + raw
            return self._parse_json(raw)

        return self._call_with_retry(_call)

    # ================================================================
    # 重试包装器
    # ================================================================
    @staticmethod
    def _call_with_retry(func, *args, max_retries=2, **kwargs):
        """
        带指数退避的重试包装器。
        仅对瞬态错误重试：HTTP 429/500/502/503, ConnectionError, Timeout。
        非瞬态错误（401/403/400）直接抛出。
        """
        import time
        last_exc = None
        for attempt in range(max_retries + 1):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                last_exc = e
                msg = str(e).lower()
                is_transient = any(kw in msg for kw in (
                    "429", "500", "502", "503",
                    "timeout", "timed out", "connection",
                    "connectionerror", "overloaded",
                ))
                if not is_transient or attempt >= max_retries:
                    raise
                delay = 2 ** attempt
                print(f"[重试] {type(e).__name__}: {str(e)[:100]} (第{attempt+1}次，{delay}s后重试)", flush=True)
                time.sleep(delay)
        raise last_exc

    # ================================================================
    # 辅助方法
    # ================================================================
    @staticmethod
    def _get_text(response) -> str:
        parts = []
        for block in response.content:
            if hasattr(block, 'text'):
                parts.append(block.text)
        return "".join(parts).strip()

    @staticmethod
    def _parse_json(raw: str) -> dict:
        """从 LLM 返回文本中提取 JSON，容错处理。"""
        # 尝试直接解析
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            pass

        # 尝试提取 ```json ... ``` 代码块
        m = re.search(r"```(?:json)?\s*\n?([\s\S]*?)```", raw)
        if m:
            try:
                return json.loads(m.group(1).strip())
            except json.JSONDecodeError:
                pass

        # 尝试提取第一个 { ... } 块，先不做注释清理（避免误删 URL 中的 //）
        m2 = re.search(r"\{[\s\S]*", raw)
        if m2:
            for attempt in range(2):
                candidate = m2.group(0)
                if attempt == 1:
                    # 第二次尝试：清理注释（某些 LLM 会在 JSON 中加注释）
                    candidate = re.sub(r"//[^\n]*", "", candidate)
                    candidate = re.sub(r"/\*[\s\S]*?\*/", "", candidate)
                # 去掉尾部逗号
                candidate = re.sub(r",\s*([}\]])", r"\1", candidate)
                # 如果 JSON 被截断，尝试补闭合括号
                open_braces = candidate.count("{") - candidate.count("}")
                open_brackets = candidate.count("[") - candidate.count("]")
                if open_braces > 0 or open_brackets > 0:
                    candidate += "]" * max(0, open_brackets) + "}" * max(0, open_braces)
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    continue

        raise ValueError(f"无法从 LLM 输出中解析 JSON: {raw[:300]}")

    @staticmethod
    def _format_dimension_hints(hints: list[dict]) -> str:
        if not hints:
            return "（暂无特定维度偏好，请按通用知识结构提取）"
        lines = []
        for h in hints:
            name = h.get("name", "")
            hint = h.get("ai_hint", "")
            weight = h.get("weight", 0.0)
            lines.append(f"  - {name}（权重 {weight:.0%}）：{hint}")
        return "\n".join(lines)