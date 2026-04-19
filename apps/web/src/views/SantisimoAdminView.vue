<template>
  <div class="p-4 md:p-6 space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-2xl font-semibold">{{ t('santisimo.title') }}</h1>
        <p class="text-sm text-gray-500">{{ t('santisimo.subtitle') }}</p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <div class="flex items-center gap-2 border rounded px-3 py-1.5">
          <input
            id="santisimo-enabled"
            type="checkbox"
            :checked="retreat?.santisimoEnabled ?? false"
            @change="toggleSantisimoEnabled"
          />
          <label for="santisimo-enabled" class="text-sm cursor-pointer">
            {{ t('santisimo.enable') }}
          </label>
        </div>
        <Button variant="outline" size="sm" @click="copyPublicLink" :disabled="!canCopyLink">
          <Link2 class="w-4 h-4 mr-1" />{{ t('santisimo.copyPublicLink') }}
        </Button>
        <Button variant="outline" size="sm" @click="printView">
          <Printer class="w-4 h-4 mr-1" />{{ t('santisimo.print') }}
        </Button>
        <Button size="sm" @click="openGenerate">
          <Plus class="w-4 h-4 mr-1" />{{ t('santisimo.generate') }}
        </Button>
      </div>
    </div>

    <div v-if="loading" class="text-gray-500">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="text-red-600">{{ error }}</div>

    <div v-else-if="slots.length === 0" class="border-dashed border rounded p-6 text-center text-gray-600">
      {{ t('santisimo.noSlots') }}
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4 print:grid-cols-3 print:gap-2">
      <div
        v-for="(col, idx) in columns"
        :key="idx"
        class="border rounded overflow-hidden"
      >
        <div class="bg-gray-900 text-white text-center py-2 font-semibold uppercase text-sm">
          {{ col.label }}
        </div>
        <div
          v-for="slot in col.slots"
          :key="slot.id"
          class="border-t px-2 py-1 text-sm"
          :class="slot.isDisabled ? 'bg-gray-100 text-gray-500' : ''"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="font-mono">{{ formatSlotRange(slot.startTime, slot.endTime) }}</div>
            <div class="flex items-center gap-1 print:hidden">
              <button
                class="text-xs text-blue-600 hover:underline"
                @click="openSignupForm(slot)"
                v-if="!slot.isDisabled && (slot.signedUpCount < slot.capacity)"
              >{{ t('santisimo.addName') }}</button>
              <button
                class="text-xs text-gray-500 hover:underline"
                @click="toggleDisabled(slot)"
              >
                {{ slot.isDisabled ? t('santisimo.enableSlot') : t('santisimo.disableSlot') }}
              </button>
              <button class="text-xs text-red-600 hover:underline" @click="deleteSlot(slot)">
                {{ t('common.delete') }}
              </button>
            </div>
          </div>
          <div v-if="slot.isDisabled" class="italic text-gray-400">
            {{ t('santisimo.notRequired') }}
          </div>
          <div v-else>
            <div v-if="slot.intention" class="text-xs text-gray-500">{{ slot.intention }}</div>
            <ul class="mt-1 space-y-0.5">
              <li v-for="signup in slot.signups" :key="signup.id" class="flex items-center justify-between">
                <span>{{ signup.name }}</span>
                <button
                  class="text-xs text-red-500 hover:underline print:hidden"
                  @click="removeSignup(signup.id)"
                >✕</button>
              </li>
              <li v-if="slot.signups.length === 0 && slot.capacity > 0" class="text-gray-400 italic">
                — {{ t('santisimo.empty') }} —
              </li>
            </ul>
            <div class="text-[10px] text-gray-400 print:hidden">
              {{ slot.signedUpCount }} / {{ slot.capacity }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Generate dialog -->
    <Dialog v-model:open="generateOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('santisimo.generate') }}</DialogTitle>
          <DialogDescription>{{ t('santisimo.generateHint') }}</DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <div>
            <label class="text-sm">{{ t('santisimo.startDateTime') }}</label>
            <Input type="datetime-local" v-model="genForm.start" />
          </div>
          <div>
            <label class="text-sm">{{ t('santisimo.endDateTime') }}</label>
            <Input type="datetime-local" v-model="genForm.end" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-sm">{{ t('santisimo.slotMinutes') }}</label>
              <Input type="number" min="15" max="240" v-model.number="genForm.slotMinutes" />
            </div>
            <div>
              <label class="text-sm">{{ t('santisimo.capacity') }}</label>
              <Input type="number" min="0" v-model.number="genForm.capacity" />
            </div>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <input id="clear-existing" type="checkbox" v-model="genForm.clearExisting" />
              <label for="clear-existing" class="text-sm cursor-pointer">
                {{ t('santisimo.clearExisting') }}
              </label>
            </div>
            <p class="text-xs text-gray-500 mt-1 ml-6">
              {{ t('santisimo.clearExistingHelp') }}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="generateOpen = false">{{ t('common.cancel') }}</Button>
          <Button @click="doGenerate">{{ t('santisimo.generate') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Signup dialog -->
    <Dialog v-model:open="signupOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('santisimo.addName') }}</DialogTitle>
          <DialogDescription v-if="signupSlot">
            {{ formatSlotRange(signupSlot.startTime, signupSlot.endTime) }}
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <div class="flex gap-1 border rounded p-0.5 bg-gray-50 text-xs">
            <button
              type="button"
              class="flex-1 px-2 py-1 rounded"
              :class="signupMode === 'server' ? 'bg-white shadow font-medium' : 'text-gray-600'"
              @click="switchMode('server')"
            >{{ t('santisimo.pickServer') }}</button>
            <button
              type="button"
              class="flex-1 px-2 py-1 rounded"
              :class="signupMode === 'angelito' ? 'bg-white shadow font-medium' : 'text-gray-600'"
              @click="switchMode('angelito')"
            >{{ t('santisimo.angelito') }}</button>
          </div>

          <template v-if="signupMode === 'server'">
            <div>
              <label class="text-sm">{{ t('santisimo.searchServer') }}</label>
              <Input v-model="serverSearch" :placeholder="t('santisimo.searchServerPlaceholder')" />
              <div v-if="serversLoading" class="text-xs text-gray-500 mt-1">{{ t('common.loading') }}</div>
              <ul
                v-else-if="filteredServers.length > 0"
                class="mt-1 border rounded max-h-48 overflow-y-auto bg-white divide-y"
              >
                <li
                  v-for="srv in filteredServers"
                  :key="srv.id"
                  class="px-3 py-2 cursor-pointer hover:bg-blue-50 flex items-center justify-between"
                  :class="selectedServerId === srv.id ? 'bg-blue-100' : ''"
                  @click="pickServer(srv)"
                >
                  <div>
                    <div class="text-sm font-medium">{{ srv.firstName }} {{ srv.lastName }}</div>
                    <div class="text-xs text-gray-500">{{ srv.cellPhone || '—' }}</div>
                  </div>
                  <span v-if="selectedServerId === srv.id" class="text-xs text-blue-700">✓</span>
                </li>
              </ul>
              <div v-else-if="serverSearch.trim()" class="text-xs text-gray-500 mt-1">
                {{ t('santisimo.noServerMatch') }}
              </div>
            </div>
          </template>

          <template v-else>
            <div>
              <label class="text-sm">{{ t('santisimo.name') }} *</label>
              <Input v-model="signupForm.name" :placeholder="t('santisimo.angelitoHint')" />
            </div>
            <div>
              <label class="text-sm">{{ t('santisimo.phone') }}</label>
              <Input v-model="signupForm.phone" />
            </div>
            <div>
              <label class="text-sm">{{ t('santisimo.email') }}</label>
              <Input type="email" v-model="signupForm.email" />
            </div>
          </template>

          <div v-if="signupMode === 'server' && signupForm.name" class="text-xs text-gray-600 bg-gray-50 rounded p-2">
            {{ t('santisimo.selectedServer') }}: <span class="font-medium">{{ signupForm.name }}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="signupOpen = false">{{ t('common.cancel') }}</Button>
          <Button @click="doAdminSignup" :disabled="!signupForm.name.trim()">{{ t('common.save') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useToast,
} from '@repo/ui';
import { Link2, Plus, Printer } from 'lucide-vue-next';
import { useRoute } from 'vue-router';
import { useSantisimoStore } from '@/stores/santisimoStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { api, type SantisimoSlotWithSignups } from '@/services/api';

interface ServerOption {
  id: string; // participant id
  userId?: string | null;
  firstName: string;
  lastName: string;
  cellPhone?: string | null;
  email?: string | null;
}

const { t } = useI18n();
const route = useRoute();
const { toast } = useToast();
const santisimoStore = useSantisimoStore();
const retreatStore = useRetreatStore();
const { slots, loading, error } = storeToRefs(santisimoStore);

const retreatId = computed(() => (route.params.id as string) || retreatStore.selectedRetreatId);
const retreat = computed(() =>
  retreatStore.retreats.find((r) => r.id === retreatId.value) ?? null,
);
const canCopyLink = computed(
  () => !!retreat.value?.slug && !!retreat.value?.isPublic && !!retreat.value?.santisimoEnabled,
);

const columns = computed(() => {
  const buckets: Record<string, SantisimoSlotWithSignups[]> = {};
  for (const s of slots.value) {
    const key = localDayKey(s.startTime);
    (buckets[key] ??= []).push(s);
  }
  const keys = Object.keys(buckets).sort();
  return keys.map((k) => ({
    label: formatDayLabel(k),
    slots: buckets[k],
  }));
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

// -- Generate dialog --
const generateOpen = ref(false);
const genForm = ref({
  start: '',
  end: '',
  slotMinutes: 60,
  capacity: 1,
  clearExisting: false,
});

function openGenerate() {
  const defaults = suggestedRange();
  genForm.value = {
    start: defaults.start,
    end: defaults.end,
    slotMinutes: 60,
    capacity: 1,
    clearExisting: false,
  };
  generateOpen.value = true;
}

function suggestedRange() {
  const r = retreat.value;
  if (!r) return { start: '', end: '' };
  return {
    start: atLocalHour(r.startDate, 17),
    end: atLocalHour(r.endDate, 13),
  };
}

// Build a local-time datetime-local string from a date value that may be
// either a Date or an ISO string like "2026-04-17". Parsing with new Date()
// for date-only strings treats them as UTC midnight, which shifts the day
// in negative-offset timezones (e.g. Mexico). We extract YYYY-MM-DD from
// the raw string first to keep the intended calendar day.
function atLocalHour(value: string | Date, hour: number): string {
  const raw = typeof value === 'string' ? value : value.toISOString();
  const datePart = raw.slice(0, 10); // YYYY-MM-DD
  const [y, m, d] = datePart.split('-').map((n) => parseInt(n, 10));
  const local = new Date(y, m - 1, d, hour, 0, 0, 0);
  return toLocalInput(local);
}
function toLocalInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function doGenerate() {
  if (!retreatId.value) return;
  try {
    await santisimoStore.generateSlots(retreatId.value, {
      startDateTime: new Date(genForm.value.start).toISOString(),
      endDateTime: new Date(genForm.value.end).toISOString(),
      slotMinutes: genForm.value.slotMinutes,
      capacity: genForm.value.capacity,
      clearExisting: genForm.value.clearExisting,
    });
    generateOpen.value = false;
    toast({ title: t('santisimo.generated') });
  } catch (e: any) {
    toast({ title: t('common.error'), description: e?.message, variant: 'destructive' });
  }
}

// -- Signup dialog --
const signupOpen = ref(false);
const signupSlot = ref<SantisimoSlotWithSignups | null>(null);
const signupForm = ref<{
  name: string;
  phone: string;
  email: string;
  userId: string | null;
}>({ name: '', phone: '', email: '', userId: null });

type SignupMode = 'server' | 'angelito';
const signupMode = ref<SignupMode>('server');
const serverSearch = ref('');
const selectedServerId = ref<string | null>(null);

const servers = ref<ServerOption[]>([]);
const serversLoading = ref(false);

async function loadServers() {
  if (!retreatId.value) return;
  if (servers.value.length > 0) return;
  serversLoading.value = true;
  try {
    const r = await api.get('/participants', {
      params: { retreatId: retreatId.value, type: 'server' },
    });
    servers.value = (r.data as any[])
      .filter((p) => !p.isCancelled)
      .map((p) => ({
        id: p.id,
        userId: p.userId ?? null,
        firstName: p.firstName ?? '',
        lastName: p.lastName ?? '',
        cellPhone: p.cellPhone ?? null,
        email: p.email ?? null,
      }))
      .sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'es'),
      );
  } catch (e: any) {
    if (e?.response?.status !== 403) {
      toast({
        title: t('common.error'),
        description: e?.response?.data?.message || e?.message,
        variant: 'destructive',
      });
    }
  } finally {
    serversLoading.value = false;
  }
}

const filteredServers = computed(() => {
  const q = serverSearch.value.trim().toLowerCase();
  if (!q) return servers.value.slice(0, 30);
  return servers.value
    .filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q))
    .slice(0, 30);
});

function openSignupForm(slot: SantisimoSlotWithSignups) {
  signupSlot.value = slot;
  signupForm.value = { name: '', phone: '', email: '', userId: null };
  signupMode.value = 'server';
  serverSearch.value = '';
  selectedServerId.value = null;
  signupOpen.value = true;
  loadServers();
}

function switchMode(mode: SignupMode) {
  signupMode.value = mode;
  signupForm.value = { name: '', phone: '', email: '', userId: null };
  selectedServerId.value = null;
  serverSearch.value = '';
}

function pickServer(srv: ServerOption) {
  selectedServerId.value = srv.id;
  signupForm.value = {
    name: `${srv.firstName} ${srv.lastName}`.trim(),
    phone: srv.cellPhone ?? '',
    email: srv.email ?? '',
    userId: srv.userId ?? null,
  };
}

async function doAdminSignup() {
  if (!signupSlot.value || !retreatId.value) return;
  try {
    await santisimoStore.adminCreateSignup(retreatId.value, {
      slotId: signupSlot.value.id,
      name: signupForm.value.name.trim(),
      phone: signupForm.value.phone.trim() || null,
      email: signupForm.value.email.trim() || null,
      userId: signupForm.value.userId || null,
    });
    signupOpen.value = false;
  } catch (e: any) {
    toast({
      title: t('common.error'),
      description: e?.response?.data?.message || e?.message,
      variant: 'destructive',
    });
  }
}

async function removeSignup(id: string) {
  if (!retreatId.value) return;
  if (!window.confirm(t('santisimo.confirmRemove'))) return;
  await santisimoStore.deleteSignup(retreatId.value, id);
}

async function toggleDisabled(slot: SantisimoSlotWithSignups) {
  await santisimoStore.updateSlot(slot.id, { isDisabled: !slot.isDisabled });
}

async function deleteSlot(slot: SantisimoSlotWithSignups) {
  if (!window.confirm(t('santisimo.confirmDeleteSlot'))) return;
  await santisimoStore.deleteSlot(slot.id);
}

async function toggleSantisimoEnabled() {
  if (!retreat.value) return;
  try {
    await retreatStore.updateRetreat({
      id: retreat.value.id,
      santisimoEnabled: !retreat.value.santisimoEnabled,
    } as any);
  } catch (e: any) {
    toast({
      title: t('common.error'),
      description: e?.response?.data?.message || e?.message,
      variant: 'destructive',
    });
  }
}

function copyPublicLink() {
  if (!retreat.value?.slug) return;
  const url = `${window.location.origin}/santisimo/${retreat.value.slug}`;
  navigator.clipboard
    .writeText(url)
    .then(() => toast({ title: t('santisimo.linkCopied'), description: url }));
}

function printView() {
  window.print();
}

watch(
  () => retreatId.value,
  async (id) => {
    if (id) await santisimoStore.fetchSlots(id);
  },
  { immediate: false },
);

onMounted(async () => {
  if (!retreatStore.retreats.length) {
    await retreatStore.fetchRetreats();
  }
  if (retreatId.value) {
    await santisimoStore.fetchSlots(retreatId.value);
  }
});
</script>

<style scoped>
@media print {
  :deep(aside),
  :deep(header) {
    display: none !important;
  }
}
</style>
