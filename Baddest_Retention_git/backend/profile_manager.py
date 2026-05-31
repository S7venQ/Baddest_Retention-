"""
Baddest_Retention — 用户风格画像管理（多厂商版）
管理 user_profile 表：VL 配置、文本配置、风格画像、冷启动默认画像。
支持 VL（多模态）和文本（整理/分析）使用不同厂家的 API。
"""

import json
import sqlite3
from datetime import datetime


# 默认用户画像（冷启动用）
DEFAULT_PROFILE = {
    "style_preference": "structured",
    "dimension_hints": json.dumps([
        {"name": "核心概念",      "weight": 1.0, "ai_hint": "用一句话定义这叫什么/做了什么"},
        {"name": "机制原理",      "weight": 0.9, "ai_hint": "提取工作原理、关键步骤、底层逻辑"},
        {"name": "注意事项/局限",  "weight": 0.8, "ai_hint": "边界条件、常见陷阱、什么时候不适用"},
        {"name": "可迁移应用",    "weight": 0.7, "ai_hint": "能否用到用户关心的领域？具体怎么用？"},
        {"name": "易混淆区分",    "weight": 0.6, "ai_hint": "主动区分原文中容易混淆的概念"},
    ]),
    "language_style": "balanced",
    "unique_habits": json.dumps([]),
}

# 触发风格分析的笔记数量阈值
PROFILE_UPDATE_THRESHOLD = 5


