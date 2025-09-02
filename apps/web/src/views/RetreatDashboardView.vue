<template>
  <div class="p-4">
    <h1 class="text-2xl font-bold mb-4">{{ $t('retreatDashboard.title') }}</h1>
    <div v-if="retreatStore.selectedRetreat">
      <p>{{ $t('retreatDashboard.selectedRetreat') }}: {{ retreatStore.selectedRetreat.parish }} - {{ new Date(retreatStore.selectedRetreat.startDate).toLocaleDateString() }}</p>
      <p>{{ $t('retreatDashboard.walkersCount') }}: {{ walkersCount }}</p>
      <p>{{ $t('retreatDashboard.serversCount') }}: {{ serversCount }}</p>
      <div class="flex items-center gap-2 mt-2">
        <span>{{ $t('retreatDashboard.walkerRegistrationLink') }}:</span>
        <!--a :href="walkerRegistrationLink" target="_blank" class="text-blue-500 hover:underline">{{ walkerRegistrationLink }}</a-->
        <Button size="sm" @click="copyLink(walkerRegistrationLink)">{{ $t('retreatDashboard.copyLink') }}</Button>
        <Button size="sm" @click="openLink(walkerRegistrationLink)">{{ $t('retreatDashboard.openLink') }}</Button>
      </div>
      <div class="flex items-center gap-2 mt-2">
        <span>{{ $t('retreatDashboard.serverRegistrationLink') }}:</span>
        <!--a :href="serverRegistrationLink" target="_blank" class="text-blue-500 hover:underline">{{ serverRegistrationLink }}</a-->
        <Button size="sm" @click="copyLink(serverRegistrationLink)">{{ $t('retreatDashboard.copyLink') }}</Button>
        <Button size="sm" @click="openLink(serverRegistrationLink)">{{ $t('retreatDashboard.openLink') }}</Button>
      </div>
    </div>
    <div v-else>
      <p>{{ $t('retreatDashboard.noRetreatSelected') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import { Button } from '@repo/ui/components/ui/button';
import { useToast } from '@repo/ui/components/ui/toast/use-toast';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';

const { t } = useI18n();
const route = useRoute();
const retreatStore = useRetreatStore();
const { toast } = useToast();
const { walkerRegistrationLink, serverRegistrationLink } = storeToRefs(retreatStore);
const participantStore = useParticipantStore();

const walkersCount = ref(0);
const serversCount = ref(0);

const copyLink = (link: string) => {
  navigator.clipboard.writeText(link);
  toast.success(t('retreatDashboard.linkCopied'));
};

const openLink = (link: string) => {
  window.open(link, '_blank');
};

watchEffect(async () => {
  const retreatId = route.params.id as string;
  if (retreatId && retreatStore.retreats.length > 0) {
    if (retreatStore.selectedRetreatId !== retreatId) {
      retreatStore.selectedRetreatId = retreatId;
    }

    await participantStore.fetchParticipants(retreatId);
    walkersCount.value = participantStore.participants.filter(p => p.type === 'walker').length;
    serversCount.value = participantStore.participants.filter(p => p.type === 'server').length;
  }
});

if (retreatStore.selectedRetreatId) {
  participantStore.fetchParticipants(retreatStore.selectedRetreatId);
}
</script>
