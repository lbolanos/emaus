<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { MessageSquare, Mail, Users, Clock, Send } from 'lucide-vue-next';
import { useRetreatStore } from '@/stores/retreatStore';
import {
	useParticipantCommunicationStore,
	type CommunicationStats,
} from '@/stores/participantCommunicationStore';
import { useMessageSequenceStore } from '@/stores/messageSequenceStore';

const { t } = useI18n();
const retreatStore = useRetreatStore();
const commStore = useParticipantCommunicationStore();
const sequenceStore = useMessageSequenceStore();
const { queue } = storeToRefs(sequenceStore);

const retreatId = computed(() => retreatStore.selectedRetreatId || '');
const stats = ref<CommunicationStats | null>(null);
const loading = ref(false);

async function load() {
	if (!retreatId.value) return;
	loading.value = true;
	try {
		const [s] = await Promise.all([
			commStore.fetchRetreatCommunicationStats(retreatId.value),
			sequenceStore.fetchQueue(retreatId.value),
		]);
		stats.value = s;
	} finally {
		loading.value = false;
	}
}

onMounted(load);
watch(retreatId, load);

const maxRecent = computed(() =>
	Math.max(1, ...(stats.value?.recentActivity || []).map((r) => r.count)),
);
</script>

<template>
	<div class="p-4 space-y-6">
		<div>
			<h1 class="text-2xl font-semibold">{{ t('commDashboard.title') }}</h1>
			<p class="text-gray-600 text-sm">{{ t('commDashboard.subtitle') }}</p>
		</div>

		<div v-if="stats" class="grid grid-cols-2 md:grid-cols-4 gap-3">
			<div class="border rounded-md p-4">
				<div class="flex items-center gap-2 text-gray-500 text-sm">
					<Send class="w-4 h-4" /> {{ t('commDashboard.total') }}
				</div>
				<div class="text-2xl font-semibold mt-1">{{ stats.totalCommunications }}</div>
			</div>
			<div class="border rounded-md p-4">
				<div class="flex items-center gap-2 text-green-600 text-sm">
					<MessageSquare class="w-4 h-4" /> WhatsApp
				</div>
				<div class="text-2xl font-semibold mt-1">{{ stats.whatsappCount }}</div>
			</div>
			<div class="border rounded-md p-4">
				<div class="flex items-center gap-2 text-blue-600 text-sm">
					<Mail class="w-4 h-4" /> Email
				</div>
				<div class="text-2xl font-semibold mt-1">{{ stats.emailCount }}</div>
			</div>
			<div class="border rounded-md p-4">
				<div class="flex items-center gap-2 text-gray-500 text-sm">
					<Users class="w-4 h-4" /> {{ t('commDashboard.reached') }}
				</div>
				<div class="text-2xl font-semibold mt-1">{{ stats.uniqueParticipantsCount }}</div>
			</div>
		</div>

		<!-- Pendientes en cola -->
		<div class="border rounded-md p-4 flex items-center gap-3">
			<Clock class="w-5 h-5 text-amber-500" />
			<div>
				<div class="text-sm text-gray-500">{{ t('commDashboard.queued') }}</div>
				<div class="text-xl font-semibold">{{ queue.length }}</div>
			</div>
		</div>

		<!-- Actividad reciente (últimos 30 días) -->
		<div v-if="stats && stats.recentActivity.length" class="border rounded-md p-4">
			<h2 class="text-sm font-medium mb-3">{{ t('commDashboard.recentActivity') }}</h2>
			<div class="flex items-end gap-1 h-32">
				<div
					v-for="(r, i) in stats.recentActivity"
					:key="i"
					class="flex-1 bg-blue-400 rounded-t"
					:style="{ height: `${(r.count / maxRecent) * 100}%` }"
					:title="`${r.date}: ${r.count}`"
				></div>
			</div>
		</div>

		<!-- Top plantillas -->
		<div v-if="stats && stats.topTemplates.length" class="border rounded-md p-4">
			<h2 class="text-sm font-medium mb-3">{{ t('commDashboard.topTemplates') }}</h2>
			<div class="space-y-1">
				<div
					v-for="(tpl, i) in stats.topTemplates"
					:key="i"
					class="flex items-center justify-between text-sm"
				>
					<span class="truncate">{{ tpl.templateName }}</span>
					<span class="text-gray-500">{{ tpl.usageCount }}</span>
				</div>
			</div>
		</div>

		<div v-if="!stats && !loading" class="text-sm text-gray-500 text-center py-8">
			{{ t('commDashboard.empty') }}
		</div>
	</div>
</template>
