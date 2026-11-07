<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useToast } from '@repo/ui';
import { Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input } from '@repo/ui';
import {
	Check,
	ChevronDown,
	Copy,
	EyeOff,
	ImageOff,
	Mail,
	Mailbox,
	Printer,
	Search,
	Share2,
	Stamp,
} from 'lucide-vue-next';
import { useLetterStore } from '@/stores/letterStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useTableMesaStore } from '@/stores/tableMesaStore';
import { lettersApi, type Letter, type LetterMailboxRow, type LetterStatus } from '@/services/api';
import { getSocket } from '@/services/realtime';
import { buildPrintableHtml } from '@repo/utils';
import {
	buildLettersBodyHtml,
	lettersPrintTitle,
	newPrintBatchId,
} from '@/utils/lettersPrint';
import LettersMailboxDialog from '@/components/letters/LettersMailboxDialog.vue';
import LettersShareDialog from '@/components/letters/LettersShareDialog.vue';

const route = useRoute();
const { t } = useI18n();
const { toast } = useToast();

const letterStore = useLetterStore();
const retreatStore = useRetreatStore();
const tableMesaStore = useTableMesaStore();

const retreatId = computed(() => (route.params.id as string) || retreatStore.selectedRetreatId || '');
const retreatName = computed(
	() => retreatStore.retreats.find((r) => r.id === retreatId.value)?.parish ?? '',
);

// -- Filtros --
const statusFilter = ref<LetterStatus | ''>('');
const searchQuery = ref('');
const tableFilter = ref('');
let searchTimer: ReturnType<typeof setTimeout> | null = null;

// -- UI --
const mailboxDialogOpen = ref(false);
const shareDialogOpen = ref(false);
const shareRows = ref<LetterMailboxRow[]>([]);
const expandedId = ref<string | null>(null);
const printing = ref(false);
const activating = ref(false);

const load = async () => {
	if (!retreatId.value) return;
	await letterStore.fetchLetters(retreatId.value, {
		status: statusFilter.value,
		q: searchQuery.value || undefined,
		tableId: tableFilter.value || undefined,
	});
};

onMounted(async () => {
	// Deep-link a un retiro distinto del seleccionado: alinear el store para que
	// las mesas del filtro y el print por mesa sean del MISMO retiro que la bandeja.
	if (route.params.id && route.params.id !== retreatStore.selectedRetreatId) {
		retreatStore.selectedRetreatId = route.params.id as string;
	}
	await load();
	tableMesaStore.fetchTables();
	if (retreatStore.retreats.length === 0) retreatStore.fetchRetreats();
	// Buzones precargados: 'Difundir' y 'Copiar dirección' leen de esta lista.
	letterStore.fetchMailboxes(retreatId.value).catch(() => {});
	// Badge en vivo: nueva carta en el buzón → refetch + aviso.
	getSocket().on('letters:received', onLetterReceived);
	// Atajos de revisión en volumen.
	window.addEventListener('keydown', onKeydown);
});

function onLetterReceived(payload: { retreatId: string; participantName: string }) {
	if (payload.retreatId !== retreatId.value) return;
	load();
	toast({ title: t('letters.receivedToast', { name: payload.participantName }) });
}

onBeforeUnmount(() => {
	getSocket().off('letters:received', onLetterReceived);
	window.removeEventListener('keydown', onKeydown);
});

const firstPhotoUrl = (letter: Letter): string | null =>
	letter.attachments?.find((a) => a.isBrowserSafeImage)?.storageUrl ?? null;

watch(retreatId, () => {
	expandedId.value = null;
	load();
});

const onSearchInput = () => {
	if (searchTimer) clearTimeout(searchTimer);
	searchTimer = setTimeout(load, 350);
};

const setStatusFilter = (status: LetterStatus | '') => {
	statusFilter.value = statusFilter.value === status ? '' : status;
	load();
};

// -- Revisión --
const review = async (letter: Letter, status: 'approved' | 'hidden') => {
	try {
		await letterStore.reviewLetter(letter.id, status);
		toast({ title: t(`letters.review.${status}Title`) });
	} catch {
		toast({ title: t('letters.reviewError'), variant: 'destructive' });
	}
};

