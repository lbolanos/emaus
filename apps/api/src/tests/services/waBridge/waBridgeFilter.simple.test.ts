/**
 * Tests del filtro de ingesta del puente WhatsApp (specs/whatsapp-inbox D4).
 *
 * Whitelist: solo chats 1:1 cuyo JID matchea dígitos aceptados del retiro.
 * Grupos (@g.us), JIDs @lid y desconocidos NUNCA pasan. Los fixtures son
 * teléfonos inventados con formato realista MX.
 */
import {
	filterWhitelistedChats,
	jidToDigits,
	normalizeWacliMessage,
} from '@/services/waBridge/waBridgePoller';
import { acceptedJidDigitVariants } from '@/services/waBridge/waBridgeService';

const ACCEPTED = new Set([
	...acceptedJidDigitVariants('5512345678', 'MX'), // 52… y 521…
	...acceptedJidDigitVariants('5551234567', 'US'), // 1…
]);

describe('jidToDigits', () => {
	it('extrae dígitos de JIDs 1:1', () => {
		expect(jidToDigits('5215512345678@s.whatsapp.net')).toBe('5215512345678');
	});

	it('rechaza grupos, @lid y formas raras', () => {
		expect(jidToDigits('12029998877@g.us')).toBeNull();
		expect(jidToDigits('abc@lid')).toBeNull();
		expect(jidToDigits('con-arnes@s.whatsapp.net')).toBeNull();
		expect(jidToDigits(undefined)).toBeNull();
		expect(jidToDigits('')).toBeNull();
	});
});

describe('filterWhitelistedChats', () => {
	it('conserva el chat de un caminante (variante 521 de MX)', () => {
		const chats = [{ jid: '5215512345678@s.whatsapp.net', name: 'Caminante A' }];
		expect(filterWhitelistedChats(chats, ACCEPTED)).toEqual(chats);
	});

	it('conserva la variante 52 sin prefijo 1 (fijo MX)', () => {
		const chats = [{ jid: '525512345678@s.whatsapp.net' }];
		expect(filterWhitelistedChats(chats, ACCEPTED)).toEqual(chats);
	});

	it('conserva un caminante internacional (US)', () => {
		const chats = [{ jid: '15551234567@s.whatsapp.net' }];
		expect(filterWhitelistedChats(chats, ACCEPTED)).toEqual(chats);
	});

	it('rechaza grupos y JIDs no humanos', () => {
		const chats = [
			{ jid: '99999@g.us' },
			{ jid: 'abc@lid' },
			{ jid: '5215512345678@broadcast' },
		];
		expect(filterWhitelistedChats(chats, ACCEPTED)).toEqual([]);
	});

	it('rechaza un número que NO es caminante del retiro', () => {
		const chats = [{ jid: '5215599998888@s.whatsapp.net' }];
		expect(filterWhitelistedChats(chats, ACCEPTED)).toEqual([]);
	});

	it('acepta por dígitos exactos, no por sufijo suelto', () => {
		// Un número distinto que TERMINA igual no matchea (el índice es exacto).
		const chats = [{ jid: '521815512345678@s.whatsapp.net' }];
		expect(filterWhitelistedChats(chats, ACCEPTED)).toEqual([]);
	});
});

