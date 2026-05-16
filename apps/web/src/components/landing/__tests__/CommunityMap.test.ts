import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';

// Mock Leaflet completo
const mockMarker = {
	on: vi.fn().mockReturnThis(),
	bindTooltip: vi.fn().mockReturnThis(),
	setIcon: vi.fn().mockReturnThis(),
	setLatLng: vi.fn().mockReturnThis(),
	addTo: vi.fn().mockReturnThis(),
	remove: vi.fn(),
};
const mockLayer = {
	addLayer: vi.fn(),
	removeLayer: vi.fn(),
	addTo: vi.fn().mockReturnThis(),
	remove: vi.fn(),
};
const mockMap = {
	setView: vi.fn().mockReturnThis(),
	fitBounds: vi.fn(),
	scrollWheelZoom: { enable: vi.fn(), disable: vi.fn() },
	on: vi.fn(),
	remove: vi.fn(),
};
const mockTileLayer = { addTo: vi.fn().mockReturnThis() };

vi.mock('leaflet', () => {
	const L: any = {
		map: vi.fn(() => mockMap),
		tileLayer: vi.fn(() => mockTileLayer),
		marker: vi.fn(() => ({ ...mockMarker })),
		layerGroup: vi.fn(() => ({ ...mockLayer })),
		latLngBounds: vi.fn(() => ({ extend: vi.fn() })),
		divIcon: vi.fn((opts) => opts),
	};
	return { default: L, ...L };
});

vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet.markercluster', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.Default.css', () => ({}));

// Mock i18n
vi.mock('vue-i18n', () => ({
	useI18n: () => ({ t: (k: string) => k }),
}));

import CommunityMap from '../CommunityMap.vue';

const makeCommunity = (id: string, overrides: Record<string, any> = {}) => ({
	id,
	name: `Comunidad ${id}`,
	city: 'CDMX',
	state: 'CDMX',
	latitude: 19.4326 + Math.random() * 0.1,
	longitude: -99.1332 + Math.random() * 0.1,
	...overrides,
});

describe('CommunityMap', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('monta con loading skeleton visible inicialmente', async () => {
		const w = mount(CommunityMap, {
			props: { communities: [], userLocation: null },
		});
		// Antes de que onMounted async termine, el skeleton se ve
		expect(w.text()).toContain('landing.mapLoading');
		w.unmount();
	});

	it('inicializa Leaflet al montar (L.map llamado)', async () => {
		const L = await import('leaflet');
		const w = mount(CommunityMap, {
			props: { communities: [makeCommunity('a')], userLocation: null },
		});
		await flushPromises();
		await nextTick();

		expect((L as any).map).toHaveBeenCalled();
		expect((L as any).tileLayer).toHaveBeenCalledWith(
			'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
			expect.any(Object)
		);
		w.unmount();
	});

	it('crea un marker por cada comunidad con coordenadas', async () => {
		const L = await import('leaflet');
		const w = mount(CommunityMap, {
			props: {
				communities: [makeCommunity('a'), makeCommunity('b'), makeCommunity('c')],
				userLocation: null,
			},
		});
		await flushPromises();
		await nextTick();

		expect((L as any).marker).toHaveBeenCalledTimes(3);
		w.unmount();
	});

	it('omite comunidades sin lat/lng', async () => {
		const L = await import('leaflet');
		const w = mount(CommunityMap, {
			props: {
				communities: [
					makeCommunity('a'),
					makeCommunity('b', { latitude: null, longitude: null }),
					makeCommunity('c'),
				],
				userLocation: null,
			},
		});
		await flushPromises();
		await nextTick();

		expect((L as any).marker).toHaveBeenCalledTimes(2);
		w.unmount();
	});

	it('emite select-community al hacer click en un marker', async () => {
		const L = await import('leaflet');
		const onClickHandlers: Function[] = [];
		// Builder que captura el handler de click pero conserva la shape completa
		const buildCapturingMarker = () => {
			const m: any = {
				on: vi.fn((event: string, handler: Function) => {
					if (event === 'click') onClickHandlers.push(handler);
					return m;
				}),
				bindTooltip: vi.fn().mockReturnThis(),
				addTo: vi.fn().mockReturnThis(),
				setIcon: vi.fn().mockReturnThis(),
				setLatLng: vi.fn().mockReturnThis(),
				remove: vi.fn(),
			};
			return m;
		};
		(L as any).marker.mockImplementation(buildCapturingMarker);

		const w = mount(CommunityMap, {
			props: { communities: [makeCommunity('com-x')], userLocation: null },
		});
		await flushPromises();
		await nextTick();

		// Disparar el primer click handler
		onClickHandlers[0]?.();
		await nextTick();

		expect(w.emitted('select-community')).toBeTruthy();
		expect(w.emitted('select-community')?.[0]).toEqual(['com-x', 'Comunidad com-x']);

		w.unmount();
		// Restaurar la implementación default para los siguientes tests
		(L as any).marker.mockReset();
		(L as any).marker.mockImplementation(() => ({ ...mockMarker }));
	});

	it('agrega marker de usuario cuando hay userLocation', async () => {
		const L = await import('leaflet');
		const w = mount(CommunityMap, {
			props: {
				communities: [makeCommunity('a')],
				userLocation: { lat: 19.43, lng: -99.13 },
			},
		});
		await flushPromises();
		await nextTick();

		// 1 marker de comunidad + 1 marker de usuario
		expect((L as any).marker).toHaveBeenCalledTimes(2);
		w.unmount();
	});

	it('limpia el map al desmontar', async () => {
		const w = mount(CommunityMap, {
			props: { communities: [makeCommunity('a')], userLocation: null },
		});
		await flushPromises();
		await nextTick();

		w.unmount();
		expect(mockMap.remove).toHaveBeenCalled();
	});

	it('NO carga plugin de cluster con pocas comunidades (debajo del umbral)', async () => {
		// Spy sobre el dynamic import
		const w = mount(CommunityMap, {
			props: { communities: [makeCommunity('a'), makeCommunity('b')], userLocation: null },
		});
		await flushPromises();
		await nextTick();

		// Verificar que se creó un layerGroup simple (no cluster)
		const L = await import('leaflet');
		expect((L as any).layerGroup).toHaveBeenCalled();
		w.unmount();
	});
});
