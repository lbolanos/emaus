<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ $t('addRetreatModal.title') }}</DialogTitle>
        <DialogDescription>
          {{ $t('addRetreatModal.description') }}
        </DialogDescription>
      </DialogHeader>

      <form @submit.prevent="handleSubmit" class="space-y-6">
        <!-- Basic Information Section -->
        <div class="space-y-4">
          <h3 class="text-lg font-semibold border-b pb-2">{{ $t('addRetreatModal.basicInfo') }}</h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="parish" class="text-sm font-medium">
                {{ $t('addRetreatModal.parishName') }}
                <span class="text-red-500">*</span>
              </Label>
              <Input
                id="parish"
                v-model="formData.parish"
                :class="{ 'border-red-500': errors.parish }"
                :placeholder="$t('addRetreatModal.parishPlaceholder')"
                required
              />
              <p v-if="errors.parish" class="text-red-500 text-xs">{{ errors.parish }}</p>
            </div>

            <div class="space-y-2">
              <Label for="houseId" class="text-sm font-medium">
                {{ $t('addRetreatModal.house') }}
                <span class="text-red-500">*</span>
              </Label>
              <Select v-model="formData.houseId" :class="{ 'border-red-500': errors.houseId }">
                <SelectTrigger>
                  <SelectValue :placeholder="$t('addRetreatModal.selectHouse')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem
                      v-for="house in availableHouses"
                      :key="house.id"
                      :value="house.id"
                    >
                      <div class="flex flex-col">
                        <span class="font-medium">{{ house.name }}</span>
                        <span class="text-xs text-muted-foreground">{{ house.city }}, {{ house.state }}</span>
                      </div>
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p v-if="errors.houseId" class="text-red-500 text-xs">{{ errors.houseId }}</p>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="startDate" class="text-sm font-medium">
                {{ $t('addRetreatModal.startDate') }}
                <span class="text-red-500">*</span>
              </Label>
              <Input
                id="startDate"
                type="date"
                v-model="startDate"
                :min="minDate"
                :class="{ 'border-red-500': errors.startDate }"
                required
              />
              <p v-if="errors.startDate" class="text-red-500 text-xs">{{ errors.startDate }}</p>
            </div>

            <div class="space-y-2">
              <Label for="endDate" class="text-sm font-medium">
                {{ $t('addRetreatModal.endDate') }}
                <span class="text-red-500">*</span>
              </Label>
              <Input
                id="endDate"
                type="date"
                v-model="endDate"
                :min="startDate || minDate"
                :class="{ 'border-red-500': errors.endDate }"
                required
              />
              <p v-if="errors.endDate" class="text-red-500 text-xs">{{ errors.endDate }}</p>
            </div>
          </div>
        </div>

        <!-- Capacity Section -->
        <div class="space-y-4">
          <h3 class="text-lg font-semibold border-b pb-2">{{ $t('addRetreatModal.capacity') }}</h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="max_walkers" class="text-sm font-medium">
                {{ $t('addRetreatModal.max_walkers') }}
              </Label>
              <div class="relative">
                <Input
                  id="max_walkers"
                  type="number"
                  v-model.number="formData.max_walkers"
                  min="0"
                  :placeholder="$t('addRetreatModal.maxWalkersPlaceholder')"
                  class="pr-16"
                />
                <div v-if="houseCapacity.walkerBeds !== null" class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <span class="text-xs text-muted-foreground">/ {{ houseCapacity.walkerBeds }}</span>
                </div>
              </div>
              <p v-if="houseCapacity.walkerBeds !== null" class="text-xs text-muted-foreground">
                {{ $t('addRetreatModal.availableBeds', { type: $t('addRetreatModal.walkers'), count: houseCapacity.walkerBeds }) }}
              </p>
            </div>

            <div class="space-y-2">
              <Label for="max_servers" class="text-sm font-medium">
                {{ $t('addRetreatModal.max_servers') }}
              </Label>
              <div class="relative">
                <Input
                  id="max_servers"
                  type="number"
                  v-model.number="formData.max_servers"
                  min="0"
                  :placeholder="$t('addRetreatModal.maxServersPlaceholder')"
                  class="pr-16"
                />
                <div v-if="houseCapacity.serverBeds !== null" class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <span class="text-xs text-muted-foreground">/ {{ houseCapacity.serverBeds }}</span>
                </div>
              </div>
              <p v-if="houseCapacity.serverBeds !== null" class="text-xs text-muted-foreground">
                {{ $t('addRetreatModal.availableBeds', { type: $t('addRetreatModal.servers'), count: houseCapacity.serverBeds }) }}
              </p>
            </div>
          </div>
        </div>

        <!-- Settings Section -->
        <div class="space-y-4">
          <h3 class="text-lg font-semibold border-b pb-2">{{ $t('addRetreatModal.settings') }}</h3>

          <div class="space-y-4">
            <div class="flex items-center justify-between p-4 border rounded-lg">
              <div class="space-y-1">
                <Label for="isPublic" class="text-sm font-medium cursor-pointer">
                  {{ $t('addRetreatModal.isPublic') }}
                </Label>
                <p class="text-xs text-muted-foreground">
                  {{ $t('addRetreatModal.isPublicDescription') }}
                </p>
              </div>
              <Switch
                id="isPublic"
                v-model:checked="formData.isPublic"
                class="ml-4"
              />
            </div>

            <div class="flex items-center justify-between p-4 border rounded-lg">
              <div class="space-y-1">
                <Label for="roleInvitationEnabled" class="text-sm font-medium cursor-pointer">
                  {{ $t('addRetreatModal.roleInvitationEnabled') }}
                </Label>
                <p class="text-xs text-muted-foreground">
                  {{ $t('addRetreatModal.roleInvitationDescription') }}
                </p>
              </div>
              <Switch
                id="roleInvitationEnabled"
                v-model:checked="formData.roleInvitationEnabled"
                class="ml-4"
              />
            </div>
          </div>
        </div>

        <!-- Optional Fields Section -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">{{ $t('addRetreatModal.optionalFields') }}</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              @click="showOptionalFields = !showOptionalFields"
              class="text-xs"
            >
              {{ showOptionalFields ? $t('addRetreatModal.hideOptional') : $t('addRetreatModal.showOptional') }}
            </Button>
          </div>

          <div v-show="showOptionalFields" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="cost" class="text-sm font-medium">
                  {{ $t('addRetreatModal.cost') }}
                </Label>
                <Input
                  id="cost"
                  v-model="formData.cost"
                  :placeholder="$t('addRetreatModal.costPlaceholder')"
                />
              </div>
            </div>

            <div class="space-y-2">
              <Label for="openingNotes" class="text-sm font-medium">
                {{ $t('addRetreatModal.openingNotes') }}
              </Label>
              <Textarea
                id="openingNotes"
                v-model="formData.openingNotes"
                :placeholder="$t('addRetreatModal.openingNotesPlaceholder')"
                rows="3"
              />
            </div>

            <div class="space-y-2">
              <Label for="closingNotes" class="text-sm font-medium">
                {{ $t('addRetreatModal.closingNotes') }}
              </Label>
              <Textarea
                id="closingNotes"
                v-model="formData.closingNotes"
                :placeholder="$t('addRetreatModal.closingNotesPlaceholder')"
                rows="3"
              />
            </div>

            <div class="space-y-2">
              <Label for="thingsToBringNotes" class="text-sm font-medium">
                {{ $t('addRetreatModal.thingsToBringNotes') }}
              </Label>
              <Textarea
                id="thingsToBringNotes"
                v-model="formData.thingsToBringNotes"
                :placeholder="$t('addRetreatModal.thingsToBringPlaceholder')"
                rows="3"
              />
            </div>

            <div class="space-y-2">
              <Label for="paymentInfo" class="text-sm font-medium">
                {{ $t('addRetreatModal.paymentInfo') }}
              </Label>
              <Textarea
                id="paymentInfo"
                v-model="formData.paymentInfo"
                :placeholder="$t('addRetreatModal.paymentInfoPlaceholder')"
                rows="3"
              />
            </div>

            <div class="space-y-2">
              <Label for="paymentMethods" class="text-sm font-medium">
                {{ $t('addRetreatModal.paymentMethods') }}
              </Label>
              <Textarea
                id="paymentMethods"
                v-model="formData.paymentMethods"
                :placeholder="$t('addRetreatModal.paymentMethodsPlaceholder')"
                rows="3"
              />
            </div>
          </div>
        </div>

        <DialogFooter class="flex justify-between items-center">
          <div class="text-xs text-muted-foreground">
            <span class="text-red-500">*</span> {{ $t('addRetreatModal.requiredFields') }}
          </div>
          <div class="flex space-x-2">
            <Button
              type="button"
              variant="outline"
              @click="handleClose"
              :disabled="isSubmitting"
            >
              {{ $t('addRetreatModal.cancel') }}
            </Button>
            <Button
              type="submit"
              :disabled="isSubmitting || !isFormValid"
              class="min-w-[120px]"
            >
              <span v-if="isSubmitting" class="flex items-center space-x-2">
                <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>{{ $t('addRetreatModal.creating') }}</span>
              </span>
              <span v-else>{{ $t('addRetreatModal.submit') }}</span>
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  <!-- Success Dialog -->
  <Dialog :open="showSuccessDialog" @update:open="closeSuccessDialog">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle class="flex items-center space-x-2">
          <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span>{{ $t('addRetreatModal.successTitle') }}</span>
        </DialogTitle>
        <DialogDescription>
          {{ $t('addRetreatModal.successDescription') }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 class="font-medium text-green-800 mb-2">{{ $t('addRetreatModal.registrationLinks') }}</h4>

          <div class="space-y-3">
            <div>
              <Label class="text-sm font-medium text-green-700">{{ $t('addRetreatModal.walkerUrl') }}</Label>
              <div class="flex space-x-2 mt-1">
                <Input :model-value="walkerUrl" readonly class="bg-white" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  @click="copyToClipboard(walkerUrl, 'walker')"
                  class="flex-shrink-0"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                  </svg>
                </Button>
              </div>
            </div>

            <div>
              <Label class="text-sm font-medium text-green-700">{{ $t('addRetreatModal.serverUrl') }}</Label>
              <div class="flex space-x-2 mt-1">
                <Input :model-value="serverUrl" readonly class="bg-white" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  @click="copyToClipboard(serverUrl, 'server')"
                  class="flex-shrink-0"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                  </svg>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="copiedType" class="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center space-x-2">
          <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
          <span class="text-sm text-blue-800">
            {{ $t('addRetreatModal.linkCopied', { type: copiedType }) }}
          </span>
        </div>
      </div>

      <DialogFooter>
        <Button @click="closeSuccessDialog" class="w-full">
          {{ $t('addRetreatModal.closeAndContinue') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import type { CreateRetreat, Retreat } from '@repo/types';
import { useHouseStore } from '@/stores/houseStore';
import { useToast } from '@repo/ui';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, Textarea, Switch } from '@repo/ui';

interface Props {
  open: boolean;
  initialData?: Partial<CreateRetreat>;
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'submit', data: CreateRetreat): Promise<Retreat | undefined> }>();

const houseStore = useHouseStore();
const { toast } = useToast();

// State
const isSubmitting = ref(false);
const showOptionalFields = ref(false);
const showSuccessDialog = ref(false);
const createdRetreat = ref<Retreat | null>(null);
const copiedType = ref<string | null>(null);

// Form data
const formData = ref<CreateRetreat>({
  parish: '',
  startDate: new Date(),
  endDate: new Date(),
  houseId: '',
  openingNotes: '',
  closingNotes: '',
  thingsToBringNotes: '',
  cost: '',
  paymentInfo: '',
  paymentMethods: '',
  max_walkers: undefined,
  max_servers: undefined,
  isPublic: false,
  roleInvitationEnabled: true,
});

// Validation errors
const errors = ref<Record<string, string>>({});

// Computed properties
const minDate = computed(() => {
  const today = new Date();
  return today.toISOString().split('T')[0];
});

const availableHouses = computed(() => {
  return houseStore.houses;
});

const houseCapacity = computed(() => {
  const selectedHouse = availableHouses.value.find(house => house.id === formData.value.houseId);
  if (!selectedHouse || !selectedHouse.beds) {
    return { walkerBeds: null, serverBeds: null };
  }

  const walkerBeds = selectedHouse.beds.filter((bed: any) => bed.defaultUsage === 'caminante').length;
  const serverBeds = selectedHouse.beds.filter((bed: any) => bed.defaultUsage === 'servidor').length;

  return { walkerBeds, serverBeds };
});

const isFormValid = computed(() => {
  return formData.value.parish.trim() !== '' &&
         formData.value.houseId !== '' &&
         formData.value.startDate &&
         formData.value.endDate &&
         Object.keys(errors.value).length === 0;
});

const startDate = computed({
  get: () => {
    if (!formData.value.startDate) return '';

    // Handle both Date objects and ISO strings
    const date = formData.value.startDate instanceof Date
      ? formData.value.startDate
      : new Date(formData.value.startDate);

    // Check for invalid date
    if (isNaN(date.getTime())) return '';

    return date.toISOString().split('T')[0];
  },
  set: (val: string) => {
    if (val) {
      formData.value.startDate = new Date(val);
    } else {
      formData.value.startDate = new Date();
    }
    validateDates();
  },
});

const endDate = computed({
  get: () => {
    if (!formData.value.endDate) return '';

    // Handle both Date objects and ISO strings
    const date = formData.value.endDate instanceof Date
      ? formData.value.endDate
      : new Date(formData.value.endDate);

    // Check for invalid date
    if (isNaN(date.getTime())) return '';

    return date.toISOString().split('T')[0];
  },
  set: (val: string) => {
    if (val) {
      formData.value.endDate = new Date(val);
    } else {
      formData.value.endDate = new Date();
    }
    validateDates();
  },
});

const walkerUrl = computed(() => {
  if (!createdRetreat.value) return '';
  return `${window.location.origin}/register/walker/${createdRetreat.value.id}`;
});

const serverUrl = computed(() => {
  if (!createdRetreat.value) return '';
  return `${window.location.origin}/register/server/${createdRetreat.value.id}`;
});

// Methods
const validateDates = () => {
  const start = formData.value.startDate;
  const end = formData.value.endDate;

  // Clear previous date errors
  delete errors.value.startDate;
  delete errors.value.endDate;

  // Convert to Date objects for comparison
  const startDateObj = start instanceof Date ? start : new Date(start);
  const endDateObj = end instanceof Date ? end : new Date(end);
  const minDateObj = new Date(minDate.value);

  // Validate dates are not invalid
  if (start && isNaN(startDateObj.getTime())) {
    errors.value.startDate = 'Invalid start date';
    return;
  }

  if (end && isNaN(endDateObj.getTime())) {
    errors.value.endDate = 'Invalid end date';
    return;
  }

  // Validate end date is after start date
  if (start && end && startDateObj >= endDateObj) {
    errors.value.endDate = 'End date must be after start date';
  }

  // Validate start date is not in the past
  if (start && startDateObj < minDateObj) {
    errors.value.startDate = 'Start date cannot be in the past';
  }
};

const validateForm = () => {
  errors.value = {};

  if (!formData.value.parish.trim()) {
    errors.value.parish = 'Parish name is required';
  }

  if (!formData.value.houseId) {
    errors.value.houseId = 'House selection is required';
  }

  if (!formData.value.startDate) {
    errors.value.startDate = 'Start date is required';
  }

  if (!formData.value.endDate) {
    errors.value.endDate = 'End date is required';
  }

  validateDates();

  return Object.keys(errors.value).length === 0;
};

const handleSubmit = async () => {
  if (!validateForm()) {
    toast({
      title: 'Validation Error',
      description: 'Please fix the errors before submitting.',
      variant: 'destructive',
    });
    return;
  }

  isSubmitting.value = true;

  try {
    const retreat = await emit('submit', { ...formData.value });
    if (retreat) {
      createdRetreat.value = retreat;
      showSuccessDialog.value = true;
      resetForm();
    }
  } catch (error: any) {
    toast({
      title: 'Error',
      description: error.response?.data?.message || error.message || 'Failed to create retreat.',
      variant: 'destructive',
    });
  } finally {
    isSubmitting.value = false;
  }
};

const resetForm = () => {
  // Set default dates (today and tomorrow)
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  formData.value = {
    parish: '',
    startDate: today,
    endDate: tomorrow,
    houseId: '',
    openingNotes: '',
    closingNotes: '',
    thingsToBringNotes: '',
    cost: '',
    paymentInfo: '',
    paymentMethods: '',
    max_walkers: undefined,
    max_servers: undefined,
    isPublic: false,
    roleInvitationEnabled: true,
  };
  errors.value = {};
  showOptionalFields.value = false;
};

const handleClose = () => {
  if (!isSubmitting.value) {
    resetForm();
    emit('update:open', false);
  }
};

const closeSuccessDialog = () => {
  showSuccessDialog.value = false;
  createdRetreat.value = null;
  copiedType.value = null;
  emit('update:open', false);
};

const copyToClipboard = async (text: string, type: string) => {
  try {
    await navigator.clipboard.writeText(text);
    copiedType.value = type;

    // Clear the copied notification after 3 seconds
    setTimeout(() => {
      copiedType.value = null;
    }, 3000);
  } catch (error) {
    toast({
      title: 'Error',
      description: 'Failed to copy link to clipboard.',
      variant: 'destructive',
    });
  }
};

// Watch for initial data changes (for editing mode)
watch(() => props.open, (newOpen) => {
  if (newOpen && props.initialData) {
    // Populate form with initial data for editing
    formData.value = {
      ...formData.value,
      ...props.initialData,
      // Ensure dates are properly handled
      startDate: props.initialData.startDate ? new Date(props.initialData.startDate) : new Date(),
      endDate: props.initialData.endDate ? new Date(props.initialData.endDate) : new Date(),
    };
    validateDates();
  } else if (newOpen) {
    // Reset form for creating new retreat
    resetForm();
  }
});

// Watch for house selection changes
watch(() => formData.value.houseId, async (newHouseId) => {
  if (newHouseId) {
    try {
      const house = await houseStore.fetchHouseById(newHouseId);
      if (house && house.beds) {
        const walkerBeds = house.beds.filter((b: any) => b.defaultUsage === 'caminante').length;
        const serverBeds = house.beds.filter((b: any) => b.defaultUsage === 'servidor').length;
        formData.value.max_walkers = walkerBeds;
        formData.value.max_servers = serverBeds;
      }
    } catch (error) {
      console.error('Error fetching house details:', error);
    }
  }
});

// Initialize
onMounted(() => {
  if (houseStore.houses.length === 0) {
    houseStore.fetchHouses();
  }

  // Validate initial dates
  validateDates();
});
</script>
