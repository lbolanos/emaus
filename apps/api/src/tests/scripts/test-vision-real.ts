/**
 * Test the vision model with a real screenshot.
 * Usage: pnpm --filter api test:vision:real <path-to-image>
 */
import 'dotenv/config';
import { generateObject } from 'ai';
import { z } from 'zod';
import { config } from '../../config';
import { getVisionModel } from '../../services/aiChatService';
import fs from 'fs';
import path from 'path';

const TablePhotoSchema = z.object({
	foundIds: z.array(z.number()).describe('Todos los números enteros que puedas leer en la imagen, sin filtrar'),
	unreadable: z.array(z.string()).describe('Descripciones de tarjetas o números que no puedas leer con certeza'),
	notes: z.string().describe('Observaciones generales sobre la imagen'),
});

const VISION_PROMPT = `Eres un lector de números. Tu ÚNICA tarea es extraer los números enteros visibles en esta imagen.

La imagen muestra tarjetas o papelitos con números escritos o impresos, posiblemente del sistema de retiros Emaús.

INSTRUCCIONES ESTRICTAS:
1. Lee SOLO los números que realmente puedas ver escritos en la imagen.
2. NO inventes números. Si no ves números claros, devuelve foundIds vacío.
3. Si la imagen es borrosa, oscura o no muestra números legibles, devuelve foundIds vacío y explica en notes.
4. Incluye en "unreadable" cualquier número parcialmente visible que no puedas leer con certeza.
5. Ignora texto que no sea números (nombres, palabras, logos).
6. Es MEJOR devolver menos números que inventar números que no están en la imagen.`;

async function run() {
	const imagePath = process.argv[2] || '/mnt/d/Users/lbola/OneDrive/Pictures/Capturas de pantalla/Captura de pantalla 2026-04-14 230026.png';

	if (!fs.existsSync(imagePath)) {
		console.error(`File not found: ${imagePath}`);
		process.exit(1);
	}

	const ext = path.extname(imagePath).toLowerCase();
	const mimeMap: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
	const mimeType = mimeMap[ext] || 'image/png';

	const imageBuffer = fs.readFileSync(imagePath);
	const sizeKB = Math.round(imageBuffer.length / 1024);

	console.log('=== Test: Vision Model — Real Image ===');
	console.log(`Model: ${config.ai.visionModel}`);
	console.log(`Base URL: ${config.ai.anthropicBaseUrl || '(default)'}`);
	console.log(`Image: ${imagePath} (${sizeKB}KB, ${mimeType})`);
	console.log('');

	// Expected numbers (from the screenshot: 26, 28, 29, 31, 33, 35)
	const expected = [26, 28, 29, 31, 33, 35];
	console.log(`Números esperados (visual): [${expected.join(', ')}]`);
	console.log('');

	try {
		const start = Date.now();
		const { object } = await generateObject({
			model: getVisionModel(),
			mode: 'json',
			schema: TablePhotoSchema,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'image', image: imageBuffer, mimeType: mimeType as 'image/png' },
						{ type: 'text', text: VISION_PROMPT },
					],
				},
			],
		});
		const elapsed = Date.now() - start;

		const found = object.foundIds.sort((a, b) => a - b);
		const correct = found.filter((n) => expected.includes(n));
		const missed = expected.filter((n) => !found.includes(n));
		const hallucinated = found.filter((n) => !expected.includes(n));

		console.log(`Encontrados:    [${found.join(', ')}]`);
		console.log(`Correctos:      [${correct.join(', ')}] (${correct.length}/${expected.length})`);
		if (missed.length > 0) console.log(`⚠️  No leídos:  [${missed.join(', ')}]`);
		if (hallucinated.length > 0) console.log(`❌ Inventados:  [${hallucinated.join(', ')}]`);
		if (object.unreadable.length > 0) console.log(`Ilegibles:      ${JSON.stringify(object.unreadable)}`);
		console.log(`Notas:          ${object.notes}`);
		console.log('');
		console.log(`${correct.length === expected.length && hallucinated.length === 0 ? '✅' : '⚠️'} Resultado (${elapsed}ms): ${correct.length}/${expected.length} correctos, ${hallucinated.length} inventados`);
	} catch (error: any) {
		console.log(`❌ Error: ${error.message}`);
	}
}

run().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
