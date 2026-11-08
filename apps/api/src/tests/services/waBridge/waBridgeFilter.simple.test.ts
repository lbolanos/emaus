/**
 * Tests of the WhatsApp bridge ingestion filter (specs/whatsapp-inbox D4).
 *
 * Whitelist: only 1:1 chats whose JID matches the retreat's accepted digits.
 * Groups (@g.us), @lid JIDs and unknown chats NEVER pass. Fixtures are made-up
 * phones in a realistic MX format.
 */
import {
	filterWhitelistedChats,
	jidToDigits,
	normalizeWacliMessage,
} from '@/services/waBridge/waBridgePoller';
import { acceptedJidDigitVariants } from '@/services/waBridge/waBridgeService';

const ACCEPTED = new Set([
	...acceptedJidDigitVariants('5512345678', 'MX'), // 52… and 521…
	...acceptedJidDigitVariants('5551234567', 'US'), // 1…
]);

describe('jidToDigits', () => {
	it('extracts digits from 1:1 JIDs', () => {
		expect(jidToDigits('5215512345678@s.whatsapp.net')).toBe('5215512345678');
	});

	it('rejects groups, @lid and odd shapes', () => {
		expect(jidToDigits('12029998877@g.us')).toBeNull();
		expect(jidToDigits('abc@lid')).toBeNull();
		expect(jidToDigits('con-arnes@s.whatsapp.net')).toBeNull();
		expect(jidToDigits(undefined)).toBeNull();
		expect(jidToDigits('')).toBeNull();
	});
});

describe('filterWhitelistedChats', () => {
	it("keeps a walker's chat (MX 521 variant)", () => {
		const chats = [{ jid: '5215512345678@s.whatsapp.net', name: 'Caminante A' }];
		expect(filterWhitelistedChats(chats, ACCEPTED)).toEqual(chats);
	});

	it('keeps the 52 variant without the extra 1 (MX landline)', () => {
		const chats = [{ jid: '525512345678@s.whatsapp.net' }];
		expect(filterWhitelistedChats(chats, ACCEPTED)).toEqual(chats);
	});

	it('keeps an international walker (US)', () => {
		const chats = [{ jid: '15551234567@s.whatsapp.net' }];
		expect(filterWhitelistedChats(chats, ACCEPTED)).toEqual(chats);
	});

	it('rejects groups and non-human JIDs', () => {
		const chats = [
			{ jid: '99999@g.us' },
			{ jid: 'abc@lid' },
			{ jid: '5215512345678@broadcast' },
		];
		expect(filterWhitelistedChats(chats, ACCEPTED)).toEqual([]);
	});

	it('rejects a number that is NOT a walker of the retreat', () => {
		const chats = [{ jid: '5215599998888@s.whatsapp.net' }];
		expect(filterWhitelistedChats(chats, ACCEPTED)).toEqual([]);
	});

	it('accepts exact digits, not a loose suffix', () => {
		// A different number that ENDS the same does not match (the index is exact).
		const chats = [{ jid: '521815512345678@s.whatsapp.net' }];
		expect(filterWhitelistedChats(chats, ACCEPTED)).toEqual([]);
	});
});

describe('normalizeWacliMessage', () => {
	const chatJid = '5215512345678@s.whatsapp.net';
	const chatPhone = '5215512345678';

	it('normalizes the REAL PascalCase shape of the v0.21.0 store (verified in QA)', () => {
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

	it('also normalizes the camelCase shape (in case wacli changes)', () => {
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

	it('rejects messages without an id or a parseable timestamp', () => {
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

	it('media: null body, type kept (media is downloaded on demand, never stored)', () => {
		const row = normalizeWacliMessage(
			{ id: 'MSG-5', timestamp: 1730820600000, body: null, messageType: 'image' },
			chatJid,
			chatPhone,
		);
		expect(row?.body).toBeNull();
		expect(row?.messageType).toBe('image');
	});
});
