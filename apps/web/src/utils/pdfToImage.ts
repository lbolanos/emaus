/**
 * Renders the first page of a PDF (data-URL) to a JPEG data-URL in the browser
 * (specs/whatsapp-inbox v1.3). Payments and letters only accept images, so a
 * PDF receipt or letter received by WhatsApp goes through this and then the
 * existing image path — the 1 GB server never parses PDFs.
 *
 * pdf.js is imported lazily (only when a PDF is actually rendered) and from
 * its legacy build, which polyfills what older iOS Safari lacks.
 */

const DEFAULT_MAX_SIDE = 1600;

export async function renderPdfFirstPage(
  pdfDataUrl: string,
  maxSide: number = DEFAULT_MAX_SIDE,
): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    // `?worker`: Vite bundles the worker as a regular .js chunk. A raw `.mjs`
    // asset depends on nginx's mime.types mapping .mjs to JavaScript (older
    // nginx does not), and module workers refuse any other MIME type.
    const { default: PdfWorker } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker');
    pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
  }

  const marker = ';base64,';
  const at = pdfDataUrl.indexOf(marker);
  if (at === -1) throw new Error('PDF inválido');
  const binary = atob(pdfDataUrl.slice(at + marker.length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(maxSide / Math.max(base.width, base.height), 3);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas no disponible');
    // White background: transparent PDFs would print/display as black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    // JPEG: a full page as PNG can exceed the 2 MB receipt cap of /payments.
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    await doc.destroy();
  }
}
