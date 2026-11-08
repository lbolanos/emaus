import { describe, it, expect, vi, afterEach } from 'vitest';
import { attachmentKind, formatBytes, openAttachment } from '../letterAttachments';

const att = (mimeType: string, over: Record<string, unknown> = {}) => ({
	mimeType,
	isBrowserSafeImage: false,
	fileName: 'archivo',
	storageUrl: 'https://bucket.s3.amazonaws.com/letters/l/a/archivo?X-Amz-Signature=x',
	...over,
});

describe('letterAttachments', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('attachmentKind: foto imprimible, PDF y cada familia de documentos', () => {
		expect(attachmentKind(att('image/jpeg', { isBrowserSafeImage: true }))).toBe('photo');
		expect(attachmentKind(att('application/pdf'))).toBe('pdf');
		expect(attachmentKind(att('application/msword'))).toBe('word');
		expect(
			attachmentKind(att('application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
		).toBe('word');
		expect(attachmentKind(att('application/vnd.oasis.opendocument.text'))).toBe('word');
		expect(
			attachmentKind(att('application/vnd.openxmlformats-officedocument.presentationml.presentation')),
		).toBe('slides');
		expect(attachmentKind(att('application/vnd.ms-excel'))).toBe('sheet');
		expect(attachmentKind(att('text/plain'))).toBe('text');
		expect(attachmentKind(att('image/heic'))).toBe('image');
		expect(attachmentKind(att('application/octet-stream'))).toBe('file');
	});

	it('formatBytes', () => {
		expect(formatBytes(900)).toBe('900 B');
		expect(formatBytes(46_292)).toBe('45 KB');
		expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
	});

	it('PDF: se abre en una pestaña nueva (visor del navegador)', async () => {
		const open = vi.spyOn(window, 'open').mockReturnValue(null);
		const pdf = att('application/pdf', { fileName: 'carta.pdf' });
		await openAttachment(pdf);
		expect(open).toHaveBeenCalledWith(pdf.storageUrl, '_blank', 'noopener');
	});

	it('Word y demás: se descargan con su nombre, nunca se abren en una pestaña', async () => {
		const open = vi.spyOn(window, 'open').mockReturnValue(null);
		const clicks: HTMLAnchorElement[] = [];
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
			clicks.push(this);
		});
		await openAttachment(att('application/msword', { fileName: 'Carta para José.doc' }));
		expect(open).not.toHaveBeenCalled();
		expect(clicks).toHaveLength(1);
		expect(clicks[0].download).toBe('Carta para José.doc');
	});

	it('dev: un data: URL se pasa a blob: antes de abrirlo (Chrome bloquea abrir data:)', async () => {
		const open = vi.spyOn(window, 'open').mockReturnValue(null);
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Blob(['%PDF-1.4'])));
		const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/abc');
		await openAttachment(att('application/pdf', { storageUrl: 'data:application/pdf;base64,JVBERi0xLjQ=' }));
		expect(created).toHaveBeenCalled();
		expect(open).toHaveBeenCalledWith('blob:http://localhost/abc', '_blank', 'noopener');
	});
});
