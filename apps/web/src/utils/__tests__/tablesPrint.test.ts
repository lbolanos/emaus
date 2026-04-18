import { describe, it, expect } from 'vitest';
import {
	buildSimplePrintHtml,
	escapeHtml,
	type PrintLabels,
	type PrintTable,
} from '../tablesPrint';

const labels: PrintLabels = {
	lider: 'Líder',
	colider1: 'Colíder 1',
	colider2: 'Colíder 2',
	noTablesFound: 'No hay mesas',
	servidores: 'Servidores',
	caminantes: 'Caminantes',
};

describe('escapeHtml', () => {
	it('returns empty string for null/undefined', () => {
		expect(escapeHtml(null)).toBe('');
		expect(escapeHtml(undefined)).toBe('');
	});

	it('escapes HTML special characters', () => {
		expect(escapeHtml('<script>&"\'')).toBe('&lt;script&gt;&amp;&quot;&#039;');
	});

	it('stringifies numbers', () => {
		expect(escapeHtml(42)).toBe('42');
	});
});

describe('buildSimplePrintHtml', () => {
	it('returns noTablesFound message when empty', () => {
		expect(buildSimplePrintHtml([], labels)).toBe('<p>No hay mesas</p>');
	});

	it('returns noTablesFound when passed null-ish', () => {
		expect(buildSimplePrintHtml(undefined as unknown as PrintTable[], labels)).toBe(
			'<p>No hay mesas</p>',
		);
	});

	it('renders a table name and 0/7 count when no walkers', () => {
		const html = buildSimplePrintHtml([{ name: 'Mesa 1' }], labels);
		expect(html).toContain('<h2>Mesa 1</h2>');
		expect(html).toContain('0 / 7');
		expect(html).toContain('Caminantes');
		expect(html).toContain('<p class="tc-empty">—</p>');
	});

	it('omits servidores section when no leaders present', () => {
		const html = buildSimplePrintHtml([{ name: 'Mesa 1' }], labels);
		expect(html).not.toContain('Servidores');
	});

	it('renders only the leader roles present', () => {
		const html = buildSimplePrintHtml(
			[
				{
					name: 'Mesa 2',
					lider: { firstName: 'Ana', lastName: 'Pérez' },
					colider2: { firstName: 'Luis', lastName: 'Soto' },
				},
			],
			labels,
		);
		expect(html).toContain('Servidores');
		expect(html).toContain('Líder:</span> Ana Pérez');
		expect(html).toContain('Colíder 2:</span> Luis Soto');
		expect(html).not.toContain('Colíder 1');
	});

	it('renders walkers with id badge and family color', () => {
		const html = buildSimplePrintHtml(
			[
				{
					name: 'Mesa 3',
					walkers: [
						{
							firstName: 'Juan',
							lastName: 'López',
							id_on_retreat: 5,
							family_friend_color: '#ff0000',
						},
					],
				},
			],
			labels,
		);
		expect(html).toContain('1 / 7');
		expect(html).toContain('background-color:#ff0000');
		expect(html).toContain('>5</span>');
		expect(html).toContain('Juan López');
	});

	it('omits id badge when id_on_retreat missing', () => {
		const html = buildSimplePrintHtml(
			[{ name: 'Mesa 4', walkers: [{ firstName: 'Sara', lastName: 'Gil' }] }],
			labels,
		);
		expect(html).toContain('Sara Gil');
		expect(html).not.toContain('w-id');
	});

	it('supports camelCase field variants (idOnRetreat, familyFriendColor)', () => {
		const html = buildSimplePrintHtml(
			[
				{
					name: 'Mesa 5',
					walkers: [
						{
							firstName: 'Pedro',
							lastName: 'Ruiz',
							idOnRetreat: 12,
							familyFriendColor: '#00ff00',
						},
					],
				},
			],
			labels,
		);
		expect(html).toContain('background-color:#00ff00');
		expect(html).toContain('>12</span>');
	});

	it('escapes HTML in names, table name, and color', () => {
		const html = buildSimplePrintHtml(
			[
				{
					name: '<Mesa "X">',
					walkers: [
						{
							firstName: '<b>Evil</b>',
							lastName: '&Co',
							id_on_retreat: 1,
							family_friend_color: '"><script>alert(1)</script>',
						},
					],
				},
			],
			labels,
		);
		expect(html).not.toContain('<script>alert(1)');
		expect(html).toContain('&lt;Mesa &quot;X&quot;&gt;');
		expect(html).toContain('&lt;b&gt;Evil&lt;/b&gt; &amp;Co');
	});

	it('does NOT include phone, medication, dietary, disability, emergency data', () => {
		const html = buildSimplePrintHtml(
			[
				{
					name: 'Mesa 6',
					lider: {
						firstName: 'Ana',
						lastName: 'P',
						...({
							cellPhone: '5550000',
							email: 'ana@example.com',
						} as any),
					},
					walkers: [
						{
							firstName: 'Bob',
							lastName: 'K',
							...({
								cellPhone: '5551234',
								hasMedication: true,
								medicationDetails: 'Aspirina',
								hasDietaryRestrictions: true,
								dietaryRestrictionsDetails: 'Sin gluten',
								disabilitySupport: 'Silla de ruedas',
								emergencyContact1Name: 'Jane',
								emergencyContact1CellPhone: '5559999',
							} as any),
						},
					],
				},
			],
			labels,
		);
		expect(html).not.toContain('5550000');
		expect(html).not.toContain('5551234');
		expect(html).not.toContain('5559999');
		expect(html).not.toContain('ana@example.com');
		expect(html).not.toContain('Aspirina');
		expect(html).not.toContain('Sin gluten');
		expect(html).not.toContain('Silla de ruedas');
		expect(html).not.toContain('Jane');
	});

	it('renders multiple tables concatenated', () => {
		const html = buildSimplePrintHtml(
			[{ name: 'Mesa A' }, { name: 'Mesa B' }],
			labels,
		);
		expect(html).toContain('<h2>Mesa A</h2>');
		expect(html).toContain('<h2>Mesa B</h2>');
	});
});
