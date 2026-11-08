import { describe, it, expect } from 'vitest';
import { isPdfDocument, waMediaKind, waMediaLabelKey } from '../waMedia';

describe('waMedia (v1.3)', () => {
  it('maps WhatsApp types to kinds and label keys', () => {
    expect(waMediaKind('image')).toBe('image');
    expect(waMediaKind('ptt')).toBe('other');
    expect(waMediaKind(null)).toBe('text');
    expect(waMediaLabelKey('audio')).toBe('waInbox.media.audio');
    expect(waMediaLabelKey('weird')).toBe('waInbox.media.other');
  });

  it('detects PDFs by mime or file name', () => {
    expect(isPdfDocument('application/pdf')).toBe(true);
    expect(isPdfDocument('application/octet-stream', 'Comprobante.PDF')).toBe(true);
    expect(isPdfDocument('application/msword', 'carta.doc')).toBe(false);
    expect(isPdfDocument(null, null)).toBe(false);
  });
});
