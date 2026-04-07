<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Textarea } from '@repo/ui';
import TagSelector from './TagSelector.vue';
import { getParticipantTags, assignTagToParticipant, removeTagFromParticipant, getPalanqueroOptions as fetchPalanqueroOptions } from '@/services/api';
import { useToast } from '@repo/ui';
import type { Tag } from '@repo/types';
import { ChevronDown, ChevronUp, User, Phone, Users, Heart, ClipboardList, MapPin, Briefcase, FileText, Shield, Tag as TagIcon } from 'lucide-vue-next';

const props = defineProps<{
  participant: any;
  columnsToShow: string[];
  columnsToEdit: string[];
  allColumns: { key: string; label: string; type?: string }[];
}>();

const emit = defineEmits(['save', 'cancel']);

const { toast } = useToast();
const localParticipant = ref<any>({});
const selectedTags = ref<Tag[]>([]);
const showContactDetails = ref(false);

const isPalancasView = computed(() => props.columnsToShow.includes('palancasCoordinator'));

const palanqueroOptions = ref([
  { value: 'Palanquero 1', label: 'Palanquero 1' },
  { value: 'Palanquero 2', label: 'Palanquero 2' },
  { value: 'Palanquero 3', label: 'Palanquero 3' },
]);

const palancasStatus = computed(() => {
  const p = localParticipant.value;
  if (p.palancasReceived && Number(p.palancasReceived) > 0) return 'received';
  if (p.palancasRequested) return 'requested';
  if (p.palancasCoordinator) return 'assigned';
  return 'pending';
});

