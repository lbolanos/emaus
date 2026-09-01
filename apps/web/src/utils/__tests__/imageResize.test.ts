import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resizeImageToDataUrl } from '../imageResize';

/**
 * `resizeImageToDataUrl` es lo que hace que subir una foto desde el móvil no
 * choque contra el límite de 2 MB del servidor. happy-dom no implementa
 * `<canvas>` ni la carga de imágenes, así que aquí se sustituyen por dobles y
 * se verifica la aritmética del escalado y el formato de salida, que es donde
 * está la decisión.
 */

interface FakeCanvas {
	width: number;
	height: number;
	getContext: ReturnType<typeof vi.fn>;
	toDataURL: ReturnType<typeof vi.fn>;
}

let fakeCanvas: FakeCanvas;
let drawnArgs: any[] = [];
let originalCreateElement: typeof document.createElement;

/** Instala un `new Image()` que se resuelve con las dimensiones dadas. */
const stubImage = (naturalWidth: number, naturalHeight: number) => {
	class FakeImage {
		naturalWidth = naturalWidth;
		naturalHeight = naturalHeight;
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;
		set src(_value: string) {
			// La carga real es asíncrona; se imita para que el `await` del
			// helper llegue a resolverse.
			setTimeout(() => this.onload?.(), 0);
		}
	}
	vi.stubGlobal('Image', FakeImage as any);
};

beforeEach(() => {
	drawnArgs = [];
	fakeCanvas = {
		width: 0,
		height: 0,
		getContext: vi.fn(() => ({
			drawImage: (...args: any[]) => drawnArgs.push(args),
		})),
		toDataURL: vi.fn(() => 'data:image/jpeg;base64,FAKE'),
	};

	originalCreateElement = document.createElement.bind(document);
	vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
		tag === 'canvas' ? (fakeCanvas as unknown as HTMLCanvasElement) : originalCreateElement(tag)) as any);

	// La imagen se lee con FileReader (data-URI), no con blob URL: la CSP de
	// producción no permite `blob:` en img-src.
	class FakeFileReader {
		result: string | null = null;
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;
		readAsDataURL(_file: Blob) {
			this.result = 'data:image/jpeg;base64,ENTRADA';
			setTimeout(() => this.onload?.(), 0);
		}
	}
	vi.stubGlobal('FileReader', FakeFileReader as any);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const blob = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });

describe('resizeImageToDataUrl', () => {
	it('encoge una foto grande hasta que el lado mayor mide 512', async () => {
		stubImage(4032, 3024); // foto típica de móvil
		await resizeImageToDataUrl(blob());

		expect(fakeCanvas.width).toBe(512);
		expect(fakeCanvas.height).toBe(384); // 3024 * (512/4032)
	});

	it('respeta la orientación vertical', async () => {
		stubImage(3024, 4032);
		await resizeImageToDataUrl(blob());

		expect(fakeCanvas.width).toBe(384);
		expect(fakeCanvas.height).toBe(512);
	});

	it('NO amplía una imagen más pequeña que el límite', async () => {
		// Estirar una foto pequeña solo añadiría peso sin ganar nitidez.
		stubImage(200, 150);
		await resizeImageToDataUrl(blob());

		expect(fakeCanvas.width).toBe(200);
		expect(fakeCanvas.height).toBe(150);
	});

	it('acepta otro lado máximo', async () => {
		stubImage(1000, 500);
		await resizeImageToDataUrl(blob(), { maxSide: 100 });

		expect(fakeCanvas.width).toBe(100);
		expect(fakeCanvas.height).toBe(50);
	});

	it('nunca produce un lado de cero', async () => {
		// Una imagen muy alargada podría redondear a 0 el lado corto y hacer
		// que el canvas no pinte nada.
		stubImage(4000, 3);
		const result = await resizeImageToDataUrl(blob());

		expect(fakeCanvas.width).toBe(512);
		expect(fakeCanvas.height).toBeGreaterThanOrEqual(1);
		expect(result).toContain('data:image/jpeg');
	});

	it('devuelve JPEG y no WebP', async () => {
		// Safari en iOS acepta `toDataURL('image/webp')` y devuelve PNG sin
		// avisar; un PNG de 512 px puede pasarse del límite del servidor.
		stubImage(800, 800);
		await resizeImageToDataUrl(blob());

		expect(fakeCanvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
	});

	it('acepta otra calidad', async () => {
		stubImage(800, 800);
		await resizeImageToDataUrl(blob(), { quality: 0.5 });

		expect(fakeCanvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.5);
	});

	it('NO usa blob: para cargar la imagen (la CSP de producción lo bloquea)', async () => {
		// `img-src 'self' https: data:` — sin `blob:`. Con createObjectURL, el
		// navegador bloquea la carga en producción y la subida falla con "no se
		// pudo leer la imagen", pero en local funciona. Pasó el 2026-08-31.
		const createObjectURL = vi.fn(() => 'blob:fake');
		vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });

		stubImage(800, 800);
		await resizeImageToDataUrl(blob());

		expect(createObjectURL).not.toHaveBeenCalled();
	});

	it('falla con un mensaje claro si el navegador no da contexto 2D', async () => {
		stubImage(800, 800);
		fakeCanvas.getContext = vi.fn(() => null);

		await expect(resizeImageToDataUrl(blob())).rejects.toThrow('canvas');
	});

	it('falla con un mensaje claro si el archivo no se puede leer', async () => {
		class BrokenReader {
			onload: (() => void) | null = null;
			onerror: (() => void) | null = null;
			readAsDataURL(_f: Blob) {
				setTimeout(() => this.onerror?.(), 0);
			}
		}
		vi.stubGlobal('FileReader', BrokenReader as any);

		await expect(resizeImageToDataUrl(blob())).rejects.toThrow('No se pudo leer la imagen');
	});

	it('falla con un mensaje claro si la imagen está corrupta', async () => {
		class BrokenImage {
			onload: (() => void) | null = null;
			onerror: (() => void) | null = null;
			set src(_v: string) {
				setTimeout(() => this.onerror?.(), 0);
			}
		}
		vi.stubGlobal('Image', BrokenImage as any);

		await expect(resizeImageToDataUrl(blob())).rejects.toThrow('No se pudo leer la imagen');
	});
});
