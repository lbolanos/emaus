import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const api = vi.hoisted(() => ({
	lettersApi: {
		activateMailboxes: vi.fn(),
		getMailboxes: vi.fn(),
		toggleMailbox: vi.fn(),
		listLetters: vi.fn(),
		getLetter: vi.fn(),
		reviewLetter: vi.fn(),
		markPrinted: vi.fn(),
		getPrintBatch: vi.fn(),
	},
}));

vi.mock('@/services/api', () => api);

import { useLetterStore } from '../letterStore';

const letter = (over: Record<string, any> = {}) => ({
	id: 'l1',
	retreatId: 'r1',
	retreatParticipantId: 'rp1',
	participantName: 'Juan Pérez',
	fromEmail: 'familia@ejemplo.com',
	fromName: 'Familia',
	bodyText: 'Hola Juan',
	status: 'pending',
	receivedAt: '2026-11-05T14:03:00.000Z',
	attachments: [],
	...over,
});

describe('letterStore', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
		api.lettersApi.listLetters.mockResolvedValue({
			letters: [],
			counts: { pending: 0, approved: 0, hidden: 0 },
		});
		api.lettersApi.getMailboxes.mockResolvedValue([]);
	});

	it('carga la bandeja con counts', async () => {
		api.lettersApi.listLetters.mockResolvedValue({
			letters: [letter()],
			counts: { pending: 1, approved: 0, hidden: 0 },
		});
		const store = useLetterStore();
		await store.fetchLetters('r1', { status: 'pending' });

		expect(store.letters).toHaveLength(1);
		expect(store.counts.pending).toBe(1);
		expect(api.lettersApi.listLetters).toHaveBeenCalledWith('r1', { status: 'pending' });
	});

	it('review actualiza la carta y mueve el contador del estado anterior al nuevo', async () => {
		api.lettersApi.listLetters.mockResolvedValue({
			letters: [letter()],
			counts: { pending: 1, approved: 0, hidden: 0 },
		});
		api.lettersApi.reviewLetter.mockResolvedValue({ ...letter(), status: 'approved' });

		const store = useLetterStore();
		await store.fetchLetters('r1');
		await store.reviewLetter('l1', 'approved');

		expect(store.letters[0].status).toBe('approved');
		expect(store.counts).toEqual({ pending: 0, approved: 1, hidden: 0 });
	});

	it('review de approved→hidden descuenta de approved, no de pending', async () => {
		api.lettersApi.listLetters.mockResolvedValue({
			letters: [letter({ status: 'approved' })],
			counts: { pending: 0, approved: 1, hidden: 0 },
		});
		api.lettersApi.reviewLetter.mockResolvedValue({ ...letter(), status: 'hidden' });

		const store = useLetterStore();
		await store.fetchLetters('r1');
		await store.reviewLetter('l1', 'hidden');

		expect(store.counts).toEqual({ pending: 0, approved: 0, hidden: 1 });
	});

	it('activación de buzones refresca la lista de buzones', async () => {
		api.lettersApi.activateMailboxes.mockResolvedValue({ activated: 2, alreadyActive: 1 });
		api.lettersApi.getMailboxes.mockResolvedValue([]);

		const store = useLetterStore();
		const result = await store.activateMailboxes('r1');

		expect(result).toEqual({ activated: 2, alreadyActive: 1 });
		expect(api.lettersApi.getMailboxes).toHaveBeenCalledWith('r1');
	});

	it('toggleMailbox actualiza la fila local sin refetch', async () => {
		api.lettersApi.getMailboxes.mockResolvedValue([
			{
				retreatParticipantId: 'rp1',
				participantName: 'Juan',
				mailboxCode: 'AB23CD45',
				mailboxAddress: 'carta.AB23CD45@emaus.cc',
				mailboxEnabled: false,
				letterCounts: { pending: 0, approved: 0, hidden: 0 },
			},
		]);
		api.lettersApi.toggleMailbox.mockResolvedValue({ mailboxCode: 'AB23CD45', mailboxEnabled: true });

		const store = useLetterStore();
		await store.fetchMailboxes('r1');
		await store.toggleMailbox('r1', 'rp1', true);

		expect(store.mailboxes[0].mailboxEnabled).toBe(true);
		expect(api.lettersApi.toggleMailbox).toHaveBeenCalledWith('r1', 'rp1', true);
	});

	it('expone el error con mensaje amable cuando la API falla', async () => {
		api.lettersApi.listLetters.mockRejectedValue(new Error('boom'));
		const store = useLetterStore();
		await store.fetchLetters('r1');
		expect(store.error).toBeTruthy();
		expect(store.letters).toHaveLength(0);
	});
});