const palancasStatusConfig = computed(() => {
  const configs: Record<string, { label: string; bg: string; text: string; dot: string }> = {
    received: { label: 'Recibidas', bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500' },
    requested: { label: 'Solicitadas', bg: 'bg-blue-100', text: 'text-blue-800', dot: 'bg-blue-500' },
    assigned: { label: 'Coordinador Asignado', bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' },
    pending: { label: 'Pendiente', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  };
  return configs[palancasStatus.value];
});

const hasAnyPhone = computed(() => {
  const p = props.participant;
  return p?.homePhone || p?.workPhone || p?.cellPhone;
});

const hasInviterInfo = computed(() => {
  const p = props.participant;
  return p?.invitedBy || p?.inviterCellPhone || p?.inviterEmail;
});

const hasEmergencyContacts = computed(() => {
  const p = props.participant;
  return p?.emergencyContact1Name || p?.emergencyContact2Name;
});

// Field grouping for the generic edit form
const fieldGroups: { key: string; label: string; icon: string; keys: string[] }[] = [
  { key: 'identity', label: 'Identificaci\u00f3n', icon: 'user', keys: ['id_on_retreat', 'type', 'firstName', 'lastName', 'nickname', 'tags'] },
  { key: 'personal', label: 'Datos Personales', icon: 'fileText', keys: ['birthDate', 'maritalStatus', 'occupation', 'sacraments', 'tshirtSize'] },
  { key: 'contact', label: 'Contacto', icon: 'phone', keys: ['email', 'cellPhone', 'homePhone', 'workPhone'] },
  { key: 'address', label: 'Direcci\u00f3n', icon: 'mapPin', keys: ['street', 'houseNumber', 'neighborhood', 'postalCode', 'city', 'state', 'country', 'parish'] },
  { key: 'health', label: 'Salud', icon: 'shield', keys: ['snores', 'hasMedication', 'medicationDetails', 'medicationSchedule', 'hasDietaryRestrictions', 'dietaryRestrictionsDetails', 'disabilitySupport'] },
  { key: 'inviter', label: 'Invitador', icon: 'users', keys: ['invitedBy', 'isInvitedByEmausMember', 'inviterHomePhone', 'inviterWorkPhone', 'inviterCellPhone', 'inviterEmail'] },
  { key: 'emergency', label: 'Emergencia', icon: 'heart', keys: ['emergencyContact1Name', 'emergencyContact1Relation', 'emergencyContact1HomePhone', 'emergencyContact1WorkPhone', 'emergencyContact1CellPhone', 'emergencyContact1Email', 'emergencyContact2Name', 'emergencyContact2Relation', 'emergencyContact2HomePhone', 'emergencyContact2WorkPhone', 'emergencyContact2CellPhone', 'emergencyContact2Email'] },
  { key: 'logistics', label: 'Log\u00edstica', icon: 'briefcase', keys: ['pickupLocation', 'arrivesOnOwn', 'requestsSingleRoom', 'retreatBed.roomNumber', 'tableMesa.name', 'tableId'] },
  { key: 'financial', label: 'Financiero', icon: 'fileText', keys: ['totalPaid', 'lastPaymentDate', 'paymentStatus', 'isScholarship'] },
  { key: 'palancas', label: 'Palancas', icon: 'clipboardList', keys: ['palancasCoordinator', 'palancasRequested', 'palancasReceived', 'palancasNotes'] },
  { key: 'admin', label: 'Administraci\u00f3n', icon: 'fileText', keys: ['isCancelled', 'notes', 'registrationDate', 'lastUpdatedDate', 'retreatId'] },
];

const groupedColumns = computed(() => {
  const visible = props.columnsToShow;
  const groups: { key: string; label: string; icon: string; fields: string[] }[] = [];
  const placed = new Set<string>();

  for (const group of fieldGroups) {
    const fields = group.keys.filter(k => visible.includes(k));
    if (fields.length > 0) {
      groups.push({ key: group.key, label: group.label, icon: group.icon, fields });
      fields.forEach(f => placed.add(f));
    }
  }

  // Catch any ungrouped fields
  const ungrouped = visible.filter(k => !placed.has(k));
  if (ungrouped.length > 0) {
    groups.push({ key: 'other', label: 'Otros', icon: 'fileText', fields: ungrouped });
  }

  return groups;
});

const iconMap: Record<string, any> = {
  user: User,
  phone: Phone,
  users: Users,
  heart: Heart,
  clipboardList: ClipboardList,
  mapPin: MapPin,
  briefcase: Briefcase,
  fileText: FileText,
  shield: Shield,
  tagIcon: TagIcon,
};

const getColumnLabel = (key: string) => {
  const col = props.allColumns.find(c => c.key === key);
  return col ? col.label : key;
};

const maxBirthDate = computed(() => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 20)
  return d.toISOString().slice(0, 10)
})

const READ_ONLY_COMPUTED_FIELDS = ['totalPaid', 'paymentStatus', 'lastPaymentDate'];

const getColumnType = (key: string) => {
    const col = props.allColumns.find(c => c.key === key);
    if (col && col.type) return col.type;
    if (key === 'tags') return 'tags';
    if (key === 'type' || key === 'palancasCoordinator' || key === 'pickupLocation') return 'select';
    if (key.startsWith('is') || key.startsWith('has') || key.startsWith('requests') || key === 'arrivesOnOwn' || key === 'snores' || key === 'palancasRequested') return 'boolean';
    if (key.toLowerCase().includes('notes') || key.toLowerCase().includes('details')) return 'textarea';
    if (key.toLowerCase().includes('date')) return 'date';
    return 'text';
}

const formatDateForInput = (date: string | Date | null | undefined) => {
  console.log('formatDateForInput - input date:', date);
  console.log('formatDateForInput - input date type:', typeof date);

  if (!date) return '';

  // Parse the date string directly to avoid timezone conversion
  let year, month, day;

  if (typeof date === 'string') {
    // Handle ISO format (YYYY-MM-DDTHH:mm:ss.sssZ)
    if (date.includes('T')) {
      const datePart = date.split('T')[0];
      [year, month, day] = datePart.split('-');
    } else {
      // Handle YYYY-MM-DD format
      [year, month, day] = date.split('-');
    }
  } else {
    // Handle Date object - use UTC methods to avoid timezone issues
    year = date.getUTCFullYear();
    month = String(date.getUTCMonth() + 1).padStart(2, '0');
    day = String(date.getUTCDate()).padStart(2, '0');
  }

  if (!year || !month || !day) return '';

  const result = `${year}-${month}-${day}`;
  console.log('formatDateForInput - formatted result:', result);
  return result;
};

const formatDateForDisplay = (date: string | Date | null | undefined) => {
  if (!date) return 'N/A';

  // Parse the date string directly to avoid timezone conversion
  let year, month, day;

  if (typeof date === 'string') {
    // Handle ISO format (YYYY-MM-DDTHH:mm:ss.sssZ)
    if (date.includes('T')) {
      const datePart = date.split('T')[0];
      [year, month, day] = datePart.split('-');
    } else {
      // Handle YYYY-MM-DD format
      [year, month, day] = date.split('-');
    }
  } else {
    // Handle Date object - use UTC methods to avoid timezone issues
    year = date.getUTCFullYear();
    month = String(date.getUTCMonth() + 1).padStart(2, '0');
    day = String(date.getUTCDate()).padStart(2, '0');
  }

  if (!year || !month || !day) return 'N/A';

  return `${day}/${month}/${year}`;
};

const loadParticipantTags = async () => {
  if (!props.participant?.id) return;
  try {
    const tags = await getParticipantTags(props.participant.id);
    selectedTags.value = tags;
  } catch (error) {
    console.error('Error loading participant tags:', error);
  }
};

watch(() => props.participant, (newVal) => {
  console.log('EditParticipantForm - participant changed:', newVal);
  console.log('EditParticipantForm - birthDate value:', newVal?.birthDate);
  console.log('EditParticipantForm - birthDate type:', typeof newVal?.birthDate);

  if (!newVal) {
    localParticipant.value = {};
    return;
  }

  // Create a copy and format dates properly
  const formattedData = { ...newVal };

  // Format date fields for the date input
  props.allColumns.forEach(col => {
    if (getColumnType(col.key) === 'date' && formattedData[col.key]) {
      formattedData[col.key] = formatDateForInput(formattedData[col.key]);
    }
  });

  localParticipant.value = formattedData;

  // Load tags for the participant
  loadParticipantTags();
}, { immediate: true, deep: true });

watch(() => props.participant?.retreatId, async (retreatId) => {
  if (retreatId) {
    try {
      palanqueroOptions.value = await fetchPalanqueroOptions(retreatId);
    } catch (e) {
      console.error('Error loading palanquero options:', e);
    }
  }
}, { immediate: true });

const handleSave = async () => {
  const participantToSave = { ...localParticipant.value };

  // Remove relation objects and read-only fields that the API doesn't expect
  delete participantToSave.tags;
  delete (participantToSave as any).participantTags;
  delete participantToSave.retreatBed;
  delete participantToSave.tableMesa;
  delete participantToSave.payments;
  delete participantToSave.responsibilities;
  delete participantToSave.retreat;
  delete participantToSave.user;

  // Log what's being sent for debugging
  //console.log('Saving participant:', JSON.stringify(participantToSave, null, 2));

  // Note: retreatBedId has been removed from participant entity
  // Bed assignments are now handled through the retreat_bed table only
  if (participantToSave.tableId === null || participantToSave.tableId === '') {
    delete participantToSave.tableId;
  }

  for (const key in participantToSave) {
    if (getColumnType(key) === 'boolean' && participantToSave[key] === null) {
      participantToSave[key] = false;
    }

    // Ensure dates are properly formatted as ISO strings
    if (getColumnType(key) === 'date' && participantToSave[key]) {
      if (typeof participantToSave[key] === 'string') {
        // Convert string dates to Date objects then back to ISO string to ensure proper format
        const date = new Date(participantToSave[key]);
        if (!isNaN(date.getTime())) {
          participantToSave[key] = date.toISOString();
        }
      } else if (participantToSave[key] instanceof Date) {
        participantToSave[key] = participantToSave[key].toISOString();
      }
    }
  }

  // Save participant data first
  emit('save', participantToSave);

  // Handle tag updates separately
  try {
    const currentTags = selectedTags.value;
    const existingTags = props.participant.tags || [];
    const existingTagIds = new Set(existingTags.map((t: any) => t.tag?.id || t.id).filter(Boolean));

    // Add new tags
    for (const tag of currentTags) {
      if (!existingTagIds.has(tag.id)) {
        await assignTagToParticipant(props.participant.id, tag.id);
      }
    }

    // Remove removed tags
    for (const existingTag of existingTags) {
      const tagId = existingTag.tag?.id || existingTag.id;
      if (!currentTags.find((t) => t.id === tagId)) {
        await removeTagFromParticipant(props.participant.id, tagId);
      }
    }

    // Reload tags after saving
    await loadParticipantTags();
  } catch (error: any) {
    console.error('Error saving tags:', error);
    toast({
      title: 'Error al guardar etiquetas',
      description: error.response?.data?.message || error.message,
      variant: 'destructive',
    });
  }
};

const handleCancel = () => {
  emit('cancel');
};

const calculateAge = (birthDate: string | Date) => {
  if (!birthDate) return 'N/A';
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
};
</script>

<template>
  <!-- ==================== PALANCAS-SPECIFIC LAYOUT ==================== -->
  <template v-if="isPalancasView">
    <div class="space-y-5 max-h-[70vh] overflow-y-auto pr-1">

      <!-- Participant Summary Card -->
      <div class="rounded-xl border border-gray-200 bg-gradient-to-r from-purple-50 to-white overflow-hidden">
        <!-- Header row: name, age, status badge -->
        <div class="flex items-center justify-between px-5 py-4">
          <div class="flex items-center gap-4">
            <div class="flex items-center justify-center w-10 h-10 rounded-full bg-purple-100 text-purple-700">
              <User class="w-5 h-5" />
            </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900">{{ participant.firstName }} {{ participant.lastName }}</h3>
              <div class="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
                <span>#{{ participant.id_on_retreat }}</span>
                <span v-if="participant.birthDate">{{ calculateAge(participant.birthDate) }} a&ntilde;os</span>
                <span v-if="participant.cellPhone" class="flex items-center gap-1">
                  <Phone class="w-3 h-3" />
                  {{ participant.cellPhone }}
                </span>
              </div>
            </div>
          </div>
          <!-- Status Badge -->
          <div :class="[palancasStatusConfig.bg, palancasStatusConfig.text, 'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium']">
            <span :class="[palancasStatusConfig.dot, 'w-1.5 h-1.5 rounded-full']"></span>
            {{ palancasStatusConfig.label }}
          </div>
        </div>

        <!-- Collapsible contact details -->
        <div v-if="hasAnyPhone || hasInviterInfo || hasEmergencyContacts">
          <button
            @click="showContactDetails = !showContactDetails"
            class="w-full flex items-center justify-between px-5 py-2.5 text-xs font-medium text-gray-500 bg-gray-50/80 hover:bg-gray-100/80 transition-colors border-t border-gray-100"
          >
            <span>Datos de contacto y emergencia</span>
            <ChevronDown v-if="!showContactDetails" class="w-4 h-4" />
            <ChevronUp v-else class="w-4 h-4" />
          </button>

          <div v-if="showContactDetails" class="px-5 py-3 border-t border-gray-100 bg-white/50">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <!-- Phones -->
              <div v-if="hasAnyPhone">
                <div class="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  <Phone class="w-3 h-3" />
                  Tel&eacute;fonos
                </div>
                <div class="space-y-1 text-gray-700">
                  <div v-if="participant.homePhone"><span class="text-gray-400">Casa:</span> {{ participant.homePhone }}</div>
                  <div v-if="participant.workPhone"><span class="text-gray-400">Trabajo:</span> {{ participant.workPhone }}</div>
                  <div v-if="participant.cellPhone"><span class="text-gray-400">Celular:</span> {{ participant.cellPhone }}</div>
                </div>
              </div>

              <!-- Inviter -->
              <div v-if="hasInviterInfo">
                <div class="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  <Users class="w-3 h-3" />
                  Invitador
                </div>
                <div class="space-y-1 text-gray-700">
                  <div v-if="participant.invitedBy">{{ participant.invitedBy }}</div>
                  <div v-if="participant.isInvitedByEmausMember !== null" class="text-gray-400">
                    {{ participant.isInvitedByEmausMember ? 'Miembro Ema&uacute;s' : 'No miembro' }}
                  </div>
                  <div v-if="participant.inviterCellPhone"><span class="text-gray-400">Tel:</span> {{ participant.inviterCellPhone }}</div>
                  <div v-if="participant.inviterEmail" class="text-xs text-gray-400 truncate">{{ participant.inviterEmail }}</div>
                </div>
              </div>

              <!-- Emergency Contacts -->
              <div v-if="hasEmergencyContacts">
                <div class="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  <Heart class="w-3 h-3" />
                  Emergencia
                </div>
                <div class="space-y-2 text-gray-700">
                  <div v-if="participant.emergencyContact1Name">
                    <div class="font-medium">{{ participant.emergencyContact1Name }}</div>
                    <div class="text-xs text-gray-400">{{ participant.emergencyContact1Relation }}</div>
                    <div v-if="participant.emergencyContact1CellPhone" class="text-xs">{{ participant.emergencyContact1CellPhone }}</div>
                  </div>
                  <div v-if="participant.emergencyContact2Name" class="pt-1 border-t border-gray-100">
                    <div class="font-medium">{{ participant.emergencyContact2Name }}</div>
                    <div class="text-xs text-gray-400">{{ participant.emergencyContact2Relation }}</div>
                    <div v-if="participant.emergencyContact2CellPhone" class="text-xs">{{ participant.emergencyContact2CellPhone }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Palancas Edit Card -->
      <div class="rounded-xl border border-purple-200 bg-white overflow-hidden">
        <div class="flex items-center gap-2 px-5 py-3 bg-purple-50 border-b border-purple-100">
          <ClipboardList class="w-4 h-4 text-purple-600" />
          <h4 class="text-sm font-semibold text-purple-900">Gestionar Palancas</h4>
        </div>

        <div class="p-5 space-y-5">
          <!-- Row 1: Coordinator + Requested toggle -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div class="space-y-2">
              <Label for="palancasCoordinator" class="text-sm font-medium text-gray-700">Coordinador de Palancas</Label>
              <Select
                :model-value="localParticipant.palancasCoordinator"
                @update:model-value="(value: string) => localParticipant.palancasCoordinator = value"
              >
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="Seleccionar coordinador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="opt in palanqueroOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div class="space-y-2">
              <Label for="palancasRequested" class="text-sm font-medium text-gray-700">Palancas Solicitadas</Label>
              <div class="flex items-center gap-3 pt-1">
                <Switch
                  id="palancasRequested"
                  :model-value="localParticipant.palancasRequested"
                  @update:model-value="(value: boolean) => localParticipant.palancasRequested = value"
                />
                <span class="text-sm text-gray-500">{{ localParticipant.palancasRequested ? 'S&iacute;' : 'No' }}</span>
              </div>
            </div>
          </div>

          <!-- Row 2: Received -->
          <div class="space-y-2">
            <Label for="palancasReceived" class="text-sm font-medium text-gray-700">Palancas Recibidas</Label>
            <Input
              id="palancasReceived"
              v-model="localParticipant.palancasReceived"
              placeholder="Cantidad o descripci&oacute;n de palancas recibidas"
              class="w-full"
            />
          </div>

          <!-- Row 3: Notes -->
          <div class="space-y-2">
            <Label for="palancasNotes" class="text-sm font-medium text-gray-700">Notas de Palancas</Label>
            <Textarea
              id="palancasNotes"
              v-model="localParticipant.palancasNotes"
              placeholder="Notas adicionales sobre las palancas..."
              class="w-full min-h-[80px]"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-100">
      <Button variant="outline" @click="handleCancel">Cancelar</Button>
      <Button @click="handleSave" class="bg-purple-600 hover:bg-purple-700">Guardar</Button>
    </div>
  </template>

  <!-- ==================== GENERIC FORM LAYOUT (non-palancas views) ==================== -->
  <template v-else>
    <div class="space-y-4 max-h-[70vh] overflow-y-auto pr-1">

      <!-- Participant Header -->
      <div class="flex items-center gap-3 pb-3 border-b border-gray-100">
        <div class="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-600">
          <User class="w-4 h-4" />
        </div>
        <div>
          <h3 class="text-base font-semibold text-gray-900">{{ participant.firstName }} {{ participant.lastName }}</h3>
          <div class="flex items-center gap-2 text-xs text-gray-400">
            <span v-if="participant.id_on_retreat">#{{ participant.id_on_retreat }}</span>
            <span v-if="participant.birthDate">{{ calculateAge(participant.birthDate) }} a&ntilde;os</span>
            <span v-if="participant.cellPhone">{{ participant.cellPhone }}</span>
          </div>
        </div>
      </div>

      <!-- Grouped Field Sections -->
      <div v-for="group in groupedColumns" :key="group.key" class="rounded-lg border border-gray-150 overflow-hidden">
        <!-- Section Header -->
        <div class="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
          <component :is="iconMap[group.icon] || FileText" class="w-3.5 h-3.5 text-gray-500" />
          <span class="text-xs font-semibold text-gray-600 uppercase tracking-wide">{{ group.label }}</span>
        </div>

        <!-- Fields Grid -->
        <div class="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
          <div
            v-for="key in group.fields"
            :key="key"
            :class="[
              'space-y-1.5',
              getColumnType(key) === 'textarea' ? 'sm:col-span-2 md:col-span-3' : '',
              getColumnType(key) === 'tags' ? 'sm:col-span-2 md:col-span-3' : ''
            ]"
          >
            <Label v-if="getColumnType(key) !== 'tags'" :for="key" class="text-xs font-medium text-gray-500">{{ getColumnLabel(key) }}</Label>
            <template v-if="columnsToEdit.includes(key) && !READ_ONLY_COMPUTED_FIELDS.includes(key)">
              <Input
                v-if="getColumnType(key) === 'text'"
                :id="key"
                v-model="localParticipant[key]"
                class="w-full"
              />
              <Input
                v-if="getColumnType(key) === 'date'"
                type="date"
                :id="key"
                v-model="localParticipant[key]"
                :min="key === 'birthDate' ? '1930-01-01' : undefined"
                :max="key === 'birthDate' ? maxBirthDate : undefined"
                class="w-full"
              />
              <Textarea
                v-if="getColumnType(key) === 'textarea'"
                :id="key"
                v-model="localParticipant[key]"
                class="w-full min-h-[70px]"
              />
              <div v-if="getColumnType(key) === 'boolean'" class="flex items-center gap-2.5 pt-0.5">
                <Switch
                  :id="key"
                  :model-value="localParticipant[key]"
                  @update:model-value="(value: boolean) => localParticipant[key] = value"
                />
                <span class="text-sm text-gray-500">{{ localParticipant[key] ? 'S\u00ed' : 'No' }}</span>
              </div>
              <Select
                v-if="getColumnType(key) === 'select' && key === 'type'"
                :model-value="localParticipant[key]"
                @update:model-value="(value: string) => localParticipant[key] = value"
              >
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="walker">Caminante</SelectItem>
                  <SelectItem value="server">Servidor</SelectItem>
                  <SelectItem value="waiting">En espera</SelectItem>
                  <SelectItem value="partial_server">Servidor parcial</SelectItem>
                </SelectContent>
              </Select>
              <Select
                v-if="getColumnType(key) === 'select' && key === 'palancasCoordinator'"
                :model-value="localParticipant[key]"
                @update:model-value="(value: string) => localParticipant[key] = value"
              >
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="Seleccionar coordinador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="opt in palanqueroOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select
                v-if="getColumnType(key) === 'select' && key === 'pickupLocation'"
                :model-value="localParticipant[key]"
                @update:model-value="(value: string) => localParticipant[key] = value"
              >
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="Seleccionar Punto de Encuentro" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Parroquia">Parroquia</SelectItem>
                  <SelectItem value="Polanco">Polanco</SelectItem>
                  <SelectItem value="Bosques de las Lomas">Bosques de las Lomas</SelectItem>
                  <SelectItem value="Llego por mi cuenta">Llega por su cuenta</SelectItem>
                  <SelectItem value="Lilas">Lilas</SelectItem>
                  <SelectItem value="Auditorio">Auditorio</SelectItem>
                  <SelectItem value="Bas&iacute;lica">Bas&iacute;lica</SelectItem>
                  <SelectItem value="Casa">Casa</SelectItem>
                </SelectContent>
              </Select>
              <TagSelector
                v-if="getColumnType(key) === 'tags'"
                v-model="selectedTags"
                :retreatId="participant.retreatId"
                class="w-full"
              />
            </template>
            <!-- Read-only field display -->
            <div v-else class="flex items-center min-h-[36px] px-3 py-1.5 bg-gray-50 rounded-md border border-gray-100 text-sm text-gray-600">
              <template v-if="key === 'totalPaid'">
                {{ new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(participant[key]) || 0) }}
              </template>
              <template v-else>
                {{ getColumnType(key) === 'date' ? formatDateForDisplay(participant[key]) : (getColumnType(key) === 'boolean' ? (participant[key] ? 'S\u00ed' : 'No') : (participant[key] || '\u2014')) }}
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
      <Button variant="outline" @click="handleCancel">Cancelar</Button>
      <Button @click="handleSave">Guardar</Button>
    </div>
  </template>
</template>
