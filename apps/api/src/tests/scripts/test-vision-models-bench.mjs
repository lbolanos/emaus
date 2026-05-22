#!/usr/bin/env node
// Vision model OCR shootout — handwritten attendance list extraction.
// Run from emaus/apps/api so node_modules resolves: cd apps/api && node /tmp/test-vision-models.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import 'dotenv/config';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const IMAGE_PATH = '/Users/lbolanos/Downloads/IMG20260520214900.jpg';

// Mirror the widget's client-side resize to be fair: 1600px long side, JPEG 0.85.
async function preprocess() {
	const raw = fs.readFileSync(IMAGE_PATH);
	const resized = await sharp(raw)
		.rotate() // honor EXIF orientation
		.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 85 })
		.toBuffer();
	console.log(`Image: raw=${(raw.length / 1024).toFixed(0)} KB → resized=${(resized.length / 1024).toFixed(0)} KB`);
	return resized;
}

// Structured output schema — forces row-by-row + confidence per cell.
const schema = z.object({
	rows: z.array(
		z.object({
			rowNumber: z.number().describe('Número de fila visible en la hoja (1, 2, 3...). Ignora encabezados.'),
			name: z.string().nullable().describe('Nombre tal cual aparece. null si la celda está vacía o totalmente ilegible.'),
			phone: z.string().nullable().describe('Teléfono normalizado a solo dígitos. null si está vacío o ilegible.'),
			confidence: z.enum(['alta', 'media', 'baja']).describe('Tu confianza en la lectura de esta fila.'),
		}),
	),
	headerDetected: z.boolean().describe('¿La hoja tiene encabezados como "Nombre", "Teléfono"? Devuelve true si los hay (los excluiste de rows).'),
	totalRowsVisible: z.number().describe('Número total de filas con datos visibles (excluyendo encabezado y filas vacías).'),
});

const promptText = `Esta es una foto de una hoja manuscrita con una lista de asistencia a una reunión. Tiene una tabla con columnas "Nombre" y "Teléfono".

INSTRUCCIONES ESTRICTAS:
1. IGNORA el encabezado de la tabla ("Nombre", "Teléfono", título "Reunión", fecha). NO los trates como datos.
2. Lee cada FILA horizontalmente, de arriba a abajo. El número al inicio de cada fila te indica el orden (1, 2, 3...).
3. El teléfono de una fila va con el nombre de ESA misma fila. NO emparejes con la fila siguiente si un dato falta — devuelve null y marca confidence='baja'.
4. NO inventes texto que no veas claramente. Si una letra es ambigua, prefiere null.
5. Normaliza teléfonos a SOLO dígitos (sin espacios ni guiones).
6. Si la imagen está rotada, oriéntala mentalmente antes de leer.

Devuelve la lista completa en el schema solicitado.`;

const models = [
	// Google direct API key — newer 3.x family
	{ id: 'google/gemini-3.5-flash', factory: () => google('gemini-3.5-flash') },
	{ id: 'google/gemini-3.1-pro-preview', factory: () => google('gemini-3.1-pro-preview') },
	{ id: 'google/gemini-3.1-flash-lite', factory: () => google('gemini-3.1-flash-lite') },
	{ id: 'google/gemini-3-pro-preview', factory: () => google('gemini-3-pro-preview') },
	{ id: 'google/gemini-3-flash-preview', factory: () => google('gemini-3-flash-preview') },
	{ id: 'google/gemini-flash-latest', factory: () => google('gemini-flash-latest') },
	{ id: 'google/gemini-pro-latest', factory: () => google('gemini-pro-latest') },
];

function fmtPhone(p) {
	if (!p) return '—';
	const d = p.replace(/\D/g, '');
	if (d.length === 10) return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
	return d || '—';
}

async function runOne(modelDef, imageBuffer) {
	const start = Date.now();
	try {
		const result = await generateObject({
			model: modelDef.factory(),
			schema,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: promptText },
						{ type: 'image', image: imageBuffer, mediaType: 'image/jpeg' },
					],
				},
			],
		});
		const dur = Date.now() - start;
		return { ok: true, durationMs: dur, data: result.object, usage: result.usage };
	} catch (e) {
		const dur = Date.now() - start;
		return { ok: false, durationMs: dur, error: e?.message || String(e) };
	}
}

(async () => {
	const imageBuffer = await preprocess();
	console.log(`\nPrompt:\n${promptText}\n`);
	console.log(`Probing ${models.length} models with the same image + schema...\n`);
	console.log('━'.repeat(80));

	for (const m of models) {
		console.log(`\n▶ ${m.id}`);
		const r = await runOne(m, imageBuffer);
		if (!r.ok) {
			console.log(`  ✗ FAIL (${r.durationMs}ms): ${r.error.slice(0, 300)}`);
			continue;
		}
		const d = r.data;
		console.log(`  ✓ OK ${r.durationMs}ms  rows=${d.rows.length}  totalRowsVisible=${d.totalRowsVisible}  headerDetected=${d.headerDetected}`);
		if (r.usage) {
			console.log(`  usage: input=${r.usage.inputTokens ?? '?'} output=${r.usage.outputTokens ?? '?'} total=${r.usage.totalTokens ?? '?'}`);
		}
		console.log(`  ┌─────┬────────────────────────────────┬─────────────────┬──────┐`);
		console.log(`  │   # │ Nombre                         │ Teléfono        │ Conf │`);
		console.log(`  ├─────┼────────────────────────────────┼─────────────────┼──────┤`);
		for (const row of d.rows) {
			const num = String(row.rowNumber ?? '?').padStart(3, ' ');
			const name = (row.name ?? '∅').slice(0, 30).padEnd(30, ' ');
			const phone = fmtPhone(row.phone).padEnd(15, ' ');
			console.log(`  │ ${num} │ ${name} │ ${phone} │ ${row.confidence.padEnd(4, ' ')} │`);
		}
		console.log(`  └─────┴────────────────────────────────┴─────────────────┴──────┘`);
	}
	console.log('\n' + '━'.repeat(80));
	console.log('Done.');
})();
