<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Textarea } from '@repo/ui';
import TagSelector from './TagSelector.vue';
import { getParticipantTags, assignTagToParticipant, removeTagFromParticipant } from '@/services/api';
import { useToast } from '@repo/ui';
import type { Tag } from '@repo/types';

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

const getColumnLabel = (key: string) => {
  const col = props.allColumns.find(c => c.key === key);
  return col ? col.label : key;
};

const getColumnType = (key: string) => {
    const col = props.allColumns.find(c => c.key === key);
    if (col && col.type) return col.type;
    if (key === 'tags') return 'tags';
    if (key === 'palancasCoordinator' || key === 'pickupLocation') return 'select';
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

const handleSave = async () => {
  const participantToSave = { ...localParticipant.value };

  // Remove tags from participant data (handled separately)
  delete participantToSave.tags;

  // Also remove any nested tag-related data that might have been copied
  delete (participantToSave as any).participantTags;

  // Log what's being sent for debugging
  console.log('Saving participant:', JSON.stringify(participantToSave, null, 2));

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
  <!-- Table with participant information when palancasCoordinator is shown -->
  <div v-if="columnsToShow.includes('palancasCoordinator')" class="mb-6 p-4 bg-gray-50 rounded-lg">
    <h3 class="text-lg font-semibold mb-4">Participant Information</h3>
    <div class="overflow-x-auto">
      <table class="min-w-full bg-white border border-gray-300">
        <tbody>
          <!-- Full Name -->
          <tr class="border-b border-gray-300">
            <td class="px-4 py-2 font-medium bg-gray-100">Full Name</td>
            <td class="px-4 py-2">{{ participant.firstName }} {{ participant.lastName }}</td>
          </tr>
          <!-- Age -->
          <tr class="border-b border-gray-300">
            <td class="px-4 py-2 font-medium bg-gray-100">Age</td>
            <td class="px-4 py-2">{{ calculateAge(participant.birthDate) }}</td>
          </tr>
          <!-- All Phones -->
          <tr class="border-b border-gray-300">
            <td class="px-4 py-2 font-medium bg-gray-100">Phones</td>
            <td class="px-4 py-2">
              <div class="space-y-1">
                <div v-if="participant.homePhone"><strong>Home:</strong> {{ participant.homePhone }}</div>
                <div v-if="participant.workPhone"><strong>Work:</strong> {{ participant.workPhone }}</div>
                <div v-if="participant.cellPhone"><strong>Cell:</strong> {{ participant.cellPhone }}</div>
              </div>
            </td>
          </tr>
          <!-- Inviter Data -->
          <tr class="border-b border-gray-300">
            <td class="px-4 py-2 font-medium bg-gray-100">Inviter Information</td>
            <td class="px-4 py-2">
              <div class="space-y-1">
                <div v-if="participant.invitedBy"><strong>Name:</strong> {{ participant.invitedBy }}</div>
                <div v-if="participant.isInvitedByEmausMember !== null"><strong>Emaus Member:</strong> {{ participant.isInvitedByEmausMember ? 'Yes' : 'No' }}</div>
                <div v-if="participant.inviterHomePhone"><strong>Home Phone:</strong> {{ participant.inviterHomePhone }}</div>
                <div v-if="participant.inviterWorkPhone"><strong>Work Phone:</strong> {{ participant.inviterWorkPhone }}</div>
                <div v-if="participant.inviterCellPhone"><strong>Cell Phone:</strong> {{ participant.inviterCellPhone }}</div>
                <div v-if="participant.inviterEmail"><strong>Email:</strong> {{ participant.inviterEmail }}</div>
              </div>
            </td>
          </tr>
          <!-- Emergency Contacts -->
          <tr class="border-b border-gray-300">
            <td class="px-4 py-2 font-medium bg-gray-100">Emergency Contacts</td>
            <td class="px-4 py-2">
              <div class="space-y-2">
                <!-- Contact 1 -->
                <div v-if="participant.emergencyContact1Name" class="border-t pt-2">
                  <div class="font-medium">Contact 1:</div>
                  <div class="ml-2 space-y-1">
                    <div><strong>Name:</strong> {{ participant.emergencyContact1Name }}</div>
                    <div><strong>Relation:</strong> {{ participant.emergencyContact1Relation }}</div>
                    <div v-if="participant.emergencyContact1HomePhone"><strong>Home Phone:</strong> {{ participant.emergencyContact1HomePhone }}</div>
                    <div v-if="participant.emergencyContact1WorkPhone"><strong>Work Phone:</strong> {{ participant.emergencyContact1WorkPhone }}</div>
                    <div v-if="participant.emergencyContact1CellPhone"><strong>Cell Phone:</strong> {{ participant.emergencyContact1CellPhone }}</div>
                    <div v-if="participant.emergencyContact1Email"><strong>Email:</strong> {{ participant.emergencyContact1Email }}</div>
                  </div>
                </div>
                <!-- Contact 2 -->
                <div v-if="participant.emergencyContact2Name" class="border-t pt-2">
                  <div class="font-medium">Contact 2:</div>
                  <div class="ml-2 space-y-1">
                    <div><strong>Name:</strong> {{ participant.emergencyContact2Name }}</div>
                    <div><strong>Relation:</strong> {{ participant.emergencyContact2Relation }}</div>
                    <div v-if="participant.emergencyContact2HomePhone"><strong>Home Phone:</strong> {{ participant.emergencyContact2HomePhone }}</div>
                    <div v-if="participant.emergencyContact2WorkPhone"><strong>Work Phone:</strong> {{ participant.emergencyContact2WorkPhone }}</div>
                    <div v-if="participant.emergencyContact2CellPhone"><strong>Cell Phone:</strong> {{ participant.emergencyContact2CellPhone }}</div>
                    <div v-if="participant.emergencyContact2Email"><strong>Email:</strong> {{ participant.emergencyContact2Email }}</div>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto p-2">
    <div v-for="key in columnsToShow" :key="key" class="space-y-2">
      <!-- Skip label for tags field as TagSelector has its own label -->
      <Label v-if="getColumnType(key) !== 'tags'" :for="key">{{ getColumnLabel(key) }}</Label>
      <template v-if="columnsToEdit.includes(key)">
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
          class="w-full"
        />
          <Textarea
            v-if="getColumnType(key) === 'textarea'"
            :id="key"
            v-model="localParticipant[key]"
            class="w-full"
        />
        <Switch
          v-if="getColumnType(key) === 'boolean'"
          :id="key"
          :model-value="localParticipant[key]"
          @update:model-value="(value: boolean) => localParticipant[key] = value"
        />
        <Select
          v-if="getColumnType(key) === 'select' && key === 'palancasCoordinator'"
          :model-value="localParticipant[key]"
          @update:model-value="(value: string) => localParticipant[key] = value"
        >
          <SelectTrigger class="w-full">
            <SelectValue placeholder="Select Palancas Coordinator" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Palanquero 1">Palanquero 1</SelectItem>
            <SelectItem value="Palanquero 2">Palanquero 2</SelectItem>
            <SelectItem value="Palanquero 3">Palanquero 3</SelectItem>
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
            <SelectItem value="Basílica">Basílica</SelectItem>
            <SelectItem value="Casa">Casa</SelectItem>
          </SelectContent>
        </Select>
        <TagSelector
          v-if="getColumnType(key) === 'tags'"
          v-model="selectedTags"
          class="w-full"
        />
      </template>
      <p v-else class="text-sm text-gray-500 pt-2">{{ getColumnType(key) === 'date' ? formatDateForDisplay(participant[key]) : (participant[key] || 'N/A') }}</p>
    </div>
  </div>
  <div class="flex justify-end gap-2 mt-4">
    <Button variant="outline" @click="handleCancel">{{ 'Cancel' }}</Button>
    <Button @click="handleSave">{{ 'Save' }}</Button>
  </div>
</template>
