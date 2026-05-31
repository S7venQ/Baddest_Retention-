/**
 * Baddest_Retention Frontend - 桌宠交互
 */

const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');
const pet = document.querySelector('.pet');

// 收件箱文件夹路径
const inboxDir = path.join(__dirname, '..', '..', 'data', 'inbox');

// 状态：'normal' | 'think' | 'result'
let currentState = 'normal';
let backendReady = false;

// ---- 后端连接状态 ----
const statusBar = document.getElementById('statusBar');

ipcRenderer.on('backend-ready', (_e, health) => {
  backendReady = health && health.status === 'ok';
  if (statusBar) {
    statusBar.textContent = backendReady
      ? (health.llm_ready ? '就绪' : '请配置 LLM')
      : '后端异常';
    if (backendReady) {
      statusBar.classList.add('ready');
      setTimeout(() => { if (statusBar) statusBar.style.display = 'none'; }, 2000);
    }
  }
});

ipcRenderer.on('backend-timeout', () => {
  if (statusBar) {
    statusBar.textContent = '后端启动超时';
    statusBar.style.background = 'rgba(200, 50, 50, 0.8)';
  }
});

// 状态切换函数
function setState(state) {
  if (currentState === state) return;
  currentState = state;

  // 隐藏所有图像
  document.querySelectorAll('.pet img').forEach(img => img.classList.add('hidden'));

  // 显示对应图像
  if (state === 'normal') {
    document.querySelector('.avatar-normal').classList.remove('hidden');
  } else if (state === 'think') {
    document.querySelector('.avatar-think').classList.remove('hidden');
  } else if (state === 'result') {
    document.querySelector('.avatar-result').classList.remove('hidden');
  }

  console.log('state:', state);
}

// 按 Esc 键关闭窗口
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.close();
  }
});

// ---- 透明区域点击穿透 ----
// 猫附近 0.5cm ≈ 20px 以内算猫的点击区域，以外穿透到桌面
const HIT_TOLERANCE = 20;

document.addEventListener('mousemove', (e) => {
  const rect = pet.getBoundingClientRect();
  const over = (
    e.clientX >= rect.left - HIT_TOLERANCE &&
    e.clientX <= rect.right + HIT_TOLERANCE &&
    e.clientY >= rect.top - HIT_TOLERANCE &&
    e.clientY <= rect.bottom + HIT_TOLERANCE
  );
  ipcRenderer.send('set-ignore-mouse-events', !over);
});

// ---- 双击打开知识库窗口 ----
pet.addEventListener('dblclick', (e) => {
  // 防止双击触发拖拽
  isDragging = false;
  ipcRenderer.send('open-chat-window');
});

// ---- 手动窗口拖拽 ----
let isDragging = false;

pet.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (e.target.classList.contains('close-btn')) return;

  isDragging = true;
  ipcRenderer.send('window-drag-start', { screenX: e.screenX, screenY: e.screenY });
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  ipcRenderer.send('window-drag-move', { screenX: e.screenX, screenY: e.screenY });
});

document.addEventListener('mouseup', () => {
  isDragging = false;
});

// ---- 拖拽文件相关事件 ----
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  pet.classList.add('drag-over');
});

document.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null) {
    pet.classList.remove('drag-over');
  }
});

document.addEventListener('drop', async (e) => {
  e.preventDefault();
  pet.classList.remove('drag-over');

  if (!backendReady) {
    if (statusBar) {
      statusBar.textContent = '请等待后端就绪';
      statusBar.style.background = 'rgba(200, 150, 50, 0.8)';
      setTimeout(() => {
        statusBar.textContent = '请等待后端就绪';
        statusBar.style.background = 'rgba(0, 0, 0, 0.6)';
      }, 2000);
    }
    return;
  }

  const file = e.dataTransfer.files[0];
  if (!file) return;

  console.log('file:', file.name);
  console.log('  type:', file.type);
  console.log('  size:', (file.size / 1024).toFixed(2), 'KB');

  // 切换到思考状态
  setState('think');

  try {
    // 同时保存到 inbox 和发送给后端
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 保存到 inbox
    fs.mkdirSync(inboxDir, { recursive: true });
    const destPath = path.join(inboxDir, file.name);
    fs.writeFileSync(destPath, buffer);
    console.log('saved:', destPath);

    // 发送给后端服务器
    const formData = new FormData();
    formData.append('file', new Blob([arrayBuffer], { type: file.type }), file.name);

    const response = await fetch('http://localhost:5000/api/parse', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    console.log('===== 后端解析结果 =====');
    console.log(JSON.stringify(result, null, 2));

    // 如果有 AI 整理结果，自动打开知识库窗口展示
    if (result.ai_organized) {
      // 切换到结果形态
      setState('result');

      // 打开知识库窗口，传入整理结果（触发文件列表刷新）
      ipcRenderer.send('open-chat-window-with-result', result.ai_organized);

      // 10 秒后回到默认状态
      setTimeout(() => {
        setState('normal');
      }, 10000);
    } else {
      // 没有 AI 结果（LLM 未配置或非图片文件），固定等待后回到默认
      setTimeout(() => {
        setState('result');
        setTimeout(() => {
          setState('normal');
        }, 10000);
      }, 5000);
    }

  } catch (error) {
    console.error('error:', error);
    // 后端不可达时，5 秒后回到默认
    setTimeout(() => {
      setState('normal');
    }, 5000);
  }
});
