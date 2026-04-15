/**
 * Test script for the AI Chat model (Jessy).
 * Verifies that the chat model responds correctly with the real system prompt.
 *
 * Usage: pnpm --filter api test:chat
 */
import 'dotenv/config';
import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { config } from '../../config';

function getModel() {
	const { provider, model } = config.ai;
	switch (provider) {
		case 'anthropic':
			return createAnthropic({
				apiKey: config.ai.anthropicApiKey,
				baseURL: config.ai.anthropicBaseUrl || undefined,
			})(model);
		case 'google':
			return google(model);
		case 'openai':
			return createOpenAI({
				apiKey: config.ai.openaiApiKey,
				baseURL: config.ai.openaiBaseUrl || undefined,
			}).chat(model);
		default:
			throw new Error(`Unknown AI provider: ${provider}`);
	}
}

const systemPrompt = `Eres Jessy, la asistente virtual del sistema de gestión de retiros Emaús.
Responde siempre en español. Sé concisa y útil.
Esto es una prueba del sistema. Confirma que estás funcionando.`;

async function runTests() {
	console.log('=== Test: Chat Model ===');
	console.log(`Provider: ${config.ai.provider}`);
	console.log(`Model: ${config.ai.model}`);
	console.log(`Base URL: ${config.ai.anthropicBaseUrl || config.ai.openaiBaseUrl || '(default)'}`);
	console.log('');

	// Test 1: Basic response
	console.log('--- Test 1: Respuesta básica ---');
	try {
		const start = Date.now();
		const { text } = await generateText({
			model: getModel(),
			system: systemPrompt,
			prompt: 'Hola Jessy, ¿estás funcionando?',
			maxTokens: 200,
		});
		const elapsed = Date.now() - start;
		console.log(`✅ Respuesta (${elapsed}ms): ${text.slice(0, 200)}`);
	} catch (error: any) {
		console.log(`❌ Error: ${error.message}`);
	}
	console.log('');

	// Test 2: Number parsing (STT concatenation issue)
	console.log('--- Test 2: Separación de números concatenados (STT) ---');
	try {
		const start = Date.now();
		const { text } = await generateText({
			model: getModel(),
			system: `${systemPrompt}

IMPORTANTE — Reconocimiento de voz (STT):
El usuario puede enviar mensajes por voz. El reconocimiento de voz a veces CONCATENA números separados en uno solo.
Cuando recibas un número largo que NO corresponda a un idOnRetreat válido, intenta SEPARARLO en números más pequeños.
Los idOnRetreat en este retiro son: 1, 2, 5, 9, 18, 26, 30, 35, 42.`,
			prompt: 'agrega 23530 a la mesa 3',
			maxTokens: 300,
		});
		const elapsed = Date.now() - start;
		console.log(`✅ Respuesta (${elapsed}ms): ${text.slice(0, 300)}`);
		// Check if it tried to split the number
		const mentionsSplit = /2.*35.*30|separar|dividir|split/i.test(text);
		console.log(`   ¿Intentó separar "23530"? ${mentionsSplit ? '✅ Sí' : '⚠️ No detectado'}`);
	} catch (error: any) {
		console.log(`❌ Error: ${error.message}`);
	}
	console.log('');

	// Test 3: Spanish language consistency
	console.log('--- Test 3: Respuesta en español ---');
	try {
		const start = Date.now();
		const { text } = await generateText({
			model: getModel(),
			system: systemPrompt,
			prompt: 'What is your name and what can you do?',
			maxTokens: 200,
		});
		const elapsed = Date.now() - start;
		const isSpanish = /soy|puedo|ayudar|retiro|emaús|jessy/i.test(text);
		console.log(`${isSpanish ? '✅' : '⚠️'} Respuesta (${elapsed}ms): ${text.slice(0, 200)}`);
		console.log(`   ¿Respondió en español? ${isSpanish ? '✅ Sí' : '⚠️ No'}`);
	} catch (error: any) {
		console.log(`❌ Error: ${error.message}`);
	}
	console.log('');

	console.log('=== Chat tests complete ===');
}

runTests().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
