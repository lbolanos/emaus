/**
 * Test script for the Vision model (photo number reader).
 * Verifies that the vision model correctly reads numbers from images
 * and does NOT hallucinate numbers it wasn't given.
 *
 * Usage: pnpm --filter api test:vision
 */
import 'dotenv/config';
import { generateObject } from 'ai';
import { z } from 'zod';
import { config } from '../../config';
import { getVisionModel } from '../../services/aiChatService';
import sharp from 'sharp';

const TablePhotoSchema = z.object({
	foundIds: z.array(z.number()).describe('Todos los números enteros que puedas leer en la imagen, sin filtrar'),
	unreadable: z.array(z.string()).describe('Descripciones de tarjetas o números que no puedas leer con certeza'),
	notes: z.string().describe('Observaciones generales sobre la imagen'),
});

// Generate a test image with specific numbers using SVG → PNG via sharp
async function createTestImage(numbers: number[]): Promise<Buffer> {
	const cardW = 100;
	const cardH = 60;
	const cols = Math.min(numbers.length, 5);
	const rows = Math.ceil(numbers.length / cols);
	const padding = 20;
	const width = cols * (cardW + padding) + padding;
	const height = rows * (cardH + padding) + padding;

	const cards = numbers.map((num, i) => {
		const col = i % cols;
		const row = Math.floor(i / cols);
		const x = padding + col * (cardW + padding);
		const y = padding + row * (cardH + padding);
		return `
			<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="6" fill="#f0f0f0" stroke="#333" stroke-width="2"/>
			<text x="${x + cardW / 2}" y="${y + cardH / 2 + 10}" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#111">${num}</text>
		`;
	}).join('');

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
		<rect width="${width}" height="${height}" fill="#ffffff"/>
		${cards}
	</svg>`;

	return await sharp(Buffer.from(svg)).png().toBuffer();
}

async function createBlankImage(): Promise<Buffer> {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
		<rect width="200" height="100" fill="#87ceeb"/>
		<rect y="60" width="200" height="40" fill="#228b22"/>
	</svg>`;
	return await sharp(Buffer.from(svg)).png().toBuffer();
}

const VISION_PROMPT = `Eres un lector de números. Tu ÚNICA tarea es extraer los números enteros visibles en esta imagen.

La imagen muestra tarjetas o papelitos con números escritos o impresos, posiblemente del sistema de retiros Emaús.

INSTRUCCIONES ESTRICTAS:
1. Lee SOLO los números que realmente puedas ver escritos en la imagen.
2. NO inventes números. Si no ves números claros, devuelve foundIds vacío.
3. Si la imagen es borrosa, oscura o no muestra números legibles, devuelve foundIds vacío y explica en notes.
4. Incluye en "unreadable" cualquier número parcialmente visible que no puedas leer con certeza.
5. Ignora texto que no sea números (nombres, palabras, logos).
6. Es MEJOR devolver menos números que inventar números que no están en la imagen.`;

async function runVisionTest(testName: string, numbers: number[], description: string) {
	console.log(`--- ${testName}: ${description} ---`);
	try {
		const imageBuffer = await createTestImage(numbers);
		const start = Date.now();

		const { object } = await generateObject({
			model: getVisionModel(),
			mode: 'json',
			schema: TablePhotoSchema,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'image', image: imageBuffer, mimeType: 'image/png' as const },
						{ type: 'text', text: VISION_PROMPT },
					],
				},
			],
		});

		const elapsed = Date.now() - start;
		const found = object.foundIds.sort((a, b) => a - b);
		const expected = [...numbers].sort((a, b) => a - b);

		const correct = found.filter((n) => expected.includes(n));
		const missed = expected.filter((n) => !found.includes(n));
		const hallucinated = found.filter((n) => !expected.includes(n));

		const allCorrect = missed.length === 0 && hallucinated.length === 0;

		console.log(`   Esperados:      [${expected.join(', ')}]`);
		console.log(`   Encontrados:    [${found.join(', ')}]`);
		console.log(`   Correctos:      [${correct.join(', ')}] (${correct.length}/${expected.length})`);
		if (missed.length > 0) console.log(`   ⚠️  No leídos:  [${missed.join(', ')}]`);
		if (hallucinated.length > 0) console.log(`   ❌ Inventados:  [${hallucinated.join(', ')}]`);
		if (object.unreadable.length > 0) console.log(`   Ilegibles:      ${JSON.stringify(object.unreadable)}`);
		console.log(`   Notas:          ${object.notes}`);
		console.log(`   ${allCorrect ? '✅' : '⚠️'} Resultado (${elapsed}ms): ${correct.length}/${expected.length} correctos, ${hallucinated.length} inventados`);
	} catch (error: any) {
		console.log(`   ❌ Error: ${error.message}`);
	}
	console.log('');
}

async function runHallucinationTest() {
	console.log('--- Test 4: Imagen sin números (anti-alucinación) ---');
	try {
		const imageBuffer = await createBlankImage();
		const start = Date.now();

		const { object } = await generateObject({
			model: getVisionModel(),
			mode: 'json',
			schema: TablePhotoSchema,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'image', image: imageBuffer, mimeType: 'image/png' as const },
						{ type: 'text', text: VISION_PROMPT },
					],
				},
			],
		});

		const elapsed = Date.now() - start;
		const passed = object.foundIds.length === 0;
		console.log(`   Encontrados: [${object.foundIds.join(', ')}]`);
		console.log(`   Notas: ${object.notes}`);
		console.log(`   ${passed ? '✅' : '❌'} Resultado (${elapsed}ms): ${passed ? 'Correcto, no inventó números' : `FALLÓ: inventó ${object.foundIds.length} números`}`);
	} catch (error: any) {
		console.log(`   ❌ Error: ${error.message}`);
	}
	console.log('');
}

async function runTests() {
	console.log('=== Test: Vision Model ===');
	console.log(`Model: ${config.ai.visionModel}`);
	console.log(`Provider: ${config.ai.visionProvider}`);
	console.log('');

	await runVisionTest('Test 1', [3, 17, 42], 'Pocos números claros');
	await runVisionTest('Test 2', [1, 9, 18, 26, 30, 35, 47], 'Varios números');
	await runVisionTest('Test 3', [29, 26, 30], 'Los números del issue original');
	await runHallucinationTest();

	console.log('=== Vision tests complete ===');
}

runTests().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
