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
              <div class="flex items-center text-sm text-muted-foreground/80">
                <router-link :to="{ name: 'communities' }" class="hover:underline hover:text-foreground transition-colors">
                  {{ $t('community.title') }}
                </router-link>
                <ChevronRight class="w-4 h-4 mx-1" />
                <span>{{ $t('community.dashboard') }}</span>
              </div>
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
                <router-link :to="{ name: 'community-attendance-stats', params: { id: currentCommunity.id } }">
                  <TrendingUp class="mr-2 h-4 w-4" />
                  {{ $t('community.attendanceStats.title') }}
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

      <!-- Próximos cumpleaños. Va antes de las reuniones porque es lo que caduca:
           un "cumple mañana" no sirve si hay que bajar a buscarlo. -->
      <Card v-if="upcomingBirthdays.length > 0" class="overflow-hidden">
        <CardHeader class="bg-muted/30">
          <CardTitle class="flex items-center gap-2">
            <Cake class="h-5 w-5 text-primary" />
            Próximos cumpleaños
            <Badge variant="secondary" class="ml-1">{{ upcomingBirthdays.length }}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent class="p-0">
          <ul class="divide-y">
            <li
              v-for="birthday in upcomingBirthdays"
              :key="birthday.memberId"
              class="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3"
            >
              <MemberAvatar
                :photo-url="birthday.photoUrl"
                :full-name="birthday.fullName"
                size="md"
              />
              <div class="min-w-0 flex-1">
                <p class="font-medium truncate">{{ birthday.fullName }}</p>
                <p class="text-xs text-muted-foreground">
                  {{ formatBirthdayLabel(birthday) }}
                  <span v-if="birthday.turningAge"> · cumple {{ birthday.turningAge }}</span>
                </p>
              </div>
              <Badge :variant="birthday.daysUntil === 0 ? 'default' : 'secondary'" class="shrink-0">
                {{ daysUntilLabel(birthday.daysUntil) }}
              </Badge>
              <Badge v-if="birthday.alreadyGreeted" variant="outline" class="shrink-0 gap-1">
                <Check class="h-3 w-3" />
                Ya felicitado
              </Badge>
              <Button
                v-else
                size="sm"
                variant="outline"
                class="shrink-0"
                :disabled="greetingMemberId === birthday.memberId"
                @click="openGreeting(birthday)"
              >
                Felicitar
              </Button>
            </li>
          </ul>
        </CardContent>
      </Card>

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

      <!-- Retiros de la comunidad -->
      <Card v-if="stats?.upcomingRetreats?.length" class="overflow-hidden">
        <CardHeader class="bg-muted/30">
          <CardTitle class="flex items-center gap-2">
            <CalendarCheck class="h-5 w-5 text-primary" />
            {{ $t('community.stats.upcomingRetreats') }}
          </CardTitle>
        </CardHeader>
        <CardContent class="p-4 space-y-3">
          <div
            v-for="retreat in stats.upcomingRetreats"
            :key="retreat.id"
            class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border"
          >
            <div class="min-w-0">
              <p class="font-medium">{{ retreat.parish }} {{ retreat.numberVersion || '' }}</p>
              <p class="text-xs text-muted-foreground">
                {{ formatRetreatDate(retreat.startDate) }} – {{ formatRetreatDate(retreat.endDate) }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" as-child>
                <router-link
                  :to="{ name: 'community-attendance-stats', params: { id: currentCommunity.id }, query: { meetingType: 'preparation', retreatId: retreat.id } }"
                >
                  <TrendingUp class="mr-2 h-4 w-4" />
                  {{ $t('community.stats.serverTeamAttendance') }}
                </router-link>
              </Button>
              <!-- La convocatoria NO se manda desde aquí: es una secuencia de
                   WhatsApp que se despacha uno por uno desde la bandeja, así que
                   este botón lleva al motor de secuencias del retiro. -->
              <Button variant="outline" size="sm" as-child>
                <router-link
                  :to="{ name: 'message-sequences', params: { id: retreat.id } }"
                >
                  <Send class="mr-2 h-4 w-4" />
                  {{ $t('community.convoke.action') }}
                </router-link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
    <!-- Montado siempre (no `v-if` sobre greetingMember): MessageDialog carga las
         plantillas en un watcher de `open`, así que necesita existir cerrado y ver
         la transición a abierto. Si naciera ya abierto, el watcher no dispara y el
         diálogo sale con "No hay plantillas para esta comunidad". -->
    <MessageDialog
      v-if="currentCommunity"
      v-model:open="isGreetingDialogOpen"
      context="community"
      :community-id="currentCommunity.id"
      :participant="greetingMember"
      force-template-type="BIRTHDAY_MESSAGE"
      @update:open="onGreetingDialogToggle"
    />

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
	Cake,
	Check,
	Send,
} from 'lucide-vue-next';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@repo/ui';
import { Pie } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, ArcElement, CategoryScale } from 'chart.js';
import { useI18n } from 'vue-i18n';
import MeetingFormModal from '@/components/community/MeetingFormModal.vue';
import MessageDialog from '@/components/MessageDialog.vue';
import MemberAvatar from '@/components/community/MemberAvatar.vue';
import { formatDateInCommunityTimezone, formatBirthdayEs } from '@repo/utils';
import { getUpcomingBirthdays, type UpcomingBirthday } from '@/services/api';

