/**
 * Baddest_Retention 知识库 - 文件管理界面
 * 功能：文件列表、查看、编辑、保存、删除、新建、搜索
 * 列表 API：/api/notes（获取全部笔记，不依赖 .md 文件是否存在）
 * 详情 API：/api/notes/<id>
 * 编辑 API：/api/files/<id>（PUT 保存）
 * 新建 API：/api/files（POST）
 * 删除 API：/api/files/<id>（DELETE）
 */

const BACKEND_URL = 'http://localhost:5000';

// ---- DOM 元素引用 ----
const fileList = document.getElementById('fileList');
const emptyState = document.getElementById('emptyState');
const fileCount = document.getElementById('fileCount');
const searchInput = document.getElementById('searchInput');
const newFileBtn = document.getElementById('newFileBtn');
const newFileModal = document.getElementById('newFileModal');
const newFileTitle = document.getElementById('newFileTitle');
const newFileTags = document.getElementById('newFileTags');
const newFileContent = document.getElementById('newFileContent');
const cancelNewFile = document.getElementById('cancelNewFile');
const confirmNewFile = document.getElementById('confirmNewFile');
const editorPlaceholder = document.getElementById('editorPlaceholder');
const editorToolbar = document.getElementById('editorToolbar');
const editorContent = document.getElementById('editorContent');
const editorTextarea = document.getElementById('editorTextarea');
const editorPreview = document.getElementById('editorPreview');
const editorFilename = document.getElementById('editorFilename');
const sourceBadge = document.getElementById('sourceBadge');
const saveBtn = document.getElementById('saveBtn');
const deleteBtn = document.getElementById('deleteBtn');
const modifiedIndicator = document.getElementById('modifiedIndicator');
const editViewBtn = document.getElementById('editViewBtn');
const previewViewBtn = document.getElementById('previewViewBtn');
const toastContainer = document.getElementById('toastContainer');

// ---- 新增：右键菜单和编辑弹窗 DOM ----
const contextMenu = document.getElementById('contextMenu');
const ctxEdit = document.getElementById('ctxEdit');
const ctxOpen = document.getElementById('ctxOpen');
const ctxDelete = document.getElementById('ctxDelete');
const editFileModal = document.getElementById('editFileModal');
const editFileTitle = document.getElementById('editFileTitle');
const editFileTags = document.getElementById('editFileTags');
const cancelEditFile = document.getElementById('cancelEditFile');
const confirmEditFile = document.getElementById('confirmEditFile');

// ---- LLM 配置弹窗 DOM ----
const llmSettingsBtn = document.getElementById('llmSettingsBtn');
const llmSettingsModal = document.getElementById('llmSettingsModal');
const llmApiKey = document.getElementById('llmApiKey');
const llmBaseUrl = document.getElementById('llmBaseUrl');
const llmVlModel = document.getElementById('llmVlModel');
const llmVlApiKey = document.getElementById('llmVlApiKey');
const llmVlBaseUrl = document.getElementById('llmVlBaseUrl');
const llmTextModel = document.getElementById('llmTextModel');
const llmTextApiKey = document.getElementById('llmTextApiKey');
const llmTextBaseUrl = document.getElementById('llmTextBaseUrl');
const llmStatus = document.getElementById('llmStatus');
const cancelLlmSettings = document.getElementById('cancelLlmSettings');
const confirmLlmSettings = document.getElementById('confirmLlmSettings');

// ---- 状态 ----
let files = [];           // 所有文件列表
let currentFileId = null; // 当前选中的文件 note_id
let isModified = false;   // 当前文件是否有未保存的修改
let originalContent = ''; // 打开文件时的原始内容
let contextFileId = null; // 右键菜单操作的文件 ID
let currentFileTitle = ''; // 当前文件的标题(source_filename)
let currentFileTags = [];  // 当前文件的标签

// ---- IPC：接收从桌宠拖拽传来的整理结果 ----
const { ipcRenderer } = require('electron');

