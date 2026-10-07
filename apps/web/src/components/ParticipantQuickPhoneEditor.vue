<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Pencil } from 'lucide-vue-next';
import { Button } from '@repo/ui';
import { validatePhoneForCountry, phoneValidationMessage } from '@repo/types';
import { useParticipantStore } from '@/stores/participantStore';
import { useAuthPermissions } from '@/composables/useAuthPermissions';
import type { QuickPhoneResult } from '@/services/api';

/**
 * Edición rápida de los 3 teléfonos que usa el flujo de palancas (celular del
 * caminante + los dos de contactos de emergencia), para corregir en 2 clicks el
 * número de quien llenó el registro. Popover manual (molde
 * PreRetreatTaskAssignInline: el Popover de reka-ui no se exporta de @repo/ui).
 *
 * El guardado va por participantStore.updateParticipantPhones (optimista +
 * rollback); al confirmar la fila ya quedó con los valores canónicos, así que
 * solo se emite `saved` para que la vista que lo hospeda refresque su copia
 * (p.ej. EditParticipantForm en M3).
 */
interface QuickPhoneParticipantLike {
  id: string;
  cellPhone?: string | null;
  emergencyContact1Name?: string | null;
  emergencyContact1CellPhone?: string | null;
  emergencyContact2Name?: string | null;
  emergencyContact2CellPhone?: string | null;
}

const props = defineProps<{
  participant: QuickPhoneParticipantLike;
  /** País de la casa del retiro ("México", "Colombia", …) para validar por país. */
  country?: string | null;
}>();

const emit = defineEmits<{ saved: [result: QuickPhoneResult] }>();

const { t } = useI18n();
const participantStore = useParticipantStore();
const { hasPermission } = useAuthPermissions();
// Sin participant:update no se renderiza el lápiz (solo ven el número).
const canEdit = computed(() => hasPermission('participant:update'));

const open = ref(false);
const saving = ref(false);
const root = ref<HTMLElement | null>(null);
const panelEl = ref<HTMLElement | null>(null);
const firstInput = ref<HTMLInputElement | null>(null);
const cellPhone = ref('');
const ec1Phone = ref('');
const ec2Phone = ref('');
// Errores por campo, calculados al intentar guardar (no en cada keystroke).
type PhoneFieldKey = 'cellPhone' | 'emergencyContact1CellPhone' | 'emergencyContact2CellPhone';
const noErrors = (): Record<PhoneFieldKey, string> => ({
  cellPhone: '',
  emergencyContact1CellPhone: '',
  emergencyContact2CellPhone: '',
});
const errors = ref<Record<PhoneFieldKey, string>>(noErrors());

function toggle() {
  open.value = !open.value;
  if (open.value) {
    // Seed al abrir (no en mount): la fila puede haber cambiado desde afuera.
    cellPhone.value = props.participant.cellPhone ?? '';
    ec1Phone.value = props.participant.emergencyContact1CellPhone ?? '';
    ec2Phone.value = props.participant.emergencyContact2CellPhone ?? '';
    errors.value = noErrors();
    nextTick(() => firstInput.value?.focus({ preventScroll: true }));
  }
}

const fields = computed(() => [
  {
    key: 'cellPhone' as const,
    model: cellPhone,
    label: t('participants.quickPhones.cellPhone'),
    clearable: false,
  },
  {
    key: 'emergencyContact1CellPhone' as const,
    model: ec1Phone,
    label: props.participant.emergencyContact1Name
      ? `${t('participants.quickPhones.emergencyContact1')} — ${props.participant.emergencyContact1Name}`
      : t('participants.quickPhones.emergencyContact1'),
    clearable: false,
  },
  {
    key: 'emergencyContact2CellPhone' as const,
    model: ec2Phone,
    label: props.participant.emergencyContact2Name
      ? `${t('participants.quickPhones.emergencyContact2')} — ${props.participant.emergencyContact2Name}`
      : t('participants.quickPhones.emergencyContact2'),
    clearable: true,
  },
]);

