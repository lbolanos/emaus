<template>
  <Popover v-model:open="popoverOpen">
    <!-- Desktop: la pastilla misma abre el detalle al hacer clic.
         Móvil: el toque sobre la pastilla se reserva para tap-to-assign,
         así que ahí el detalle se abre con el botón ⓘ. -->
    <span class="inline-flex items-center gap-1 md:gap-0.5" @click="onPillClick">
      <slot />
      <PopoverTrigger as-child>
        <button
          type="button"
          class="inline-flex items-center justify-center h-5 w-5 rounded-full opacity-70 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-colors shrink-0 md:w-0 md:h-0 md:p-0 md:opacity-0 md:overflow-hidden md:pointer-events-none"
          :title="$t('tables.detail.info')"
          :aria-label="$t('tables.detail.info')"
          draggable="false"
          @click.stop
          @pointerdown.stop
          @mousedown.stop
          @touchend.stop
          @dragstart.stop.prevent
        >
          <Info class="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
    </span>
    <PopoverContent
      side="top"
      align="start"
      class="w-72 max-w-[90vw] max-h-[70vh] overflow-y-auto text-sm"
      @pointerdown.stop
      @click.stop
    >
      <div class="space-y-3">
        <!-- Encabezado -->
        <div>
          <div v-if="enriched.id_on_retreat" class="text-xs font-semibold text-muted-foreground">
            # {{ enriched.id_on_retreat }}
          </div>
          <div class="font-semibold leading-tight">
            {{ enriched.firstName }} {{ enriched.lastName }}
          </div>
          <div v-if="enriched.nickname" class="text-xs text-muted-foreground">
            "{{ enriched.nickname }}"
          </div>
        </div>

        <!-- Tags -->
        <div v-if="participantTags.length" class="flex flex-wrap gap-1">
          <TagBadge v-for="pt in participantTags" :key="pt.id" :tag="pt.tag!" :removable="false" />
        </div>

        <!-- Teléfonos del participante -->
        <div v-if="ownPhones.length" class="space-y-1">
          <div class="text-xs font-medium text-muted-foreground">{{ $t('tables.detail.phones') }}</div>
          <a
            v-for="ph in ownPhones"
            :key="ph.label"
            :href="`tel:${ph.value}`"
            class="block text-primary hover:underline"
          >
            <span class="text-muted-foreground">{{ ph.label }}:</span> {{ ph.value }}
          </a>
        </div>

        <!-- Datos varios (lo del mouseover) -->
        <div class="space-y-0.5 text-xs text-muted-foreground">
          <div v-if="bedLocation">{{ $t('tables.tableCard.bedLocation') }}: {{ bedLocation }}</div>
          <div v-if="enriched.parish">{{ $t('tables.tableCard.parish') }}: {{ enriched.parish }}</div>
          <div v-if="enriched.email">
            {{ $t('tables.tableCard.email') }}:
            <a :href="`mailto:${enriched.email}`" class="text-primary hover:underline">{{ enriched.email }}</a>
          </div>
        </div>

        <!-- Invitador -->
        <div v-if="hasInviterInfo" class="space-y-1 border-t pt-2">
          <div class="text-xs font-medium text-muted-foreground">{{ $t('tables.detail.inviter') }}</div>
          <div v-if="enriched.invitedBy" class="font-medium">{{ enriched.invitedBy }}</div>
          <div v-if="enriched.isInvitedByEmausMember != null" class="text-xs text-muted-foreground">
            {{ $t('tables.tableCard.emausMember') }}
            {{ enriched.isInvitedByEmausMember ? $t('common.yes') : $t('common.no') }}
          </div>
          <a
            v-for="ph in inviterPhones"
            :key="ph.label"
            :href="`tel:${ph.value}`"
            class="block text-primary hover:underline"
          >
            <span class="text-muted-foreground">{{ ph.label }}:</span> {{ ph.value }}
          </a>
          <div v-if="enriched.inviterEmail" class="text-xs">
            <a :href="`mailto:${enriched.inviterEmail}`" class="text-primary hover:underline">{{ enriched.inviterEmail }}</a>
          </div>
        </div>

        <!-- Botón mandar mensaje -->
        <Button
          variant="outline"
          size="sm"
          class="w-full"
          @click="onSendMessage"
        >
          <MessageCircle class="w-4 h-4 mr-2" />
          {{ $t('tables.detail.sendMessage') }}
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { Participant, ParticipantTag } from '@repo/types';
import { Popover, PopoverContent, PopoverTrigger, Button } from '@repo/ui';
import { Info, MessageCircle } from 'lucide-vue-next';
import TagBadge from '@/components/TagBadge.vue';
import { useParticipantStore } from '@/stores/participantStore';
import { useParticipantMessageDialog } from '@/composables/useParticipantMessageDialog';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  participant: Participant;
}>();

