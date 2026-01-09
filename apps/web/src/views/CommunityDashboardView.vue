<template>
  <div class="p-4 space-y-6">
    <div v-if="loadingCommunity" class="flex justify-center py-12">
      <Loader2 class="w-8 h-8 animate-spin text-primary" />
    </div>

    <template v-else-if="currentCommunity">
      <div class="flex justify-between items-start">
        <div>
          <h1 class="text-3xl font-bold tracking-tight">{{ currentCommunity.name }}</h1>
          <p class="text-muted-foreground">{{ fullAddress }}</p>
        </div>
        <div class="flex space-x-2">
          <Button variant="outline" as-child>
            <router-link :to="{ name: 'community-members', params: { id: currentCommunity.id } }">
              <Users class="mr-2 h-4 w-4" />
              {{ $t('community.members') }}
            </router-link>
          </Button>
          <Button variant="outline" as-child>
            <router-link :to="{ name: 'community-meetings', params: { id: currentCommunity.id } }">
              <Calendar class="mr-2 h-4 w-4" />
              {{ $t('community.meetings') }}
            </router-link>
          </Button>
        </div>
      </div>

      <!-- Stats Overview -->
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">{{ $t('community.stats.totalMembers') }}</CardTitle>
            <Users class="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ stats?.memberCount || 0 }}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">{{ $t('community.stats.lastMeetings') }}</CardTitle>
            <CalendarCheck class="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ stats?.meetingCount || 0 }}</div>
          </CardContent>
        </Card>
      </div>

      <!-- Charts -->
      <div class="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{{ $t('community.stats.memberStatus') }}</CardTitle>
          </CardHeader>
          <CardContent class="h-[300px] flex items-center justify-center">
            <Pie
              v-if="statusChartData"
              :data="statusChartData"
              :options="pieOptions"
            />
            <div v-else class="text-muted-foreground">{{ $t('sidebar.noRetreatsFound') }}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{{ $t('community.stats.participationRate') }}</CardTitle>
          </CardHeader>
          <CardContent class="h-[300px] flex items-center justify-center">
            <Pie
              v-if="participationChartData"
              :data="participationChartData"
              :options="pieOptions"
            />
            <div v-else class="text-muted-foreground">{{ $t('sidebar.noRetreatsFound') }}</div>
          </CardContent>
        </Card>
      </div>
    </template>

    <div v-else class="text-center py-12">
      <p class="text-muted-foreground">Community not found.</p>
      <Button variant="outline" class="mt-4" @click="$router.push({ name: 'communities' })">
        Back to Communities
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useCommunityStore } from '@/stores/communityStore';
import { storeToRefs } from 'pinia';
import { Users, Calendar, CalendarCheck, Loader2 } from 'lucide-vue-next';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@repo/ui';
import { Pie } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, ArcElement, CategoryScale } from 'chart.js';
import { useI18n } from 'vue-i18n';

ChartJS.register(Title, Tooltip, Legend, ArcElement, CategoryScale);

const props = defineProps<{
  id: string;
}>();

const { t } = useI18n();
const communityStore = useCommunityStore();
const { currentCommunity, stats, loadingCommunity } = storeToRefs(communityStore);

onMounted(async () => {
  await communityStore.fetchCommunity(props.id);
  await communityStore.fetchDashboardStats(props.id);
});

const fullAddress = computed(() => {
  if (!currentCommunity.value) return '';
  const c = currentCommunity.value;
  return `${c.address1}${c.address2 ? ' ' + c.address2 : ''}, ${c.city}, ${c.state} ${c.zipCode}, ${c.country}`;
});

const pieOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
    }
  }
};

const statusChartData = computed(() => {
  if (!stats.value?.memberStateDistribution) return null;
  
  const data = stats.value.memberStateDistribution;
  return {
    labels: data.map((d: any) => t(`community.memberStates.${d.state}`)),
    datasets: [
      {
        backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#6366f1'],
        data: data.map((d: any) => d.count)
      }
    ]
  };
});

const participationChartData = computed(() => {
  if (!stats.value?.participationFrequency) return null;
  
  const data = stats.value.participationFrequency;
  return {
    labels: data.map((d: any) => t(`community.participationFrequency.${d.frequency.toLowerCase()}`)),
    datasets: [
      {
        backgroundColor: ['#10b981', '#fbbf24', '#f87171', '#94a3b8'],
        data: data.map((d: any) => d.count)
      }
    ]
  };
});
</script>
