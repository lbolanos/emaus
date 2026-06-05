// Contract tests for RESPONSIBILITY_TEAM_TYPE_MAP in packages/types/src/serviceTeam.ts
// Fuente única del vínculo responsabilidad↔equipo, usada por:
//  - backend: apps/api/src/services/leaderSyncService.ts
//  - frontend: apps/web/src/utils/serviceTeamLink.ts (findRelatedTeam)
// Pure data, no database dependencies.

import { ServiceTeamType, RESPONSIBILITY_TEAM_TYPE_MAP } from '@repo/types';

describe('RESPONSIBILITY_TEAM_TYPE_MAP (vínculo canónico responsable→equipo)', () => {
	test('mapea las responsabilidades cuyo nombre difiere del equipo, por teamType', () => {
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Música']).toBe(ServiceTeamType.MUSICA);
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Comedor']).toBe(ServiceTeamType.COCINA);
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Oración de Intercesión']).toBe(ServiceTeamType.ORACION);
	});

	test('los tres palanqueros apuntan al mismo tipo de equipo (palancas)', () => {
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Palanquero 1']).toBe(ServiceTeamType.PALANCAS);
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Palanquero 2']).toBe(ServiceTeamType.PALANCAS);
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Palanquero 3']).toBe(ServiceTeamType.PALANCAS);
	});

	test('mapea las responsabilidades homónimas de su equipo', () => {
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Logistica']).toBe(ServiceTeamType.LOGISTICA);
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Sacerdotes']).toBe(ServiceTeamType.SACERDOTES);
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Snacks']).toBe(ServiceTeamType.SNACKS);
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Compras']).toBe(ServiceTeamType.COMPRAS);
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Transporte']).toBe(ServiceTeamType.TRANSPORTE);
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Salón']).toBe(ServiceTeamType.SALON);
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Cuartos']).toBe(ServiceTeamType.CUARTOS);
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Continua']).toBe(ServiceTeamType.CONTINUA);
	});

	test('NO incluye charlas/textos (no llevan equipo → la vista no muestra botón)', () => {
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['De la Rosa']).toBeUndefined();
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Conociendo a Dios a través de la Oración']).toBeUndefined();
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Quema de Pecados']).toBeUndefined();
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Dinámica de la Pared']).toBeUndefined();
	});

	test('NO incluye responsabilidades sin equipo de servicio', () => {
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Inventario']).toBeUndefined();
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Tesorero']).toBeUndefined();
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Mantelitos']).toBeUndefined();
		expect(RESPONSIBILITY_TEAM_TYPE_MAP['Santísimo']).toBeUndefined();
	});

	test('todos los valores son ServiceTeamType válidos', () => {
		const validTypes = new Set(Object.values(ServiceTeamType));
		for (const [name, type] of Object.entries(RESPONSIBILITY_TEAM_TYPE_MAP)) {
			expect(validTypes.has(type)).toBe(true);
			expect(typeof name).toBe('string');
		}
	});
});
