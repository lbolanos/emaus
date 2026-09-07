<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Cake class="h-5 w-5 text-amber-600" />
          {{ t('participants.birthdays.title') }}
        </DialogTitle>
        <DialogDescription>
          {{
            birthdays.length > 0
              ? t('participants.birthdays.summary', { count: birthdays.length })
              : t('participants.birthdays.empty')
          }}
        </DialogDescription>
      </DialogHeader>

      <ul v-if="birthdays.length > 0" class="divide-y max-h-[60vh] overflow-y-auto">
        <li
          v-for="entry in birthdays"
          :key="entry.participant.id"
          class="py-2.5 flex items-baseline justify-between gap-3"
        >
          <div class="min-w-0">
            <p class="font-medium truncate">
              {{ entry.participant.firstName }} {{ entry.participant.lastName }}
              <span v-if="displayNickname(entry.participant)" class="text-muted-foreground font-normal">
                ({{ displayNickname(entry.participant) }})
              </span>
            </p>
            <p class="text-sm text-muted-foreground">
              {{ t('participants.birthdays.turningAge', { age: entry.turningAge }) }}
            </p>
          </div>
          <span class="text-sm text-amber-700 whitespace-nowrap shrink-0">{{ formatDay(entry.date) }}</span>
        </li>
      </ul>

      <DialogFooter>
        <Button type="button" variant="outline" @click="emit('update:open', false)">
          {{ t('common.close') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
/**
 * Listado de los caminantes que cumplen años durante el retiro.
 *
 * Reemplaza al toast que saltaba solo al entrar a Caminantes: ese se cerraba
 * sin dejar rastro y, con más de dos nombres, se leía como un párrafo. Aquí la
 * información se consulta cuando hace falta —al preparar el pastel o la
 * felicitación— y se ve quién, qué edad cumple y qué día del retiro le toca.
 */
import { useI18n } from 'vue-i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@repo/ui';
import { Cake } from 'lucide-vue-next';
import { isMeaninglessNickname } from '@/utils/participant';
import type { RetreatBirthday } from '@/utils/retreatBirthdays';

interface BirthdayParticipant {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  nickname?: string | null;
}

defineProps<{
  open: boolean;
  birthdays: RetreatBirthday<BirthdayParticipant>[];
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const { t, locale } = useI18n();

function displayNickname(participant: BirthdayParticipant): string {
  return isMeaninglessNickname(participant.nickname) ? '' : (participant.nickname ?? '').trim();
}

/** La fecha ya viene como Date local, así que se formatea sin tocar la zona. */
function formatDay(date: Date): string {
  return date.toLocaleDateString(locale.value, { weekday: 'long', day: 'numeric', month: 'long' });
}
</script>
