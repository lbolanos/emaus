<template>
  <div class="p-4">
    <h1 class="text-2xl font-bold mb-4">{{ $t('retreatDashboard.title') }}</h1>
    <div v-if="retreatStore.selectedRetreat">
      <p>{{ $t('retreatDashboard.selectedRetreat') }}: {{ retreatStore.selectedRetreat.parish }} - {{ new Date(retreatStore.selectedRetreat.startDate).toLocaleDateString() }}</p>
      <p>{{ $t('retreatDashboard.walkersCount') }}: {{ walkersCount }} / {{ retreatStore.selectedRetreat.max_walkers || 'N/A' }}</p>
      <p>{{ $t('retreatDashboard.serversCount') }}: {{ serversCount }} / {{ retreatStore.selectedRetreat.max_servers || 'N/A' }}</p>
      <p>{{ $t('retreatDashboard.waitingCount') }}: {{ waitingCount }}</p>
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
      <div v-if="retreatStore.selectedRetreat.openingNotes" class="mt-4">
        <h2 class="font-bold">{{ $t('retreatDashboard.openingNotes') }}</h2>
        <p>{{ retreatStore.selectedRetreat.openingNotes }}</p>
      </div>
      <div v-if="retreatStore.selectedRetreat.closingNotes" class="mt-4">
        <h2 class="font-bold">{{ $t('retreatDashboard.closingNotes') }}</h2>
        <p>{{ retreatStore.selectedRetreat.closingNotes }}</p>
      </div>
      <div v-if="retreatStore.selectedRetreat.thingsToBringNotes" class="mt-4">
        <h2 class="font-bold">{{ $t('retreatDashboard.thingsToBringNotes') }}</h2>
        <p>{{ retreatStore.selectedRetreat.thingsToBringNotes }}</p>
      </div>
      <div v-if="retreatStore.selectedRetreat.cost" class="mt-4">
        <h2 class="font-bold">{{ $t('retreatDashboard.cost') }}</h2>
        <p>{{ retreatStore.selectedRetreat.cost }}</p>
      </div>
      <div v-if="retreatStore.selectedRetreat.paymentInfo" class="mt-4">
        <h2 class="font-bold">{{ $t('retreatDashboard.paymentInfo') }}</h2>
        <p>{{ retreatStore.selectedRetreat.paymentInfo }}</p>
      </div>
      <div v-if="retreatStore.selectedRetreat.paymentMethods" class="mt-4">
        <h2 class="font-bold">{{ $t('retreatDashboard.paymentMethods') }}</h2>
        <p>{{ retreatStore.selectedRetreat.paymentMethods }}</p>
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
import { ref, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/ui/dialog';
import { useToast } from '@repo/ui/components/ui/toast/use-toast';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import QrcodeVue from 'qrcode.vue';

const { t } = useI18n();
const route = useRoute();
const retreatStore = useRetreatStore();
const { toast } = useToast();
const { walkerRegistrationLink, serverRegistrationLink } = storeToRefs(retreatStore);
const participantStore = useParticipantStore();

const walkersCount = ref(0);
const serversCount = ref(0);
const waitingCount = ref(0);
const isQrCodeVisible = ref(false);
const qrCodeUrl = ref('');

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
  if (retreatId && retreatStore.retreats.length > 0) {
    if (retreatStore.selectedRetreatId !== retreatId) {
      retreatStore.selectedRetreatId = retreatId;
    }

    await participantStore.fetchParticipants(retreatId, 'walker');
    walkersCount.value = participantStore.participants.filter(p => p.type === 'walker').length;
    await participantStore.fetchParticipants(retreatId, 'server');
    serversCount.value = participantStore.participants.filter(p => p.type === 'server').length;
    await participantStore.fetchParticipants(retreatId, 'waiting');
    waitingCount.value = participantStore.participants.filter(p => p.type === 'waiting').length;
  }
});

if (retreatStore.selectedRetreatId) {
  participantStore.fetchParticipants(retreatStore.selectedRetreatId, 'walker');
  participantStore.fetchParticipants(retreatStore.selectedRetreatId, 'server');
  participantStore.fetchParticipants(retreatStore.selectedRetreatId, 'waiting');
}
</script>
