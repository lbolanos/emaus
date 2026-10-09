<template>
  <Popover v-model:open="popoverOpen">
    <!-- variant 'icon': botón ⓘ suelto, visible en TODOS los breakpoints.
         Para filas sin pastilla (bandeja de WhatsApp): el trigger de reka-ui
         abre/cierra solo — no hay gracia de doble clic ni slot que envolver. -->
    <PopoverTrigger v-if="variant === 'icon'" as-child>
      <button
        type="button"
        class="inline-flex items-center justify-center h-8 w-8 rounded-md text-gray-500 hover:text-gray-700 hover:bg-black/10 dark:hover:bg-white/10 transition-colors shrink-0"
        :title="$t('sequences.participantDetail')"
        :aria-label="$t('sequences.participantDetail')"
        draggable="false"
        @click.stop
        @pointerdown.stop
        @mousedown.stop
        @touchend.stop
      >
        <Info class="w-4 h-4" />
      </button>
    </PopoverTrigger>
    <!-- variant 'pill' (default): desktop abre el detalle al hacer clic en la
         pastilla; móvil reserva el toque para tap-to-assign (botón ⓘ). -->
    <span v-else class="inline-flex items-center gap-1 md:gap-0.5" @click="onPillClick">
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

        <!-- Cartas / palancas (v1.1: del roster del store, sin fetch) -->
        <div v-if="hasPalancasInfo" class="space-y-1 border-t pt-2">
          <div class="text-xs font-medium text-muted-foreground">{{ $t('tables.detail.palancas') }}</div>
          <div class="text-xs space-y-0.5">
            <div>
              <span class="text-muted-foreground">{{ $t('tables.detail.palancasRequested') }}:</span>
              {{ enriched.palancasRequested == null ? '—' : (enriched.palancasRequested ? $t('common.yes') : $t('common.no')) }}
              <template v-if="enriched.palancasReceivedCount != null">
                <span class="text-muted-foreground">· {{ $t('tables.detail.palancasReceived') }}:</span>
                {{ enriched.palancasReceivedCount }}
              </template>
            </div>
            <div v-if="enriched.palancasCoordinator" class="text-muted-foreground">
              {{ $t('tables.detail.palancasCoordinator') }}: {{ enriched.palancasCoordinator }}
            </div>
            <div v-if="enriched.palancasNotes" class="text-muted-foreground">{{ enriched.palancasNotes }}</div>
          </div>
        </div>

        <!-- Seguimiento: última etapa del hilo CRM + saldo (v1.1) -->
        <div v-if="lastStage || balance" class="space-y-1 border-t pt-2">
          <div class="text-xs font-medium text-muted-foreground">{{ $t('tables.detail.followUp') }}</div>
          <div v-if="lastStage" class="text-xs">
            {{ lastStage.title }}
            <span class="text-muted-foreground">· {{ fmtInsightDate(lastStage.at) }}</span>
          </div>
          <div v-if="balance" class="text-xs text-red-600">
            {{ $t('tables.detail.balance') }}: {{ balance }}
          </div>
        </div>

        <!-- Asistencia a reuniones de la comunidad. Sólo aparece si la vista
             que abre el popover la pasa; ausente = sin dato, no 0%. -->
        <div v-if="attendance" class="space-y-1 border-t pt-2">
          <div class="text-xs font-medium text-muted-foreground">
            {{ $t('tables.attendance.title') }}
          </div>
          <div class="font-medium">
            {{ Math.round(attendance.ratePercent) }}%
            <span class="text-xs text-muted-foreground font-normal">
              ({{ attendance.attended }}/{{ attendance.total }})
            </span>
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

        <!-- Notas recientes y últimos enviados (timeline CRM, fetch al abrir) -->
        <div v-if="insightsLoading && !insightEvents.length" class="space-y-1 border-t pt-2 text-xs text-muted-foreground">
          {{ $t('common.loading') }}…
        </div>
        <div v-else-if="insightsError && !timelineNotes.length && !recentMessages.length" class="space-y-1 border-t pt-2 text-xs text-muted-foreground">
          {{ $t('tables.detail.insightsError') }}
        </div>
        <template v-else>
          <div v-if="timelineNotes.length" class="space-y-1.5 border-t pt-2">
            <div class="text-xs font-medium text-muted-foreground">{{ $t('tables.detail.recentNotes') }}</div>
            <div v-for="n in timelineNotes" :key="n.id" class="text-xs">
              <div class="whitespace-pre-wrap">{{ n.detail || n.title }}</div>
              <div class="text-muted-foreground">
                {{ insightByline(n) }}
              </div>
            </div>
          </div>
          <div v-if="recentMessages.length" class="space-y-1 border-t pt-2">
            <div class="text-xs font-medium text-muted-foreground">{{ $t('tables.detail.recentMessages') }}</div>
            <div v-for="m in recentMessages" :key="m.id" class="text-xs flex items-baseline justify-between gap-2">
              <span class="truncate">
                {{ (m.meta?.templateName as string) || m.title }}
                <span v-if="m.contactName && m.contactKey !== 'participant'" class="text-muted-foreground">
                  → {{ m.contactName }}
                </span>
              </span>
              <span class="text-muted-foreground shrink-0">{{ fmtInsightDate(m.at) }}</span>
            </div>
          </div>
        </template>

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
import { computed, nextTick, ref, watch } from 'vue';
import type { Participant, ParticipantTag, TimelineEvent } from '@repo/types';
import { formatCurrency } from '@repo/utils';
import { Popover, PopoverContent, PopoverTrigger, Button } from '@repo/ui';
import { Info, MessageCircle } from 'lucide-vue-next';
import TagBadge from '@/components/TagBadge.vue';
import { useParticipantStore } from '@/stores/participantStore';
import { useParticipantMessageDialog } from '@/composables/useParticipantMessageDialog';
import { useParticipantInsights } from '@/composables/useParticipantInsights';
import { useI18n } from 'vue-i18n';
import type { ServerAttendanceState } from '@/composables/useServerAttendance';

