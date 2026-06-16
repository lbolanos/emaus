<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useToast, Button, Input } from '@repo/ui';
import { Plus, Trash2, X, Pencil, Power } from 'lucide-vue-next';
import { useGlobalMessageSequenceStore } from '@/stores/globalMessageSequenceStore';
import { useGlobalMessageTemplateStore } from '@/stores/globalMessageTemplateStore';
import { getMessageTemplateAudience } from '@repo/types';

const { t } = useI18n();
const { toast } = useToast();
const sequenceStore = useGlobalMessageSequenceStore();
const templateStore = useGlobalMessageTemplateStore();

const { sequences } = storeToRefs(sequenceStore);

// Plantillas globales utilizables (excluye system SYS_): los tipos válidos para
// los pasos. Al importar a un retiro se resuelven contra sus plantillas.
const usableTemplates = computed(() =>
	(templateStore.templates || []).filter((tpl) => !String(tpl.type || '').startsWith('SYS_')),
);

const TRIGGERS = ['participant_created', 'days_before_retreat', 'days_after_retreat', 'birthday'] as const;
const AUDIENCES = ['all', 'walker', 'server', 'table_leaders', 'responsables'] as const;
const CHANNELS = ['email', 'whatsapp'] as const;

const AUDIENCES_BY_TRIGGER: Record<string, readonly string[]> = {
	participant_created: ['walker', 'server'],
};
const availableAudiences = computed<string[]>(() => {
	const base = [...(AUDIENCES_BY_TRIGGER[draft.value.trigger] ?? AUDIENCES)];
	return base.includes(draft.value.audience) ? base : [draft.value.audience, ...base];
});
function onAudienceChange() {
	for (const step of draft.value.steps) {
		const aud = recipientAudience(step);
		if (!aud) continue;
		if (audienceMatches(getMessageTemplateAudience(step.templateType), aud)) continue;
		const both = aud === 'walker' || aud === 'server';
		const first =
			usableTemplates.value.find((t: any) => getMessageTemplateAudience(t.type) === aud) ||
			(both && usableTemplates.value.find((t: any) => getMessageTemplateAudience(t.type) === 'participant')) ||
			usableTemplates.value.find((t: any) => getMessageTemplateAudience(t.type) === 'general');
		if (first) step.templateType = first.type;
	}
}
function onTriggerChange() {
	const base = AUDIENCES_BY_TRIGGER[draft.value.trigger] ?? AUDIENCES;
	if (!base.includes(draft.value.audience)) draft.value.audience = base[0] as any;
	onAudienceChange();
}
const RECIPIENT_TARGETS = [
	'participant',
	'emergencyContact1',
	'emergencyContact2',
	'inviter',
	'tableLeader',
	'responsibility',
] as const;

const recipientOptions = computed<string[]>(() => {
	const aud = draft.value.audience;
	if (aud === 'walker' || aud === 'all') {
		return ['participant', 'inviter', 'emergencyContact1', 'emergencyContact2', 'tableLeader', 'responsibility'];
	}
	return ['participant', 'tableLeader', 'responsibility', 'inviter', 'emergencyContact1', 'emergencyContact2'];
});

function recipientAudience(step: { recipientTarget: string }): string | null {
	const t = step.recipientTarget;
	if (t === 'inviter' || t === 'emergencyContact1' || t === 'emergencyContact2') return 'family';
	if (t === 'tableLeader') return 'table_leader';
	if (t === 'responsibility') return 'responsible';
	const byAudience: Record<string, string | null> = {
		walker: 'walker',
		server: 'server',
		table_leaders: 'table_leader',
		responsables: 'responsible',
		all: null,
	};
	return byAudience[draft.value.audience] ?? null;
}

function audienceMatches(a: string, aud: string): boolean {
	return a === aud || a === 'general' || (a === 'participant' && (aud === 'walker' || aud === 'server'));
}

function templatesForStep(step: { recipientTarget: string; templateType: string }) {
	const aud = recipientAudience(step);
	if (!aud) return usableTemplates.value;
	return usableTemplates.value.filter(
		(tpl: any) => audienceMatches(getMessageTemplateAudience(tpl.type), aud) || tpl.type === step.templateType,
	);
}
const CONDITION_TYPES = ['walker', 'server', 'waiting', 'partial_server'] as const;
const CONDITION_PAYMENTS = ['paid', 'partial', 'unpaid', 'overpaid', 'scholarship'] as const;
const CONDITION_ATTENDANCE = ['pending', 'confirmed', 'declined'] as const;

type RecipientTarget = (typeof RECIPIENT_TARGETS)[number];

