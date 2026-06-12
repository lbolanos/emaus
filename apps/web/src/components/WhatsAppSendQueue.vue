<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '@repo/ui';
import { Button } from '@repo/ui';
import { X, MessageSquare, Check, ExternalLink } from 'lucide-vue-next';
import { convertHtmlToWhatsApp, replaceAllVariables } from '@/utils/message';
import type { ParticipantData, RetreatData } from '@/utils/message';
import { sanitizePhoneForWhatsapp } from '@/utils/phone';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantCommunicationStore } from '@/stores/participantCommunicationStore';
import { getMessageTemplateAudience } from '@repo/types';

/**
 * Cola de envío de WhatsApp ASISTIDA: cada mensaje se manda desde la cuenta de
 * WhatsApp del propio usuario (deep link `api.whatsapp.com/send`). El sistema
 * resuelve las variables por destinatario, copia el texto al portapapeles, abre
 * WhatsApp y registra el envío en el historial. No es automático: el usuario
 * confirma cada envío con un clic (1 gesto = 1 `window.open`, requerido por el
 * navegador).
 */
const props = defineProps<{
	open: boolean;
	participants: any[];
	retreatId: string;
	templates: any[];
}>();

const emit = defineEmits<{ 'update:open': [boolean] }>();

const { t } = useI18n();
const { toast } = useToast();
const retreatStore = useRetreatStore();
const participantCommunicationStore = useParticipantCommunicationStore();

const selectedTemplateId = ref('');
const baseMessage = ref('');
// participantId → 'sent' (los que no están marcados quedan 'pending').
const sentIds = ref<Set<string>>(new Set());

interface QueueItem {
	id: string;
	participant: any;
	name: string;
	phone: string; // dígitos sanitizados ('' si no hay teléfono)
}

const queue = computed<QueueItem[]>(() =>
	(props.participants || []).map((p: any) => ({
		id: String(p.id),
		participant: p,
		name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
		phone: sanitizePhoneForWhatsapp(p.cellPhone),
	})),
);

const withPhone = computed(() => queue.value.filter((i) => i.phone.length >= 10));
const withoutPhone = computed(() => queue.value.filter((i) => i.phone.length < 10));
const sentCount = computed(() => withPhone.value.filter((i) => sentIds.value.has(i.id)).length);

const selectedTemplate = computed(() =>
	props.templates.find((tpl: any) => tpl.id === selectedTemplateId.value),
);

function onTemplateSelect(templateId: string) {
	selectedTemplateId.value = templateId;
	const tpl = props.templates.find((x: any) => x.id === templateId);
	baseMessage.value = tpl?.message || '';
}

/** Resuelve variables del mensaje para un participante (HTML → texto WhatsApp). */
function resolvedMessageFor(item: QueueItem): string {
	const retreatData = retreatStore.selectedRetreat as unknown as RetreatData;
	const participantData = item.participant as unknown as ParticipantData;
	const personalized = replaceAllVariables(baseMessage.value, participantData, retreatData);
	return convertHtmlToWhatsApp(personalized);
}

function tryOpenUrl(url: string, fallback?: () => void) {
	try {
		const w = window.open(url, '_blank');
		if (!w) fallback?.();
	} catch {
		fallback?.();
	}
}

async function sendOne(item: QueueItem) {
	if (!baseMessage.value.trim()) {
		toast({
			title: t('whatsappQueue.noMessageTitle'),
			description: t('whatsappQueue.noMessageDesc'),
			variant: 'destructive',
		});
		return;
	}

	const message = resolvedMessageFor(item);

	// Copiar al portapapeles como respaldo (si el deep link no rellena el texto).
	try {
		await navigator.clipboard.writeText(message);
	} catch {
		/* clipboard puede fallar sin https; no es bloqueante */
	}

	const url = `https://api.whatsapp.com/send?phone=${item.phone}&text=${encodeURIComponent(message)}`;
	tryOpenUrl(url, () => {
		toast({
			title: t('whatsappQueue.openFallbackTitle'),
			description: t('whatsappQueue.openFallbackDesc'),
		});
	});

	// Registrar en el historial de comunicaciones (no bloquea el envío).
	try {
		const tpl = selectedTemplate.value;
		await participantCommunicationStore.createCommunication({
			participantId: item.id,
			retreatId: props.retreatId,
			messageType: 'whatsapp',
			recipientContact: item.participant.cellPhone || item.phone,
			recipientContactKey: 'participant:cellPhone',
			recipientName: item.name,
			audience: tpl ? getMessageTemplateAudience(tpl.type) : undefined,
			messageContent: message,
			templateId: tpl?.id || undefined,
			templateName: tpl?.name,
		});
	} catch (err) {
		console.error('[WhatsAppSendQueue] failed to save history:', err);
	}

	sentIds.value.add(item.id);
	// Forzar reactividad del Set en el computed sentCount.
	sentIds.value = new Set(sentIds.value);
}

