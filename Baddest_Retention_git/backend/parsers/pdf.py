"""
PDF 文件解析器
使用 PyPDF2 提取 PDF 信息
"""
from PyPDF2 import PdfReader
from io import BytesIO


def parse_pdf(file_bytes, filename):
    """解析 PDF 文件"""
    pdf_file = BytesIO(file_bytes)
    reader = PdfReader(pdf_file)

    # 基本信息页数
    page_count = len(reader.pages)

    # 提取元信息
    meta = reader.metadata or {}

    # 提取前几页文本预览
    preview_text = ""
    for page in reader.pages[:3]:  # 前3页
        try:
            text = page.extract_text()
            if text:
                preview_text += text[:1000]  # 每页最多1000字
        except:
            pass

    return {
        "type": "pdf",
        "page_count": page_count,
        "author": meta.get("/Author", "未知") if meta else "未知",
        "title": meta.get("/Title", "未设置") if meta else "未设置",
        "creator": meta.get("/Creator", "") if meta else "",
        "producer": meta.get("/Producer", "") if meta else "",
        "preview": preview_text[:2000] + "..." if len(preview_text) > 2000 else preview_text,
    }