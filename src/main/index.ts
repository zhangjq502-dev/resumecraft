import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  shell,
  type IpcMainInvokeEvent
} from 'electron'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { is, optimizer } from '@electron-toolkit/utils'
import { parseDocument, type Result } from '../shared/resume'
import { AppearanceStorage } from './appearance-storage'
import { LibraryStorage } from './library-storage'

// 主进程拥有系统能力：窗口、文件系统和打印。渲染页面只能调用 preload 公开的接口。
let mainWindow: BrowserWindow | null = null
let quitting = false
let libraryStorage: LibraryStorage
let appearanceStorage: AppearanceStorage

// 开发环境加载 Vite 地址；安装包内加载编译后的本地 HTML。
const rendererFile = join(__dirname, '../renderer/index.html')
const rendererURL =
  is.dev && process.env.ELECTRON_RENDERER_URL
    ? process.env.ELECTRON_RENDERER_URL
    : pathToFileURL(rendererFile).href

/** 校验窗口、主 frame 和页面地址，拒绝来自其他页面或 iframe 的 IPC 调用。 */
function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame ||
    new URL(event.senderFrame.url).href.split('#')[0] !== new URL(rendererURL).href.split('#')[0]
  ) {
    throw new Error('不受信任的调用来源')
  }
}

/** 统一 IPC 返回格式：页面可以显示错误信息，不依赖 Electron 的异常序列化。 */
function registerHandler<T>(channel: string, action: (value: unknown) => Promise<T>): void {
  ipcMain.handle(channel, async (event, value): Promise<Result<T>> => {
    try {
      assertTrustedSender(event)
      return { ok: true, data: await action(value) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '操作失败，请重试' }
    }
  })
}

/** 生成默认文件名；实际保存路径始终由系统对话框决定。 */
function toSafeFileName(title: string): string {
  return (
    title
      .replace(/[<>:"/\\|?*]/g, '_')
      .trim()
      .slice(0, 80) || '我的简历'
  )
}

/** 必须在 app ready 后注册，因为此时才能读取系统用户数据目录。 */
function registerServices(): void {
  registerHandler('resume:pick-pdf', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '导入 PDF 简历',
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (result.canceled) return null
    const path = result.filePaths[0]
    if ((await stat(path)).size > 10 * 1024 * 1024) throw new Error('请选择不超过 10 MB 的 PDF')
    const bytes = await readFile(path)
    if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-')))
      throw new Error('文件不是有效的 PDF')
    return { name: basename(path), bytes: new Uint8Array(bytes) }
  })
  appearanceStorage = new AppearanceStorage(app.getPath('userData'))
  registerHandler('appearance:load', () => appearanceStorage.load())
  registerHandler('appearance:save', (value) => appearanceStorage.save(value))
  registerHandler('appearance:pick', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择工作区背景',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg'] }]
    })
    if (result.canceled) return null
    const path = result.filePaths[0]
    if ((await stat(path)).size > 12 * 1024 * 1024) throw new Error('请选择不超过 12 MB 的图片')
    const bytes = await readFile(path)
    const isPNG = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const isJPEG = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    if (!isPNG && !isJPEG) throw new Error('仅支持 PNG 或 JPEG 图片')
    const image = nativeImage.createFromBuffer(bytes)
    if (image.isEmpty()) throw new Error('无法读取背景图片')
    const size = image.getSize()
    const scale = Math.min(1, 2048 / Math.max(size.width, size.height))
    const data = image
      .resize({
        width: Math.max(1, Math.round(size.width * scale)),
        height: Math.max(1, Math.round(size.height * scale)),
        quality: 'best'
      })
      .toJPEG(82)
    if (data.length > 1_450_000) throw new Error('处理后的背景仍过大，请选择较小的图片')
    return 'data:image/jpeg;base64,' + data.toString('base64')
  })
  libraryStorage = new LibraryStorage(app.getPath('userData'))
  registerHandler('library:load', () => libraryStorage.load())
  registerHandler('library:save', (value) => libraryStorage.save(value))

  // 头像仅从用户选中的本地 PNG/JPEG 读取，解码后重新编码，避免嵌入任意文件内容。
  registerHandler('resume:avatar', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择简历头像',
      properties: ['openFile'],
      filters: [{ name: 'PNG / JPEG 图片', extensions: ['png', 'jpg', 'jpeg'] }]
    })
    if (result.canceled) return null
    const path = result.filePaths[0]
    if ((await stat(path)).size > 5 * 1024 * 1024) throw new Error('请选择不超过 5 MB 的图片')
    const bytes = await readFile(path)
    const isPNG = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const isJPEG = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    if (!isPNG && !isJPEG) throw new Error('仅支持真实的 PNG 或 JPEG 图片')
    const image = nativeImage.createFromBuffer(bytes)
    if (image.isEmpty()) throw new Error('图片无法读取，请更换图片')
    const size = image.getSize()
    const ratio = Math.min(1, 360 / Math.max(size.width, size.height))
    const normalized = image
      .resize({
        width: Math.max(1, Math.round(size.width * ratio)),
        height: Math.max(1, Math.round(size.height * ratio)),
        quality: 'best'
      })
      .toPNG()
    if (normalized.length > 280_000) throw new Error('图片处理后仍过大，请选择更简单的头像')
    return 'data:image/png;base64,' + normalized.toString('base64')
  })

  // 3. 导入备份：先限制文件大小，再解析 JSON 和验证字段。
  registerHandler('resume:open', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '打开简历备份',
      properties: ['openFile'],
      filters: [{ name: 'ResumeCraft JSON', extensions: ['json'] }]
    })
    if (result.canceled) return null
    const file = result.filePaths[0]
    if ((await stat(file)).size > 2_000_000) throw new Error('文件过大，请选择小于 2 MB 的简历文件')
    return parseDocument(JSON.parse(await readFile(file, 'utf8')))
  })

  // 4. 手动备份与自动草稿独立，便于用户迁移和保留版本。
  registerHandler('resume:save', async (value) => {
    const document = parseDocument(value)
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: '备份简历',
      defaultPath: toSafeFileName(document.title) + '.json',
      filters: [{ name: 'ResumeCraft JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, JSON.stringify(document, null, 2), 'utf8')
    return result.filePath
  })

  // 5. PDF 导出：一次仅执行一项打印任务，取消或失败也必须释放锁。
  let exporting = false
  registerHandler('resume:preview-pdf', async () => new Uint8Array(await renderPDF()))
  registerHandler('resume:pdf', async (value) => {
    if (typeof value !== 'string' || value.length > 100) throw new Error('无效的文件名')
    if (exporting) throw new Error('正在导出，请稍候')
    exporting = true
    try {
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: '导出 PDF',
        defaultPath: toSafeFileName(value) + '.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (result.canceled || !result.filePath) return null
      const data = await renderPDF()
      await writeFile(result.filePath, data)
      return result.filePath
    } finally {
      exporting = false
    }
  })
}

/** 预览与导出共用 Chromium 分页；串行执行，避免同时打印同一窗口。 */
let pdfQueue: Promise<unknown> = Promise.resolve()
function renderPDF(): Promise<Buffer> {
  const task = pdfQueue
    .catch(() => undefined)
    .then(async () => {
      const contents = mainWindow!.webContents
      await contents.executeJavaScript(
        `document.fonts.ready.then(() => Promise.all(Array.from(document.querySelectorAll('#resume-paper img')).map(image => image.decode()))).then(() => true)`
      )
      // 只复制已渲染正文和同源样式。独立窗口打印，避免主窗口切换打印媒体后重置滚动/焦点。
      const snapshot: { html: string; css: string } = await contents.executeJavaScript(`({
        html: document.querySelector('#resume-paper').outerHTML,
        css: Array.from(document.styleSheets).map(sheet => Array.from(sheet.cssRules).map(rule => rule.cssText).join('\\n')).join('\\n')
      })`)
      const printer = new BrowserWindow({
        show: false,
        width: 794,
        height: 1123,
        backgroundColor: '#ffffff',
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false
        }
      })
      printer.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      printer.webContents.on('will-navigate', (event) => event.preventDefault())
      try {
        const html = `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><style>${snapshot.css}</style></head><body>${snapshot.html}</body></html>`
        await printer.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
        await printer.webContents.executeJavaScript(
          `document.fonts.ready.then(() => Promise.all(Array.from(document.images).map(image => image.decode()))).then(() => true)`
        )
        return await printer.webContents.printToPDF({
          pageSize: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: false,
          scale: 1,
          margins: { top: 0, bottom: 0, left: 0, right: 0 }
        })
      } finally {
        printer.destroy()
      }
    })
  pdfQueue = task
  return task
}

