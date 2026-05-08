/**
 * Tests del helper `inferTimezoneFromCoords` (apps/api/src/utils/date.transformer.ts).
 *
 * El helper se usa al guardar/editar una casa: cuando el usuario selecciona
 * una dirección con Google Places y obtenemos lat/lon, el frontend pide al
 * backend qué timezone IANA corresponde a esas coords (`tz-lookup`).
 *
 * Aceptamos que el lookup pueda fallar para coords inválidas o mar abierto:
 * el caller cae al default 'America/Mexico_City'. Lo crítico es que NO
 * lance excepciones y devuelva un IANA correcto para puntos terrestres.
 */
import { inferTimezoneFromCoords } from '../../utils/date.transformer';

describe('inferTimezoneFromCoords', () => {
	it('CDMX (19.43, -99.13) → America/Mexico_City', async () => {
		const tz = await inferTimezoneFromCoords(19.4326, -99.1332);
		expect(tz).toBe('America/Mexico_City');
	});

	it('Bogotá (4.71, -74.07) → America/Bogota', async () => {
		const tz = await inferTimezoneFromCoords(4.711, -74.0721);
		expect(tz).toBe('America/Bogota');
	});

	it('Madrid (40.42, -3.70) → Europe/Madrid', async () => {
		const tz = await inferTimezoneFromCoords(40.4168, -3.7038);
		expect(tz).toBe('Europe/Madrid');
	});

	it('Cancún (21.16, -86.85) → America/Cancun (zona distinta a CDMX)', async () => {
		const tz = await inferTimezoneFromCoords(21.1619, -86.8515);
		expect(tz).toBe('America/Cancun');
	});

	it('Lima (-12.05, -77.04) → America/Lima', async () => {
		const tz = await inferTimezoneFromCoords(-12.0464, -77.0428);
		expect(tz).toBe('America/Lima');
	});

	it('null/undefined → null (sin lanzar)', async () => {
		expect(await inferTimezoneFromCoords(null, null)).toBe(null);
		expect(await inferTimezoneFromCoords(undefined, undefined)).toBe(null);
	});

	it('NaN → null', async () => {
		expect(await inferTimezoneFromCoords(NaN, NaN)).toBe(null);
		expect(await inferTimezoneFromCoords(19.43, NaN)).toBe(null);
	});

	it('lat fuera de [-90, 90] → null', async () => {
		expect(await inferTimezoneFromCoords(91, 0)).toBe(null);
		expect(await inferTimezoneFromCoords(-91, 0)).toBe(null);
	});

	it('lon fuera de [-180, 180] → null', async () => {
		expect(await inferTimezoneFromCoords(0, 181)).toBe(null);
		expect(await inferTimezoneFromCoords(0, -181)).toBe(null);
	});

	it('boundary: lat=90, lon=180 son válidos', async () => {
		// Polo norte y antimeridiano: tz-lookup devuelve algo (no null), aunque
		// sea zona artificial. Lo importante es que no lance.
		const result = await inferTimezoneFromCoords(90, 180);
		expect(typeof result).toBe('string');
	});

	it('mar abierto Pacífico (0, -150) devuelve un IANA Etc/GMT*', async () => {
		// tz-lookup tiene catálogo de océanos como Etc/GMT+10 etc. NO debería
		// ser null para coords válidos.
		const tz = await inferTimezoneFromCoords(0, -150);
		expect(tz).not.toBeNull();
		expect(tz).toMatch(/^(Etc\/|Pacific\/)/);
	});

	it('llamadas concurrentes funcionan (cache interna)', async () => {
		const [a, b, c] = await Promise.all([
			inferTimezoneFromCoords(19.4326, -99.1332),
			inferTimezoneFromCoords(4.711, -74.0721),
			inferTimezoneFromCoords(40.4168, -3.7038),
		]);
		expect(a).toBe('America/Mexico_City');
		expect(b).toBe('America/Bogota');
		expect(c).toBe('Europe/Madrid');
	});
});
