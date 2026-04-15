/**
 * Chat Conversation - Pure Logic Tests
 *
 * Tests the business logic for conversation persistence (save/load/delete).
 * No DB dependencies — tests the data transformation and validation logic.
 */

// ---- Extracted logic: generate conversation title from first user message ----

function generateTitle(messages: Array<{ role: string; parts?: Array<{ type: string; text?: string }> }>): string {
	const firstUserMsg = messages.find((m) => m.role === 'user');
	if (!firstUserMsg?.parts) return 'Conversación';
	const text = firstUserMsg.parts
		.filter((p) => p.type === 'text')
		.map((p) => p.text ?? '')
		.join('');
	return text.slice(0, 100) || 'Conversación';
}

// ---- Extracted logic: filter messages for storage (remove audio blobs) ----

function filterMessagesForStorage(msgs: any[]): any[] {
	return msgs.map((msg) => ({
		...msg,
		parts: msg.parts?.map((p: any) => {
			if (p.type === 'file') return { type: 'text', text: '(mensaje de voz)' };
			return p;
		}),
	}));
}

// ---- Extracted logic: validate conversation save request ----

interface SaveRequest {
	id?: string;
	messages: any[];
	retreatId?: string;
	title?: string;
}

function validateSaveRequest(body: Partial<SaveRequest>): { valid: boolean; error?: string } {
	if (!body.messages?.length) {
		return { valid: false, error: 'Messages required' };
	}
	return { valid: true };
}

// ---- Extracted logic: build conversation list response ----

interface ConversationRow {
	id: string;
	userId: string;
	title: string | null;
	retreatId: string | null;
	messages: string;
	createdAt: Date;
	updatedAt: Date;
}

function buildListResponse(rows: ConversationRow[]) {
	return rows.map(({ id, title, retreatId, createdAt, updatedAt }) => ({
		id,
		title,
		retreatId,
		createdAt,
		updatedAt,
	}));
}

function buildDetailResponse(row: ConversationRow) {
	return {
		...row,
		messages: JSON.parse(row.messages),
	};
}

// ============= TESTS =============

