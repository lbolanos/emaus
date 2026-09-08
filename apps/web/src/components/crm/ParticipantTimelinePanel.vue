<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useToast, Button, Textarea } from '@repo/ui';
import {
	X,
	MessageSquare,
	Mail,
	StickyNote,
	ArrowRightLeft,
	CheckSquare,
	UserPlus,
	CalendarCheck,
	DollarSign,
	MailOpen,
	Clock,
	Pencil,
	Trash2,
} from 'lucide-vue-next';
import { useCrmStore } from '@/stores/crmStore';
import { useAuthStore } from '@/stores/authStore';
import { formatDate } from '@repo/utils';
import { sanitizeEmailHtml } from '@/utils/sanitize';
import { convertHtmlToWhatsApp } from '@/utils/message';
import {
	buildParticipantContacts,
	contactKeyLabel,
	type ContactKey,
} from './participantContacts';
import type { TimelineEvent } from '@repo/types';

const props = defineProps<{
	open: boolean;
	retreatId: string;
	participant: any | null;
}>();

const emit = defineEmits<{
	(e: 'update:open', value: boolean): void;
	(e: 'message', payload: { participant: any; contactKey: ContactKey }): void;
}>();

const { t } = useI18n();
const { toast } = useToast();
const crmStore = useCrmStore();
const authStore = useAuthStore();
const { timeline, notes, timelineLoading } = storeToRefs(crmStore);

const draft = ref('');
const saving = ref(false);
const editingId = ref<string | null>(null);
const editingBody = ref('');
// Filtro por interlocutor: null = todos. Array de ids expandidos en vez de Set,
// que dentro de un ref no es reactivo en este repo.
const contactFilter = ref<ContactKey | null>(null);
const expanded = ref<string[]>([]);

const participantName = computed(() =>
	`${props.participant?.firstName ?? ''} ${props.participant?.lastName ?? ''}`.trim(),
);

const contacts = computed(() => buildParticipantContacts(props.participant));

/** Mensajes por interlocutor, para el conteo y la fecha del último. */
const messageStats = computed(() => {
	const stats: Record<string, { count: number; last: string | Date | null }> = {};
	for (const e of timeline.value) {
		if (e.type !== 'message') continue;
		const key = e.contactKey || 'participant';
		const row = stats[key] || { count: 0, last: null };
		row.count += 1;
		if (e.at && (!row.last || new Date(e.at) > new Date(row.last))) row.last = e.at;
		stats[key] = row;
	}
	return stats;
});

const filteredTimeline = computed<TimelineEvent[]>(() => {
	if (!contactFilter.value) return timeline.value;
	// Sólo los eventos dirigidos a alguien se filtran; las notas y los hitos
	// no tienen interlocutor y se ocultan al filtrar por uno.
	return timeline.value.filter((e) => (e.contactKey || 'participant') === contactFilter.value);
});

const currentStateEvents = computed(() =>
	filteredTimeline.value.filter((e) => !e.at),
);
const datedEvents = computed(() => filteredTimeline.value.filter((e) => e.at));

async function load() {
	if (!props.open || !props.participant?.id || !props.retreatId) return;
	contactFilter.value = null;
	expanded.value = [];
	await crmStore.fetchThread(props.retreatId, props.participant.id);
}

watch(() => [props.open, props.participant?.id], load, { immediate: true });

watch(
	() => props.open,
	(isOpen) => {
		if (!isOpen) {
			crmStore.clearThread();
			draft.value = '';
			editingId.value = null;
		}
	},
);

async function submitNote() {
	const body = draft.value.trim();
	if (!body || !props.participant?.id) return;
	saving.value = true;
	try {
		await crmStore.addNote({
			retreatId: props.retreatId,
			participantId: props.participant.id,
			body,
		});
		draft.value = '';
		toast({ title: t('participantThread.noteAdded') });
	} catch {
		toast({ title: t('participantThread.noteError'), variant: 'destructive' });
	} finally {
		saving.value = false;
	}
}

function startEdit(noteId: string, body: string) {
	editingId.value = noteId;
	editingBody.value = body;
	nextTick();
}

async function saveEdit() {
	if (!editingId.value || !props.participant?.id) return;
	const body = editingBody.value.trim();
	if (!body) return;
	try {
		await crmStore.editNote(editingId.value, body, {
			retreatId: props.retreatId,
			participantId: props.participant.id,
		});
		editingId.value = null;
	} catch {
		toast({ title: t('participantThread.noteError'), variant: 'destructive' });
	}
}

async function removeNote(noteId: string) {
	if (!props.participant?.id) return;
	if (!window.confirm(t('participantThread.confirmDelete'))) return;
	try {
		await crmStore.removeNote(noteId, {
			retreatId: props.retreatId,
			participantId: props.participant.id,
		});
	} catch {
		toast({ title: t('participantThread.noteError'), variant: 'destructive' });
	}
}

