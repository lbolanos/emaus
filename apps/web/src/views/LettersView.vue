<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useToast } from '@repo/ui';
import {
	Badge,
	Button,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	Input,
} from '@repo/ui';
import {
	Check,
	ChevronDown,
	Copy,
	EyeOff,
	ImageOff,
	Mail,
	Mailbox,
	MoreVertical,
	Printer,
	Search,
	Share2,
	Stamp,
} from 'lucide-vue-next';
import { useLetterStore } from '@/stores/letterStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useTableMesaStore } from '@/stores/tableMesaStore';
import { useRekaDialogFix } from '@/composables/useRekaDialogFix';
import {
	lettersApi,
	type Letter,
	type LetterFolderRow,
	type LetterMailboxRow,
	type LetterPrintBatchEntry,
	type LetterStatus,
} from '@/services/api';
import { getSocket } from '@/services/realtime';
import { buildPrintableHtml } from '@repo/utils';
import {
	buildLettersBodyHtml,
	lettersPrintTitle,
	newPrintBatchId,
} from '@/utils/lettersPrint';
import LettersMailboxDialog from '@/components/letters/LettersMailboxDialog.vue';
import LettersShareDialog from '@/components/letters/LettersShareDialog.vue';
import LettersFoldersPanel from '@/components/letters/LettersFoldersPanel.vue';
import { folderMatchesPalanquero, LETTER_PALANQUERO_NONE } from '@/utils/letterFolders';

const route = useRoute();
const { t } = useI18n();
const { toast } = useToast();

const letterStore = useLetterStore();
const retreatStore = useRetreatStore();
const tableMesaStore = useTableMesaStore();
// Reka-ui: dropdown que abre dialog (el preview de impresión) en el mismo tick.
const { deferOpen } = useRekaDialogFix();

const retreatId = computed(() => (route.params.id as string) || retreatStore.selectedRetreatId || '');
const retreatName = computed(
	() => retreatStore.retreats.find((r) => r.id === retreatId.value)?.parish ?? '',
);

// -- Filtros --
const statusFilter = ref<LetterStatus | ''>('');
const searchQuery = ref('');
const tableFilter = ref('');
// Filtro por participante (pedido del palanquero): ver solo SUS cartas e
// imprimir su folder. Va al servidor (la bandeja trae a lo más 500 cartas:
// filtrar en el navegador perdía las viejas de un retiro grande).
const participantFilter = ref('');
// Palanquero asignado (retreat_participants.palancasCoordinator): cada uno ve
// e imprime las cartas de SUS caminantes. Va al servidor, igual que el anterior.
const palanqueroFilter = ref('');
// Vista: bandeja carta por carta, o carpetas (estado del folder por persona).
const viewMode = ref<'inbox' | 'folders'>('inbox');
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
		participantId: participantFilter.value || undefined,
		palanquero: palanqueroFilter.value || undefined,
	});
};

/** Carpetas: estado del folder por persona (también alimenta el filtro). */
const loadFolders = () => {
	if (retreatId.value) letterStore.fetchFolders(retreatId.value).catch(() => {});
};

/**
 * Cambio de filtro: recarga y suelta la selección y el cursor del teclado —
 * sin esto, «Imprimir seleccionadas» y los atajos actuaban sobre cartas que
 * el filtro ya no muestra.
 */
const applyFilters = () => {
	selectedIds.value = new Set();
	selectedId.value = null;
	expandedId.value = null;
	return load();
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
	// Carpetas = lista del filtro de caminante: solo quien tiene buzón o cartas
	// (el listado general de participantes trae cancelados y lista de espera,
	// y es estado compartido que otras vistas dejan filtrado).
	loadFolders();
	letterStore.fetchPalanqueroOptions(retreatId.value);
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
	loadFolders();
	// Banner agrupado (mejora 7): el toast individual solo para la primera;
	// con más de una, el banner agrupa y el botón refresca/congela el ruido.
	newLettersCount.value += 1;
	if (newLettersCount.value === 1) {
		toast({ title: t('letters.receivedToast', { name: payload.participantName }) });
	}
}

// -- Banner de cartas nuevas (mejora 7) --
const newLettersCount = ref(0);
const dismissNewLetters = () => {
	newLettersCount.value = 0;
	load();
};