const { t } = useI18n();
const participantStore = useParticipantStore();
const { open: openMessageDialog } = useParticipantMessageDialog();

const popoverOpen = ref(false);

// En desktop (md+, sin tap-to-assign) el clic sobre la pastilla abre el detalle.
// En móvil el toque se reserva para asignar a la mesa, así que ahí se usa el botón ⓘ.
const isDesktop = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(min-width: 768px)').matches;

// Distinguir clic simple (abrir detalle) de doble clic (desasignar de la mesa):
// retrasamos la apertura ~200 ms y la cancelamos si llega un segundo clic.
let clickTimer: ReturnType<typeof setTimeout> | null = null;
const onPillClick = () => {
  if (!isDesktop()) return;
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
    return;
  }
  clickTimer = setTimeout(() => {
    popoverOpen.value = true;
    clickTimer = null;
  }, 200);
};

// El payload de la vista de mesas no trae tags ni overlay del invitador para los
// participantes asignados; el participantStore (que carga TODO el retiro vía
// GET /participants) sí. Buscamos el enriquecido por id, con fallback a la pastilla.
const enriched = computed<Participant>(
  () => participantStore.participants.find((p) => p.id === props.participant.id) ?? props.participant,
);

const participantTags = computed<ParticipantTag[]>(
  () => (enriched.value.tags ?? []).filter((pt) => !!pt.tag),
);

// Ignora valores placeholder ("-", " ", etc.) que no contienen ningún dígito,
// para no renderizar enlaces `tel:-` inservibles.
const hasDigits = (v?: string | null): v is string => !!v && /\d/.test(v);

const buildPhones = (cell?: string | null, home?: string | null, work?: string | null) => {
  const phones: Array<{ label: string; value: string }> = [];
  if (hasDigits(cell)) phones.push({ label: t('tables.detail.cell'), value: cell });
  if (hasDigits(home)) phones.push({ label: t('tables.detail.home'), value: home });
  if (hasDigits(work)) phones.push({ label: t('tables.detail.work'), value: work });
  return phones;
};

const ownPhones = computed(() =>
  buildPhones(enriched.value.cellPhone, enriched.value.homePhone, enriched.value.workPhone),
);

const inviterPhones = computed(() =>
  buildPhones(
    enriched.value.inviterCellPhone,
    enriched.value.inviterHomePhone,
    enriched.value.inviterWorkPhone,
  ),
);

// Solo mostramos la sección "Invitador" si hay datos sustantivos del invitador.
// El flag `isInvitedByEmausMember` por sí solo (típico en servidores) no la dispara,
// para no mostrar un "Invitador → Emaús? No" sin nombre ni contacto.
const hasInviterInfo = computed(
  () =>
    !!enriched.value.invitedBy ||
    inviterPhones.value.length > 0 ||
    !!enriched.value.inviterEmail,
);

const bedLocation = computed(() => {
  const bed = enriched.value.retreatBed;
  if (!bed) return null;
  const floor = bed.floor !== undefined && bed.floor !== null ? bed.floor : '-';
  const room = bed.roomNumber || '-';
  const bedNum = bed.bedNumber || '-';
  return `${floor}-${room}-${bedNum}`;
});

const onSendMessage = () => {
  // Cerrar el popover ANTES de abrir el Dialog para evitar dejar pointer-events:none
  // huérfano en <body> (bug reka-ui Popover/Dropdown → Dialog).
  popoverOpen.value = false;
  const target = enriched.value;
  nextTick(() => openMessageDialog(target));
};
</script>
