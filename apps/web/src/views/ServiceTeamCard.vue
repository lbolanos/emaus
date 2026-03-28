<template>
  <div>
    <Card class="flex flex-col">
      <CardHeader class="flex-row items-center justify-between">
        <CardTitle class="flex items-center gap-2">
          <span class="text-sm">{{ team.name }}</span>
          <span class="text-xs text-gray-400">({{ teamTypeLabel }})</span>
        </CardTitle>
        <div class="flex items-center gap-1">
          <span class="text-sm font-normal text-gray-500 dark:text-gray-400">{{ memberCount }}</span>
          <Button
            v-if="team.instructions"
            variant="ghost"
            size="icon"
            class="h-7 w-7"
            @click="$emit('showInstructions', team)"
            :title="$t('serviceTeams.viewInstructions')"
          >
            <FileText class="w-4 h-4" />
          </Button>
          <template v-if="docFiles.length === 1">
            <a :href="getDocFileUrl(docFiles[0])" target="_blank" :title="docFiles[0]">
              <Button variant="ghost" size="icon" class="h-7 w-7 text-green-600 hover:text-green-800">
                <Download class="w-3.5 h-3.5" />
              </Button>
            </a>
          </template>
          <DropdownMenu v-else-if="docFiles.length > 1">
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="icon" class="h-7 w-7 text-green-600 hover:text-green-800" :title="$t('responsibilities.downloadDocs')">
                <Download class="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem v-for="file in docFiles" :key="file" as-child>
                <a :href="getDocFileUrl(file)" target="_blank" class="flex items-center gap-2">
                  <Download class="w-3.5 h-3.5" />
                  {{ file }}
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-destructive"
            @click="$emit('delete', team)"
            :title="$t('common.delete')"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent class="flex-grow">
        <div class="space-y-3">
          <!-- Leader Drop Zone -->
          <div
            @drop.prevent="onDropLeader($event)"
            @dragover.prevent="onDragOverLeader($event)"
            @dragleave.prevent="onDragLeaveLeader"
            class="p-2 border-2 border-dashed rounded-md transition-colors"
            :class="{
              'border-primary bg-primary/10': isOverLeader,
            }"
          >
            <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ $t('serviceTeams.leader') }}</h4>
            <div class="mt-1 min-h-[20px]">
              <div
                v-if="team.leader"
                draggable="true"
                @dragstart.stop="startDragFromTeam($event, team.leader, 'leader')"
                @dragend.stop="handleDragEnd"
                :title="`${team.leader.firstName} ${team.leader.lastName}`"
                class="px-3 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 rounded-full text-sm font-medium inline-flex items-center gap-1 cursor-grab"
                :class="getHighlightClass(team.leader)"
              >
                {{ team.leader.firstName.split(' ')[0] }} {{ team.leader.lastName.charAt(0) }}.
                <button
                  @click.stop="onRemoveLeader"
                  @mousedown.stop
                  class="ml-0.5 hover:text-amber-950 dark:hover:text-amber-100"
                  :title="$t('common.delete')"
                >
                  <X class="w-3 h-3" />
                </button>
              </div>
              <span v-else class="text-gray-400 text-sm">{{ $t('tables.unassigned') }}</span>
            </div>
          </div>

          <!-- Members Drop Zone -->
          <div
            @drop.prevent="onDropMember($event)"
            @dragover.prevent="onDragOverMembers($event)"
            @dragleave.prevent="onDragLeaveMembers"
            class="p-2 border-2 border-dashed rounded-md transition-colors min-h-[60px]"
            :class="{ 'border-primary bg-primary/10': isOverMembers }"
          >
            <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ $t('serviceTeams.members') }} ({{ nonLeaderMembers.length }})</h4>
            <div v-if="nonLeaderMembers.length > 0" class="mt-2 flex flex-wrap gap-2">
              <div
                v-for="member in nonLeaderMembers"
                :key="member.id"
                draggable="true"
                @dragstart="startDragFromTeam($event, member.participant, 'member')"
                @dragend="handleDragEnd"
                :title="`${member.participant?.firstName} ${member.participant?.lastName}`"
                :data-participant-id="member.participantId"
                :data-team-id="team.id"
                class="px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full text-xs font-medium cursor-grab transition-all inline-flex items-center gap-0.5"
                :class="getHighlightClass(member.participant)"
              >
                {{ member.participant?.firstName?.split(' ')[0] }} {{ member.participant?.lastName?.charAt(0) }}.
                <button
                  @click.stop="onRemoveMember(member.participantId)"
                  @mousedown.stop
                  class="ml-0.5 hover:text-blue-950 dark:hover:text-blue-100"
                  :title="$t('common.delete')"
                >
                  <X class="w-3 h-3" />
                </button>
              </div>
            </div>
            <span v-else class="text-gray-400 text-sm mt-2 block">{{ $t('serviceTeams.noMembers') }}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { PropType } from 'vue';
