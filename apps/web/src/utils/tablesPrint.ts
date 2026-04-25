export interface PrintParticipant {
	firstName?: string | null;
	lastName?: string | null;
	id_on_retreat?: string | number | null;
	idOnRetreat?: string | number | null;
	family_friend_color?: string | null;
	familyFriendColor?: string | null;
	cellPhone?: string | null;
	homePhone?: string | null;
	workPhone?: string | null;
	email?: string | null;
}

export interface PrintTable {
	name: string;
	lider?: PrintParticipant | null;
	colider1?: PrintParticipant | null;
	colider2?: PrintParticipant | null;
	walkers?: PrintParticipant[] | null;
}

export interface PrintLabels {
	lider: string;
	colider1: string;
	colider2: string;
	noTablesFound: string;
	servidores: string;
	caminantes: string;
}

export const escapeHtml = (unsafe: unknown): string => {
	if (unsafe === null || unsafe === undefined) return '';
	return String(unsafe)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
};

const fullName = (p: PrintParticipant): string =>
	`${escapeHtml(p.firstName || '')} ${escapeHtml(p.lastName || '')}`.trim();

export interface ContactsLabels {
	lider: string;
	colider1: string;
	colider2: string;
	caminante: string;
	noTablesFound: string;
	role: string;
	name: string;
	phones: string;
	email: string;
	walkerCountSuffix: string;
}

export interface VerificationLabels {
	title: string;
	instructions: string;
	nameLabel: string;
	cellPhoneLabel: string;
	homePhoneLabel: string;
	workPhoneLabel: string;
	emailLabel: string;
	mesaLabel: string;
	correctionsLabel: string;
	noWalkersFound: string;
	notProvided: string;
}

export interface PerParticipantLabels extends ContactsLabels {
	forLabel: string;
	mesaLabel: string;
	intro: string;
}

export const formatPhones = (p: PrintParticipant): string => {
	const parts: string[] = [];
	if (p.cellPhone) parts.push(`📱 ${escapeHtml(p.cellPhone)}`);
	if (p.homePhone) parts.push(`🏠 ${escapeHtml(p.homePhone)}`);
	if (p.workPhone) parts.push(`🏢 ${escapeHtml(p.workPhone)}`);
	return parts.join('<br>');
};

interface RosterMember {
	role: string;
	p: PrintParticipant;
	isLeader: boolean;
}

const collectMembers = (table: PrintTable, labels: ContactsLabels): RosterMember[] => {
	const members: RosterMember[] = [];
	if (table.lider) members.push({ role: labels.lider, p: table.lider, isLeader: true });
	if (table.colider1) members.push({ role: labels.colider1, p: table.colider1, isLeader: true });
	if (table.colider2) members.push({ role: labels.colider2, p: table.colider2, isLeader: true });
	(table.walkers || []).forEach((w) =>
		members.push({ role: labels.caminante, p: w, isLeader: false }),
	);
	return members;
};

const buildRosterRow = (m: RosterMember): string => {
	const name = `${escapeHtml(m.p.firstName || '')} ${escapeHtml(m.p.lastName || '')}`.trim() || '—';
	const email = m.p.email ? escapeHtml(m.p.email) : '—';
	const phones = formatPhones(m.p) || '—';
	return `<tr class="${m.isLeader ? 'row-leader' : ''}">
    <td class="cell-role">${escapeHtml(m.role)}</td>
    <td class="cell-name">${name}</td>
    <td>${phones}</td>
    <td class="cell-email">${email}</td>
  </tr>`;
};

