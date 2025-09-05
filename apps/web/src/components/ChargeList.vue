<template>
  <div class="space-y-4">
    <Card v-for="charge in charges" :key="charge.id" class="p-4">
      <CardHeader>
        <div class="flex justify-between items-start">
          <div>
            <CardTitle>{{ charge.name }}</CardTitle>
            <CardDescription v-if="charge.description">{{ charge.description }}</CardDescription>
          </div>
          <div class="flex gap-2">
            <Button variant="outline" size="sm" @click="$emit('edit-charge', charge)">
              {{ $t('common.edit') }}
            </Button>
            <Button variant="destructive" size="sm" @click="$emit('delete-charge', charge.id)">
              {{ $t('common.delete') }}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div v-if="charge.participant" class="mt-4">
          <h4 class="font-semibold mb-2">{{ $t('charges.assignedParticipant') }}</h4>
          <Badge variant="secondary">
            {{ charge.participant.firstName }} {{ charge.participant.lastName }}
          </Badge>
        </div>
        <div v-else class="mt-4">
          <Select @update:model-value="participantId => $emit('assign-charge', { chargeId: charge.id, participantId })">
            <SelectTrigger>
              <SelectValue :placeholder="$t('charges.selectParticipantPlaceholder')" />
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
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@repo/ui/components/ui/card';
import { Button } from '@repo/ui/components/ui/button';
import { Badge } from '@repo/ui/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/ui/select';
import type { Charge } from '@repo/types/retreat';
import type { Participant } from '@repo/types';

defineProps<{
  charges: Charge[];
  availableParticipants: Participant[];
}>();

defineEmits<{
  'assign-charge': [{ chargeId: number, participantId: number }];
  'edit-charge': [charge: Charge];
  'delete-charge': [chargeId: number];
}>();
</script>