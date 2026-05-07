<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useToast } from '@repo/ui';
import {
	Button,
	Input,
	Label,
	Textarea,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@repo/ui';
import {
	Loader2,
	CheckCircle2,
	XCircle,
	MapPin,
	User,
	Mail,
	Phone,
	Calendar,
	ExternalLink,
} from 'lucide-vue-next';
import {
	listPendingCommunities,
	approveCommunity,
	rejectCommunity,
} from '@/services/api';
import type { Community } from '@repo/types';

const { toast } = useToast();

const communities = ref<Community[]>([]);
const loading = ref(true);
const processingId = ref<string | null>(null);

const rejectDialogOpen = ref(false);
const rejectionReason = ref('');
const communityToReject = ref<Community | null>(null);

const sortedCommunities = computed(() =>
	[...communities.value].sort((a, b) => {
		const ad = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
		const bd = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
		return bd - ad;
	}),
);

const fetchPending = async () => {
	loading.value = true;
	try {
		communities.value = await listPendingCommunities();
	} catch (error: any) {
		toast({
			title: 'Error al cargar comunidades pendientes',
			description: error.message,
			variant: 'destructive',
		});
	} finally {
		loading.value = false;
	}
};

const handleApprove = async (community: Community) => {
	if (!confirm(`¿Aprobar "${community.name}"? Aparecerá en la landing pública.`)) return;
	processingId.value = community.id;
	try {
		await approveCommunity(community.id);
		toast({ title: 'Comunidad aprobada', description: community.name });
		communities.value = communities.value.filter((c) => c.id !== community.id);
	} catch (error: any) {
		toast({
			title: 'Error al aprobar',
			description: error.message,
			variant: 'destructive',
		});
	} finally {
		processingId.value = null;
	}
};

const openRejectDialog = (community: Community) => {
	communityToReject.value = community;
	rejectionReason.value = '';
	rejectDialogOpen.value = true;
};

const confirmReject = async () => {
	if (!communityToReject.value) return;
	processingId.value = communityToReject.value.id;
	try {
		await rejectCommunity(communityToReject.value.id, rejectionReason.value || undefined);
		toast({
			title: 'Comunidad rechazada',
			description: communityToReject.value.name,
		});
		communities.value = communities.value.filter(
			(c) => c.id !== communityToReject.value?.id,
		);
		rejectDialogOpen.value = false;
		communityToReject.value = null;
	} catch (error: any) {
		toast({
			title: 'Error al rechazar',
			description: error.message,
			variant: 'destructive',
		});
	} finally {
		processingId.value = null;
	}
};

const formatDate = (date?: Date | string | null) => {
	if (!date) return '—';
	return new Date(date).toLocaleDateString('es-MX', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
};

const dayLabels: Record<string, string> = {
	monday: 'Lunes',
	tuesday: 'Martes',
	wednesday: 'Miércoles',
	thursday: 'Jueves',
	friday: 'Viernes',
	saturday: 'Sábado',
	sunday: 'Domingo',
};
const dayLabel = (day?: string | null) =>
	day ? dayLabels[day.toLowerCase()] ?? day : '';

onMounted(() => {
	fetchPending();
});
</script>

<template>
	<div class="container mx-auto px-4 py-6 max-w-5xl">
		<header class="mb-8">
			<h1 class="text-3xl font-bold mb-2">Comunidades pendientes de aprobación</h1>
			<p class="text-stone-600">
				Revisa y aprueba (o rechaza) las comunidades registradas públicamente para que aparezcan en la
				landing.
			</p>
		</header>

		<div v-if="loading" class="flex justify-center py-16">
			<Loader2 class="w-10 h-10 animate-spin text-stone-400" />
		</div>

		<div
			v-else-if="sortedCommunities.length === 0"
			class="text-center py-16 bg-white rounded-xl border border-stone-100"
		>
			<CheckCircle2 class="w-12 h-12 mx-auto mb-4 text-green-500" />
			<p class="text-stone-600">No hay comunidades pendientes de aprobación.</p>
		</div>

		<div v-else class="space-y-4">
			<article
				v-for="community in sortedCommunities"
				:key="community.id"
				class="bg-white rounded-xl border border-stone-200 p-6 shadow-sm"
			>
				<div class="flex items-start justify-between gap-6 flex-wrap">
					<div class="flex-1 min-w-[260px]">
						<h2 class="text-xl font-semibold mb-1">{{ community.name }}</h2>
						<p v-if="community.description" class="text-stone-600 text-sm mb-3">
							{{ community.description }}
						</p>
						<div class="text-sm text-stone-500 flex items-center gap-1 mb-1">
							<MapPin :size="14" />
							<span>
								{{ community.address1 }}<span v-if="community.address2">, {{ community.address2 }}</span>,
								{{ community.city }}, {{ community.state }}, {{ community.country }}
							</span>
						</div>
						<div class="text-sm text-stone-500 flex items-center gap-1 mb-1">
							<Calendar :size="14" />
							<span>Enviada: {{ formatDate(community.submittedAt) }}</span>
						</div>
						<div v-if="community.parish || community.diocese" class="text-sm text-stone-500 mb-1">
							<span v-if="community.parish">{{ community.parish }}</span>
							<span v-if="community.parish && community.diocese"> · </span>
							<span v-if="community.diocese">{{ community.diocese }}</span>
						</div>

						<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-sm">
							<div v-if="community.contactName" class="flex items-center gap-1">
								<User :size="14" class="text-stone-400" />
								<span>{{ community.contactName }}</span>
							</div>
							<div v-if="community.contactEmail" class="flex items-center gap-1">
								<Mail :size="14" class="text-stone-400" />
								<a :href="`mailto:${community.contactEmail}`" class="hover:underline">
									{{ community.contactEmail }}
								</a>
							</div>
							<div v-if="community.contactPhone" class="flex items-center gap-1">
								<Phone :size="14" class="text-stone-400" />
								<span>{{ community.contactPhone }}</span>
							</div>
						</div>

						<div class="flex flex-wrap gap-3 mt-3 text-xs">
							<a
								v-if="community.website"
								:href="community.website"
								target="_blank"
								rel="noopener"
								class="text-blue-600 hover:underline flex items-center gap-1"
							>
								Sitio <ExternalLink :size="12" />
							</a>
							<a
								v-if="community.facebookUrl"
								:href="community.facebookUrl"
								target="_blank"
								rel="noopener"
								class="text-blue-600 hover:underline flex items-center gap-1"
							>
								Facebook <ExternalLink :size="12" />
							</a>
							<a
								v-if="community.instagramUrl"
								:href="community.instagramUrl"
								target="_blank"
								rel="noopener"
								class="text-blue-600 hover:underline flex items-center gap-1"
							>
								Instagram <ExternalLink :size="12" />
							</a>
							<a
								v-if="community.latitude && community.longitude"
								:href="`https://maps.google.com/?q=${community.latitude},${community.longitude}`"
								target="_blank"
								rel="noopener"
								class="text-blue-600 hover:underline flex items-center gap-1"
							>
								Ver mapa <ExternalLink :size="12" />
							</a>
						</div>

						<div
							v-if="community.defaultMeetingDayOfWeek && community.defaultMeetingTime"
							class="mt-3 text-sm text-stone-600 bg-stone-50 rounded-lg px-3 py-2 border border-stone-100"
						>
							<strong>Horario propuesto:</strong>
							{{ dayLabel(community.defaultMeetingDayOfWeek) }} a las
							{{ community.defaultMeetingTime }}
							<span v-if="community.defaultMeetingInterval && community.defaultMeetingInterval > 1">
								(cada {{ community.defaultMeetingInterval }} semanas)
							</span>
							<div v-if="community.defaultMeetingDescription" class="text-xs text-stone-500 mt-1">
								{{ community.defaultMeetingDescription }}
							</div>
						</div>
					</div>

					<div class="flex flex-col gap-2 min-w-[140px]">
						<Button
							@click="handleApprove(community)"
							:disabled="processingId === community.id"
						>
							<Loader2
								v-if="processingId === community.id"
								class="w-4 h-4 mr-2 animate-spin"
							/>
							<CheckCircle2 v-else class="w-4 h-4 mr-2" />
							Aprobar
						</Button>
						<Button
							variant="outline"
							@click="openRejectDialog(community)"
							:disabled="processingId === community.id"
						>
							<XCircle class="w-4 h-4 mr-2" />
							Rechazar
						</Button>
					</div>
				</div>
			</article>
		</div>

		<Dialog
			:open="rejectDialogOpen"
			@update:open="(value: boolean) => (rejectDialogOpen = value)"
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Rechazar comunidad</DialogTitle>
					<DialogDescription>
						{{ communityToReject?.name }} no aparecerá en la landing. Puedes incluir una razón
						(opcional).
					</DialogDescription>
				</DialogHeader>
				<div class="space-y-2 py-2">
					<Label for="rejectionReason">Razón (opcional)</Label>
					<Textarea
						id="rejectionReason"
						v-model="rejectionReason"
						rows="3"
						placeholder="Ej. Datos insuficientes, información duplicada, etc."
					/>
				</div>
				<DialogFooter>
					<Button variant="outline" @click="rejectDialogOpen = false">Cancelar</Button>
					<Button @click="confirmReject" :disabled="processingId !== null">
						<Loader2 v-if="processingId" class="w-4 h-4 mr-2 animate-spin" />
						Rechazar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	</div>
</template>