ipcRenderer.on('show-organized-result', (_e, aiResult) => {
  // 拖拽文件整理完成后，刷新文件列表并高亮新文件
  loadFiles();
  if (aiResult && aiResult.note_id) {
    // 延迟一点确保文件列表已更新
    setTimeout(() => {
      selectFile(aiResult.note_id, true);
    }, 500);
  }
});

// ================================================================
// 文件列表
// ================================================================

/**
 * 从后端加载文件列表
 * 使用 /api/notes 获取全部笔记（包括没有 .md 文件的旧笔记）
 */
async function loadFiles() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/notes`);
    const data = await res.json();
    if (data.status === 'success') {
      // /api/notes 返回的字段是 notes 数组，字段名用 id 而非 note_id
      files = (data.notes || []).map(n => ({
        note_id: n.id,
        source_type: n.source_type,
        source_filename: n.source_filename || '',
        tags: n.tags,
        confidence: n.confidence,
        created_at: n.created_at,
        summary: n.summary,
      }));
      renderFileList(files);
      fileCount.textContent = `${files.length} 个文件`;
    }
  } catch (error) {
    showToast('无法连接后端服务', 'error');
    console.error('加载文件列表失败:', error);
  }
}

/**
 * 渲染文件列表
 */
function renderFileList(list) {
  // 清空现有列表（保留 emptyState）
  const items = fileList.querySelectorAll('.file-item');
  items.forEach(item => item.remove());

  if (list.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  list.forEach(file => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.dataset.noteId = file.note_id;

    // 文件名：优先使用 source_filename，其次用 summary 第一行，最后用 note_id
    const displayName = file.source_filename
      || (file.summary ? file.summary.split('\n')[0].replace(/^#+\s*/, '').substring(0, 40) : '')
      || file.note_id;
    const sourceIcon = getSourceIcon(file.source_type);

    let tagsHtml = '';
    if (file.tags && file.tags.length > 0) {
      tagsHtml = `<div class="file-item-tags">
        ${file.tags.slice(0, 3).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
        ${file.tags.length > 3 ? `<span class="tag">+${file.tags.length - 3}</span>` : ''}
      </div>`;
    }

    item.innerHTML = `
      <div class="file-item-name">${escapeHtml(displayName)}</div>
      <div class="file-item-meta">
        <span class="file-item-source">${sourceIcon} ${escapeHtml(file.source_type || 'unknown')}</span>
        <span class="file-item-date">${formatDate(file.created_at)}</span>
      </div>
      ${tagsHtml}
    `;

    item.addEventListener('click', () => selectFile(file.note_id));
    // 右键菜单
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, file.note_id);
    });

    fileList.appendChild(item);
  });
}

/**
 * 获取来源类型图标
 */
function getSourceIcon(type) {
  const icons = {
    photo: '📷',
    text: '📝',
    document: '📄',
    pdf: '📕',
    code: '💻',
    manual: '✏️',
    pdf_scan: '📸',
  };
  return icons[type] || '📎';
}

/**
 * 格式化日期
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin} 分钟前`;
    if (diffHour < 24) return `${diffHour} 小时前`;
    if (diffDay < 7) return `${diffDay} 天前`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return dateStr;
  }
}

// ================================================================
// 文件选中与编辑
// ================================================================

/**
 * 选中一个文件，加载其内容到编辑区
 * @param {string} noteId - 笔记 ID
 * @param {boolean} highlight - 是否高亮显示（新文件）
 */
