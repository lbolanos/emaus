/**
 * Average brightness of an image, used to pick a palette that survives it.
 *
 * Kept apart from flyerStyle.ts so that one stays a pure function of its inputs: this
 * one needs the DOM, the network and a canvas.
 */

/** Sampling grid: enough to tell a dark photo from a pale one, cheap to draw. */
const SAMPLE_SIZE = 32;

export async function averageImageLuminance(url: string): Promise<number> {
	const image = new Image();
	// Needed for the canvas to stay readable with an S3-hosted background
	image.crossOrigin = 'anonymous';
	image.src = url;

	await new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = () => reject(new Error('No se pudo leer la imagen de fondo'));
	});

	const canvas = document.createElement('canvas');
	canvas.width = SAMPLE_SIZE;
	canvas.height = SAMPLE_SIZE;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Canvas 2D no disponible');

	context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
	const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

	let total = 0;
	let counted = 0;
	for (let i = 0; i < data.length; i += 4) {
		const alpha = data[i + 3] / 255;
		if (alpha === 0) continue;
		// Perceived brightness, the cheap version: good enough to choose a palette
		total += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
		counted += 1;
	}

	return counted === 0 ? 0.5 : total / counted;
}
