<template>
  <div class="min-h-screen bg-gray-50 flex flex-col">
    <header class="bg-gray-900 text-white py-4 px-6 shadow">
      <div class="max-w-5xl mx-auto">
        <h1 class="text-xl font-semibold flex items-center gap-2">
          <span>✝</span>
          {{ t('santisimo.serverInvite.heading') }}
        </h1>
        <p v-if="invite" class="text-sm text-gray-300">
          {{ invite.retreat.parish }}
        </p>
      </div>
    </header>

    <main class="flex-1 max-w-5xl mx-auto w-full p-4 md:p-6">
      <div v-if="loading" class="text-gray-500 text-center py-12">
        {{ t('common.loading') }}
      </div>

      <div
        v-else-if="loadError"
        class="border border-red-200 bg-red-50 text-red-700 rounded p-6 space-y-2"
        data-testid="santisimo-invite-error"
      >
        <p class="font-semibold">{{ t('santisimo.serverInvite.invalidLinkTitle') }}</p>
        <p>{{ loadError }}</p>
      </div>

      <template v-else-if="invite">
        <!-- Saludo + regla de un solo horario -->
        <div class="bg-white border rounded p-4 md:p-6 shadow-sm space-y-2">
          <h2 class="text-lg font-semibold">
            {{ t('santisimo.serverInvite.greeting', { name: greetingName }) }}
          </h2>
          <p class="text-sm text-gray-600">
            {{ t('santisimo.serverInvite.intro') }}
          </p>
          <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            {{ t('santisimo.serverInvite.personalNotice') }}
          </p>

          <p
            v-if="invite.current"
            class="text-sm text-green-800 bg-green-50 border border-green-200 rounded px-3 py-2"
            data-testid="santisimo-invite-current"
          >
            {{ t('santisimo.serverInvite.currentLabel') }}:
            <span class="font-mono font-semibold">
              {{ formatSlotRange(invite.current.startTime, invite.current.endTime) }}
            </span>
          </p>
        </div>

        <!-- Sin slots configurados todavía -->
        <div v-if="!columns.length" class="text-center text-gray-600 py-12">
          {{ t('santisimo.serverInvite.noSlots') }}
        </div>

        <!-- Columnas por día con radios (un solo horario) -->
        <div v-else class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            v-for="(col, idx) in columns"
            :key="idx"
            class="border rounded bg-white overflow-hidden shadow-sm"
          >
            <div class="bg-gray-800 text-white text-center py-2 font-semibold uppercase text-sm">
              {{ col.label }}
            </div>
            <label
              v-for="slot in col.slots"
              :key="slot.id"
              class="border-t px-3 py-2 text-sm block"
              :class="slotRowClass(slot)"
            >
              <span class="flex items-center gap-2">
                <input
                  type="radio"
                  name="santisimo-guardia-slot"
                  :value="slot.id"
                  v-model="selectedSlotId"
                  :disabled="!slot.selectable"
                  :data-testid="`santisimo-slot-${slot.id}`"
                />
                <span class="flex-1">
                  <span class="font-mono">{{ formatSlotRange(slot.startTime, slot.endTime) }}</span>
                  <span v-if="slot.intention" class="block text-xs text-gray-500">
                    {{ slot.intention }}
                  </span>
                </span>
                <span v-if="isCurrentSlot(slot)" class="text-xs font-medium text-green-700">
                  {{ t('santisimo.serverInvite.currentTag') }}
                </span>
                <span v-else-if="slot.isDisabled" class="text-xs italic text-gray-400">
                  {{ t('santisimo.notRequired') }}
                </span>
                <span
                  v-else-if="!slot.selectable"
                  class="text-xs text-red-600 font-medium"
                >
                  {{ t('santisimo.full') }}
                </span>
                <span v-else class="text-xs text-gray-500">
                  {{ slot.signedUpCount }} / {{ slot.capacity }}
                </span>
              </span>
              <span
                v-if="slot.mealWindow"
                class="mt-1 ml-6 inline-flex items-center gap-1 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-0.5"
                :data-testid="`santisimo-meal-${slot.id}`"
              >
                🍽 {{ t('santisimo.serverInvite.mealBadge') }}
              </span>
            </label>
          </div>
        </div>

        <!-- Acciones -->
        <form
          v-if="columns.length"
          class="mt-4 bg-white border rounded p-4 md:p-6 space-y-4 shadow-sm"
          @submit.prevent="save"
        >
          <div
            v-if="!selectedSlotId"
            class="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2"
          >
            {{ t('santisimo.serverInvite.selectHint') }}
          </div>

          <div
            v-if="successMessage"
            class="text-sm text-green-800 bg-green-50 border border-green-200 rounded px-3 py-2"
            data-testid="santisimo-invite-success"
          >
            {{ successMessage }}
          </div>
          <div
            v-if="submitError"
            class="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2"
            data-testid="santisimo-invite-submit-error"
          >
            {{ submitError }}
          </div>

          <div class="flex flex-wrap gap-3">
            <Button type="submit" :disabled="submitting || !selectedSlotId" data-testid="santisimo-invite-save">
              {{ submitting ? t('common.loading') : t('santisimo.serverInvite.save') }}
            </Button>
            <Button
              v-if="invite.current"
              type="button"
              variant="outline"
              :disabled="submitting"
              data-testid="santisimo-invite-cancel"
              @click="removeGuard"
            >
              {{ t('santisimo.serverInvite.remove') }}
            </Button>
          </div>
        </form>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@repo/ui';