async function selectFile(noteId, highlight = false) {
  // 如果当前有未保存的修改，先提示
  if (isModified && currentFileId !== noteId) {
    const confirmed = confirm('当前文件有未保存的修改，确定切换吗？');
    if (!confirmed) return;
  }

  currentFileId = noteId;
  isModified = false;
  originalContent = '';
  updateModifiedState();

  // 更新侧栏选中状态
  document.querySelectorAll('.file-item').forEach(item => {
    item.classList.toggle('active', item.dataset.noteId === noteId);
    if (highlight && item.dataset.noteId === noteId) {
      item.classList.add('highlight');
      setTimeout(() => item.classList.remove('highlight'), 1500);
    }
  });

  // 显示编辑区
  editorPlaceholder.style.display = 'none';
  editorToolbar.style.display = 'flex';
  editorContent.style.display = 'flex';

  // 加载文件内容
  editorTextarea.value = '';
  editorTextarea.disabled = true;
  saveBtn.disabled = true;

  try {
    // 优先用 /api/files/<id>（有 .md 文件时返回完整内容含 frontmatter）
    // 如果失败则 fallback 到 /api/notes/<id>（用数据库中的 organized_text）
    let data = null;
    let useFilesApi = true;

    try {
      const res = await fetch(`${BACKEND_URL}/api/files/${noteId}`);
      data = await res.json();
      if (data.status !== 'success') {
        useFilesApi = false;
      }
    } catch {
      useFilesApi = false;
    }

    if (!useFilesApi) {
      const res = await fetch(`${BACKEND_URL}/api/notes/${noteId}`);
      data = await res.json();
    }

    if (data.status === 'success') {
      const displayName = data.source_filename || data.filename || noteId;
      currentFileTitle = data.source_filename || '';
      currentFileTags = data.tags || [];
      // 显示文件名（点击可编辑）
      renderEditorFilename(displayName);
      sourceBadge.textContent = data.source_type || '';
      // /api/files 返回 content，/api/notes 返回 note.organized_text
      const rawContent = data.content || (data.note && data.note.organized_text) || '';
      // 过滤掉 YAML frontmatter，只显示正文
      const content = stripFrontmatter(rawContent);
      editorTextarea.value = content;
      originalContent = content;
      editorTextarea.disabled = false;
    } else {
      showToast(data.message || '加载文件失败', 'error');
      editorTextarea.disabled = false;
    }
  } catch (error) {
    showToast('无法连接后端服务', 'error');
    editorTextarea.disabled = false;
    console.error('加载文件失败:', error);
  }

  // 切换到编辑视图
  switchToEditView();
  editorTextarea.focus();
}

// ================================================================
// 编辑与保存
// ================================================================

// 监听文本变化
editorTextarea.addEventListener('input', () => {
  isModified = editorTextarea.value !== originalContent;
  updateModifiedState();
});

// Ctrl+S 保存
editorTextarea.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveCurrentFile();
  }
  // Tab 键插入两个空格
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    editorTextarea.value = editorTextarea.value.substring(0, start) + '  ' + editorTextarea.value.substring(end);
    editorTextarea.selectionStart = editorTextarea.selectionEnd = start + 2;
    editorTextarea.dispatchEvent(new Event('input'));
  }
});

/**
 * 更新修改状态 UI
 */
function updateModifiedState() {
  saveBtn.disabled = !isModified;
  modifiedIndicator.classList.toggle('visible', isModified);
}

/**
 * 保存当前文件
 */
