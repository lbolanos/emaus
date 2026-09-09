/**
 * Los actos a los que hay que pedirle al párroco que venga, tal como los deja
 * el template «Emaús — México». Salen impresos en la carta de solicitud
 * (`docs/features/priest-letter.md`), así que un cambio aquí cambia lo que
 * firma el coordinador y lo que lee el sacerdote.
 *
 * Corregido el 2026-09-08 con el coordinador: la misa de envío es a las 12:00
 * en la casa, no a las 13:00 en la parroquia — «si es a las 13:00 conviene que
 * sea en la casa de retiro; si es en la parroquia, sería tipo a las 9».
 */
import { describe, it, expect } from '@jest/globals';
import { __TEST__ } from '../../data/scheduleTemplateSeeder';

const { POLANCO_ITEMS } = __TEST__;

const itemNamed = (name: string) => POLANCO_ITEMS.find((row) => row.name === name);

describe('template Emaús — México: los actos del sacerdote', () => {
	it('la misa de envío es a las 12:00 y en la casa de retiro', () => {
		const mass = itemNamed('Misa de servidores');
		expect(mass).toBeDefined();
		expect(mass?.defaultStartTime).toBe('12:00');
		expect(mass?.locationHint).toBe('Casa de Retiro');
		expect(mass?.defaultDay).toBe(1);
	});

	it('la charla de Sacramentos y las confesiones dicen que son en la casa', () => {
		// Sin `locationHint` la carta no puede decir dónde son: no lo inventa.
		expect(itemNamed('Charla: Amando a Dios a través de los Sacramentos')?.locationHint).toBe(
			'Casa de Retiro',
		);
		expect(itemNamed('Confesiones')?.locationHint).toBe('Casa de Retiro');
	});

	it('los cuatro actos siguen marcados con la responsabilidad que la carta filtra', () => {
		// El filtro de la carta va por responsabilidad, no por nombre: si alguien
		// se la quita a uno de estos, ese acto desaparece de la solicitud.
		expect(itemNamed('Misa de servidores')?.responsabilityName).toBe('Sacerdotes');
		expect(itemNamed('Confesiones')?.responsabilityName).toBe('Sacerdotes');
		expect(itemNamed('Misa de Cierre del Retiro')?.responsabilityName).toBe('Sacerdotes');
		expect(itemNamed('Charla: Amando a Dios a través de los Sacramentos')?.responsabilityName).toBe(
			'Charla: Conociendo a Dios a través de los Sacramentos',
		);
	});
});
