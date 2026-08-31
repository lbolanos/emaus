/**
 * Redimensiona una imagen en el navegador antes de subirla.
 *
 * Por qué existe: el servidor acepta como máximo 2 MB y de todas formas reduce
 * la imagen a 512 px, pero una foto tomada con el móvil pesa entre 3 y 8 MB.
 * Sin este paso, subir la foto de alguien desde el teléfono —que es el caso
 * normal— falla siempre con "la imagen no puede exceder 2MB".
 *
 * Devuelve un data-URI listo para mandar al endpoint.
 */

interface ResizeOptions {
	/** Lado mayor de la imagen resultante, en píxeles. */
	maxSide?: number;
	/** Calidad JPEG (0-1). */
	quality?: number;
}

const loadImage = (file: File | Blob): Promise<HTMLImageElement> =>
	new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('No se pudo leer la imagen'));
		};
		img.src = url;
	});

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