async function saveCurrentFile() {
  if (!currentFileId || !isModified) return;

  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="loading-spinner"></span> 保存中';

  try {
    const res = await fetch(`${BACKEND_URL}/api/files/${currentFileId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editorTextarea.value }),
    });

    const data = await res.json();
    if (data.status === 'success') {
      originalContent = editorTextarea.value;
      isModified = false;
      updateModifiedState();
      showToast('文件已保存', 'success');
    } else {
      showToast(data.message || '保存失败', 'error');
      saveBtn.disabled = false;
    }
  } catch (error) {
    showToast('保存失败: ' + error.message, 'error');
    saveBtn.disabled = false;
    console.error('保存失败:', error);
  }

  saveBtn.innerHTML = '💾 保存';
}

/**
 * 删除当前文件
 */
async function deleteCurrentFile() {
  if (!currentFileId) return;

  const confirmed = confirm('确定要删除这个文件吗？此操作不可撤销。');
  if (!confirmed) return;

  try {
    const res = await fetch(`${BACKEND_URL}/api/files/${currentFileId}`, {
      method: 'DELETE',
    });

    const data = await res.json();
    if (data.status === 'success') {
      showToast('文件已删除', 'success');
      currentFileId = null;
      isModified = false;
      originalContent = '';

      // 回到占位状态
      editorPlaceholder.style.display = 'flex';
      editorToolbar.style.display = 'none';
      editorContent.style.display = 'none';

      // 刷新列表
      loadFiles();
    } else {
      showToast(data.message || '删除失败', 'error');
    }
  } catch (error) {
    showToast('删除失败: ' + error.message, 'error');
    console.error('删除失败:', error);
  }
}

// ================================================================
// 新建文件
// ================================================================

function openNewFileModal() {
  newFileTitle.value = '';
  newFileTags.value = '';
  newFileContent.value = '';
  newFileModal.classList.add('active');
  setTimeout(() => newFileTitle.focus(), 100);
}

function closeNewFileModal() {
  newFileModal.classList.remove('active');
}

async function createNewFile() {
  const title = newFileTitle.value.trim();
  if (!title) {
    newFileTitle.style.borderColor = '#e74c3c';
    setTimeout(() => newFileTitle.style.borderColor = '', 1500);
    return;
  }

  const tagsStr = newFileTags.value.trim();
  const tags = tagsStr ? tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];
  const content = newFileContent.value.trim();

  closeNewFileModal();

  try {
    const res = await fetch(`${BACKEND_URL}/api/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, tags, source_type: 'manual' }),
    });

    const data = await res.json();
    if (data.status === 'success') {
      showToast('文件已创建', 'success');
      await loadFiles();
      // 自动选中新文件
      setTimeout(() => selectFile(data.note_id, true), 300);
    } else {
      showToast(data.message || '创建失败', 'error');
    }
  } catch (error) {
    showToast('创建失败: ' + error.message, 'error');
    console.error('创建文件失败:', error);
  }
}

// ================================================================
// 搜索
// ================================================================

searchInput.addEventListener('input', () => {
  const keyword = searchInput.value.trim().toLowerCase();
  if (!keyword) {
    renderFileList(files);
    return;
  }

  const filtered = files.filter(f => {
    const name = (f.source_filename || f.note_id || '').toLowerCase();
    const summary = (f.summary || '').toLowerCase();
    const tags = (f.tags || []).join(' ').toLowerCase();
    const type = (f.source_type || '').toLowerCase();
    return name.includes(keyword) || summary.includes(keyword) || tags.includes(keyword) || type.includes(keyword);
  });

  renderFileList(filtered);
});

// ================================================================
// 编辑/预览视图切换
// ================================================================

function switchToEditView() {
  editorTextarea.classList.remove('hidden');
  editorPreview.classList.remove('active');
  editViewBtn.classList.add('active');
  previewViewBtn.classList.remove('active');
}

function switchToPreviewView() {
  // 简单的 Markdown 渲染
  editorPreview.innerHTML = renderMarkdown(editorTextarea.value);
  editorTextarea.classList.add('hidden');
  editorPreview.classList.add('active');
  editViewBtn.classList.remove('active');
  previewViewBtn.classList.add('active');
}

/**
 * 简易 Markdown 渲染器（不依赖外部库）
 */
