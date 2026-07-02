<template>
  <div class="flex items-center gap-0.5">
    <!-- "Ya contacté" toggle — solo localStorage, sin backend -->
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          variant="ghost"
          size="icon"
          :class="isContacted ? 'text-green-600' : 'text-muted-foreground/60'"
          @click="emit('toggle-contacted')"
        >
          <CheckCircle2 v-if="isContacted" class="w-4 h-4" />
          <Circle v-else class="w-4 h-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p v-if="isContacted">
          Marcado como contactado<br />
          <span class="text-xs opacity-75">{{ markedRelative }} — click para desmarcar</span>
        </p>
        <p v-else>Marcar como contactado<br /><span class="text-xs opacity-75">(solo en este navegador)</span></p>
      </TooltipContent>
    </Tooltip>

    <!-- Registrar asistencia -->
    <Tooltip>
      <TooltipTrigger as-child>
        <Button variant="ghost" size="icon" @click="emit('attendance')">
          <ClipboardCheck class="w-4 h-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Registrar asistencia</p>
      </TooltipContent>
    </Tooltip>

    <!-- Mensaje -->
    <Tooltip>
      <TooltipTrigger as-child>
        <Button variant="ghost" size="icon" @click="emit('message')">
          <MessageSquare class="w-4 h-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Mensajes</p>
      </TooltipContent>
    </Tooltip>

    <!-- Más acciones (abren Dialogs → deferOpen para no dejar pointer-events huérfano) -->
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" size="icon" aria-label="Más acciones">
          <MoreVertical class="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-44">
        <DropdownMenuItem @select="deferOpen(() => emit('notes'))">
          <FileText class="w-4 h-4 mr-2" />
          Notas
        </DropdownMenuItem>
        <DropdownMenuItem @select="deferOpen(() => emit('timeline'))">
          <History class="w-4 h-4 mr-2" />
          Historial
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
import { CheckCircle2, Circle, ClipboardCheck, MessageSquare, MoreVertical, FileText, History, Pencil, UserMinus } from 'lucide-vue-next';
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
  edit: [];
  remove: [];
}>();

// poll:false — el polling global vive en la vista padre (CommunityMembersView);
// aquí solo necesitamos deferOpen, y evitamos 1 interval por fila.
const { deferOpen } = useRekaDialogFix({ poll: false });

// Texto relativo del marcado "ya contactado" (solo para el tooltip).
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
