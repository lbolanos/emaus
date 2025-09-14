<template>
  <div class="space-y-4">
    <Card v-for="responsability in responsibilities" :key="responsability.id" class="p-4">
      <CardHeader>
        <div class="flex justify-between items-start">
          <div>
            <CardTitle>{{ responsability.name }}</CardTitle>
            <CardDescription v-if="responsability.description">{{ responsability.description }}</CardDescription>
          </div>
          <div class="flex gap-2">
            <Button variant="outline" size="sm" @click="$emit('edit-responsability', responsability)">
              {{ $t('common.edit') }}
            </Button>
            <Button variant="destructive" size="sm" @click="$emit('delete-responsability', responsability.id)">
              {{ $t('common.delete') }}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div v-if="responsability.participant" class="mt-4">
          <h4 class="font-semibold mb-2">{{ $t('responsibilities.assignedParticipant') }}</h4>
          <Badge variant="secondary">
            {{ responsability.participant.firstName }} {{ responsability.participant.lastName }}
          </Badge>
        </div>
        <div v-else class="mt-4">
          <Select @update:model-value="(participantId: string) => $emit('assign-responsability', { responsabilityId: responsability.id, participantId })">
            <SelectTrigger>
              <SelectValue :placeholder="$t('responsibilities.selectParticipantPlaceholder')" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem v-for="participant in availableParticipants" :key="participant.id" :value="participant.id">
                {{ participant.firstName }} {{ participant.lastName }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { defineProps, defineEmits } from 'vue';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';
import type { Responsability } from '@repo/types';
import type { Participant } from '@repo/types';

defineProps<{
  responsibilities: Responsability[];
  availableParticipants: Participant[];
}>();

defineEmits<{
  'assign-responsability': [{ responsabilityId: string, participantId: string }];
  'edit-responsability': [responsability: Responsability];
  'delete-responsability': [responsabilityId: string];
}>();
</script>