/**
 * Test vision using Google Gemini Flash.
 * Usage: pnpm --filter api test:vision:gemini
 */
import 'dotenv/config';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import fs from 'fs';

// Requires GOOGLE_GENERATIVE_AI_API_KEY in .env
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
	console.error('Error: GOOGLE_GENERATIVE_AI_API_KEY is not set. Add it to your .env file.');
	process.exit(1);
}

const TablePhotoSchema = z.object({
	foundIds: z.array(z.number()).describe('Todos los números enteros que puedas leer en la imagen, sin filtrar'),
	unreadable: z.array(z.string()).describe('Descripciones de tarjetas o números que no puedas leer con certeza'),
	notes: z.string().describe('Observaciones generales sobre la imagen'),
});

const VISION_PROMPT = `Eres un lector de números. Tu ÚNICA tarea es extraer los números enteros visibles en esta imagen.

La imagen muestra tarjetas del sistema de retiros Emaús con números grandes.

INSTRUCCIONES ESTRICTAS:
1. Lee SOLO los números grandes que aparecen en las tarjetas.
2. NO inventes números. Si no ves números claros, devuelve foundIds vacío.
3. Ignora texto que no sea los números principales de las tarjetas (ignora nombres, fechas, etc).
4. Es MEJOR devolver menos números que inventar números que no están en la imagen.`;

const EXPECTED = [26, 28, 29, 31, 33, 35];

const MODELS = [
	'gemini-2.5-flash',
	'gemini-2.5-pro',
];

async function testModel(modelId: string, imageBuffer: Buffer) {
	console.log(`--- ${modelId} ---`);
	try {
		const model = google(modelId);
		const start = Date.now();

		const { object } = await generateObject({
			model,
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
		const correct = found.filter((n) => EXPECTED.includes(n));
		const missed = EXPECTED.filter((n) => !found.includes(n));
		const hallucinated = found.filter((n) => !EXPECTED.includes(n));
		const perfect = missed.length === 0 && hallucinated.length === 0;

		console.log(`   Encontrados: [${found.join(', ')}]`);
		console.log(`   Correctos: ${correct.length}/${EXPECTED.length} | Inventados: ${hallucinated.length} | Tiempo: ${elapsed}ms`);
		if (missed.length > 0) console.log(`   No leídos: [${missed.join(', ')}]`);
		if (hallucinated.length > 0) console.log(`   Inventados: [${hallucinated.join(', ')}]`);
		console.log(`   Notas: ${object.notes.slice(0, 200)}`);
		console.log(`   ${perfect ? '✅ PERFECTO' : '⚠️'}`);
	} catch (error: any) {
		console.log(`   ❌ Error: ${error.message.slice(0, 300)}`);
	}
	console.log('');
}

async function run() {
	const imagePath = '/mnt/d/Users/lbola/OneDrive/Pictures/Capturas de pantalla/Captura de pantalla 2026-04-14 230026.png';
	const imageBuffer = fs.readFileSync(imagePath);

	console.log('=== Test: Vision — Google Gemini ===');
	console.log(`Imagen: ${Math.round(imageBuffer.length / 1024)}KB`);
	console.log(`Números esperados: [${EXPECTED.join(', ')}]`);
	console.log('');

	for (const modelId of MODELS) {
		await testModel(modelId, imageBuffer);
	}

	console.log('=== Tests complete ===');
}

run().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
