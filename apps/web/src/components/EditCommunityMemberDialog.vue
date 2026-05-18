<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>Editar datos del miembro</DialogTitle>
        <DialogDescription>
          Corrige nombre, apellido, correo o teléfono. Útil para miembros
          creados por el bot o importados con datos incompletos.
        </DialogDescription>
      </DialogHeader>

      <form v-if="member" @submit.prevent="submit" class="space-y-4">
        <div class="space-y-2">
          <Label for="firstName">Nombre <span class="text-red-500">*</span></Label>
          <Input
            id="firstName"
            v-model="form.firstName"
            placeholder="Juan Carlos"
            autocomplete="given-name"
            required
          />
        </div>

        <div class="space-y-2">
          <Label for="lastName">Apellido</Label>
          <Input
            id="lastName"
            v-model="form.lastName"
            placeholder="Pérez García"
            autocomplete="family-name"
          />
        </div>

        <div class="space-y-2">
          <Label for="email">Correo electrónico</Label>
          <Input
            id="email"
            v-model="form.email"
            type="email"
            placeholder="juan@example.com"
            autocomplete="email"
          />
          <p
            v-if="isPlaceholderEmail"
            class="text-xs text-amber-600"
          >
            Correo placeholder generado al crear el miembro solo con teléfono. Cámbialo cuando tengas el real.
          </p>
        </div>

        <div class="space-y-2">
          <Label for="cellPhone">Teléfono móvil</Label>
          <Input
            id="cellPhone"
            v-model="form.cellPhone"
            type="tel"
            placeholder="5551234567"
            autocomplete="tel"
          />
        </div>

        <div v-if="errorMessage" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {{ errorMessage }}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            @click="emit('update:open', false)"
            :disabled="isSaving"
          >
            Cancelar
          </Button>
          <Button type="submit" :disabled="isSaving || !form.firstName.trim()">
            {{ isSaving ? 'Guardando…' : 'Guardar cambios' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Label,
  useToast,
} from '@repo/ui';
import { useCommunityStore } from '@/stores/communityStore';
import { resolveMemberProfile } from '@repo/utils';
import type { CommunityMember } from '@repo/types';

interface Props {
  open: boolean;
  member: CommunityMember | null;
  communityId: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:open': [value: boolean];
  saved: [updated: CommunityMember];
}>();

const communityStore = useCommunityStore();
const { toast } = useToast();

const form = ref({
  firstName: '',
  lastName: '',
  email: '',
  cellPhone: '',
});
const isSaving = ref(false);
const errorMessage = ref<string | null>(null);

// Detecta el patrón de email placeholder generado por bulkAddMembers
// cuando el bot solo conoce el teléfono (`phone-XXX@placeholder.local`).
// Lo marcamos visualmente para que el coordinador sepa que debe corregirlo.
const isPlaceholderEmail = computed(() =>
  /@placeholder\.local$/i.test(form.value.email || ''),
);

// Carga inicial cuando se abre el diálogo o cambia el miembro. Mostramos
// el perfil efectivo (overlay > participant) para que el usuario edite
// sobre lo que actualmente ve en la UI.
watch(
  () => [props.open, props.member?.id],
  () => {
    if (!props.open || !props.member) return;
    const profile = resolveMemberProfile(props.member);
    form.value = {
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      cellPhone: profile.cellPhone,
    };
    errorMessage.value = null;
  },
  { immediate: true },
);

const submit = async () => {
  if (!props.member) return;
  if (!form.value.firstName.trim()) {
    errorMessage.value = 'El nombre no puede quedar vacío';
    return;
  }

  isSaving.value = true;
  errorMessage.value = null;
  try {
    // Diff contra el perfil efectivo actual. Si el usuario "limpia" un
    // campo (queda vacío), mandamos string vacío explícito — el backend
    // lo persiste como NULL (limpia el overlay y vuelve a heredar del
    // participant).
    const current = resolveMemberProfile(props.member);
    const payload: any = {};
    if (current.firstName !== form.value.firstName.trim()) {
      payload.firstName = form.value.firstName.trim();
    }
    if (current.lastName !== form.value.lastName.trim()) {
      payload.lastName = form.value.lastName.trim();
    }
    if (current.email !== form.value.email.trim()) {
      payload.email = form.value.email.trim();
    }
    if (current.cellPhone !== form.value.cellPhone.trim()) {
      payload.cellPhone = form.value.cellPhone.trim();
    }

    if (Object.keys(payload).length === 0) {
      emit('update:open', false);
      return;
    }

    const updated = await communityStore.updateMemberProfile(
      props.communityId,
      props.member.id,
      payload,
    );
    toast({
      title: 'Datos actualizados',
      description: 'Los cambios se guardaron correctamente.',
    });
    if (updated) emit('saved', updated as CommunityMember);
    emit('update:open', false);
  } catch (err: any) {
    // Mensajes específicos del backend
    const code = err?.response?.data?.code;
    if (code === 'EMAIL_DUPLICATE_IN_COMMUNITY') {
      errorMessage.value =
        'Ya existe otro miembro de esta comunidad con ese correo. Verifica si es la misma persona o usa otro correo.';
    } else {
      errorMessage.value =
        err?.response?.data?.message || err?.message || 'No se pudieron guardar los cambios';
    }
  } finally {
    isSaving.value = false;
  }
};
</script>
