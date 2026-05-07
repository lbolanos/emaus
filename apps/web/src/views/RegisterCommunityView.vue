<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useToast } from '@repo/ui';
import {
	Button,
	Input,
	Label,
	Textarea,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@repo/ui';
import { Loader2, MapPin, CheckCircle2, ArrowLeft } from 'lucide-vue-next';
import { publicRegisterCommunity } from '@/services/api';
import { getRecaptchaToken, RECAPTCHA_ACTIONS } from '@/services/recaptcha';
import { loadGoogleMaps } from '@/utils/googleMaps';

const router = useRouter();
const { t } = useI18n();
const { toast } = useToast();

const isSubmitting = ref(false);
const submitted = ref(false);
const mapContainer = ref<HTMLElement | null>(null);
let map: google.maps.Map | null = null;
let marker: google.maps.marker.AdvancedMarkerElement | null = null;
const mapLoading = ref(false);
const autocompleteField = ref<any>(null);

const formData = ref({
	name: '',
	description: '',
	parish: '',
	diocese: '',
	address1: '',
	address2: '',
	city: '',
	state: '',
	zipCode: '',
	country: 'México',
	latitude: 19.4326,
	longitude: -99.1332,
	googleMapsUrl: '',
	website: '',
	facebookUrl: '',
	instagramUrl: '',
	contactName: '',
	contactEmail: '',
	contactPhone: '',
	defaultMeetingDayOfWeek: '' as
		| ''
		| 'monday'
		| 'tuesday'
		| 'wednesday'
		| 'thursday'
		| 'friday'
		| 'saturday'
		| 'sunday',
	defaultMeetingInterval: '1' as '1' | '2' | '3' | '4',
	defaultMeetingTime: '',
	defaultMeetingDurationMinutes: 90,
	defaultMeetingDescription: '',
});

const errors = ref<Record<string, string>>({});

const dayOptions = [
	{ value: 'monday', label: 'Lunes' },
	{ value: 'tuesday', label: 'Martes' },
	{ value: 'wednesday', label: 'Miércoles' },
	{ value: 'thursday', label: 'Jueves' },
	{ value: 'friday', label: 'Viernes' },
	{ value: 'saturday', label: 'Sábado' },
	{ value: 'sunday', label: 'Domingo' },
];

const intervalOptions = [
	{ value: '1', label: 'Cada semana' },
	{ value: '2', label: 'Cada 2 semanas' },
	{ value: '3', label: 'Cada 3 semanas' },
	{ value: '4', label: 'Cada 4 semanas (mensual)' },
];

const setMarkerPosition = (lat: number, lng: number) => {
	formData.value.latitude = lat;
	formData.value.longitude = lng;
};

const waitForGoogleMaps = async (timeoutMs = 5000): Promise<boolean> => {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (typeof window.google?.maps?.importLibrary === 'function') return true;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	return false;
};

const initMap = async () => {
	if (!mapContainer.value) return;
	mapLoading.value = true;
	try {
		await loadGoogleMaps();
		// En Safari/WebKit, script.onload se dispara antes de que google.maps.importLibrary
		// esté disponible; el script base cargó pero la API aún se inicializa.
		const ready = await waitForGoogleMaps();
		if (!ready) {
			console.warn('[RegisterCommunity] Google Maps no disponible — usa lat/lng manual.');
			return;
		}

		// loading=async requiere importLibrary para garantizar que Maps esté listo en
		// Safari/WebKit (en Chromium suele estar precargado pero en Safari la promesa
		// resuelve antes de que google.maps.Map exista).
		const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
			google.maps.importLibrary('maps') as Promise<google.maps.MapsLibrary>,
			google.maps.importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
		]);

		const center = { lat: formData.value.latitude, lng: formData.value.longitude };
		map = new Map(mapContainer.value, {
			center,
			zoom: 12,
			mapTypeControl: false,
			streetViewControl: false,
			scrollwheel: true,
			gestureHandling: 'greedy',
			mapId: 'EMAUS_REGISTER_MAP', // requerido por AdvancedMarkerElement
		});
		marker = new AdvancedMarkerElement({
			position: center,
			map,
			gmpDraggable: true,
		});
		marker.addListener('dragend', () => {
			const pos = marker?.position;
			if (!pos) return;
			const lat = typeof (pos as any).lat === 'function' ? (pos as any).lat() : (pos as any).lat;
			const lng = typeof (pos as any).lng === 'function' ? (pos as any).lng() : (pos as any).lng;
			setMarkerPosition(lat, lng);
		});
		map.addListener('click', (e: google.maps.MapMouseEvent) => {
			if (!e.latLng) return;
			const lat = e.latLng.lat();
			const lng = e.latLng.lng();
			if (marker) marker.position = { lat, lng };
			setMarkerPosition(lat, lng);
		});
	} catch (error) {
		console.error('Error iniciando mapa:', error);
	} finally {
		mapLoading.value = false;
	}
};

