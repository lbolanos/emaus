<template>
  <div class="p-4 max-w-6xl mx-auto">
    <div v-if="isLoading" class="flex items-center justify-center p-8">
      <Loader2 class="w-8 h-8 animate-spin mr-2" />
      <span>Cargando...</span>
    </div>

    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <p class="text-red-800">{{ error }}</p>
    </div>

    <div v-else>
      <h1 class="text-3xl font-bold mb-6 flex items-center">
        {{ $t('retreatDashboard.title') }}
      </h1>

      <div v-if="selectedRetreat">
        <!-- Header Info Card -->
        <Card class="mb-6">
          <CardHeader>
            <CardTitle class="flex items-center">
              {{ selectedRetreat.parish }} -
              {{ new Date(selectedRetreat.startDate).toLocaleDateString() }}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <!-- Walkers Section -->
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Users class="w-5 h-5" />
                    <span class="font-medium">{{ $t('retreatDashboard.walkersCount') }}</span>
                  </div>
                  <Badge :variant="walkersStatus === 'full' ? 'destructive' : walkersStatus === 'warning' ? 'secondary' : 'default'">
                    {{ walkersCount }}/{{ selectedRetreat.max_walkers || '∞' }}
                  </Badge>
                </div>
                <Progress v-if="selectedRetreat.max_walkers" :value="walkersPercentage" class="h-2" />
                <p class="text-sm text-gray-600">{{ Math.round(walkersPercentage) }}% de capacidad</p>
              </div>

              <!-- Servers Section -->
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <UserPlus class="w-5 h-5" />
                    <span class="font-medium">{{ $t('retreatDashboard.serversCount') }}</span>
                  </div>
                  <Badge :variant="serversStatus === 'full' ? 'destructive' : serversStatus === 'warning' ? 'secondary' : 'default'">
                    {{ serversCount }}/{{ selectedRetreat.max_servers || '∞' }}
                  </Badge>
                </div>
                <Progress v-if="selectedRetreat.max_servers" :value="serversPercentage" class="h-2" />
                <p class="text-sm text-gray-600">{{ Math.round(serversPercentage) }}% de capacidad</p>
              </div>

              <!-- Waiting Section -->
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Clock class="w-5 h-5" />
                    <span class="font-medium">{{ $t('retreatDashboard.waitingCount') }}</span>
                  </div>
                  <Badge variant="secondary">
                    {{ waitingCount }}
                  </Badge>
                </div>
                <p class="text-sm text-gray-600">En lista de espera</p>
              </div>
            </div>

            <div class="flex items-center gap-2 mt-4">
              <Button @click="showInviteModal = true" variant="outline">
                <Mail class="w-4 h-4 mr-2" />
                Invitar Alguien
              </Button>
            </div>
          </CardContent>
        </Card>


      <!-- Inventory Alerts Section -->
      <div v-if="inventoryAlerts.length > 0" class="mt-4">
        <Card class="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle class="text-red-800 flex items-center">
              <AlertTriangle class="w-5 h-5 mr-2" />
              Alertas de Inventario
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div v-for="alert in inventoryAlerts.slice(0, 6)" :key="alert.id" class="bg-white p-3 rounded-lg border border-red-200">
                <div class="font-medium text-red-800 text-sm">{{ alert.itemName }}</div>
                <div class="text-xs text-gray-600">{{ alert.categoryName }} - {{ alert.teamName }}</div>
                <div class="text-xs font-medium text-red-600">
                  Faltan: {{ alert.deficit }} {{ alert.unit }}
                </div>
                <div class="text-xs text-gray-500">
                  Req: {{ alert.requiredQuantity }} | Act: {{ alert.currentQuantity }}
                </div>
              </div>
            </div>
            <div v-if="inventoryAlerts.length > 6" class="mt-3 text-center">
              <Button variant="outline" size="sm" @click="$router.push({ name: 'inventory', params: { id: selectedRetreat.id } })">
                Ver todas las {{ inventoryAlerts.length }} alertas
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
        <!-- Registration Links Section -->
        <Card class="mb-6">
          <CardHeader>
            <CardTitle>Enlaces de Registro</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Walker Registration -->
              <div class="space-y-2">
                <label class="text-sm font-medium">{{ $t('retreatDashboard.walkerRegistrationLink') }}</label>
                <div class="flex items-center gap-2">
                  <Button size="sm" @click="copyLink(walkerRegistrationLink)" variant="outline">
                    <Copy class="w-4 h-4 mr-1" />
                    {{ $t('retreatDashboard.copyLink') }}
                  </Button>
                  <Button size="sm" @click="openLink(walkerRegistrationLink)" variant="outline">
                    <ExternalLink class="w-4 h-4 mr-1" />
                    {{ $t('retreatDashboard.openLink') }}
                  </Button>
                  <Button size="sm" @click="showQrCode(walkerRegistrationLink)" variant="outline">
                    <QrCode class="w-4 h-4 mr-1" />
                    {{ $t('retreatDashboard.showQr') }}
                  </Button>
                </div>
              </div>

              <!-- Server Registration -->
              <div class="space-y-2">
                <label class="text-sm font-medium">{{ $t('retreatDashboard.serverRegistrationLink') }}</label>
                <div class="flex items-center gap-2">
                  <Button size="sm" @click="copyLink(serverRegistrationLink)" variant="outline">
                    <Copy class="w-4 h-4 mr-1" />
                    {{ $t('retreatDashboard.copyLink') }}
                  </Button>
                  <Button size="sm" @click="openLink(serverRegistrationLink)" variant="outline">
                    <ExternalLink class="w-4 h-4 mr-1" />
                    {{ $t('retreatDashboard.openLink') }}
                  </Button>
                  <Button size="sm" @click="showQrCode(serverRegistrationLink)" variant="outline">
                    <QrCode class="w-4 h-4 mr-1" />
                    {{ $t('retreatDashboard.showQr') }}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <!-- Additional Information Section -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card v-if="selectedRetreat.openingNotes">
            <CardHeader>
              <CardTitle class="text-lg">{{ $t('retreatDashboard.openingNotes') }}</CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-sm">{{ selectedRetreat.openingNotes }}</p>
            </CardContent>
          </Card>

          <Card v-if="selectedRetreat.closingNotes">
            <CardHeader>
              <CardTitle class="text-lg">{{ $t('retreatDashboard.closingNotes') }}</CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-sm">{{ selectedRetreat.closingNotes }}</p>
            </CardContent>
          </Card>

          <Card v-if="selectedRetreat.thingsToBringNotes">
            <CardHeader>
              <CardTitle class="text-lg">{{ $t('retreatDashboard.thingsToBringNotes') }}</CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-sm">{{ selectedRetreat.thingsToBringNotes }}</p>
            </CardContent>
          </Card>

          <Card v-if="selectedRetreat.cost || selectedRetreat.paymentInfo || selectedRetreat.paymentMethods">
            <CardHeader>
              <CardTitle class="text-lg">Información de Pago</CardTitle>
            </CardHeader>
            <CardContent class="space-y-3">
              <div v-if="selectedRetreat.cost">
                <h4 class="font-medium">{{ $t('retreatDashboard.cost') }}</h4>
                <p class="text-sm">{{ selectedRetreat.cost }}</p>
              </div>
              <div v-if="selectedRetreat.paymentInfo">
                <h4 class="font-medium">{{ $t('retreatDashboard.paymentInfo') }}</h4>
                <p class="text-sm">{{ selectedRetreat.paymentInfo }}</p>
              </div>
              <div v-if="selectedRetreat.paymentMethods">
                <h4 class="font-medium">{{ $t('retreatDashboard.paymentMethods') }}</h4>
                <p class="text-sm">{{ selectedRetreat.paymentMethods }}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <div v-else>
        <p>{{ $t('retreatDashboard.noRetreatSelected') }}</p>
      </div>
    </div>

    <Dialog :open="isQrCodeVisible" @update:open="isQrCodeVisible = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('retreatDashboard.qrCodeTitle') }}</DialogTitle>
        </DialogHeader>
        <div class="flex justify-center p-4">
          <QrcodeVue :value="qrCodeUrl" :size="300" level="H" />
        </div>
      </DialogContent>
    </Dialog>

    <InviteUsersModal
      :is-open="showInviteModal"
      :retreat-id="selectedRetreat?.id || ''"
      @close="showInviteModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watchEffect, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import { useInventoryStore } from '@/stores/inventoryStore';
