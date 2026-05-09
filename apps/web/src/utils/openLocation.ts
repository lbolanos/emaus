import { buildClosingChurchMapsUrl } from '@repo/utils';

/**
 * Abre una ubicación geográfica en la app de mapas más adecuada según
 * la plataforma del dispositivo:
 *
 *   - iOS  → `maps://?q=lat,lng` (Apple Maps directo).
 *   - Android → `geo:lat,lng?q=lat,lng` (selector nativo: Google Maps,
 *     Waze, etc.).
 *   - Otros (desktop, navegadores no detectados) → fallback a la URL
 *     universal HTTP `https://www.google.com/maps/search/?api=1&query=...`.
 *
 * Se mantiene aparte de `@repo/utils` porque depende de `navigator`, que
 * no existe en el backend.
 */
export function openLocation(lat: number, lng: number): void {
	if (typeof navigator === 'undefined') {
		// SSR / entorno sin navigator: nada que abrir.
		return;
	}
	const ua = navigator.userAgent || '';
	const isIOS = /iPad|iPhone|iPod/.test(ua);
	const isAndroid = /Android/.test(ua);

	if (isIOS) {
		window.location.href = `maps://?q=${lat},${lng}`;
	} else if (isAndroid) {
		window.location.href = `geo:${lat},${lng}?q=${lat},${lng}`;
	} else {
		const fallback = buildClosingChurchMapsUrl(lat, lng);
		if (fallback) window.open(fallback, '_blank', 'noopener,noreferrer');
	}
}