function renderMarkdown(text) {
  if (!text) return '<p style="color: #ccc;">（空文件）</p>';

  let html = escapeHtml(text);

  // 占位符保护：提取代码块和行内代码，防止后续正则入侵
  const codePlaceholders = [];

  // 代码块 (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const idx = codePlaceholders.length;
    codePlaceholders.push(`<pre><code>${code.trim()}</code></pre>`);
    return `\x00CODE${idx}\x00`;
  });

  // 行内代码
  html = html.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = codePlaceholders.length;
    codePlaceholders.push(`<code>${code}</code>`);
    return `\x00CODE${idx}\x00`;
  });

  // 标题
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // 粗体和斜体
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 分割线
  html = html.replace(/^---$/gm, '<hr>');

  // 引用块
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // 无序列表
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // 有序列表
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // 图片
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px;">');

  // 段落：把连续的非标签行包裹为 <p>
  html = html.replace(/^(?!<[hupblo]|<li|<hr|<pre|<code|<block)(.*\S.*)$/gm, '<p>$1</p>');

  // 还原代码块占位符
  html = html.replace(/\x00CODE(\d+)\x00/g, (_m, idx) => {
    return codePlaceholders[parseInt(idx, 10)];
  });

  // 清理多余空行
  html = html.replace(/\n{3,}/g, '\n\n');

  return html;
}

// ================================================================
// Toast 通知
// ================================================================

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || ''}</span> ${escapeHtml(message)}`;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ================================================================
// 工具函数
// ================================================================

/**
 * 过滤 YAML frontmatter（--- 包裹的元数据块）
 */
function stripFrontmatter(text) {
  if (!text) return '';
  // 匹配开头的 --- ... --- 块
  const match = text.match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
  if (match) {
    return text.slice(match[0].length).trim();
  }
  return text;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ================================================================
// 内联编辑文件名
// ================================================================

function renderEditorFilename(name) {
  editorFilename.textContent = '';
  editorFilename.dataset.rawName = name;
  editorFilename.style.cursor = 'text';
  editorFilename.title = '单击编辑文件名';
}

// 单击文件名 → 变成输入框
editorFilename.addEventListener('click', () => {
  if (!currentFileId) return;
  const currentName = editorFilename.dataset.rawName || currentFileTitle || '';
  editorFilename.textContent = '';
  const input = document.createElement('input');
  input.className = 'editor-filename-input';
  input.value = currentName;
  editorFilename.appendChild(input);
  input.focus();
  input.select();

  // Enter 或失焦保存
  const saveName = async () => {
    const newName = input.value.trim();
    if (!newName) {
      renderEditorFilename(currentName);
      return;
    }
    if (newName === currentName) {
      renderEditorFilename(currentName);
      return;
    }
    // 保存到后端
    try {
      const res = await fetch(`${BACKEND_URL}/api/files/${currentFileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newName }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        currentFileTitle = newName;
        renderEditorFilename(newName);
        showToast('标题已更新', 'success');
        // 刷新侧栏
        loadFiles();
      } else {
        showToast(data.message || '更新失败', 'error');
        renderEditorFilename(currentName);
      }
    } catch (error) {
      showToast('更新失败: ' + error.message, 'error');
      renderEditorFilename(currentName);
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.removeEventListener('blur', saveName); saveName(); }
    if (e.key === 'Escape') { renderEditorFilename(currentName); }
  });
  input.addEventListener('blur', saveName);
});

// ================================================================
// 右键菜单
// ================================================================

function showContextMenu(x, y, noteId) {
  contextFileId = noteId;
  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
  contextMenu.classList.add('active');
}

function hideContextMenu() {
  contextMenu.classList.remove('active');
  contextFileId = null;
}

// 点击任意位置关闭右键菜单
document.addEventListener('click', hideContextMenu);

// 右键菜单：编辑标题和标签
ctxEdit.addEventListener('click', (e) => {
  e.stopPropagation();
  const noteId = contextFileId;
  hideContextMenu();
  if (!noteId) return;
  // 查找当前文件数据
  const file = files.find(f => f.note_id === noteId);
  const currentTitle = file ? (file.source_filename || '') : '';
  const currentTags = file ? (file.tags || []) : [];
  editFileTitle.value = currentTitle;
  editFileTags.value = currentTags.join(', ');
  editFileModal.classList.add('active');
  setTimeout(() => editFileTitle.focus(), 100);
});

