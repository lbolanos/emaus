/**
 * Redimensiona una imagen en el navegador antes de subirla.
 *
 * Por qué existe: el servidor acepta como máximo 2 MB y de todas formas reduce
 * la imagen (a 512 px la foto de perfil, a 1600 px volantes y recuerdos), pero
 * una foto tomada con el móvil pesa entre 3 y 8 MB.
 * Sin este paso, subir la foto de alguien desde el teléfono —que es el caso
 * normal— falla siempre con "la imagen no puede exceder 2MB".
 *
 * Devuelve un data-URI listo para mandar al endpoint.
 */

/**
 * Longest side for event photos (retreat memories, community meetings): the
 * same bound the server keeps, so it only re-encodes and never rescales.
 */
export const PHOTO_MAX_SIDE = 1600;

/**
 * Largest original accepted for an event photo. It is shrunk before upload, so
 * it can be far above the server's 2MB; the cap bounds the worst case of
 * decoding on a phone. It measures bytes, not pixels: a guard, not a guarantee.
 */
export const MAX_PHOTO_SOURCE_BYTES = 30 * 1024 * 1024;

interface ResizeOptions {
	/** Lado mayor de la imagen resultante, en píxeles. */
	maxSide?: number;
	/** Calidad JPEG (0-1). */
	quality?: number;
}

/**
 * Se lee el archivo como data-URI en vez de `URL.createObjectURL()`.
 *
 * Un blob URL sería más eficiente, pero la CSP de producción declara
 * `img-src 'self' https: data:` — sin `blob:` — así que el navegador bloquea la
 * carga y la subida falla con "no se pudo leer la imagen". Un `data:` sí está
 * permitido. Verificado en producción el 2026-08-31.
 */
const readAsDataUrl = (file: File | Blob): Promise<string> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
		reader.readAsDataURL(file);
	});

const loadImage = async (file: File | Blob): Promise<HTMLImageElement> => {
	const dataUrl = await readAsDataUrl(file);
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('No se pudo leer la imagen'));
		img.src = dataUrl;
	});
};

export async function resizeImageToDataUrl(
	file: File | Blob,
	{ maxSide = 512, quality = 0.85 }: ResizeOptions = {},
): Promise<string> {
	const img = await loadImage(file);
	const longest = Math.max(img.naturalWidth, img.naturalHeight);
	const scale = longest > maxSide ? maxSide / longest : 1;
	const width = Math.max(1, Math.round(img.naturalWidth * scale));
	const height = Math.max(1, Math.round(img.naturalHeight * scale));

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('El navegador no soporta canvas');
	ctx.drawImage(img, 0, 0, width, height);

	// JPEG y no WebP: Safari en iOS soporta `toDataURL('image/webp')` devolviendo
	// PNG en silencio, y un PNG sin comprimir de 512px puede superar el límite.
	return canvas.toDataURL('image/jpeg', quality);
}
