<template>
  <div class="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
    <!-- Loading State -->
    <div v-if="loadingCommunity" class="flex justify-center items-center py-24">
      <div class="flex flex-col items-center gap-4">
        <Loader2 class="w-10 h-10 animate-spin text-primary" />
        <p class="text-sm text-muted-foreground">{{ $t('common.loading') }}</p>
      </div>
    </div>

    <template v-else-if="currentCommunity">
      <!-- Header Section with Gradient Accent -->
      <div class="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 md:p-8">
        <div class="absolute inset-0 bg-grid-pattern opacity-5"></div>
        <div class="relative z-10">
          <div class="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
            <div class="space-y-2">
              <h1 class="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                {{ currentCommunity.name }}
              </h1>
              <p class="text-muted-foreground flex items-center gap-2">
                <MapPin class="w-4 h-4" />
                {{ fullAddress }}
              </p>
              <p v-if="currentCommunity.description" class="text-sm text-muted-foreground max-w-2xl">
                {{ currentCommunity.description }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <Button variant="outline" as-child class="shadow-sm hover:shadow-md transition-shadow">
                <router-link :to="{ name: 'community-members', params: { id: currentCommunity.id } }">
                  <Users class="mr-2 h-4 w-4" />
                  {{ $t('community.membersLabel') }}
                </router-link>
              </Button>
              <Button variant="outline" as-child class="shadow-sm hover:shadow-md transition-shadow">
                <router-link :to="{ name: 'community-meetings', params: { id: currentCommunity.id } }">
                  <Calendar class="mr-2 h-4 w-4" />
                  {{ $t('community.meetings') }}
                </router-link>
              </Button>
              <Button variant="outline" as-child class="shadow-sm hover:shadow-md transition-shadow">
                <router-link :to="{ name: 'community-admins', params: { id: currentCommunity.id } }">
                  <UserCog class="mr-2 h-4 w-4" />
                  {{ $t('community.adminsLabel') }}
                </router-link>
              </Button>
              <Button variant="outline" as-child class="shadow-sm hover:shadow-md transition-shadow">
                <router-link :to="{ name: 'community-templates', params: { id: currentCommunity.id } }">
                  <MessageSquare class="mr-2 h-4 w-4" />
                  {{ $t('community.templatesLabel') }}
                </router-link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats Overview - 4 Column Grid -->
      <div class="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <!-- Total Members -->
        <Card class="overflow-hidden group hover:shadow-lg transition-all duration-300">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              {{ $t('community.stats.totalMembers') }}
            </CardTitle>
            <div class="rounded-full p-2 bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              <Users class="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ stats?.memberCount || 0 }}</div>
            <p class="text-xs text-muted-foreground mt-1">{{ $t('community.membersLabel') }}</p>
          </CardContent>
        </Card>

        <!-- Total Meetings -->
        <Card class="overflow-hidden group hover:shadow-lg transition-all duration-300">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              {{ $t('community.stats.lastMeetings') }}
            </CardTitle>
            <div class="rounded-full p-2 bg-blue-500/10 text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
              <CalendarCheck class="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ stats?.meetingCount || 0 }}</div>
            <p class="text-xs text-muted-foreground mt-1">{{ $t('community.meetings') }}</p>
          </CardContent>
        </Card>

        <!-- Average Attendance -->
        <Card class="overflow-hidden group hover:shadow-lg transition-all duration-300">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              {{ $t('community.stats.averageAttendance') }}
            </CardTitle>
            <div class="rounded-full p-2 bg-green-500/10 text-green-500 group-hover:bg-green-500 group-hover:text-white transition-colors">
              <TrendingUp class="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ averageAttendancePercent }}%</div>
            <p class="text-xs text-muted-foreground mt-1">{{ $t('community.attendance.present') }}</p>
          </CardContent>
        </Card>

        <!-- Upcoming Meetings -->
        <Card class="overflow-hidden group hover:shadow-lg transition-all duration-300">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              {{ $t('community.stats.upcomingMeetings') }}
            </CardTitle>
            <div class="rounded-full p-2 bg-amber-500/10 text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-colors">
              <Clock class="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ upcomingMeetingsCount }}</div>
            <p class="text-xs text-muted-foreground mt-1">{{ $t('community.meetings') }}</p>
          </CardContent>
        </Card>
      </div>

      <!-- Quick Actions & Recent Meetings Row -->
      <div class="grid gap-4 md:grid-cols-3">
        <!-- Quick Actions -->
        <Card class="md:col-span-1">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Zap class="h-5 w-5 text-primary" />
              {{ $t('community.stats.quickActions') }}
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-3">
            <Button 
              variant="outline" 
              class="w-full justify-start gap-2 h-12 hover:bg-primary hover:text-primary-foreground transition-colors"
              @click="showMeetingModal = true"
            >
              <CalendarPlus class="h-5 w-5" />
              {{ $t('community.meeting.addMeeting') }}
            </Button>
            <Button 
              v-if="recentMeetings.length > 0"
              variant="outline"
              class="w-full justify-start gap-2 h-12 hover:bg-green-500 hover:text-white transition-colors"
              @click="navigateToAttendance(recentMeetings[0]?.id)"
            >
              <ClipboardCheck class="h-5 w-5" />
              {{ $t('community.meeting.recordAttendance') }}
            </Button>
            <Button 
              variant="outline"
              class="w-full justify-start gap-2 h-12 hover:bg-blue-500 hover:text-white transition-colors"
              as-child
            >
              <router-link :to="{ name: 'community-members', params: { id: currentCommunity.id } }">
                <UserPlus class="h-5 w-5" />
                {{ $t('community.membersLabel') }}
              </router-link>
            </Button>
          </CardContent>
        </Card>

        <!-- Recent Meetings -->
        <Card class="md:col-span-2">
          <CardHeader>
            <CardTitle class="flex items-center justify-between">
              <span class="flex items-center gap-2">
                <Calendar class="h-5 w-5 text-primary" />
                {{ $t('community.stats.recentMeetings') }}
              </span>
              <Button variant="ghost" size="sm" as-child>
                <router-link :to="{ name: 'community-meetings', params: { id: currentCommunity.id } }">
                  {{ $t('common.actions.showMore') }} →
                </router-link>
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div v-if="recentMeetings.length > 0" class="space-y-3">
              <div 
                v-for="meeting in recentMeetings" 
                :key="meeting.id"
                class="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                @click="navigateToAttendance(meeting.id)"
              >
                <div class="flex items-center gap-3">
                  <div class="rounded-full p-2 bg-primary/10">
                    <Calendar class="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p class="font-medium text-sm">{{ meeting.title }}</p>
                    <p class="text-xs text-muted-foreground">{{ formatMeetingDate(meeting.startDate) }}</p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <Badge 
                    v-if="meeting.attendancePercent !== undefined"
                    :variant="meeting.attendancePercent >= 70 ? 'default' : meeting.attendancePercent >= 40 ? 'secondary' : 'outline'"
                    class="font-medium"
                  >
                    {{ meeting.attendancePercent }}%
                  </Badge>
                  <ChevronRight class="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </div>
            <div v-else class="flex flex-col items-center justify-center py-8 text-center">
              <Calendar class="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p class="text-muted-foreground text-sm">{{ $t('community.stats.noRecentMeetings') }}</p>
              <Button variant="link" size="sm" class="mt-2" @click="showMeetingModal = true">
                {{ $t('community.meeting.addMeeting') }}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Charts Section -->
      <div class="grid gap-4 md:grid-cols-2">
        <!-- Member Status Chart -->
        <Card class="overflow-hidden">
          <CardHeader class="bg-muted/30">
            <CardTitle class="flex items-center gap-2">
              <PieChart class="h-5 w-5 text-primary" />
              {{ $t('community.stats.memberStatus') }}
            </CardTitle>
          </CardHeader>
          <CardContent class="h-[300px] flex items-center justify-center p-6">
            <Pie
              v-if="statusChartData && hasChartData(statusChartData)"
              :data="statusChartData"
              :options="pieOptions"
            />
            <div v-else class="flex flex-col items-center text-center">
              <div class="rounded-full p-4 bg-muted mb-3">
                <PieChart class="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p class="text-muted-foreground text-sm">{{ $t('community.stats.noData') }}</p>
            </div>
          </CardContent>
        </Card>

        <!-- Participation Frequency Chart -->
        <Card class="overflow-hidden">
          <CardHeader class="bg-muted/30">
            <CardTitle class="flex items-center gap-2">
              <BarChart3 class="h-5 w-5 text-primary" />
              {{ $t('community.stats.participationRate') }}
            </CardTitle>
          </CardHeader>
          <CardContent class="h-[300px] flex items-center justify-center p-6">
            <Pie
              v-if="participationChartData && hasChartData(participationChartData)"
              :data="participationChartData"
              :options="pieOptions"
            />
            <div v-else class="flex flex-col items-center text-center">
              <div class="rounded-full p-4 bg-muted mb-3">
                <BarChart3 class="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p class="text-muted-foreground text-sm">{{ $t('community.stats.noData') }}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </template>

    <!-- Not Found State -->
    <div v-else class="flex flex-col items-center justify-center py-24 text-center">
      <div class="rounded-full p-6 bg-muted mb-4">
        <Users class="h-12 w-12 text-muted-foreground/50" />
      </div>
      <h2 class="text-xl font-semibold mb-2">Community not found</h2>
      <p class="text-muted-foreground mb-6">The community you're looking for doesn't exist or you don't have access.</p>
      <Button variant="outline" @click="$router.push({ name: 'communities' })">
        ← Back to Communities
      </Button>
    </div>

    <!-- Modals -->
    <MeetingFormModal
      v-if="currentCommunity"
      v-model:open="showMeetingModal"
      :community-id="currentCommunity.id"
      @created="onMeetingCreated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useCommunityStore } from '@/stores/communityStore';