onBeforeUnmount(() => {
	getSocket().off('letters:received', onLetterReceived);
	window.removeEventListener('keydown', onKeydown);
});

const firstPhotoUrl = (letter: Letter): string | null =>
	letter.attachments?.find((a) => a.isBrowserSafeImage)?.storageUrl ?? null;

watch(retreatId, (id) => {
	newLettersCount.value = 0;
	participantFilter.value = '';
	participantSearch.value = '';
	palanqueroFilter.value = '';
	applyFilters();
	loadFolders();
	if (id) letterStore.fetchPalanqueroOptions(id);
});

// -- Filtro por participante (palanquero): solo SUS cartas en la bandeja --
const folderLabel = (f: LetterFolderRow): string =>
	f.tableName ? `${f.participantName} · ${f.tableName}` : f.participantName;

const normalized = (value: string): string =>
	value
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '');

// Autocomplete inline (patrón de la regla frontend.md para comboboxes con
// búsqueda): input + panel de coincidencias; sin Popover/Command de reka.
const participantSearch = ref('');
const participantPanelOpen = ref(false);

const participantMatches = computed(() => {
	const q = normalized(participantSearch.value).trim();
	// Primero quien tiene cartas; dentro, por nombre (ya vienen por mesa). Con
	// palanquero elegido, solo sus caminantes.
	const list = [...letterStore.folders]
		.filter((f) => f.participantId && folderMatchesPalanquero(f, palanqueroFilter.value))
		.sort((a, b) => {
			const byLetters =
				Number(b.counts.pending + b.counts.approved > 0) -
				Number(a.counts.pending + a.counts.approved > 0);
			return byLetters || a.participantName.localeCompare(b.participantName, 'es');
		});
	if (!q) return list.slice(0, 8);
	return list.filter((f) => normalized(folderLabel(f)).includes(q)).slice(0, 8);
});

const chooseParticipant = (f: LetterFolderRow) => {
	participantFilter.value = f.participantId ?? '';
	participantSearch.value = f.participantName;
	participantPanelOpen.value = false;
	applyFilters();
};

const clearParticipant = () => {
	participantFilter.value = '';
	participantSearch.value = '';
	participantPanelOpen.value = false;
	applyFilters();
};

// Borrar el texto limpia también el filtro.
watch(participantSearch, (v) => {
	if (v.trim() === '' && participantFilter.value) clearParticipant();
});

/** Folder del participante filtrado (para avisar lo que no va al papel). */
const filteredFolder = computed(() =>
	letterStore.folders.find((f) => f.participantId === participantFilter.value) ?? null,
);

/** Carpetas del palanquero filtrado que tienen algo aprobado para imprimir. */
const palanqueroPrintIds = computed(() =>
	letterStore.folders
		.filter(
			(f) =>
				f.participantId &&
				f.counts.approved > 0 &&
				folderMatchesPalanquero(f, palanqueroFilter.value),
		)
		.map((f) => f.participantId as string),
);

const palanqueroLabel = computed(() =>
	palanqueroFilter.value === LETTER_PALANQUERO_NONE
		? t('letters.filter.noPalanquero')
		: (letterStore.palanqueroOptions.find((o) => o.value === palanqueroFilter.value)?.label ??
			palanqueroFilter.value),
);

/** Imprime los folders de todos los caminantes del palanquero filtrado. */
const printPalanquero = () => {
	void printParticipants(palanqueroPrintIds.value, palanqueroLabel.value);
};

/** Elegir palanquero suelta un caminante que no sea suyo. */
const onPalanqueroChange = () => {
	const chosen = letterStore.folders.find((f) => f.participantId === participantFilter.value);
	if (chosen && !folderMatchesPalanquero(chosen, palanqueroFilter.value)) {
		participantFilter.value = '';
		participantSearch.value = '';
	}
	applyFilters();
};

/** Desde Carpetas: «Ver cartas» de una persona → bandeja filtrada por ella. */
const viewParticipantLetters = (participantId: string) => {
	const folder = letterStore.folders.find((f) => f.participantId === participantId);
	participantFilter.value = participantId;
	participantSearch.value = folder?.participantName ?? '';
	statusFilter.value = '';
	viewMode.value = 'inbox';
	applyFilters();
};

