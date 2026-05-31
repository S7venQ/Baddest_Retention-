"""
Baddest_Retention — notes 表 CRUD
管理笔记记录的建表、插入、查询。
与 ProfileManager 共用同一个 SQLite 数据库文件。
"""

import json
import os
import sys
import sqlite3
import uuid
from datetime import datetime

# ---- 路径：源码模式 vs PyInstaller 打包模式 ----
# 统一使用主目录下的 data/（与 exe 同级）
if getattr(sys, 'frozen', False):
    # PyInstaller 打包后：data 目录在 exe 旁边
    _EXE_DIR = os.path.dirname(sys.executable)
    DATA_DIR = os.path.join(_EXE_DIR, "data")
else:
    # 源码模式：backend/ 的上层主目录下
    _BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DATA_DIR = os.path.join(_BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "baddest_retention.db")


def _get_conn():
    return sqlite3.connect(DB_PATH)


def init_db():
    """建 notes 表（如果不存在）+ 迁移补字段。user_profile 表由 ProfileManager 管理。"""
    conn = _get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            raw_text TEXT NOT NULL,
            organized_text TEXT,
            structured_fields TEXT DEFAULT '{}',
            source_type TEXT NOT NULL,
            source_filename TEXT,
            tags TEXT DEFAULT '[]',
            confidence REAL DEFAULT 0.0,
            style_markers TEXT DEFAULT '[]',
            extra_dimensions TEXT DEFAULT '[]',
            created_at TEXT,
            file_path TEXT DEFAULT ''
        )
    """)
    # 迁移：为旧表补上 file_path 列
    cols = [r[1] for r in conn.execute("PRAGMA table_info(notes)").fetchall()]
    if "file_path" not in cols:
        conn.execute("ALTER TABLE notes ADD COLUMN file_path TEXT DEFAULT ''")
    conn.commit()
    conn.close()


def insert_note(raw_text: str, organized_text: str,
                source_type: str, source_filename: str = "",
                structured_fields: dict = None,
                tags: list = None, confidence: float = 0.0,
                style_markers: list = None,
                extra_dimensions: list = None,
                file_path: str = "") -> str:
    """插入一条笔记，返回 note id。"""
    note_id = f"note_{uuid.uuid4().hex[:8]}"
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn = _get_conn()
    conn.execute("""
        INSERT INTO notes (id, raw_text, organized_text, structured_fields,
                           source_type, source_filename, tags, confidence,
                           style_markers, extra_dimensions, created_at, file_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        note_id,
        raw_text,
        organized_text,
        json.dumps(structured_fields or {}, ensure_ascii=False),
        source_type,
        source_filename,
        json.dumps(tags or [], ensure_ascii=False),
        confidence,
        json.dumps(style_markers or [], ensure_ascii=False),
        json.dumps(extra_dimensions or [], ensure_ascii=False),
        created_at,
        file_path,
    ))
    conn.commit()
    conn.close()
    return note_id


def update_note_file_path(note_id: str, file_path: str):
    """更新笔记的文件路径。"""
    conn = _get_conn()
    conn.execute("UPDATE notes SET file_path = ? WHERE id = ?", (file_path, note_id))
    conn.commit()
    conn.close()


def update_note_meta(note_id: str, source_filename: str = None, tags: list = None):
    """更新笔记的标题(source_filename)和/或标签。"""
    conn = _get_conn()
    if source_filename is not None and tags is not None:
        conn.execute("UPDATE notes SET source_filename = ?, tags = ? WHERE id = ?",
                     (source_filename, json.dumps(tags, ensure_ascii=False), note_id))
    elif source_filename is not None:
        conn.execute("UPDATE notes SET source_filename = ? WHERE id = ?",
                     (source_filename, note_id))
    elif tags is not None:
        conn.execute("UPDATE notes SET tags = ? WHERE id = ?",
                     (json.dumps(tags, ensure_ascii=False), note_id))
    conn.commit()
    conn.close()


def get_note_by_file_path(file_path: str) -> dict | None:
    """根据文件路径查找笔记。"""
    conn = _get_conn()
    row = conn.execute(
        "SELECT id, raw_text, organized_text, structured_fields, "
        "source_type, source_filename, tags, confidence, "
        "style_markers, extra_dimensions, created_at, file_path "
        "FROM notes WHERE file_path = ?",
        (file_path,)
    ).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row[0], "raw_text": row[1], "organized_text": row[2],
        "structured_fields": json.loads(row[3]) if row[3] else {},
        "source_type": row[4], "source_filename": row[5],
        "tags": json.loads(row[6]) if row[6] else [],
        "confidence": row[7],
        "style_markers": json.loads(row[8]) if row[8] else [],
        "extra_dimensions": json.loads(row[9]) if row[9] else [],
        "created_at": row[10], "file_path": row[11],
    }


def delete_note(note_id: str):
    """删除笔记记录。"""
    conn = _get_conn()
    conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    conn.commit()
    conn.close()


def get_all_notes() -> list[dict]:
    """获取所有笔记，时间倒序。"""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT id, source_type, source_filename, organized_text, tags, confidence, created_at "
        "FROM notes ORDER BY created_at DESC"
    ).fetchall()
    conn.close()

    result = []
    for r in rows:
        summary = (r[3] or "")[:100]
        result.append({
            "id": r[0],
            "source_type": r[1],
            "source_filename": r[2] or "",
            "summary": summary + ("..." if len(r[3] or "") > 100 else ""),
            "tags": json.loads(r[4]) if r[4] else [],
            "confidence": r[5],
            "created_at": r[6],
        })
    return result


def get_note_by_id(note_id: str) -> dict | None:
    """获取一条笔记的完整内容。"""
    conn = _get_conn()
    row = conn.execute(
        "SELECT id, raw_text, organized_text, structured_fields, "
        "source_type, source_filename, tags, confidence, "
        "style_markers, extra_dimensions, created_at, file_path "
        "FROM notes WHERE id = ?",
        (note_id,)
    ).fetchone()
    conn.close()

    if not row:
        return None

    return {
        "id": row[0],
        "raw_text": row[1],
        "organized_text": row[2],
        "structured_fields": json.loads(row[3]) if row[3] else {},
        "source_type": row[4],
        "source_filename": row[5],
        "tags": json.loads(row[6]) if row[6] else [],
        "confidence": row[7],
        "style_markers": json.loads(row[8]) if row[8] else [],
        "extra_dimensions": json.loads(row[9]) if row[9] else [],
        "created_at": row[10],
        "file_path": row[11],
    }


def get_recent_extra_dimensions(limit: int = 10) -> list[dict]:
    """获取最近 N 条笔记的 extra_dimensions（用于模板进化检测）"""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT extra_dimensions FROM notes ORDER BY created_at DESC LIMIT ?",
        (limit,)
    ).fetchall()
    conn.close()
    result = []
    for r in rows:
        if r[0]:
            try:
                result.extend(json.loads(r[0]))
            except (json.JSONDecodeError, TypeError):
                pass
    return result


def get_note_count() -> int:
    """返回笔记总数。"""
    conn = _get_conn()
    count = conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
    conn.close()
    return count