#!/usr/bin/env node
// Test: ¿el prompt nuevo separa correctamente los items de la foto de inventario?
import fs from 'node:fs';
import sharp from 'sharp';
import 'dotenv/config';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

const IMAGE_PATH = '/Users/lbolanos/Downloads/IMG20260521190546.jpg';

async function preprocess() {
	const raw = fs.readFileSync(IMAGE_PATH);
	const resized = await sharp(raw)
		.rotate()
		.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 85 })
		.toBuffer();
	return resized;
}

const schema = z.object({
	enumeration: z.array(z.string()).describe('Descripción libre item por item antes de matchear'),
	items: z.array(
		z.object({
			name: z.string().describe('Nombre del artículo'),
			quantity: z.number(),
			unit: z.string().describe('Unidad (piezas, cajas, litros, etc.)'),
			confidence: z.enum(['alta', 'media', 'baja']),
		}),
	),
	totalItemsDetected: z.number().describe('Número total de artículos DISTINTOS detectados'),
});

const promptText = `Esta es una foto del inventario. Tu tarea es identificar TODOS los artículos visibles distintos.

INSTRUCCIONES ESTRICTAS:
1. PRIMERO describe en \`enumeration\` cada artículo distinto que ves, una línea por artículo. Ejemplo:
   ["1 pluma azul Bic", "1 marcatextos amarillo Office Depot", "1 clip plateado", "5 hojas"]
2. NO agrupes productos diferentes bajo un nombre genérico:
   - 3 plumas + 2 lápices = DOS items distintos ("Plumas: 3", "Lápices: 2"), NO "útiles: 5"
   - Productos de color/marca/tipo distintos = items separados
3. Si un mismo producto aparece varias unidades idénticas (ej. 3 plumas idénticas), agrúpalas como UNA fila con cantidad total.
4. IGNORA el portapapeles/clipboard mismo, la mesa, la pared — solo los artículos sobre él.
5. \`totalItemsDetected\` debe coincidir con la longitud de \`items\`.

Devuelve la lista en el schema solicitado.`;

async function testWith(modelId) {
	console.log(`\n━━━ ${modelId} ━━━`);
	const img = await preprocess();
	const start = Date.now();
	try {
		const result = await generateObject({
			model: google(modelId),
			schema,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: promptText },
						{ type: 'image', image: img, mediaType: 'image/jpeg' },
					],
				},
			],
		});
		const dur = Date.now() - start;
		console.log(`✓ ${dur}ms  items=${result.object.items.length}  total=${result.object.totalItemsDetected}`);
		console.log(`\nEnumeración inicial (${result.object.enumeration.length} líneas):`);
		result.object.enumeration.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
		console.log(`\nItems extraídos:`);
		result.object.items.forEach((it, i) => {
			console.log(`  ${i + 1}. ${it.name} — ${it.quantity} ${it.unit} (conf: ${it.confidence})`);
		});
	} catch (e) {
		console.error(`✗ ${e?.message || e}`);
	}
}

(async () => {
	await testWith('gemini-3-pro-preview');
	await testWith('gemini-3.5-flash');
})();