function close() {
	emit('update:open', false);
}

// Reset al abrir.
watch(
	() => props.open,
	(isOpen) => {
		if (isOpen) {
			sentIds.value = new Set();
			selectedTemplateId.value = '';
			baseMessage.value = '';
		}
	},
);
</script>

<template>
	<div
		v-if="open"
		class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
		@click.self="close"
	>
			<div class="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
				<!-- Header -->
				<div class="flex items-center justify-between p-6 border-b">
					<div>
						<h2 class="text-xl font-semibold flex items-center gap-2">
							<MessageSquare class="w-5 h-5 text-green-600" />
							{{ t('whatsappQueue.title') }}
						</h2>
						<p class="text-gray-600 mt-1 text-sm">
							{{ t('whatsappQueue.description', { count: withPhone.length }) }}
						</p>
					</div>
					<Button variant="ghost" size="icon" @click="close">
						<X class="w-5 h-5" />
					</Button>
				</div>

				<!-- Body -->
				<div class="p-6 overflow-y-auto space-y-4 flex-1">
					<!-- Template selector -->
					<div>
						<label class="text-sm font-medium">{{ t('whatsappQueue.template') }}:</label>
						<select
							class="w-full mt-1 p-2 border rounded-md text-sm"
							:value="selectedTemplateId"
							@change="onTemplateSelect(($event.target as HTMLSelectElement).value)"
						>
							<option value="">{{ t('whatsappQueue.selectTemplate') }}</option>
							<option v-for="tpl in templates" :key="tpl.id" :value="tpl.id">
								{{ tpl.name }}
							</option>
						</select>
					</div>

					<!-- Message (editable) -->
					<div>
						<label class="text-sm font-medium">{{ t('whatsappQueue.message') }}:</label>
						<textarea
							v-model="baseMessage"
							class="w-full mt-1 p-2 border rounded-md text-sm font-mono"
							rows="5"
							:placeholder="t('whatsappQueue.messagePlaceholder')"
						></textarea>
						<p class="text-xs text-gray-500 mt-1">{{ t('whatsappQueue.variablesNote') }}</p>
					</div>

					<!-- Progress -->
					<div class="flex items-center gap-3">
						<div class="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
							<div
								class="bg-green-500 h-2 transition-all"
								:style="{ width: withPhone.length ? `${(sentCount / withPhone.length) * 100}%` : '0%' }"
							></div>
						</div>
						<span class="text-sm text-gray-600 whitespace-nowrap">
							{{ t('whatsappQueue.progress', { sent: sentCount, total: withPhone.length }) }}
						</span>
					</div>

					<!-- Recipients without phone -->
					<div
						v-if="withoutPhone.length > 0"
						class="bg-orange-50 border border-orange-200 rounded-md p-3 text-xs text-orange-700"
					>
						{{ t('whatsappQueue.withoutPhone', { count: withoutPhone.length }) }}:
						<span v-for="(i, idx) in withoutPhone" :key="i.id">
							{{ i.name }}<span v-if="idx < withoutPhone.length - 1">, </span>
						</span>
					</div>

					<!-- Queue list -->
					<div class="border rounded-md divide-y">
						<div
							v-for="item in withPhone"
							:key="item.id"
							class="flex items-center justify-between gap-3 p-3"
							:class="{ 'bg-green-50': sentIds.has(item.id) }"
						>
							<div class="min-w-0">
								<div class="font-medium text-sm truncate">{{ item.name }}</div>
								<div class="text-xs text-gray-500">{{ item.participant.cellPhone }}</div>
							</div>
							<Button
								size="sm"
								:variant="sentIds.has(item.id) ? 'outline' : 'default'"
								:disabled="!baseMessage.trim()"
								@click="sendOne(item)"
							>
								<Check v-if="sentIds.has(item.id)" class="w-4 h-4 mr-1" />
								<ExternalLink v-else class="w-4 h-4 mr-1" />
								{{ sentIds.has(item.id) ? t('whatsappQueue.resend') : t('whatsappQueue.openWhatsApp') }}
							</Button>
						</div>
					</div>
				</div>

				<!-- Footer -->
				<div class="flex items-center justify-end gap-2 p-6 border-t bg-gray-50">
					<Button variant="outline" @click="close">{{ t('whatsappQueue.close') }}</Button>
				</div>
			</div>
	</div>
</template>