import { Button } from '@repo/ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@repo/ui';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@repo/ui';
import { useToast } from '@repo/ui';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import QrcodeVue from 'qrcode.vue';
import { Badge } from '@repo/ui';
import { Progress } from '@repo/ui';
import InviteUsersModal from '@/components/InviteUsersModal.vue';
import { AlertTriangle, Users, UserPlus, Clock, Copy, ExternalLink, QrCode, Loader2, Mail } from 'lucide-vue-next';

const { t } = useI18n();
const route = useRoute();
const retreatStore = useRetreatStore();
const { selectedRetreat, walkerRegistrationLink, serverRegistrationLink } = storeToRefs(retreatStore);
const { toast } = useToast();
const participantStore = useParticipantStore();
const { participants } = storeToRefs(participantStore);
const inventoryStore = useInventoryStore();
const { inventoryAlerts } = storeToRefs(inventoryStore);

const isQrCodeVisible = ref(false);
const qrCodeUrl = ref('');
const showInviteModal = ref(false);
const isLoading = ref(false);
const error = ref('');

const walkersCount = computed(() => (participants.value || []).filter(p => p.type === 'walker' && !p.isCancelled).length);
const serversCount = computed(() => (participants.value || []).filter(p => p.type === 'server' && !p.isCancelled).length);
const waitingCount = computed(() => (participants.value || []).filter(p => p.type === 'waiting' && !p.isCancelled).length);

