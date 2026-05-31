"""
图片文件解析器
使用 Pillow 提取图片信息和主色调
"""
from PIL import Image
from io import BytesIO
from collections import Counter


def parse_image(file_bytes, filename):
    """解析图片文件"""
    img = Image.open(BytesIO(file_bytes))

    # 转换到 RGB 模式（避免 RGBA）
    if img.mode != 'RGB':
        img = img.convert('RGB')

    width, height = img.size
    fmt = img.format.lower() if img.format else "unknown"

    # 计算主色调（采样像素，避免大图处理过慢）
    dominant_color = get_dominant_color(img, sample_size=100)

    return {
        "type": "image",
        "format": fmt,
        "width": width,
        "height": height,
        "mode": img.mode,
        "aspect_ratio": f"{width}:{height}",
        "dominant_color": {
            "r": dominant_color[0],
            "g": dominant_color[1],
            "b": dominant_color[2],
            "hex": f"#{dominant_color[0]:02x}{dominant_color[1]:02x}{dominant_color[2]:02x}",
        },
    }


def get_dominant_color(image, sample_size=100):
    """
    采样像素获取主色调
    sample_size: 采样的像素总数
    """
    # 缩小图片进行采样
    small = image.resize((10, 10), Image.Resampling.LANCZOS)
    pixels = list(small.getdata())

    # 统计颜色出现频率
    color_counts = Counter(pixels)
    dominant_color = color_counts.most_common(1)[0][0]

    return dominant_color