/** 创建窗口，并集中配置页面隔离、导航限制和系统权限。 */
function createWindow(): void {
  const win = new BrowserWindow({
    title: 'ResumeCraft',
    icon: join(__dirname, '../../resources/icon.png'),
    width: 1440,
    height: 960,
    minWidth: 940,
    minHeight: 650,
    show: false,
    autoHideMenuBar: true,
    // Chromium 打印页边距会使用窗口底色，必须为白色。
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 页面没有 Node.js 权限；preload 在隔离环境中提供有限接口。
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  })
  mainWindow = win
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.on('will-attach-webview', (event) => event.preventDefault())
  // 外链交给系统浏览器，仅允许明确的协议，不在应用窗口加载外部页面。
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (['https:', 'http:', 'mailto:'].includes(new URL(url).protocol)) {
        void shell.openExternal(url).catch(console.error)
      }
    } catch {
      // 地址解析失败时保持拒绝打开。
    }
    return { action: 'deny' }
  })
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  )
  win.webContents.session.setPermissionCheckHandler(() => false)
  if (is.dev && process.env.ELECTRON_RENDERER_URL) void win.loadURL(rendererURL)
  else void win.loadFile(rendererFile)
}

// 生命周期：注册服务 → 创建窗口；macOS 点击 Dock 图标时可以重建窗口。
app.whenReady().then(() => {
  // 开发时 Dock 也使用品牌图标；正式安装包使用 ICNS。
  if (process.platform === 'darwin' && is.dev) {
    app.dock?.setIcon(join(__dirname, '../../resources/icon.png'))
  }
  app.setAppUserModelId('com.resumecraft.app')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  registerServices()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 等待已提交的草稿写入后再退出；quitting 防止 app.quit() 再次触发等待。
app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  void Promise.all([libraryStorage?.drain(), appearanceStorage?.drain()])
    .catch(console.error)
    .then(() => app.quit())
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