describe('Chat Conversation - Pure Logic Tests', () => {
	describe('generateTitle', () => {
		test('should extract title from first user message', () => {
			const messages = [
				{ role: 'user', parts: [{ type: 'text', text: 'Hola, necesito ayuda con las mesas' }] },
				{ role: 'assistant', parts: [{ type: 'text', text: 'Claro, te ayudo' }] },
			];
			expect(generateTitle(messages)).toBe('Hola, necesito ayuda con las mesas');
		});

		test('should truncate long messages to 100 chars', () => {
			const longText = 'A'.repeat(150);
			const messages = [
				{ role: 'user', parts: [{ type: 'text', text: longText }] },
			];
			expect(generateTitle(messages)).toHaveLength(100);
		});

		test('should return default when no user messages', () => {
			const messages = [
				{ role: 'assistant', parts: [{ type: 'text', text: 'Hola' }] },
			];
			expect(generateTitle(messages)).toBe('Conversación');
		});

		test('should return default for empty messages array', () => {
			expect(generateTitle([])).toBe('Conversación');
		});

		test('should skip non-text parts', () => {
			const messages = [
				{ role: 'user', parts: [
					{ type: 'file', url: 'data:audio/...' },
					{ type: 'text', text: 'Mensaje real' },
				] },
			];
			expect(generateTitle(messages)).toBe('Mensaje real');
		});

		test('should return default when user message has no text content', () => {
			const messages = [
				{ role: 'user', parts: [{ type: 'file', url: 'data:audio/...' }] },
			];
			expect(generateTitle(messages)).toBe('Conversación');
		});

		test('should handle messages without parts', () => {
			const messages = [{ role: 'user' }];
			expect(generateTitle(messages)).toBe('Conversación');
		});
	});

	describe('filterMessagesForStorage', () => {
		test('should replace file parts with text placeholder', () => {
			const msgs = [
				{ role: 'user', parts: [{ type: 'file', url: 'data:audio/webm;base64,...' }] },
			];
			const filtered = filterMessagesForStorage(msgs);
			expect(filtered[0].parts[0]).toEqual({ type: 'text', text: '(mensaje de voz)' });
		});

		test('should keep text parts unchanged', () => {
			const msgs = [
				{ role: 'user', parts: [{ type: 'text', text: 'Hola' }] },
			];
			const filtered = filterMessagesForStorage(msgs);
			expect(filtered[0].parts[0]).toEqual({ type: 'text', text: 'Hola' });
		});

		test('should handle mixed parts', () => {
			const msgs = [
				{
					role: 'user',
					parts: [
						{ type: 'file', url: 'data:audio/...' },
						{ type: 'text', text: 'Mensaje' },
					],
				},
			];
			const filtered = filterMessagesForStorage(msgs);
			expect(filtered[0].parts).toHaveLength(2);
			expect(filtered[0].parts[0].type).toBe('text');
			expect(filtered[0].parts[0].text).toBe('(mensaje de voz)');
			expect(filtered[0].parts[1].text).toBe('Mensaje');
		});

		test('should preserve other message properties', () => {
			const msgs = [
				{ id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hola' }] },
			];
			const filtered = filterMessagesForStorage(msgs);
			expect(filtered[0].id).toBe('msg-1');
			expect(filtered[0].role).toBe('user');
		});

		test('should handle empty array', () => {
			expect(filterMessagesForStorage([])).toEqual([]);
		});

		test('should handle messages without parts', () => {
			const msgs = [{ role: 'user' }];
			const filtered = filterMessagesForStorage(msgs);
			expect(filtered[0].parts).toBeUndefined();
		});
	});

	describe('validateSaveRequest', () => {
		test('should accept valid request with messages', () => {
			const result = validateSaveRequest({
				messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hola' }] }],
			});
			expect(result.valid).toBe(true);
		});

		test('should reject empty messages array', () => {
			const result = validateSaveRequest({ messages: [] });
			expect(result.valid).toBe(false);
			expect(result.error).toBe('Messages required');
		});

		test('should reject missing messages', () => {
			const result = validateSaveRequest({});
			expect(result.valid).toBe(false);
		});

		test('should accept request with optional id', () => {
			const result = validateSaveRequest({
				id: 'existing-id',
				messages: [{ role: 'user', parts: [] }],
			});
			expect(result.valid).toBe(true);
		});

		test('should accept request with optional retreatId', () => {
			const result = validateSaveRequest({
				messages: [{ role: 'user' }],
				retreatId: 'retreat-1',
			});
			expect(result.valid).toBe(true);
		});
	});

	describe('buildListResponse', () => {
		const rows: ConversationRow[] = [
			{
				id: 'conv-1',
				userId: 'user-1',
				title: 'Primera conversación',
				retreatId: 'retreat-1',
				messages: '[]',
				createdAt: new Date('2026-04-14T10:00:00Z'),
				updatedAt: new Date('2026-04-14T11:00:00Z'),
			},
			{
				id: 'conv-2',
				userId: 'user-1',
				title: null,
				retreatId: null,
				messages: '[{"role":"user"}]',
				createdAt: new Date('2026-04-13T10:00:00Z'),
				updatedAt: new Date('2026-04-13T10:00:00Z'),
			},
		];

		test('should exclude messages and userId from list', () => {
			const list = buildListResponse(rows);
			expect(list).toHaveLength(2);
			expect(list[0]).not.toHaveProperty('messages');
			expect(list[0]).not.toHaveProperty('userId');
		});

		test('should include id, title, retreatId, dates', () => {
			const list = buildListResponse(rows);
			expect(list[0]).toEqual({
				id: 'conv-1',
				title: 'Primera conversación',
				retreatId: 'retreat-1',
				createdAt: new Date('2026-04-14T10:00:00Z'),
				updatedAt: new Date('2026-04-14T11:00:00Z'),
			});
		});

		test('should handle null title and retreatId', () => {
			const list = buildListResponse(rows);
			expect(list[1].title).toBeNull();
			expect(list[1].retreatId).toBeNull();
		});

		test('should return empty array for empty input', () => {
			expect(buildListResponse([])).toEqual([]);
		});
	});

	describe('buildDetailResponse', () => {
		test('should parse JSON messages', () => {
			const row: ConversationRow = {
				id: 'conv-1',
				userId: 'user-1',
				title: 'Test',
				retreatId: 'retreat-1',
				messages: JSON.stringify([
					{ role: 'user', parts: [{ type: 'text', text: 'Hola' }] },
					{ role: 'assistant', parts: [{ type: 'text', text: 'Hola!' }] },
				]),
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			const detail = buildDetailResponse(row);
			expect(Array.isArray(detail.messages)).toBe(true);
			expect(detail.messages).toHaveLength(2);
			expect(detail.messages[0].role).toBe('user');
		});

		test('should keep other properties', () => {
			const row: ConversationRow = {
				id: 'conv-1',
				userId: 'user-1',
				title: 'Test',
				retreatId: 'retreat-1',
				messages: '[]',
				createdAt: new Date('2026-04-14T10:00:00Z'),
				updatedAt: new Date('2026-04-14T10:00:00Z'),
			};
			const detail = buildDetailResponse(row);
			expect(detail.id).toBe('conv-1');
			expect(detail.title).toBe('Test');
			expect(detail.retreatId).toBe('retreat-1');
		});

		test('should handle empty messages', () => {
			const row: ConversationRow = {
				id: 'conv-1',
				userId: 'user-1',
				title: null,
				retreatId: null,
				messages: '[]',
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			const detail = buildDetailResponse(row);
			expect(detail.messages).toEqual([]);
		});
	});
});
