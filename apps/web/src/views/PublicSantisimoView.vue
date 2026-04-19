<template>
  <div class="min-h-screen bg-gray-50 flex flex-col">
    <header class="bg-gray-900 text-white py-4 px-6 shadow">
      <div class="max-w-5xl mx-auto">
        <h1 class="text-xl font-semibold flex items-center gap-2">
          <span>✝</span>
          {{ t('santisimo.publicHeading') }}
        </h1>
        <p v-if="schedule" class="text-sm text-gray-300">
          {{ schedule.retreat.parish }}
        </p>
      </div>
    </header>

    <main class="flex-1 max-w-5xl mx-auto w-full p-4 md:p-6">
      <div v-if="loading" class="text-gray-500 text-center py-12">
        {{ t('common.loading') }}
      </div>
      <div v-else-if="loadError" class="border border-red-200 bg-red-50 text-red-700 rounded p-4">
        {{ loadError }}
      </div>

      <div v-else-if="successCancelTokens.length > 0" class="border border-green-200 bg-green-50 rounded p-6 space-y-3">
        <h2 class="text-lg font-semibold text-green-800">{{ t('santisimo.successTitle') }}</h2>
        <p class="text-sm text-green-700">{{ t('santisimo.successBody') }}</p>
        <ul class="text-xs font-mono text-green-900 space-y-1 break-all">
          <li v-for="tok in successCancelTokens" :key="tok">
            <a :href="`${origin}/santisimo/${slug}?cancel=${tok}`" class="underline">
              {{ `${origin}/santisimo/${slug}?cancel=${tok}` }}
            </a>
          </li>
        </ul>
        <Button variant="outline" @click="resetFlow">{{ t('santisimo.signupAgain') }}</Button>
      </div>

      <template v-else-if="schedule">
        <div v-if="!columns.length" class="text-center text-gray-600 py-12">
          {{ t('santisimo.noSlotsPublic') }}
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            v-for="(col, idx) in columns"
            :key="idx"
            class="border rounded bg-white overflow-hidden shadow-sm"
          >
            <div class="bg-gray-800 text-white text-center py-2 font-semibold uppercase text-sm">
              {{ col.label }}
            </div>
            <div
              v-for="slot in col.slots"
              :key="slot.id"
              class="border-t px-3 py-2 text-sm"
              :class="slotRowClass(slot)"
            >
              <div class="flex items-center gap-2">
                <input
                  type="checkbox"
                  :id="`slot-${slot.id}`"
                  :disabled="isSlotLocked(slot)"
                  :checked="selectedIds.includes(slot.id)"
                  @change="toggleSlot(slot.id)"
                />
                <label :for="`slot-${slot.id}`" class="flex-1 cursor-pointer">
                  <div class="font-mono">{{ formatSlotRange(slot.startTime, slot.endTime) }}</div>
                  <div v-if="slot.intention" class="text-xs text-gray-500">{{ slot.intention }}</div>
                </label>
                <span v-if="slot.isDisabled" class="text-xs italic text-gray-400">
                  {{ t('santisimo.notRequired') }}
                </span>
                <span v-else-if="slot.signedUpCount >= slot.capacity" class="text-xs text-red-600 font-medium">
                  {{ t('santisimo.full') }}
                </span>
                <span v-else class="text-xs text-gray-500">
                  {{ slot.signedUpCount }} / {{ slot.capacity }}
                </span>
              </div>
              <div v-if="slot.signups.length" class="mt-1 pl-6 text-xs text-gray-600">
                {{ slot.signups.map((s) => s.firstName).join(', ') }}
              </div>
            </div>
          </div>
        </div>

        <form
          v-if="columns.length"
          class="mt-6 bg-white border rounded p-4 md:p-6 space-y-4 shadow-sm"
          @submit.prevent="submitSignup"
        >
          <h2 class="text-lg font-semibold">{{ t('santisimo.signupHeading') }}</h2>
          <p class="text-sm text-gray-500">{{ t('santisimo.signupHint') }}</p>

          <div v-if="selectedIds.length === 0" class="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            {{ t('santisimo.selectAtLeastOne') }}
          </div>

          <div>
            <label class="text-sm font-medium">{{ t('santisimo.name') }} *</label>
            <Input v-model="form.name" required />
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="text-sm font-medium">{{ t('santisimo.phone') }}</label>
              <Input v-model="form.phone" />
            </div>
            <div>
              <label class="text-sm font-medium">{{ t('santisimo.email') }}</label>
              <Input type="email" v-model="form.email" />
            </div>
          </div>

          <div v-if="submitError" class="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {{ submitError }}
          </div>

          <Button type="submit" :disabled="submitting || selectedIds.length === 0 || !form.name.trim()">
            {{ submitting ? t('common.loading') : t('santisimo.signUpButton') }}
          </Button>
        </form>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { Button, Input } from '@repo/ui';