/** Sólo el autor puede editar/borrar; el backend lo vuelve a validar. */
function canEdit(event: TimelineEvent): boolean {
	if (event.type !== 'note') return false;
	const noteId = (event.meta as any)?.noteId;
	if (!noteId) return false;
	const row = notes.value.find((n) => n.id === noteId);
	return !!row && !!row.createdBy && row.createdBy === authStore.user?.id;
}

function noteIdOf(event: TimelineEvent): string | null {
	return ((event.meta as any)?.noteId as string) ?? null;
}

function bodyOf(event: TimelineEvent): string {
	const id = noteIdOf(event);
	return notes.value.find((n) => n.id === id)?.body ?? event.detail ?? '';
}

const ICONS: Record<string, any> = {
	note: StickyNote,
	stage_change: ArrowRightLeft,
	message: MessageSquare,
	message_scheduled: Clock,
	task: CheckSquare,
	registered: UserPlus,
	attendance: CalendarCheck,
	payment: DollarSign,
	palancas: MailOpen,
};

function iconFor(event: TimelineEvent) {
	if (event.type === 'message' && (event.meta as any)?.messageType === 'email') return Mail;
	return ICONS[event.type] ?? StickyNote;
}

function isEmail(event: TimelineEvent): boolean {
	return (event.meta as any)?.messageType === 'email';
}

/**
 * Texto plegado de un evento. Los correos se guardan como HTML, así que en la
 * vista de dos líneas hay que aplanarlo: si no, el coordinador lee
 * `<p>Hola…</p>` y parece que el mensaje salió roto.
 */
function collapsedText(event: TimelineEvent): string {
	if (!event.detail) return '';
	return isEmail(event) ? convertHtmlToWhatsApp(event.detail) : event.detail;
}

function toggleExpanded(id: string) {
	expanded.value = expanded.value.includes(id)
		? expanded.value.filter((x) => x !== id)
		: [...expanded.value, id];
}

function when(at: string | Date | null | undefined): string {
	return at ? formatDate(at as any, { format: 'datetime' }) : '';
}
</script>

