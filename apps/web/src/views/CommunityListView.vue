<template>
  <div class="p-4 space-y-4">
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-bold">{{ $t('community.title') }}</h1>
      <Button @click="openAddModal">
        <Plus class="w-4 h-4 mr-2" />
        {{ $t('community.addCommunity') }}
      </Button>
    </div>

    <div v-if="loading" class="flex justify-center py-8">
      <Loader2 class="w-8 h-8 animate-spin text-primary" />
    </div>

    <div v-else-if="validCommunities.length === 0" class="text-center py-12 border rounded-lg bg-muted/50">
      <Users class="w-12 h-12 mx-auto text-muted-foreground mb-4" />
      <p class="text-muted-foreground">{{ $t('community.noCommunitiesFound') }}</p>
      <Button variant="outline" class="mt-4" @click="openAddModal">
        {{ $t('community.addCommunity') }}
      </Button>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card v-for="community in validCommunities" :key="community.id" class="hover:shadow-md transition-shadow">
        <CardHeader>
          <CardTitle class="flex justify-between items-start">
            <router-link :to="{ name: 'community-dashboard', params: { id: community.id } }" class="hover:underline">
              {{ community.name }}
            </router-link>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal class="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @click="openEditModal(community)">
                  <Edit class="w-4 h-4 mr-2" />
                  {{ $t('community.editCommunity') }}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem @click="confirmDelete(community)" class="text-destructive focus:text-destructive">
                  <Trash2 class="w-4 h-4 mr-2" />
                  {{ $t('community.deleteCommunity') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardTitle>
          <CardDescription>{{ community.description || `${community.city}, ${community.state}` }}</CardDescription>
        </CardHeader>
        <CardFooter class="flex justify-between border-t pt-4">
          <div class="flex space-x-4 text-sm text-muted-foreground">
            <div class="flex items-center">
              <Users class="w-4 h-4 mr-1" />
              {{ community.memberCount || 0 }}
            </div>
          </div>
          <Button variant="outline" size="sm" as-child>
            <router-link :to="{ name: 'community-dashboard', params: { id: community.id } }">
              {{ $t('community.dashboard') }}
              <ChevronRight class="w-4 h-4 ml-1" />
            </router-link>
          </Button>
        </CardFooter>
      </Card>
    </div>

    <!-- Modals -->
    <Dialog :open="isFormModalOpen" @update:open="isFormModalOpen = $event">
      <DialogContent class="sm:max-w-[700px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{{ editingCommunity ? $t('community.editCommunity') : $t('community.addCommunity') }}</DialogTitle>
          <DialogDescription>
            {{ editingCommunity ? 'Edita los detalles de la comunidad.' : 'Ingresa los detalles de la nueva comunidad.' }}
          </DialogDescription>
        </DialogHeader>
        <form @submit.prevent="handleSave" class="flex-1 flex flex-col overflow-hidden">
          <div class="flex-1 overflow-y-auto py-4 space-y-4">
            <div class="space-y-2">
              <Label for="name">{{ $t('community.communityName') }} <span class="text-red-500">*</span></Label>
              <Input id="name" v-model="form.name" placeholder="Ej: Comunidad San Juan" />
            </div>

            <div class="space-y-2">
              <Label for="address1">Dirección <span class="text-red-500">*</span></Label>
              <div class="relative">
                <gmp-place-autocomplete
                  v-if="address1_is_editing"
                  ref="autocompleteField"
                  class="w-full"
                  placeholder="Buscar dirección..."
                  :requested-fields="['addressComponents', 'location', 'googleMapsURI']"
                  :value="form.address1"
                >
                </gmp-place-autocomplete>
                <div v-else class="relative">
                  <Input
                    id="address1"
                    v-model="form.address1"
                    class="pr-10"
                    @click="address1_is_editing = true"
                    readonly
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    class="absolute right-0 top-0 h-full px-2"
                    @click="address1_is_editing = true"
                  >
                    <Search class="w-4 h-4" />
                  </Button>
                </div>
                <p class="text-foreground/70 text-xs mt-1">Click para buscar o editar dirección usando Google Maps</p>
              </div>
            </div>

            <div class="space-y-2">
              <Label for="address2">Dirección 2</Label>
              <Input id="address2" v-model="form.address2" placeholder="Apartamento, suite, etc. (opcional)" />
              <p class="text-foreground/70 text-xs mt-1">Información adicional de la dirección</p>
            </div>

            <!-- Read-only fields that get auto-filled -->
            <div class="bg-muted p-3 rounded-lg">
              <p class="text-sm text-foreground mb-2 font-medium">Estos campos se autocompletan al seleccionar una dirección:</p>
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1">
                  <Label for="city" class="text-sm">Ciudad</Label>
                  <Input
                    id="city"
                    v-model="form.city"
                    placeholder="Ciudad"
                    readonly
                    class="bg-background text-foreground"
                  />
                </div>
                <div class="space-y-1">
                  <Label for="state" class="text-sm">Estado</Label>
                  <Input
                    id="state"
                    v-model="form.state"
                    placeholder="Estado"
                    readonly
                    class="bg-background text-foreground"
                  />
                </div>
                <div class="space-y-1">
                  <Label for="zipCode" class="text-sm">C.P.</Label>
                  <Input
                    id="zipCode"
                    v-model="form.zipCode"
                    placeholder="Código Postal"
                    readonly
                    class="bg-background text-foreground"
                  />
                </div>
                <div class="space-y-1">
                  <Label for="country" class="text-sm">País</Label>
                  <Input
                    id="country"
                    v-model="form.country"
                    placeholder="País"
                    readonly
                    class="bg-background text-foreground"
                  />
                </div>
              </div>
              <div class="mt-3 space-y-1">
                <Label for="googleMapsUrl" class="text-sm">URL Google Maps</Label>
                <div class="flex gap-2">
                  <Input
                    id="googleMapsUrl"
                    v-model="form.googleMapsUrl"
                    placeholder="https://maps.google.com/..."
                    readonly
                    class="bg-background"
                  />
                  <Button
                    v-if="form.googleMapsUrl"
                    type="button"
                    variant="outline"
                    size="sm"
                    @click="openGoogleMaps"
                    class="whitespace-nowrap"
                  >
                    <ExternalLink class="w-4 h-4 mr-1" />
                    Ver
                  </Button>
                </div>
                <p class="text-foreground/70 text-xs mt-1">Se genera automáticamente al seleccionar la dirección</p>
              </div>
            </div>

            <div class="space-y-2">
              <Label for="description">{{ $t('community.description') }}</Label>
              <Textarea id="description" v-model="form.description" rows="3" placeholder="Describe la comunidad..." />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="isFormModalOpen = false">{{ $t('addRetreatModal.cancel') }}</Button>
            <Button type="submit" :disabled="isSaving">
              <Loader2 v-if="isSaving" class="w-4 h-4 mr-2 animate-spin" />
              {{ $t('community.saveCommunity') }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog :open="isDeleteDialogOpen" @update:open="isDeleteDialogOpen = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('delete.confirmTitle') }}</DialogTitle>
          <DialogDescription>
            {{ $t('community.deleteConfirm') }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="isDeleteDialogOpen = false">{{ $t('addRetreatModal.cancel') }}</Button>
          <Button variant="destructive" @click="handleDelete">
            {{ $t('community.deleteCommunity') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue';
import { useCommunityStore } from '@/stores/communityStore';
import { storeToRefs } from 'pinia';
import { Plus, Users, MoreHorizontal, Edit, Trash2, ChevronRight, Loader2, Search, ExternalLink } from 'lucide-vue-next';
import {
  Button, Card, CardHeader, CardTitle, CardDescription, CardFooter,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Label, Input, Textarea,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator
} from '@repo/ui';
import { useToast } from '@repo/ui';

const communityStore = useCommunityStore();
const { communities, loading } = storeToRefs(communityStore);
const { toast } = useToast();

const validCommunities = computed(() => {
  if (!Array.isArray(communities.value)) {
    return [];
  }
  return communities.value.filter(c => c && c.id);
});

const isFormModalOpen = ref(false);
const isDeleteDialogOpen = ref(false);
const isSaving = ref(false);
const editingCommunity = ref<any>(null);
const communityToDelete = ref<any>(null);
const address1_is_editing = ref(true);
const autocompleteField = ref<any>(null);

const form = ref({
  name: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  zipCode: '',
  country: '',
  googleMapsUrl: '',
  latitude: null as number | null,
  longitude: null as number | null,
  description: ''
});

const handlePlaceChange = async ({ placePrediction }: any) => {
  if (!placePrediction) return;

  const place = placePrediction.toPlace();
  await place.fetchFields({
    fields: ['addressComponents', 'displayName', 'location', 'googleMapsURI'],
  });

  if (place.addressComponents) {
    const address: { [key: string]: string } = {};
    place.addressComponents.forEach((component: any) => {
      const type = component.types[0];
      address[type] = component.longText;
    });
    form.value.address1 = `${address.route || ''} ${address.street_number || ''}, ${address.sublocality_level_1 || ''}`.trim();
    form.value.city = address.locality || '';
    form.value.state = address.administrative_area_level_1 || '';
    form.value.zipCode = address.postal_code || '';
    form.value.country = address.country || '';
  }
  if (place.location) {
    form.value.latitude = place.location.lat();
    form.value.longitude = place.location.lng();
  }
  if (place.googleMapsURI) {
    form.value.googleMapsUrl = place.googleMapsURI;
  }
  address1_is_editing.value = false;
};

const openGoogleMaps = () => {
  if (form.value.googleMapsUrl) {
    window.open(form.value.googleMapsUrl, '_blank');
  }
};

// Watch for autocomplete field changes to set up event listener
watch(autocompleteField, (newField, oldField) => {
  if (oldField) {
    oldField.removeEventListener('gmp-select', handlePlaceChange);
  }
  if (newField) {
    newField.addEventListener('gmp-select', handlePlaceChange);
  }
});

// Watch for modal opening to reset autocomplete state
watch(isFormModalOpen, async (isOpen) => {
  if (isOpen) {
    await nextTick();
    if (autocompleteField.value && form.value.address1) {
      autocompleteField.value.value = form.value.address1;
      address1_is_editing.value = false;
    } else {
      address1_is_editing.value = true;
    }
  } else {
    // Clean up when modal closes
    await nextTick();

    // Remove event listener from autocomplete field
    if (autocompleteField.value) {
      autocompleteField.value.removeEventListener('gmp-select', handlePlaceChange);
    }
    autocompleteField.value = null;

    // Remove Google Places autocomplete dropdowns
    document.querySelectorAll('.pac-container').forEach(el => el.remove());

    // CRITICAL: Ensure body is interactive after modal closes
    // Use setTimeout to ensure this runs after Radix cleanup
    setTimeout(() => {
      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
      // Remove any remaining fixed overlays
      const overlays = document.querySelectorAll('[data-radix-popper-content-wrapper], [data-radix-dropdown-menu-content]');
      overlays.forEach(el => {
        const parent = el.parentElement;
        if (parent && parent.parentElement) {
          parent.parentElement.removeChild(parent);
        }
      });
    }, 100);
  }
});

onMounted(async () => {
  await communityStore.fetchCommunities();
});

const openAddModal = () => {
  editingCommunity.value = null;
  form.value = {
    name: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    zipCode: '',
    country: '',
    googleMapsUrl: '',
    latitude: null,
    longitude: null,
    description: ''
  };
  address1_is_editing.value = true;
  isFormModalOpen.value = true;
};

const openEditModal = (community: any) => {
  editingCommunity.value = community;
  form.value = {
    name: community.name,
    address1: community.address1,
    address2: community.address2 || '',
    city: community.city || '',
    state: community.state || '',
    zipCode: community.zipCode || '',
    country: community.country || '',
    googleMapsUrl: community.googleMapsUrl || '',
    latitude: community.latitude || null,
    longitude: community.longitude || null,
    description: community.description || ''
  };
  address1_is_editing.value = false;
  isFormModalOpen.value = true;
};

const handleSave = async () => {
  if (!form.value.name || !form.value.address1) {
    toast({
      title: 'Campos requeridos',
      description: 'Por favor completa el nombre y la dirección',
      variant: 'destructive',
    });
    return;
  }

  isSaving.value = true;
  try {
    if (autocompleteField.value) {
      form.value.address1 = autocompleteField.value.value || form.value.address1;
    }

    const dataToSave = {
      ...form.value,
      latitude: form.value.latitude || null,
      longitude: form.value.longitude || null,
    };

    if (editingCommunity.value) {
      await communityStore.updateCommunity(editingCommunity.value.id, dataToSave);
    } else {
      await communityStore.createCommunity(dataToSave);
    }
    isFormModalOpen.value = false;
    toast({
      title: editingCommunity.value ? 'Comunidad actualizada' : 'Comunidad creada',
      description: editingCommunity.value
        ? 'La comunidad ha sido actualizada exitosamente.'
        : 'La comunidad ha sido creada exitosamente.',
    });
  } catch (error: any) {
    console.error('Failed to save community:', error);
    toast({
      title: 'Error',
      description: error.message || 'No se pudo guardar la comunidad',
      variant: 'destructive',
    });
  } finally {
    isSaving.value = false;
  }
};

const confirmDelete = (community: any) => {
  communityToDelete.value = community;
  isDeleteDialogOpen.value = true;
};

const handleDelete = async () => {
  if (!communityToDelete.value) return;

  try {
    await communityStore.deleteCommunity(communityToDelete.value.id);
    toast({
      title: 'Comunidad Eliminada',
      description: 'La comunidad ha sido eliminada exitosamente.'
    });
  } catch (error) {
    console.error('Failed to delete community:', error);
  } finally {
    isDeleteDialogOpen.value = false;
    communityToDelete.value = null;
  }
};
</script>
