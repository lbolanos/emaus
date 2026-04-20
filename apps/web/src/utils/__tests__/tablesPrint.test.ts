import { describe, it, expect } from 'vitest';
import {
	buildContactsPerParticipantPrintHtml,
	buildContactsPrintHtml,
	buildContactsVerificationPrintHtml,
	buildSimplePrintHtml,
	escapeHtml,
	formatPhones,
	type ContactsLabels,
	type PerParticipantLabels,
	type PrintLabels,
	type PrintTable,
	type VerificationLabels,
	type VerificationWalker,
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

const contactsLabels: ContactsLabels = {
	lider: 'Líder',
	colider1: 'Colíder 1',
	colider2: 'Colíder 2',
	caminante: 'Caminante',
	noTablesFound: 'No hay mesas',
	role: 'Rol',
	name: 'Nombre',
	phones: 'Teléfonos',
	email: 'Email',
	walkerCountSuffix: ' / 7 caminantes',
};

const perParticipantLabels: PerParticipantLabels = {
	...contactsLabels,
	forLabel: 'Para:',
	mesaLabel: 'Mesa:',
	intro: 'Contactos de tu mesa:',
};

describe('formatPhones', () => {
	it('returns empty string when no phones', () => {
		expect(formatPhones({})).toBe('');
	});

	it('joins cell, home, and work phones with line breaks', () => {
		const html = formatPhones({
			cellPhone: '5551111',
			homePhone: '5552222',
			workPhone: '5553333',
		});
		expect(html).toContain('📱 5551111');
		expect(html).toContain('🏠 5552222');
		expect(html).toContain('🏢 5553333');
		expect(html.split('<br>')).toHaveLength(3);
	});

	it('omits missing phones', () => {
		const html = formatPhones({ cellPhone: '5551111' });
		expect(html).toBe('📱 5551111');
	});

	it('escapes HTML in phone values', () => {
		const html = formatPhones({ cellPhone: '<evil>' });
		expect(html).toContain('&lt;evil&gt;');
		expect(html).not.toContain('<evil>');
	});
});

describe('buildContactsPrintHtml', () => {
	it('returns noTablesFound message when empty', () => {
		expect(buildContactsPrintHtml([], contactsLabels)).toBe('<p>No hay mesas</p>');
	});

	it('returns noTablesFound when passed null-ish', () => {
		expect(
			buildContactsPrintHtml(undefined as unknown as PrintTable[], contactsLabels),
		).toBe('<p>No hay mesas</p>');
	});

	it('renders an empty-state row for a mesa without members', () => {
		const html = buildContactsPrintHtml([{ name: 'Mesa 1' }], contactsLabels);
		expect(html).toContain('<h2>Mesa 1</h2>');
		expect(html).toContain('0 / 7 caminantes');
		expect(html).toContain('<p class="tc-empty">—</p>');
	});

	it('renders a roster table with leaders and walkers in order', () => {
		const html = buildContactsPrintHtml(
			[
				{
					name: 'Mesa 2',
					lider: {
						firstName: 'Ana',
						lastName: 'P',
						cellPhone: '5551111',
						email: 'ana@example.com',
					},
					walkers: [
						{
							firstName: 'Juan',
							lastName: 'L',
							cellPhone: '5552222',
							email: 'juan@example.com',
						},
					],
				},
			],
			contactsLabels,
		);
		expect(html).toContain('<th>Rol</th>');
		expect(html).toContain('<th>Teléfonos</th>');
		expect(html).toContain('Líder');
		expect(html).toContain('Ana P');
		expect(html).toContain('📱 5551111');
		expect(html).toContain('ana@example.com');
		expect(html).toContain('Caminante');
		expect(html).toContain('Juan L');
		expect(html).toContain('juan@example.com');
		// Leader row should come before walker row
		expect(html.indexOf('Ana P')).toBeLessThan(html.indexOf('Juan L'));
	});

	it('marks leader rows with the row-leader class', () => {
		const html = buildContactsPrintHtml(
			[
				{
					name: 'Mesa 3',
					lider: { firstName: 'Ana', lastName: 'P' },
					walkers: [{ firstName: 'Juan', lastName: 'L' }],
				},
			],
			contactsLabels,
		);
		const leaderMatches = html.match(/class="row-leader"/g) || [];
		expect(leaderMatches.length).toBe(1);
	});

	it('shows em-dash when phones or email are missing', () => {
		const html = buildContactsPrintHtml(
			[
				{
					name: 'Mesa 4',
					walkers: [{ firstName: 'Pedro', lastName: 'R' }],
				},
			],
			contactsLabels,
		);
		// Two em-dashes — one for phones, one for email
		const dashCount = (html.match(/>—</g) || []).length;
		expect(dashCount).toBeGreaterThanOrEqual(2);
	});

	it('escapes HTML in names, emails, and table name', () => {
		const html = buildContactsPrintHtml(
			[
				{
					name: '<Mesa>',
					lider: {
						firstName: '<Ev>',
						lastName: '&Co',
						email: '"><script>alert(1)</script>',
					},
				},
			],
			contactsLabels,
		);
		expect(html).not.toContain('<script>alert(1)');
		expect(html).toContain('&lt;Mesa&gt;');
		expect(html).toContain('&lt;Ev&gt; &amp;Co');
	});

	it('renders all three leader roles when present', () => {
		const html = buildContactsPrintHtml(
			[
				{
					name: 'Mesa 5',
					lider: { firstName: 'A', lastName: 'A' },
					colider1: { firstName: 'B', lastName: 'B' },
					colider2: { firstName: 'C', lastName: 'C' },
				},
			],
			contactsLabels,
		);
		expect(html).toContain('Líder');
		expect(html).toContain('Colíder 1');
		expect(html).toContain('Colíder 2');
	});
});

describe('buildContactsPerParticipantPrintHtml', () => {
	it('returns noTablesFound when empty', () => {
		expect(buildContactsPerParticipantPrintHtml([], perParticipantLabels)).toBe(
			'<p>No hay mesas</p>',
		);
	});

	it('returns noTablesFound when all tables have no members', () => {
		expect(
			buildContactsPerParticipantPrintHtml(
				[{ name: 'Mesa vacía' }, { name: 'Otra vacía' }],
				perParticipantLabels,
			),
		).toBe('<p>No hay mesas</p>');
	});

	it('generates one sheet per member of the table', () => {
		const html = buildContactsPerParticipantPrintHtml(
			[
				{
					name: 'Mesa 1',
					lider: { firstName: 'Ana', lastName: 'P' },
					walkers: [
						{ firstName: 'Juan', lastName: 'L' },
						{ firstName: 'Pedro', lastName: 'R' },
					],
				},
			],
			perParticipantLabels,
		);
		const sheetCount = (html.match(/class="contact-sheet"/g) || []).length;
		expect(sheetCount).toBe(3);
	});

	it('each sheet lists all members of the mesa in the roster', () => {
		const html = buildContactsPerParticipantPrintHtml(
			[
				{
					name: 'Mesa 1',
					lider: { firstName: 'Ana', lastName: 'P', cellPhone: '5551111' },
					walkers: [{ firstName: 'Juan', lastName: 'L', cellPhone: '5552222' }],
				},
			],
			perParticipantLabels,
		);
		// Each name appears in roster on both sheets (2x) plus as the recipient header on their own sheet (1x) = 3
		expect((html.match(/Ana P/g) || []).length).toBe(3);
		expect((html.match(/Juan L/g) || []).length).toBe(3);
	});

	it('addresses each sheet to its recipient with "Para:" header', () => {
		const html = buildContactsPerParticipantPrintHtml(
			[
				{
					name: 'Mesa 1',
					lider: { firstName: 'Ana', lastName: 'P' },
					walkers: [{ firstName: 'Juan', lastName: 'L' }],
				},
			],
			perParticipantLabels,
		);
		// The "Para:" label is wrapped in a cs-label span; recipient name follows in cs-name.
		// We should see each member's name rendered as a recipient name (class cs-name).
		const recipientMatches = html.match(/class="cs-name">[^<]+</g) || [];
		const recipientNames = recipientMatches.map((m) => m.replace(/class="cs-name">|</g, ''));
		expect(recipientNames).toContain('Ana P');
		expect(recipientNames).toContain('Juan L');
	});

	it('includes the mesa name in each sheet header', () => {
		const html = buildContactsPerParticipantPrintHtml(
			[
				{
					name: 'Mesa Única',
					lider: { firstName: 'Ana', lastName: 'P' },
					walkers: [{ firstName: 'Juan', lastName: 'L' }],
				},
			],
			perParticipantLabels,
		);
		expect((html.match(/Mesa Única/g) || []).length).toBe(2);
	});

	it('generates sheets across multiple mesas', () => {
		const html = buildContactsPerParticipantPrintHtml(
			[
				{
					name: 'Mesa A',
					lider: { firstName: 'Ana', lastName: 'P' },
					walkers: [{ firstName: 'Juan', lastName: 'L' }],
				},
				{
					name: 'Mesa B',
					lider: { firstName: 'Beto', lastName: 'M' },
				},
			],
			perParticipantLabels,
		);
		const sheetCount = (html.match(/class="contact-sheet"/g) || []).length;
		expect(sheetCount).toBe(3); // 2 from Mesa A + 1 from Mesa B
		expect(html).toContain('Mesa A');
		expect(html).toContain('Mesa B');
	});

	it('skips tables with no members', () => {
		const html = buildContactsPerParticipantPrintHtml(
			[
				{ name: 'Mesa vacía' },
				{
					name: 'Mesa llena',
					lider: { firstName: 'Ana', lastName: 'P' },
				},
			],
			perParticipantLabels,
		);
		const sheetCount = (html.match(/class="contact-sheet"/g) || []).length;
		expect(sheetCount).toBe(1);
		expect(html).not.toContain('Mesa vacía');
	});

	it('wraps output in a sheets-grid container for print layout', () => {
		const html = buildContactsPerParticipantPrintHtml(
			[{ name: 'Mesa 1', lider: { firstName: 'Ana', lastName: 'P' } }],
			perParticipantLabels,
		);
		expect(html).toContain('class="sheets-grid"');
	});

	it('escapes HTML in recipient name and mesa name', () => {
		const html = buildContactsPerParticipantPrintHtml(
			[
				{
					name: '<Mesa>',
					lider: { firstName: '<Ev>', lastName: '&Co' },
				},
			],
			perParticipantLabels,
		);
		expect(html).not.toContain('<Mesa>');
		expect(html).toContain('&lt;Mesa&gt;');
		expect(html).toContain('&lt;Ev&gt; &amp;Co');
	});
});

const verificationLabels: VerificationLabels = {
	title: 'Verifica tus datos',
	instructions: 'Revisa y corrige si es necesario.',
	nameLabel: 'Nombre',
	cellPhoneLabel: 'Celular',
	homePhoneLabel: 'Casa',
	workPhoneLabel: 'Trabajo',
	emailLabel: 'Correo',
	mesaLabel: 'Mesa:',
	correctionsLabel: 'Correcciones:',
	noWalkersFound: 'No hay caminantes',
	notProvided: '—',
};

describe('buildContactsVerificationPrintHtml', () => {
	it('returns noWalkersFound when empty', () => {
		expect(buildContactsVerificationPrintHtml([], verificationLabels)).toBe(
			'<p>No hay caminantes</p>',
		);
	});

	it('returns noWalkersFound when passed null-ish', () => {
		expect(
			buildContactsVerificationPrintHtml(
				undefined as unknown as VerificationWalker[],
				verificationLabels,
			),
		).toBe('<p>No hay caminantes</p>');
	});

	it('generates one verify-card per walker', () => {
		const html = buildContactsVerificationPrintHtml(
			[
				{ firstName: 'Ana', lastName: 'P' },
				{ firstName: 'Beto', lastName: 'M' },
				{ firstName: 'Carlos', lastName: 'R' },
			],
			verificationLabels,
		);
		const cardCount = (html.match(/class="verify-card"/g) || []).length;
		expect(cardCount).toBe(3);
	});

	it('wraps cards in a verify-grid container', () => {
		const html = buildContactsVerificationPrintHtml(
			[{ firstName: 'Ana', lastName: 'P' }],
			verificationLabels,
		);
		expect(html).toContain('class="verify-grid"');
	});

	it('shows each phone and email when provided', () => {
		const html = buildContactsVerificationPrintHtml(
			[
				{
					firstName: 'Ana',
					lastName: 'P',
					cellPhone: '5551111',
					homePhone: '5552222',
					workPhone: '5553333',
					email: 'ana@example.com',
				},
			],
			verificationLabels,
		);
		expect(html).toContain('5551111');
		expect(html).toContain('5552222');
		expect(html).toContain('5553333');
		expect(html).toContain('ana@example.com');
		expect(html).toContain('Celular');
		expect(html).toContain('Correo');
	});

	it('shows notProvided placeholder for missing phones/email', () => {
		const html = buildContactsVerificationPrintHtml(
			[{ firstName: 'Ana', lastName: 'P' }],
			verificationLabels,
		);
		// Four placeholders: cell, home, work, email
		const dashCount = (html.match(/>—</g) || []).length;
		expect(dashCount).toBeGreaterThanOrEqual(4);
	});

	it('shows id_on_retreat badge with family color when present', () => {
		const html = buildContactsVerificationPrintHtml(
			[
				{
					firstName: 'Ana',
					lastName: 'P',
					id_on_retreat: 7,
					family_friend_color: '#ff0000',
				},
			],
			verificationLabels,
		);
		expect(html).toContain('class="vc-id"');
		expect(html).toContain('background-color:#ff0000');
		expect(html).toContain('>7</span>');
	});

	it('omits id badge when id_on_retreat is missing', () => {
		const html = buildContactsVerificationPrintHtml(
			[{ firstName: 'Ana', lastName: 'P' }],
			verificationLabels,
		);
		expect(html).not.toContain('class="vc-id"');
	});

	it('includes table name header when tableMesaName provided', () => {
		const html = buildContactsVerificationPrintHtml(
			[{ firstName: 'Ana', lastName: 'P', tableMesaName: 'Mesa 3' }],
			verificationLabels,
		);
		expect(html).toContain('Mesa 3');
		expect(html).toContain('vc-mesa');
	});

	it('omits table-name block when tableMesaName is missing', () => {
		const html = buildContactsVerificationPrintHtml(
			[{ firstName: 'Ana', lastName: 'P' }],
			verificationLabels,
		);
		expect(html).not.toContain('vc-mesa');
	});

	it('includes corrections area with label', () => {
		const html = buildContactsVerificationPrintHtml(
			[{ firstName: 'Ana', lastName: 'P' }],
			verificationLabels,
		);
		expect(html).toContain('vc-corrections');
		expect(html).toContain('Correcciones:');
	});

	it('escapes HTML in names, emails, and table name', () => {
		const html = buildContactsVerificationPrintHtml(
			[
				{
					firstName: '<Ev>',
					lastName: '&Co',
					email: '"><script>alert(1)</script>',
					tableMesaName: '<Mesa>',
				},
			],
			verificationLabels,
		);
		expect(html).not.toContain('<script>alert(1)');
		expect(html).toContain('&lt;Ev&gt; &amp;Co');
		expect(html).toContain('&lt;Mesa&gt;');
	});
});
