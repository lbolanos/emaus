<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[420px]">
      <DialogHeader>
        <DialogTitle>Cumpleaños de {{ memberName || 'el miembro' }}</DialogTitle>
        <DialogDescription>
          Con el día y el mes basta para felicitarle. El año es opcional y solo
          lo ve el responsable de la comunidad.
        </DialogDescription>
      </DialogHeader>

      <form @submit.prevent="submit" class="space-y-4">
        <BirthdayFields
          id-prefix="member-birthday-quick"
          :model-value="birthDate"
          @update:model-value="birthDate = $event"
          @update:invalid="isInvalid = $event"
        />

        <p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>

        <DialogFooter>
          <Button type="button" variant="outline" :disabled="isSaving" @click="emit('update:open', false)">
            Cancelar
          </Button>
          <Button type="submit" :disabled="isSaving || isInvalid || !hasChanged">
            {{ isSaving ? 'Guardando…' : 'Guardar' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
/**
 * Captura rápida del cumpleaños de un miembro.
 *
 * Existe aparte del diálogo de "Editar datos" porque aquel es owner-only: toca
 * el correo, y un co-admin podría rerutear las notificaciones de la comunidad
 * cambiándolo. Un cumpleaños no redirige nada, así que este va por su propio
 * endpoint y cualquier coordinador puede usarlo — que es lo que hace viable
 * llenar las fechas que faltan sin que dependa de una sola persona.
 */
import { computed, ref, watch } from 'vue';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  useToast,
} from '@repo/ui';
import BirthdayFields from './BirthdayFields.vue';
import { updateCommunityMemberBirthday } from '@/services/api';

interface Props {
  open: boolean;
  communityId: string;
  memberId: string | null;
  memberName?: string | null;
  /** 'MM-DD' del cumpleaños actual, tal como lo devuelve el API. */
  birthdayMonthDay?: string | null;
  /** Año, solo presente si el usuario es owner. */
  birthdayYear?: number | null;
}

const props = withDefaults(defineProps<Props>(), {
  memberName: '',
  birthdayMonthDay: null,
  birthdayYear: null,
});

const emit = defineEmits<{
  'update:open': [value: boolean];
  saved: [member: any];
}>();

const { toast } = useToast();

const birthDate = ref('');
const initial = ref('');
const isInvalid = ref(false);
const isSaving = ref(false);
const errorMessage = ref<string | null>(null);

const hasChanged = computed(() => birthDate.value !== initial.value);

watch(
  () => [props.open, props.memberId],
  () => {
    if (!props.open) return;
    // El API entrega el cumpleaños ya resuelto y partido; aquí se recompone al
    // formato canónico que entiende el campo.
    const value = props.birthdayMonthDay
      ? props.birthdayYear
        ? `${props.birthdayYear}-${props.birthdayMonthDay}`
        : props.birthdayMonthDay
      : '';
    birthDate.value = value;
    initial.value = value;
    isInvalid.value = false;
    errorMessage.value = null;
  },
  { immediate: true },
);

const submit = async () => {
  if (!props.memberId || isInvalid.value || !hasChanged.value) return;
  isSaving.value = true;
  errorMessage.value = null;
  try {
    const updated = await updateCommunityMemberBirthday(
      props.communityId,
      props.memberId,
      birthDate.value,
    );
    emit('saved', updated);
    emit('update:open', false);
    toast({ title: birthDate.value ? 'Cumpleaños guardado' : 'Cumpleaños borrado' });
  } catch (err: any) {
    errorMessage.value =
      err?.response?.data?.message || err?.message || 'No se pudo guardar el cumpleaños';
  } finally {
    isSaving.value = false;
  }
};
</script>
