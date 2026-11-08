import type { LetterAttachment } from '@repo/types';

/**
 * Qué se hace con cada adjunto de una carta:
 * - photo: se ve en grande en el visor de la bandeja (y sale en el papel).
 * - pdf: se abre en una pestaña con el visor del navegador (el API lo firma inline).
 * - el resto (Word, PowerPoint, Excel, OpenDocument, texto, HEIC): se descarga y el
 *   sistema lo abre con su programa. Nunca se muestra dentro de la página.
 */
export type AttachmentKind = 'photo' | 'pdf' | 'word' | 'slides' | 'sheet' | 'text' | 'image' | 'file';

type AttachmentLike = Pick<LetterAttachment, 'mimeType' | 'isBrowserSafeImage' | 'fileName' | 'storageUrl'>;

export const attachmentKind = (a: Pick<AttachmentLike, 'mimeType' | 'isBrowserSafeImage'>): AttachmentKind => {
	if (a.isBrowserSafeImage) return 'photo';
	const mime = a.mimeType;
	if (mime === 'application/pdf') return 'pdf';
	if (mime === 'application/msword' || mime.includes('wordprocessingml') || mime.includes('opendocument.text')) {
		return 'word';
	}
	if (mime === 'application/vnd.ms-powerpoint' || mime.includes('presentationml') || mime.includes('opendocument.presentation')) {
		return 'slides';
	}
	if (mime === 'application/vnd.ms-excel' || mime.includes('spreadsheetml') || mime.includes('opendocument.spreadsheet')) {
		return 'sheet';
	}
	if (mime === 'text/plain') return 'text';
	if (mime.startsWith('image/')) return 'image'; // HEIC: se descarga (Vista Previa/Fotos lo abren)
	return 'file';
};

export const formatBytes = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * En dev (sin S3) el adjunto es un data: URL, y el navegador bloquea abrir un
 * data: en una pestaña nueva: se pasa a blob: URL, que sí se puede abrir y
 * descargar con su nombre.
 */
const toOpenableUrl = async (url: string): Promise<string> => {
	if (!url.startsWith('data:')) return url;
	const blob = await (await fetch(url)).blob();
	return URL.createObjectURL(blob);
};

/** Abre un PDF en una pestaña nueva, o descarga cualquier otro adjunto. */
export const openAttachment = async (a: AttachmentLike): Promise<void> => {
	const url = await toOpenableUrl(a.storageUrl);
	// La pestaña o la descarga ya tomaron el blob: liberarlo en un minuto.
	if (url !== a.storageUrl) setTimeout(() => URL.revokeObjectURL(url), 60_000);
	if (attachmentKind(a) === 'pdf') {
		window.open(url, '_blank', 'noopener');
		return;
	}
	const link = document.createElement('a');
	link.href = url;
	// `download` solo vale en el mismo origen (blob:); en S3 lo resuelve el
	// Content-Disposition: attachment con el nombre real que guardó el API.
	link.download = a.fileName;
	link.rel = 'noopener';
	document.body.appendChild(link);
	link.click();
	link.remove();
};
