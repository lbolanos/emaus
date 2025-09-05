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
import { ref, watchEffect, computed } from 'vue';
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
const { selectedRetreat, walkerRegistrationLink, serverRegistrationLink } = storeToRefs(retreatStore);
const { toast } = useToast();
const participantStore = useParticipantStore();
const { participants } = storeToRefs(participantStore);

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
    await participantStore.fetchParticipants();
  }
});

if (retreatStore.selectedRetreatId) {
  participantStore.filters.retreatId = retreatStore.selectedRetreatId;
  participantStore.fetchParticipants();
}
</script>