interface StepCondition {
	participantType?: string | null;
	paymentStatus?: string | null;
	attendanceFilter?: string;
}
interface StepDraft {
	offsetDays: number;
	sendHour: number;
	templateType: string;
	channel: 'email' | 'whatsapp';
	recipientTarget: RecipientTarget;
	recipientResponsibility: string;
	condition: StepCondition;
	condOpen?: boolean;
}

function hasCondition(c: StepCondition): boolean {
	return !!(c.participantType || c.paymentStatus || (c.attendanceFilter && c.attendanceFilter !== 'all'));
}
interface SequenceDraft {
	id?: string;
	name: string;
	description: string;
	trigger: (typeof TRIGGERS)[number];
	audience: (typeof AUDIENCES)[number];
	isActive: boolean;
	maxOverdueDays: number | null;
	steps: StepDraft[];
}

function conditionToFilters(c: StepCondition): Record<string, unknown> | undefined {
	const out: Record<string, unknown> = {};
	if (c.participantType) out.participantType = c.participantType;
	if (c.paymentStatus) out.paymentStatus = c.paymentStatus;
	if (c.attendanceFilter && c.attendanceFilter !== 'all') out.attendanceFilter = c.attendanceFilter;
	return Object.keys(out).length ? out : undefined;
}
function filtersToCondition(f: any): StepCondition {
	return {
		participantType: f?.participantType ?? null,
		paymentStatus: f?.paymentStatus ?? null,
		attendanceFilter: f?.attendanceFilter ?? 'all',
	};
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
		maxOverdueDays: null,
		steps: [],
	};
}

async function load() {
	await Promise.all([
		sequenceStore.fetchSequences(),
		templateStore.fetchAll().catch(() => {}),
	]);
}
onMounted(load);

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
		maxOverdueDays: seq.maxOverdueDays ?? null,
		steps: (seq.steps || []).map((s: any) => ({
			offsetDays: s.offsetDays,
			sendHour: s.sendHour,
			templateType: s.templateType,
			channel: s.channel,
			recipientTarget: s.recipientTarget || 'participant',
			recipientResponsibility: s.recipientResponsibility || '',
			condition: filtersToCondition(s.condition),
			condOpen: hasCondition(filtersToCondition(s.condition)),
		})),
	};
	isEditorOpen.value = true;
}

function addStep() {
	draft.value.steps.push({
		offsetDays: 0,
		sendHour: 9,
		templateType: usableTemplates.value[0]?.type || '',
		channel: 'whatsapp',
		recipientTarget: 'participant',
		recipientResponsibility: '',
		condition: { participantType: null, paymentStatus: null, attendanceFilter: 'all' },
		condOpen: false,
	});
}
function removeStep(i: number) {
	draft.value.steps.splice(i, 1);
}

async function saveDraft() {
	if (!draft.value.name.trim()) return;
	const payload = {
		name: draft.value.name.trim(),
		description: draft.value.description || undefined,
		trigger: draft.value.trigger,
		audience: draft.value.audience,
		isActive: draft.value.isActive,
		maxOverdueDays: draft.value.maxOverdueDays ?? null,
		steps: draft.value.steps.map((s, i) => ({
			stepOrder: i,
			offsetDays: s.offsetDays,
			sendHour: s.sendHour,
			templateType: s.templateType,
			channel: s.channel,
			recipientTarget: s.recipientTarget,
			recipientResponsibility:
				s.recipientTarget === 'responsibility' ? s.recipientResponsibility || null : null,
			condition: conditionToFilters(s.condition) ?? null,
		})),
	};
	try {
		if (draft.value.id) {
			await sequenceStore.update(draft.value.id, payload);
		} else {
			await sequenceStore.create(payload);
		}
		toast({ title: t('globalSequences.saved') });
		isEditorOpen.value = false;
	} catch {
		toast({ title: t('globalSequences.saveError'), variant: 'destructive' });
	}
}

async function toggleActive(seq: any) {
	try {
		await sequenceStore.toggleActive(seq.id);
	} catch {
		toast({ title: t('globalSequences.saveError'), variant: 'destructive' });
	}
}

const seqToDelete = ref<any>(null);
function askDelete(seq: any) {
	seqToDelete.value = seq;
}
async function confirmDelete() {
	const seq = seqToDelete.value;
	seqToDelete.value = null;
	if (!seq) return;
	try {
		await sequenceStore.remove(seq.id);
		toast({ title: t('globalSequences.deleted') });
	} catch {
		toast({ title: t('globalSequences.deleteError'), variant: 'destructive' });
	}
}
</script>

