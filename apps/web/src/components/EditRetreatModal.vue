<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle class="text-xl">{{ $t('editRetreatModal.title') }}</DialogTitle>
        <DialogDescription>{{ $t('editRetreatModal.description') }}</DialogDescription>
      </DialogHeader>

      <form @submit.prevent="handleSubmit" class="space-y-6">
        <!-- Basic Information Section -->
        <div class="space-y-4">
          <h3 class="text-lg font-medium text-foreground">{{ $t('editRetreatModal.sections.basicInfo') }}</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="parish">{{ $t('editRetreatModal.parish') }}</Label>
              <Input
                id="parish"
                v-model="form.parish"
                :class="{ 'border-red-500': errors.parish }"
                :placeholder="$t('editRetreatModal.parishPlaceholder')"
                required
              />
              <p v-if="errors.parish" class="text-sm text-red-500">{{ errors.parish }}</p>
            </div>

            <div class="space-y-2">
              <Label for="houseId">{{ $t('editRetreatModal.house') }}</Label>
              <Select v-model="form.houseId">
                <SelectTrigger id="houseId" :class="{ 'border-red-500': errors.houseId }">
                  <SelectValue :placeholder="$t('editRetreatModal.selectHouse')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem v-for="house in houseStore.houses" :key="house.id" :value="house.id">
                      {{ house.name }}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p v-if="errors.houseId" class="text-sm text-red-500">{{ errors.houseId }}</p>
            </div>

            <div class="space-y-2">
              <Label for="startDate">{{ $t('editRetreatModal.startDate') }}</Label>
              <Input
                id="startDate"
                type="date"
                v-model="startDate"
                :class="{ 'border-red-500': errors.startDate }"
                required
              />
              <p v-if="errors.startDate" class="text-sm text-red-500">{{ errors.startDate }}</p>
            </div>

            <div class="space-y-2">
              <Label for="endDate">{{ $t('editRetreatModal.endDate') }}</Label>
              <Input
                id="endDate"
                type="date"
                v-model="endDate"
                :class="{ 'border-red-500': errors.endDate }"
                required
              />
              <p v-if="errors.endDate" class="text-sm text-red-500">{{ errors.endDate }}</p>
            </div>
          </div>
        </div>

        <!-- Capacity Section -->
        <div class="space-y-4">
          <h3 class="text-lg font-medium text-foreground">{{ $t('editRetreatModal.sections.capacity') }}</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="max_walkers">{{ $t('editRetreatModal.max_walkers') }}</Label>
              <Input
                id="max_walkers"
                type="number"
                v-model.number="form.max_walkers"
                :placeholder="$t('editRetreatModal.maxWalkersPlaceholder')"
                :class="{ 'border-red-500': errors.max_walkers }"
                min="1"
              />
              <p v-if="errors.max_walkers" class="text-sm text-red-500">{{ errors.max_walkers }}</p>
            </div>

            <div class="space-y-2">
              <Label for="max_servers">{{ $t('editRetreatModal.max_servers') }}</Label>
              <Input
                id="max_servers"
                type="number"
                v-model.number="form.max_servers"
                :placeholder="$t('editRetreatModal.maxServersPlaceholder')"
                :class="{ 'border-red-500': errors.max_servers }"
                min="1"
              />
              <p v-if="errors.max_servers" class="text-sm text-red-500">{{ errors.max_servers }}</p>
            </div>
          </div>
        </div>

        <!-- Settings Section -->
        <div class="space-y-4">
          <h3 class="text-lg font-medium text-foreground">{{ $t('editRetreatModal.sections.settings') }}</h3>
          <div class="space-y-4">
            <div class="flex items-center justify-between p-4 border rounded-lg">
              <div class="space-y-1">
                <Label for="isPublic" class="font-medium">{{ $t('editRetreatModal.isPublic') }}</Label>
                <p class="text-sm text-muted-foreground">{{ $t('editRetreatModal.isPublicDescription') }}</p>
              </div>
              <Switch
                id="isPublic"
                v-model:checked="form.isPublic"
                :disabled="isLoading"
              />
            </div>

            <div class="flex items-center justify-between p-4 border rounded-lg">
              <div class="space-y-1">
                <Label for="roleInvitationEnabled" class="font-medium">{{ $t('editRetreatModal.roleInvitationEnabled') }}</Label>
                <p class="text-sm text-muted-foreground">{{ $t('editRetreatModal.roleInvitationDescription') }}</p>
              </div>
              <Switch
                id="roleInvitationEnabled"
                v-model:checked="form.roleInvitationEnabled"
                :disabled="isLoading"
              />
            </div>
          </div>
        </div>

        <!-- Payment Information Section -->
        <div class="space-y-4">
          <h3 class="text-lg font-medium text-foreground">{{ $t('editRetreatModal.sections.paymentInfo') }}</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="cost">{{ $t('editRetreatModal.cost') }}</Label>
              <Input
                id="cost"
                v-model="form.cost"
                :placeholder="$t('editRetreatModal.costPlaceholder')"
              />
            </div>
          </div>

          <div class="space-y-2">
            <Label for="paymentInfo">{{ $t('editRetreatModal.paymentInfo') }}</Label>
            <Textarea
              id="paymentInfo"
              v-model="form.paymentInfo"
              :placeholder="$t('editRetreatModal.paymentInfoPlaceholder')"
              rows="3"
            />
          </div>

          <div class="space-y-2">
            <Label for="paymentMethods">{{ $t('editRetreatModal.paymentMethods') }}</Label>
            <Textarea
              id="paymentMethods"
              v-model="form.paymentMethods"
              :placeholder="$t('editRetreatModal.paymentMethodsPlaceholder')"
              rows="3"
            />
          </div>
        </div>

        <!-- Optional Notes Section -->
        <details class="space-y-4">
          <summary class="cursor-pointer text-lg font-medium text-foreground hover:text-primary">
            {{ $t('editRetreatModal.sections.optionalNotes') }}
          </summary>
          <div class="space-y-4 pt-4">
            <div class="space-y-2">
              <Label for="openingNotes">{{ $t('editRetreatModal.openingNotes') }}</Label>
              <Textarea
                id="openingNotes"
                v-model="form.openingNotes"
                :placeholder="$t('editRetreatModal.openingNotesPlaceholder')"
                rows="3"
              />
            </div>

            <div class="space-y-2">
              <Label for="closingNotes">{{ $t('editRetreatModal.closingNotes') }}</Label>
              <Textarea
                id="closingNotes"
                v-model="form.closingNotes"
                :placeholder="$t('editRetreatModal.closingNotesPlaceholder')"
                rows="3"
              />
            </div>

            <div class="space-y-2">
              <Label for="thingsToBringNotes">{{ $t('editRetreatModal.thingsToBringNotes') }}</Label>
              <Textarea
                id="thingsToBringNotes"
                v-model="form.thingsToBringNotes"
                :placeholder="$t('editRetreatModal.thingsToBringPlaceholder')"
                rows="3"
              />
            </div>
          </div>
        </details>

        <DialogFooter>
          <Button type="button" variant="outline" @click="$emit('update:open', false)" :disabled="isLoading">
            {{ $t('editRetreatModal.cancel') }}
          </Button>
          <Button type="submit" :disabled="isLoading">
            <Loader2 v-if="isLoading" class="w-4 h-4 mr-2 animate-spin" />
            {{ $t('editRetreatModal.saveChanges') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Button, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, Textarea, Switch } from '@repo/ui';
import { Loader2 } from 'lucide-vue-next';
import { useHouseStore } from '@/stores/houseStore';
import { useRetreatStore } from '@/stores/retreatStore';
import type { Retreat } from '@repo/types';

const props = defineProps<{ open: boolean; retreat: Retreat | null }>();
const emit = defineEmits(['update:open']);

const houseStore = useHouseStore();
const retreatStore = useRetreatStore();

const isLoading = ref(false);
const errors = ref<Record<string, string>>({});

const form = ref<Partial<Retreat>>({
  id: '',
  parish: '',
  startDate: new Date(),
  endDate: new Date(),
  houseId: undefined,
  max_walkers: undefined,
  max_servers: undefined,
  isPublic: false,
  roleInvitationEnabled: true,
});

// Computed properties for date handling
const startDate = computed({
  get: () => {
    if (!form.value.startDate) return '';
    const date = form.value.startDate instanceof Date
      ? form.value.startDate
      : new Date(form.value.startDate);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  },
  set: (val: string) => {
    if (val) {
      form.value.startDate = new Date(val);
    } else {
      form.value.startDate = new Date();
    }
    validateDates();
  },
});

const endDate = computed({
  get: () => {
    if (!form.value.endDate) return '';
    const date = form.value.endDate instanceof Date
      ? form.value.endDate
      : new Date(form.value.endDate);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  },
  set: (val: string) => {
    if (val) {
      form.value.endDate = new Date(val);
    } else {
      form.value.endDate = new Date();
    }
    validateDates();
  },
});

// Validation functions
const validateForm = () => {
  errors.value = {};

  if (!form.value.parish?.trim()) {
    errors.value.parish = 'La parroquia es requerida';
  }

  if (!form.value.houseId) {
    errors.value.houseId = 'Debe seleccionar una casa';
  }

  validateDates();

  if (form.value.max_walkers !== undefined && form.value.max_walkers < 1) {
    errors.value.max_walkers = 'El número máximo de caminantes debe ser mayor a 0';
  }

  if (form.value.max_servers !== undefined && form.value.max_servers < 1) {
    errors.value.max_servers = 'El número máximo de servidores debe ser mayor a 0';
  }

  return Object.keys(errors.value).length === 0;
};

const validateDates = () => {
  errors.value.startDate = '';
  errors.value.endDate = '';

  if (!startDate.value) {
    errors.value.startDate = 'La fecha de inicio es requerida';
    return;
  }

  if (!endDate.value) {
    errors.value.endDate = 'La fecha de fin es requerida';
    return;
  }

  const start = new Date(startDate.value);
  const end = new Date(endDate.value);

  if (start >= end) {
    errors.value.endDate = 'La fecha de fin debe ser posterior a la fecha de inicio';
  }
};

// Watch for retreat changes
watch(() => props.retreat, (newRetreat) => {
  if (newRetreat) {
    form.value = {
      ...newRetreat,
      startDate: new Date(newRetreat.startDate),
      endDate: new Date(newRetreat.endDate)
    };
    errors.value = {};
  }
}, { immediate: true });

onMounted(() => {
  houseStore.fetchHouses();
});

const handleSubmit = async () => {
  if (!validateForm()) {
    return;
  }

  if (form.value.id && form.value.parish && form.value.houseId) {
    isLoading.value = true;
    try {
      await retreatStore.updateRetreat({
        ...form.value,
        id: form.value.id,
        parish: form.value.parish,
        houseId: form.value.houseId,
        isPublic: form.value.isPublic ?? false,
        roleInvitationEnabled: form.value.roleInvitationEnabled ?? true,
        startDate: new Date(form.value.startDate as string | Date),
        endDate: new Date(form.value.endDate as string | Date)
      } as Retreat);
      emit('update:open', false);
    } catch (error) {
      console.error('Error updating retreat:', error);
    } finally {
      isLoading.value = false;
    }
  }
};
</script>
