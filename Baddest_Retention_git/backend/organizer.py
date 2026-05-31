"""
Baddest_Retention — 整理逻辑编排
编排图片提取 → 知识结构提取 → 风格化渲染 的完整流水线。
支持冷启动（无用户画像时使用默认风格）。
"""

from llm_client import LLMClient


# 默认用户画像（冷启动用）
DEFAULT_PROFILE = {
    "style_preference": "structured",
    "dimension_hints": [
        {"name": "核心概念",      "weight": 1.0, "ai_hint": "用一句话定义这叫什么/做了什么"},
        {"name": "机制原理",      "weight": 0.9, "ai_hint": "提取工作原理、关键步骤、底层逻辑"},
        {"name": "注意事项/局限",  "weight": 0.8, "ai_hint": "边界条件、常见陷阱、什么时候不适用"},
        {"name": "可迁移应用",    "weight": 0.7, "ai_hint": "能否用到用户关心的领域？具体怎么用？"},
        {"name": "易混淆区分",    "weight": 0.6, "ai_hint": "主动区分原文中容易混淆的概念"},
    ],
    "language_style": "balanced",
    "unique_habits": [],
}


class Organizer:
    """
    知识整理编排器。
    负责把 LLMClient 的三个函数编排成完整的整理流水线。
    """

    def __init__(self, llm_client: LLMClient):
        self.llm = llm_client

    # ================================================================
    # 流水线 1：图片 → 文字 → 整理
    # ================================================================
    def process_image(self, image_base64: str, user_profile: dict | None = None) -> dict:
        """
        图片 → 提取文字 → 结构化整理 → 风格渲染。
        返回完整的 OrganizeResult。
        """
        # Step 1: 图片提取文字
        raw_text = self.llm.extract_from_image(image_base64)

        # Step 2: 结构化整理 + 风格渲染
        profile = user_profile or DEFAULT_PROFILE
        result = self.llm.organize_with_style(raw_text, profile)

        # 返回完整结果
        return {
            "raw_text": raw_text,
            "organized_text": result.get("organized_text", ""),
            "structured_fields": result.get("structured_fields", {}),
            "tags": result.get("tags", []),
            "confidence": result.get("confidence", 0.0),
            "style_markers": result.get("style_markers", []),
            "extra_dimensions": result.get("extra_dimensions", []),
        }

    # ================================================================
    # 流水线 2：纯文本 → 整理（跳过 OCR）
    # ================================================================
    def process_text(self, raw_text: str, user_profile: dict | None = None) -> dict:
        """
        文本 → 结构化整理 → 风格渲染。
        """
        profile = user_profile or DEFAULT_PROFILE
        result = self.llm.organize_with_style(raw_text, profile)

        return {
            "raw_text": raw_text,
            "organized_text": result.get("organized_text", ""),
            "structured_fields": result.get("structured_fields", {}),
            "tags": result.get("tags", []),
            "confidence": result.get("confidence", 0.0),
            "style_markers": result.get("style_markers", []),
            "extra_dimensions": result.get("extra_dimensions", []),
        }

    # ================================================================
    # 模板进化信号检测
    # ================================================================
    def check_evolution(self, extra_dimensions: list[dict],
                        recent_extra_dims: list[dict]) -> list[dict]:
        """
        检测是否应该触发模板进化。
        对应 baddest_retention-design.md 的 evolve_template 逻辑。

        规则：
        - 同一新维度在最近记忆中出现 3+ 次 → 提议新增
        - 返回建议列表供前端展示，用户确认后更新 profile
        """
        from collections import Counter

        # 统计近期 extra_dimensions 中各维度出现次数
        dim_counter = Counter()
        for dim in recent_extra_dims:
            dim_counter[dim.get("name", "")] += 1

        suggestions = []
        for dim in extra_dimensions:
            name = dim.get("name", "")
            count = dim_counter.get(name, 0) + 1  # 含当前这条
            if count >= 3:
                suggestions.append({
                    "name": name,
                    "content_sample": dim.get("content", ""),
                    "reason": dim.get("reason", ""),
                    "occurrence_count": count,
                    "action": "suggest_add",
                })

        return suggestions