// -- Estado de difusión: cuántos buzones del retiro están activos (resumen junto a «Difundir») --
const diffusionState = computed(() => {
	const boxes = letterStore.mailboxes;
	if (boxes.length === 0) return null;
	const active = boxes.filter((b) => b.mailboxEnabled).length;
	return { active, total: boxes.length };
});

// -- Atajos de teclado (revisión en volumen): j/k navega, Enter expande, a aprueba, o oculta --
const selectedId = ref<string | null>(null);

const onKeydown = (e: KeyboardEvent) => {
	const target = e.target as HTMLElement | null;
	if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
	if (mailboxDialogOpen.value || shareDialogOpen.value || printPreviewOpen.value) return;
	const letters = letterStore.letters;
	if (letters.length === 0) return;
	const idx = letters.findIndex((l) => l.id === selectedId.value);
	const key = e.key.toLowerCase();
	if (key === 'j' || key === 'arrowdown') {
		e.preventDefault();
		selectedId.value = letters[Math.min(idx + 1, letters.length - 1)].id;
	} else if (key === 'k' || key === 'arrowup') {
		e.preventDefault();
		selectedId.value = letters[Math.max(idx - 1, 0)].id;
	} else if (key === 'enter' && idx >= 0) {
		toggleExpanded(letters[idx].id);
	} else if (idx >= 0 && (key === 'a' || key === 'o')) {
		const letter = letters[idx];
		if (key === 'a' && letter.status === 'pending') review(letter, 'approved');
		if (key === 'o' && letter.status !== 'hidden') review(letter, 'hidden');
	}
};

// -- Buzones --
const openMailboxes = async () => {
	mailboxDialogOpen.value = true;
	await letterStore.fetchMailboxes(retreatId.value);
};

const activateMailboxes = async () => {
	activating.value = true;
	try {
		const result = await letterStore.activateMailboxes(retreatId.value);
		toast({
			title: t('letters.activateDone.doneTitle'),
			description: t('letters.activateDone.doneDescription', result),
		});
	} catch {
		toast({ title: t('letters.activateError'), variant: 'destructive' });
	} finally {
		activating.value = false;
	}
};

const toggleMailbox = async (row: LetterMailboxRow, enabled: boolean) => {
	try {
		await letterStore.toggleMailbox(retreatId.value, row.retreatParticipantId, enabled);
	} catch {
		toast({ title: t('letters.mailboxToggleError'), variant: 'destructive' });
	}
};

const openShare = async (rows: LetterMailboxRow[]) => {
	shareRows.value = rows;
	shareDialogOpen.value = true;
};

const copyAddress = async (letter: Letter) => {
	const row = letterStore.mailboxes.find((m) => m.retreatParticipantId === letter.retreatParticipantId);
	if (row?.mailboxAddress) await navigator.clipboard.writeText(row.mailboxAddress);
};

// -- Impresión (D13): preview en modal + iframe print (sin popup window) --
const printPreviewOpen = ref(false);
const printPreviewUrl = ref<string | null>(null);
const printPreviewMeta = ref<{ letterIds: string[]; title: string }>({ letterIds: [], title: '' });
const previewFrame = ref<HTMLIFrameElement | null>(null);

const printBatch = async (scope: 'retreat' | 'table', tableId?: string) => {
	if (printing.value) return;
	printing.value = true;
	try {
		const entries = await letterStore.fetchPrintBatch(retreatId.value, scope, { tableId });
		if (entries.length === 0) {
			toast({ title: t('letters.print.emptyTitle'), description: t('letters.print.emptyDescription') });
			return;
		}
		const bodyHtml = buildLettersBodyHtml(entries);
		const title = lettersPrintTitle(scope, entries);
		// Preview en modal (sin popup window ni autoPrint): el papel se renderiza
		// en un iframe y el botón Imprimir dispara el print del iframe — sin
		// popup blockers ni ventanas que mueren (lección del CDP colgado).
		const html = buildPrintableHtml(
			{ title, subtitle: retreatName.value, bodyHtml },
			{ relaxedLeading: true, autoPrint: false },
		);
		printPreviewUrl.value = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
		printPreviewMeta.value = {
			letterIds: entries.flatMap((entry) => entry.letters.map((l) => l.id)),
			title,
		};
		printPreviewOpen.value = true;
	} catch {
		toast({ title: t('letters.print.error'), variant: 'destructive' });
	} finally {
		printing.value = false;
	}
};

