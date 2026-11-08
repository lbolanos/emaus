/**
 * WhatsApp inbox media helpers (specs/whatsapp-inbox v1.3): one place that
 * decides how a message type is labelled and what can be done with it.
 */

export type WaMediaKind = 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'other';

export function waMediaKind(messageType: string | null | undefined): WaMediaKind {
  switch (messageType) {
    case undefined:
    case null:
    case '':
    case 'text':
      return 'text';
    case 'image':
    case 'audio':
    case 'video':
    case 'document':
    case 'sticker':
      return messageType;
    default:
      return 'other';
  }
}

/** i18n key of the placeholder shown when a media message has no caption. */
export function waMediaLabelKey(messageType: string | null | undefined): string {
  const kind = waMediaKind(messageType);
  return kind === 'text' ? 'waInbox.media.other' : `waInbox.media.${kind}`;
}

/** A document the browser can render to an image (first page) — PDF only. */
export function isPdfDocument(mime: string | null | undefined, fileName?: string | null): boolean {
  if (mime && mime.toLowerCase() === 'application/pdf') return true;
  return Boolean(fileName && /\.pdf$/i.test(fileName));
}

/** What a document looks like in the thread (v1.5) — display only, never a security decision. */
export type WaDocumentKind = 'pdf' | 'word' | 'slides' | 'sheet' | 'text' | 'image' | 'file';

const DOCUMENT_KIND_BY_EXT: Record<string, WaDocumentKind> = {
  pdf: 'pdf',
  doc: 'word',
  docx: 'word',
  odt: 'word',
  rtf: 'word',
  ppt: 'slides',
  pptx: 'slides',
  odp: 'slides',
  key: 'slides',
  xls: 'sheet',
  xlsx: 'sheet',
  ods: 'sheet',
  csv: 'sheet',
  txt: 'text',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  webp: 'image',
  heic: 'image',
};

export function waDocumentKind(mime: string | null | undefined, fileName?: string | null): WaDocumentKind {
  const ext = (fileName?.split('.').pop() ?? '').toLowerCase();
  if (DOCUMENT_KIND_BY_EXT[ext]) return DOCUMENT_KIND_BY_EXT[ext];
  const m = (mime ?? '').toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (m === 'application/msword' || m.includes('wordprocessingml') || m.includes('opendocument.text')) return 'word';
  if (m === 'application/vnd.ms-powerpoint' || m.includes('presentationml') || m.includes('opendocument.presentation')) {
    return 'slides';
  }
  if (m === 'application/vnd.ms-excel' || m.includes('spreadsheetml') || m.includes('opendocument.spreadsheet')) {
    return 'sheet';
  }
  if (m === 'text/plain') return 'text';
  if (m.startsWith('image/')) return 'image';
  return 'file';
}

export const WA_DOCUMENT_ICON: Record<WaDocumentKind, string> = {
  pdf: '📕',
  word: '📝',
  slides: '📽️',
  sheet: '📊',
  text: '📃',
  image: '🖼️',
  file: '📄',
};

/**
 * Types a blob may carry (v1.5). The server already verifies documents from
 * their bytes; this is defense in depth: anything else (text/html,
 * image/svg+xml…) becomes an opaque download, so a blob of ours can never be
 * rendered as a page with the app's origin.
 */
const SAFE_BLOB_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'video/mp4',
  'video/quicktime',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.spreadsheet',
]);

export function safeBlobType(mime: string | null | undefined): string {
  const m = (mime ?? '').split(';')[0].trim().toLowerCase();
  if (SAFE_BLOB_TYPES.has(m) || m.startsWith('audio/')) return m;
  return 'application/octet-stream';
}

/** data-URL → bytes (plain slicing: no regex over megabytes of base64). */
export function dataUrlToBytes(dataUrl: string): Uint8Array<ArrayBuffer> {
  const marker = ';base64,';
  const at = dataUrl.indexOf(marker);
  const binary = atob(at === -1 ? '' : dataUrl.slice(at + marker.length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * data-URL → object URL for the file viewer (download link, video), typed
 * with a safe type only (see safeBlobType). The caller revokes it.
 */
export function dataUrlToObjectUrl(dataUrl: string, mime?: string | null): string {
  const declared = dataUrl.slice('data:'.length, Math.max(dataUrl.indexOf(';'), 'data:'.length));
  const bytes = dataUrlToBytes(dataUrl);
  return URL.createObjectURL(new Blob([bytes], { type: safeBlobType(mime ?? declared) }));
}

/** Plain text of a data-URL (UTF-8), for the viewer's text preview. */
export function dataUrlToText(dataUrl: string): string {
  return new TextDecoder('utf-8').decode(dataUrlToBytes(dataUrl));
}