ChartJS.register(Title, Tooltip, Legend, ArcElement, CategoryScale);

const props = defineProps<{
  id: string;
}>();

const { t } = useI18n();
const router = useRouter();
const communityStore = useCommunityStore();
const { currentCommunity, stats, loadingCommunity } = storeToRefs(communityStore);

const showMeetingModal = ref(false);

// --- Cumpleaños próximos ----------------------------------------------------
// El backend entrega la lista ya resuelta y ordenada por proximidad, calculada
// en la zona horaria de la comunidad. Aquí no se hace aritmética de fechas.

const upcomingBirthdays = ref<UpcomingBirthday[]>([]);
const greetingMember = ref<any>(null);
const greetingMemberId = ref<string | null>(null);
const isGreetingDialogOpen = ref(false);

const loadUpcomingBirthdays = async () => {
  try {
    upcomingBirthdays.value = await getUpcomingBirthdays(props.id, 30);
  } catch {
    // El panel es accesorio: si falla, el resto del dashboard sigue vivo.
    upcomingBirthdays.value = [];
  }
};

const formatBirthdayLabel = (birthday: UpcomingBirthday): string =>
  formatBirthdayEs({ monthDay: birthday.birthdayMonthDay, year: null }) ?? '';

const daysUntilLabel = (days: number): string => {
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  return `En ${days} días`;
};

/**
 * `MessageDialog` necesita el `CommunityMember` completo (con su `participant`)
 * para resolver el overlay y las variables de la plantilla. El panel solo trae
 * filas planas, así que los miembros se cargan la primera vez que se felicita
 * a alguien — no en cada visita al dashboard.
 */
const openGreeting = async (birthday: UpcomingBirthday) => {
  greetingMemberId.value = birthday.memberId;
  try {
    if (communityStore.members.length === 0) {
      await communityStore.fetchMembers(props.id);
    }
    const member = communityStore.members.find((m: any) => m.id === birthday.memberId);
    if (!member) return;
    greetingMember.value = member;
    isGreetingDialogOpen.value = true;
  } finally {
    greetingMemberId.value = null;
  }
};

// Al cerrar el diálogo, recargar para que el "Ya felicitado" refleje el envío.
const onGreetingDialogToggle = (open: boolean) => {
  if (!open) void loadUpcomingBirthdays();
};

onMounted(async () => {
  await communityStore.fetchCommunity(props.id);
  await communityStore.fetchDashboardStats(props.id);
  await loadUpcomingBirthdays();
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

// Format meeting date — usa el timezone de la comunidad para que el dashboard
// muestre la hora local de la reunión, no la del browser del coordinador.
const formatMeetingDate = (dateString: string) =>
  formatDateInCommunityTimezone(dateString, currentCommunity.value, {
    locale: 'es-MX',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

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

// Mapeo explícito state → color hex. Hex aproximados a las clases
// Tailwind 500/700 que usa `getStateBorderClass` en CommunityMembersView,
// para que el dashboard y la tabla muestren cromática consistente. Cada
// estado tiene su color único (no se reciclan, como pasaba con el array
// posicional anterior que solo definía 5 colores para 10 estados).
const STATE_COLORS: Record<string, string> = {
  // Activos / en seguimiento
  active_member: '#10b981',           // emerald-500
  pending_verification: '#eab308',     // yellow-500
  paused: '#f59e0b',                   // amber-500
  // Canal/contacto roto
  wrong_contact_info: '#f97316',       // orange-500
  no_answer: '#ef4444',                // red-500
  // Declinaciones
  no_time: '#06b6d4',                  // cyan-500
  far_from_location: '#3b82f6',        // blue-500
  another_group: '#a855f7',            // purple-500
  not_interested: '#f43f5e',           // rose-500
  do_not_contact: '#3f3f46',           // zinc-700
};
const FALLBACK_COLOR = '#94a3b8'; // slate-400 para estados no mapeados

// Las fechas del retiro son date-only (medianoche UTC), a diferencia de las de
// las reuniones, que son instantes. Formatearlas en la zona de la comunidad las
// corre al día anterior — un retiro que empieza el 16 se mostraba como el 15.
// Ver Regla N°3 del skill `timezone-handling`.
const formatRetreatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('es-MX', {
    timeZone: 'UTC',
    dateStyle: 'medium',
  });


const statusChartData = computed(() => {
  if (!stats.value?.memberStateDistribution) return null;

  const data = stats.value.memberStateDistribution;
  return {
    labels: data.map((d: any) => t(`community.memberStates.${d.state}`)),
    datasets: [
      {
        backgroundColor: data.map((d: any) => STATE_COLORS[d.state] ?? FALLBACK_COLOR),
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
