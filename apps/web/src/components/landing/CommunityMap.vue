<template>
  <div class="w-full h-full rounded-3xl overflow-hidden relative" aria-hidden="true">
    <div ref="mapEl" class="w-full h-full" />
    <!-- Loading skeleton mientras carga el chunk async de Leaflet -->
    <div
      v-if="!ready"
      class="absolute inset-0 flex items-center justify-center bg-stone-100 animate-pulse"
    >
      <div class="flex flex-col items-center gap-3 text-stone-400">
        <div class="w-10 h-10 rounded-full border-2 border-stone-300 border-t-stone-500 animate-spin" />
        <span class="text-xs uppercase tracking-widest font-medium">{{ loadingLabel }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  communities: Array<{ id: string; name: string; city?: string; state?: string; latitude: number; longitude: number }>;
  userLocation?: { lat: number; lng: number } | null;
}>();

const emit = defineEmits<{
  'select-community': [communityId: string, communityName: string];
}>();

const { t } = useI18n();
const loadingLabel = t('landing.mapLoading');

const mapEl = ref<HTMLElement | null>(null);
const ready = ref(false);
let map: any = null;
let L: any = null;
let markersLayer: any = null;
let userMarker: any = null;
// Diff de markers: id → marker para evitar recrear todo en cada render
const markerById = new Map<string, any>();
// Umbral para activar clustering — bajo para que se note ya con datos reales (~12)
const CLUSTER_THRESHOLD = 8;

// Colores de marker: rojo crimson para contrastar con tiles de OSM y verde sage del sitio
const PIN_COLOR = '#dc2626';        // red-600
const PIN_RING = 'rgba(220,38,38,0.30)';

const buildPinIcon = (isNearest: boolean) => L.divIcon({
  className: 'emaus-pin',
  html: `
    <div class="relative flex items-center justify-center emaus-pin-inner">
      <div class="absolute w-10 h-10 rounded-full" style="background:${PIN_RING};${isNearest ? 'animation: ping 1.5s cubic-bezier(0,0,0.2,1) infinite;' : ''}"></div>
      <div class="emaus-pin-dot relative rounded-full border-2 border-white shadow-lg transition-transform duration-150" style="width:${isNearest ? 20 : 14}px;height:${isNearest ? 20 : 14}px;background:${PIN_COLOR};"></div>
    </div>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const renderMarkers = () => {
  if (!map || !L) return;

  const visible = props.communities.filter((c) => c.latitude && c.longitude);
  const incomingIds = new Set(visible.map((c) => c.id));

  // Asegurar contenedor (cluster o group simple). Solo se crea una vez.
  if (!markersLayer) {
    markersLayer =
      visible.length >= CLUSTER_THRESHOLD && (L as any).markerClusterGroup
        ? (L as any).markerClusterGroup({ showCoverageOnHover: false, chunkedLoading: true })
        : L.layerGroup();
    markersLayer.addTo(map);
  }

  // Remover markers que ya no están en la lista
  for (const [id, marker] of markerById.entries()) {
    if (!incomingIds.has(id)) {
      markersLayer.removeLayer(marker);
      markerById.delete(id);
    }
  }

  // Crear/actualizar markers
  visible.forEach((c, i) => {
    const existing = markerById.get(c.id);
    if (existing) {
      // Actualizar icon (puede haber cambiado el "nearest")
      existing.setIcon(buildPinIcon(i === 0));
      existing.setLatLng([c.latitude, c.longitude]);
    } else {
      const marker = L.marker([c.latitude, c.longitude], {
        icon: buildPinIcon(i === 0),
        title: c.name,
        riseOnHover: true,
      });
      const cityState = [c.city, c.state].filter(Boolean).join(', ');
      marker.bindTooltip(
        `<div style="font-weight:600">${c.name}</div>${cityState ? `<div style="font-size:11px;color:#78716c">${cityState}</div>` : ''}`,
        { direction: 'top', offset: [0, -10], opacity: 0.95 }
      );
      marker.on('click', () => emit('select-community', c.id, c.name));
      markersLayer.addLayer(marker);
      markerById.set(c.id, marker);
    }
  });

  if (visible.length > 0) {
    const bounds = L.latLngBounds(visible.map((c) => [c.latitude, c.longitude]));
    if (props.userLocation) bounds.extend([props.userLocation.lat, props.userLocation.lng]);
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 11 });
  }

  if (userMarker) userMarker.remove();
  if (props.userLocation) {
    const userIcon = L.divIcon({
      className: '',
      html: `<div style="width:14px;height:14px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 0 0 2px rgba(37,99,235,0.4)"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    userMarker = L.marker([props.userLocation.lat, props.userLocation.lng], { icon: userIcon, interactive: false }).addTo(map);
  }
};

onMounted(async () => {
  if (!mapEl.value) return;
  const leaflet = await import('leaflet');
  L = leaflet.default || leaflet;
  await import('leaflet/dist/leaflet.css');
  // Cargar plugin de clustering solo si hay suficientes comunidades — lazy
  if (props.communities.length >= CLUSTER_THRESHOLD) {
    await Promise.all([
      import('leaflet.markercluster'),
      import('leaflet.markercluster/dist/MarkerCluster.css'),
      import('leaflet.markercluster/dist/MarkerCluster.Default.css'),
    ]);
  }

  map = L.map(mapEl.value, {
    zoomControl: true,
    scrollWheelZoom: false, // se activa cuando el usuario hace click sobre el mapa
    attributionControl: false,
  }).setView([19.4326, -99.1332], 5);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
  }).addTo(map);

  // Click sobre el mapa activa el scroll-zoom; click afuera lo desactiva
  map.on('click focus', () => {
    map.scrollWheelZoom.enable();
    mapEl.value?.classList.add('map-active');
  });
  const handleOutsideClick = (e: MouseEvent) => {
    if (!mapEl.value?.contains(e.target as Node)) {
      map?.scrollWheelZoom?.disable();
      mapEl.value?.classList.remove('map-active');
    }
  };
  document.addEventListener('click', handleOutsideClick);
  (map as any).__outsideClickHandler = handleOutsideClick;

  ready.value = true;
  renderMarkers();
});

onBeforeUnmount(() => {
  if (map && (map as any).__outsideClickHandler) {
    document.removeEventListener('click', (map as any).__outsideClickHandler);
  }
  if (map) {
    map.remove();
    map = null;
  }
});

watch(() => [props.communities, props.userLocation], () => {
  if (ready.value) renderMarkers();
}, { deep: true });
</script>

<style scoped>
@keyframes ping {
  75%, 100% { transform: scale(2); opacity: 0; }
}
.map-active {
  outline: 2px solid rgba(220, 38, 38, 0.4);
  outline-offset: 1px;
}
</style>

<style>
/* Override Tailwind preflight `img { max-width: 100%; height: auto }` that breaks Leaflet tiles */
.leaflet-container img.leaflet-tile,
.leaflet-container img.leaflet-marker-icon,
.leaflet-container img.leaflet-marker-shadow {
  max-width: none !important;
  max-height: none !important;
  height: auto;
}
.leaflet-container .leaflet-tile-pane img {
  width: 256px !important;
  height: 256px !important;
}
/* Hover state en pines comunitarios */
.emaus-pin:hover .emaus-pin-dot {
  transform: scale(1.4);
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.3), 0 2px 4px rgba(0,0,0,0.2);
}
.emaus-pin { cursor: pointer; }
</style>
