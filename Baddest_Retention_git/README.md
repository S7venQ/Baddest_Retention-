# Baddest Retention 最野留存

桌面宠物 + AI 知识库，拖拽文件即可自动提取、整理、归档知识笔记。

## 快速开始

1. 双击 `Baddest_Retention.exe` 启动
2. 桌宠出现后，双击桌宠打开知识库窗口
3. 在知识库中点击 **LLM 配置**，填入 API 信息
4. 拖拽文件到桌宠即可自动整理

## 目录结构

```
Baddest_Retention/
  Baddest_Retention.exe   # 主程序
  backend/                # Python 后端（Flask + LLM）
  data/                   # 用户数据
    baddest_retention.db  # SQLite 数据库
    knowledge/            # 整理后的知识 .md 文件
    images/               # 图片缓存
    inbox/                # 临时文件
  resources/
    app/                  # 前端源码（Electron）
```

## LLM 配置

支持双协议架构：

| 用途 | 协议 | 推荐模型 |
|------|------|----------|
| 图片 OCR 提取 | OpenAI 协议 | qwen-vl 系列 |
| 文本整理 + 画像分析 | Anthropic 协议 | deepseek-v4 / claude 系列 |

VL 和文本可以使用不同厂商的 API，在知识库的 LLM 配置面板中分别设置。

## 功能

- **拖拽即整理** — 图片自动 OCR，文档自动提取文字，全部 AI 整理入库
- **个性化风格** — 积累 5 篇笔记后自动分析用户风格，后续整理贴合你的习惯
- **知识库管理** — 浏览、搜索、编辑、删除笔记，Markdown 预览
- **模板进化** — 自动发现新的知识维度并建议纳入画像

## 支持格式

- 图片：png, jpg, jpeg, gif, bmp, webp, tiff, heic
- 文档：md, txt, docx, pdf, csv, json, yaml
- 代码：py, js, ts, html, css, java, c, cpp, go, rs 等

## 开发

```bash
# 启动后端
cd backend && python app.py

# 启动前端（需要 Node.js）
cd resources/app && npx electron .
```

后端默认端口 5000，前端通过 `localhost:5000` 通信。

## 技术栈

- **前端**：Electron + 原生 HTML/CSS/JS
- **后端**：Flask + SQLite
- **AI**：OpenAI 协议（VL 多模态）+ Anthropic 协议（文本推理）
- **文档解析**：python-docx, PyMuPDF, Pillow
