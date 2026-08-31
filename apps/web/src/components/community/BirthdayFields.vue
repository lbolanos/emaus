<template>
  <div class="space-y-2">
    <Label :for="`${idPrefix}-day`">
      Cumpleaños
      <span v-if="optionalHint" class="text-xs font-normal text-muted-foreground">(opcional)</span>
    </Label>

    <div class="flex gap-2">
      <Select :model-value="day" @update:model-value="onDayChange">
        <SelectTrigger :id="`${idPrefix}-day`" class="w-24">
          <SelectValue placeholder="Día" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="d in dayOptions" :key="d" :value="d">{{ Number(d) }}</SelectItem>
        </SelectContent>
      </Select>

      <Select :model-value="month" @update:model-value="onMonthChange">
        <SelectTrigger :id="`${idPrefix}-month`" class="flex-1">
          <SelectValue placeholder="Mes" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="(name, index) in monthNames" :key="name" :value="pad(index + 1)">
            {{ name }}
          </SelectItem>
        </SelectContent>
      </Select>

      <Input
        :id="`${idPrefix}-year`"
        :model-value="year"
        class="w-28"
        inputmode="numeric"
        maxlength="4"
        placeholder="Año"
        @update:model-value="onYearChange"
      />
    </div>

    <p v-if="validationError" class="text-xs text-red-600">{{ validationError }}</p>
    <p v-else class="text-xs text-muted-foreground">{{ helpText }}</p>

    <button
      v-if="day || month || year"
      type="button"
      class="text-xs text-muted-foreground underline hover:text-foreground"
      @click="clear"
    >
      Quitar fecha
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * Captura de cumpleaños con el año opcional — mucha gente sabe el día y el mes
 * de un miembro pero no el año, y exigirlo hunde la cobertura de captura.
 *
 * Emite el formato canónico que entiende el backend: `'YYYY-MM-DD'` si hay año,
 * `'MM-DD'` si no, y `''` para "sin fecha" / limpiar. Un `<input type="date">`
 * no sirve aquí: obliga a poner año.
 */
import { computed, ref, watch } from 'vue';
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import { normalizeBirthdayValue, splitBirthdayValue } from '@repo/utils';

interface Props {
  /** Valor canónico: 'YYYY-MM-DD', 'MM-DD' o '' */
  modelValue: string;
  /** Prefijo para los `id` de los controles, único por formulario. */
  idPrefix?: string;
  /** Muestra el sufijo "(opcional)" junto a la etiqueta. */
  optionalHint?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  idPrefix: 'birthday',
  optionalHint: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  /** true mientras lo tecleado no forme una fecha válida. */
  'update:invalid': [value: boolean];
}>();

const monthNames = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const pad = (n: number): string => String(n).padStart(2, '0');
const dayOptions = Array.from({ length: 31 }, (_, i) => pad(i + 1));

const day = ref('');
const month = ref('');
const year = ref('');

// Carga inicial y resincronización cuando el padre cambia el valor (p.ej. al
// abrir el diálogo con otro miembro).
watch(
  () => props.modelValue,
  (value) => {
    const parsed = splitBirthdayValue(value);
    if (!parsed.monthDay) {
      day.value = '';
      month.value = '';
      year.value = '';
      return;
    }
    month.value = parsed.monthDay.slice(0, 2);
    day.value = parsed.monthDay.slice(3);
    year.value = parsed.year == null ? '' : String(parsed.year);
  },
  { immediate: true },
);

const currentYear = new Date().getFullYear();

/** Lo tecleado, en formato canónico — sin garantía de ser válido todavía. */
const candidate = computed(() => {
  if (!day.value || !month.value) return '';
  const monthDay = `${month.value}-${day.value}`;
  return year.value ? `${year.value}-${monthDay}` : monthDay;
});

const validationError = computed(() => {
  if (!day.value && !month.value && !year.value) return null;
  if (!day.value || !month.value) return 'Elige el día y el mes.';
  if (year.value) {
    const parsedYear = Number(year.value);
    if (year.value.length !== 4 || Number.isNaN(parsedYear)) {
      return 'El año debe tener 4 dígitos.';
    }
    if (parsedYear < 1900 || parsedYear > currentYear) {
      return `El año debe estar entre 1900 y ${currentYear}.`;
    }
  }
  if (!normalizeBirthdayValue(candidate.value)) {
    return `El ${Number(day.value)} de ${monthNames[Number(month.value) - 1]} no existe.`;
  }
  return null;
});

const helpText = computed(() =>
  year.value ? 'El año solo lo ve el coordinador.' : 'Si no sabes el año, déjalo en blanco.',
);

// Emitir solo valores que el backend pueda guardar. Mientras la fecha esté a
// medias o sea imposible, el padre recibe '' y el aviso de invalidez, para que
// pueda bloquear el guardado en vez de mandar un 400.
const emitValue = () => {
  const invalid = validationError.value !== null;
  emit('update:invalid', invalid);
  emit('update:modelValue', invalid ? '' : candidate.value);
};

const onDayChange = (value: unknown) => {
  day.value = typeof value === 'string' ? value : '';
  emitValue();
};

const onMonthChange = (value: unknown) => {
  month.value = typeof value === 'string' ? value : '';
  emitValue();
};

// `Input` de @repo/ui expone `modelValue`, no `value`: lleva un v-model interno
// que pisaría cualquier `:value` suelto. Se normaliza a dígitos aquí y el hijo
// se resincroniza con el prop.
const onYearChange = (value: string | number) => {
  year.value = String(value ?? '').replace(/\D/g, '').slice(0, 4);
  emitValue();
};

const clear = () => {
  day.value = '';
  month.value = '';
  year.value = '';
  emit('update:invalid', false);
  emit('update:modelValue', '');
};
</script>
