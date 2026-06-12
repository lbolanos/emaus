<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useToast, Button, Input } from '@repo/ui';
import { Plus, Trash2, X, Play, Pencil, Send, Clock } from 'lucide-vue-next';
import { useRetreatStore } from '@/stores/retreatStore';
import { useMessageSequenceStore } from '@/stores/messageSequenceStore';
import { useMessageTemplateStore } from '@/stores/messageTemplateStore';
import { convertHtmlToWhatsApp, replaceAllVariables } from '@/utils/message';
import type { ParticipantData, RetreatData } from '@/utils/message';
import { sanitizePhoneForWhatsapp } from '@/utils/phone';

const { t } = useI18n();
const { toast } = useToast();
const retreatStore = useRetreatStore();
const sequenceStore = useMessageSequenceStore();
const templateStore = useMessageTemplateStore();

const { sequences, queue } = storeToRefs(sequenceStore);
const { templates } = storeToRefs(templateStore);

const retreatId = computed(() => retreatStore.selectedRetreatId || '');

const TRIGGERS = ['participant_created', 'days_before_retreat', 'days_after_retreat', 'birthday'] as const;
const AUDIENCES = ['all', 'walker', 'server'] as const;
const CHANNELS = ['email', 'whatsapp'] as const;

interface StepDraft {
	offsetDays: number;
	sendHour: number;
	templateType: string;
	channel: 'email' | 'whatsapp';
}
interface SequenceDraft {
	id?: string;
	name: string;
	description: string;
	trigger: (typeof TRIGGERS)[number];
	audience: (typeof AUDIENCES)[number];
	isActive: boolean;
	steps: StepDraft[];
}

const isEditorOpen = ref(false);
const draft = ref<SequenceDraft>(emptyDraft());

function emptyDraft(): SequenceDraft {
	return {
		name: '',
		description: '',
		trigger: 'days_before_retreat',
		audience: 'all',
		isActive: true,
		steps: [],
	};
}

async function load() {
	if (!retreatId.value) return;
	await Promise.all([
		sequenceStore.fetchSequences(retreatId.value),
		sequenceStore.fetchQueue(retreatId.value),
		templateStore.fetchTemplates(retreatId.value),
	]);
}

onMounted(load);
watch(retreatId, load);

function openCreate() {
	draft.value = emptyDraft();
	isEditorOpen.value = true;
}

function openEdit(seq: any) {
	draft.value = {
		id: seq.id,
		name: seq.name,
		description: seq.description || '',
		trigger: seq.trigger,
		audience: seq.audience,
		isActive: seq.isActive,
		steps: (seq.steps || []).map((s: any) => ({
			offsetDays: s.offsetDays,
			sendHour: s.sendHour,
			templateType: s.templateType,
			channel: s.channel,
		})),
	};
	isEditorOpen.value = true;
}

function addStep() {
	draft.value.steps.push({
		offsetDays: 0,
		sendHour: 9,
		templateType: templates.value[0]?.type || '',
		channel: 'email',
	});
}
function removeStep(i: number) {
	draft.value.steps.splice(i, 1);
}

async function saveDraft() {
	if (!draft.value.name.trim() || !retreatId.value) return;
	const payload = {
		name: draft.value.name.trim(),
		description: draft.value.description || undefined,
		retreatId: retreatId.value,
		trigger: draft.value.trigger,
		audience: draft.value.audience,
		isActive: draft.value.isActive,
		steps: draft.value.steps.map((s, i) => ({ ...s, stepOrder: i })),
	};
	try {
		if (draft.value.id) {
			await sequenceStore.update(draft.value.id, payload);
		} else {
			await sequenceStore.create(payload);
		}
		toast({ title: t('sequences.saved') });
		isEditorOpen.value = false;
	} catch {
		toast({ title: t('sequences.saveError'), variant: 'destructive' });
	}
}

async function removeSequence(seq: any) {
	try {
		await sequenceStore.remove(seq.id);
		toast({ title: t('sequences.deleted') });
	} catch {
		toast({ title: t('sequences.deleteError'), variant: 'destructive' });
	}
}

