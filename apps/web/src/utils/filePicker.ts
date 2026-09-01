/**
 * Abre el selector de archivos del sistema y devuelve lo elegido.
 *
 * Sustituye al patrón `<input type="file" class="hidden">` + `ref.click()`, que
 * falla de dos maneras distintas y silenciosas:
 *
 *  - **Safari** no abre el selector cuando el input está en `display:none`.
 *  - **En desarrollo**, tras un rato de hot-reload la referencia puede apuntar
 *    a un input que Vite ya desconectó del DOM. `click()` sobre un nodo
 *    desconectado no hace nada y no lanza error, así que el botón queda muerto
 *    sin dejar rastro en consola. Costó una tarde encontrarlo (2026-08-31).
 *
 * Aquí el input se crea en el momento y se añade al documento, así que siempre
 * está vivo y renderizado.
 *
 * Devuelve un array vacío si la persona cancela.
 */
interface PickFileOptions {
	/** Igual que el atributo `accept` del input. */
	accept?: string;
	/** Permitir varios archivos. */
	multiple?: boolean;
	/** Abre la cámara en móvil en vez del explorador ('environment' | 'user'). */
	capture?: 'environment' | 'user';
}

export function pickFiles({
	accept,
	multiple = false,
	capture,
}: PickFileOptions = {}): Promise<File[]> {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		if (accept) input.accept = accept;
		input.multiple = multiple;
		if (capture) input.setAttribute('capture', capture);

		// Fuera de la vista pero RENDERIZADO: con `display:none` Safari ignora el
		// click programático.
		input.style.position = 'fixed';
		input.style.left = '-9999px';
		input.style.opacity = '0';

		let settled = false;
		const finish = (files: File[]) => {
			if (settled) return;
			settled = true;
			input.remove();
			resolve(files);
		};

		input.addEventListener('change', () => finish(Array.from(input.files ?? [])));
		// `cancel` avisa cuando se cierra el diálogo sin elegir nada. No existe en
		// todos los navegadores; donde falta, el input se queda hasta que se
		// elija algo o se descargue la página, que es inocuo.
		input.addEventListener('cancel', () => finish([]));

		document.body.appendChild(input);
		input.click();
	});
}

/** Atajo para el caso más común: un solo archivo, o `null` si se cancela. */
export async function pickFile(options: PickFileOptions = {}): Promise<File | null> {
	const [file] = await pickFiles({ ...options, multiple: false });
	return file ?? null;
}