import { storeToRefs } from 'pinia';
import {
	Users,
	Calendar,
	CalendarCheck,
	CalendarPlus,
	Loader2,
	UserCog,
	MapPin,
	TrendingUp,
	Clock,
	Zap,
	ClipboardCheck,
	UserPlus,
	ChevronRight,
	PieChart,
	BarChart3,
	MessageSquare,
} from 'lucide-vue-next';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@repo/ui';
import { Pie } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, ArcElement, CategoryScale } from 'chart.js';
import { useI18n } from 'vue-i18n';
import MeetingFormModal from '@/components/community/MeetingFormModal.vue';

ChartJS.register(Title, Tooltip, Legend, ArcElement, CategoryScale);

const props = defineProps<{
  id: string;
}>();

const { t } = useI18n();
const router = useRouter();
const communityStore = useCommunityStore();
const { currentCommunity, stats, loadingCommunity } = storeToRefs(communityStore);

const showMeetingModal = ref(false);

onMounted(async () => {
  await communityStore.fetchCommunity(props.id);
  await communityStore.fetchDashboardStats(props.id);
});

const onMeetingCreated = async () => {
  await communityStore.fetchDashboardStats(props.id);
};

const fullAddress = computed(() => {
  if (!currentCommunity.value) return '';
  const c = currentCommunity.value;
  const parts = [
    c.address1,
    c.address2,
    c.city,
    c.state,
    c.zipCode,
    c.country
  ].filter(Boolean);
  return parts.join(', ');
});