const closePreview = () => {
	URL.revokeObjectURL(printPreviewUrl.value ?? '');
	printPreviewUrl.value = null;
	printPreviewOpen.value = false;
};

const confirmPrint = () => {
	if (!previewFrame.value) return;
	previewFrame.value.contentWindow?.focus();
	previewFrame.value.contentWindow?.print();
	// Marca optimista (D7): la impresión es re-ejecutable; el badge informa.
	const batchId = newPrintBatchId();
	const letterIds = printPreviewMeta.value?.letterIds ?? [];
	if (letterIds.length) {
		letterStore
			.markPrinted(retreatId.value, letterIds, batchId)
			.then(() => load())
			.catch(() => {});
		toast({ title: t('letters.print.markedTitle', { count: letterIds.length }) });
	}
	closePreview();
};

const printTable = () => {
	if (!tableFilter.value) {
		toast({ title: t('letters.print.pickTable'), variant: 'destructive' });
		return;
	}
	printBatch('table', tableFilter.value);
};

// -- Helpers de render --
const letterSnippet = (letter: Letter): string =>
	letter.bodyText.length > 160 ? `${letter.bodyText.slice(0, 160)}…` : letter.bodyText;

const fmtDate = (value: string | Date): string =>
	new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(
		new Date(value),
	);

const statusVariant = (status: LetterStatus): 'default' | 'secondary' | 'outline' | 'destructive' => {
	if (status === 'approved' || status === 'attached') return 'default';
	if (status === 'hidden') return 'outline';
	return 'secondary';
};

const toggleExpanded = (id: string) => {
	// Click también fija la selección: los atajos (a/o) operan sobre la fila activa.
	selectedId.value = id;
	expandedId.value = expandedId.value === id ? null : id;
};
</script>

