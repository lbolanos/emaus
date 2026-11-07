<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@repo/ui';
import { Copy, MessageCircle } from 'lucide-vue-next';
import { buildWhatsAppSendLink, toE164Phone } from '@/utils/phone';
import type { LetterMailboxRow } from '@/services/api';

/**
 * Difusión de la dirección de buzón (specs/letters-email D14): texto
 * autocontenido — SIN tocar el motor de plantillas global. Por participante:
 * Copiar y "Enviar por WhatsApp" (al teléfono del participante, donde el equipo
 * reenvía a la familia); masivo: copiar todas las direcciones para pegar en grupo.
 */
const props = defineProps<{
	open: boolean;
	retreatName: string;
	retreatId: string;
	rows: LetterMailboxRow[];
}>();

const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const { t } = useI18n();
const copiedIds = ref<Set<string>>(new Set());

const defaultMessage = computed(() =>
	t('letters.share.messageTemplate', {
		retreat: props.retreatName,
		participant: '{PARTICIPANT}',
		address: '{ADDRESS}',
		deadline: t('letters.share.defaultDeadline'),
	}),
);

const buildMessage = (row: LetterMailboxRow): string =>
	defaultMessage.value
		.replace('{PARTICIPANT}', row.participantName)
		.replace('{ADDRESS}', row.mailboxAddress ?? '');

const whatsappLink = (row: LetterMailboxRow): string | null => {
	if (!row.mailboxAddress) return null;
	return buildWhatsAppSendLink(row.cellPhone, buildMessage(row), 'MX');
};

const copyMessage = async (row: LetterMailboxRow) => {
	if (!row.mailboxAddress) return;
	await navigator.clipboard.writeText(buildMessage(row));
	markCopied(row.retreatParticipantId);
};

const markCopied = (id: string) => {
	copiedIds.value = new Set([...copiedIds.value, id]);
};

const copyAllAddresses = async () => {
	const withMailbox = props.rows.filter((row) => row.mailboxAddress);
	const lines = withMailbox.map(
		(row) => `${row.participantName}${row.tableName ? ` (${row.tableName})` : ''}: ${row.mailboxAddress}`,
	);
	await navigator.clipboard.writeText(lines.join('\n'));
	copiedIds.value = new Set(withMailbox.map((row) => row.retreatParticipantId));
};

const close = () => emit('update:open', false);

const canSend = (row: LetterMailboxRow): boolean => {
	if (!row.mailboxAddress || !row.cellPhone) return false;
	return toE164Phone(row.cellPhone, 'MX').length > 0;
};

const openWhatsApp = (row: LetterMailboxRow) => {
	const link = whatsappLink(row);
	if (link) window.open(link, '_blank');
};
</script>

<template>
	<Dialog :open="props.open" @update:open="emit('update:open', $event)">
		<DialogContent class="max-w-2xl max-h-[85vh] overflow-y-auto">
			<DialogHeader>
				<DialogTitle>{{ t('letters.share.title') }}</DialogTitle>
				<DialogDescription>{{ t('letters.share.description') }}</DialogDescription>
			</DialogHeader>

			<div class="flex justify-end mb-3">
				<Button variant="outline" size="sm" :disabled="props.rows.length === 0" @click="copyAllAddresses">
					<Copy class="mr-2 h-4 w-4" />
					{{ t('letters.share.copyAll') }}
				</Button>
			</div>

			<div class="space-y-3">
				<div v-if="props.rows.length === 0" class="py-8 text-center text-sm text-muted-foreground">
					{{ t('letters.share.empty') }}
				</div>
				<div
					v-for="row in props.rows"
					:key="row.retreatParticipantId"
					class="rounded-lg border p-3"
				>
					<div class="flex items-center justify-between gap-2 mb-2">
						<div>
							<span class="font-medium">{{ row.participantName }}</span>
							<span v-if="row.tableName" class="text-muted-foreground text-sm"> · {{ row.tableName }}</span>
						</div>
						<code v-if="row.mailboxAddress" class="text-xs bg-muted rounded px-1.5 py-0.5">{{ row.mailboxAddress }}</code>
						<span v-else class="text-muted-foreground text-sm">{{ t('letters.mailboxDialog.noMailbox') }}</span>
					</div>
					<div v-if="row.mailboxAddress" class="space-y-2">
						<!-- Preview del mensaje real que se copia/envía (item 8): sin copiar a ciegas -->
						<p
							class="text-sm text-muted-foreground whitespace-pre-wrap border rounded p-2 bg-muted/30"
							data-testid="share-message-preview"
						>
							{{ buildMessage(row) }}
						</p>
						<div class="flex flex-wrap gap-2">
							<Button variant="outline" size="sm" @click="copyMessage(row)">
								<Copy class="mr-2 h-4 w-4" />
								{{ copiedIds.has(row.retreatParticipantId) ? t('letters.share.copied') : t('letters.share.copy') }}
							</Button>
							<Button
								variant="outline"
								size="sm"
								:disabled="!canSend(row)"
								:title="canSend(row) ? '' : t('letters.share.noPhone')"
								@click="openWhatsApp(row)"
							>
								<MessageCircle class="mr-2 h-4 w-4" />
								{{ t('letters.share.whatsapp') }}
							</Button>
						</div>
					</div>
				</div>
			</div>

			<DialogFooter>
				<Button variant="outline" @click="close">{{ t('common.close') }}</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
