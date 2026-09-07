import { test, expect, type APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * E2E coverage for the "Descargar PDF" button of a preparation document.
 *
 * A coordinator reported (2026-09-07) that the PDF was missing the pictures the
 * .docx had. Only 4 of the 13 images across the default documents made it: the
 * renderer drew an image only when the paragraph was exclusively an image, and
 * in these documents —converted from .docx— the picture sits glued to the text
 * with no blank line, so marked keeps it INSIDE the paragraph (or inside a
 * heading, as in the 3rd preparation's `## ![](…)`).
 *
 * Unit tests cover the renderer, but nothing covered the button: the PDF is
 * built in the browser with jsPDF and its images are fetched over HTTP from
 * `/preparation-assets/…`, so a deployment that ships the templates without the
 * assets would still produce a picture-less PDF with every unit test green.
 *
 * The spec drives the PUBLIC calendar, which needs no login, and only issues
 * GETs: nothing is written to the database.
 *
 * Needs a public retreat (slug + isPublic) whose preparations carry a markdown
 * document with images. Defaults to the dev database's retreat; override with
 * E2E_PREPARATIONS_SLUG.
 */

// The UI copy asserted below is the Spanish one, so pin the locale: Playwright
// defaults to en-US and the app follows navigator.language when nothing is stored.
test.use({ locale: 'es-MX' });

const SLUG = process.env.E2E_PREPARATIONS_SLUG ?? 'delvalleii';
const IMAGE_REF = /!\[[^\]]*\]\([^)]+\)/g;

interface PreparationDoc {
	id: string;
	kind: 'file' | 'markdown';
	fileName: string;
	renderedContent?: string | null;
}

interface Preparation {
	weekNumber: number | null;
	documents?: PreparationDoc[];
}

/**
 * The markdown document with the most images: it is the one that exposes the
 * bug best, and picking it by content keeps the spec working on any database
 * instead of hardcoding a week.
 */
async function documentWithMostImages(
	request: APIRequestContext,
): Promise<{ doc: PreparationDoc; images: number } | null> {
	const response = await request.get(`/api/retreat-preparations/public/${SLUG}`);
	if (!response.ok()) return null;

	const preparations: Preparation[] = (await response.json())?.preparations ?? [];
	const candidates = preparations
		.flatMap((prep) => prep.documents ?? [])
		.filter((doc) => doc.kind === 'markdown')
		.map((doc) => ({ doc, images: (doc.renderedContent ?? '').match(IMAGE_REF)?.length ?? 0 }))
		.sort((a, b) => b.images - a.images);

	return candidates[0]?.images ? candidates[0] : null;
}

test('el PDF de una preparación incrusta las imágenes del documento', async ({ page, request }) => {
	const richest = await documentWithMostImages(request);
	test.skip(
		!richest,
		`El retiro público "${SLUG}" no tiene ningún documento markdown con imágenes (¿otra base? usá E2E_PREPARATIONS_SLUG)`,
	);
	const { doc, images } = richest!;
	const baseName = doc.fileName.replace(/\.md$/i, '');

	await page.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
	await page.goto(`/preparaciones/${SLUG}`);

	// El documento se abre desde el calendario; esperar a que esté montado antes
	// de tocarlo (si no, el clic se va al vacío y el fallo aparece más adelante).
	const opener = page.getByRole('button', { name: baseName });
	await expect(opener).toBeVisible();
	await opener.click();

	const pdfButton = page.getByRole('button', { name: 'Descargar PDF' });
	await expect(pdfButton).toBeVisible();

	const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
	await pdfButton.click();
	const download = await downloadPromise;

	// Normalizado a NFC en los dos lados: en macOS, WebKit devuelve el nombre
	// sugerido en NFD ("o" + acento combinante), así que "Oración.pdf" no es la
	// misma cadena que la del documento aunque en pantalla se vean idénticas.
	expect(download.suggestedFilename().normalize('NFC')).toBe(`${baseName}.pdf`.normalize('NFC'));

	const saved = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'emaus-pdf-')), 'preparacion.pdf');
	await download.saveAs(saved);
	const pdf = fs.readFileSync(saved).toString('latin1');

	expect(pdf.startsWith('%PDF-')).toBe(true);

	// Una imagen por referencia del markdown. `toBeGreaterThanOrEqual` y no una
	// igualdad: jsPDF emite un XObject extra como máscara de cada PNG con canal
	// alfa, y reutiliza uno solo si dos imágenes son idénticas.
	const embedded = pdf.match(/\/Subtype\s*\/Image/g)?.length ?? 0;
	expect(embedded).toBeGreaterThanOrEqual(images);

	// El panel de marcadores desplegado es la otra mitad de la feature.
	expect(pdf).toContain('/UseOutlines');
});
