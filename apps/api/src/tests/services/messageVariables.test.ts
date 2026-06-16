import {
	replaceParticipantVariables,
	replaceAllVariables,
	findEmptyVariables,
	type ParticipantData,
	type RetreatData,
} from '@repo/utils';

describe('Message variable replacement', () => {
	const buildParticipant = (overrides: Partial<ParticipantData> = {}): ParticipantData => ({
		firstName: 'Juan',
		lastName: 'Pérez',
		cellPhone: '555-555-5555',
		email: 'juan@example.com',
		emergencyContact1Name: 'María García',
		emergencyContact1Relation: 'Esposa',
		emergencyContact1HomePhone: '111-111-1111',
		emergencyContact1WorkPhone: '111-111-2222',
		emergencyContact1CellPhone: '111-111-3333',
		emergencyContact1Email: 'maria@example.com',
		emergencyContact2Name: 'Carlos López',
		emergencyContact2Relation: 'Hermano',
		emergencyContact2HomePhone: '222-222-1111',
		emergencyContact2WorkPhone: '222-222-2222',
		emergencyContact2CellPhone: '222-222-3333',
		emergencyContact2Email: 'carlos@example.com',
		palancasCoordinator: 'Palanquero 1',
		...overrides,
	});

	describe('Generic emergency contact variables', () => {
		const template =
			'Hola {participant.emergencyContactName} ({participant.emergencyContactRelation}), ' +
			'tel: {participant.emergencyContactCellPhone}, casa: {participant.emergencyContactHomePhone}, ' +
			'trabajo: {participant.emergencyContactWorkPhone}, email: {participant.emergencyContactEmail}';

		it('defaults to emergency contact 1 when no contact key is provided', () => {
			const result = replaceParticipantVariables(template, buildParticipant());
			expect(result).toContain('María García');
			expect(result).toContain('Esposa');
			expect(result).toContain('111-111-3333');
			expect(result).toContain('111-111-1111');
			expect(result).toContain('111-111-2222');
			expect(result).toContain('maria@example.com');
		});

		it('defaults to emergency contact 1 when key is for the participant own phone', () => {
			const result = replaceParticipantVariables(template, buildParticipant(), 'cellPhone');
			expect(result).toContain('María García');
			expect(result).not.toContain('Carlos López');
		});

		it('resolves to emergency contact 2 when key starts with emergencyContact2', () => {
			const result = replaceParticipantVariables(
				template,
				buildParticipant(),
				'emergencyContact2CellPhone',
			);
			expect(result).toContain('Carlos López');
			expect(result).toContain('Hermano');
			expect(result).toContain('222-222-3333');
			expect(result).toContain('222-222-1111');
			expect(result).toContain('222-222-2222');
			expect(result).toContain('carlos@example.com');
			expect(result).not.toContain('María García');
		});

		it('resolves to emergency contact 1 when key starts with emergencyContact1', () => {
			const result = replaceParticipantVariables(
				template,
				buildParticipant(),
				'emergencyContact1HomePhone',
			);
			expect(result).toContain('María García');
			expect(result).not.toContain('Carlos López');
		});

		it('keeps the specific {participant.emergencyContact1Name} variable working for backwards compatibility', () => {
			const result = replaceParticipantVariables(
				'EC1: {participant.emergencyContact1Name} / EC2: {participant.emergencyContact2Name}',
				buildParticipant(),
				'emergencyContact2CellPhone',
			);
			expect(result).toBe('EC1: María García / EC2: Carlos López');
		});

		it('emits empty strings when emergency contact data is missing', () => {
			const result = replaceParticipantVariables(
				'{participant.emergencyContactName}-{participant.emergencyContactCellPhone}',
				buildParticipant({
					emergencyContact1Name: undefined,
					emergencyContact1CellPhone: undefined,
				}),
			);
			expect(result).toBe('-');
		});
	});

	describe('Palanquero variables', () => {
		it('resolves palanquero variables when palanquero data is attached', () => {
			const participant = buildParticipant({
				palanquero: {
					name: 'Ana Rodríguez',
					email: 'ana@example.com',
					cellPhone: '999-999-9999',
				},
			});
			const result = replaceParticipantVariables(
				'Palanquero: {participant.palanqueroName} - {participant.palanqueroEmail} - {participant.palanqueroCellPhone}',
				participant,
			);
			expect(result).toBe('Palanquero: Ana Rodríguez - ana@example.com - 999-999-9999');
		});

		it('emits empty strings when palanquero data is not attached', () => {
			const result = replaceParticipantVariables(
				'[{participant.palanqueroName}]/[{participant.palanqueroEmail}]/[{participant.palanqueroCellPhone}]',
				buildParticipant({ palanquero: undefined }),
			);
			expect(result).toBe('[]/[]/[]');
		});

		it('still exposes the raw palancasCoordinator string', () => {
			const result = replaceParticipantVariables(
				'{participant.palancasCoordinator}',
				buildParticipant({ palancasCoordinator: 'Palanquero 2' }),
			);
			expect(result).toBe('Palanquero 2');
		});
	});

	describe('Data-delete URL variable', () => {
		const ORIGINAL_FRONTEND = process.env.FRONTEND_URL;
		const ORIGINAL_PUBLIC = process.env.PUBLIC_WEB_URL;

		afterEach(() => {
			process.env.FRONTEND_URL = ORIGINAL_FRONTEND;
			process.env.PUBLIC_WEB_URL = ORIGINAL_PUBLIC;
		});

		it('builds the public delete URL from the participant token', () => {
			process.env.PUBLIC_WEB_URL = 'https://emaus.example.com';
			const participant = buildParticipant({ dataDeleteToken: 'abc123' });
			const result = replaceParticipantVariables(
				'Eliminar: {participant.dataDeleteUrl}',
				participant,
			);
			expect(result).toBe('Eliminar: https://emaus.example.com/eliminar-datos/abc123');
		});

		it('falls back to FRONTEND_URL when PUBLIC_WEB_URL is not set', () => {
			delete process.env.PUBLIC_WEB_URL;
			process.env.FRONTEND_URL = 'https://legacy.example.com';
			const participant = buildParticipant({ dataDeleteToken: 'tok-xyz' });
			const result = replaceParticipantVariables(
				'{participant.dataDeleteUrl}',
				participant,
			);
			expect(result).toBe('https://legacy.example.com/eliminar-datos/tok-xyz');
		});

		it('emits an empty string when the participant has no delete token', () => {
			const participant = buildParticipant({ dataDeleteToken: null });
			const result = replaceParticipantVariables(
				'[{participant.dataDeleteUrl}]',
				participant,
			);
			expect(result).toBe('[]');
		});
	});

	describe('replaceAllVariables', () => {
		const retreat: RetreatData = {
			parish: 'San José',
			startDate: '2026-05-01',
			endDate: '2026-05-03',
		};

		it('forwards selectedContactKey to participant variable replacement', () => {
			const template =
				'{participant.firstName} - {participant.emergencyContactName} ({retreat.parish})';
			const result = replaceAllVariables(
				template,
				buildParticipant(),
				retreat,
				'emergencyContact2CellPhone',
			);
			expect(result).toBe('Juan - Carlos López (San José)');
		});

		it('works without selectedContactKey (backwards compatible)', () => {
			const template = '{participant.firstName} - {participant.emergencyContactName}';
			const result = replaceAllVariables(template, buildParticipant(), retreat);
			expect(result).toBe('Juan - María García');
		});

		it('resolves both palanquero and emergency contact variables together', () => {
			const participant = buildParticipant({
				palanquero: { name: 'Ana Rodríguez', email: 'ana@example.com', cellPhone: '999' },
			});
			const template =
				'{participant.palanqueroName} -> {participant.firstName}, contacto: {participant.emergencyContactName}';
			const result = replaceAllVariables(
				template,
				participant,
				retreat,
				'emergencyContact2CellPhone',
			);
			expect(result).toBe('Ana Rodríguez -> Juan, contacto: Carlos López');
		});

		it('usa el apodo si existe; si no, cae al primer nombre', () => {
			const tpl = 'Hola {participant.nickname}';
			// Con apodo → usa el apodo.
			expect(replaceAllVariables(tpl, buildParticipant({ nickname: 'Juancho' }), retreat)).toBe(
				'Hola Juancho',
			);
			// Sin apodo → primer nombre de pila (no queda en blanco).
			expect(
				replaceAllVariables(tpl, buildParticipant({ firstName: 'Hector Leonardo', nickname: undefined }), retreat),
			).toBe('Hola Hector');
		});

		it('resuelve variables {table.*} cuando se pasa el contexto de mesa', () => {
			const tpl = 'Mesa {table.name} ({table.walkersCount}): {table.liderName}';
			const result = replaceAllVariables(tpl, buildParticipant(), retreat, undefined, null, {
				name: 'Mesa 5',
				liderName: 'Oscar',
				walkers: [{ firstName: 'Ana' }, { firstName: 'Luis' }],
			});
			expect(result).toBe('Mesa Mesa 5 (2): Oscar');
		});
	});

	describe('findEmptyVariables', () => {
		const retreat: RetreatData = {
			parish: 'San José',
			startDate: '2026-05-01',
			endDate: '2026-05-03',
		};

		it('returns empty array when all known variables have values', () => {
			const template = 'Hola {participant.firstName}, tu retiro en {retreat.parish}';
			const result = findEmptyVariables(template, buildParticipant(), retreat);
			expect(result).toEqual([]);
		});

		it('detects missing participant variables', () => {
			// `occupation` no tiene fallback (a diferencia de `nickname`, que cae a
			// firstName), así que sirve para verificar la detección de vacíos.
			const template = 'Hola {participant.firstName}, ocupación {participant.occupation}';
			const result = findEmptyVariables(
				template,
				buildParticipant({ occupation: undefined }),
				retreat,
			);
			expect(result).toEqual(['participant.occupation']);
		});

		it('detects missing retreat variables', () => {
			const template = 'Costo: {retreat.cost}, inicio: {retreat.startDate}';
			const result = findEmptyVariables(template, buildParticipant(), {
				...retreat,
				cost: undefined,
			});
			expect(result).toEqual(['retreat.cost']);
		});

		it('respects selectedContactKey when evaluating generic emergency contact variables', () => {
			const p = buildParticipant({
				emergencyContact2Name: undefined,
				emergencyContact2CellPhone: undefined,
			});
			const template = 'Contacto: {participant.emergencyContactName} ({participant.emergencyContactCellPhone})';
			// EC1 is populated → nothing empty
			expect(findEmptyVariables(template, p, retreat, 'emergencyContact1CellPhone')).toEqual([]);
			// EC2 is empty → both report as empty
			expect(findEmptyVariables(template, p, retreat, 'emergencyContact2CellPhone')).toEqual([
				'participant.emergencyContactCellPhone',
				'participant.emergencyContactName',
			]);
		});

		it('ignores unknown placeholders like {custom_message} and {user.name}', () => {
			const template = '{custom_message} {user.name} {inviterName} {participant.firstName}';
			const result = findEmptyVariables(template, buildParticipant(), retreat);
			expect(result).toEqual([]);
		});

		it('dedupes repeated variables', () => {
			const template = '{participant.occupation} y {participant.occupation}';
			const result = findEmptyVariables(
				template,
				buildParticipant({ occupation: undefined }),
				retreat,
			);
			expect(result).toEqual(['participant.occupation']);
		});

		it('reports known variables as empty when participant is null', () => {
			const template = '{participant.firstName} {retreat.parish} {custom_message}';
			const result = findEmptyVariables(template, null, retreat);
			expect(result).toEqual(['participant.firstName']);
		});

		it('flags palanqueroName when palanquero is not attached', () => {
			const template = 'Tu palanquero: {participant.palanqueroName}';
			const result = findEmptyVariables(
				template,
				buildParticipant({ palanquero: undefined }),
				retreat,
			);
			expect(result).toEqual(['participant.palanqueroName']);
		});
	});

	describe('Closing church variables', () => {
		const baseRetreat: RetreatData = {
			parish: 'San José',
			startDate: '2026-05-01',
			endDate: '2026-05-03',
			closingChurchName: 'Parroquia San Judas Tadeo',
			closingChurchAddress: 'Av. Insurgentes Sur 1234, CDMX',
			closingChurchLatitude: 19.3776,
			closingChurchLongitude: -99.1726,
		};

		it('exposes closingChurchName and closingChurchAddress as text variables', () => {
			const template = '{retreat.closingChurchName} en {retreat.closingChurchAddress}';
			const result = replaceAllVariables(template, buildParticipant(), baseRetreat);
			expect(result).toBe('Parroquia San Judas Tadeo en Av. Insurgentes Sur 1234, CDMX');
		});

		it('builds the universal Google Maps URL from lat/lng', () => {
			const template = '{retreat.closingChurchMapsUrl}';
			const result = replaceAllVariables(template, buildParticipant(), baseRetreat);
			expect(result).toBe('https://www.google.com/maps/search/?api=1&query=19.3776,-99.1726');
		});

		it('builds the Waze URL from lat/lng', () => {
			const template = '{retreat.closingChurchWazeUrl}';
			const result = replaceAllVariables(template, buildParticipant(), baseRetreat);
			expect(result).toBe('https://waze.com/ul?ll=19.3776,-99.1726&navigate=yes');
		});

		it('returns empty strings for the URL variables when lat/lng are null', () => {
			const r: RetreatData = {
				...baseRetreat,
				closingChurchLatitude: null,
				closingChurchLongitude: null,
			};
			const template = 'Maps: [{retreat.closingChurchMapsUrl}], Waze: [{retreat.closingChurchWazeUrl}]';
			const result = replaceAllVariables(template, buildParticipant(), r);
			expect(result).toBe('Maps: [], Waze: []');
		});

		it('flags closing church variables as empty when retreat has no church data', () => {
			const template =
				'{retreat.closingChurchName} {retreat.closingChurchAddress} {retreat.closingChurchMapsUrl} {retreat.closingChurchWazeUrl}';
			const r: RetreatData = {
				parish: 'San José',
				startDate: '2026-05-01',
				endDate: '2026-05-03',
			};
			const result = findEmptyVariables(template, buildParticipant(), r);
			expect(result).toEqual([
				'retreat.closingChurchAddress',
				'retreat.closingChurchMapsUrl',
				'retreat.closingChurchName',
				'retreat.closingChurchWazeUrl',
			]);
		});
	});
});