import type { Participant, ServiceTeam } from '@repo/types';
import { ServiceTeamType } from '@repo/types';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { Button } from '@repo/ui';
import { Download, Trash2, FileText, X } from 'lucide-vue-next';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@repo/ui';
import { useServiceTeamStore } from '@/stores/serviceTeamStore';
import { useDragState } from '@/composables/useDragState';

const props = defineProps({
  team: {
    type: Object as PropType<ServiceTeam>,
    required: true,
  },
  searchQuery: {
    type: String,
    default: '',
  },
});

defineEmits(['delete', 'showInstructions']);

const serviceTeamStore = useServiceTeamStore();
const { startDrag: startDragState, endDrag } = useDragState();

const isOverLeader = ref(false);
const isOverMembers = ref(false);

// Mapping of service team names to downloadable document files
const serviceTeamDocFiles: Record<string, string[]> = {
	'Dinámica de la Rosa': ['04 La Rosa.pdf'],
	'Dinámica de las Máscaras': [],
	'Sanación de los Recuerdos': ['08 Dinamica Sanacion De Recuerdos Hombres.pdf', 'Introducción a la Dinámica de Sanación.docx'],
	'Examen de Conciencia / Quema de Pecados': ['09 Explicacion de la Hoja de Pecados.pdf', '09 Explicacion de la Hoja de Pecados (Una Nueva Voz Despues de Sanacion de Recuerdos).pdf', 'Letreros Dinamicas - Cenizas,Lavado,Bendicion.pdf'],
	'Dinámica de la Pared': ['10 Dinamicas Pared Lavado Palancas.pdf'],
	'Dinámica del Perdón / Clausura': ['13 Dinamica del Perdon.pdf'],
	'Palancas': ['05 Palancas.pdf'],
	'Intercesión / Oración': ['12 Dinamica 2 Oracion en grupo.pdf'],
	'Liturgia': ['10 Confesiones Instrucciones a Sacerdotes.pdf'],
	'Oración por Intercesión en Mesa': ['07 Dinamica 1 Oracion Peticion v2.pdf', 'Dinámica de Oración de Intercesión. Sabado..docx'],
	'Líder de Mesa (Primero de Mesa)': ['Instrucciones para lideres de mesa.pdf'],
	'Colíder de Mesa (Segundo de Mesa)': ['Instrucciones para lideres de mesa.pdf'],
	'Reglas del Retiro': ['REGLAS PARA EL RETIRO.pdf'],
	'Serenata': [],
};

const docFiles = computed(() => serviceTeamDocFiles[props.team.name] || []);

const getDocFileUrl = (filename: string): string => {
	return `/docs/dinamicas/${encodeURIComponent(filename)}`;
};

