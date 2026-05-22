#!/usr/bin/env node
// Repro streamText + tools + image with gemini-3-pro-preview
import fs from 'node:fs';
import sharp from 'sharp';
import 'dotenv/config';
import { streamText, jsonSchema, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';

const IMAGE_PATH = '/Users/lbolanos/Downloads/IMG20260520214900.jpg';

async function preprocess() {
	const raw = fs.readFileSync(IMAGE_PATH);
	const resized = await sharp(raw)
		.rotate()
		.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 85 })
		.toBuffer();
	return resized;
}

async function testWith(modelId) {
	console.log(`\n━━━ ${modelId} ━━━`);
	const img = await preprocess();
	try {
		const result = streamText({
			model: google(modelId),
			system: 'Eres un asistente. Cuando recibas una imagen con lista de asistencia, extrae los nombres y llama findCommunityMember para cada uno.',
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: 'esta es la lista de asistencia' },
						{ type: 'image', image: img, mediaType: 'image/jpeg' },
					],
				},
			],
			maxOutputTokens: 16384,
			stopWhen: stepCountIs(8),
			onError: ({ error }) => {
				console.error('  ❌ onError:', error?.message || error);
			},
			tools: {
				findCommunityMember: {
					description: 'Busca un miembro de la comunidad por nombre o teléfono.',
					inputSchema: jsonSchema({
						type: 'object',
						properties: {
							communityId: { type: 'string' },
							query: { type: 'string' },
						},
						required: ['communityId', 'query'],
					}),
					execute: async ({ query }) => {
						console.log(`    [tool] findCommunityMember(${query})`);
						return { count: 0, members: [] };
					},
				},
			},
		});
		let text = '';
		let chunks = 0;
		for await (const part of result.fullStream) {
			chunks++;
			if (part.type === 'text-delta') text += part.delta;
			else if (part.type === 'tool-call') console.log(`    [tool-call] ${part.toolName}`, JSON.stringify(part.input).slice(0, 100));
			else if (part.type === 'error') console.error('    [error event]', part.error);
			else if (part.type === 'finish' || part.type === 'finish-step') {
				console.log(`    [${part.type}] finishReason=${part.finishReason || '?'}`);
			}
		}
		console.log(`  ✓ stream completed. chunks=${chunks}, textLen=${text.length}`);
		if (text) console.log(`  text preview: ${text.slice(0, 300)}`);
	} catch (e) {
		console.error(`  ❌ throw:`, e?.message || e);
		if (e?.cause) console.error(`     cause:`, e.cause);
	}
}

(async () => {
	await testWith('gemini-3-pro-preview');
	await testWith('gemini-2.5-flash');
})();