/** Payload con SOLO los campos que cambian respecto de la fila. */
const changes = computed(() => {
  const payload: Record<string, string> = {};
  const current: Record<string, string> = {
    cellPhone: props.participant.cellPhone ?? '',
    emergencyContact1CellPhone: props.participant.emergencyContact1CellPhone ?? '',
    emergencyContact2CellPhone: props.participant.emergencyContact2CellPhone ?? '',
  };
  const values: Record<string, string> = {
    cellPhone: cellPhone.value.trim(),
    emergencyContact1CellPhone: ec1Phone.value.trim(),
    emergencyContact2CellPhone: ec2Phone.value.trim(),
  };
  for (const key of Object.keys(values)) {
    if (values[key] !== current[key]) payload[key] = values[key];
  }
  return payload;
});

function validate(): boolean {
  errors.value = noErrors();
  for (const field of fields.value) {
    const value = field.model.value.trim();
    if (value === '') {
      // cellPhone y EC1 son NOT NULL y los usa el flujo de cartas: no se
      // pueden vaciar. EC2 sí (se limpia).
      if (!field.clearable) {
        errors.value[field.key] = t('participants.quickPhones.requiredEmpty');
      }
      continue;
    }
    const message = phoneValidationMessage(validatePhoneForCountry(value, props.country));
    if (message) errors.value[field.key] = message;
  }
  return Object.keys(errors.value).length === 0;
}

async function save() {
  if (saving.value) return;
  if (!validate()) return;
  if (Object.keys(changes.value).length === 0) {
    open.value = false;
    return;
  }
  saving.value = true;
  try {
    const result = await participantStore.updateParticipantPhones(props.participant.id, changes.value);
    if (result) emit('saved', result);
    open.value = false;
  } catch {
    // El store ya revirtió la fila y toast-eó el error; se deja el popover
    // abierto con los valores ingresados para corregir.
  } finally {
    saving.value = false;
  }
}

function onDocMouseDown(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('mousedown', onDocMouseDown);
  else document.removeEventListener('mousedown', onDocMouseDown);
});
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown));
</script>

<template>
  <span v-if="canEdit" ref="root" class="relative inline-flex">
    <button
      type="button"
      class="inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-blue-50 hover:text-blue-600"
      :title="t('participants.quickPhones.edit')"
      :aria-label="t('participants.quickPhones.edit')"
      @click.stop="toggle"
    >
      <Pencil class="h-3.5 w-3.5" />
    </button>

    <div
      v-if="open"
      ref="panelEl"
      class="absolute left-0 top-full z-50 mt-1 w-72 max-w-[calc(100vw-1rem)] rounded-md border border-gray-200 bg-white p-3 text-left shadow-lg"
      @click.stop
    >
      <p class="mb-2 text-sm font-semibold text-gray-700">
        {{ t('participants.quickPhones.title') }}
      </p>
      <div class="space-y-2">
        <div v-for="field in fields" :key="field.key">
          <label class="mb-0.5 block text-xs font-medium text-gray-600" :for="`qp-${field.key}`">
            {{ field.label }}
          </label>
          <input
            :id="`qp-${field.key}`"
            :ref="field.key === 'cellPhone' ? 'firstInput' : undefined"
            v-model="field.model.value"
            type="tel"
            inputmode="tel"
            class="w-full rounded border border-gray-300 px-2 py-1.5 text-base sm:text-sm outline-none focus:border-blue-400"
            :class="errors[field.key] ? 'border-red-400' : ''"
            @keydown.esc="open = false"
            @keydown.enter.prevent="save"
          />
          <p v-if="errors[field.key]" class="mt-0.5 text-xs text-red-600">
            {{ errors[field.key] }}
          </p>
        </div>
      </div>
      <div class="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" :disabled="saving" @click="open = false">
          {{ t('common.actions.cancel') }}
        </Button>
        <Button
          size="sm"
          :disabled="saving || Object.keys(changes).length === 0"
          @click="save"
        >
          {{ t('common.actions.save') }}
        </Button>
      </div>
    </div>
  </span>
</template>