const buildRosterTable = (members: RosterMember[], labels: ContactsLabels): string => {
	if (members.length === 0) return `<p class="tc-empty">—</p>`;
	const rows = members.map(buildRosterRow).join('');
	return `<table class="contacts-table">
    <thead>
      <tr>
        <th>${escapeHtml(labels.role)}</th>
        <th>${escapeHtml(labels.name)}</th>
        <th>${escapeHtml(labels.phones)}</th>
        <th>${escapeHtml(labels.email)}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
};

export const buildContactsPrintHtml = (
	tables: PrintTable[],
	labels: ContactsLabels,
): string => {
	if (!tables || tables.length === 0) {
		return `<p>${escapeHtml(labels.noTablesFound)}</p>`;
	}

	return tables
		.map((table) => {
			const members = collectMembers(table, labels);
			const count = (table.walkers || []).length;
			return `<section class="table-card">
        <header class="tc-head">
          <h2>${escapeHtml(table.name)}</h2>
          <span class="tc-count">${count}${escapeHtml(labels.walkerCountSuffix)}</span>
        </header>
        ${buildRosterTable(members, labels)}
      </section>`;
		})
		.join('');
};

export const buildContactsPerParticipantPrintHtml = (
	tables: PrintTable[],
	labels: PerParticipantLabels,
): string => {
	if (!tables || tables.length === 0) {
		return `<p>${escapeHtml(labels.noTablesFound)}</p>`;
	}

	const sheets: string[] = [];
	tables.forEach((table) => {
		const members = collectMembers(table, labels);
		if (members.length === 0) return;
		const rosterTable = buildRosterTable(members, labels);

		members.forEach((recipient) => {
			const recipientName =
				`${escapeHtml(recipient.p.firstName || '')} ${escapeHtml(recipient.p.lastName || '')}`.trim() ||
				'—';
			sheets.push(`<section class="contact-sheet">
        <header class="cs-head">
          <div class="cs-for">
            <span class="cs-label">${escapeHtml(labels.forLabel)}</span>
            <span class="cs-name">${recipientName}</span>
          </div>
          <div class="cs-mesa">
            <span class="cs-label">${escapeHtml(labels.mesaLabel)}</span>
            <span class="cs-mesa-name">${escapeHtml(table.name)}</span>
          </div>
        </header>
        <p class="cs-intro">${escapeHtml(labels.intro)}</p>
        ${rosterTable}
      </section>`);
		});
	});

	if (sheets.length === 0) return `<p>${escapeHtml(labels.noTablesFound)}</p>`;
	return `<div class="sheets-grid">${sheets.join('')}</div>`;
};

export interface VerificationWalker extends PrintParticipant {
	tableMesaName?: string | null;
}

export const buildContactsVerificationPrintHtml = (
	walkers: VerificationWalker[],
	labels: VerificationLabels,
): string => {
	if (!walkers || walkers.length === 0) {
		return `<p>${escapeHtml(labels.noWalkersFound)}</p>`;
	}

	const cards = walkers.map((w) => {
		const name = fullName(w) || '—';
		const idOnRetreat = w.id_on_retreat ?? w.idOnRetreat ?? '';
		const color = w.family_friend_color || w.familyFriendColor || '';
		const idBadge =
			idOnRetreat !== '' && idOnRetreat !== null && idOnRetreat !== undefined
				? `<span class="vc-id" style="${color ? `background-color:${escapeHtml(color)};color:#000;` : ''}">${escapeHtml(idOnRetreat)}</span>`
				: '';
		const mesa = w.tableMesaName
			? `<div class="vc-mesa"><span class="vc-label">${escapeHtml(labels.mesaLabel)}</span> ${escapeHtml(w.tableMesaName)}</div>`
			: '';
		const cell = w.cellPhone ? escapeHtml(w.cellPhone) : labels.notProvided;
		const home = w.homePhone ? escapeHtml(w.homePhone) : labels.notProvided;
		const work = w.workPhone ? escapeHtml(w.workPhone) : labels.notProvided;
		const email = w.email ? escapeHtml(w.email) : labels.notProvided;

		return `<section class="verify-card">
      <header class="vc-head">
        <h2>${escapeHtml(labels.title)}</h2>
        ${mesa}
      </header>
      <p class="vc-instructions">${escapeHtml(labels.instructions)}</p>
      <dl class="vc-data">
        <dt>${escapeHtml(labels.nameLabel)}</dt>
        <dd class="vc-name">${idBadge}${idBadge ? ' ' : ''}${name}</dd>
        <dt>${escapeHtml(labels.cellPhoneLabel)}</dt><dd>${cell}</dd>
        <dt>${escapeHtml(labels.homePhoneLabel)}</dt><dd>${home}</dd>
        <dt>${escapeHtml(labels.workPhoneLabel)}</dt><dd>${work}</dd>
        <dt>${escapeHtml(labels.emailLabel)}</dt><dd class="vc-email">${email}</dd>
      </dl>
      <div class="vc-corrections">
        <span class="vc-label">${escapeHtml(labels.correctionsLabel)}</span>
        <div class="vc-correction-lines"></div>
      </div>
    </section>`;
	});

	return `<div class="verify-grid">${cards.join('')}</div>`;
};

export const buildSimplePrintHtml = (tables: PrintTable[], labels: PrintLabels): string => {
	if (!tables || tables.length === 0) {
		return `<p>${escapeHtml(labels.noTablesFound)}</p>`;
	}

	return tables
		.map((table) => {
			const leaders: Array<{ role: string; p: PrintParticipant }> = [];
			if (table.lider) leaders.push({ role: labels.lider, p: table.lider });
			if (table.colider1) leaders.push({ role: labels.colider1, p: table.colider1 });
			if (table.colider2) leaders.push({ role: labels.colider2, p: table.colider2 });

			const leaderItems = leaders
				.map(
					({ role, p }) =>
						`<li><span class="role">${escapeHtml(role)}:</span> ${fullName(p)}</li>`,
				)
				.join('');

			const walkers = table.walkers || [];
			const walkerItems = walkers
				.map((w) => {
					const idOnRetreat = w.id_on_retreat ?? w.idOnRetreat ?? '';
					const color = w.family_friend_color || w.familyFriendColor || '';
					const idBadge =
						idOnRetreat !== '' && idOnRetreat !== null && idOnRetreat !== undefined
							? `<span class="w-id" style="${color ? `background-color:${escapeHtml(color)};color:#000;` : ''}">${escapeHtml(idOnRetreat)}</span> `
							: '';
					return `<li>${idBadge}${fullName(w)}</li>`;
				})
				.join('');

			return `<section class="table-card">
        <header class="tc-head">
          <h2>${escapeHtml(table.name)}</h2>
          <span class="tc-count">${walkers.length} / 7</span>
        </header>
        ${leaderItems ? `<h3>${escapeHtml(labels.servidores)}</h3><ul class="leaders">${leaderItems}</ul>` : ''}
        <h3>${escapeHtml(labels.caminantes)}</h3>
        ${walkerItems ? `<ul class="walkers">${walkerItems}</ul>` : `<p class="tc-empty">—</p>`}
      </section>`;
		})
		.join('');
};
