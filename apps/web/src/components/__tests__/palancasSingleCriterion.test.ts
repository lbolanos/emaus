import { describe, it, expect } from 'vitest';
import { resolvePalancas } from '@repo/utils';

/**
 * Guard del criterio único de cartas en el frontend.
 *
 * Antes había tres criterios distintos sobre la MISMA columna:
 *   - `EditParticipantForm`: `Number(raw) > 0`
 *   - `RetreatDashboardView` (recibidas): texto no vacío
 *   - `RetreatDashboardView` (total): `parseInt`, NaN suma 0
 *
 * Una ficha en prosa salía «Pendiente» en el formulario, «Recibida» en un
 * contador y no sumaba en el otro. Este test reproduce el desglose del
 * dashboard y el estado del formulario con el helper compartido, y fija que
 * los tres coincidan sobre el mismo conjunto de fichas.
 */

// Réplica de `palancasBreakdown` de RetreatDashboardView.
function dashboardBreakdown(walkers: any[], min: number | null) {
	let withLetters = 0;
	let total = 0;
	let none = 0;
	let unknown = 0;
	for (const p of walkers) {
		const { count, milestone } = resolvePalancas(p, min);
		if (milestone === 'unknown') {
			unknown += 1;
			continue;
		}
		if (count && count > 0) {
			withLetters += 1;
			total += count;
		} else {
			none += 1;
		}
	}
	return { withLetters, total, none, unknown };
}

// Réplica de `palancasStatus` de EditParticipantForm.
function formStatus(p: any): string {
	const { count, milestone } = resolvePalancas(p ?? {});
	if (milestone === 'unknown') return 'unknown';
	if ((count ?? 0) > 0) return 'received';
	if (p?.palancasRequested) return 'requested';
	if (p?.palancasCoordinator) return 'assigned';
	return 'pending';
}

const walkers = [
	{ palancasReceivedCount: 4 },
	{ palancasReceivedCount: 2 },
	{ palancasReceivedCount: 0 },
	{ palancasReceived: '3' }, // heredado, aún sin conteo
	{ palancasReceived: 'tres cartas de su mamá' }, // prosa
	// El caso que DISCRIMINA: empieza con dígito, así que un `parseInt` laxo
	// devolvería 3 y lo contaría. Sin esta ficha el test pasa igual aunque el
	// criterio se relaje — verificado con un control negativo.
	{ palancasReceived: '3 de la mamá' },
	{}, // ficha en blanco
];

describe('criterio único de cartas — dashboard', () => {
	it('suma sólo conteos conocidos y saca la prosa aparte', () => {
		const b = dashboardBreakdown(walkers, 3);
		// 4 + 2 + 3 = 9. La prosa NO se adivina.
		expect(b.total).toBe(9);
		expect(b.withLetters).toBe(3);
		// El cero explícito y la ficha en blanco.
		expect(b.none).toBe(2);
		// Las dos en prosa: visibles en su propio contador, no desaparecidas
		// del total ni adivinadas. Si el criterio se relajara, '3 de la mamá'
		// se colaría en `total` y este número bajaría a 1.
		expect(b.unknown).toBe(2);
	});

	it('cada ficha cae en exactamente un contador', () => {
		const b = dashboardBreakdown(walkers, 3);
		expect(b.withLetters + b.none + b.unknown).toBe(walkers.length);
	});

	it('el umbral del retiro no altera los totales, sólo el hito', () => {
		const conTres = dashboardBreakdown(walkers, 3);
		const conDiez = dashboardBreakdown(walkers, 10);
		expect(conDiez.total).toBe(conTres.total);
		expect(conDiez.withLetters).toBe(conTres.withLetters);
	});
});

describe('criterio único de cartas — formulario', () => {
	it('una ficha en prosa ya NO se muestra como pendiente', () => {
		// El bug: `Number('tres cartas…') > 0` es false → «Pendiente».
		expect(formStatus({ palancasReceived: 'tres cartas de su mamá' })).toBe('unknown');
		// Y el caso que un `parseInt` laxo daría por bueno.
		expect(formStatus({ palancasReceived: '3 de la mamá' })).toBe('unknown');
	});

	it('con cartas capturadas dice recibidas', () => {
		expect(formStatus({ palancasReceivedCount: 1 })).toBe('received');
		expect(formStatus({ palancasReceived: '5' })).toBe('received');
	});

	it('cero cartas no es lo mismo que sin capturar', () => {
		expect(formStatus({ palancasReceivedCount: 0 })).toBe('pending');
		expect(formStatus({})).toBe('pending');
	});

	it('cae a solicitadas y asignado cuando no hay cartas', () => {
		expect(formStatus({ palancasRequested: true })).toBe('requested');
		expect(formStatus({ palancasCoordinator: 'Palanquero 1' })).toBe('assigned');
		// Con cartas, el estado de recibidas manda sobre los anteriores.
		expect(formStatus({ palancasReceivedCount: 2, palancasRequested: true })).toBe('received');
	});
});

describe('los tres sitios coinciden', () => {
	it('lo que el formulario llama recibidas es lo que el dashboard cuenta', () => {
		const recibidasSegunFormulario = walkers.filter((p) => formStatus(p) === 'received').length;
		expect(recibidasSegunFormulario).toBe(dashboardBreakdown(walkers, 3).withLetters);
	});

	it('lo que el formulario llama unknown es lo que el dashboard saca aparte', () => {
		const unknownSegunFormulario = walkers.filter((p) => formStatus(p) === 'unknown').length;
		expect(unknownSegunFormulario).toBe(dashboardBreakdown(walkers, 3).unknown);
	});
});