<template>
	<div class="space-y-4 p-4 sm:p-6">
		<!-- Encabezado: título + acciones -->
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex items-center gap-2">
				<Mail class="h-6 w-6 text-primary" />
				<div>
					<h1 class="text-xl font-semibold">{{ t('letters.title') }}</h1>
					<p class="text-sm text-muted-foreground">{{ t('letters.subtitle') }}</p>
					<!-- Estado de difusión: saber de un vistazo si las direcciones ya salieron -->
					<p v-if="diffusionState" class="text-xs text-muted-foreground">
						{{ t('letters.diffusionState', diffusionState) }}
					</p>
				</div>
			</div>
			<div class="flex flex-wrap gap-2">
				<Button variant="outline" :disabled="activating" @click="activateMailboxes">
					<Stamp class="mr-2 h-4 w-4" />
					{{ t('letters.activate') }}
				</Button>
				<Button variant="outline" @click="openMailboxes">
					<Mailbox class="mr-2 h-4 w-4" />
					{{ t('letters.mailboxes') }}
				</Button>
				<Button variant="outline" @click="openShare(letterStore.mailboxes)">
					<Share2 class="mr-2 h-4 w-4" />
					{{ t('letters.share.shortTitle') }}
				</Button>
			</div>
		</div>

		<!-- Resumen por estado (chips = filtro) -->
		<div class="flex flex-wrap gap-2">
			<Button
				variant="ghost"
				size="sm"
				class="border"
				:class="{ 'bg-muted': statusFilter === '' }"
				@click="setStatusFilter('')"
			>
				{{ t('letters.status.all') }} ({{ letterStore.counts.pending + letterStore.counts.approved + letterStore.counts.hidden }})
			</Button>
			<Button
				variant="ghost"
				size="sm"
				class="border"
				:class="{ 'bg-muted': statusFilter === 'pending' }"
				@click="setStatusFilter('pending')"
			>
				{{ t('letters.status.pending') }} ({{ letterStore.counts.pending }})
			</Button>
			<Button
				variant="ghost"
				size="sm"
				class="border"
				:class="{ 'bg-muted': statusFilter === 'approved' }"
				@click="setStatusFilter('approved')"
			>
				<Check class="mr-1 h-4 w-4 text-green-600" />
				{{ t('letters.status.approved') }} ({{ letterStore.counts.approved }})
			</Button>
			<Button
				variant="ghost"
				size="sm"
				class="border"
				:class="{ 'bg-muted': statusFilter === 'hidden' }"
				@click="setStatusFilter('hidden')"
			>
				{{ t('letters.status.hidden') }} ({{ letterStore.counts.hidden }})
			</Button>
		</div>

		<!-- Filtros (apilados en móvil) -->
		<div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
			<div class="relative flex-1 min-w-[220px]">
				<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
				<Input
					v-model="searchQuery"
					:placeholder="t('letters.searchPlaceholder')"
					class="pl-8"
					@input="onSearchInput"
				/>
			</div>
			<select
				v-model="tableFilter"
				class="h-9 rounded-md border border-input bg-background px-3 text-sm"
				@change="load"
			>
				<option value="">{{ t('letters.filter.allTables') }}</option>
				<option v-for="table in tableMesaStore.tables" :key="table.id" :value="table.id">
					{{ table.name }}
				</option>
			</select>
			<Button variant="outline" :disabled="printing" @click="printTable">
				<Printer class="mr-2 h-4 w-4" />
				{{ t('letters.print.table') }}
			</Button>
			<Button :disabled="printing" @click="printBatch('retreat')">
				<Printer class="mr-2 h-4 w-4" />
				{{ t('letters.print.retreat') }}
			</Button>
		</div>

		<!-- Bandeja -->
		<div v-if="letterStore.loading" class="py-10 text-center text-sm text-muted-foreground">
			{{ t('common.loading') }}
		</div>
		<div
			v-else-if="letterStore.letters.length === 0"
			class="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground"
		>
			{{ t('letters.empty') }}
		</div>
		<div v-else class="space-y-2">
			<div
				v-for="letter in letterStore.letters"
				:key="letter.id"
				class="group rounded-lg border"
				:class="selectedId === letter.id ? 'ring-2 ring-primary' : ''"
			>
				<!-- Fila de resumen: acciones rápidas sin expandir (revisión en volumen) -->
				<div
					class="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/40"
					@click="toggleExpanded(letter.id)"
				>
					<img
						v-if="firstPhotoUrl(letter)"
						:src="firstPhotoUrl(letter)!"
						:alt="t('letters.receiptAlt')"
						class="h-14 w-20 shrink-0 object-cover border rounded"
					/>
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-medium">{{ letter.participantName ?? '—' }}</span>
							<span v-if="letter.tableName" class="text-sm text-muted-foreground">· {{ letter.tableName }}</span>
							<Badge :variant="statusVariant(letter.status)">{{ t(`letters.status.${letter.status}`) }}</Badge>
							<Badge v-if="letter.printedAt" variant="outline">
								<Stamp class="mr-1 h-3 w-3" />
								{{ t('letters.printed') }}
							</Badge>
							<Badge v-if="letter.attachments?.some((a) => !a.isBrowserSafeImage)" variant="outline">
								<ImageOff class="mr-1 h-3 w-3" />
								{{ t('letters.hasNonPrintable') }}
							</Badge>
						</div>
						<div class="mt-1 text-sm text-muted-foreground">
							{{ letter.fromName || letter.fromEmail }}
							<span v-if="letter.fromName" class="text-xs">({{ letter.fromEmail }})</span>
							· {{ fmtDate(letter.receivedAt) }}
						</div>
						<p class="mt-1 truncate text-sm text-muted-foreground">{{ letterSnippet(letter) }}</p>
					</div>
					<div class="flex shrink-0 items-center gap-1" @click.stop>
						<!-- Acciones rápidas de revisión sin abrir el detalle -->
						<Button
							v-if="letter.status === 'pending'"
							variant="outline"
							size="sm"
							:title="t('letters.review.approve')"
							@click.stop="review(letter, 'approved')"
						>
							<Check class="h-4 w-4 text-green-600" />
						</Button>
						<Button
							v-if="letter.status !== 'hidden'"
							variant="outline"
							size="sm"
							:title="t('letters.review.hide')"
							@click.stop="review(letter, 'hidden')"
						>
							<EyeOff class="h-4 w-4" />
						</Button>
					</div>
					<ChevronDown
						class="h-4 w-4 shrink-0 text-muted-foreground transition-transform"
						:class="{ 'rotate-180': expandedId === letter.id }"
					/>
				</div>

				<!-- Detalle expandido: texto interpolado (Vue escapa; NUNCA v-html, D10) -->
				<div v-if="expandedId === letter.id" class="border-t p-4">
					<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
						<div class="flex gap-2">
							<Button
								v-if="letter.status !== 'approved'"
								size="sm"
								@click="review(letter, 'approved')"
							>
								<Check class="mr-1 h-4 w-4" />
								{{ t('letters.review.approve') }}
							</Button>
							<Button
								v-if="letter.status !== 'hidden'"
								size="sm"
								variant="outline"
								@click="review(letter, 'hidden')"
							>
								<EyeOff class="mr-1 h-4 w-4" />
								{{ t('letters.review.hide') }}
							</Button>
							<Button size="sm" variant="ghost" @click="copyAddress(letter)">
								<Copy class="mr-1 h-4 w-4" />
								{{ t('letters.copyAddress') }}
							</Button>
						</div>
						<span v-if="letter.reviewedAt" class="text-xs text-muted-foreground">
							{{ t('letters.reviewedAt', { date: fmtDate(letter.reviewedAt) }) }}
						</span>
					</div>

					<div v-if="letter.subject" class="mb-2 text-sm font-medium">«{{ letter.subject }}»</div>
					<div class="whitespace-pre-wrap text-sm leading-relaxed">{{ letter.bodyText }}</div>

					<div v-if="letter.warnings?.length" class="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
						<div v-for="warning in letter.warnings" :key="warning">{{ warning }}</div>
					</div>

					<div v-if="letter.attachments?.length" class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
						<figure
							v-for="attachment in letter.attachments"
							:key="attachment.id"
							class="overflow-hidden rounded-lg border"
						>
							<img
								v-if="attachment.isBrowserSafeImage"
								:src="attachment.storageUrl"
								:alt="attachment.fileName"
								class="max-h-64 w-full object-contain bg-white"
							/>
							<div v-else class="flex h-24 flex-col items-center justify-center gap-1 bg-muted p-2 text-xs text-muted-foreground">
								<ImageOff class="h-5 w-5" />
								<span class="truncate">{{ attachment.fileName }}</span>
							</div>
							<figcaption class="truncate border-t px-2 py-1 text-xs text-muted-foreground">
								{{ attachment.fileName }}
							</figcaption>
						</figure>
					</div>
				</div>
			</div>
			<!-- Hint de atajos (solo escritorio: en táctil no aplican) -->
			<p class="hidden sm:block text-xs text-muted-foreground">
				{{ t('letters.shortcutsHint') }}
			</p>
		</div>

		<!-- Dialogs montados siempre (regla de dialogs del repo) -->
		<LettersMailboxDialog
			v-model:open="mailboxDialogOpen"
			:retreat-id="retreatId"
			:mailboxes="letterStore.mailboxes"
			:loading="letterStore.mailboxesLoading"
			@toggle="toggleMailbox"
			@share="openShare"
		/>
		<LettersShareDialog
			v-model:open="shareDialogOpen"
			:retreat-name="retreatName"
			:retreat-id="retreatId"
			:rows="shareRows"
		/>

		<!-- Preview de impresión: el papel se renderiza en un iframe; el botón
		     Imprimir dispara el print del iframe y marca el lote (sin popup). -->
		<Dialog :open="printPreviewOpen" @update:open="printPreviewOpen = $event">
			<DialogContent class="max-w-4xl">
				<DialogHeader>
					<DialogTitle>{{ printPreviewMeta?.title || t('letters.print.previewTitle') }}</DialogTitle>
				</DialogHeader>
				<iframe
					v-if="printPreviewUrl"
					ref="previewFrame"
					:src="printPreviewUrl"
					class="h-[60vh] w-full rounded border bg-white"
					:title="t('letters.print.previewTitle')"
				/>
				<DialogFooter>
					<Button variant="outline" @click="closePreview">
						{{ t('letters.print.close') }}
					</Button>
					<Button :disabled="!printPreviewUrl" @click="confirmPrint">
						<Printer class="mr-2 h-4 w-4" />
						{{ t('letters.print.printNow') }}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	</div>
</template>
