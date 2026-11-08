/**
 * Renders PDF pages (data-URL) to JPEG data-URLs in the browser
 * (specs/whatsapp-inbox v1.3/v1.5). Payments and letters only accept images,
 * so a PDF receipt or letter received by WhatsApp goes through the first
 * page; the file viewer (v1.5) shows every page the same way, which also
 * works on iOS Safari (an embedded PDF there shows only its first page). The
 * 1 GB server never parses PDFs.
 *
 * pdf.js is imported lazily (only when a PDF is actually rendered) and from
 * its legacy build, which polyfills what older iOS Safari lacks.
 */

import type { PDFDocumentProxy } from 'pdfjs-dist'

const DEFAULT_MAX_SIDE = 1600

async function loadPdf(pdfDataUrl: string): Promise<PDFDocumentProxy> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    // `?worker`: Vite bundles the worker as a regular .js chunk. A raw `.mjs`
    // asset depends on nginx's mime.types mapping .mjs to JavaScript (older
    // nginx does not), and module workers refuse any other MIME type.
    const { default: PdfWorker } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker')
    pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker()
  }

  const marker = ';base64,'
  const at = pdfDataUrl.indexOf(marker)
  if (at === -1) throw new Error('PDF inválido')
  const binary = atob(pdfDataUrl.slice(at + marker.length))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return pdfjs.getDocument({ data: bytes }).promise
}

async function renderPage(doc: PDFDocumentProxy, pageNumber: number, maxSide: number): Promise<string> {
  const page = await doc.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(maxSide / Math.max(base.width, base.height), 3)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas no disponible')
  // White background: transparent PDFs would print/display as black.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: context, viewport }).promise
  // JPEG: a full page as PNG can exceed the 2 MB receipt cap of /payments.
  return canvas.toDataURL('image/jpeg', 0.85)
}

export async function renderPdfFirstPage(
  pdfDataUrl: string,
  maxSide: number = DEFAULT_MAX_SIDE,
): Promise<string> {
  const doc = await loadPdf(pdfDataUrl)
  try {
    return await renderPage(doc, 1, maxSide)
  } finally {
    await doc.destroy()
  }
}

/**
 * Pages of a PDF for the in-app viewer (v1.5), rendered one by one so the
 * first ones show while the rest render. Stops at `maxPages`; `total` tells
 * the viewer whether the document was cut. `isCancelled` lets a closed viewer
 * stop rendering.
 */
export async function renderPdfPages(
  pdfDataUrl: string,
  options: {
    maxPages?: number
    maxSide?: number
    onPage?: (pageDataUrl: string, pageNumber: number, total: number) => void
    isCancelled?: () => boolean
  } = {},
): Promise<{ pages: string[]; total: number }> {
  const doc = await loadPdf(pdfDataUrl)
  try {
    const total = doc.numPages
    const last = Math.min(total, options.maxPages ?? 20)
    const pages: string[] = []
    for (let n = 1; n <= last; n++) {
      if (options.isCancelled?.()) break
      const page = await renderPage(doc, n, options.maxSide ?? DEFAULT_MAX_SIDE)
      pages.push(page)
      options.onPage?.(page, n, total)
    }
    return { pages, total }
  } finally {
    await doc.destroy()
  }
}