const walkersPercentage = computed(() => {
  if (!selectedRetreat.value?.max_walkers) return 0;
  return Math.min((walkersCount.value / selectedRetreat.value.max_walkers) * 100, 100);
});

const serversPercentage = computed(() => {
  if (!selectedRetreat.value?.max_servers) return 0;
  return Math.min((serversCount.value / selectedRetreat.value.max_servers) * 100, 100);
});

const getCapacityStatus = (current: number, max: number | undefined) => {
  if (!max) return 'unknown';
  const percentage = (current / max) * 100;
  if (percentage >= 100) return 'full';
  if (percentage >= 80) return 'warning';
  return 'available';
};

const walkersStatus = computed(() => getCapacityStatus(walkersCount.value, selectedRetreat.value?.max_walkers));
const serversStatus = computed(() => getCapacityStatus(serversCount.value, selectedRetreat.value?.max_servers));

const copyLink = async (link: string) => {
  try {
    await navigator.clipboard.writeText(link);
    toast({
      title: t('retreatDashboard.linkCopied'),
    });
  } catch (err) {
    toast({
      title: 'Error al copiar el enlace',
      variant: 'destructive',
    });
  }
};

const openLink = (link: string) => {
  window.open(link, '_blank');
};

const showQrCode = (url: string) => {
  qrCodeUrl.value = url;
  isQrCodeVisible.value = true;
};


const loadRetreatData = async (retreatId: string) => {
  isLoading.value = true;
  error.value = '';

  try {
    retreatStore.selectRetreat(retreatId);
    participantStore.filters.retreatId = retreatId;

    await Promise.all([
      participantStore.fetchParticipants(),
      inventoryStore.fetchInventoryAlerts(retreatId),
    ]);
  } catch (err) {
    error.value = 'Error al cargar los datos del retiro';
    console.error('Error loading retreat data:', err);
  } finally {
    isLoading.value = false;
  }
};

watchEffect(() => {
  const retreatId = route.params.id as string;
  if (retreatId) {
    loadRetreatData(retreatId);
  }
});

onMounted(async () => {
  if (retreatStore.selectedRetreatId) {
    await loadRetreatData(retreatStore.selectedRetreatId);
  }
});
</script>