class ProfileManager:
    """管理 user_profile 表的读写，以及触发风格画像分析。"""

    def __init__(self, db_path: str):
        self.db_path = db_path
        self._ensure_table()

    def _get_conn(self):
        return sqlite3.connect(self.db_path)

    def _ensure_table(self):
        """确保 user_profile 表存在，兼容旧 schema。"""
        conn = self._get_conn()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_profile (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                -- 共享/fallback 配置
                api_key TEXT DEFAULT '',
                base_url TEXT DEFAULT '',
                vl_model TEXT DEFAULT '',
                text_model TEXT DEFAULT '',
                -- VL 专属配置（不填则 fallback 到 api_key/base_url）
                vl_api_key TEXT DEFAULT '',
                vl_base_url TEXT DEFAULT '',
                -- 文本专属配置（不填则 fallback 到 api_key/base_url）
                text_api_key TEXT DEFAULT '',
                text_base_url TEXT DEFAULT '',
                -- 风格画像
                style_preference TEXT DEFAULT 'structured',
                dimension_hints TEXT DEFAULT '[]',
                language_style TEXT DEFAULT 'balanced',
                unique_habits TEXT DEFAULT '[]',
                sample_count INTEGER DEFAULT 0,
                updated_at TEXT
            )
        """)
        # 兼容旧表：加新列
        for col, col_type in [
            ("api_key",       "TEXT DEFAULT ''"),
            ("base_url",      "TEXT DEFAULT ''"),
            ("vl_model",      "TEXT DEFAULT ''"),
            ("text_model",    "TEXT DEFAULT ''"),
            ("vl_api_key",    "TEXT DEFAULT ''"),
            ("vl_base_url",   "TEXT DEFAULT ''"),
            ("text_api_key",  "TEXT DEFAULT ''"),
            ("text_base_url", "TEXT DEFAULT ''"),
        ]:
            try:
                conn.execute(f"ALTER TABLE user_profile ADD COLUMN {col} {col_type}")
            except sqlite3.OperationalError:
                pass
        conn.commit()
        conn.close()

    # ================================================================
    # 写入 / 读取 LLM 配置（多厂商版）
    # ================================================================
    def set_llm_config(self,
                       # 共享/fallback 配置
                       api_key: str = "",
                       base_url: str = "",
                       vl_model: str = "",
                       text_model: str = "",
                       # VL 专属
                       vl_api_key: str = "",
                       vl_base_url: str = "",
                       # 文本专属
                       text_api_key: str = "",
                       text_base_url: str = "",
                       ) -> None:
        """设置 LLM 配置。同厂家：只填 api_key/base_url/vl_model/text_model。不同厂家：额外填 vl_xxx 和 text_xxx。"""
        conn = self._get_conn()
        row = conn.execute("SELECT id FROM user_profile LIMIT 1").fetchone()
        now = datetime.now().isoformat()
        if row:
            conn.execute("""
                UPDATE user_profile SET
                    api_key = ?, base_url = ?, vl_model = ?, text_model = ?,
                    vl_api_key = ?, vl_base_url = ?,
                    text_api_key = ?, text_base_url = ?,
                    updated_at = ?
                WHERE id = ?
            """, (api_key, base_url, vl_model, text_model,
                  vl_api_key, vl_base_url, text_api_key, text_base_url,
                  now, row[0]))
        else:
            conn.execute("""
                INSERT INTO user_profile
                    (api_key, base_url, vl_model, text_model,
                     vl_api_key, vl_base_url, text_api_key, text_base_url, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (api_key, base_url, vl_model, text_model,
                  vl_api_key, vl_base_url, text_api_key, text_base_url, now))
        conn.commit()
        conn.close()

    def get_llm_config(self) -> dict:
        """读回完整 LLM 配置。"""
        conn = self._get_conn()
        row = conn.execute(
            "SELECT api_key, base_url, vl_model, text_model, "
            "vl_api_key, vl_base_url, text_api_key, text_base_url "
            "FROM user_profile LIMIT 1"
        ).fetchone()
        conn.close()
        if row:
            return {
                "api_key":    row[0] or "",
                "base_url":   row[1] or "",
                "vl_model":   row[2] or "",
                "text_model": row[3] or "",
                "vl_api_key":    row[4] or "",
                "vl_base_url":   row[5] or "",
                "text_api_key":  row[6] or "",
                "text_base_url": row[7] or "",
            }
        return {"api_key": "", "base_url": "", "vl_model": "", "text_model": "",
                "vl_api_key": "", "vl_base_url": "", "text_api_key": "", "text_base_url": ""}

    # ================================================================
    # 检查是否已配置（不 import 重依赖，适合 health check）
    # ================================================================
    def is_configured(self) -> bool:
        """只查数据库配置是否完整，不构建 LLMClient（避免提前 import openai/anthropic）。"""
        cfg = self.get_llm_config()
        _text_api_key = cfg["text_api_key"] or cfg["api_key"]
        _text_model = cfg["text_model"]
        return bool(_text_api_key and _text_model)

    # ================================================================
    # 构建 LLMClient（多厂商版）
    # ================================================================
    def build_client(self):
        """
        从 user_profile 表读取配置，返回 LLMClient 实例。
        VL 和文本可以指向不同厂家。
        如果文本模型未配置（核心必需），返回 None。
        """
        cfg = self.get_llm_config()

        # 解析 VL 配置：vl_api_key 不填 → 用 api_key
        _vl_api_key = cfg["vl_api_key"] or cfg["api_key"]
        _vl_base_url = cfg["vl_base_url"] or cfg["base_url"]
        _vl_model = cfg["vl_model"]

        # 解析文本配置：text_api_key 不填 → 用 api_key
        _text_api_key = cfg["text_api_key"] or cfg["api_key"]
        _text_base_url = cfg["text_base_url"] or cfg["base_url"]
        _text_model = cfg["text_model"]

        if not _text_api_key or not _text_model:
            return None

        from llm_client import LLMClient
        return LLMClient(
            api_key="", base_url="",  # 不用共享的了，直接给专属值
            vl_model=_vl_model,
            text_model=_text_model,
            vl_api_key=_vl_api_key,
            vl_base_url=_vl_base_url,
            text_api_key=_text_api_key,
            text_base_url=_text_base_url,
        )

    # ================================================================
    # 兼容旧接口
    # ================================================================
    def set_api_key(self, api_key: str) -> None:
        """单独设置共享 API Key（兼容旧接口）。"""
        conn = self._get_conn()
        row = conn.execute("SELECT id FROM user_profile LIMIT 1").fetchone()
        now = datetime.now().isoformat()
        if row:
            conn.execute("UPDATE user_profile SET api_key = ?, updated_at = ? WHERE id = ?",
                         (api_key, now, row[0]))
        else:
            conn.execute("INSERT INTO user_profile (api_key, updated_at) VALUES (?, ?)",
                         (api_key, now))
        conn.commit()
        conn.close()

    def get_api_key(self) -> str:
        return self.get_llm_config()["api_key"]

    # ================================================================
    # 用户风格画像
    # ================================================================
    def get_profile(self) -> dict:
        conn = self._get_conn()
        row = conn.execute(
            "SELECT style_preference, dimension_hints, language_style, unique_habits, sample_count "
            "FROM user_profile LIMIT 1"
        ).fetchone()
        conn.close()

        if not row:
            return {
                "style_preference": DEFAULT_PROFILE["style_preference"],
                "dimension_hints": json.loads(DEFAULT_PROFILE["dimension_hints"]),
                "language_style": DEFAULT_PROFILE["language_style"],
                "unique_habits": json.loads(DEFAULT_PROFILE["unique_habits"]),
                "sample_count": 0,
            }

        return {
            "style_preference": row[0],
            "dimension_hints": json.loads(row[1]) if row[1] else [],
            "language_style": row[2],
            "unique_habits": json.loads(row[3]) if row[3] else [],
            "sample_count": row[4],
        }

    def update_profile(self, profile_data: dict) -> None:
        conn = self._get_conn()
        now = datetime.now().isoformat()
        row = conn.execute("SELECT id FROM user_profile LIMIT 1").fetchone()

        if row:
            conn.execute("""
                UPDATE user_profile SET
                    style_preference = ?,
                    dimension_hints = ?,
                    language_style = ?,
                    unique_habits = ?,
                    sample_count = ?,
                    updated_at = ?
                WHERE id = ?
            """, (
                profile_data.get("style_preference", "structured"),
                json.dumps(profile_data.get("dimension_hints", []), ensure_ascii=False),
                profile_data.get("language_style", "balanced"),
                json.dumps(profile_data.get("unique_habits", []), ensure_ascii=False),
                profile_data.get("sample_count", 0),
                now,
                row[0],
            ))
        else:
            conn.execute("""
                INSERT INTO user_profile
                    (style_preference, dimension_hints, language_style, unique_habits, sample_count, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                profile_data.get("style_preference", "structured"),
                json.dumps(profile_data.get("dimension_hints", []), ensure_ascii=False),
                profile_data.get("language_style", "balanced"),
                json.dumps(profile_data.get("unique_habits", []), ensure_ascii=False),
                profile_data.get("sample_count", 0),
                now,
            ))
        conn.commit()
        conn.close()

    # ================================================================
    # 触发风格分析
    # ================================================================
    def should_analyze(self) -> bool:
        conn = self._get_conn()
        note_count = conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
        profile = conn.execute(
            "SELECT sample_count FROM user_profile LIMIT 1"
        ).fetchone()
        conn.close()
        if not profile:
            return note_count >= PROFILE_UPDATE_THRESHOLD
        return (note_count - profile[0]) >= PROFILE_UPDATE_THRESHOLD

    def get_recent_notes(self, limit: int = 10) -> list[dict]:
        conn = self._get_conn()
        rows = conn.execute(
            "SELECT raw_text, organized_text FROM notes ORDER BY created_at DESC LIMIT ?",
            (limit,)
        ).fetchall()
        conn.close()
        return [{"raw_text": r[0], "organized_text": r[1]} for r in rows]