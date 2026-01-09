<template>
  <div class="space-y-4">
    <!-- Date and Time -->
    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-2">
        <Label for="date">
          Fecha <span class="text-red-500">*</span>
        </Label>
        <Input
          id="date"
          type="date"
          :model-value="date"
          @update:model-value="$emit('update:date', $event)"
          :class="{ 'border-red-500': hasError('date') }"
        />
        <p v-if="hasError('date')" class="text-sm text-red-500">{{ getError('date') }}</p>
      </div>

      <div class="space-y-2">
        <Label for="time">
          Hora <span class="text-red-500">*</span>
        </Label>
        <Input
          id="time"
          type="time"
          :model-value="time"
          @update:model-value="$emit('update:time', $event)"
          :class="{ 'border-red-500': hasError('time') }"
        />
        <p v-if="hasError('time')" class="text-sm text-red-500">{{ getError('time') }}</p>
      </div>
    </div>

    <!-- Duration (only for meetings) -->
    <div v-if="!isAnnouncement" class="space-y-3">
      <div class="flex items-center justify-between">
        <Label for="duration">
          Duración (minutos) <span class="text-red-500">*</span>
        </Label>
        <div class="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            @click="$emit('update:durationMinutes', 30)"
          >30 min</Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            @click="$emit('update:durationMinutes', 60)"
          >60 min</Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            @click="$emit('update:durationMinutes', 90)"
          >90 min</Button>
        </div>
      </div>
      <Input
        id="duration"
        type="number"
        :model-value="durationMinutes"
        @update:model-value="$emit('update:durationMinutes', $event)"
        min="5"
        max="480"
        placeholder="60"
        :class="{ 'border-red-500': hasError('durationMinutes') }"
      />
      <p v-if="hasError('durationMinutes')" class="text-sm text-red-500">{{ getError('durationMinutes') }}</p>
      <p class="text-xs text-muted-foreground">Duración estimada de la reunión</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Label, Input, Button } from '@repo/ui';

const props = defineProps<{
  date: string;
  time: string;
  durationMinutes: number;
  isAnnouncement: boolean;
  errors: Record<string, string>;
}>();

defineEmits<{
  'update:date': [value: string];
  'update:time': [value: string];
  'update:durationMinutes': [value: number];
}>();

const hasError = (field: string) => {
  return !!props.errors[field];
};

const getError = (field: string) => {
  return props.errors[field] || '';
};
</script>