const handlePlaceChange = async (event: any) => {
	const placePrediction = event?.placePrediction;
	if (!placePrediction) return;

	const place = placePrediction.toPlace();
	await place.fetchFields({
		fields: ['addressComponents', 'displayName', 'location', 'googleMapsURI'],
	});

	if (place.addressComponents) {
		const address: Record<string, string> = {};
		place.addressComponents.forEach((component: any) => {
			const type = component.types[0];
			address[type] = component.longText;
		});
		formData.value.address1 = `${address.route || ''} ${address.street_number || ''}`.trim();
		formData.value.address2 = address.sublocality_level_1 || formData.value.address2;
		formData.value.city = address.locality || address.administrative_area_level_2 || '';
		formData.value.state = address.administrative_area_level_1 || '';
		formData.value.zipCode = address.postal_code || '';
		formData.value.country = address.country || formData.value.country;
	}
	if (place.location) {
		const lat = place.location.lat();
		const lng = place.location.lng();
		setMarkerPosition(lat, lng);
		if (map && marker) {
			map.setCenter({ lat, lng });
			map.setZoom(16);
			marker.position = { lat, lng };
		}
	}
	if (place.googleMapsURI) {
		formData.value.googleMapsUrl = place.googleMapsURI;
	}
};

watch(autocompleteField, (newField, oldField) => {
	if (oldField) {
		oldField.removeEventListener('gmp-select', handlePlaceChange);
	}
	if (newField) {
		newField.addEventListener('gmp-select', handlePlaceChange);
	}
});

const geocodeFromAddress = async () => {
	if (!(await waitForGoogleMaps(2000))) return;
	const parts = [
		formData.value.address1,
		formData.value.city,
		formData.value.state,
		formData.value.country,
	].filter(Boolean);
	if (parts.length < 2) return;

	const { Geocoder } = (await google.maps.importLibrary(
		'geocoding',
	)) as google.maps.GeocodingLibrary;
	const geocoder = new Geocoder();
	try {
		const result = await geocoder.geocode({ address: parts.join(', ') });
		if (result.results.length > 0) {
			const location = result.results[0].geometry.location;
			const lat = location.lat();
			const lng = location.lng();
			setMarkerPosition(lat, lng);
			if (map && marker) {
				map.setCenter({ lat, lng });
				map.setZoom(15);
				marker.position = { lat, lng };
			}
		}
	} catch (e) {
		console.warn('Geocoding falló:', e);
	}
};

onMounted(async () => {
	await nextTick();
	await initMap();
});

const validate = (): boolean => {
	errors.value = {};
	const required: Array<{ key: keyof typeof formData.value; label: string }> = [
		{ key: 'name', label: 'Nombre de la comunidad' },
		{ key: 'address1', label: 'Dirección' },
		{ key: 'city', label: 'Ciudad' },
		{ key: 'state', label: 'Estado' },
		{ key: 'zipCode', label: 'Código postal' },
		{ key: 'country', label: 'País' },
		{ key: 'contactName', label: 'Nombre del responsable' },
		{ key: 'contactEmail', label: 'Email del responsable' },
	];
	for (const { key, label } of required) {
		if (!String(formData.value[key] ?? '').trim()) {
			errors.value[key] = `${label} es obligatorio`;
		}
	}
	if (
		formData.value.contactEmail &&
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.value.contactEmail)
	) {
		errors.value.contactEmail = 'Email inválido';
	}
	if (
		formData.value.latitude === 0 ||
		formData.value.longitude === 0 ||
		Number.isNaN(formData.value.latitude) ||
		Number.isNaN(formData.value.longitude)
	) {
		errors.value.location = 'Marca la ubicación en el mapa';
	}
	// Si el usuario llenó algo del horario, validar que sean coherentes
	const meetingDay = formData.value.defaultMeetingDayOfWeek;
	const meetingTime = formData.value.defaultMeetingTime;
	if ((meetingDay && !meetingTime) || (!meetingDay && meetingTime)) {
		errors.value.defaultMeeting =
			'Para definir el horario, selecciona día y hora (o deja ambos vacíos)';
	}
	if (meetingTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(meetingTime)) {
		errors.value.defaultMeetingTime = 'Hora inválida (formato HH:mm)';
	}

	return Object.keys(errors.value).length === 0;
};

