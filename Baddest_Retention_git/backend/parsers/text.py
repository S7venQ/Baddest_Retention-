"""
文本文件解析器
支持：.txt .md .csv .json .xml .log .py .js .html .css
"""
import chardet
import json
import csv
import xml.etree.ElementTree as ET


def parse_text(file_bytes, filename):
    """解析文本类文件"""
    # 检测编码
    detected = chardet.detect(file_bytes)
    encoding = detected['encoding'] or 'utf-8'

    try:
        content = file_bytes.decode(encoding, errors='ignore')
    except:
        content = file_bytes.decode('utf-8', errors='ignore')

    lines = content.splitlines()
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''

    result = {
        "type": "text",
        "encoding": encoding,
        "char_count": len(content),
        "line_count": len(lines),
        "preview": content[:500] + "..." if len(content) > 500 else content,
    }

    # 特殊格式处理
    if ext == 'json':
        try:
            data = json.loads(content)
            result["parsed_json"] = {
                "keys": list(data.keys()) if isinstance(data, dict) else None,
                "length": len(data) if isinstance(data, (list, dict)) else None,
            }
        except:
            pass

    elif ext == 'csv':
        try:
            rows = list(csv.reader(content.splitlines()))
            result["csv_info"] = {
                "columns": len(rows[0]) if rows else 0,
                "rows": len(rows),
                "headers": rows[0] if rows else [],
            }
        except:
            pass

    elif ext == 'xml':
        try:
            root = ET.fromstring(content)
            result["xml_info"] = {
                "root_tag": root.tag,
                "child_count": len(root),
            }
        except:
            pass

    return result