const teamTypeLabels: Record<string, string> = {
  [ServiceTeamType.COCINA]: 'Cocina',
  [ServiceTeamType.MUSICA]: 'Música',
  [ServiceTeamType.PALANCAS]: 'Palancas',
  [ServiceTeamType.LOGISTICA]: 'Logística',
  [ServiceTeamType.LIMPIEZA]: 'Limpieza',
  [ServiceTeamType.ORACION]: 'Oración',
  [ServiceTeamType.LITURGIA]: 'Liturgia',
  [ServiceTeamType.BIENVENIDA]: 'Bienvenida',
  [ServiceTeamType.REGISTRO]: 'Registro',
  [ServiceTeamType.COMEDOR]: 'Comedor',
  [ServiceTeamType.SALON]: 'Salón',
  [ServiceTeamType.CUARTOS]: 'Cuartos',
  [ServiceTeamType.TRANSPORTE]: 'Transporte',
  [ServiceTeamType.COMPRAS]: 'Compras',
  [ServiceTeamType.SNACKS]: 'Snacks',
  [ServiceTeamType.CONTINUA]: 'Continua',
  [ServiceTeamType.DINAMICA]: 'Dinámica',
  [ServiceTeamType.OTRO]: 'Otro',
};

const teamTypeLabel = computed(() => teamTypeLabels[props.team.teamType] || props.team.teamType);

const memberCount = computed(() => (props.team.members?.length || 0));

const nonLeaderMembers = computed(() => {
  if (!props.team.members) return [];
  return props.team.members.filter(m => m.participantId !== props.team.leaderId);
});

const normalizeText = (text: string): string => {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
};

const getHighlightClass = (participant: Participant | null | undefined): string => {
  if (!participant || !props.searchQuery?.trim()) return '';
  const q = normalizeText(props.searchQuery.trim());
  const name = normalizeText(`${participant.firstName} ${participant.lastName}`);
  if (name.includes(q)) {
    return 'ring-2 ring-yellow-500 ring-offset-1 bg-yellow-200 dark:bg-yellow-700';
  }
  return '';
};

const startDragFromTeam = (event: DragEvent, participant: any, role: string) => {
  if (event.dataTransfer && participant) {
    event.dataTransfer.dropEffect = 'move';
    event.dataTransfer.effectAllowed = 'move';
    const payload = {
      ...participant,
      sourceTeamId: props.team.id,
      sourceRole: role,
    };
    event.dataTransfer.setData('application/json', JSON.stringify(payload));
    startDragState('server');
  }
};

const handleDragEnd = () => {
  endDrag();
  isOverLeader.value = false;
  isOverMembers.value = false;
};

const onDragOverLeader = (_event: DragEvent) => {
  isOverLeader.value = true;
  isOverMembers.value = false;
};

const onDragLeaveLeader = () => {
  isOverLeader.value = false;
};

const onDragOverMembers = (_event: DragEvent) => {
  isOverMembers.value = true;
  isOverLeader.value = false;
};

const onDragLeaveMembers = () => {
  isOverMembers.value = false;
};

const onRemoveLeader = () => {
  serviceTeamStore.unassignLeader(props.team.id);
};

const onRemoveMember = (participantId: string) => {
  serviceTeamStore.removeMember(props.team.id, participantId);
};

const onDropLeader = (event: DragEvent) => {
  isOverLeader.value = false;
  const data = event.dataTransfer?.getData('application/json');
  if (!data) return;
  const participant = JSON.parse(data);
  // Allow drop if type is 'server' or missing (when dragged from team cards, type may not be populated)
  if (participant.type && participant.type !== 'server') return;

  serviceTeamStore.assignLeader(
    props.team.id,
    participant.id,
    participant.sourceTeamId,
  );
};

const onDropMember = (event: DragEvent) => {
  isOverMembers.value = false;
  const data = event.dataTransfer?.getData('application/json');
  if (!data) return;
  const participant = JSON.parse(data);
  if (participant.type && participant.type !== 'server') return;

  serviceTeamStore.addMember(
    props.team.id,
    participant.id,
    undefined,
    participant.sourceTeamId,
  );
};
</script>