<template>
	<div class="p-4 space-y-6">
		<div class="flex items-center justify-between flex-wrap gap-2">
			<div>
				<h1 class="text-2xl font-semibold">{{ t('globalSequences.title') }}</h1>
				<p class="text-gray-600 text-sm">{{ t('globalSequences.subtitle') }}</p>
			</div>
			<Button @click="openCreate">
				<Plus class="w-4 h-4 mr-1" /> {{ t('globalSequences.new') }}
			</Button>
		</div>

		<!-- Lista de plantillas globales -->
		<div v-if="sequences.length" class="border rounded-md divide-y">
			<div v-for="seq in sequences" :key="seq.id" class="flex items-center justify-between gap-3 p-3">
				<div class="min-w-0">
					<div class="font-medium flex items-center gap-2">
						{{ seq.name }}
						<span v-if="!seq.isActive" class="text-xs bg-gray-200 text-gray-600 rounded px-1.5 py-0.5">
							{{ t('globalSequences.inactive') }}
						</span>
					</div>
					<div class="text-xs text-gray-500">
						{{ t('sequences.triggers.' + seq.trigger) }} · {{ t('sequences.audiences.' + seq.audience) }}
						· {{ t('sequences.stepCount', { count: seq.steps?.length || 0 }) }}
					</div>
				</div>
				<div class="flex items-center gap-1 shrink-0">
					<Button variant="ghost" size="icon" :title="t('globalSequences.toggleActive')" @click="toggleActive(seq)">
						<Power class="w-4 h-4" :class="seq.isActive ? 'text-green-600' : 'text-gray-400'" />
					</Button>
					<Button variant="ghost" size="icon" @click="openEdit(seq)"><Pencil class="w-4 h-4" /></Button>
					<Button variant="ghost" size="icon" class="text-red-500" @click="askDelete(seq)">
						<Trash2 class="w-4 h-4" />
					</Button>
				</div>
			</div>
		</div>
		<div v-else class="text-sm text-gray-500 border rounded-md p-6 text-center">
			{{ t('globalSequences.empty') }}
		</div>

		<!-- Editor -->
		<div
			v-if="isEditorOpen"
			class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
			@click.self="isEditorOpen = false"
		>
			<div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
				<div class="flex items-center justify-between p-6 border-b">
					<h2 class="text-xl font-semibold">
						{{ draft.id ? t('globalSequences.editTitle') : t('globalSequences.newTitle') }}
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
							<select v-model="draft.trigger" class="w-full mt-1 p-2 border rounded-md text-sm" @change="onTriggerChange">
								<option v-for="tr in TRIGGERS" :key="tr" :value="tr">{{ t('sequences.triggers.' + tr) }}</option>
							</select>
						</div>
						<div>
							<label class="text-sm font-medium">{{ t('sequences.audience') }}</label>
							<select v-model="draft.audience" class="w-full mt-1 p-2 border rounded-md text-sm" @change="onAudienceChange">
								<option v-for="a in availableAudiences" :key="a" :value="a">{{ t('sequences.audiences.' + a) }}</option>
							</select>
						</div>
					</div>
					<!-- Opciones de envío -->
					<div class="rounded-lg border bg-gray-50 p-3 space-y-3">
						<div class="text-xs font-semibold uppercase tracking-wide text-gray-500">
							{{ t('sequences.optionsTitle') }}
						</div>
						<label class="flex items-start gap-2 text-sm">
							<input type="checkbox" v-model="draft.isActive" class="mt-0.5" />
							<span>{{ t('globalSequences.active') }}</span>
						</label>
						<div class="flex items-center justify-between gap-3 text-sm">
							<span>
								{{ t('sequences.maxOverdueDays') }}
								<span class="block text-xs text-gray-500">{{ t('sequences.maxOverdueDaysHint') }}</span>
							</span>
							<input
								type="number"
								min="0"
								v-model.number="draft.maxOverdueDays"
								class="w-24 p-1.5 border rounded-md text-sm shrink-0"
								:placeholder="t('sequences.noLimit')"
							/>
						</div>
					</div>

					<!-- Pasos -->
					<div>
						<div class="flex items-center justify-between mb-1">
							<label class="text-sm font-medium">{{ t('sequences.steps') }}</label>
							<Button variant="outline" size="sm" @click="addStep">
								<Plus class="w-4 h-4 mr-1" /> {{ t('sequences.addStep') }}
							</Button>
						</div>
						<div v-if="draft.steps.length" class="space-y-3">
							<div v-for="(step, i) in draft.steps" :key="i" class="rounded-lg border bg-white p-3 space-y-3 shadow-sm">
								<div class="flex items-center justify-between">
									<span class="text-sm font-semibold text-gray-700">{{ t('sequences.stepN', { n: i + 1 }) }}</span>
									<Button variant="ghost" size="icon" class="text-red-500 -my-1" @click="removeStep(i)">
										<Trash2 class="w-4 h-4" />
									</Button>
								</div>
								<div>
									<label class="text-xs text-gray-500">{{ t('sequences.template') }}</label>
									<select v-model="step.templateType" class="w-full mt-1 p-2 border rounded-md text-sm">
										<option v-for="tpl in templatesForStep(step)" :key="tpl.id" :value="tpl.type">{{ tpl.name }}</option>
									</select>
								</div>
								<div class="grid grid-cols-2 md:grid-cols-6 gap-3">
									<div class="md:col-span-1">
										<label class="text-xs text-gray-500">{{ t('sequences.offsetDays') }}</label>
										<input type="number" v-model.number="step.offsetDays" class="w-full mt-1 p-2 border rounded-md text-sm" />
									</div>
									<div class="md:col-span-1">
										<label class="text-xs text-gray-500">{{ t('sequences.sendHour') }}</label>
										<input type="number" min="0" max="23" v-model.number="step.sendHour" class="w-full mt-1 p-2 border rounded-md text-sm" />
									</div>
									<div class="md:col-span-2">
										<label class="text-xs text-gray-500">{{ t('sequences.channel') }}</label>
										<select v-model="step.channel" class="w-full mt-1 p-2 border rounded-md text-sm">
											<option v-for="c in CHANNELS" :key="c" :value="c">{{ t('sequences.channels.' + c) }}</option>
										</select>
									</div>
									<div class="col-span-2 md:col-span-2">
										<label class="text-xs text-gray-500">{{ t('sequences.recipient') }}</label>
										<select v-model="step.recipientTarget" class="w-full mt-1 p-2 border rounded-md text-sm" @change="onAudienceChange">
											<option v-for="r in recipientOptions" :key="r" :value="r">{{ t('sequences.recipients.' + r) }}</option>
										</select>
									</div>
									<div v-if="step.recipientTarget === 'responsibility'" class="col-span-2 md:col-span-6">
										<label class="text-xs text-gray-500">{{ t('sequences.recipientResponsibility') }}</label>
										<input
											v-model="step.recipientResponsibility"
											class="w-full mt-1 p-2 border rounded-md text-sm"
											:placeholder="t('sequences.recipientResponsibilityPlaceholder')"
										/>
									</div>
								</div>
								<div class="border-t pt-2">
									<button
										type="button"
										class="text-xs text-blue-600 hover:underline"
										@click="step.condOpen = !step.condOpen"
									>
										{{ step.condOpen ? t('sequences.condHide') : (hasCondition(step.condition) ? t('sequences.condEdit') : t('sequences.condAdd')) }}
									</button>
									<div v-show="step.condOpen" class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
										<div>
											<label class="text-xs text-gray-500">{{ t('sequences.condType') }}</label>
											<select v-model="step.condition.participantType" class="w-full mt-1 p-2 border rounded-md text-sm">
												<option :value="null">{{ t('sequences.condAny') }}</option>
												<option v-for="ct in CONDITION_TYPES" :key="ct" :value="ct">{{ t('sequences.condTypes.' + ct) }}</option>
											</select>
										</div>
										<div>
											<label class="text-xs text-gray-500">{{ t('sequences.condPayment') }}</label>
											<select v-model="step.condition.paymentStatus" class="w-full mt-1 p-2 border rounded-md text-sm">
												<option :value="null">{{ t('sequences.condAny') }}</option>
												<option v-for="ps in CONDITION_PAYMENTS" :key="ps" :value="ps">{{ t('sequences.payments.' + ps) }}</option>
											</select>
										</div>
										<div>
											<label class="text-xs text-gray-500">{{ t('sequences.condAttendance') }}</label>
											<select v-model="step.condition.attendanceFilter" class="w-full mt-1 p-2 border rounded-md text-sm">
												<option value="all">{{ t('sequences.condAny') }}</option>
												<option v-for="at in CONDITION_ATTENDANCE" :key="at" :value="at">{{ t('sequences.attendanceStates.' + at) }}</option>
											</select>
										</div>
									</div>
								</div>
							</div>
						</div>
						<p v-else class="text-xs text-gray-500 border border-dashed rounded-md p-4 text-center">{{ t('sequences.noSteps') }}</p>
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

		<!-- Confirmación de eliminación -->
		<div
			v-if="seqToDelete"
			class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
			@click.self="seqToDelete = null"
		>
			<div class="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
				<h2 class="text-lg font-semibold">{{ t('globalSequences.deleteTitle') }}</h2>
				<p class="text-sm text-gray-600 mt-1">
					{{ t('globalSequences.deleteConfirm', { name: seqToDelete.name }) }}
				</p>
				<div class="flex justify-end gap-2 mt-4">
					<Button variant="outline" @click="seqToDelete = null">{{ t('common.actions.cancel') }}</Button>
					<Button variant="destructive" @click="confirmDelete">{{ t('common.actions.delete') }}</Button>
				</div>
			</div>
		</div>
	</div>
</template>