// 右键菜单：打开文件
ctxOpen.addEventListener('click', (e) => {
  e.stopPropagation();
  const noteId = contextFileId;
  hideContextMenu();
  if (noteId) selectFile(noteId);
});

// 右键菜单：删除文件
ctxDelete.addEventListener('click', (e) => {
  e.stopPropagation();
  const noteId = contextFileId;
  hideContextMenu();
  if (noteId) deleteFileById(noteId);
});

// ================================================================
// 编辑文件元数据弹窗
// ================================================================

cancelEditFile.addEventListener('click', () => {
  editFileModal.classList.remove('active');
});

editFileModal.addEventListener('click', (e) => {
  if (e.target === editFileModal) editFileModal.classList.remove('active');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (editFileModal.classList.contains('active')) editFileModal.classList.remove('active');
    if (newFileModal.classList.contains('active')) closeNewFileModal();
  }
});

confirmEditFile.addEventListener('click', async () => {
  // 从 editFileModal 的 dataset 获取目标 noteId
  const targetId = contextFileId || currentFileId;
  if (!targetId) return;

  const newTitle = editFileTitle.value.trim();
  const tagsStr = editFileTags.value.trim();
  const newTags = tagsStr ? tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];

  editFileModal.classList.remove('active');

  try {
    const res = await fetch(`${BACKEND_URL}/api/files/${targetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, tags: newTags }),
    });
    const data = await res.json();
    if (data.status === 'success') {
      showToast('文件信息已更新', 'success');
      // 如果正在编辑这个文件，更新顶部文件名
      if (currentFileId === targetId) {
        currentFileTitle = newTitle;
        currentFileTags = newTags;
        renderEditorFilename(newTitle);
      }
      loadFiles();
    } else {
      showToast(data.message || '更新失败', 'error');
    }
  } catch (error) {
    showToast('更新失败: ' + error.message, 'error');
  }
});

// 按 ID 删除文件（右键菜单和删除按钮共用）
async function deleteFileById(noteId) {
  const confirmed = confirm('确定要删除这个文件吗？此操作不可撤销。');
  if (!confirmed) return;

  try {
    const res = await fetch(`${BACKEND_URL}/api/files/${noteId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.status === 'success') {
      showToast('文件已删除', 'success');
      if (currentFileId === noteId) {
        currentFileId = null;
        isModified = false;
        originalContent = '';
        currentFileTitle = '';
        currentFileTags = [];
        editorPlaceholder.style.display = 'flex';
        editorToolbar.style.display = 'none';
        editorContent.style.display = 'none';
      }
      loadFiles();
    } else {
      showToast(data.message || '删除失败', 'error');
    }
  } catch (error) {
    showToast('删除失败: ' + error.message, 'error');
  }
}

// ================================================================
// 事件绑定
// ================================================================

newFileBtn.addEventListener('click', openNewFileModal);
cancelNewFile.addEventListener('click', closeNewFileModal);
confirmNewFile.addEventListener('click', createNewFile);
saveBtn.addEventListener('click', saveCurrentFile);
deleteBtn.addEventListener('click', () => { if (currentFileId) deleteFileById(currentFileId); });
editViewBtn.addEventListener('click', switchToEditView);
previewViewBtn.addEventListener('click', switchToPreviewView);

// 弹窗 Enter 提交
newFileTitle.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createNewFile();
});
editFileTitle.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmEditFile.click();
});

// 点击弹窗外部关闭
newFileModal.addEventListener('click', (e) => {
  if (e.target === newFileModal) closeNewFileModal();
});
editFileModal.addEventListener('click', (e) => {
  if (e.target === editFileModal) editFileModal.classList.remove('active');
});

// ================================================================
// LLM 配置
// ================================================================

/**
 * 从后端加载当前 LLM 配置并填入表单
 */
