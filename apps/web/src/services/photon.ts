/**
 * Autocomplete de direcciones sobre Photon (OpenStreetMap, komoot).
 * Reemplaza a gmp-place-autocomplete de Google Maps: sin API key, sin
 * facturación, y cada sugerencia trae todos los campos en la misma llamada
 * (Google requería sugerencia + Place Details).
 *
 * Nota de parseo para México: Photon suele devolver la colonia en
 * `locality` y el nombre de la ciudad en `district` (no en `city`).
 */

export interface PhotonAddress {
	address1: string;
	/** Nombre del lugar (POI) cuando el resultado no es una calle; vacío si lo es. */
	placeName: string;
	city: string;
	state: string;
	zipCode: string;
	country: string;
	latitude: number;
	longitude: number;
	googleMapsUrl: string;
}

export interface PhotonSuggestion {
	primary: string;
	secondary: string;
	address: PhotonAddress;
}

interface PhotonFeature {
	properties?: {
		name?: string;
		street?: string;
		housenumber?: string;
		locality?: string;
		district?: string;
		city?: string;
		town?: string;
		village?: string;
		municipality?: string;
		county?: string;
		state?: string;
		country?: string;
		postcode?: string;
	};
	geometry?: {
		coordinates?: [number, number];
	};
}

export interface PhotonResponse {
	features?: PhotonFeature[];
}

const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/';

const nonEmpty = (value: string | undefined): string | undefined =>
	value && value.trim() !== '' ? value.trim() : undefined;

export function parsePhotonFeature(feature: PhotonFeature): PhotonSuggestion | null {
	const p = feature.properties ?? {};
	const coords = feature.geometry?.coordinates;
	const lon = coords?.[0];
	const lat = coords?.[1];
	if (typeof lat !== 'number' || typeof lon !== 'number') return null;

	const street = nonEmpty(p.street);
	const housenumber = nonEmpty(p.housenumber);
	const name = nonEmpty(p.name);
	const locality = nonEmpty(p.locality);

	// `name` es el POI cuando el resultado no es una calle con número.
	const streetPart = street
		? `${street}${housenumber ? ` ${housenumber}` : ''}`
		: (name ?? '');
	// Sin calle ni POI no hay dirección utilizable ("Colonia X" sola no sirve).
	if (!streetPart) return null;
	// Partes filtradas: nunca una coma huérfana ("", EL PEDREGAL").
	const address1 = [streetPart, locality].filter(Boolean).join(', ');

	const city =
		nonEmpty(p.city) ??
		nonEmpty(p.town) ??
		nonEmpty(p.village) ??
		nonEmpty(p.municipality) ??
		nonEmpty(p.county) ??
		nonEmpty(p.district) ??
		'';
	const state = nonEmpty(p.state) ?? '';
	const country = nonEmpty(p.country) ?? '';
	const zipCode = nonEmpty(p.postcode) ?? '';

	const secondary = [city, state, country].filter(Boolean).join(', ');

	return {
		primary: address1,
		secondary,
		address: {
			address1,
			placeName: street ? '' : (name ?? ''),
			city,
			state,
			zipCode,
			country,
			latitude: lat,
			longitude: lon,
			googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
		},
	};
}

export async function searchPhoton(
	query: string,
	options: {
		limit?: number;
		signal?: AbortSignal;
		/** Sesgo geográfico: prioriza resultados cercanos a este punto. */
		lat?: number;
		lon?: number;
		/** 1 (país) a 16 (calle): mayor zoom, sesgo más fuerte. */
		zoom?: number;
	} = {},
): Promise<PhotonSuggestion[]> {
	const trimmed = query.trim();
	if (trimmed.length < 3) return [];

	const params = new URLSearchParams({
		q: trimmed,
		limit: String(options.limit ?? 6),
		lang: 'default',
	});
	if (typeof options.lat === 'number' && typeof options.lon === 'number') {
		params.set('lat', String(options.lat));
		params.set('lon', String(options.lon));
		params.set('zoom', String(options.zoom ?? 9));
	}
	const response = await fetch(`${PHOTON_ENDPOINT}?${params.toString()}`, {
		signal: options.signal,
	});
	if (!response.ok) throw new Error(`Photon respondió ${response.status}`);

	const data = (await response.json()) as PhotonResponse;
	const suggestions: PhotonSuggestion[] = [];
	for (const feature of data.features ?? []) {
		const parsed = parsePhotonFeature(feature);
		if (parsed) suggestions.push(parsed);
	}
	return suggestions;
}