import { santisimoApi, type PublicSantisimoSchedule, type PublicSantisimoSlot } from '@/services/api';
import { getRecaptchaToken, RECAPTCHA_ACTIONS } from '@/services/recaptcha';

const { t } = useI18n();
const route = useRoute();

const slug = computed(() => route.params.slug as string);
const origin = computed(() => (typeof window !== 'undefined' ? window.location.origin : ''));

const schedule = ref<PublicSantisimoSchedule | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);

const selectedIds = ref<string[]>([]);
const form = ref({ name: '', phone: '', email: '' });
const submitting = ref(false);
const submitError = ref<string | null>(null);
const successCancelTokens = ref<string[]>([]);

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    schedule.value = await santisimoApi.publicGetSchedule(slug.value);
  } catch (e: any) {
    if (e?.response?.status === 404) {
      loadError.value = t('santisimo.retreatNotFound');
    } else {
      loadError.value = e?.message || 'Error';
    }
  } finally {
    loading.value = false;
  }
}

async function maybeCancelFromQuery() {
  const token = route.query.cancel as string | undefined;
  if (!token) return;
  try {
    await santisimoApi.publicCancel(token);
    if (window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete('cancel');
      window.history.replaceState({}, '', url.toString());
    }
    alert(t('santisimo.cancelSuccess'));
  } catch {
    alert(t('santisimo.cancelFailure'));
  }
}

const columns = computed(() => {
  if (!schedule.value) return [] as Array<{ label: string; slots: PublicSantisimoSlot[] }>;
  const buckets: Record<string, PublicSantisimoSlot[]> = {};
  for (const s of schedule.value.slots) {
    const key = localDayKey(s.startTime);
    (buckets[key] ??= []).push(s);
  }
  return Object.keys(buckets)
    .sort()
    .map((k) => ({ label: formatDayLabel(k), slots: buckets[k] }));
});

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

function isSlotLocked(slot: PublicSantisimoSlot): boolean {
  if (slot.isDisabled) return true;
  if (slot.signedUpCount >= slot.capacity) return true;
  const now = Date.now();
  if (new Date(slot.endTime).getTime() < now) return true;
  return false;
}

function slotRowClass(slot: PublicSantisimoSlot) {
  if (slot.isDisabled) return 'bg-gray-50 text-gray-400';
  if (slot.signedUpCount >= slot.capacity) return 'bg-red-50';
  return '';
}

function toggleSlot(id: string) {
  const idx = selectedIds.value.indexOf(id);
  if (idx >= 0) selectedIds.value.splice(idx, 1);
  else selectedIds.value.push(id);
}

async function submitSignup() {
  if (!selectedIds.value.length || !form.value.name.trim()) return;
  submitting.value = true;
  submitError.value = null;
  try {
    const recaptchaToken = await getRecaptchaToken(RECAPTCHA_ACTIONS.SANTISIMO_SIGNUP);
    const res = await santisimoApi.publicSignUp(slug.value, {
      slotIds: selectedIds.value,
      name: form.value.name.trim(),
      phone: form.value.phone.trim() || undefined,
      email: form.value.email.trim() || undefined,
      recaptchaToken,
    });
    successCancelTokens.value = res.signups
      .map((s) => s.cancelToken)
      .filter((t): t is string => !!t);
    selectedIds.value = [];
    form.value = { name: '', phone: '', email: '' };
  } catch (e: any) {
    submitError.value =
      e?.response?.data?.message || e?.message || t('santisimo.submitFailure');
    await load();
  } finally {
    submitting.value = false;
  }
}

function resetFlow() {
  successCancelTokens.value = [];
  load();
}

onMounted(async () => {
  await maybeCancelFromQuery();
  await load();
});
</script>
