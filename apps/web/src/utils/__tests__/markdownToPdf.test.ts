import { describe, it, expect } from 'vitest';
import { marked } from 'marked';
import { buildPreparationPdf, toUnits, flattenInline } from '../markdownToPdf';

/**
 * El PDF se genera en el navegador con jsPDF: Chrome headless en el servidor
 * costaba 345MB de pico y el Lightsail de producción tiene ~400MB libres.
 *
 * Estos tests miran dos cosas: la composición de texto (donde vivían los bugs
 * reales) y los bytes del PDF resultante, porque el contenido va comprimido y
 * no se puede leer directamente.
 */

const MARKDOWN = `**Tema:** _Amando a Dios a través del Servicio_

## Introducción

¿Qué es **SERVIR**? Servir a todos, al que no agradece.

> Oh Cristo, para poder servirte mejor,
> dame un noble corazón

## Reglamento

### Fechas y horarios

| # | Fecha | Preparación |
| --- | --- | --- |
| 1 | miércoles, 19 de agosto de 2026 · 20:00 | 1ª preparación |
| 2 | miércoles, 26 de agosto de 2026 · 20:00 | 2ª preparación |

- Sólo se permiten 2 faltas.
- Cupo lleno de 54 caminantes.
`;

async function buildRaw(markdown = MARKDOWN, extra: Record<string, unknown> = {}) {
	const blob = await buildPreparationPdf({
		title: '1ª preparación — Servicio',
		subtitle: 'Buen Despacho',
		meta: '1ª preparación\nmiércoles, 19 de agosto de 2026 · 20:00',
		markdown,
		...extra,
	});
	return Buffer.from(await blob.arrayBuffer()).toString('latin1');
}

/** UTF-16BE bien decodificado (Buffer no lo hace de forma nativa). */
function decodeUtf16be(buf: Buffer): string {
	const swapped = Buffer.from(buf);
	for (let i = 0; i + 1 < swapped.length; i += 2) {
		const tmp = swapped[i];
		swapped[i] = swapped[i + 1];
		swapped[i + 1] = tmp;
	}
	return swapped.toString('utf16le');
}

function outlineTitlesDecoded(pdf: string): string[] {
	const out: string[] = [];
	for (const match of pdf.matchAll(/\/Title\s*\(((?:[^()\\]|\\.)*)\)/g)) {
		const raw = Buffer.from(
			match[1].replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\'),
			'latin1',
		);
		out.push(raw[0] === 0xfe && raw[1] === 0xff ? decodeUtf16be(raw.subarray(2)) : raw.toString('latin1'));
	}
	return out;
}

describe('toUnits — composición de texto con estilos mezclados', () => {
	const pieces = (md: string) => flattenInline((marked.lexer(md)[0] as never as { tokens: never[] }).tokens);

	it('recuerda si había espacio entre trozos de distinto estilo', () => {
		// Regresión: "**SERVIR**?" salía impreso como "SERVIR ?".
		const units = toUnits(pieces('¿Qué es **SERVIR**?'));
		const servir = units.findIndex((u) => u.text === 'SERVIR?');
		// marked une el signo al trozo siguiente; lo que importa es que ninguna
		// unidad quede marcada con un espacio que no existía.
		const texts = units.map((u) => `${u.spaceBefore ? ' ' : ''}${u.text}`).join('');
		expect(texts).toBe('¿Qué es SERVIR?');
		expect(servir === -1 || units[servir].spaceBefore === false).toBe(true);
	});

	it('conserva los espacios que sí existían', () => {
		const units = toUnits(pieces('Amando a **Dios** a través del Servicio'));
		expect(units.map((u) => `${u.spaceBefore ? ' ' : ''}${u.text}`).join('')).toBe(
			'Amando a Dios a través del Servicio',
		);
	});

	it('marca en negrita solo el trozo que lo lleva', () => {
		const units = toUnits(pieces('normal **fuerte** normal'));
		expect(units.find((u) => u.text === 'fuerte')?.bold).toBe(true);
		expect(units.find((u) => u.text === 'normal')?.bold).toBeFalsy();
	});

	it('el italic forzado (citas) no pisa el resto de estilos', () => {
		const units = toUnits(pieces('cita con **énfasis**'), true);
		expect(units.every((u) => u.italic)).toBe(true);
		expect(units.find((u) => u.text === 'énfasis')?.bold).toBe(true);
	});

	it('los saltos explícitos viajan como unidad propia', () => {
		const units = toUnits([{ text: 'uno\ndos' }]);
		expect(units.map((u) => (u.newline ? '\\n' : u.text))).toEqual(['uno', '\\n', 'dos']);
	});
});

describe('buildPreparationPdf', () => {
	it('produce un PDF válido y con peso real', async () => {
		const pdf = await buildRaw();
		expect(pdf.startsWith('%PDF-')).toBe(true);
		expect(pdf).toContain('%%EOF');
		expect(pdf.length).toBeGreaterThan(3000);
	});

	it('incluye los marcadores con los títulos del documento', async () => {
		const titles = outlineTitlesDecoded(await buildRaw());
		expect(titles).toContain('Introducción');
		expect(titles).toContain('Reglamento');
		expect(titles).toContain('Fechas y horarios');
	});

	it('los títulos con acentos y guiones conservan sus espacios', async () => {
		// El bug del BOM: sin él, un visor lee UTF-16 como PDFDocEncoding y las
		// palabras salen pegadas ("1ªpreparación—Servicio").
		const titles = outlineTitlesDecoded(await buildRaw());
		const conAcentos = titles.find((t) => t.includes('preparación'));
		expect(conAcentos).toBe('1ª preparación — Servicio');
	});

	it('marca el documento para que el panel de marcadores se abra solo', async () => {
		const pdf = await buildRaw();
		expect(pdf).toContain('/PageMode');
		expect(pdf).toContain('/UseOutlines');
	});

	it('pagina un documento largo y numera las páginas', async () => {
		const largo = `${MARKDOWN}\n\n${'Un párrafo de relleno bastante largo. '.repeat(200)}`;
		const pdf = await buildRaw(largo);
		const pages = [...pdf.matchAll(/\/Type\s*\/Page[^s]/g)].length;
		expect(pages).toBeGreaterThan(1);
	});

	it('no se rompe sin markdown ni encabezado', async () => {
		const blob = await buildPreparationPdf({ title: 'Vacío', markdown: '' });
		expect(blob.size).toBeGreaterThan(0);
	});

	it('tolera una imagen que no se puede cargar', async () => {
		// En el navegador es un fetch; si falla, el documento debe salir igual.
		const blob = await buildPreparationPdf({
			title: 'Con imagen',
			markdown: '![x](/preparation-assets/no-existe/img.png)\n\nTexto después.',
		});
		expect(blob.size).toBeGreaterThan(0);
	});
});