async function runNow() {
	if (!retreatId.value) return;
	try {
		const res = await sequenceStore.run(retreatId.value);
		toast({
			title: t('sequences.runDone', { enrolled: res.enrolled, processed: res.processed }),
		});
	} catch {
		toast({ title: t('sequences.runError'), variant: 'destructive' });
	}
}

// Despacho asistido de un pendiente de WhatsApp (desde la cuenta del usuario).
async function dispatchWhatsapp(item: any) {
	const tpl = templates.value.find((x: any) => x.type === item.templateType);
	const participant = item.participant;
	if (!participant?.cellPhone) {
		toast({ title: t('sequences.noPhone'), variant: 'destructive' });
		return;
	}
	const retreatData = retreatStore.selectedRetreat as unknown as RetreatData;
	const html = tpl
		? replaceAllVariables(tpl.message, participant as unknown as ParticipantData, retreatData)
		: '';
	const text = convertHtmlToWhatsApp(html);
	try {
		await navigator.clipboard.writeText(text);
	} catch {
		/* no bloqueante */
	}
	const phone = sanitizePhoneForWhatsapp(participant.cellPhone);
	window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`, '_blank');
	try {
		await sequenceStore.dispatch(item.id);
	} catch {
		toast({ title: t('sequences.dispatchError'), variant: 'destructive' });
	}
}
</script>

<template>
	<div class="p-4 space-y-6">
		<div class="flex items-center justify-between flex-wrap gap-2">
			<div>
				<h1 class="text-2xl font-semibold">{{ t('sequences.title') }}</h1>
				<p class="text-gray-600 text-sm">{{ t('sequences.subtitle') }}</p>
			</div>
			<div class="flex gap-2">
				<Button variant="outline" @click="runNow">
					<Play class="w-4 h-4 mr-1" /> {{ t('sequences.runNow') }}
				</Button>
				<Button @click="openCreate">
					<Plus class="w-4 h-4 mr-1" /> {{ t('sequences.new') }}
				</Button>
			</div>
		</div>

		<!-- Lista de secuencias -->
		<div v-if="sequences.length" class="border rounded-md divide-y">
			<div v-for="seq in sequences" :key="seq.id" class="flex items-center justify-between gap-3 p-3">
				<div class="min-w-0">
					<div class="font-medium flex items-center gap-2">
						{{ seq.name }}
						<span v-if="!seq.isActive" class="text-xs bg-gray-200 text-gray-600 rounded px-1.5 py-0.5">
							{{ t('sequences.inactive') }}
						</span>
					</div>
					<div class="text-xs text-gray-500">
						{{ t('sequences.triggers.' + seq.trigger) }} · {{ t('sequences.audiences.' + seq.audience) }}
						· {{ t('sequences.stepCount', { count: seq.steps?.length || 0 }) }}
					</div>
				</div>
				<div class="flex items-center gap-1 shrink-0">
					<Button variant="ghost" size="icon" @click="openEdit(seq)"><Pencil class="w-4 h-4" /></Button>
					<Button variant="ghost" size="icon" class="text-red-500" @click="removeSequence(seq)">
						<Trash2 class="w-4 h-4" />
					</Button>
				</div>
			</div>
		</div>
		<div v-else class="text-sm text-gray-500 border rounded-md p-6 text-center">
			{{ t('sequences.empty') }}
		</div>

		<!-- Bandeja de pendientes de WhatsApp -->
		<div>
			<h2 class="text-lg font-semibold flex items-center gap-2 mb-2">
				<Clock class="w-5 h-5 text-amber-500" /> {{ t('sequences.queueTitle') }}
			</h2>
			<div v-if="queue.length" class="border rounded-md divide-y">
				<div v-for="item in queue" :key="item.id" class="flex items-center justify-between gap-3 p-3">
					<div class="min-w-0">
						<div class="font-medium text-sm truncate">
							{{ item.participant?.firstName }} {{ item.participant?.lastName }}
						</div>
						<div class="text-xs text-gray-500">{{ item.templateType }}</div>
					</div>
					<Button size="sm" @click="dispatchWhatsapp(item)">
						<Send class="w-4 h-4 mr-1" /> {{ t('sequences.dispatch') }}
					</Button>
				</div>
			</div>
			<div v-else class="text-sm text-gray-500 border rounded-md p-4 text-center">
				{{ t('sequences.queueEmpty') }}
			</div>
		</div>

		<!-- Editor de secuencia -->
		<div
			v-if="isEditorOpen"
			class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
			@click.self="isEditorOpen = false"
		>
			<div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
				<div class="flex items-center justify-between p-6 border-b">
					<h2 class="text-xl font-semibold">
						{{ draft.id ? t('sequences.editTitle') : t('sequences.newTitle') }}
					</h2>
					<Button variant="ghost" size="icon" @click="isEditorOpen = false"><X class="w-5 h-5" /></Button>
				</div>
				<div class="p-6 space-y-4 overflow-y-auto">
					<div>
						<label class="text-sm font-medium">{{ t('sequences.name') }}</label>
						<Input v-model="draft.name" class="mt-1" :placeholder="t('sequences.namePlaceholder')" />
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="text-sm font-medium">{{ t('sequences.trigger') }}</label>
							<select v-model="draft.trigger" class="w-full mt-1 p-2 border rounded-md text-sm">
								<option v-for="tr in TRIGGERS" :key="tr" :value="tr">{{ t('sequences.triggers.' + tr) }}</option>
							</select>
						</div>
						<div>
							<label class="text-sm font-medium">{{ t('sequences.audience') }}</label>
							<select v-model="draft.audience" class="w-full mt-1 p-2 border rounded-md text-sm">
								<option v-for="a in AUDIENCES" :key="a" :value="a">{{ t('sequences.audiences.' + a) }}</option>
							</select>
						</div>
					</div>
					<label class="flex items-center gap-2 text-sm">
						<input type="checkbox" v-model="draft.isActive" /> {{ t('sequences.active') }}
					</label>

					<!-- Pasos -->
					<div>
						<div class="flex items-center justify-between mb-1">
							<label class="text-sm font-medium">{{ t('sequences.steps') }}</label>
							<Button variant="outline" size="sm" @click="addStep">
								<Plus class="w-4 h-4 mr-1" /> {{ t('sequences.addStep') }}
							</Button>
						</div>
						<div v-if="draft.steps.length" class="space-y-2">
							<div v-for="(step, i) in draft.steps" :key="i" class="border rounded-md p-2 grid grid-cols-12 gap-2 items-end">
								<div class="col-span-2">
									<label class="text-xs text-gray-500">{{ t('sequences.offsetDays') }}</label>
									<input type="number" v-model.number="step.offsetDays" class="w-full p-1.5 border rounded text-sm" />
								</div>
								<div class="col-span-2">
									<label class="text-xs text-gray-500">{{ t('sequences.sendHour') }}</label>
									<input type="number" min="0" max="23" v-model.number="step.sendHour" class="w-full p-1.5 border rounded text-sm" />
								</div>
								<div class="col-span-4">
									<label class="text-xs text-gray-500">{{ t('sequences.template') }}</label>
									<select v-model="step.templateType" class="w-full p-1.5 border rounded text-sm">
										<option v-for="tpl in templates" :key="tpl.id" :value="tpl.type">{{ tpl.name }}</option>
									</select>
								</div>
								<div class="col-span-3">
									<label class="text-xs text-gray-500">{{ t('sequences.channel') }}</label>
									<select v-model="step.channel" class="w-full p-1.5 border rounded text-sm">
										<option v-for="c in CHANNELS" :key="c" :value="c">{{ t('sequences.channels.' + c) }}</option>
									</select>
								</div>
								<div class="col-span-1 flex justify-end">
									<Button variant="ghost" size="icon" class="text-red-500" @click="removeStep(i)">
										<Trash2 class="w-4 h-4" />
									</Button>
								</div>
							</div>
						</div>
						<p v-else class="text-xs text-gray-500">{{ t('sequences.noSteps') }}</p>
					</div>
				</div>
				<div class="flex items-center justify-end gap-2 p-6 border-t bg-gray-50">
					<Button variant="outline" @click="isEditorOpen = false">{{ t('common.actions.cancel') }}</Button>
					<Button :disabled="!draft.name.trim() || draft.steps.length === 0" @click="saveDraft">
						{{ t('common.actions.save') }}
					</Button>
				</div>
			</div>
		</div>
	</div>
</template>
