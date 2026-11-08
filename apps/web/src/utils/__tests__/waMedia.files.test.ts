import { describe, it, expect } from 'vitest';
import { dataUrlToBytes, dataUrlToText, safeBlobType, waDocumentKind } from '../waMedia';

/** Inbox v1.5 (D26): document kinds for display and safe blob types. */
describe('waMedia files (v1.5)', () => {
  it('names the document kind by extension, then by type', () => {
    expect(waDocumentKind(null, 'Carta para Juan.docx')).toBe('word');
    expect(waDocumentKind(null, 'retiro.PPTX')).toBe('slides');
    expect(waDocumentKind('application/vnd.ms-excel', 'sin-extension')).toBe('sheet');
    expect(waDocumentKind('application/pdf', null)).toBe('pdf');
    expect(waDocumentKind('text/plain', 'nota')).toBe('text');
    expect(waDocumentKind('application/zip', 'fotos.zip')).toBe('file');
  });

  it('never lets a blob carry a type the browser would render as a page', () => {
    expect(safeBlobType('text/html')).toBe('application/octet-stream');
    expect(safeBlobType('image/svg+xml')).toBe('application/octet-stream');
    expect(safeBlobType('application/xhtml+xml')).toBe('application/octet-stream');
    expect(safeBlobType('application/javascript')).toBe('application/octet-stream');
    expect(safeBlobType(null)).toBe('application/octet-stream');
    expect(safeBlobType('application/pdf')).toBe('application/pdf');
    expect(safeBlobType('Video/MP4')).toBe('video/mp4');
    expect(safeBlobType('audio/ogg; codecs=opus')).toBe('audio/ogg');
    expect(safeBlobType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('decodes data-URLs to bytes and UTF-8 text', () => {
    const text = 'Querido Juan: ¡te queremos!';
    const dataUrl = `data:text/plain;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(text)))}`;
    expect(dataUrlToText(dataUrl)).toBe(text);
    expect(Array.from(dataUrlToBytes('data:application/pdf;base64,JVBERg=='))).toEqual([0x25, 0x50, 0x44, 0x46]);
  });
});
