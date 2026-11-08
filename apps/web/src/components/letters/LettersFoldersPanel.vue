<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
	Badge,
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@repo/ui';
import { Eye, Inbox, MoreVertical, Paperclip, Printer, Search, Share2, Stamp } from 'lucide-vue-next';
import type { LetterFolderRow } from '@/services/api';
import { useRekaDialogFix } from '@/composables/useRekaDialogFix';
import { folderMatchesPalanquero } from '@/utils/letterFolders';

/**
 * Carpetas: una fila por participante con el estado de su folder físico —
 * cuántas cartas tiene, cuántas ya salieron en papel y si quedan por revisar.
 * Es la vista del palanquero: «¿a quién le falta imprimir algo?» sin abrir
 * carta por carta. Imprimir, ver las cartas y reenviar la dirección los
 * resuelve la vista padre (abre dialogs: van por deferOpen).
 */
const props = withDefaults(
	defineProps<{
		folders: LetterFolderRow[];
		loading: boolean;
		/** «Palanquero N (servidor)», para mostrar el nombre en cada fila. */
		palanqueroOptions?: { value: string; label: string }[];
		/**
		 * Palanquero elegido en la vista padre (junto a Bandeja | Carpetas: el
		 * mismo filtro vale para las dos). '' = todos.
		 */
		palanquero?: string;
		/** Carpeta de la que se vino (retreatParticipantId): se resalta al volver. */
		highlightId?: string | null;
	}>(),
	{ palanqueroOptions: () => [], palanquero: '', highlightId: null },
);

const emit = defineEmits<{
	print: [payload: { participantIds: string[]; onlyUnprinted: boolean; title: string }];
	'view-letters': [participantId: string];
	share: [retreatParticipantId: string];
	unmark: [participantId: string];
}>();

const { t } = useI18n();
const { deferOpen } = useRekaDialogFix();

type FolderFilter = 'all' | 'unprinted' | 'review' | 'complete' | 'empty';
const filter = ref<FolderFilter>('all');
const search = ref('');

/** Carpetas del palanquero elegido (base de chips, lista e impresión masiva). */
const ofPalanquero = computed(() =>
	props.folders.filter((f) => folderMatchesPalanquero(f, props.palanquero)),
);

const palanqueroName = (value: string | null): string | null => {
	if (!value) return null;
	return props.palanqueroOptions.find((o) => o.value === value)?.label ?? value;
};

/** Cartas que van al folder: las aprobadas y las que siguen por revisar. */
const lettersIn = (f: LetterFolderRow) => f.counts.pending + f.counts.approved;
const isEmpty = (f: LetterFolderRow) => lettersIn(f) === 0;
const needsReview = (f: LetterFolderRow) => f.counts.pending > 0;
const hasUnprinted = (f: LetterFolderRow) => f.unprinted > 0;
const isComplete = (f: LetterFolderRow) => !isEmpty(f) && !needsReview(f) && !hasUnprinted(f);

const matches = (f: LetterFolderRow, which: FolderFilter): boolean => {
	if (which === 'unprinted') return hasUnprinted(f);
	if (which === 'review') return needsReview(f);
	if (which === 'complete') return isComplete(f);
	if (which === 'empty') return isEmpty(f);
	return true;
};

const normalized = (value: string): string =>
	value
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '');

const visible = computed(() => {
	const q = normalized(search.value.trim());
	return ofPalanquero.value.filter(
		(f) =>
			matches(f, filter.value) &&
			(!q || normalized(`${f.participantName} ${f.tableName ?? ''}`).includes(q)),
	);
});

const filters = computed(() =>
	(['all', 'unprinted', 'review', 'complete', 'empty'] as FolderFilter[]).map((value) => ({
		value,
		label: t(`letters.folders.filter.${value}`),
		count: ofPalanquero.value.filter((f) => matches(f, value)).length,
	})),
);

// «Imprimir todo lo que falta» abarca lo que se ve: palanquero, búsqueda y chip.
const pendingToPrint = computed(() => visible.value.filter(hasUnprinted));
const lettersToPrint = computed(() =>
	pendingToPrint.value.reduce((sum, f) => sum + f.unprinted, 0),
);

const printAllMissing = () => {
	const ids = pendingToPrint.value.map((f) => f.participantId).filter((id): id is string => !!id);
	if (ids.length === 0) return;
	emit('print', {
		participantIds: ids,
		onlyUnprinted: true,
		title: t('letters.folders.printAllTitle', { count: ids.length }),
	});
};

const printFolder = (f: LetterFolderRow, onlyUnprinted: boolean) => {
	if (!f.participantId) return;
	emit('print', {
		participantIds: [f.participantId],
		onlyUnprinted,
		title: f.participantName,
	});
};

/** Click en la fila: sus cartas (si tiene alguna; una carpeta vacía no lleva a nada). */
const hasAnyLetter = (f: LetterFolderRow) =>
	f.counts.pending + f.counts.approved + f.counts.hidden + f.counts.attached > 0;

const openFolder = (f: LetterFolderRow) => {
	if (f.participantId && hasAnyLetter(f)) emit('view-letters', f.participantId);
};

const fmtDate = (value: string) =>
	new Date(value).toLocaleString('es-MX', { day: 'numeric', month: 'short' });
</script>