// Calculate average attendance percentage
const averageAttendancePercent = computed(() => {
  if (!stats.value?.averageAttendance) return 0;
  return Math.round(stats.value.averageAttendance);
});

// Calculate upcoming meetings count
const upcomingMeetingsCount = computed(() => {
  return stats.value?.upcomingMeetingsCount || 0;
});

// Get recent meetings for the list
const recentMeetings = computed(() => {
  return stats.value?.recentMeetings || [];
});

// Navigation helpers
const navigateToMeetings = () => {
  router.push({ name: 'community-meetings', params: { id: props.id } });
};

const navigateToAttendance = (meetingId?: string) => {
  if (meetingId) {
    router.push({ name: 'community-attendance', params: { id: props.id, meetingId } });
  }
};

// Format meeting date
const formatMeetingDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, { 
    weekday: 'short',
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Check if chart has data
const hasChartData = (chartData: any) => {
  return chartData?.datasets?.[0]?.data?.some((d: number) => d > 0);
};

const pieOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        padding: 20,
        usePointStyle: true,
        pointStyle: 'circle'
      }
    },
    tooltip: {
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      padding: 12,
      cornerRadius: 8
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
        backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6'],
        borderWidth: 0,
        hoverOffset: 8,
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
        borderWidth: 0,
        hoverOffset: 8,
        data: data.map((d: any) => d.count)
      }
    ]
  };
});
</script>

<style scoped>
.bg-grid-pattern {
  background-image: 
    linear-gradient(to right, currentColor 1px, transparent 1px),
    linear-gradient(to bottom, currentColor 1px, transparent 1px);
  background-size: 24px 24px;
}
</style>