/** Imprime el folder del participante filtrado (sus aprobadas). */
const printFiltered = () => {
	if (participantFilter.value) {
		void printParticipants(
			[participantFilter.value],
			filteredFolder.value?.participantName ?? t('letters.print.selectionTitle', { count: 1 }),
		);
	}
};

const onSearchInput = () => {
	if (searchTimer) clearTimeout(searchTimer);
	searchTimer = setTimeout(applyFilters, 350);
};

const setStatusFilter = (status: LetterStatus | '') => {
	statusFilter.value = statusFilter.value === status ? '' : status;
	applyFilters();
};

// -- Revisión --
const review = async (letter: Letter, status: 'approved' | 'hidden') => {
	try {
		await letterStore.reviewLetter(letter.id, status);
		toast({ title: t(`letters.review.${status}Title`) });
		loadFolders();
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
type PrintScope =
	| { kind: 'retreat' }
	| { kind: 'table'; tableId: string }
	| { kind: 'participant'; participantIds: string[] };

const printPreviewOpen = ref(false);
const printPreviewUrl = ref<string | null>(null);
const printPreviewMeta = ref<{ letterIds: string[]; title: string }>({ letterIds: [], title: '' });
const previewFrame = ref<HTMLIFrameElement | null>(null);
// Lo que está en el preview: se re-arma al cambiar la carátula.
const printEntries = ref<LetterPrintBatchEntry[]>([]);
const printScope = ref<PrintScope>({ kind: 'retreat' });
const printOnlyUnprinted = ref(false);
const withCover = ref(false);
// Tras cerrar el diálogo del navegador: ¿salió bien? Solo entonces se marca.
const awaitingPrintConfirm = ref(false);

const renderPreview = () => {
	URL.revokeObjectURL(printPreviewUrl.value ?? '');
	// Sin encabezados: el papel es SOLO el contenido de las cartas. El cromo
	// del navegador (fecha, título, URL, n/N) lo quita el @page en 0 de
	// buildLettersBodyHtml; el <title> ya no se imprime y queda como nombre
	// por defecto del archivo al «Guardar como PDF».
	const bodyHtml = buildLettersBodyHtml(printEntries.value, { cover: withCover.value });
	const html = buildPrintableHtml(
		{ title: printPreviewMeta.value.title, subtitle: '', bodyHtml },
		{ relaxedLeading: true, autoPrint: false, omitRunningHead: true, omitBodyHead: true },
	);
	printPreviewUrl.value = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
};

watch(withCover, () => {
	if (printPreviewOpen.value && printEntries.value.length) renderPreview();
});

/**
 * Carpetas que abarca el alcance — para decir lo que NO va al papel: solo se
 * imprimen las aprobadas, y quien filtra a una persona ve también las que
 * siguen por revisar (la bandeja las muestra; el papel no).
 */
const foldersInScope = (scope: PrintScope): LetterFolderRow[] => {
	if (scope.kind === 'participant') {
		const ids = new Set(scope.participantIds);
		return letterStore.folders.filter((f) => f.participantId && ids.has(f.participantId));
	}
	if (scope.kind === 'table') {
		return letterStore.folders.filter((f) => f.tableId === scope.tableId);
	}
	return letterStore.folders;
};

const printNotice = computed(() => {
	const folders = foldersInScope(printScope.value);
	const pending = folders.reduce((sum, f) => sum + f.counts.pending, 0);
	const alreadyPrinted = printOnlyUnprinted.value
		? folders.reduce((sum, f) => sum + f.printed, 0)
		: 0;
	return { pending, alreadyPrinted };
});

/** Toast de fallo de impresión con la causa real (429 limiter, 401 sesión, 500). */
const printErrorToast = (err: unknown) => {
	const status = (err as { response?: { status?: number } })?.response?.status;
	const description =
		status === 429
			? t('letters.print.rateLimited')
			: status
				? t('letters.print.errorStatus', { status })
				: undefined;
	toast({ title: t('letters.print.error'), description, variant: 'destructive' });
};

/** Pide el lote al API y abre el preview (común a todos los alcances). */
const runPrint = async (
	scope: PrintScope,
	title: (entries: LetterPrintBatchEntry[]) => string,
	onlyUnprinted = false,
) => {
	if (printing.value) return;
	if (scope.kind === 'participant' && scope.participantIds.length === 0) return;
	printing.value = true;
	try {
		const entries = await letterStore.fetchPrintBatch(
			retreatId.value,
			scope.kind,
			{
				tableId: scope.kind === 'table' ? scope.tableId : undefined,
				participantIds: scope.kind === 'participant' ? scope.participantIds : undefined,
				onlyUnprinted,
			},
		);
		if (entries.length === 0) {
			toast({
				title: t('letters.print.emptyTitle'),
				description: onlyUnprinted
					? t('letters.print.emptyUnprintedDescription')
					: t('letters.print.emptyDescription'),
			});
			return;
		}
		printEntries.value = entries;
		printScope.value = scope;
		printOnlyUnprinted.value = onlyUnprinted;
		awaitingPrintConfirm.value = false;
		printPreviewMeta.value = {
			letterIds: entries.flatMap((entry) => entry.letters.map((l) => l.id)),
			title: title(entries),
		};
		renderPreview();
		printPreviewOpen.value = true;
	} catch (err) {
		printErrorToast(err);
	} finally {
		printing.value = false;
	}
};

const printBatch = (kind: 'retreat' | 'table', tableId?: string) =>
	runPrint(
		kind === 'table' && tableId ? { kind: 'table', tableId } : { kind: 'retreat' },
		(entries) => lettersPrintTitle(kind, entries),
	);

/**
 * Impresión POR PARTICIPANTE (pedido del palanquero): las cartas aprobadas de
 * esas personas, agrupadas como folder en el papel.
 */
const printParticipants = (participantIds: string[], title: string, onlyUnprinted = false) =>
	runPrint({ kind: 'participant', participantIds }, () => title, onlyUnprinted);

// -- Selección granular (mejora 15): imprimir solo los participantes elegidos --
const selectedIds = ref<Set<string>>(new Set());

const toggleSelect = (letter: Letter) => {
	const next = new Set(selectedIds.value);
	if (next.has(letter.id)) {
		next.delete(letter.id);
	} else {
		next.add(letter.id);
	}
	selectedIds.value = next;
};

// Conteo sobre cartas PRESENTES: un refetch puede haberse llevado alguna.
const selectedCount = computed(
	() => letterStore.letters.filter((l) => selectedIds.value.has(l.id)).length,
);
// El batch agrupa por participante: el scope participant recibe sus ids.
const selectedParticipantIds = computed(() => {
	const ids = new Set<string>();
	for (const letter of letterStore.letters) {
		if (selectedIds.value.has(letter.id) && letter.participantId) {
			ids.add(letter.participantId);
		}
	}
	return Array.from(ids);
});

const printSelection = () =>
	printParticipants(
		selectedParticipantIds.value,
		t('letters.print.selectionTitle', { count: selectedParticipantIds.value.length }),
	);

/** Imprime todas las aprobadas de UN participante (desde el ⋮ de su carta). */
const printOneParticipant = (letter: Letter) => {
	if (!letter.participantId) return;
	deferOpen(() => {
		void printParticipants([letter.participantId!], letter.participantName ?? '');
	});
};

/** Desde Carpetas: imprimir el folder de una o varias personas. */
const printFromFolders = (payload: {
	participantIds: string[];
	onlyUnprinted: boolean;
	title: string;
}) => {
	void printParticipants(payload.participantIds, payload.title, payload.onlyUnprinted);
};

/** Desde Carpetas: reenviar/mandar la dirección a la familia de una persona. */
const shareOne = (retreatParticipantId: string) => {
	const row = letterStore.mailboxes.find((m) => m.retreatParticipantId === retreatParticipantId);
	if (row) openShare([row]);
};

/** Cerrar el preview con la X o Escape equivale a «Cerrar» (no marca nada). */
const onPreviewOpenChange = (open: boolean) => {
	if (!open) closePreview();
};

const closePreview = () => {
	URL.revokeObjectURL(printPreviewUrl.value ?? '');
	printPreviewUrl.value = null;
	printPreviewOpen.value = false;
	awaitingPrintConfirm.value = false;
};

const confirmPrint = () => {
	if (!previewFrame.value) return;
	previewFrame.value.contentWindow?.focus();
	// print() bloquea hasta que se cierra el diálogo del navegador, y no dice
	// si se imprimió o se canceló: por eso se pregunta antes de marcar.
	previewFrame.value.contentWindow?.print();
	awaitingPrintConfirm.value = true;
};

/** El usuario confirma que el papel salió: recién entonces se marcan impresas. */
const markBatchPrinted = () => {
	const letterIds = printPreviewMeta.value?.letterIds ?? [];
	if (letterIds.length) {
		letterStore
			.markPrinted(retreatId.value, letterIds, newPrintBatchId())
			.then(() => {
				load();
				loadFolders();
			})
			.catch(() => {
				toast({ title: t('letters.print.markError'), variant: 'destructive' });
			});
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
			<div class="flex flex-wrap items-center gap-2">
				<!-- Acciones del header en un solo ⋮ (antes: 3 botones) -->
				<DropdownMenu>
					<DropdownMenuTrigger as-child>
						<Button variant="outline" size="icon" :aria-label="t('letters.headerActions')">
							<MoreVertical class="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem @select="deferOpen(() => openMailboxes())">
							<Mailbox class="mr-2 h-4 w-4" />
							{{ t('letters.mailboxes') }}
						</DropdownMenuItem>
						<DropdownMenuItem @select="deferOpen(() => openShare(letterStore.mailboxes))">
							<Share2 class="mr-2 h-4 w-4" />
							{{ t('letters.share.shortTitle') }}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem :disabled="activating" @click="activateMailboxes()">
							<Stamp class="mr-2 h-4 w-4" />
							{{ t('letters.activate') }}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>

		<!-- Bandeja (carta por carta) o Carpetas (folder por persona), y el
		     palanquero: un solo filtro que vale para las dos vistas -->
		<div class="flex flex-wrap items-center gap-2">
			<div class="inline-flex rounded-lg border p-0.5" role="tablist">
				<button
					type="button"
					role="tab"
					class="rounded-md px-3 py-1.5 text-sm"
					:class="viewMode === 'inbox' ? 'bg-muted font-medium' : 'text-muted-foreground'"
					:aria-selected="viewMode === 'inbox'"
					data-testid="view-inbox"
					@click="viewMode = 'inbox'"
				>
					{{ t('letters.views.inbox') }}
				</button>
				<button
					type="button"
					role="tab"
					class="rounded-md px-3 py-1.5 text-sm"
					:class="viewMode === 'folders' ? 'bg-muted font-medium' : 'text-muted-foreground'"
					:aria-selected="viewMode === 'folders'"
					data-testid="view-folders"
					@click="viewMode = 'folders'; loadFolders()"
				>
					{{ t('letters.views.folders') }}
				</button>
			</div>
			<select
				v-if="letterStore.palanqueroOptions.length"
				v-model="palanqueroFilter"
				class="h-9 max-w-[260px] rounded-md border border-input bg-background px-3 text-sm"
				:aria-label="t('letters.filter.palanquero')"
				data-testid="palanquero-filter"
				@change="onPalanqueroChange"
			>
				<option value="">{{ t('letters.filter.allPalanqueros') }}</option>
				<option v-for="o in letterStore.palanqueroOptions" :key="o.value" :value="o.value">
					{{ o.label }}
				</option>
				<option :value="LETTER_PALANQUERO_NONE">{{ t('letters.filter.noPalanquero') }}</option>
			</select>
		</div>

		<LettersFoldersPanel
			v-if="viewMode === 'folders'"
			:folders="letterStore.folders"
			:loading="letterStore.foldersLoading"
			:palanquero-options="letterStore.palanqueroOptions"
			:palanquero="palanqueroFilter"
			@print="printFromFolders"
			@view-letters="viewParticipantLetters"
			@share="shareOne"
		/>

		<template v-else>
		<!-- Resumen por estado (chips = filtro) -->
		<div class="flex flex-wrap gap-2">
			<Button
				variant="ghost"
				size="sm"
				class="border"
				:class="{ 'bg-muted': statusFilter === '' }"
				@click="setStatusFilter('')"
			>
				{{ t('letters.status.all') }} ({{ letterStore.counts.pending + letterStore.counts.approved + letterStore.counts.hidden + letterStore.counts.attached }})
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
				@change="applyFilters"
			>
				<option value="">{{ t('letters.filter.allTables') }}</option>
				<option v-for="table in tableMesaStore.tables" :key="table.id" :value="table.id">
					{{ table.name }}
				</option>
			</select>
			<!-- Filtro de caminante con búsqueda (autocomplete inline) -->
			<div class="relative">
				<Search
					class="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground"
				/>
				<input
					v-model="participantSearch"
					type="text"
					:placeholder="t('letters.filter.searchParticipant')"
					class="h-9 w-52 rounded-md border border-input bg-background pl-8 pr-8 text-sm"
					data-testid="participant-filter"
					@focus="participantPanelOpen = true"
					@blur="participantPanelOpen = false"
				/>
				<button
					v-if="participantFilter"
					type="button"
					class="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"
					:aria-label="t('letters.filter.clearParticipant')"
					@click="clearParticipant"
				>
					<EyeOff class="h-3.5 w-3.5" />
				</button>
				<div
					v-if="participantPanelOpen && participantMatches.length"
					class="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-background shadow-md"
				>
					<button
						v-for="f in participantMatches"
						:key="f.retreatParticipantId"
						type="button"
						class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
						@mousedown.prevent="chooseParticipant(f)"
					>
						<span class="truncate">{{ folderLabel(f) }}</span>
						<span class="shrink-0 text-xs text-muted-foreground">
							{{ t('letters.filter.letterCount', { count: f.counts.pending + f.counts.approved }) }}
						</span>
					</button>
				</div>
				<p
					v-else-if="participantPanelOpen && participantSearch.trim() && !participantMatches.length"
					class="absolute z-20 mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground shadow-md"
				>
					{{ t('letters.filter.noMatches') }}
				</p>
			</div>
			<!-- Los tres alcances de impresión, en un solo menú (menos botones) -->
			<DropdownMenu>
				<DropdownMenuTrigger as-child>
					<Button variant="outline" :disabled="printing">
						<Printer class="mr-2 h-4 w-4" />
						{{ t('letters.print.menu') }}
						<ChevronDown class="ml-1 h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem @select="deferOpen(() => printBatch('retreat'))">
						{{ t('letters.print.retreat') }}
					</DropdownMenuItem>
					<DropdownMenuItem :disabled="!tableFilter" @select="deferOpen(() => printTable())">
						{{ t('letters.print.table') }}
					</DropdownMenuItem>
					<DropdownMenuItem
						v-if="palanqueroFilter && palanqueroPrintIds.length"
						@select="deferOpen(() => printPalanquero())"
					>
						{{ t('letters.print.palanquero', { count: palanqueroPrintIds.length }) }}
					</DropdownMenuItem>
					<DropdownMenuItem
						v-if="participantFilter"
						@select="deferOpen(() => printFiltered())"
					>
						{{ t('letters.print.filtered') }}
					</DropdownMenuItem>
					<DropdownMenuItem
						v-if="selectedCount > 0"
						@select="deferOpen(() => printSelection())"
					>
						{{ t('letters.print.selection', { count: selectedCount }) }}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>

		<!-- Banner agrupado de cartas nuevas (mejora 7): con más de una llega
		     agrupado y el botón refresca la bandeja -->
		<div
			v-if="newLettersCount > 0"
			class="flex items-center gap-3 rounded-lg border border-purple-300 bg-purple-50 px-3 py-2 text-sm text-purple-800"
			data-testid="new-letters-banner"
		>
			<Mail class="h-4 w-4 shrink-0" />
			<span>{{ t('letters.newLetters', { count: newLettersCount }) }}</span>
			<Button variant="outline" size="sm" class="ml-auto" @click="dismissNewLetters">
				{{ t('letters.newLettersRefresh') }}
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
					<!-- Selección granular (mejora 15): imprimir solo lo elegido -->
					<input
						type="checkbox"
						class="mt-1 h-4 w-4 shrink-0 accent-primary"
						:checked="selectedIds.has(letter.id)"
						:aria-label="t('letters.selectLetter', { name: letter.participantName ?? '' })"
						@click.stop
						@change="toggleSelect(letter)"
					/>
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
						<!-- Acciones de fila en un solo menú ⋮ (antes: 2-3 botones por fila) -->
						<DropdownMenu>
							<DropdownMenuTrigger as-child>
								<Button
									variant="ghost"
									size="icon"
									class="h-8 w-8"
									:aria-label="t('letters.rowActions')"
								>
									<MoreVertical class="h-4 w-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									v-if="letter.status === 'pending'"
									@click="review(letter, 'approved')"
								>
									<Check class="mr-2 h-4 w-4 text-green-600" />
									{{ t('letters.review.approve') }}
								</DropdownMenuItem>
								<DropdownMenuItem v-if="letter.status !== 'hidden'" @click="review(letter, 'hidden')">
									<EyeOff class="mr-2 h-4 w-4" />
									{{ t('letters.review.hide') }}
								</DropdownMenuItem>
								<DropdownMenuItem @click="copyAddress(letter)">
									<Copy class="mr-2 h-4 w-4" />
									{{ t('letters.copyAddress') }}
								</DropdownMenuItem>
								<DropdownMenuSeparator v-if="letter.participantId" />
								<DropdownMenuItem v-if="letter.participantId" @select="printOneParticipant(letter)">
									<Printer class="mr-2 h-4 w-4" />
									{{ t('letters.print.participant') }}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
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
		</template>

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

		<!-- Preview de impresión: el papel se renderiza en un iframe; «Imprimir
		     ahora» abre el diálogo del navegador y después se pregunta si salió
		     bien — solo entonces se marcan impresas (cancelar ya no marca). -->
		<Dialog :open="printPreviewOpen" @update:open="onPreviewOpenChange">
			<DialogContent class="max-w-4xl">
				<DialogHeader>
					<DialogTitle>{{ printPreviewMeta?.title || t('letters.print.previewTitle') }}</DialogTitle>
				</DialogHeader>
				<!-- Lo que NO va al papel: solo se imprimen las aprobadas -->
				<p
					v-if="printNotice.pending > 0 || printNotice.alreadyPrinted > 0"
					class="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
					data-testid="print-notice"
				>
					<template v-if="printNotice.pending > 0">
						{{ t('letters.print.pendingNotIncluded', { count: printNotice.pending }) }}
					</template>
					<template v-if="printNotice.alreadyPrinted > 0">
						{{ t('letters.print.alreadyPrintedSkipped', { count: printNotice.alreadyPrinted }) }}
					</template>
				</p>
				<iframe
					v-if="printPreviewUrl"
					ref="previewFrame"
					:src="printPreviewUrl"
					class="h-[60vh] w-full rounded border bg-white"
					:title="t('letters.print.previewTitle')"
				/>
				<DialogFooter class="flex-col gap-2 sm:flex-row sm:items-center">
					<template v-if="!awaitingPrintConfirm">
						<label class="mr-auto flex items-center gap-2 text-sm">
							<input v-model="withCover" type="checkbox" class="h-4 w-4" data-testid="print-cover" />
							{{ t('letters.print.withCover') }}
						</label>
						<Button variant="outline" @click="closePreview">
							{{ t('letters.print.close') }}
						</Button>
						<Button :disabled="!printPreviewUrl" @click="confirmPrint">
							<Printer class="mr-2 h-4 w-4" />
							{{ t('letters.print.printNow') }}
						</Button>
					</template>
					<template v-else>
						<span class="mr-auto text-sm" data-testid="print-confirm-question">
							{{ t('letters.print.didItPrint', { count: printPreviewMeta.letterIds.length }) }}
						</span>
						<Button variant="outline" @click="closePreview">
							{{ t('letters.print.notPrinted') }}
						</Button>
						<Button @click="markBatchPrinted">
							<Check class="mr-2 h-4 w-4" />
							{{ t('letters.print.yesMark', { count: printPreviewMeta.letterIds.length }) }}
						</Button>
					</template>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	</div>
</template>
