import { describe, it, expect, vi, afterEach } from 'vitest';
import { parsePhotonFeature, searchPhoton, type PhotonFeature } from '../photon';

const feature = (properties: PhotonFeature['properties'], lon: number | undefined, lat: number | undefined): PhotonFeature => ({
	properties,
	geometry: lon !== undefined && lat !== undefined ? { coordinates: [lon, lat] } : {},
});

describe('parsePhotonFeature', () => {
	it('compone dirección con número y resuelve la ciudad desde district (formato MX)', () => {
		const result = parsePhotonFeature(
			feature(
				{
					street: 'Calle Jalapa',
					housenumber: '75',
					district: 'Ciudad de México',
					state: 'Ciudad de México',
					country: 'México',
					postcode: '06700',
				},
				-99.1620695,
				19.420118,
			),
		);
		expect(result).not.toBeNull();
		expect(result!.primary).toBe('Calle Jalapa 75');
		expect(result!.address.address1).toBe('Calle Jalapa 75');
		expect(result!.address.city).toBe('Ciudad de México');
		expect(result!.address.state).toBe('Ciudad de México');
		expect(result!.address.zipCode).toBe('06700');
		expect(result!.address.country).toBe('México');
		expect(result!.address.latitude).toBe(19.420118);
		expect(result!.address.longitude).toBe(-99.1620695);
		expect(result!.address.googleMapsUrl).toBe(
			'https://www.google.com/maps/search/?api=1&query=19.420118,-99.1620695',
		);
	});

	it('usa locality como colonia y name cuando no hay street', () => {
		const result = parsePhotonFeature(
			feature(
				{
					name: 'Jalapa',
					locality: 'Colonia Roma Norte',
					district: 'Ciudad de México',
					country: 'México',
					postcode: '06700',
				},
				-99.1624192,
				19.4231037,
			),
		);
		expect(result!.primary).toBe('Jalapa, Colonia Roma Norte');
		expect(result!.secondary).toBe('Ciudad de México, México');
	});

	it('POI con name y sin street usa el nombre del lugar', () => {
		const result = parsePhotonFeature(
			feature(
				{
					name: 'Parroquia Santa María',
					locality: 'Del Valle Centro',
					city: 'Ciudad de México',
					country: 'México',
				},
				-99.1,
				19.3,
			),
		);
		expect(result!.address.address1).toBe('Parroquia Santa María, Del Valle Centro');
		expect(result!.address.placeName).toBe('Parroquia Santa María');
		expect(result!.address.city).toBe('Ciudad de México');
	});

	it('placeName queda vacío cuando el resultado es una calle', () => {
		const result = parsePhotonFeature(
			feature({ street: 'Calle Jalapa', housenumber: '75' }, -99.16, 19.42),
		);
		expect(result!.address.placeName).toBe('');
	});

	it('sin coordenadas devuelve null (resultado no seleccionable)', () => {
		expect(parsePhotonFeature(feature({ street: 'Calle 1' }, undefined, undefined))).toBeNull();
	});

	it('sin street ni name devuelve null, nunca una coma huérfana', () => {
		expect(
			parsePhotonFeature(feature({ locality: 'Colonia X', city: 'Ciudad de México' }, -99, 19)),
		).toBeNull();
	});

	it('sin locality la dirección queda limpia, sin coma final', () => {
		const result = parsePhotonFeature(feature({ street: 'Av. Principal', housenumber: '123' }, -99, 19));
		expect(result!.address.address1).toBe('Av. Principal 123');
	});
});

describe('searchPhoton', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('no consulta con menos de 3 caracteres', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		expect(await searchPhoton('av')).toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('consulta el endpoint con lang=default y parsea las sugerencias', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				features: [
					feature({ street: 'Calle Jalapa', housenumber: '75', district: 'Ciudad de México' }, -99.16, 19.42),
					feature({ street: 'Calle Sin Coords' }, undefined, undefined),
				],
			}),
		});
		vi.stubGlobal('fetch', fetchMock);
		const results = await searchPhoton('Jalapa 75', { limit: 5 });
		expect(results).toHaveLength(1);
		expect(results[0].address.address1).toBe('Calle Jalapa 75');
		const calledUrl = fetchMock.mock.calls[0][0] as string;
		expect(calledUrl).toContain('https://photon.komoot.io/api/?');
		expect(calledUrl).toContain('q=Jalapa+75');
		expect(calledUrl).toContain('limit=5');
		expect(calledUrl).toContain('lang=default');
	});

	it('propaga el abort signal a fetch', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) });
		vi.stubGlobal('fetch', fetchMock);
		const controller = new AbortController();
		await searchPhoton('Jalapa 75', { signal: controller.signal });
		expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
	});

	it('incluye el sesgo geográfico cuando se pasan lat/lon', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) });
		vi.stubGlobal('fetch', fetchMock);
		await searchPhoton('Jalapa 75', { lat: 19.4326, lon: -99.1332, zoom: 9 });
		const calledUrl = fetchMock.mock.calls[0][0] as string;
		expect(calledUrl).toContain('lat=19.4326');
		expect(calledUrl).toContain('lon=-99.1332');
		expect(calledUrl).toContain('zoom=9');
	});

	it('lanza error si el endpoint responde mal', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
		await expect(searchPhoton('Jalapa 75')).rejects.toThrow('Photon respondió 503');
	});
});
