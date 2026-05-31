"""
文件解析器模块
根据文件扩展名分发到对应的解析器
"""
from .text import parse_text
from .pdf import parse_pdf
from .image import parse_image


# 扩展名 → 解析函数映射
PARSER_MAP = {
    # 文本类
    '.txt': parse_text,
    '.md': parse_text,
    '.csv': parse_text,
    '.json': parse_text,
    '.xml': parse_text,
    '.log': parse_text,
    '.py': parse_text,
    '.js': parse_text,
    '.html': parse_text,
    '.css': parse_text,
    # PDF
    '.pdf': parse_pdf,
    # 图片
    '.png': parse_image,
    '.jpg': parse_image,
    '.jpeg': parse_image,
}


def get_parser(filename):
    """
    根据文件名扩展名返回对应解析函数
    不支持的扩展名返回通用元信息解析
    """
    ext = '.' + filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    return PARSER_MAP.get(ext, parse_generic)


def parse_generic(file_bytes, filename):
    """通用解析器：只返回基本文件信息"""
    return {
        "type": "unknown",
        "info": "不支持的文件格式，仅提取基本元信息",
        "size_bytes": len(file_bytes),
    }