const props = withDefaults(defineProps<{
  participant: Participant;
  /**
   * Asistencia a reuniones de la comunidad, cuando la vista la tiene. Se omite
   * a propósito en el resto de las pantallas: el dato vive en la comunidad y
   * sólo existe si el retiro está vinculado a una.
   */
  attendance?: ServerAttendanceState | null;
  /**
   * Forma del disparador: 'pill' envuelve el slot (vista de mesas, con
   * tap-to-assign); 'icon' renderiza un botón ⓘ suelto, siempre visible, para
   * filas sin pastilla (bandeja de WhatsApp de secuencias).
   */
  variant?: 'pill' | 'icon';
  /**
   * Retiro del participante para el fetch del timeline CRM (notas/enviados).
   * Opcional: si no se pasa, cae al `retreatId` del propio participante.
   */
  retreatId?: string | null;
}>(), {
  variant: 'pill',
});

const { t } = useI18n();
const participantStore = useParticipantStore();
const attendance = computed(() => props.attendance ?? null);
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

// --- Contexto "vivo" (v1.1): palancas/seguimiento/saldo del store, notas y
// enviados del timeline CRM. Fetch-on-open (D9): sólo al abrir el popover.
// Refs top-level del composable (no el objeto plano): sólo éstas se
// desempaquetan en el template — `insights.loading` ahí sería la Ref (truthy
// siempre) y la rama de "cargando…" ganaría incluso con datos ya cargados.
const {
  loading: insightsLoading,
  error: insightsError,
  events: insightEvents,
  load: loadInsights,
} = useParticipantInsights();
const effectiveRetreatId = computed(
  () => props.retreatId ?? enriched.value.retreatId ?? null,
);
watch(popoverOpen, (open) => {
  if (open) loadInsights(effectiveRetreatId.value, enriched.value.id);
});

const hasPalancasInfo = computed(
  () =>
    enriched.value.palancasRequested != null ||
    enriched.value.palancasReceivedCount != null ||
    !!enriched.value.palancasReceived ||
    !!enriched.value.palancasNotes ||
    !!enriched.value.palancasCoordinator,
);

// El timeline ya viene ordenado DESC por fecha (crmService.getParticipantTimeline).
const timelineNotes = computed(() =>
  insightEvents.value.filter((e) => e.type === 'note').slice(0, 3),
);
const recentMessages = computed(() =>
  insightEvents.value.filter((e) => e.type === 'message').slice(0, 3),
);
const lastStage = computed(
  () => insightEvents.value.find((e) => e.type === 'stage_change') ?? null,
);

// `paymentRemaining` es un getter del backend que viaja en el payload del
// listado (no está en el schema `Participant` del shared types).
const balance = computed(() => {
  const raw = (enriched.value as Participant & { paymentRemaining?: number | string | null })
    .paymentRemaining;
  const remaining = Number(raw ?? 0);
  return Number.isFinite(remaining) && remaining > 0 ? formatCurrency(remaining) : null;
});

const fmtInsightDate = (at: TimelineEvent['at']) => {
  if (!at) return '';
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
};
const insightByline = (e: TimelineEvent) =>
  [e.actorName, fmtInsightDate(e.at)].filter(Boolean).join(' · ');

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
