/**
 * Test vision using z.ai's OpenAI-compatible endpoint with glm-5v-turbo.
 * Usage: pnpm --filter api test:vision:openai
 */
import 'dotenv/config';
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { config } from '../../config';
import fs from 'fs';

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

async function testWithOpenAI(modelId: string, apiKey: string, baseURL: string, imageBuffer: Buffer) {
	console.log(`--- ${modelId} (OpenAI endpoint) ---`);
	try {
		const openai = createOpenAI({ apiKey, baseURL });
		const model = openai.chat(modelId);

		// Convert to base64 data URL for OpenAI format
		const base64 = imageBuffer.toString('base64');
		const dataUrl = `data:image/png;base64,${base64}`;

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

		console.log(`   Encontrados: [${found.join(', ')}]`);
		console.log(`   Correctos: ${correct.length}/${EXPECTED.length} | Inventados: ${hallucinated.length} | Tiempo: ${elapsed}ms`);
		if (missed.length > 0) console.log(`   No leídos: [${missed.join(', ')}]`);
		if (hallucinated.length > 0) console.log(`   Inventados: [${hallucinated.join(', ')}]`);
		console.log(`   Notas: ${object.notes.slice(0, 200)}`);
	} catch (error: any) {
		console.log(`   ❌ Error: ${error.message.slice(0, 300)}`);
	}
	console.log('');
}

async function testWithAnthropic(modelId: string, apiKey: string, baseURL: string, imageBuffer: Buffer) {
	console.log(`--- ${modelId} (Anthropic endpoint) ---`);
	try {
		const anthropic = createAnthropic({ apiKey, baseURL });
		const model = anthropic(modelId);

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

		console.log(`   Encontrados: [${found.join(', ')}]`);
		console.log(`   Correctos: ${correct.length}/${EXPECTED.length} | Inventados: ${hallucinated.length} | Tiempo: ${elapsed}ms`);
		if (missed.length > 0) console.log(`   No leídos: [${missed.join(', ')}]`);
		if (hallucinated.length > 0) console.log(`   Inventados: [${hallucinated.join(', ')}]`);
		console.log(`   Notas: ${object.notes.slice(0, 200)}`);
	} catch (error: any) {
		console.log(`   ❌ Error: ${error.message.slice(0, 300)}`);
	}
	console.log('');
}

async function run() {
	const imagePath = '/mnt/d/Users/lbola/OneDrive/Pictures/Capturas de pantalla/Captura de pantalla 2026-04-14 230026.png';
	const imageBuffer = fs.readFileSync(imagePath);

	console.log('=== Test: Vision — OpenAI vs Anthropic endpoint ===');
	console.log(`Imagen: ${Math.round(imageBuffer.length / 1024)}KB`);
	console.log(`Números esperados: [${EXPECTED.join(', ')}]`);
	console.log('');

	// glm-5v-turbo via OpenAI endpoint (the CORRECT way per z.ai docs)
	await testWithOpenAI(
		'glm-5v-turbo',
		config.ai.openaiApiKey,
		'https://api.z.ai/api/paas/v4',
		imageBuffer,
	);

	// Haiku via Anthropic endpoint (current setup)
	await testWithAnthropic(
		'claude-3-5-haiku-20241022',
		config.ai.anthropicApiKey,
		'https://api.z.ai/api/anthropic/v1',
		imageBuffer,
	);

	// Haiku via Anthropic endpoint with the other key
	await testWithAnthropic(
		'claude-3-5-haiku-20241022',
		'b625667c9ebf4a61bfb6d184c2d94132.hFo4CirlQz3AUoEa',
		'https://api.z.ai/api/anthropic/v1',
		imageBuffer,
	);

	console.log('=== Tests complete ===');
}

run().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