const trimOrUndefined = (value: string) => {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
};

const handleSubmit = async () => {
	// Capturar el texto actual del autocomplete si el usuario no eligió sugerencia
	if (!formData.value.address1 && autocompleteField.value?.value) {
		formData.value.address1 = autocompleteField.value.value;
	}

	if (!validate()) {
		toast({
			title: 'Revisa el formulario',
			description: 'Hay campos obligatorios o con formato inválido',
			variant: 'destructive',
		});
		return;
	}

	isSubmitting.value = true;
	try {
		const recaptchaToken = await getRecaptchaToken(RECAPTCHA_ACTIONS.COMMUNITY_REGISTER);

		const meetingDay = formData.value.defaultMeetingDayOfWeek;
		const meetingTime = formData.value.defaultMeetingTime?.trim();
		const hasMeeting = !!(meetingDay && meetingTime);

		await publicRegisterCommunity({
			name: formData.value.name.trim(),
			description: trimOrUndefined(formData.value.description),
			address1: formData.value.address1.trim(),
			address2: trimOrUndefined(formData.value.address2),
			city: formData.value.city.trim(),
			state: formData.value.state.trim(),
			zipCode: formData.value.zipCode.trim(),
			country: formData.value.country.trim(),
			latitude: formData.value.latitude,
			longitude: formData.value.longitude,
			googleMapsUrl: trimOrUndefined(formData.value.googleMapsUrl),
			parish: trimOrUndefined(formData.value.parish),
			diocese: trimOrUndefined(formData.value.diocese),
			website: trimOrUndefined(formData.value.website),
			facebookUrl: trimOrUndefined(formData.value.facebookUrl),
			instagramUrl: trimOrUndefined(formData.value.instagramUrl),
			contactName: formData.value.contactName.trim(),
			contactEmail: formData.value.contactEmail.trim().toLowerCase(),
			contactPhone: trimOrUndefined(formData.value.contactPhone),
			defaultMeetingDayOfWeek: hasMeeting ? meetingDay : undefined,
			defaultMeetingInterval: hasMeeting
				? Number(formData.value.defaultMeetingInterval)
				: undefined,
			defaultMeetingTime: hasMeeting ? meetingTime : undefined,
			defaultMeetingDurationMinutes: hasMeeting
				? formData.value.defaultMeetingDurationMinutes
				: undefined,
			defaultMeetingDescription: hasMeeting
				? trimOrUndefined(formData.value.defaultMeetingDescription)
				: undefined,
			recaptchaToken,
		});

		submitted.value = true;
	} catch (error: any) {
		toast({
			title: 'No pudimos registrar la comunidad',
			description: error.message || 'Inténtalo de nuevo más tarde',
			variant: 'destructive',
		});
	} finally {
		isSubmitting.value = false;
	}
};

// Re-geocode cuando cambia la dirección base (sin marker movido manualmente).
let geocodeTimeout: ReturnType<typeof setTimeout> | null = null;
watch(
	() => [formData.value.address1, formData.value.city, formData.value.state, formData.value.country],
	() => {
		if (geocodeTimeout) clearTimeout(geocodeTimeout);
		geocodeTimeout = setTimeout(() => {
			geocodeFromAddress();
		}, 800);
	},
);
</script>

