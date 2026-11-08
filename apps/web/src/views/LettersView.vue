<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
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
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	Input,
} from '@repo/ui';
import {
	Check,
	ChevronDown,
	Copy,
	Download,
	ExternalLink,
	EyeOff,
	File,
	FileSpreadsheet,
	FileText,
	Mail,
	Mailbox,
	MoreVertical,
	Paperclip,
	Presentation,
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
import LetterPhotoViewer from '@/components/letters/LetterPhotoViewer.vue';
import { attachmentKind, formatBytes, openAttachment } from '@/utils/letterAttachments';
import { folderMatchesPalanquero, LETTER_PALANQUERO_NONE } from '@/utils/letterFolders';

const route = useRoute();
const router = useRouter();
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
	restoreFilters();
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

// -- Adjuntos: fotos al visor; documentos (PDF, Office, HEIC…) se abren o descargan --
const photosOf = (letter: Letter) => (letter.attachments ?? []).filter((a) => a.isBrowserSafeImage);
const documentsOf = (letter: Letter) => (letter.attachments ?? []).filter((a) => !a.isBrowserSafeImage);

const documentIcon = (doc: Parameters<typeof attachmentKind>[0]) => {
	const kind = attachmentKind(doc);
	if (kind === 'pdf' || kind === 'word' || kind === 'text') return FileText;
	if (kind === 'sheet') return FileSpreadsheet;
	if (kind === 'slides') return Presentation;
	return File;
};

const viewerOpen = ref(false);
const viewerPhotos = ref<Letter['attachments']>([]);
const viewerIndex = ref(0);

const openPhotos = (letter: Letter, index: number) => {
	viewerPhotos.value = photosOf(letter);
	viewerIndex.value = index;
	viewerOpen.value = true;
};

watch(retreatId, (id) => {
	newLettersCount.value = 0;
	participantFilter.value = '';
	participantSearch.value = '';
	palanqueroFilter.value = id ? storedPalanquero(id) : '';
	applyFilters();
	loadFolders();
	if (id) letterStore.fetchPalanqueroOptions(id);
});

// -- Filtros en la URL (y palanquero recordado por retiro) --
// vista/palanquero/caminante viajan en la URL: el palanquero guarda o recibe
// por WhatsApp su enlace y entra directo a SUS carpetas. El último palanquero
// elegido se recuerda en este navegador para el mismo retiro.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const palanqueroStorageKey = (id: string) => `letters.palanquero.${id}`;

const storedPalanquero = (id: string): string => {
	try {
		return localStorage.getItem(palanqueroStorageKey(id)) ?? '';
	} catch {
		return '';
	}
};

function restoreFilters() {
	const q = route.query ?? {};
	if (q.vista === 'carpetas') viewMode.value = 'folders';
	palanqueroFilter.value =
		typeof q.palanquero === 'string' ? q.palanquero : storedPalanquero(retreatId.value);
	if (typeof q.caminante === 'string' && UUID_RE.test(q.caminante)) {
		participantFilter.value = q.caminante;
	}
}

const syncFiltersToUrl = () => {
	const query: Record<string, unknown> = { ...(route.query ?? {}) };
	const put = (key: string, value: string) => {
		if (value) query[key] = value;
		else delete query[key];
	};
	put('vista', viewMode.value === 'folders' ? 'carpetas' : '');
	put('palanquero', palanqueroFilter.value);
	put('caminante', participantFilter.value);
	void Promise.resolve(router.replace({ query: query as Record<string, string> })).catch(() => {});
	try {
		if (retreatId.value) {
			if (palanqueroFilter.value) {
				localStorage.setItem(palanqueroStorageKey(retreatId.value), palanqueroFilter.value);
			} else {
				localStorage.removeItem(palanqueroStorageKey(retreatId.value));
			}
		}
	} catch {
		// Sin almacenamiento (modo privado): solo la URL.
	}
};
watch([viewMode, palanqueroFilter, participantFilter], syncFiltersToUrl);

// Caminante que llega por la URL: su nombre en el buscador en cuanto llegan
// las carpetas.
watch(
	() => letterStore.folders,
	(folders) => {
		if (participantFilter.value && !participantSearch.value) {
			participantSearch.value =
				folders.find((f) => f.participantId === participantFilter.value)?.participantName ?? '';
		}
	},
);

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

// Carpeta de la que se vino: al volver se resalta y se lleva a la vista.
const lastFolderId = ref<string | null>(null);

/** Desde Carpetas: click en una persona → bandeja filtrada por ella. */
const viewParticipantLetters = (participantId: string) => {
	const folder = letterStore.folders.find((f) => f.participantId === participantId);
	lastFolderId.value = folder?.retreatParticipantId ?? null;
	participantFilter.value = participantId;
	participantSearch.value = folder?.participantName ?? '';
	statusFilter.value = '';
	viewMode.value = 'inbox';
	applyFilters();
};

/** «← Volver a Carpetas»: suelta al caminante y regresa a su fila. */
const backToFolders = () => {
	clearParticipant();
	viewMode.value = 'folders';
	loadFolders();
	nextTick(() => {
		const row = lastFolderId.value
			? document.querySelector(`[data-folder-id="${lastFolderId.value}"]`)
			: null;
		(row as HTMLElement | null)?.scrollIntoView?.({ block: 'center' });
	});
};

// -- Filtros activos como etiquetas con ✕ --
const activeFilters = computed(() => {
	const chips: { key: string; label: string; clear: () => void }[] = [];
	if (statusFilter.value) {
		chips.push({
			key: 'status',
			label: t('letters.chips.status', { value: t(`letters.status.${statusFilter.value}`) }),
			clear: () => {
				statusFilter.value = '';
				applyFilters();
			},
		});
	}
	if (tableFilter.value) {
		const name = tableMesaStore.tables.find((tb) => tb.id === tableFilter.value)?.name ?? '';
		chips.push({
			key: 'table',
			label: t('letters.chips.table', { value: name }),
			clear: () => {
				tableFilter.value = '';
				applyFilters();
			},
		});
	}
	if (palanqueroFilter.value) {
		chips.push({
			key: 'palanquero',
			label: t('letters.chips.palanquero', { value: palanqueroLabel.value }),
			clear: () => {
				palanqueroFilter.value = '';
				applyFilters();
			},
		});
	}
	if (participantFilter.value) {
		chips.push({
			key: 'participant',
			label: t('letters.chips.participant', {
				value: filteredFolder.value?.participantName ?? participantSearch.value,
			}),
			clear: clearParticipant,
		});
	}
	if (searchQuery.value.trim()) {
		chips.push({
			key: 'search',
			label: t('letters.chips.search', { value: searchQuery.value.trim() }),
			clear: () => {
				searchQuery.value = '';
				applyFilters();
			},
		});
	}
	return chips;
});

const clearAllFilters = () => {
	statusFilter.value = '';
	tableFilter.value = '';
	palanqueroFilter.value = '';
	searchQuery.value = '';
	participantFilter.value = '';
	participantSearch.value = '';
	applyFilters();
};

// -- Quitar la marca de impresa (hoja perdida, salió mal, rehacer carpeta) --
const afterUnmark = (unmarked: number) => {
	toast({ title: t('letters.print.unmarkedTitle', { count: unmarked }) });
	load();
	loadFolders();
};

const unmarkLetter = async (letter: Letter) => {
	try {
		const { unmarked } = await letterStore.unmarkPrinted(retreatId.value, { letterIds: [letter.id] });
		afterUnmark(unmarked);
	} catch {
		toast({ title: t('letters.print.unmarkError'), variant: 'destructive' });
	}
};

const unmarkFolder = async (participantId: string) => {
	try {
		const { unmarked } = await letterStore.unmarkPrinted(retreatId.value, {
			participantIds: [participantId],
		});
		afterUnmark(unmarked);
	} catch {
		toast({ title: t('letters.print.unmarkError'), variant: 'destructive' });
	}
};

// -- Marcar a mano (se imprimió en otra compu, o se cerró la vista previa sin confirmar) --
const markByHand = async (target: { letterIds?: string[]; participantIds?: string[] }) => {
	try {
		const { marked } = await letterStore.markPrinted(retreatId.value, target);
		toast({
			title:
				marked > 0
					? t('letters.print.markedByHandTitle', { count: marked })
					: t('letters.print.nothingToMark'),
		});
		load();
		loadFolders();
	} catch {
		toast({ title: t('letters.print.markError'), variant: 'destructive' });
	}
};

const markLetter = (letter: Letter) => markByHand({ letterIds: [letter.id] });
const markFolder = (participantId: string) => markByHand({ participantIds: [participantId] });
const markSelection = () =>
	markByHand({ letterIds: letterStore.letters.filter((l) => selectedIds.value.has(l.id)).map((l) => l.id) });

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
	if (mailboxDialogOpen.value || shareDialogOpen.value || printPreviewOpen.value || viewerOpen.value) {
		return;
	}
	// Solo en la bandeja: en Carpetas las cartas no se ven, y «a» aprobaría la
	// que quedó seleccionada antes de cambiar de vista.
	if (viewMode.value !== 'inbox') return;
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

/** Adjuntos de las cartas del lote que no salen en el papel: se imprimen aparte. */
const printDocuments = computed(() =>
	printEntries.value.flatMap((entry) =>
		entry.letters.flatMap((letter) =>
			(letter.attachments ?? [])
				.filter((a) => !a.isBrowserSafeImage)
				.map((a) => ({ id: a.id, participant: entry.participantName, fileName: a.fileName })),
		),
	),
);

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
		status === 401
			? t('letters.print.sessionExpired')
			: status === 429
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

/**
 * «Solo las no impresas» con el alcance de lo que se está mirando: caminante
 * > palanquero (con su mesa, si hay) > mesa > retiro entero. El número sale de
 * las carpetas (aprobadas sin papel), igual que en la vista Carpetas.
 */
const unprintedContext = computed((): { scope: PrintScope; count: number; title: string } => {
	const sum = (folders: LetterFolderRow[]) => folders.reduce((acc, f) => acc + f.unprinted, 0);
	if (participantFilter.value) {
		const folder = filteredFolder.value;
		return {
			scope: { kind: 'participant', participantIds: [participantFilter.value] },
			count: folder?.unprinted ?? 0,
			title: folder?.participantName ?? '',
		};
	}
	if (palanqueroFilter.value) {
		const folders = letterStore.folders.filter(
			(f) =>
				f.participantId &&
				f.unprinted > 0 &&
				folderMatchesPalanquero(f, palanqueroFilter.value) &&
				(!tableFilter.value || f.tableId === tableFilter.value),
		);
		return {
			scope: { kind: 'participant', participantIds: folders.map((f) => f.participantId as string) },
			count: sum(folders),
			title: palanqueroLabel.value,
		};
	}
	if (tableFilter.value) {
		return {
			scope: { kind: 'table', tableId: tableFilter.value },
			count: sum(letterStore.folders.filter((f) => f.tableId === tableFilter.value)),
			title: tableMesaStore.tables.find((tb) => tb.id === tableFilter.value)?.name ?? '',
		};
	}
	return {
		scope: { kind: 'retreat' },
		count: sum(letterStore.folders),
		title: t('letters.print.wholeRetreat'),
	};
});

const printUnprinted = () => {
	const ctx = unprintedContext.value;
	if (ctx.count === 0) return;
	void runPrint(ctx.scope, () => t('letters.print.unprintedTitle', { scope: ctx.title }), true);
};

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
			.markPrinted(retreatId.value, { letterIds }, newPrintBatchId())
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
						<!-- Imprimir: los alcances, en el mismo ⋮ que el resto (menos botones) -->
						<DropdownMenuLabel>{{ t('letters.print.menu') }}</DropdownMenuLabel>
						<DropdownMenuItem
							v-if="unprintedContext.count > 0"
							:disabled="printing"
							data-testid="print-unprinted"
							@select="deferOpen(() => printUnprinted())"
						>
							<Printer class="mr-2 h-4 w-4" />
							{{ t('letters.print.unprinted', { count: unprintedContext.count, scope: unprintedContext.title }) }}
						</DropdownMenuItem>
						<DropdownMenuItem :disabled="printing" @select="deferOpen(() => printBatch('retreat'))">
							<Printer class="mr-2 h-4 w-4" />
							{{ t('letters.print.retreat') }}
						</DropdownMenuItem>
						<DropdownMenuItem v-if="tableFilter" :disabled="printing" @select="deferOpen(() => printTable())">
							<Printer class="mr-2 h-4 w-4" />
							{{ t('letters.print.table') }}
						</DropdownMenuItem>
						<DropdownMenuItem
							v-if="palanqueroFilter && palanqueroPrintIds.length"
							:disabled="printing"
							@select="deferOpen(() => printPalanquero())"
						>
							<Printer class="mr-2 h-4 w-4" />
							{{ t('letters.print.palanquero', { count: palanqueroPrintIds.length }) }}
						</DropdownMenuItem>
						<DropdownMenuItem
							v-if="participantFilter"
							:disabled="printing"
							@select="deferOpen(() => printFiltered())"
						>
							<Printer class="mr-2 h-4 w-4" />
							{{ t('letters.print.filtered') }}
						</DropdownMenuItem>
						<DropdownMenuItem
							v-if="selectedCount > 0"
							:disabled="printing"
							@select="deferOpen(() => printSelection())"
						>
							<Printer class="mr-2 h-4 w-4" />
							{{ t('letters.print.selection', { count: selectedCount }) }}
						</DropdownMenuItem>
						<DropdownMenuItem v-if="selectedCount > 0" @click="markSelection">
							<Stamp class="mr-2 h-4 w-4" />
							{{ t('letters.print.markSelection', { count: selectedCount }) }}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
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

		<!-- v-show (no v-if): al volver de las cartas de alguien, Carpetas conserva
		     su búsqueda y su filtro, y se resalta la fila de la que se vino. -->
		<LettersFoldersPanel
			v-show="viewMode === 'folders'"
			:folders="letterStore.folders"
			:loading="letterStore.foldersLoading"
			:palanquero-options="letterStore.palanqueroOptions"
			:palanquero="palanqueroFilter"
			:highlight-id="lastFolderId"
			@print="printFromFolders"
			@view-letters="viewParticipantLetters"
			@share="shareOne"
			@unmark="unmarkFolder"
			@mark="markFolder"
		/>

		<template v-if="viewMode === 'inbox'">
		<!-- Caminante filtrado: su carpeta arriba, con cómo volver a Carpetas -->
		<div
			v-if="participantFilter && filteredFolder"
			class="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3"
			data-testid="participant-header"
		>
			<Button variant="ghost" size="sm" data-testid="back-to-folders" @click="backToFolders">
				← {{ t('letters.backToFolders') }}
			</Button>
			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-center gap-2">
					<span class="font-semibold">{{ filteredFolder.participantName }}</span>
					<span v-if="filteredFolder.tableName" class="text-sm text-muted-foreground">
						· {{ filteredFolder.tableName }}<template v-if="filteredFolder.idOnRetreat != null"> · Nº {{ filteredFolder.idOnRetreat }}</template>
					</span>
					<span
						v-if="filteredFolder.palancasCoordinator"
						class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
					>
						{{
							letterStore.palanqueroOptions.find((o) => o.value === filteredFolder?.palancasCoordinator)?.label ??
							filteredFolder.palancasCoordinator
						}}
					</span>
				</div>
				<p class="text-xs text-muted-foreground">
					{{
						t('letters.participantSummary', {
							total: filteredFolder.counts.pending + filteredFolder.counts.approved,
							printed: filteredFolder.printed,
							pending: filteredFolder.counts.pending,
						})
					}}
				</p>
			</div>
			<Button
				v-if="filteredFolder.unprinted > 0"
				size="sm"
				@click="printParticipants([participantFilter], filteredFolder.participantName, true)"
			>
				<Printer class="mr-2 h-4 w-4" />
				{{ t('letters.folders.printMissing', { count: filteredFolder.unprinted }) }}
			</Button>
			<DropdownMenu v-if="filteredFolder.counts.approved > 0">
				<DropdownMenuTrigger as-child>
					<Button variant="ghost" size="icon" class="h-8 w-8" :aria-label="t('letters.rowActions')">
						<MoreVertical class="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem @select="deferOpen(() => printFiltered())">
						<Printer class="mr-2 h-4 w-4" />
						{{ t('letters.folders.printAll') }}
					</DropdownMenuItem>
					<DropdownMenuItem
						v-if="filteredFolder.unprinted > 0"
						@click="markFolder(participantFilter)"
					>
						<Stamp class="mr-2 h-4 w-4" />
						{{ t('letters.folders.markFolder') }}
					</DropdownMenuItem>
					<DropdownMenuItem
						v-if="filteredFolder.printed > 0"
						@click="unmarkFolder(participantFilter)"
					>
						<Stamp class="mr-2 h-4 w-4" />
						{{ t('letters.folders.unmarkFolder') }}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
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

		<!-- Filtros activos: que no quede uno puesto sin que se note -->
		<div v-if="activeFilters.length" class="flex flex-wrap items-center gap-2" data-testid="active-filters">
			<span
				v-for="chip in activeFilters"
				:key="chip.key"
				class="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pl-3 pr-1 text-xs"
			>
				{{ chip.label }}
				<button
					type="button"
					class="flex h-5 w-5 items-center justify-center rounded-full hover:bg-muted"
					:aria-label="t('letters.chips.remove', { label: chip.label })"
					:data-testid="`chip-clear-${chip.key}`"
					@click="chip.clear()"
				>
					✕
				</button>
			</span>
			<Button
				v-if="activeFilters.length > 1"
				variant="ghost"
				size="sm"
				class="h-6 text-xs"
				data-testid="clear-all-filters"
				@click="clearAllFilters"
			>
				{{ t('letters.chips.clearAll') }}
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
			<template v-if="activeFilters.length">
				<p>{{ t('letters.emptyFiltered') }}</p>
				<Button variant="outline" size="sm" class="mt-3" @click="clearAllFilters">
					{{ t('letters.chips.clearAll') }}
				</Button>
			</template>
			<template v-else>{{ t('letters.empty') }}</template>
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
					<button
						v-if="firstPhotoUrl(letter)"
						type="button"
						class="shrink-0 cursor-zoom-in"
						:aria-label="t('letters.viewer.open')"
						data-testid="row-thumbnail"
						@click.stop="openPhotos(letter, 0)"
					>
						<img
							:src="firstPhotoUrl(letter)!"
							:alt="t('letters.receiptAlt')"
							class="h-14 w-20 object-cover border rounded"
						/>
					</button>
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-medium">{{ letter.participantName ?? '—' }}</span>
							<span v-if="letter.tableName" class="text-sm text-muted-foreground">· {{ letter.tableName }}</span>
							<Badge :variant="statusVariant(letter.status)">{{ t(`letters.status.${letter.status}`) }}</Badge>
							<Badge v-if="letter.printedAt" variant="outline">
								<Stamp class="mr-1 h-3 w-3" />
								{{ t('letters.printed') }}
							</Badge>
							<Badge v-if="documentsOf(letter).length" variant="outline">
								<Paperclip class="mr-1 h-3 w-3" />
								{{ t('letters.documentsBadge', { count: documentsOf(letter).length }) }}
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
									v-if="letter.status === 'pending' || letter.status === 'hidden'"
									@click="review(letter, 'approved')"
								>
									<Check class="mr-2 h-4 w-4 text-green-600" />
									{{ t('letters.review.approve') }}
								</DropdownMenuItem>
								<DropdownMenuItem
									v-if="letter.status === 'pending' || letter.status === 'approved'"
									@click="review(letter, 'hidden')"
								>
									<EyeOff class="mr-2 h-4 w-4" />
									{{ t('letters.review.hide') }}
								</DropdownMenuItem>
								<DropdownMenuItem @click="copyAddress(letter)">
									<Copy class="mr-2 h-4 w-4" />
									{{ t('letters.copyAddress') }}
								</DropdownMenuItem>
								<DropdownMenuSeparator
									v-if="letter.participantId || letter.printedAt || letter.status === 'approved'"
								/>
								<DropdownMenuItem v-if="letter.participantId" @select="printOneParticipant(letter)">
									<Printer class="mr-2 h-4 w-4" />
									{{ t('letters.print.participant') }}
								</DropdownMenuItem>
								<DropdownMenuItem
									v-if="letter.status === 'approved' && !letter.printedAt"
									@click="markLetter(letter)"
								>
									<Stamp class="mr-2 h-4 w-4" />
									{{ t('letters.print.markLetter') }}
								</DropdownMenuItem>
								<DropdownMenuItem v-if="letter.printedAt" @click="unmarkLetter(letter)">
									<Stamp class="mr-2 h-4 w-4" />
									{{ t('letters.print.unmarkLetter') }}
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
					<!-- Las acciones (aprobar, ocultar, copiar dirección, imprimir) viven
					     en el ⋮ de la fila: aquí solo el contenido. -->
					<p v-if="letter.reviewedAt" class="mb-3 text-xs text-muted-foreground">
						{{ t('letters.reviewedAt', { date: fmtDate(letter.reviewedAt) }) }}
					</p>

					<div v-if="letter.subject" class="mb-2 text-sm font-medium">«{{ letter.subject }}»</div>
					<div class="whitespace-pre-wrap text-sm leading-relaxed">{{ letter.bodyText }}</div>

					<div v-if="letter.warnings?.length" class="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
						<div v-for="warning in letter.warnings" :key="warning">{{ warning }}</div>
					</div>

					<!-- Fotos: click → en grande. Documentos: PDF en pestaña, el resto se
					     descarga y lo abre su programa (nunca dentro de la página). -->
					<div v-if="photosOf(letter).length" class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
						<figure
							v-for="(photo, i) in photosOf(letter)"
							:key="photo.id"
							class="overflow-hidden rounded-lg border"
						>
							<button
								type="button"
								class="block w-full cursor-zoom-in"
								:aria-label="t('letters.viewer.open')"
								data-testid="detail-photo"
								@click="openPhotos(letter, i)"
							>
								<img
									:src="photo.storageUrl"
									:alt="photo.fileName"
									class="max-h-64 w-full object-contain bg-white"
								/>
							</button>
							<figcaption class="truncate border-t px-2 py-1 text-xs text-muted-foreground">
								{{ photo.fileName }}
							</figcaption>
						</figure>
					</div>
					<ul v-if="documentsOf(letter).length" class="mt-4 space-y-2">
						<li
							v-for="doc in documentsOf(letter)"
							:key="doc.id"
							class="flex items-center gap-3 rounded-lg border p-2"
							data-testid="detail-document"
						>
							<component :is="documentIcon(doc)" class="h-6 w-6 shrink-0 text-muted-foreground" />
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm">{{ doc.fileName }}</p>
								<p class="text-xs text-muted-foreground">
									{{ t(`letters.attachmentKind.${attachmentKind(doc)}`) }} · {{ formatBytes(doc.sizeBytes) }}
								</p>
							</div>
							<Button
								size="sm"
								variant="outline"
								:data-testid="`open-${attachmentKind(doc)}`"
								@click="openAttachment(doc)"
							>
								<component :is="attachmentKind(doc) === 'pdf' ? ExternalLink : Download" class="mr-2 h-4 w-4" />
								{{ attachmentKind(doc) === 'pdf' ? t('letters.viewer.openPdf') : t('letters.viewer.download') }}
							</Button>
						</li>
					</ul>
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
		<LetterPhotoViewer
			v-model:open="viewerOpen"
			v-model:index="viewerIndex"
			:photos="viewerPhotos ?? []"
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
				<div
					v-if="printDocuments.length"
					class="rounded border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900"
					data-testid="print-documents"
				>
					<p>{{ t('letters.print.documentsNotPrinted', { count: printDocuments.length }) }}</p>
					<ul class="mt-1 list-disc pl-5 text-xs">
						<li v-for="d in printDocuments.slice(0, 6)" :key="d.id">
							{{ d.participant }} — {{ d.fileName }}
						</li>
						<li v-if="printDocuments.length > 6">
							{{ t('letters.print.andMore', { count: printDocuments.length - 6 }) }}
						</li>
					</ul>
				</div>
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
