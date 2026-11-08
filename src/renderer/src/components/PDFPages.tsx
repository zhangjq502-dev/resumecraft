import { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { ResumeDocument } from '../../../shared/resume'
import styles from './PDFPages.module.scss'

GlobalWorkerOptions.workerSrc = workerURL

/** 展示实际打印结果，而不是用 CSS 猜测换页位置。过期结果不会覆盖新文档。 */
export function PDFPages({ document }: { document: ResumeDocument }): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState('正在生成 A4 预览…')
  useEffect(() => {
    let cancelled = false
    let destroy: (() => Promise<void>) | undefined
    const timer = setTimeout(() => {
      void (async () => {
        setMessage('正在更新分页…')
        const result = await window.resume.previewPDF()
        if (cancelled) return
        if (!result.ok) throw new Error(result.error)
        const assets = new URL('./pdf-assets/', window.document.baseURI).href
        const task = getDocument({
          data: new Uint8Array(result.data),
          cMapUrl: assets + 'cmaps/',
          cMapPacked: true,
          standardFontDataUrl: assets + 'standard_fonts/',
          wasmUrl: assets + 'wasm/',
          useWorkerFetch: false,
          enableXfa: false
        })
        destroy = () => task.destroy()
        const pdf = await task.promise
        const fragment = window.document.createDocumentFragment()
        for (let number = 1; number <= pdf.numPages; number++) {
          if (cancelled) return
          const page = await pdf.getPage(number)
          const canvas = window.document.createElement('canvas')
          // PDF 使用 72 dpi，CSS 使用 96 dpi；再乘屏幕像素密度，避免 Retina 模糊。
          const renderScale = (96 / 72) * Math.max(1.5, window.devicePixelRatio || 1)
          const viewport = page.getViewport({ scale: renderScale })
          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          canvas.setAttribute('aria-label', `A4 第 ${number} 页`)
          await page.render({ canvas, viewport }).promise
          const sheet = window.document.createElement('figure')
          const label = window.document.createElement('figcaption')
          label.textContent = `第 ${number} / ${pdf.numPages} 页 · A4`
          sheet.append(canvas, label)
          fragment.append(sheet)
          page.cleanup()
        }
        if (!cancelled && host.current) {
          host.current.replaceChildren(fragment)
          setMessage('')
        }
      })().catch((error: unknown) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : '分页预览失败')
      })
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(timer)
      void destroy?.()
    }
  }, [document])
  return (
    <div className={styles.pages} data-pdf-pages>
      {message && <p role="status">{message}</p>}
      <div ref={host} />
    </div>
  )
}