<template>
	<div class="min-h-screen bg-stone-50 font-sans text-stone-800">
		<!-- Nav simple -->
		<nav class="bg-white shadow-sm">
			<div class="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
				<router-link to="/" class="flex items-center gap-2">
					<img src="/crossRoseButtT.png" alt="Emmaus" class="w-8 h-8" />
					<span class="text-xl font-light tracking-widest uppercase text-stone-800">Emaús</span>
				</router-link>
				<router-link
					to="/"
					class="text-sm text-stone-600 hover:text-sage-600 flex items-center gap-1"
				>
					<ArrowLeft :size="16" /> Volver al inicio
				</router-link>
			</div>
		</nav>

		<main class="max-w-3xl mx-auto px-6 py-12">
			<!-- Confirmación post-envío -->
			<div
				v-if="submitted"
				class="bg-white rounded-2xl shadow-sm border border-stone-100 p-12 text-center"
			>
				<div class="w-16 h-16 mx-auto mb-6 rounded-full bg-sage-100 flex items-center justify-center" :style="{ backgroundColor: '#E5EEE7' }">
					<CheckCircle2 class="w-8 h-8" :style="{ color: '#8DAA91' }" />
				</div>
				<h1 class="text-3xl font-light mb-3">¡Gracias por registrar tu comunidad!</h1>
				<p class="text-stone-600 mb-8 leading-relaxed">
					Tu comunidad ha sido enviada para revisión. Un administrador la revisará y, una vez aprobada,
					aparecerá públicamente en nuestra landing.
				</p>
				<Button @click="router.push('/')">Volver al inicio</Button>
			</div>

			<!-- Formulario -->
			<div v-else>
				<header class="mb-10 text-center">
					<span class="text-xs uppercase tracking-widest text-sage-600 font-semibold" :style="{ color: '#8DAA91' }">
						Registra tu comunidad
					</span>
					<h1 class="text-4xl font-light text-stone-900 mt-3 mb-4 leading-tight">
						Comparte tu comunidad de Emaús con el mundo
					</h1>
					<p class="text-stone-600 max-w-xl mx-auto leading-relaxed">
						Llena el formulario para que tu comunidad aparezca en la landing pública. Un administrador
						la revisará antes de publicarla.
					</p>
				</header>

				<form @submit.prevent="handleSubmit" class="space-y-8">
					<!-- Datos de la comunidad -->
					<section class="bg-white rounded-2xl shadow-sm border border-stone-100 p-8">
						<h2 class="text-xl font-medium mb-6 flex items-center gap-2">
							<span class="w-1 h-6 bg-sage-600 rounded" :style="{ backgroundColor: '#8DAA91' }"></span>
							Datos de la comunidad
						</h2>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div class="md:col-span-2">
								<Label for="name">Nombre *</Label>
								<Input
									id="name"
									v-model="formData.name"
									placeholder="Ej. Comunidad Emaús San José"
									:class="{ 'border-destructive': errors.name }"
									:disabled="isSubmitting"
								/>
								<p v-if="errors.name" class="text-sm text-destructive mt-1">{{ errors.name }}</p>
							</div>
							<div class="md:col-span-2">
								<Label for="description">Descripción breve</Label>
								<Textarea
									id="description"
									v-model="formData.description"
									rows="3"
									placeholder="Cuenta brevemente sobre tu comunidad"
									:disabled="isSubmitting"
								/>
							</div>
							<div>
								<Label for="parish">Parroquia</Label>
								<Input
									id="parish"
									v-model="formData.parish"
									placeholder="Ej. San José Obrero"
									:disabled="isSubmitting"
								/>
							</div>
							<div>
								<Label for="diocese">Diócesis</Label>
								<Input
									id="diocese"
									v-model="formData.diocese"
									placeholder="Ej. Arquidiócesis de México"
									:disabled="isSubmitting"
								/>
							</div>
						</div>
					</section>

					<!-- Ubicación -->
					<section class="bg-white rounded-2xl shadow-sm border border-stone-100 p-8">
						<h2 class="text-xl font-medium mb-6 flex items-center gap-2">
							<span class="w-1 h-6 bg-sage-600 rounded" :style="{ backgroundColor: '#8DAA91' }"></span>
							Ubicación
						</h2>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div class="md:col-span-2">
								<Label for="address1">Dirección *</Label>
								<gmp-place-autocomplete
									ref="autocompleteField"
									class="w-full block"
									placeholder="Buscar dirección..."
									:requested-fields="['addressComponents', 'location', 'googleMapsURI']"
								></gmp-place-autocomplete>
								<p class="text-xs text-stone-500 mt-1">
									Empieza a escribir y selecciona una sugerencia para autocompletar ciudad,
									estado y coordenadas.
								</p>
								<div
									v-if="formData.address1"
									class="text-sm text-stone-700 mt-2 px-3 py-2 bg-stone-50 rounded-lg border border-stone-100"
								>
									<strong>Seleccionado:</strong> {{ formData.address1 }}
								</div>
								<p v-if="errors.address1" class="text-sm text-destructive mt-1">
									{{ errors.address1 }}
								</p>
							</div>
							<div class="md:col-span-2">
								<Label for="address2">Detalles adicionales</Label>
								<Input
									id="address2"
									v-model="formData.address2"
									placeholder="Colonia, edificio, depto, etc."
									:disabled="isSubmitting"
								/>
							</div>
							<div>
								<Label for="city">Ciudad *</Label>
								<Input
									id="city"
									v-model="formData.city"
									:class="{ 'border-destructive': errors.city }"
									:disabled="isSubmitting"
								/>
								<p v-if="errors.city" class="text-sm text-destructive mt-1">{{ errors.city }}</p>
							</div>
							<div>
								<Label for="state">Estado *</Label>
								<Input
									id="state"
									v-model="formData.state"
									:class="{ 'border-destructive': errors.state }"
									:disabled="isSubmitting"
								/>
								<p v-if="errors.state" class="text-sm text-destructive mt-1">
									{{ errors.state }}
								</p>
							</div>
							<div>
								<Label for="zipCode">Código postal *</Label>
								<Input
									id="zipCode"
									v-model="formData.zipCode"
									:class="{ 'border-destructive': errors.zipCode }"
									:disabled="isSubmitting"
								/>
								<p v-if="errors.zipCode" class="text-sm text-destructive mt-1">
									{{ errors.zipCode }}
								</p>
							</div>
							<div>
								<Label for="country">País *</Label>
								<Input
									id="country"
									v-model="formData.country"
									:class="{ 'border-destructive': errors.country }"
									:disabled="isSubmitting"
								/>
								<p v-if="errors.country" class="text-sm text-destructive mt-1">
									{{ errors.country }}
								</p>
							</div>
						</div>

						<div class="mt-6">
							<Label class="flex items-center gap-2 mb-2">
								<MapPin :size="16" /> Marca la ubicación en el mapa
							</Label>
							<p class="text-xs text-stone-500 mb-3">
								Arrastra el pin o haz clic en el mapa para ajustar la posición exacta.
							</p>
							<div
								ref="mapContainer"
								class="w-full h-72 rounded-xl border border-stone-200 bg-stone-100"
							></div>
							<p v-if="errors.location" class="text-sm text-destructive mt-2">
								{{ errors.location }}
							</p>
							<div class="grid grid-cols-2 gap-3 mt-3">
								<div>
									<Label class="text-xs">Latitud</Label>
									<Input v-model.number="formData.latitude" type="number" step="any" />
								</div>
								<div>
									<Label class="text-xs">Longitud</Label>
									<Input v-model.number="formData.longitude" type="number" step="any" />
								</div>
							</div>
						</div>
					</section>

					<!-- Horario por defecto -->
					<section class="bg-white rounded-2xl shadow-sm border border-stone-100 p-8">
						<h2 class="text-xl font-medium mb-1 flex items-center gap-2">
							<span class="w-1 h-6 bg-sage-600 rounded" :style="{ backgroundColor: '#8DAA91' }"></span>
							Horario de reunión (opcional)
						</h2>
						<p class="text-sm text-stone-500 mb-6">
							Si llenas estos campos, al aprobarse tu comunidad se creará automáticamente la
							reunión recurrente.
						</p>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<Label>Día de la semana</Label>
								<Select v-model="formData.defaultMeetingDayOfWeek" :disabled="isSubmitting">
									<SelectTrigger>
										<SelectValue placeholder="Selecciona un día" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem v-for="d in dayOptions" :key="d.value" :value="d.value">
											{{ d.label }}
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div>
								<Label>Frecuencia</Label>
								<Select v-model="formData.defaultMeetingInterval" :disabled="isSubmitting">
									<SelectTrigger>
										<SelectValue placeholder="Cada cuánto" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem v-for="i in intervalOptions" :key="i.value" :value="i.value">
											{{ i.label }}
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div>
								<Label for="meetingTime">Hora (24h)</Label>
								<Input
									id="meetingTime"
									v-model="formData.defaultMeetingTime"
									type="time"
									:class="{ 'border-destructive': errors.defaultMeetingTime }"
									:disabled="isSubmitting"
								/>
								<p v-if="errors.defaultMeetingTime" class="text-sm text-destructive mt-1">
									{{ errors.defaultMeetingTime }}
								</p>
							</div>
							<div>
								<Label for="meetingDuration">Duración (minutos)</Label>
								<Input
									id="meetingDuration"
									v-model.number="formData.defaultMeetingDurationMinutes"
									type="number"
									min="15"
									max="600"
									:disabled="isSubmitting"
								/>
							</div>
							<div class="md:col-span-2">
								<Label for="meetingDesc">Detalles del lugar</Label>
								<Textarea
									id="meetingDesc"
									v-model="formData.defaultMeetingDescription"
									rows="2"
									placeholder="Ej. Detrás de la sacristía, después de la misa de 7pm"
									:disabled="isSubmitting"
								/>
							</div>
						</div>
						<p v-if="errors.defaultMeeting" class="text-sm text-destructive mt-3">
							{{ errors.defaultMeeting }}
						</p>
					</section>

					<!-- Redes y sitio -->
					<section class="bg-white rounded-2xl shadow-sm border border-stone-100 p-8">
						<h2 class="text-xl font-medium mb-6 flex items-center gap-2">
							<span class="w-1 h-6 bg-sage-600 rounded" :style="{ backgroundColor: '#8DAA91' }"></span>
							Sitio web y redes sociales (opcional)
						</h2>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div class="md:col-span-2">
								<Label for="website">Sitio web</Label>
								<Input
									id="website"
									v-model="formData.website"
									type="url"
									placeholder="https://"
									:disabled="isSubmitting"
								/>
							</div>
							<div>
								<Label for="facebookUrl">Facebook</Label>
								<Input
									id="facebookUrl"
									v-model="formData.facebookUrl"
									type="url"
									placeholder="https://facebook.com/..."
									:disabled="isSubmitting"
								/>
							</div>
							<div>
								<Label for="instagramUrl">Instagram</Label>
								<Input
									id="instagramUrl"
									v-model="formData.instagramUrl"
									type="url"
									placeholder="https://instagram.com/..."
									:disabled="isSubmitting"
								/>
							</div>
						</div>
					</section>

					<!-- Datos del responsable -->
					<section class="bg-white rounded-2xl shadow-sm border border-stone-100 p-8">
						<h2 class="text-xl font-medium mb-1 flex items-center gap-2">
							<span class="w-1 h-6 bg-sage-600 rounded" :style="{ backgroundColor: '#8DAA91' }"></span>
							Datos del responsable
						</h2>
						<p class="text-sm text-stone-500 mb-6">
							Estos datos solo los verá un administrador para contactarte si es necesario.
						</p>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div class="md:col-span-2">
								<Label for="contactName">Nombre completo *</Label>
								<Input
									id="contactName"
									v-model="formData.contactName"
									:class="{ 'border-destructive': errors.contactName }"
									:disabled="isSubmitting"
								/>
								<p v-if="errors.contactName" class="text-sm text-destructive mt-1">
									{{ errors.contactName }}
								</p>
							</div>
							<div>
								<Label for="contactEmail">Email *</Label>
								<Input
									id="contactEmail"
									v-model="formData.contactEmail"
									type="email"
									:class="{ 'border-destructive': errors.contactEmail }"
									:disabled="isSubmitting"
								/>
								<p v-if="errors.contactEmail" class="text-sm text-destructive mt-1">
									{{ errors.contactEmail }}
								</p>
							</div>
							<div>
								<Label for="contactPhone">Teléfono</Label>
								<Input
									id="contactPhone"
									v-model="formData.contactPhone"
									type="tel"
									:disabled="isSubmitting"
								/>
							</div>
						</div>
					</section>

					<!-- Submit -->
					<div class="flex flex-col sm:flex-row sm:justify-end gap-3 pt-2">
						<Button
							type="button"
							variant="outline"
							@click="router.push('/')"
							:disabled="isSubmitting"
						>
							Cancelar
						</Button>
						<Button type="submit" :disabled="isSubmitting" class="min-w-[180px]">
							<Loader2 v-if="isSubmitting" class="w-4 h-4 mr-2 animate-spin" />
							{{ isSubmitting ? 'Enviando...' : 'Registrar comunidad' }}
						</Button>
					</div>
				</form>
			</div>
		</main>
	</div>
</template>