<template>
	<div class="space-y-3">
		<div class="flex flex-wrap items-center gap-2">
			<Button
				v-for="f in filters"
				:key="f.value"
				variant="ghost"
				size="sm"
				class="border"
				:class="{ 'bg-muted': filter === f.value }"
				@click="filter = f.value"
			>
				{{ f.label }} ({{ f.count }})
			</Button>
		</div>

		<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
			<div class="relative flex-1 min-w-[200px]">
				<Search class="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
				<input
					v-model="search"
					type="search"
					:placeholder="t('letters.folders.searchPlaceholder')"
					class="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm"
					data-testid="folders-search"
				/>
			</div>
			<Button
				:disabled="lettersToPrint === 0"
				data-testid="folders-print-missing"
				@click="deferOpen(printAllMissing)"
			>
				<Printer class="mr-2 h-4 w-4" />
				{{ t('letters.folders.printAllMissing', { count: lettersToPrint }) }}
			</Button>
		</div>

		<div v-if="props.loading" class="py-10 text-center text-sm text-muted-foreground">
			{{ t('common.loading') }}
		</div>
		<div
			v-else-if="visible.length === 0"
			class="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground"
		>
			{{ t('letters.folders.empty') }}
		</div>
		<ul v-else class="divide-y rounded-lg border">
			<li
				v-for="f in visible"
				:key="f.retreatParticipantId"
				class="flex flex-wrap items-center gap-3 p-3"
				:class="[
					hasAnyLetter(f) ? 'cursor-pointer hover:bg-muted/40' : '',
					props.highlightId === f.retreatParticipantId ? 'ring-2 ring-primary ring-inset' : '',
				]"
				:data-folder-id="f.retreatParticipantId"
				:role="hasAnyLetter(f) ? 'button' : undefined"
				:tabindex="hasAnyLetter(f) ? 0 : undefined"
				:aria-label="hasAnyLetter(f) ? t('letters.folders.openLetters', { name: f.participantName }) : undefined"
				data-testid="folder-row"
				@click="openFolder(f)"
				@keydown.enter="openFolder(f)"
			>
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-2">
						<span class="font-medium">{{ f.participantName }}</span>
						<span v-if="f.tableName" class="text-sm text-muted-foreground">
							· {{ f.tableName }}<template v-if="f.idOnRetreat != null"> · Nº {{ f.idOnRetreat }}</template>
						</span>
						<span
							v-if="f.palancasCoordinator"
							class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
							data-testid="folder-palanquero"
						>
							{{ palanqueroName(f.palancasCoordinator) }}
						</span>
						<Badge v-if="isComplete(f)" variant="default" data-testid="folder-complete">
							{{ t('letters.folders.status.complete') }}
						</Badge>
						<Badge v-if="hasUnprinted(f)" variant="secondary">
							{{ t('letters.folders.status.unprinted', { count: f.unprinted }) }}
						</Badge>
						<Badge v-if="needsReview(f)" variant="outline">
							{{ t('letters.folders.status.review', { count: f.counts.pending }) }}
						</Badge>
						<!-- Documentos (PDF, Word…) que no salen en el papel: imprimir aparte -->
						<Badge v-if="f.documents > 0" variant="outline" data-testid="folder-documents">
							<Paperclip class="mr-1 h-3 w-3" />
							{{ t('letters.folders.status.documents', { count: f.documents }) }}
						</Badge>
					</div>
					<p class="mt-0.5 text-xs text-muted-foreground">
						<template v-if="!isEmpty(f)">
							{{ t('letters.folders.summary', { total: lettersIn(f), printed: f.printed }) }}
						</template>
						<!-- Sin cartas: ¿ya se le mandó la dirección a la familia? -->
						<template v-else-if="f.mailboxSharedAt">
							<Inbox class="mr-1 inline h-3 w-3" />
							{{ t('letters.folders.emptyShared', { date: fmtDate(f.mailboxSharedAt) }) }}
						</template>
						<span v-else class="text-amber-700">
							{{ t('letters.folders.emptyNotShared') }}
						</span>
					</p>
				</div>

				<div class="flex items-center gap-1" @click.stop @keydown.enter.stop>
				<Button
					v-if="hasUnprinted(f)"
					size="sm"
					variant="outline"
					@click="deferOpen(() => printFolder(f, true))"
				>
					<Printer class="mr-1 h-4 w-4" />
					{{ t('letters.folders.printMissing', { count: f.unprinted }) }}
				</Button>

				<DropdownMenu>
					<DropdownMenuTrigger as-child>
						<Button variant="ghost" size="icon" class="h-8 w-8" :aria-label="t('letters.rowActions')">
							<MoreVertical class="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							v-if="!isEmpty(f) && f.participantId"
							@click="emit('view-letters', f.participantId)"
						>
							<Eye class="mr-2 h-4 w-4" />
							{{ t('letters.folders.viewLetters') }}
						</DropdownMenuItem>
						<DropdownMenuItem
							v-if="f.counts.approved > 0"
							@select="deferOpen(() => printFolder(f, false))"
						>
							<Printer class="mr-2 h-4 w-4" />
							{{ t('letters.folders.printAll') }}
						</DropdownMenuItem>
						<DropdownMenuItem
							v-if="f.printed > 0 && f.participantId"
							@click="emit('unmark', f.participantId)"
						>
							<Stamp class="mr-2 h-4 w-4" />
							{{ t('letters.folders.unmarkFolder') }}
						</DropdownMenuItem>
						<DropdownMenuItem
							v-if="f.mailboxEnabled"
							@select="deferOpen(() => emit('share', f.retreatParticipantId))"
						>
							<Share2 class="mr-2 h-4 w-4" />
							{{ f.mailboxSharedAt ? t('letters.folders.resendAddress') : t('letters.folders.sendAddress') }}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				</div>
			</li>
		</ul>
	</div>
</template>
