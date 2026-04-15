import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import LotteryCardsDialog from '../LotteryCardsDialog.vue';
import type { Participant } from '@repo/types';

vi.mock('@repo/ui', () => ({
	Button: { template: '<button><slot /></button>', props: ['variant', 'size'] },
}));

vi.mock('lucide-vue-next', () => ({
	Printer: { template: '<svg />' },
	X: { template: '<svg />' },
}));

const makeWalker = (overrides: Partial<Participant> = {}): Participant =>
	({
		id: 'w-1',
		type: 'walker',
		firstName: 'Ana',
		lastName: 'García',
		id_on_retreat: 5,
		family_friend_color: '#FF5733',
		isCancelled: false,
		retreatId: 'r-1',
		gender: 'female',
		...overrides,
	}) as unknown as Participant;

describe('LotteryCardsDialog', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	const mountDialog = (walkers: Participant[]) =>
		mount(LotteryCardsDialog, {
			props: { open: true, walkers },
			attachTo: document.body,
			global: {
				mocks: { $t: (key: string) => key },
			},
		});

	it('renders walker cards', () => {
		const w = mountDialog([makeWalker()]);
		expect(w.text()).toContain('5'); // id_on_retreat
		expect(w.text()).toContain('Ana García');
	});

	it('renders empty state when no walkers', () => {
		const w = mountDialog([]);
		expect(w.text()).toContain('tables.lotteryCards.noWalkers');
	});

	it('sorts walkers by id_on_retreat ascending', () => {
		const walkers = [
			makeWalker({ id: 'w-3', id_on_retreat: 3, firstName: 'Carlos' }),
			makeWalker({ id: 'w-1', id_on_retreat: 1, firstName: 'Ana' }),
			makeWalker({ id: 'w-2', id_on_retreat: 2, firstName: 'Beto' }),
		];
		const w = mountDialog(walkers);
		const cards = w.findAll('.lottery-card');
		expect(cards[0].text()).toContain('1');
		expect(cards[1].text()).toContain('2');
		expect(cards[2].text()).toContain('3');
	});

	it('applies family_friend_color as borderLeftColor', () => {
		const walker = makeWalker({ family_friend_color: '#ABCDEF' });
		const w = mountDialog([walker]);
		const card = w.find('.lottery-card');
		expect(card.attributes('style')).toContain('#ABCDEF');
	});

	it('falls back to gray when no family_friend_color', () => {
		const walker = makeWalker({ family_friend_color: undefined });
		const w = mountDialog([walker]);
		const card = w.find('.lottery-card');
		expect(card.attributes('style')).toContain('#e5e7eb');
	});

	it('renders ? when id_on_retreat is null', () => {
		const walker = makeWalker({ id_on_retreat: undefined });
		const w = mountDialog([walker]);
		expect(w.text()).toContain('?');
	});

	it('emits close when X button is clicked', async () => {
		const w = mountDialog([makeWalker()]);
		const buttons = w.findAll('button');
		// Last button is the X close button
		await buttons[buttons.length - 1].trigger('click');
		expect(w.emitted('close')).toBeTruthy();
	});

	it('calls window.print when Print button is clicked', async () => {
		const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
		const w = mountDialog([makeWalker()]);
		// First button is the Print button
		await w.findAll('button')[0].trigger('click');
		expect(printSpy).toHaveBeenCalled();
		printSpy.mockRestore();
	});
});
