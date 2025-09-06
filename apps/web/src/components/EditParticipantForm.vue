<script setup lang="ts">
import { ref, watch } from 'vue';
import { Button } from '@repo/ui/components/ui/button';
import { Input } from '@repo/ui/components/ui/input';
import { Label } from '@repo/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/ui/select';
import { Switch } from '@repo/ui/components/ui/switch';
import { Textarea } from '@repo/ui/components/ui/textarea';

const props = defineProps<{
  participant: any;
  columnsToShow: string[];
  columnsToEdit: string[];
  allColumns: { key: string; label: string; type?: string }[];
}>();

const emit = defineEmits(['save', 'cancel']);

const localParticipant = ref<any>({});

watch(() => props.participant, (newVal) => {
  localParticipant.value = { ...newVal };
}, { immediate: true, deep: true });

const getColumnLabel = (key: string) => {
  const col = props.allColumns.find(c => c.key === key);
  return col ? col.label : key;
};

const getColumnType = (key: string) => {
    const col = props.allColumns.find(c => c.key === key);
    if (col && col.type) return col.type;
    if (key === 'palancasCoordinator' || key === 'pickupLocation') return 'select';
    if (key.startsWith('is') || key.startsWith('has') || key.startsWith('requests') || key === 'arrivesOnOwn' || key === 'snores' || key === 'palancasRequested') return 'boolean';
    if (key.toLowerCase().includes('notes') || key.toLowerCase().includes('details')) return 'textarea';
    if (key.toLowerCase().includes('date')) return 'date';
    return 'text';
}

const handleSave = () => {
  const participantToSave = { ...localParticipant.value };
  if (participantToSave.retreatBedId === null || participantToSave.retreatBedId === '') {
    delete participantToSave.retreatBedId;
  }
  if (participantToSave.tableId === null || participantToSave.tableId === '') {
    delete participantToSave.tableId;
  }

  for (const key in participantToSave) {
    if (getColumnType(key) === 'boolean' && participantToSave[key] === null) {
      participantToSave[key] = false;
    }
  }

  emit('save', participantToSave);
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
      <Label :for="key">{{ getColumnLabel(key) }}</Label>
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
          @update:model-value="(value: string) => localParticipant[key] = value"
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
      </template>
      <p v-else class="text-sm text-gray-500 pt-2">{{ participant[key] || 'N/A' }}</p>
    </div>
  </div>
  <div class="flex justify-end gap-2 mt-4">
    <Button variant="outline" @click="handleCancel">{{ 'Cancel' }}</Button>
    <Button @click="handleSave">{{ 'Save' }}</Button>
  </div>
</template>
