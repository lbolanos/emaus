export interface PrintParticipant {
	firstName?: string | null;
	lastName?: string | null;
	id_on_retreat?: string | number | null;
	idOnRetreat?: string | number | null;
	family_friend_color?: string | null;
	familyFriendColor?: string | null;
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
