import { describe, it, expect } from 'vitest';
import { findRelatedTeam } from '../serviceTeamLink';
import { ServiceTeamType } from '@repo/types';

// Equipos por defecto representativos de un retiro (solo los campos que usa el resolver).
const teams: any[] = [
	{ id: 't-cocina', name: 'Cocina / Comedor', teamType: ServiceTeamType.COCINA },
	{ id: 't-musica', name: 'Música y Alabanza', teamType: ServiceTeamType.MUSICA },
	{ id: 't-palancas', name: 'Palancas', teamType: ServiceTeamType.PALANCAS },
	{ id: 't-logistica', name: 'Logística', teamType: ServiceTeamType.LOGISTICA },
	{ id: 't-oracion', name: 'Intercesión / Oración', teamType: ServiceTeamType.ORACION },
	{ id: 't-sacerdotes', name: 'Sacerdotes', teamType: ServiceTeamType.SACERDOTES },
	{ id: 't-cuartos', name: 'Cuartos', teamType: ServiceTeamType.CUARTOS },
];

describe('findRelatedTeam', () => {
	it('resuelve por tipo aunque el nombre del equipo difiera del de la responsabilidad', () => {
		// "Música" (responsabilidad) → equipo "Música y Alabanza" (teamType musica)
		expect(findRelatedTeam('Música', teams)?.id).toBe('t-musica');
		// "Comedor" → equipo "Cocina / Comedor" (teamType cocina)
		expect(findRelatedTeam('Comedor', teams)?.id).toBe('t-cocina');
		// "Oración de Intercesión" → equipo "Intercesión / Oración" (teamType oracion)
		expect(findRelatedTeam('Oración de Intercesión', teams)?.id).toBe('t-oracion');
	});

	it('mapea los tres palanqueros al mismo equipo de Palancas', () => {
		expect(findRelatedTeam('Palanquero 1', teams)?.id).toBe('t-palancas');
		expect(findRelatedTeam('Palanquero 2', teams)?.id).toBe('t-palancas');
		expect(findRelatedTeam('Palanquero 3', teams)?.id).toBe('t-palancas');
	});

	it('resuelve responsabilidades con nombre directo', () => {
		expect(findRelatedTeam('Logistica', teams)?.id).toBe('t-logistica');
		expect(findRelatedTeam('Sacerdotes', teams)?.id).toBe('t-sacerdotes');
		expect(findRelatedTeam('Cuartos', teams)?.id).toBe('t-cuartos');
	});

	it('devuelve null para charlas (no están en el mapeo → sin botón)', () => {
		expect(findRelatedTeam('De la Rosa', teams)).toBeNull();
		expect(findRelatedTeam('Conociendo a Dios a través de la Oración', teams)).toBeNull();
		expect(findRelatedTeam('Sanación de los Recuerdos (Sanando Heridas)', teams)).toBeNull();
	});

	it('devuelve null para responsabilidades sin equipo asociado', () => {
		expect(findRelatedTeam('Inventario', teams)).toBeNull();
		expect(findRelatedTeam('Tesorero', teams)).toBeNull();
		expect(findRelatedTeam('Mantelitos', teams)).toBeNull();
		expect(findRelatedTeam('Santísimo', teams)).toBeNull();
	});

	it('devuelve null cuando el mapeo existe pero el equipo aún no está en el retiro', () => {
		// "Continua" está en el mapeo (CONTINUA) pero no hay equipo de ese tipo cargado.
		expect(findRelatedTeam('Continua', teams)).toBeNull();
	});

	it('devuelve el primer equipo del tipo cuando hay varios', () => {
		const dup = [
			{ id: 'a', name: 'Música y Alabanza', teamType: ServiceTeamType.MUSICA },
			{ id: 'b', name: 'Música (Otro)', teamType: ServiceTeamType.MUSICA },
		];
		expect(findRelatedTeam('Música', dup)?.id).toBe('a');
	});
});
