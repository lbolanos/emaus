<template>
  <div class="flex items-center gap-0.5">
    <!-- Mensaje -->
    <Tooltip>
      <TooltipTrigger as-child>
        <Button variant="ghost" size="icon" aria-label="Mensajes" @click="emit('message')">
          <MessageSquare class="w-4 h-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Mensajes</p>
      </TooltipContent>
    </Tooltip>

    <!-- Everything else lives in the ⋮ menu: the row only keeps Mensajes (spec
         community-attendance-faces FR-26). Items that open a Dialog go through deferOpen so
         no orphan pointer-events is left on <body>. -->
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" size="icon" aria-label="Más acciones">
          <MoreVertical class="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-56">
        <DropdownMenuItem @select="deferOpen(() => emit('attendance'))">
          <ClipboardCheck class="w-4 h-4 mr-2" />
          Registrar asistencia
        </DropdownMenuItem>
        <!-- "Ya contacté" mark: localStorage only, no backend. It opens no dialog, so no deferOpen. -->
        <DropdownMenuItem @select="emit('toggle-contacted')">
          <template v-if="isContacted">
            <CheckCircle2 class="w-4 h-4 mr-2 text-green-600" />
            <span>
              Quitar marca de contactado
              <span v-if="markedRelative" class="block text-xs text-muted-foreground">Marcado {{ markedRelative }}</span>
            </span>
          </template>
          <template v-else>
            <Circle class="w-4 h-4 mr-2" />
            <span>
              Marcar como contactado
              <span class="block text-xs text-muted-foreground">Solo en este navegador</span>
            </span>
          </template>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem @select="deferOpen(() => emit('notes'))">
          <FileText class="w-4 h-4 mr-2" />
          Notas
        </DropdownMenuItem>
        <DropdownMenuItem @select="deferOpen(() => emit('timeline'))">
          <History class="w-4 h-4 mr-2" />
          Historial
        </DropdownMenuItem>
        <DropdownMenuItem @select="deferOpen(() => emit('photo'))">
          <Camera class="w-4 h-4 mr-2" />
          Foto
        </DropdownMenuItem>
        <template v-if="isOwner">
          <DropdownMenuSeparator />
          <DropdownMenuItem @select="deferOpen(() => emit('edit'))">
            <Pencil class="w-4 h-4 mr-2" />
            Editar datos
          </DropdownMenuItem>
          <DropdownMenuItem
            class="text-destructive focus:text-destructive"
            @select="deferOpen(() => emit('remove'))"
          >
            <UserMinus class="w-4 h-4 mr-2" />
            Eliminar miembro
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  Button,
  Tooltip, TooltipContent, TooltipTrigger,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@repo/ui';
import { CheckCircle2, Circle, ClipboardCheck, MessageSquare, MoreVertical, FileText, History, Pencil, UserMinus, Camera } from 'lucide-vue-next';
import { useRekaDialogFix } from '@/composables/useRekaDialogFix';

const props = defineProps<{
  isOwner: boolean;
  isContacted: boolean;
  contactedAt?: string;
}>();

const emit = defineEmits<{
  'toggle-contacted': [];
  attendance: [];
  message: [];
  notes: [];
  timeline: [];
  photo: [];
  edit: [];
  remove: [];
}>();

// poll:false — el polling global vive en la vista padre (CommunityMembersView);
// aquí solo necesitamos deferOpen, y evitamos 1 interval por fila.
const { deferOpen } = useRekaDialogFix({ poll: false });

// Texto relativo del marcado "ya contactado" (subtítulo del ítem del menú).
const markedRelative = computed(() => {
  const iso = props.contactedAt;
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
});
</script>
