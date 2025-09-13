<template>
  <div class="p-4">
    <h1 class="text-2xl font-bold mb-4">{{ $t('retreatDashboard.title') }}</h1>
    <div v-if="selectedRetreat">
      <p>
        {{ $t('retreatDashboard.selectedRetreat') }}: {{ selectedRetreat.parish }} -
        {{ new Date(selectedRetreat.startDate).toLocaleDateString() }}
      </p>
      <p>
        {{ $t('retreatDashboard.walkersCount') }}: {{ walkersCount }} /
        {{ selectedRetreat.max_walkers || 'N/A' }}
      </p>
      <p>
        {{ $t('retreatDashboard.serversCount') }}: {{ serversCount }} /
        {{ selectedRetreat.max_servers || 'N/A' }}
      </p>
      <p>{{ $t('retreatDashboard.waitingCount') }}: {{ waitingCount }}</p>

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
      <div class="flex items-center gap-2 mt-2">
        <span>{{ $t('retreatDashboard.walkerRegistrationLink') }}:</span>
        <Button size="sm" @click="copyLink(walkerRegistrationLink)">{{ $t('retreatDashboard.copyLink') }}</Button>
        <Button size="sm" @click="openLink(walkerRegistrationLink)">{{ $t('retreatDashboard.openLink') }}</Button>
        <Button size="sm" @click="showQrCode(walkerRegistrationLink)">{{ $t('retreatDashboard.showQr') }}</Button>
      </div>
      <div class="flex items-center gap-2 mt-2">
        <span>{{ $t('retreatDashboard.serverRegistrationLink') }}:</span>
        <Button size="sm" @click="copyLink(serverRegistrationLink)">{{ $t('retreatDashboard.copyLink') }}</Button>
        <Button size="sm" @click="openLink(serverRegistrationLink)">{{ $t('retreatDashboard.openLink') }}</Button>
        <Button size="sm" @click="showQrCode(serverRegistrationLink)">{{ $t('retreatDashboard.showQr') }}</Button>
      </div>
      <div v-if="selectedRetreat.openingNotes" class="mt-4">
        <h2 class="font-bold">{{ $t('retreatDashboard.openingNotes') }}</h2>
        <p>{{ selectedRetreat.openingNotes }}</p>
      </div>
      <div v-if="selectedRetreat.closingNotes" class="mt-4">
        <h2 class="font-bold">{{ $t('retreatDashboard.closingNotes') }}</h2>
        <p>{{ selectedRetreat.closingNotes }}</p>
      </div>
      <div v-if="selectedRetreat.thingsToBringNotes" class="mt-4">
        <h2 class="font-bold">{{ $t('retreatDashboard.thingsToBringNotes') }}</h2>
        <p>{{ selectedRetreat.thingsToBringNotes }}</p>
      </div>
      <div v-if="selectedRetreat.cost" class="mt-4">
        <h2 class="font-bold">{{ $t('retreatDashboard.cost') }}</h2>
        <p>{{ selectedRetreat.cost }}</p>
      </div>
      <div v-if="selectedRetreat.paymentInfo" class="mt-4">
        <h2 class="font-bold">{{ $t('retreatDashboard.paymentInfo') }}</h2>
        <p>{{ selectedRetreat.paymentInfo }}</p>
      </div>
      <div v-if="selectedRetreat.paymentMethods" class="mt-4">
        <h2 class="font-bold">{{ $t('retreatDashboard.paymentMethods') }}</h2>
        <p>{{ selectedRetreat.paymentMethods }}</p>
      </div>
    </div>
    <div v-else>
      <p>{{ $t('retreatDashboard.noRetreatSelected') }}</p>
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
  </div>
</template>

<script setup lang="ts">
import { ref, watchEffect, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import { useInventoryStore } from '@/stores/inventoryStore';
import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/ui/dialog';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@repo/ui/components/ui/card';
import { useToast } from '@repo/ui/components/ui/toast/use-toast';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import QrcodeVue from 'qrcode.vue';
import { AlertTriangle } from 'lucide-vue-next';

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

const walkersCount = computed(() => (participants.value || []).filter(p => p.type === 'walker' && !p.isCancelled).length);
const serversCount = computed(() => (participants.value || []).filter(p => p.type === 'server' && !p.isCancelled).length);
const waitingCount = computed(() => (participants.value || []).filter(p => p.type === 'waiting' && !p.isCancelled).length);

const copyLink = (link: string) => {
  navigator.clipboard.writeText(link);
  toast({
    title: t('retreatDashboard.linkCopied'),
  });
};

const openLink = (link: string) => {
  window.open(link, '_blank');
};

const showQrCode = (url: string) => {
  qrCodeUrl.value = url;
  isQrCodeVisible.value = true;
};

watchEffect(async () => {
  const retreatId = route.params.id as string;
  if (retreatId) {
    retreatStore.selectRetreat(retreatId);
    participantStore.filters.retreatId = retreatId;
    await Promise.all([
      participantStore.fetchParticipants(),
      inventoryStore.fetchInventoryAlerts(retreatId),
    ]);
  }
});

if (retreatStore.selectedRetreatId) {
  participantStore.filters.retreatId = retreatStore.selectedRetreatId;
  participantStore.fetchParticipants();
  inventoryStore.fetchInventoryAlerts(retreatStore.selectedRetreatId);
}
</script>
