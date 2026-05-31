const { app, BrowserWindow, ipcMain } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const http = require('http')

/** @type {BrowserWindow} */
let win
/** @type {BrowserWindow} */
let chatWin
let backendProcess = null

/**
 * 启动后端服务
 * 打包模式：优先使用打包的 backend.exe（extraResources）
 * 开发模式：回退到 PATH 中的 python 解释器
 */
function startBackend() {
  // 打包模式：backend.exe 与 resources 目录同级
  const packedExe = path.join(process.resourcesPath, 'backend.exe')

  if (fs.existsSync(packedExe)) {
    console.log(`[Baddest_Retention] 启动打包后端: ${packedExe}`)
    backendProcess = spawn(packedExe, [], {
      stdio: 'pipe',
    })
    backendProcess.stdout.on('data', (d) => process.stdout.write(`[后端] ${d}`))
    backendProcess.stderr.on('data', (d) => process.stderr.write(`[后端] ${d}`))
    backendProcess.on('exit', (code) => {
      console.log(`[Baddest_Retention] 后端退出，退出码 ${code}`)
    })
    return
  }

  // 开发模式：用系统 Python
  const backendDir = path.join(__dirname, '..', '..', 'backend')
  const appPy = path.join(backendDir, 'app.py')
  const pythons = ['python', 'python3']

  function tryPython(index) {
    if (index >= pythons.length) {
      console.log('[Baddest_Retention] 未找到可用的 Python，请手动启动后端')
      return
    }
    const python = pythons[index]
    console.log(`[Baddest_Retention] 尝试启动后端: ${python} ${appPy}`)
    backendProcess = spawn(python, [appPy], {
      cwd: backendDir,
      stdio: 'pipe',
    })
    backendProcess.stdout.on('data', (d) => process.stdout.write(`[后端] ${d}`))
    backendProcess.stderr.on('data', (d) => process.stderr.write(`[后端] ${d}`))
    backendProcess.on('error', () => tryPython(index + 1))
    backendProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.log(`[Baddest_Retention] ${python} 退出码 ${code}，尝试下一个...`)
        tryPython(index + 1)
      }
    })
  }
  tryPython(0)
}

/**
 * 停止后端
 */
function stopBackend() {
  if (backendProcess) {
    backendProcess.kill()
    backendProcess = null
  }
}

/**
 * 等待后端就绪（轮询 /api/health，最长等 15 秒）
 */
function waitForBackend(retries = 60) {
  return new Promise((resolve) => {
    let count = 0
    function check() {
      const req = http.get('http://localhost:5000/api/health', (res) => {
        let body = ''
        res.on('data', (chunk) => body += chunk)
        res.on('end', () => {
          try {
            const data = JSON.parse(body)
            console.log(`[Baddest_Retention] 后端就绪 (llm_ready=${data.llm_ready})`)
            resolve(data)
          } catch (_) {
            retry()
          }
        })
      })
      req.on('error', retry)
      req.setTimeout(15000, () => { req.destroy(); retry() })
    }
    function retry() {
      count++
      if (count >= retries) {
        console.log('[Baddest_Retention] 后端启动超时')
        resolve(null)
      } else {
        setTimeout(check, 500)
      }
    }
    check()
  })
}

/**
 * 创建并配置主窗口（桌宠）
 */
function createWindow() {
  win = new BrowserWindow({
    width: 560,
    height: 640,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  win.loadFile('index.html')
  win.setIgnoreMouseEvents(true, { forward: true })

  // 桌宠窗口关闭 → 强制杀后端并退出应用
  win.on('close', () => {
    stopBackend()
    app.quit()
  })
}

/**
 * 创建知识库窗口（双击桌宠弹出）
 * 改造：900×600、不透明、可调大小、标题 "Baddest_Retention 知识库"
 */
function createChatWindow() {
  // 如果知识库窗口已存在，聚焦它
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.focus()
    return
  }

  chatWin = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 700,
    minHeight: 450,
    frame: true,
    transparent: false,
    alwaysOnTop: false,
    resizable: true,
    skipTaskbar: false,
    title: 'Baddest Retention 最野留存',
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  chatWin.loadFile('chat.html')

  // 知识库窗口关闭时清空引用
  chatWin.on('closed', () => {
    chatWin = null
  })
}

// ---- 手动窗口拖拽 ----
let winStartX, winStartY, mouseStartX, mouseStartY

ipcMain.on('window-drag-start', (_e, pos) => {
  const [x, y] = win.getPosition()
  winStartX = x
  winStartY = y
  mouseStartX = pos.screenX
  mouseStartY = pos.screenY
})

ipcMain.on('window-drag-move', (_e, pos) => {
  const dx = pos.screenX - mouseStartX
  const dy = pos.screenY - mouseStartY
  win.setPosition(winStartX + dx, winStartY + dy)
})

// ---- 透明区域点击穿透 ----
ipcMain.on('set-ignore-mouse-events', (_e, ignore) => {
  win.setIgnoreMouseEvents(ignore, { forward: true })
})

// ---- 双击桌宠打开知识库窗口 ----
ipcMain.on('open-chat-window', () => {
  createChatWindow()
})

// ---- 拖拽后带结果打开知识库窗口 ----
ipcMain.on('open-chat-window-with-result', (_e, aiResult) => {
  createChatWindow()
  // 知识库窗口加载完成后，把整理结果发过去（触发文件列表刷新）
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.webContents.on('did-finish-load', () => {
      chatWin.webContents.send('show-organized-result', aiResult)
    })
    // 如果已经加载完了，直接发
    if (!chatWin.webContents.isLoading()) {
      chatWin.webContents.send('show-organized-result', aiResult)
    }
  }
})

/**
 * Electron 应用生命周期
 */
app.whenReady().then(async () => {
  // 自动启动后端
  startBackend()

  createWindow()

  // 等待后端就绪
  const health = await waitForBackend()

  // 后端就绪后，通知前端
  if (win && !win.isDestroyed()) {
    if (health) {
      win.webContents.send('backend-ready', health)
      // 首次启动（LLM 未配置）：自动打开知识库窗口引导用户
      if (!health.llm_ready) {
        createChatWindow()
      }
    } else {
      win.webContents.send('backend-timeout')
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopBackend()
    app.quit()
  }
})

app.on('before-quit', () => {
  stopBackend()
})
