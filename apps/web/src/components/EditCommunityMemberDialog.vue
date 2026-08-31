<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <!-- max-h + scroll: con el campo de cumpleaños el formulario ya no cabe
         entero en pantallas bajas (portátiles, móvil apaisado) y el encabezado
         quedaba fuera de vista. Mismo patrón que MeetingFormModal. -->
    <DialogContent class="sm:max-w-[480px] max-h-[90vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <DialogTitle>Editar datos del miembro</DialogTitle>
        <DialogDescription>
          Corrige nombre, apellido, correo o teléfono. Útil para miembros
          creados por el bot o importados con datos incompletos.
        </DialogDescription>
      </DialogHeader>

      <form v-if="member" @submit.prevent="submit" class="space-y-4 flex-1 overflow-y-auto pr-1">
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

        <BirthdayFields
          id-prefix="member-birthday"
          :model-value="form.birthDate"
          @update:model-value="form.birthDate = $event"
          @update:invalid="birthdayInvalid = $event"
        />

        <div class="space-y-2">
          <Label for="joinedAt">Fecha de ingreso</Label>
          <Input
            id="joinedAt"
            v-model="form.joinedAt"
            type="date"
          />
          <p class="text-xs text-muted-foreground">
            Desde esta fecha cuentan las reuniones para su tasa de asistencia.
          </p>
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
          <Button type="submit" :disabled="isSaving || !form.firstName.trim() || birthdayInvalid">
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
import BirthdayFields from '@/components/community/BirthdayFields.vue';
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
  birthDate: '',
  joinedAt: '',
});
// El hijo avisa cuando lo tecleado no forma una fecha real (31 de febrero);
// mientras tanto, bloqueamos el guardado en vez de mandar un 400.
const birthdayInvalid = ref(false);
// Valor original del cumpleaños para enviar solo si cambió.
const initialBirthDate = ref('');
// Valor original de joinedAt (YYYY-MM-DD) para enviar solo si cambió.
const initialJoinedAt = ref('');
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
    // joinedAt en formato YYYY-MM-DD (UTC) para el <input type="date">. Usar UTC
    // en ambos lados (lectura y guardado) evita el off-by-one por zona horaria.
    const joined = (props.member as any).joinedAt;
    const joinedStr = joined ? new Date(joined).toISOString().slice(0, 10) : '';
    // El cumpleaños llega ya resuelto por el backend (`birthdayMonthDay` +
    // `birthdayYear`), que aplica el fallback al participant y descarta el
    // relleno automático del alta. Se recompone al formato canónico que el
    // campo y el endpoint manejan.
    const monthDay = (props.member as any).birthdayMonthDay as string | null;
    const birthYear = (props.member as any).birthdayYear as number | null;
    const birthStr = monthDay ? (birthYear ? `${birthYear}-${monthDay}` : monthDay) : '';

    form.value = {
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      cellPhone: profile.cellPhone,
      birthDate: birthStr,
      joinedAt: joinedStr,
    };
    initialJoinedAt.value = joinedStr;
    initialBirthDate.value = birthStr;
    birthdayInvalid.value = false;
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
  if (birthdayInvalid.value) {
    errorMessage.value = 'Revisa la fecha de cumpleaños';
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
    // Cumpleaños: enviar si cambió, incluido el vaciado (string vacío = limpiar).
    if (form.value.birthDate !== initialBirthDate.value) {
      payload.birthDate = form.value.birthDate;
    }
    // joinedAt: enviar solo si cambió y no quedó vacío.
    if (form.value.joinedAt && form.value.joinedAt !== initialJoinedAt.value) {
      payload.joinedAt = form.value.joinedAt;
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
    if (code === 'INVALID_BIRTH_DATE') {
      errorMessage.value = 'La fecha de cumpleaños no existe en el calendario.';
    } else if (code === 'EMAIL_DUPLICATE_IN_COMMUNITY') {
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
