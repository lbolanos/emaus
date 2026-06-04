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
	UserCheck: { template: '<svg />' },
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

	const spyPrintWindow = () => {
		const writes: string[] = [];
		const fakeWin = {
			document: {
				open: vi.fn(),
				write: vi.fn((html: string) => writes.push(html)),
				close: vi.fn(),
			},
		} as unknown as Window;
		const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWin);
		return { writes, openSpy };
	};

	it('opens a print window with the cards when Print button is clicked', async () => {
		const { writes, openSpy } = spyPrintWindow();
		const w = mountDialog([makeWalker({ firstName: 'Juan', lastName: 'Pérez', invitedBy: 'Pedro López' })]);
		// Buttons: [0] print-with-inviter, [1] print, [last] close
		await w.findAll('button')[1].trigger('click');
		expect(openSpy).toHaveBeenCalled();
		const html = writes.join('');
		expect(html).toContain('lottery-cards-grid');
		expect(html).toContain('Juan Pérez');
		// Plain print must NOT include the inviter
		expect(html).not.toContain('Pedro López');
		openSpy.mockRestore();
	});

	it('includes the inviter when "Print with inviter" is clicked', async () => {
		const { writes, openSpy } = spyPrintWindow();
		const w = mountDialog([makeWalker({ firstName: 'Juan', lastName: 'Pérez', invitedBy: 'Pedro López' })]);
		// First button is "Print with inviter"
		await w.findAll('button')[0].trigger('click');
		expect(openSpy).toHaveBeenCalled();
		const html = writes.join('');
		expect(html).toContain('Juan Pérez');
		expect(html).toContain('Pedro López');
		expect(html).toContain('lottery-card-inviter');
		openSpy.mockRestore();
	});

	it('omits the inviter line for walkers without invitedBy even in inviter mode', async () => {
		const { writes, openSpy } = spyPrintWindow();
		const w = mountDialog([
			makeWalker({ id: 'w-1', id_on_retreat: 1, invitedBy: 'Pedro López' }),
			makeWalker({ id: 'w-2', id_on_retreat: 2, invitedBy: undefined }),
		]);
		await w.findAll('button')[0].trigger('click');
		const html = writes.join('');
		// Only one inviter line is rendered (for the walker that has invitedBy)
		expect(html.match(/class="lottery-card-inviter"/g)?.length).toBe(1);
		expect(html).toContain('Pedro López');
		openSpy.mockRestore();
	});

	it('escapes HTML in walker data to prevent injection', async () => {
		const { writes, openSpy } = spyPrintWindow();
		const w = mountDialog([
			makeWalker({ firstName: '<b>Evil</b>', lastName: '& Co', invitedBy: '<script>x</script>' }),
		]);
		await w.findAll('button')[0].trigger('click');
		const html = writes.join('');
		expect(html).not.toContain('<b>Evil</b>');
		expect(html).toContain('&lt;b&gt;Evil&lt;/b&gt;');
		expect(html).toContain('&amp; Co');
		expect(html).not.toContain('<script>x</script>');
		openSpy.mockRestore();
	});

	it('uses a 4-column A4 grid so cards fit on the page', async () => {
		const { writes, openSpy } = spyPrintWindow();
		const w = mountDialog([makeWalker()]);
		await w.findAll('button')[1].trigger('click');
		const html = writes.join('');
		expect(html).toContain('grid-template-columns: repeat(4, 1fr)');
		expect(html).toContain('@page { size: A4; margin: 8mm; }');
		openSpy.mockRestore();
	});

	it('does not throw when the print popup is blocked', async () => {
		const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
		const w = mountDialog([makeWalker()]);
		await expect(w.findAll('button')[1].trigger('click')).resolves.not.toThrow();
		openSpy.mockRestore();
	});
});
