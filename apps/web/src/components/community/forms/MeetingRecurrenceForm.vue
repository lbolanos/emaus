<template>
  <div class="space-y-4">
    <!-- Recurrence Toggle -->
    <div class="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
      <div class="flex-1">
        <Label class="font-medium">{{ $t('community.meeting.recurrence.title') }}</Label>
        <p class="text-sm text-muted-foreground">{{ $t('community.meeting.recurrence.description') }}</p>
      </div>
      <div class="flex items-center gap-2 ml-4">
        <span class="text-sm">{{ isRecurring ? 'Recurrente' : 'Única' }}</span>
        <Switch :model-value="isRecurring" @update:model-value="$emit('update:isRecurring', $event)" />
      </div>
    </div>

    <!-- Recurrence Options -->
    <div v-if="isRecurring" class="space-y-4 p-4 border rounded-lg bg-muted/30">
      <!-- Frequency -->
      <div class="space-y-2">
        <Label>{{ $t('community.meeting.recurrence.frequency') }}</Label>
        <Select :model-value="recurrence.frequency" @update:model-value="$emit('update:frequency', $event)">
          <SelectTrigger>
            <SelectValue :placeholder="$t('community.meeting.recurrence.frequency')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">{{ $t('community.meeting.recurrence.daily') }}</SelectItem>
            <SelectItem value="weekly">{{ $t('community.meeting.recurrence.weekly') }}</SelectItem>
            <SelectItem value="monthly">{{ $t('community.meeting.recurrence.monthly') }}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Weekly Options -->
      <div v-if="recurrence.frequency === 'weekly'" class="space-y-3">
        <div class="flex items-center gap-2">
          <Label>{{ $t('community.meeting.recurrence.every') }}</Label>
          <Input
            type="number"
            :model-value="recurrence.interval"
            @update:model-value="$emit('update:interval', $event)"
            min="1"
            max="52"
            class="w-20"
          />
          <Label>{{ $t('community.meeting.recurrence.weeks') }}</Label>
        </div>
        <div>
          <Label>{{ $t('community.meeting.recurrence.dayOfWeek') }}</Label>
          <div class="flex gap-1 mt-2">
            <Button
              v-for="day in weekDays"
              :key="day.value"
              type="button"
              :variant="recurrence.dayOfWeek === day.value ? 'default' : 'outline'"
              size="sm"
              @click="$emit('update:dayOfWeek', day.value)"
            >
              {{ day.label }}
            </Button>
          </div>
        </div>
      </div>

      <!-- Monthly Options -->
      <div v-if="recurrence.frequency === 'monthly'" class="space-y-2">
        <Label>{{ $t('community.meeting.recurrence.dayOfMonth') }}</Label>
        <Input
          type="number"
          :model-value="recurrence.dayOfMonth"
          @update:model-value="$emit('update:dayOfMonth', $event)"
          min="1"
          max="31"
          placeholder="1-31"
        />
      </div>

      <!-- End Date (optional) -->
      <div class="space-y-2">
        <Label>{{ $t('community.meeting.recurrence.endDate') }}</Label>
        <Input
          type="date"
          :model-value="recurrence.endDate ?? ''"
          @update:model-value="$emit('update:endDate', $event ? String($event) : null)"
          :min="recurrenceEndDateMin"
        />
        <p class="text-xs text-muted-foreground">
          {{ $t('community.meeting.recurrence.endDateHelp') }}
        </p>
      </div>

      <!-- Preview -->
      <div class="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
        <p class="text-sm text-blue-800 dark:text-blue-200">
          {{ recurrenceDescription }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Label, Switch, Button, Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@repo/ui';
import type { RecurrenceFrequency } from '@repo/types';

const weekDays = [
  { value: 'monday', label: 'Lun' },
  { value: 'tuesday', label: 'Mar' },
  { value: 'wednesday', label: 'Mié' },
  { value: 'thursday', label: 'Jue' },
  { value: 'friday', label: 'Vie' },
  { value: 'saturday', label: 'Sáb' },
  { value: 'sunday', label: 'Dom' },
];

interface RecurrenceData {
  frequency: RecurrenceFrequency;
  interval: number;
  dayOfWeek: string;
  dayOfMonth: number | null;
  endDate?: string | null;
}

const props = defineProps<{
  isRecurring: boolean;
  recurrence: RecurrenceData;
  /** Fecha de inicio de la reunión (YYYY-MM-DD) usada como mínimo para endDate. */
  startDate?: string;
}>();

defineEmits<{
  'update:isRecurring': [value: boolean];
  'update:frequency': [value: RecurrenceFrequency];
  'update:interval': [value: number];
  'update:dayOfWeek': [value: string];
  'update:dayOfMonth': [value: number | null];
  'update:endDate': [value: string | null];
}>();

const recurrenceEndDateMin = computed(() => {
  // endDate no puede ser anterior a la fecha de inicio. Si no hay startDate aún,
  // usar hoy.
  if (props.startDate) return props.startDate;
  return new Date().toISOString().slice(0, 10);
});

const recurrenceDescription = computed(() => {
  const { frequency, interval, dayOfWeek, dayOfMonth, endDate } = props.recurrence;
  let base = '';

  switch (frequency) {
    case 'daily':
      base = 'Esta reunión se repetirá diariamente';
      break;
    case 'weekly': {
      const dayLabel = weekDays.find((d) => d.value === dayOfWeek)?.label || '';
      base =
        interval === 1
          ? `Esta reunión se repetirá cada semana el ${dayLabel}`
          : `Esta reunión se repetirá cada ${interval} semanas el ${dayLabel}`;
      break;
    }
    case 'monthly':
      base = `Esta reunión se repetirá cada mes el día ${dayOfMonth}`;
      break;
    default:
      return '';
  }

  if (endDate) {
    return `${base} hasta el ${endDate}`;
  }
  return base;
});
</script>