import {
  santisimoApi,
  type PublicSantisimoInvite,
  type PublicSantisimoInviteSlot,
} from '@/services/api';

/**
 * Enlace personal cifrado `/santisimo/servidor/:token`
 * (specs/santisimo-guardia-links): un servidor elige UN horario de guardia
 * del Santísimo sin login. La identidad viene del token (cifrado
 * server-side); por eso no hay formulario de nombre ni reCAPTCHA.
 */
const props = defineProps<{ token: string }>();

const { t } = useI18n();

const invite = ref<PublicSantisimoInvite | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);

const selectedSlotId = ref<string | null>(null);
const submitting = ref(false);
const submitError = ref<string | null>(null);
const successMessage = ref<string | null>(null);

const greetingName = computed(
  () =>
    invite.value?.participant.firstName ||
    invite.value?.participant.fullName ||
    t('santisimo.serverInvite.greetingFallback'),
);

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    invite.value = await santisimoApi.getPublicInvite(props.token);
    selectedSlotId.value = invite.value.current?.slotId ?? null;
  } catch (e: any) {
    // 404 uniforme del backend: token inválido, retiro desactivado o
    // participante fuera. Al usuario le basta un mensaje único.
    loadError.value = t('santisimo.serverInvite.invalidLink');
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!selectedSlotId.value) return;
  submitting.value = true;
  submitError.value = null;
  successMessage.value = null;
  try {
    await santisimoApi.publicInviteSignup(props.token, selectedSlotId.value);
    successMessage.value = t('santisimo.serverInvite.saved');
    await load();
  } catch (e: any) {
    submitError.value = errorMessageFor(e);
    // El estado pudo moverse debajo (otro servidor tomó el cupo): refrescar
    // para que los radios reflejen la realidad.
    await load();
  } finally {
    submitting.value = false;
  }
}

async function removeGuard() {
  submitting.value = true;
  submitError.value = null;
  successMessage.value = null;
  try {
    await santisimoApi.publicInviteCancel(props.token);
    successMessage.value = t('santisimo.serverInvite.removed');
    await load();
  } catch (e: any) {
    submitError.value = errorMessageFor(e);
    await load();
  } finally {
    submitting.value = false;
  }
}

function errorMessageFor(e: any): string {
  const code = e?.response?.data?.error;
  if (code === 'CAPACITY') return t('santisimo.serverInvite.errorCapacity');
  if (code === 'DISABLED') return t('santisimo.serverInvite.errorDisabled');
  if (code === 'PAST') return t('santisimo.serverInvite.errorPast');
  return e?.response?.data?.message || t('santisimo.serverInvite.errorGeneric');
}

const columns = computed(() => {
  if (!invite.value) return [] as Array<{ label: string; slots: PublicSantisimoInviteSlot[] }>;
  const buckets: Record<string, PublicSantisimoInviteSlot[]> = {};
  for (const s of invite.value.slots) {
    const key = localDayKey(s.startTime);
    (buckets[key] ??= []).push(s);
  }
  return Object.keys(buckets)
    .sort()
    .map((k) => ({ label: formatDayLabel(k), slots: buckets[k] }));
});

function isCurrentSlot(slot: PublicSantisimoInviteSlot): boolean {
  return invite.value?.current?.slotId === slot.id;
}

function slotRowClass(slot: PublicSantisimoInviteSlot): string {
  if (isCurrentSlot(slot)) return 'bg-green-50';
  if (slot.isDisabled) return 'bg-gray-50 text-gray-400';
  if (!slot.selectable) return 'bg-red-50';
  return '';
}

// ── Formateo browser-local (consistente con PublicSantisimoView; la
// timezone del retiro está fuera de alcance de la spec) ────────────────────

function localDayKey(value: string | Date): string {
  const d = new Date(value);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
function formatDayLabel(isoDay: string): string {
  const [y, m, d] = isoDay.split('-').map((n) => parseInt(n, 10));
  const date = new Date(y, m - 1, d);
  return `${DAY_NAMES[date.getDay()]} ${d}/${m}`;
}

function formatSlotRange(start: string | Date, end: string | Date): string {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) => {
    let hh = d.getHours();
    const mm = d.getMinutes();
    const ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12 || 12;
    return mm === 0 ? `${hh} ${ampm}` : `${hh}:${mm.toString().padStart(2, '0')} ${ampm}`;
  };
  return `${fmt(s)} – ${fmt(e)}`;
}

onMounted(load);
</script>
