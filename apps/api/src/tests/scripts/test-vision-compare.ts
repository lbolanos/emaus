/**
 * Compare vision models on the same real image.
 * Usage: pnpm --filter api test:vision:compare
 */
import 'dotenv/config';
import { generateObject } from 'ai';
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

La imagen muestra tarjetas o papelitos con números escritos o impresos, posiblemente del sistema de retiros Emaús.

INSTRUCCIONES ESTRICTAS:
1. Lee SOLO los números que realmente puedas ver escritos en la imagen.
2. NO inventes números. Si no ves números claros, devuelve foundIds vacío.
3. Si la imagen es borrosa, oscura o no muestra números legibles, devuelve foundIds vacío y explica en notes.
4. Incluye en "unreadable" cualquier número parcialmente visible que no puedas leer con certeza.
5. Ignora texto que no sea números (nombres, palabras, logos).
6. Es MEJOR devolver menos números que inventar números que no están en la imagen.`;

const EXPECTED = [26, 28, 29, 31, 33, 35];

interface ModelConfig {
	id: string;
	apiKey?: string;
	baseURL?: string;
}

const MODELS_TO_TEST: ModelConfig[] = [
	{ id: 'claude-3-5-haiku-20241022' },
	{ id: 'glm-4.6v', apiKey: 'b625667c9ebf4a61bfb6d184c2d94132.hFo4CirlQz3AUoEa', baseURL: 'https://api.z.ai/api/anthropic/v1' },
	{ id: 'claude-sonnet-4-20250514' },
	{ id: 'claude-3-5-sonnet-20241022' },
];

async function testModel(modelConfig: ModelConfig, imageBuffer: Buffer) {
	const modelId = modelConfig.id;
	console.log(`--- ${modelId} ---`);
	try {
		const model = createAnthropic({
			apiKey: modelConfig.apiKey || config.ai.anthropicApiKey,
			baseURL: modelConfig.baseURL || config.ai.anthropicBaseUrl || undefined,
		})(modelId);

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
		console.log(`   Notas: ${object.notes.slice(0, 150)}`);
	} catch (error: any) {
		console.log(`   ❌ Error: ${error.message.slice(0, 150)}`);
	}
	console.log('');
}

async function run() {
	const imagePath = '/mnt/d/Users/lbola/OneDrive/Pictures/Capturas de pantalla/Captura de pantalla 2026-04-14 230026.png';
	const imageBuffer = fs.readFileSync(imagePath);

	console.log('=== Comparación de modelos de visión ===');
	console.log(`Imagen: ${Math.round(imageBuffer.length / 1024)}KB`);
	console.log(`Números esperados: [${EXPECTED.join(', ')}]`);
	console.log(`Base URL: ${config.ai.anthropicBaseUrl || '(default)'}`);
	console.log('');

	for (const modelConfig of MODELS_TO_TEST) {
		await testModel(modelConfig, imageBuffer);
	}

	console.log('=== Comparación completa ===');
}

run().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
