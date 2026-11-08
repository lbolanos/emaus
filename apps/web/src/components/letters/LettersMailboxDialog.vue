<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Switch,
} from '@repo/ui';
import { Copy, Search, Share2 } from 'lucide-vue-next';
import type { LetterMailboxRow } from '@/services/api';

const props = defineProps<{
	open: boolean;
	retreatId: string;
	mailboxes: LetterMailboxRow[];
	loading?: boolean;
}>();

const emit = defineEmits<{
	'update:open': [value: boolean];
	toggle: [row: LetterMailboxRow, enabled: boolean];
	share: [rows: LetterMailboxRow[]];
}>();

const { t } = useI18n();
const search = defineModel<string>('search', { default: '' });

const filtered = computed(() => {
	const q = search.value.trim().toLowerCase();
	if (!q) return props.mailboxes;
	return props.mailboxes.filter(
		(row) =>
			row.participantName.toLowerCase().includes(q) ||
			(row.tableName ?? '').toLowerCase().includes(q) ||
			(row.mailboxCode ?? '').toLowerCase().includes(q),
	);
});

const copyAddress = async (row: LetterMailboxRow) => {
	if (!row.mailboxAddress) return;
	await navigator.clipboard.writeText(row.mailboxAddress);
};

const close = () => emit('update:open', false);
</script>

<template>
	<Dialog :open="props.open" @update:open="emit('update:open', $event)">
		<DialogContent class="max-w-3xl max-h-[85vh] overflow-y-auto">
			<DialogHeader>
				<DialogTitle>{{ t('letters.mailboxDialog.title') }}</DialogTitle>
				<DialogDescription>{{ t('letters.mailboxDialog.description') }}</DialogDescription>
			</DialogHeader>

			<div class="relative mb-3">
				<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
				<Input
					v-model="search"
					:placeholder="t('letters.mailboxDialog.searchPlaceholder')"
					class="pl-8"
				/>
			</div>

			<div v-if="props.loading" class="py-8 text-center text-sm text-muted-foreground">
				{{ t('common.loading') }}
			</div>
			<div v-else-if="filtered.length === 0" class="py-8 text-center text-sm text-muted-foreground">
				{{ t('letters.mailboxDialog.empty') }}
			</div>
			<table v-else class="w-full text-sm">
				<thead>
					<tr class="border-b text-left text-muted-foreground">
						<th class="py-2 pr-2">{{ t('letters.mailboxDialog.participant') }}</th>
						<th class="py-2 pr-2">{{ t('letters.mailboxDialog.table') }}</th>
						<th class="py-2 pr-2">{{ t('letters.mailboxDialog.address') }}</th>
						<th class="py-2 pr-2 text-center">{{ t('letters.mailboxDialog.letters') }}</th>
						<th class="py-2 pr-2 text-center">{{ t('letters.mailboxDialog.enabled') }}</th>
						<th class="py-2"></th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="row in filtered" :key="row.retreatParticipantId" class="border-b last:border-0">
						<td class="py-2 pr-2 font-medium">{{ row.participantName }}</td>
						<td class="py-2 pr-2 text-muted-foreground">{{ row.tableName ?? '—' }}</td>
						<td class="py-2 pr-2">
							<div v-if="row.mailboxAddress" class="flex items-center gap-1">
								<code class="text-xs bg-muted rounded px-1.5 py-0.5">{{ row.mailboxAddress }}</code>
								<Button variant="ghost" size="icon" :title="t('letters.mailboxDialog.copy')" @click="copyAddress(row)">
									<Copy class="h-4 w-4" />
								</Button>
							</div>
							<span v-else class="text-muted-foreground">{{ t('letters.mailboxDialog.noMailbox') }}</span>
						</td>
						<td class="py-2 pr-2 text-center text-muted-foreground">
							<span v-if="row.letterCounts.pending" class="font-medium text-amber-600">{{ row.letterCounts.pending }}</span>
							<span v-else>0</span>
						</td>
						<td class="py-2 pr-2 text-center">
							<Switch
								:model-value="row.mailboxEnabled"
								@update:model-value="(value: boolean) => emit('toggle', row, value)"
							/>
						</td>
						<td class="py-2">
							<Button
								variant="ghost"
								size="icon"
								:title="t('letters.share.title')"
								@click="emit('share', [row])"
							>
								<Share2 class="h-4 w-4" />
							</Button>
						</td>
					</tr>
				</tbody>
			</table>

			<DialogFooter>
				<Button variant="outline" @click="emit('share', filtered)">
					<Share2 class="mr-2 h-4 w-4" />
					{{ t('letters.share.openBulk') }}
				</Button>
				<Button variant="outline" @click="close">{{ t('common.close') }}</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
