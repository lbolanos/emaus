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

/**
 * data-URL → object URL, to open a downloaded document in a new tab without
 * putting megabytes of base64 in the address bar. The caller revokes it.
 */
export function dataUrlToObjectUrl(dataUrl: string): string {
  const marker = ';base64,';
  const at = dataUrl.indexOf(marker);
  const mime = dataUrl.slice('data:'.length, at) || 'application/octet-stream';
  const binary = atob(dataUrl.slice(at + marker.length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}