async function loadLlmConfig() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/profile`);
    const data = await res.json();
    if (data.llm_config) {
      const c = data.llm_config;
      // API keys are NOT returned by backend for security
      // Only fill non-sensitive fields
      llmBaseUrl.value = c.base_url || '';
      llmVlModel.value = c.vl_model || '';
      llmVlBaseUrl.value = c.vl_base_url || '';
      llmTextModel.value = c.text_model || '';
      llmTextBaseUrl.value = c.text_base_url || '';
      llmApiKey.value = '';
      llmVlApiKey.value = '';
      llmTextApiKey.value = '';
      if (c.configured) {
        showLlmStatus('LLM 已配置（API Key 已隐藏）', 'success');
      } else if (c.text_configured) {
        showLlmStatus('Text 模型已配置（API Key 已隐藏）', 'success');
      } else if (c.vl_configured) {
        showLlmStatus('VL 模型已配置（API Key 已隐藏）', 'success');
      }
    }
  } catch (e) {
    console.error('加载 LLM 配置失败:', e);
  }
}

function showLlmStatus(msg, type) {
  llmStatus.textContent = msg;
  llmStatus.style.display = 'block';
  llmStatus.style.background = type === 'success' ? '#e8f5e9' : type === 'error' ? '#ffebee' : '#f5f5f5';
  llmStatus.style.color = type === 'success' ? '#2e7d32' : type === 'error' ? '#c62828' : '#666';
}

async function saveLlmConfig() {
  const vlApiKey = llmVlApiKey.value.trim();
  const textApiKey = llmTextApiKey.value.trim();
  const apiKey = llmApiKey.value.trim();

  // At least one API key must be provided
  if (!apiKey && !vlApiKey && !textApiKey) {
    showLlmStatus('请至少填写一个 API Key', 'error');
    return;
  }

  const body = {
    api_key: apiKey,
    base_url: llmBaseUrl.value.trim(),
    vl_model: llmVlModel.value.trim(),
    vl_api_key: vlApiKey,
    vl_base_url: llmVlBaseUrl.value.trim(),
    text_model: llmTextModel.value.trim(),
    text_api_key: textApiKey,
    text_base_url: llmTextBaseUrl.value.trim(),
  };

  confirmLlmSettings.disabled = true;
  confirmLlmSettings.textContent = '保存中...';

  try {
    const res = await fetch(`${BACKEND_URL}/api/setup-llm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.status === 'success') {
      showLlmStatus('配置成功！' + (data.vl_ready ? ' VL 就绪' : '') + (data.text_ready ? ' Text 就绪' : ''), 'success');
      showToast('LLM 配置已保存', 'success');
      closeLlmSettings();
    } else {
      showLlmStatus(data.message || '配置失败', 'error');
    }
  } catch (e) {
    showLlmStatus('保存失败: ' + e.message, 'error');
  } finally {
    confirmLlmSettings.disabled = false;
    confirmLlmSettings.textContent = '保存配置';
  }
}

function openLlmSettings() {
  loadLlmConfig();
  llmSettingsModal.classList.add('active');
  setTimeout(() => llmApiKey.focus(), 100);
}

function closeLlmSettings() {
  llmSettingsModal.classList.remove('active');
  llmStatus.style.display = 'none';
}

// ---- LLM 配置事件绑定 ----
llmSettingsBtn.addEventListener('click', openLlmSettings);
cancelLlmSettings.addEventListener('click', closeLlmSettings);
confirmLlmSettings.addEventListener('click', saveLlmConfig);

// 点击弹窗外部关闭
llmSettingsModal.addEventListener('click', (e) => {
  if (e.target === llmSettingsModal) closeLlmSettings();
});

// ESC 关闭 LLM 弹窗
const origEscapeHandler = document.addEventListener('keydown', (e) => {});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && llmSettingsModal.classList.contains('active')) {
    closeLlmSettings();
  }
});

// ================================================================
// 初始化
// ================================================================

loadFiles();