describe('normalizeWacliMessage', () => {
	const chatJid = '5215512345678@s.whatsapp.net';
	const chatPhone = '5215512345678';

	it('normaliza la forma REAL PascalCase del store v0.21.0 (verificado en QA)', () => {
		const row = normalizeWacliMessage(
			{
				ChatJID: chatJid,
				ChatName: 'Leo',
				MsgID: 'ACA92BB13F2AF8D81229A0D4276A3779',
				SenderJID: chatJid,
				SenderName: 'Leo',
				Timestamp: '2026-11-07T01:29:46Z',
				FromMe: false,
				Text: 'A que hora es la charla del viernes',
				DisplayText: 'A que hora es la charla del viernes',
				MediaType: '',
				Filename: '',
			},
			chatJid,
			chatPhone,
		);
		expect(row).toEqual({
			chatJid,
			chatPhone,
			waMessageId: 'ACA92BB13F2AF8D81229A0D4276A3779',
			timestamp: new Date('2026-11-07T01:29:46Z'),
			fromMe: false,
			body: 'A que hora es la charla del viernes',
			messageType: 'text',
			mediaMime: null,
			mediaFileName: null,
		});
	});

	it('normaliza también la forma camelCase (por si wacli cambia)', () => {
		const row = normalizeWacliMessage(
			{ id: 'MSG-1', timestamp: '2026-11-05T15:30:00Z', fromMe: false, body: 'A qué hora llego?' },
			chatJid,
			chatPhone,
		);
		expect(row).toEqual({
			chatJid,
			chatPhone,
			waMessageId: 'MSG-1',
			timestamp: new Date('2026-11-05T15:30:00Z'),
			fromMe: false,
			body: 'A qué hora llego?',
			messageType: 'text',
			mediaMime: null,
			mediaFileName: null,
		});
	});

	it('rechaza mensajes sin id o sin timestamp parseable', () => {
		expect(normalizeWacliMessage({ id: '', timestamp: '2026-11-05T15:30:00Z' }, chatJid, chatPhone)).toBeNull();
		expect(normalizeWacliMessage({ id: 'MSG-2', timestamp: 'no-es-fecha' }, chatJid, chatPhone)).toBeNull();
		expect(normalizeWacliMessage({ id: 'MSG-3' }, chatJid, chatPhone)).toBeNull();
	});

	it('keeps staff replies (FromMe) as fromMe=true — v1.3 "answered by"', () => {
		const row = normalizeWacliMessage(
			{ id: 'MSG-4', timestamp: '2026-11-05T15:30:00Z', FromMe: true, Text: 'Te espero' },
			chatJid,
			chatPhone,
		);
		expect(row?.fromMe).toBe(true);
		expect(row?.body).toBe('Te espero');
	});

	it('reads FromMe given as a string', () => {
		const row = normalizeWacliMessage(
			{ id: 'MSG-5', timestamp: '2026-11-05T15:30:00Z', FromMe: 'True' },
			chatJid,
			chatPhone,
		);
		expect(row?.fromMe).toBe(true);
	});

	it('uses MediaCaption as body when Text is empty (photo with caption)', () => {
		const row = normalizeWacliMessage(
			{
				MsgID: 'IMG-1',
				Timestamp: '2026-11-07T20:28:53Z',
				FromMe: false,
				Text: '',
				MediaType: 'image',
				MediaCaption: 'Aquí está mi pago',
				MimeType: 'image/jpeg',
			},
			chatJid,
			chatPhone,
		);
		expect(row?.body).toBe('Aquí está mi pago');
		expect(row?.messageType).toBe('image');
		expect(row?.mediaMime).toBe('image/jpeg');
	});

	it('keeps document mime and file name', () => {
		const row = normalizeWacliMessage(
			{
				MsgID: 'DOC-1',
				Timestamp: '2026-11-07T20:28:53Z',
				FromMe: false,
				MediaType: 'document',
				MimeType: 'application/pdf',
				Filename: 'comprobante-bbva.pdf',
			},
			chatJid,
			chatPhone,
		);
		expect(row).toMatchObject({
			messageType: 'document',
			mediaMime: 'application/pdf',
			mediaFileName: 'comprobante-bbva.pdf',
			body: null,
		});
	});

	it('multimedia: cuerpo null, tipo conservado (D9: nunca se descarga media)', () => {
		const row = normalizeWacliMessage(
			{ id: 'MSG-5', timestamp: 1730820600000, body: null, messageType: 'image' },
			chatJid,
			chatPhone,
		);
		expect(row?.body).toBeNull();
		expect(row?.messageType).toBe('image');
	});
});
