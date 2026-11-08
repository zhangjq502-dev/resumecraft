const { app, BrowserWindow, dialog, nativeImage } = require('electron')
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const assert = require('node:assert/strict')
const folder = mkdtempSync(join(tmpdir(), 'resumecraft-smoke-'))
app.setPath('userData', folder)
require(process.env.RESUME_SMOKE_MAIN || '../out/main/index.js')
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return
    await pause(100)
  }
  throw new Error('Timed out')
}
app
  .whenReady()
  .then(async () => {
    await until(() => BrowserWindow.getAllWindows().length)
    const win = BrowserWindow.getAllWindows()[0]
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error') console.error('Renderer:', event.message)
    })
    const js = async (s) => {
      try {
        return await win.webContents.executeJavaScript(s)
      } catch (error) {
        console.error('Failed renderer script:', s.slice(0, 180))
        throw error
      }
    }
    await until(
      async () =>
        !win.webContents.isLoading() &&
        (await js(
          "!!Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Markdown' && !button.disabled)"
        ))
    )
    await js(
      "Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Markdown').click()"
    )
    assert.equal(await js('typeof window.require'), 'undefined')
    assert.equal(await js('typeof window.electron'), 'undefined')
    assert.equal(await js('typeof window.resume.save'), 'function')
    assert.ok(await js("document.querySelector('#resume-paper').textContent.includes('张同学')"))
    // Exercise the actual library and history controls, not just the store functions.
    const click = (text) =>
      js(
        `Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(text)}).click()`
      )
    const edit = (text) =>
      js(
        `(() => { const textarea = document.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, ${JSON.stringify(text)}); textarea.dispatchEvent(new Event('input', {bubbles:true})); })()`
      )
    const originalText = await js("document.querySelector('textarea').value")
    await js(
      "Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('版本历史')).click()"
    )
    await click('保存当前版本')
    await until(() =>
      js('document.querySelector(\'[aria-label="选择历史版本"]\').options.length === 1')
    )
    await edit('# 第二稿\n\n需要恢复的内容')
    await until(() =>
      js("document.querySelector('[aria-label=\"版本内容差异\"]').textContent.includes('第二稿')")
    )
    await js('void (window.confirm = () => true)')
    await click('恢复版本')
    await until(async () => (await js("document.querySelector('textarea').value")) === originalText)
    await until(() =>
      js('document.querySelector(\'[aria-label="选择历史版本"]\').options.length === 2')
    )
    const originalId = await js('document.querySelector(\'[aria-label="切换简历"]\').value')
    await click('复制')
    await until(() =>
      js('document.querySelector(\'[aria-label="切换简历"]\').options.length === 2')
    )
    await edit('# 副本独立内容')
    await until(() =>
      js("document.querySelector('#resume-paper').textContent.includes('副本独立内容')")
    )
    await js(
      `(() => { const select=document.querySelector('[aria-label="切换简历"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select, ${JSON.stringify(originalId)}); select.dispatchEvent(new Event('change',{bubbles:true})); })()`
    )
    await until(async () => (await js("document.querySelector('textarea').value")) === originalText)
    await click('新建')
    await until(() =>
      js('document.querySelector(\'[aria-label="切换简历"]\').options.length === 3')
    )
    await click('删除')
    await until(() =>
      js('document.querySelector(\'[aria-label="切换简历"]\').options.length === 2')
    )
    const bad = await js('window.resume.saveLibrary({version: 99})')
    assert.equal(bad.ok, false)
    await js(
      `(() => { const t=document.querySelector('textarea'); const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; set.call(t,'# 测试姓名\\n\\n## 测试经历\\n- 本地简历测试\\n\\n<script>alert(1)</script>\\n\\n![remote](https://example.com/a.png)\\n\\n[unsafe](javascript:alert(1))'); t.dispatchEvent(new Event('input',{bubbles:true})); })()`
    )
    await until(() =>
      js("document.querySelector('#resume-paper').textContent.includes('测试姓名')")
    )
    await until(() =>
      js("document.querySelector('[role=status]').textContent.includes('已保存到本机')")
    )
    const savedLibrary = JSON.parse(readFileSync(join(folder, 'library.json'), 'utf8'))
    const draft = savedLibrary.entries.find((entry) => entry.id === savedLibrary.activeId).document
    assert.ok(draft.markdown.includes('测试姓名'))
    assert.equal(
      await js("document.querySelector('#resume-paper script, #resume-paper img') === null"),
      true
    )
    assert.equal(
      await js(
        "Array.from(document.querySelectorAll('#resume-paper a')).some(a => a.href.startsWith('javascript:'))"
      ),
      false
    )
    await js(
      "Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('清新绿')).click()"
    )
    await until(() =>
      js(
        "getComputedStyle(document.querySelector('#resume-paper')).getPropertyValue('--accent').trim()==='#0e766e'"
      )
    )
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: join(folder, 'backup.json') })
    assert.equal((await js('window.resume.save(' + JSON.stringify(draft) + ')')).ok, true)
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [join(folder, 'backup.json')]
    })
    const reopened = await js('window.resume.open()')
    assert.deepEqual(reopened.data, draft)
    writeFileSync(join(folder, 'invalid.json'), '{invalid')
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [join(folder, 'invalid.json')]
    })
    assert.equal((await js('window.resume.open()')).ok, false)
    // Use an actual PNG fixture to cover native decoding and the UI, not just base64 schema.
    const avatarPath = join(folder, 'avatar.png')
    writeFileSync(
      avatarPath,
      nativeImage
        .createFromBitmap(Buffer.alloc(80 * 100 * 4, 180), { width: 80, height: 100 })
        .toPNG()
    )
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })
    assert.equal((await js('window.resume.pickAvatar()')).data, null)
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [join(folder, 'invalid.json')]
    })
    assert.equal((await js('window.resume.pickAvatar()')).ok, false)
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [avatarPath] })
    await js("void (document.querySelector('details').open = true)")
    await click('选择头像')
    await until(() =>
      js(
        "!!document.querySelector('#resume-paper img') && document.querySelector('#resume-paper img').naturalWidth > 0"
      )
    )
    await click('保存当前版本')
    await click('移除头像')
    await until(() => js("document.querySelector('#resume-paper img') === null"))
    await click('恢复版本')
    await until(() =>
      js(
        "!!document.querySelector('#resume-paper img') && document.querySelector('#resume-paper img').naturalWidth > 0"
      )
    )
    await until(() =>
      js("document.querySelector('[role=status]').textContent.includes('已保存到本机')")
    )
    await until(async () => {
      const result = await js('window.resume.loadLibrary()')
      return !!result.data?.entries.find((entry) => entry.id === result.data.activeId).document
        .avatar
    })
    const withAvatar = await js('window.resume.loadLibrary()')
    const activeWithAvatar = withAvatar.data.entries.find(
      (entry) => entry.id === withAvatar.data.activeId
    ).document
    assert.ok(activeWithAvatar.avatar.dataUrl.startsWith('data:image/png;base64,'))
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: join(folder, 'avatar-backup.json')
    })
    assert.equal(
      (await js('window.resume.save(' + JSON.stringify(activeWithAvatar) + ')')).ok,
      true
    )
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [join(folder, 'avatar-backup.json')]
    })
    assert.deepEqual((await js('window.resume.open()')).data.avatar, activeWithAvatar.avatar)
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: join(folder, 'resume.pdf') })
    await js('document.fonts.ready.then(()=>true)')
    const pdfResult = await js("window.resume.exportPDF('测试简历')")
    assert.equal(pdfResult.ok, true, JSON.stringify(pdfResult))
    const pdf = readFileSync(join(folder, 'resume.pdf'))
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
    assert.ok(pdf.toString('latin1').includes('/Subtype /Image'), 'PDF must embed avatar image')
    const box = pdf.toString('latin1').match(/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)/)
    assert.ok(
      box && Math.abs(Number(box[1]) - 595.28) < 1 && Math.abs(Number(box[2]) - 841.89) < 1,
      'Expected A4 page size'
    )
    // Verify pagination with genuinely long content using the same renderer and print CSS.
    await js(
      `(() => { const t=document.querySelector('textarea'); const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; set.call(t, '# 多页测试\\n\\n' + Array.from({length:65},(_,i)=>'### 项目 '+i+'\\n- 这是一段用于验证分页的中文经历描述。\\n').join('\\n')); t.dispatchEvent(new Event('input',{bubbles:true})); })()`
    )
    await until(() => js("document.querySelectorAll('#resume-paper h3').length===65"))
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: join(folder, 'multipage.pdf')
    })
    assert.equal((await js("window.resume.exportPDF('多页')")).ok, true)
    const multi = readFileSync(join(folder, 'multipage.pdf')).toString('latin1')
    assert.ok((multi.match(/\/Type \/Page\b/g) || []).length > 1)
    await until(() =>
      js(
        "document.querySelectorAll('[data-pdf-pages] canvas').length > 1 && !document.querySelector('[data-pdf-pages] [role=status]')"
      )
    )
    assert.deepEqual(
      await js(
        "Array.from(document.querySelector('[data-pdf-pages] canvas').getContext('2d').getImageData(5,5,1,1).data)"
      ),
      [255, 255, 255, 255],
      'PDF page margins must be white, not the window background'
    )
    const pageCount = await js("document.querySelectorAll('[data-pdf-pages] canvas').length")
    assert.equal(
      pageCount,
      (multi.match(/\/Type \/Page\b/g) || []).length,
      'Preview and exported PDF must have identical page counts'
    )
    writeFileSync(join(folder, 'a4-pages.png'), (await win.webContents.capturePage()).toPNG())
    // Reset to sample for a readable visual capture.
    await js(
      "window.confirm = () => true; Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('载入示例')).click()"
    )
    await until(() => js("document.querySelector('#resume-paper').textContent.includes('张同学')"))
    await click('模块表单')
    await click('开始模块配置')
    const toggle = (title) => js(`document.querySelector('[aria-label="显示${title}"]').click()`)
    const fill = (label, text) =>
      js(
        `(() => {const input=document.querySelector('[aria-label="${label}"]'); Object.getOwnPropertyDescriptor(input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(input, ${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`
      )
    await toggle('原有内容')
    await click('基本信息')
    await toggle('基本信息')
    await fill('基本信息-姓名-1', '表单测试姓名')
    await until(() =>
      js("document.querySelector('#resume-paper').textContent.includes('表单测试姓名')")
    )
    await click('教育背景')
    await toggle('教育背景')
    await fill('教育背景-学校名称-1', '模块测试大学')
    await click('＋ 添加教育背景条目')
    await fill('教育背景-学校名称-2', '第二所大学')
    await until(() =>
      js("document.querySelector('#resume-paper').textContent.includes('第二所大学')")
    )
    await toggle('教育背景')
    await until(() =>
      js("!document.querySelector('#resume-paper').textContent.includes('模块测试大学')")
    )
    assert.equal(
      await js('document.querySelector(\'[aria-label="教育背景-学校名称-1"]\').value'),
      '模块测试大学'
    )
    await toggle('教育背景')
    await click('模块上移')
    await click('Markdown')
    await edit('# 自由编辑内容必须保留')
    await until(() =>
      js("document.querySelector('#resume-paper').textContent.includes('自由编辑内容必须保留')")
    )
    await click('模块表单')
    await until(() =>
      js("document.querySelector('#resume-paper').textContent.includes('表单测试姓名')")
    )
    await until(async () => {
      const result = await js('window.resume.loadLibrary()')
      const entry = result.data.entries.find((entry) => entry.id === result.data.activeId)
      return (
        entry.document.form &&
        entry.snapshots.some((snapshot) =>
          snapshot.document.markdown.includes('自由编辑内容必须保留')
        )
      )
    })
    const formLibrary = await js('window.resume.loadLibrary()')
    const formDoc = formLibrary.data.entries.find(
      (entry) => entry.id === formLibrary.data.activeId
    ).document
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: join(folder, 'form-backup.json')
    })
    assert.equal((await js('window.resume.save(' + JSON.stringify(formDoc) + ')')).ok, true)
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [join(folder, 'form-backup.json')]
    })
    assert.deepEqual((await js('window.resume.open()')).data.form, formDoc.form)
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: join(folder, 'form.pdf') })
    assert.equal((await js("window.resume.exportPDF('表单简历')")).ok, true)
    // Import the real Chinese PDF generated above, review, edit, and export it again.
    const countBeforeImport = await js(
      'document.querySelector(\'[aria-label="切换简历"]\').options.length'
    )
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })
    await click('导入 PDF')
    await pause(100)
    assert.equal(await js('!!document.querySelector("dialog[open]")'), false)
    const originalPDF = readFileSync(join(folder, 'form.pdf'))
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [join(folder, 'form.pdf')] })
    await click('导入 PDF')
    await until(() => js('!!document.querySelector("dialog[open]")'))
    assert.ok(
      await js(
        "document.querySelector('[aria-label=\"PDF 提取内容\"]').value.includes('表单测试姓名')"
      )
    )
    await click('取消导入')
    assert.equal(
      await js('document.querySelector(\'[aria-label="切换简历"]\').options.length'),
      countBeforeImport
    )
    await click('导入 PDF')
    await until(() => js('!!document.querySelector("dialog[open]")'))
    await fill('PDF 提取内容', '# PDF 导入后修改\n\n## 项目经历\n- 已完成导入编辑测试')
    await click('创建简历')
    await until(() =>
      js("document.querySelector('#resume-paper').textContent.includes('PDF 导入后修改')")
    )
    assert.equal(
      await js('document.querySelector(\'[aria-label="切换简历"]\').options.length'),
      countBeforeImport + 1
    )
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: join(folder, 'imported-edited.pdf')
    })
    assert.equal((await js("window.resume.exportPDF('导入后修改')")).ok, true)
    assert.ok(
      readFileSync(join(folder, 'form.pdf')).equals(originalPDF),
      'Import must leave the source PDF unchanged'
    )
    await click('删除')
    // Create an image-only PDF. It must report missing text/OCR rather than create an empty resume.
    const imageWindow = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
    })
    await imageWindow.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          '<!doctype html><img src="' +
            activeWithAvatar.avatar.dataUrl +
            '" width="100" height="120">'
        )
    )
    await imageWindow.webContents.executeJavaScript(
      'document.querySelector("img").decode().then(()=>true)'
    )
    writeFileSync(
      join(folder, 'scanned.pdf'),
      await imageWindow.webContents.printToPDF({ pageSize: 'A4' })
    )
    imageWindow.destroy()
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [join(folder, 'scanned.pdf')]
    })
    await click('导入 PDF')
    await until(() => js("document.querySelector('[role=alert]')?.textContent.includes('OCR')"))
    assert.equal(
      await js('document.querySelector(\'[aria-label="切换简历"]\').options.length'),
      countBeforeImport
    )
    await click('关闭提示')
    await click('模块表单')
    await until(() => js('!!document.querySelector(\'[aria-label="基本信息-姓名-1"]\')'))
    // A compact window must keep the workspace inside the viewport.
    win.setSize(1024, 760)
    await pause(150)
    assert.ok(await js('document.body.scrollWidth <= window.innerWidth + 1'))
    win.setSize(1440, 960)
    // Use clearly fictional sample data for a readable visual review.
    await js(
      "Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('版本历史')).click(); void (document.querySelector('details').open = false)"
    )
    await click('基本信息')
    await click('更多信息')
    assert.ok(await js('!!document.querySelector(\'[aria-label="基本信息-出生年月（选填）-1"]\')'))
    await click('收起更多信息')
    await fill('基本信息-姓名-1', '陈同学')
    await fill('基本信息-联系电话-1', '138 0000 0000')
    await fill('基本信息-联系邮箱-1', 'hello@example.com')
    await fill('基本信息-所在城市-1', '上海')
    await click('教育背景')
    await fill('教育背景-学校名称-1', '示例大学')
    await fill('教育背景-学校名称-2', '')
    await fill('教育背景-专业-1', '计算机科学与技术')
    await fill('教育背景-学历-1', '本科')
    await fill('教育背景-起止时间-1', '2022.09 — 2026.06')
    await fill('教育背景-详细描述-1', '- 主修数据结构、计算机网络、操作系统与软件工程。')
    await click('项目经历')
    await toggle('项目经历')
    await fill('项目经历-项目名称-1', 'ResumeCraft')
    await fill('项目经历-担任角色-1', '个人项目')
    await fill('项目经历-技术栈-1', 'Electron / React / TypeScript / Zustand')
    await fill(
      '项目经历-详细描述-1',
      '- 设计模块表单与 Markdown 编辑流程，支持实时预览和 A4 PDF 导出。\n- 实现多份简历管理、版本快照和本地数据持久化。\n- 通过类型校验、集成测试验证备份与恢复流程。'
    )
    await click('基本信息')
    await until(() =>
      js(
        "document.querySelector('#resume-paper').textContent.includes('陈同学') && document.querySelector('#resume-paper').textContent.includes('个人项目')"
      )
    )
    await pause(100)
    await js(
      "void (Array.from(document.querySelectorAll('summary')).find(summary=>summary.textContent==='工作区背景').parentElement.open=true)"
    )
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [avatarPath] })
    await click('选择背景图片')
    await until(() =>
      js(
        "Array.from(document.querySelectorAll('div')).some(element=>element.style.backgroundImage.includes('data:image/jpeg'))"
      )
    )
    await js(
      `(()=>{const range=document.querySelector('[aria-label="背景遮罩"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(range,'0.65');range.dispatchEvent(new Event('input',{bubbles:true}));})()`
    )
    await until(async () => {
      const settings = await js('window.resume.loadAppearance()')
      return settings.ok && settings.data.overlay === 0.65 && !!settings.data.background
    })
    assert.equal(
      (
        await js(
          'window.resume.saveAppearance({version:1,background:"https://example.com/photo.jpg",overlay:.5})'
        )
      ).ok,
      false
    )
    // Form document has no avatar, so any PDF image would leak the editor background.
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: join(folder, 'no-workspace-background.pdf')
    })
    assert.equal((await js("window.resume.exportPDF('不含工作区背景')")).ok, true)
    assert.ok(
      !readFileSync(join(folder, 'no-workspace-background.pdf'))
        .toString('latin1')
        .includes('/Subtype /Image'),
      'Workspace background must not be printed'
    )
    await click('恢复默认背景')
    await until(async () => {
      const settings = await js('window.resume.loadAppearance()')
      return settings.ok && settings.data.background === null
    })
    assert.equal(
      await js(
        "Array.from(document.querySelectorAll('div')).some(element=>element.style.backgroundImage.includes('data:image/jpeg'))"
      ),
      false
    )
    // Template selection must preserve content. Every template must still print.
    const beforeTemplateText = await js("document.querySelector('#resume-paper').textContent")
    for (const name of ['经典单栏', '分栏章节', '简约居中', '紧凑专业']) {
      await click('选择模板')
      await until(() => js('!!document.querySelector("dialog[open]")'))
      await js(`document.querySelector('[aria-label="应用${name}"]').click()`)
      await until(() => js('!document.querySelector("dialog[open]")'))
      assert.equal(
        await js("document.querySelector('#resume-paper').textContent"),
        beforeTemplateText
      )
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: join(folder, 'template-' + name + '.pdf')
      })
      assert.equal((await js('window.resume.exportPDF(' + JSON.stringify(name) + ')')).ok, true)
    }
    await js('document.querySelector(\'#resume-paper [data-field="name"] [role=button]\').click()')
    await until(() => js('!!document.querySelector(\'[aria-label="编辑姓名"]\')'))
    for (const text of ['周', '周同', '周同学']) {
      await fill('编辑姓名', text)
      await until(() =>
        js('document.querySelector(\'[aria-label="编辑姓名"]\').value===' + JSON.stringify(text))
      )
    }
    await js('document.querySelector(\'[aria-label="编辑姓名"]\').blur()')
    await until(() =>
      js("document.querySelector('[aria-label=\"基本信息-姓名-1\"]').value==='周同学'")
    )
    await js(
      'document.querySelector(\'#resume-paper [data-field="school"] [role=button]\').click()'
    )
    await until(() => js('!!document.querySelector(\'[aria-label="编辑学校名称"]\')'))
    await fill('编辑学校名称', '纸面编辑大学')
    await js('document.querySelector(\'[aria-label="编辑学校名称"]\').blur()')
    await until(() =>
      js("document.querySelector('#resume-paper').textContent.includes('纸面编辑大学')")
    )
    await until(async () => {
      const result = await js('window.resume.loadLibrary()')
      return result.data.entries
        .find((entry) => entry.id === result.data.activeId)
        .document.markdown.includes('纸面编辑大学')
    })
    const countBeforeTemplate = await js(
      'document.querySelector(\'[aria-label="切换简历"]\').options.length'
    )
    await click('选择模板')
    await js('document.querySelector(\'[aria-label="新建经典单栏"]\').click()')
    await until(() =>
      js("document.querySelector('#resume-paper').textContent.includes('你的姓名')")
    )
    assert.equal(
      await js('document.querySelector(\'[aria-label="切换简历"]\').options.length'),
      countBeforeTemplate + 1
    )
    await click('删除')
    await until(() => js("document.querySelector('#resume-paper').textContent.includes('周同学')"))
    // Reproduce the reported old import: all text lives inside the legacy custom section.
    const legacySource =
      '# 李同学\n求职意向：前端开发工程师 | 一周内到岗\n13912345678 | li@example.com\n\n## 教育背景\n示例大学 - 软件工程 - 本科 2018.09 — 2022.06\n- 主修数据结构与软件工程。\n\n## 工作经历\n示例科技有限公司 — 前端工程师 2023.03 — 2026.08\n- 负责业务模块开发。\n\n## 项目经历\n示例管理平台 — 前端开发 2024.01 — 至今\n技术栈：React / TypeScript\n- 实现页面与接口联调。'
    const latestLibrary = await js('window.resume.loadLibrary()')
    const activeEntry = latestLibrary.data.entries.find(
      (entry) => entry.id === latestLibrary.data.activeId
    )
    const legacyForm = structuredClone(activeEntry.document.form)
    for (const section of legacyForm.sections) section.enabled = false
    let legacySection = legacyForm.sections.find(
      (section) => section.kind === 'custom' && section.title === '原有内容'
    )
    if (!legacySection) {
      legacySection = {
        id: 'legacy-import-section',
        kind: 'custom',
        title: '原有内容',
        enabled: true,
        items: []
      }
      legacyForm.sections.push(legacySection)
    }
    legacySection.enabled = true
    legacySection.items = [{ id: 'legacy-import-text', values: { details: legacySource } }]
    const legacyDocument = {
      ...activeEntry.document,
      title: '旧 PDF 导入样例',
      markdown: legacySource,
      form: legacyForm,
      editorMode: 'form'
    }
    writeFileSync(join(folder, 'legacy-form.json'), JSON.stringify(legacyDocument))
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [join(folder, 'legacy-form.json')]
    })
    await click('打开备份')
    await until(() =>
      js(
        "document.querySelector('[aria-label=\"切换简历\"]').selectedOptions[0].textContent==='旧 PDF 导入样例'"
      )
    )
    await click('模块表单')
    await click('识别为表单（新建副本）')
    await until(() =>
      js("document.querySelector('[aria-label=\"基本信息-姓名-1\"]').value==='李同学'")
    )
    await click('工作经历')
    assert.equal(
      await js('document.querySelector(\'[aria-label="工作经历-公司名称-1"]\').value'),
      '示例科技有限公司'
    )
    assert.equal(
      await js('document.querySelector(\'[aria-label="工作经历-职位-1"]\').value'),
      '前端工程师'
    )
    await fill('工作经历-公司名称-1', '修改后的示例公司')
    await until(() =>
      js("document.querySelector('#resume-paper').textContent.includes('修改后的示例公司')")
    )
    const titleBox = await js(
      "(()=>{const row=document.querySelector('#resume-paper [data-section=work] h3');const date=document.querySelector('#resume-paper [data-section=work] [data-field=period]'); return {title:row.getBoundingClientRect().x,date:date.getBoundingClientRect().x}})()"
    )
    assert.ok(titleBox.date > titleBox.title, 'Experience date should align to the right')
    await click('基本信息')
    await js(
      "void (Array.from(document.querySelectorAll('summary')).find(summary=>summary.textContent==='显示字段').parentElement.open=true)"
    )
    await js('document.querySelector(\'[aria-label="显示字段-phone"]\').click()')
    await until(() =>
      js(
        "!document.querySelector('[aria-label=\"基本信息-联系电话-1\"]') && !document.querySelector('#resume-paper').textContent.includes('13912345678')"
      )
    )
    await until(async () => {
      const result = await js('window.resume.loadLibrary()')
      const entry = result.data.entries.find((entry) => entry.id === result.data.activeId)
      return entry.document.form.sections
        .find((section) => section.kind === 'basic')
        .hiddenFields?.includes('phone')
    })
    const hiddenLibrary = await js('window.resume.loadLibrary()')
    const hiddenEntry = hiddenLibrary.data.entries.find(
      (entry) => entry.id === hiddenLibrary.data.activeId
    )
    assert.equal(
      hiddenEntry.document.form.sections.find((section) => section.kind === 'basic').items[0].values
        .phone,
      '13912345678'
    )
    assert.ok(
      hiddenEntry.snapshots.some((snapshot) => snapshot.document.markdown.includes('13912345678'))
    )
    assert.ok(
      hiddenLibrary.data.entries.some(
        (entry) =>
          entry.document.title === '旧 PDF 导入样例' &&
          entry.document.markdown.includes('示例科技有限公司')
      )
    )
    await js('document.querySelector(\'[aria-label="显示字段-phone"]\').click()')
    await until(() =>
      js("document.querySelector('[aria-label=\"基本信息-联系电话-1\"]').value==='13912345678'")
    )
    await js('document.querySelector(\'[aria-label="显示字段-phone"]\').click()')
    await js("void (document.querySelector('details').open=true)")
    await js('document.querySelector(\'[aria-label="主题色#273e5c"]\').click()')
    await until(() =>
      js(
        "getComputedStyle(document.querySelector('#resume-paper')).getPropertyValue('--accent').trim()==='#273e5c'"
      )
    )
    await click('恢复模板颜色')
    await until(() =>
      js(
        "getComputedStyle(document.querySelector('#resume-paper')).getPropertyValue('--accent').trim()==='#222'"
      )
    )
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: join(folder, 'standard-hidden-fields.pdf')
    })
    assert.equal((await js("window.resume.exportPDF('标准中文')")).ok, true)
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [join(folder, 'standard-hidden-fields.pdf')]
    })
    await click('导入 PDF')
    await until(() => js('!!document.querySelector("dialog[open]")'))
    assert.ok(
      !(await js('document.querySelector(\'[aria-label="PDF 提取内容"]\').value')).includes(
        '13912345678'
      ),
      'Hidden phone must not leak into exported PDF'
    )
    await click('取消导入')
    await js("void (document.querySelector('details').open=false)")
    await click('工作经历')
    await until(() => js('!!document.querySelector(\'[aria-label="工作经历-公司名称-1"]\')'))
    assert.ok(
      !(await js("document.querySelector('#resume-paper').textContent")).includes(
        '个人主页 / GitHub'
      )
    )
    await until(() =>
      js(
        "!!document.querySelector('[data-pdf-pages] canvas') && !document.querySelector('[data-pdf-pages] [role=status]')"
      )
    )
    await js(
      `(()=>{const input=document.querySelector('[aria-label="预览正文字号"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(input,'16');input.dispatchEvent(new Event('change',{bubbles:true}));})()`
    )
    await until(() =>
      js("getComputedStyle(document.querySelector('#resume-paper')).fontSize === '16px'")
    )
    await click('清晰排版')
    await until(() =>
      js("getComputedStyle(document.querySelector('#resume-paper')).fontSize === '15px'")
    )
    assert.ok(
      await js(
        "Math.abs(parseFloat(getComputedStyle(document.querySelector('#resume-paper')).paddingLeft) - 12*96/25.4) < 1"
      ),
      'Paper margins should be 12mm'
    )
    await click('直接编辑')
    await js(
      'document.querySelector(\'#resume-paper [data-section="work"] [data-field="details"] [role=button]\').click()'
    )
    await until(() => js('!!document.querySelector(\'[aria-label="编辑详细描述"]\')'))
    await fill('编辑详细描述', '负责业务模块开发')
    await js(
      '(()=>{const t=document.querySelector(\'[aria-label="编辑详细描述"]\');t.focus();t.setSelectionRange(0,2);t.dispatchEvent(new KeyboardEvent("keyup", {key:"Shift",bubbles:true}));})()'
    )
    await until(() => js('!document.querySelector(\'[aria-label="加粗"]\').disabled'))
    await js('document.querySelector(\'[aria-label="加粗"]\').click()')
    await until(() =>
      js('document.querySelector(\'[aria-label="编辑详细描述"]\').value === "**负责**业务模块开发"')
    )
    await pause(50)
    await js(
      'document.querySelector(\'[aria-label="编辑详细描述"]\').dispatchEvent(new KeyboardEvent("keydown", {key:"i", ctrlKey:true, bubbles:true}))'
    )
    await until(() =>
      js(
        'document.querySelector(\'[aria-label="编辑详细描述"]\').value === "***负责***业务模块开发"'
      )
    )
    await click('完成')
    await until(() =>
      js(
        'document.querySelector(\'#resume-paper [data-section="work"] :is(strong em, em strong)\')?.textContent === "负责"'
      )
    )
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: join(folder, 'formatted.pdf')
    })
    assert.equal((await js("window.resume.exportPDF('文字格式')")).ok, true)
    await click('查看 A4 分页')
    await until(() =>
      js(
        "!!document.querySelector('[data-pdf-pages] canvas') && !document.querySelector('[data-pdf-pages] [role=status]')"
      )
    )
    writeFileSync(join(folder, 'screenshot.png'), (await win.webContents.capturePage()).toPNG())
    await click('项目经历')
    await click('＋ 添加项目经历条目')
    await fill('项目经历-项目名称-2', '第二个项目')
    await click('＋ 添加项目经历条目')
    await fill('项目经历-项目名称-3', '第三个项目')
    const editorPosition = await js(
      `(()=>{const input=document.querySelector('[aria-label="项目经历-详细描述-3"]'); input.focus(); const panel=input.closest('fieldset'); panel.scrollTop=panel.scrollHeight; return panel.scrollTop;})()`
    )
    assert.ok(editorPosition > 100, 'Need a genuinely scrolled editor')
    await fill('项目经历-详细描述-3', '连续编辑时保持当前滚动位置')
    await pause(1800)
    assert.ok(
      await js(
        `Math.abs(document.querySelector('[aria-label="项目经历-详细描述-3"]').closest('fieldset').scrollTop - ${editorPosition}) < 3`
      ),
      'PDF preview must not reset editor scroll position'
    )
    assert.equal(
      await js('document.activeElement.getAttribute("aria-label")'),
      '项目经历-详细描述-3'
    )
    assert.equal(
      await js('document.querySelector(\'[aria-label="上移项目经历第1条"]\').disabled'),
      true
    )
    assert.equal(
      await js('document.querySelector(\'[aria-label="下移项目经历第3条"]\').disabled'),
      true
    )
    await js('document.querySelector(\'[aria-label="上移项目经历第3条"]\').click()')
    await until(() =>
      js('document.querySelector(\'[aria-label="项目经历-项目名称-2"]\').value === "第三个项目"')
    )
    assert.equal(
      await js(`document.querySelector('[aria-label="项目经历-详细描述-2"]').value`),
      '连续编辑时保持当前滚动位置'
    )
    await js('document.querySelector(\'[aria-label="下移项目经历第2条"]\').click()')
    await until(() =>
      js('document.querySelector(\'[aria-label="项目经历-项目名称-3"]\').value === "第三个项目"')
    )
    await pause(800)
    const sortedLibrary = await js('window.resume.loadLibrary()')
    const sortedDoc = sortedLibrary.data.entries.find(
      (entry) => entry.id === sortedLibrary.data.activeId
    ).document
    assert.ok(sortedDoc.markdown.indexOf('第二个项目') < sortedDoc.markdown.indexOf('第三个项目'))

    await click('选择模板')
    writeFileSync(join(folder, 'templates.png'), (await win.webContents.capturePage()).toPNG())
    await click('关闭')
    console.log(
      'SMOKE PASS: library create/copy/switch/delete, snapshot/diff/restore, edit, themes, persistence, validation, JSON, unsafe Markdown, avatar select/remove/restore/JSON/PDF, section forms/visibility/order/mode safety/JSON/PDF, background select/overlay/persist/reset/print exclusion, PDF import/edit/re-export/cancel/OCR rejection, template apply/create/direct edit/sync/PDF, legacy recognition/field hiding/reference layout/colors/PDF privacy, A4 and multi-page PDF'
    )
    console.log('Artifacts: ' + folder)
    app.exit(0)
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
setTimeout(() => {
  console.error('Smoke test deadline')
  app.exit(1)
}, 45000)
