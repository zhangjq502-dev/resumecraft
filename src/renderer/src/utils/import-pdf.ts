import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { fragmentsToLines, linesToMarkdown, type PDFTextFragment } from '../../../shared/pdf-text'
import { MAX_MARKDOWN_LENGTH } from '../../../shared/resume'

GlobalWorkerOptions.workerSrc = workerURL
export interface PDFImportDraft {
  title: string
  markdown: string
  pageCount: number
  warnings: string[]
}

/** 在 PDF.js worker 解析，所有字体资源来自安装包；不上传文档、不执行 PDF 脚本。 */
export async function extractPDF(
  name: string,
  bytes: Uint8Array,
  progress: (message: string) => void
): Promise<PDFImportDraft> {
  const assets = new URL('./pdf-assets/', document.baseURI).href
  const task = getDocument({
    data: new Uint8Array(bytes),
    cMapUrl: assets + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: assets + 'standard_fonts/',
    wasmUrl: assets + 'wasm/',
    useWorkerFetch: false,
    disableFontFace: true,
    enableXfa: false,
    stopAtErrors: true
  })
  // 设置总超时，损坏或复杂文件不会无限占用导入状态。
  const deadline = setTimeout(() => {
    void task.destroy()
  }, 45_000)
  try {
    const pdf = await task.promise
    if (pdf.numPages > 20) throw new Error('最多导入 20 页的 PDF 简历')
    const pages: string[][] = []
    const emptyPages: number[] = []
    let total = 0
    for (let number = 1; number <= pdf.numPages; number++) {
      progress(`正在提取文字 ${number}/${pdf.numPages}`)
      const page = await pdf.getPage(number)
      const content = await page.getTextContent()
      const fragments = content.items.filter(
        (item): item is PDFTextFragment & typeof item => 'str' in item
      )
      const lines = fragmentsToLines(fragments)
      if (!lines.length) emptyPages.push(number)
      total += lines.join('').length
      if (total > MAX_MARKDOWN_LENGTH) throw new Error('PDF 文字超过 200,000 字符，请先精简文件')
      pages.push(lines)
      page.cleanup()
    }
    const markdown = linesToMarkdown(pages)
    if (!markdown.trim())
      throw new Error(
        '未识别到文字层。这可能是扫描件或图片 PDF，当前版本尚不支持 OCR，请先转换成可选中文字的 PDF。'
      )
    if (markdown.length > MAX_MARKDOWN_LENGTH) throw new Error('转换后的内容过长，请先精简 PDF')
    const warnings = [
      '已提取文字并重新排版，原 PDF 不会被修改。请检查段落顺序、日期及特殊字符。',
      '双栏、表格和复杂布局可能顺序不准确；头像、图片和原有字体样式不会自动导入。'
    ]
    if (emptyPages.length)
      warnings.push(`第 ${emptyPages.join('、')} 页没有文字层，可能包含扫描内容，未自动导入。`)
    return {
      title: name.replace(/\.pdf$/i, '').slice(0, 100) || '导入的简历',
      markdown,
      pageCount: pdf.numPages,
      warnings
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException')
      throw new Error('此 PDF 需要密码，请先解密后再导入。', { cause: error })
    throw error
  } finally {
    clearTimeout(deadline)
    await task.destroy()
  }
}
