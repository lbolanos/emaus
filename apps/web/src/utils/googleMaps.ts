import { getGoogleMapsApiKey } from '@/config/runtimeConfig';

let loadPromise: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
	if (loadPromise) return loadPromise;

	loadPromise = new Promise((resolve, reject) => {
		// Already loaded
		if (window.google?.maps) {
			resolve();
			return;
		}

		// getGoogleMapsApiKey() reads window.EMAUS_RUNTIME_CONFIG (production).
		// Fall back to the Vite build-time variable for local dev.
		const apiKey = getGoogleMapsApiKey() || import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
		if (!apiKey) {
			console.warn('[Maps] No Google Maps API key configured — map features disabled.');
			resolve();
			return;
		}

		const script = document.createElement('script');
		script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
		script.async = true;
		script.onload = () => resolve();
		script.onerror = () => {
			loadPromise = null;
			reject(new Error('Failed to load Google Maps'));
		};
		document.head.appendChild(script);
	});

	return loadPromise;
}