<template>
	<div
		v-if="open"
		class="fixed inset-0 z-50 flex justify-end bg-black/40"
		@click.self="emit('update:open', false)"
	>
		<aside class="bg-white w-full max-w-xl h-full flex flex-col shadow-xl">
			<!-- Encabezado -->
			<header class="flex items-start justify-between gap-3 p-4 border-b">
				<div class="min-w-0">
					<h2 class="text-lg font-semibold truncate">
						{{ t('participantThread.title', { name: participantName }) }}
					</h2>
					<p class="text-xs text-gray-500">{{ t('participantThread.sentFromEmaus') }}</p>
				</div>
				<Button variant="ghost" size="icon" @click="emit('update:open', false)">
					<X class="w-4 h-4" />
				</Button>
			</header>

			<div class="flex-1 overflow-y-auto">
				<!-- Barra de contactos: con quién hablamos -->
				<section v-if="contacts.length" class="p-4 border-b bg-gray-50">
					<h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
						{{ t('participantThread.contactsTitle') }}
					</h3>
					<div class="space-y-2">
						<div
							v-for="c in contacts"
							:key="c.key"
							class="flex items-center gap-2 bg-white border rounded-md p-2"
							:class="contactFilter === c.key ? 'ring-2 ring-blue-400' : ''"
						>
							<button
								class="min-w-0 flex-1 text-left"
								:title="t('participantThread.filterAll')"
								@click="contactFilter = contactFilter === c.key ? null : c.key"
							>
								<div class="text-sm font-medium truncate">
									{{ c.name }}
									<span class="text-xs text-gray-500 font-normal">
										· {{ c.relation || c.role }}
									</span>
								</div>
								<div class="text-xs text-gray-500">
									<span v-if="messageStats[c.key]?.count">
										{{ t('participantThread.messagesSent', messageStats[c.key].count) }}
										<template v-if="messageStats[c.key]?.last">
											·
											{{
												t('participantThread.lastMessage', {
													date: when(messageStats[c.key].last),
												})
											}}
										</template>
									</span>
									<span v-else>{{ c.phone || c.email || t('participantThread.noPhone') }}</span>
								</div>
							</button>
							<a
								v-if="c.whatsappLink"
								:href="c.whatsappLink"
								target="_blank"
								rel="noopener noreferrer"
								class="shrink-0 inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50"
								:title="t('participantThread.openWhatsApp')"
							>
								<MessageSquare class="w-3.5 h-3.5" />
								<span class="hidden sm:inline">WhatsApp</span>
							</a>
							<Button
								variant="outline"
								size="sm"
								class="shrink-0 text-xs"
								@click="emit('message', { participant, contactKey: c.key })"
							>
								{{ t('participantThread.writeTemplate') }}
							</Button>
						</div>
					</div>
					<button
						v-if="contactFilter"
						class="mt-2 text-xs text-blue-600 underline"
						@click="contactFilter = null"
					>
						{{ t('participantThread.filterAll') }}
					</button>
				</section>

				<!-- Caja de nota, siempre a la vista -->
				<section class="p-4 border-b">
					<Textarea
						v-model="draft"
						:placeholder="t('participantThread.notePlaceholder')"
						rows="2"
						@keydown.ctrl.enter="submitNote"
						@keydown.meta.enter="submitNote"
					/>
					<div class="flex items-center justify-between mt-2">
						<span class="text-xs text-gray-400">{{ t('participantThread.noteHint') }}</span>
						<Button size="sm" :disabled="!draft.trim() || saving" @click="submitNote">
							<StickyNote class="w-4 h-4 mr-1" />
							{{ t('participantThread.addNote') }}
						</Button>
					</div>
				</section>

				<!-- Estado actual (sin fecha propia) -->
				<section v-if="currentStateEvents.length" class="px-4 pt-4">
					<h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
						{{ t('participantThread.currentState') }}
					</h3>
					<div class="flex flex-wrap gap-2">
						<span
							v-for="e in currentStateEvents"
							:key="e.id"
							class="inline-flex items-center gap-1 text-xs bg-gray-100 rounded px-2 py-1"
						>
							<component :is="iconFor(e)" class="w-3.5 h-3.5" />
							{{ e.title }}
						</span>
					</div>
				</section>

				<!-- Hilo cronológico -->
				<section class="p-4">
					<p v-if="timelineLoading" class="text-sm text-gray-500">
						{{ t('participantThread.loading') }}
					</p>
					<p v-else-if="!datedEvents.length" class="text-sm text-gray-500">
						{{ t('participantThread.empty') }}
					</p>
					<ol v-else class="space-y-4">
						<li v-for="e in datedEvents" :key="e.id" class="flex gap-3">
							<div class="shrink-0 mt-0.5 text-gray-400">
								<component :is="iconFor(e)" class="w-4 h-4" />
							</div>
							<div class="min-w-0 flex-1 border-l pl-3 pb-1">
								<div class="flex items-baseline justify-between gap-2">
									<span class="text-sm font-medium">{{ e.title }}</span>
									<span class="text-xs text-gray-400 shrink-0">{{ when(e.at) }}</span>
								</div>

								<div class="text-xs text-gray-500">
									<span v-if="e.contactName">
										{{ contactKeyLabel(e.contactKey) }}: {{ e.contactName }}
									</span>
									<span v-if="e.actorName"> · {{ e.actorName }}</span>
									<span v-if="(e.meta as any)?.templateName">
										· {{ (e.meta as any).templateName }}
									</span>
								</div>

								<!-- Nota en edición -->
								<div v-if="editingId && noteIdOf(e) === editingId" class="mt-2">
									<Textarea v-model="editingBody" rows="3" />
									<div class="flex gap-2 mt-1">
										<Button size="sm" @click="saveEdit">
											{{ t('participantThread.saveNote') }}
										</Button>
										<Button size="sm" variant="ghost" @click="editingId = null">
											{{ t('participantThread.cancel') }}
										</Button>
									</div>
								</div>

								<template v-else>
									<!-- Email: HTML saneado. WhatsApp y notas: texto plano. -->
									<div
										v-if="e.detail && isEmail(e) && expanded.includes(e.id)"
										class="mt-1 text-sm prose prose-sm max-w-none"
										v-html="sanitizeEmailHtml(e.detail)"
									/>
									<p
										v-else-if="e.detail"
										class="mt-1 text-sm text-gray-700 whitespace-pre-wrap"
										:class="expanded.includes(e.id) ? '' : 'line-clamp-2'"
									>
										{{ collapsedText(e) }}
									</p>

									<div class="flex items-center gap-3 mt-1">
										<button
											v-if="e.detail && e.detail.length > 120"
											class="text-xs text-blue-600 underline"
											@click="toggleExpanded(e.id)"
										>
											{{
												expanded.includes(e.id)
													? t('participantThread.hideFullMessage')
													: t('participantThread.showFullMessage')
											}}
										</button>
										<template v-if="canEdit(e)">
											<button
												class="text-xs text-gray-500 inline-flex items-center gap-1 hover:text-gray-800"
												@click="startEdit(noteIdOf(e)!, bodyOf(e))"
											>
												<Pencil class="w-3 h-3" /> {{ t('participantThread.edit') }}
											</button>
											<button
												class="text-xs text-red-500 inline-flex items-center gap-1 hover:text-red-700"
												@click="removeNote(noteIdOf(e)!)"
											>
												<Trash2 class="w-3 h-3" /> {{ t('participantThread.delete') }}
											</button>
										</template>
									</div>
								</template>
							</div>
						</li>
					</ol>
				</section>
			</div>
		</aside>
	</div>
</template>
