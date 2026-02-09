<template>
  <div class="public-attendance min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
    <!-- Loading State -->
    <div v-if="loading" class="flex flex-col items-center justify-center min-h-screen p-6">
      <div class="relative">
        <div class="animate-spin rounded-full h-16 w-16 border-4 border-slate-200 dark:border-slate-800"></div>
        <div class="animate-spin rounded-full h-16 w-16 border-4 border-t-primary absolute top-0 left-0"></div>
      </div>
      <p class="mt-4 text-sm text-muted-foreground">{{ $t('community.attendance.loading') || 'Cargando...' }}</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex flex-col items-center justify-center min-h-screen p-6">
      <div class="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertCircle class="w-10 h-10 text-destructive" />
      </div>
      <h2 class="text-xl font-bold mb-2">{{ $t('community.attendance.error') || 'Error' }}</h2>
      <p class="text-muted-foreground text-center max-w-md">{{ error }}</p>
    </div>

    <!-- Attendance View -->
    <template v-else>
      <div class="max-w-2xl mx-auto px-4 py-8">
        <!-- Header Card -->
        <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-xl overflow-hidden mb-6">
          <!-- Decorative top bar -->
          <div class="h-2 bg-gradient-to-r from-emerald-500 to-teal-500"></div>

          <div class="p-6 md:p-8">
            <!-- Community Name & Title -->
            <div class="text-center mb-6">
              <div class="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full mb-3">
                <Users class="w-3.5 h-3.5" />
                <span>{{ $t('community.attendance.community') || 'Comunidad' }}</span>
              </div>
              <h1 class="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-2">
                {{ communityName }}
              </h1>
              <p class="text-lg text-slate-600 dark:text-slate-400 mb-3">{{ meetingTitle }}</p>

              <!-- Date with icon -->
              <div v-if="meetingStartDate" class="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-full">
                <Calendar class="w-4 h-4" />
                <span>{{ formatMeetingDate(meetingStartDate) }}</span>
              </div>
            </div>

            <!-- Stats Cards -->
            <div class="grid grid-cols-2 gap-4 mb-6">
              <!-- Present -->
              <div class="bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl p-4 text-center transition-all hover:scale-105">
                <div class="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto mb-2">
                  <Check class="w-6 h-6" />
                </div>
                <p class="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{{ presentCount }}</p>
                <p class="text-xs text-emerald-600/70 dark:text-emerald-400/70 font-medium uppercase tracking-wide">
                  {{ $t('community.attendance.present') || 'Presentes' }}
                </p>
              </div>

              <!-- Total -->
              <div class="bg-slate-100 dark:bg-slate-800 rounded-2xl p-4 text-center transition-all hover:scale-105">
                <div class="w-12 h-12 rounded-full bg-slate-400 dark:bg-slate-600 text-white flex items-center justify-center mx-auto mb-2">
                  <Users class="w-6 h-6" />
                </div>
                <p class="text-3xl font-bold text-slate-600 dark:text-slate-300">{{ members.length }}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">
                  {{ $t('community.attendance.total') || 'Total' }}
                </p>
              </div>
            </div>

            <!-- Join Button -->
            <button
              @click="openJoinModal"
              class="w-full py-3 px-6 bg-gradient-to-r from-primary to-primary/90 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
            >
              <UserPlus class="w-5 h-5" />
              <span>{{ $t('landing.join') || 'Unirse' }}</span>
            </button>
          </div>
        </div>

        <!-- Search Card -->
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-4 mb-6 sticky top-4 z-10">
          <div class="relative">
            <Search class="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              v-model="searchQuery"
              :placeholder="$t('community.attendance.searchMembers') || 'Buscar miembros...'"
              class="pl-12 h-12 text-base border-2 focus:border-primary/50 transition-colors"
            />
            <div v-if="searchQuery" class="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">
              {{ filteredMembers.length }} {{ $t('community.attendance.results') || 'resultados' }}
            </div>
          </div>
        </div>

        <!-- Members List -->
        <div class="space-y-3">
          <TransitionGroup name="list">
            <div
              v-for="member in filteredMembers"
              :key="member.id"
              class="member-card group relative overflow-hidden bg-white dark:bg-slate-900 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border-2"
              :class="{
                'border-emerald-500 shadow-emerald-500/10 dark:shadow-emerald-500/20': member.attended,
                'border-transparent hover:border-slate-200 dark:hover:border-slate-700': !member.attended,
                'opacity-50 cursor-not-allowed': savingStates[member.id]
              }"
              @click="toggleAttendance(member)"
            >
              <!-- Animated background for attended members -->
              <div v-if="member.attended" class="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-teal-500/5"></div>

              <div class="relative flex items-center gap-4 p-4">
                <!-- Avatar with Initials -->
                <div class="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-white font-semibold text-lg transition-all"
                  :class="member.attended
                    ? 'bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/30'
                    : 'bg-gradient-to-br from-slate-400 to-slate-500 dark:from-slate-600 dark:to-slate-700'"
                >
                  {{ getInitials(member.participant.firstName, member.participant.lastName) }}
                </div>

                <!-- Member Info -->
                <div class="flex-1 min-w-0">
                  <div class="font-semibold text-slate-900 dark:text-white truncate text-base">
                    {{ member.participant.firstName }} {{ member.participant.lastName }}
                  </div>
                  <div v-if="hasPhone(member.participant)" class="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                    <Phone class="w-3.5 h-3.5" />
                    <span class="truncate">{{ formatPhones(member.participant) }}</span>
                  </div>
                </div>

                <!-- Status Button -->
                <div class="flex-shrink-0">
                  <button class="w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300"
                    :class="member.attended
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 group-hover:bg-slate-200 dark:group-hover:bg-slate-700'"
                  >
                    <Loader2 v-if="savingStates[member.id]" class="w-6 h-6 animate-spin" />
                    <Check v-else-if="member.attended" class="w-6 h-6" stroke-width="3" />
                    <div v-else class="w-4 h-4 rounded-full border-3 border-current"></div>
                  </button>
                </div>
              </div>
            </div>
          </TransitionGroup>
        </div>

        <!-- Empty State -->
        <Transition name="fade">
          <div v-if="filteredMembers.length === 0" class="bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-12 text-center">
            <div class="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
              <Search class="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              {{ $t('community.attendance.noMembersFound') || 'No se encontraron miembros' }}
            </h3>
            <p class="text-muted-foreground text-sm">
              {{ $t('community.attendance.tryDifferentSearch') || 'Intenta con otra búsqueda' }}
            </p>
          </div>
        </Transition>

        <!-- Bottom Spacer -->
        <div class="h-8"></div>
      </div>

      <!-- Join Community Modal -->
      <PublicJoinRequestModal
        :open="isJoinModalOpen"
        :community-id="communityId"
        :community-name="communityName"
        @update:open="isJoinModalOpen = $event"
        @submitted="isJoinModalOpen = false"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Search, Check, Users, AlertCircle, Loader2, UserPlus, Calendar, Phone } from 'lucide-vue-next';
import { Input } from '@repo/ui';
import { getApiUrl } from '@/config/runtimeConfig';
import { getRecaptchaToken, RECAPTCHA_ACTIONS } from '@/services/recaptcha';
import { formatMeetingDate } from '@/utils/meetingFlyer';
import PublicJoinRequestModal from '@/components/community/PublicJoinRequestModal.vue';

const { t: $t } = useI18n();
const route = useRoute();
const communityId = route.params.communityId as string;
const meetingId = route.params.meetingId as string;

const API_BASE = getApiUrl();
const attendanceUrl = `${API_BASE}/communities/public/attendance/${communityId}/${meetingId}`;

const members = ref<any[]>([]);
const communityName = ref('');
const meetingTitle = ref('');
const meetingStartDate = ref('');
const searchQuery = ref('');
const savingStates = ref<Record<string, boolean>>({});
const loading = ref(true);
const error = ref('');

// Join modal state
const isJoinModalOpen = ref(false);

const openJoinModal = () => {
  isJoinModalOpen.value = true;
};

const getInitials = (firstName: string, lastName: string): string => {
  const first = firstName?.charAt(0) || '';
  const last = lastName?.charAt(0) || '';
  return (first + last).toUpperCase();
};

const filteredMembers = computed(() => {
  if (!searchQuery.value) return members.value;
  const query = searchQuery.value.toLowerCase();
  return members.value.filter((m) => {
    const name = `${m.participant.firstName} ${m.participant.lastName}`.toLowerCase();
    const phones = [
      m.participant.cellPhone,
      m.participant.homePhone,
      m.participant.workPhone
    ].filter(Boolean).join(' ').toLowerCase();
    return name.includes(query) || phones.includes(query);
  });
});

const presentCount = computed(() => members.value.filter((m) => m.attended).length);

const hasPhone = (participant: any): boolean => {
  return !!(participant.cellPhone || participant.homePhone || participant.workPhone);
};

const formatPhones = (participant: any): string => {
  const phones: string[] = [];
  if (participant.cellPhone) phones.push(participant.cellPhone);
  if (participant.homePhone) phones.push(participant.homePhone);
  if (participant.workPhone) phones.push(participant.workPhone);
  return phones.join(' / ');
};

const toggleAttendance = async (member: any) => {
  if (savingStates.value[member.id]) return;

  savingStates.value[member.id] = true;
  const newStatus = !member.attended;

  try {
    // Get reCAPTCHA token for bot protection
    const recaptchaToken = await getRecaptchaToken(RECAPTCHA_ACTIONS.PUBLIC_ATTENDANCE_TOGGLE);

    const response = await fetch(attendanceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member.id, attended: newStatus, recaptchaToken }),
    });

    if (!response.ok) {
      throw new Error('Failed to save attendance');
    }

    member.attended = newStatus;
  } catch (err) {
    console.error('Failed to save attendance:', err);
    error.value = $t('community.attendance.saveError') || 'Error al guardar asistencia';
    setTimeout(() => { error.value = ''; }, 3000);
  } finally {
    savingStates.value[member.id] = false;
  }
};

onMounted(async () => {
  try {
    const res = await fetch(attendanceUrl);
    if (!res.ok) {
      if (res.status === 404) {
        error.value = $t('community.attendance.notFound') || 'Reunión no encontrada';
      } else {
        throw new Error('Failed to load attendance');
      }
      return;
    }

    const data = await res.json();
    members.value = data.members || [];
    communityName.value = data.communityName || '';
    meetingTitle.value = data.meetingTitle || '';
    meetingStartDate.value = data.meetingStartDate || '';
  } catch (err) {
    console.error('Failed to load attendance data:', err);
    error.value = $t('community.attendance.loadError') || 'Error al cargar datos';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.member-card {
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.member-card:active:not(.cursor-not-allowed) {
  transform: scale(0.98);
}

/* Ensure touch targets are at least 44x44px for iOS */
.member-card button {
  min-width: 44px;
  min-height: 44px;
}

/* List animations */
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.list-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.list-move {
  transition: transform 0.3s ease;
}

/* Fade animation for empty state */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Gradient text animation on hover */
.member-card:hover .member-name {
  background: linear-gradient(to right, inherit, inherit);
  -webkit-background-clip: text;
  background-clip: text;
}

/* Subtle pulse for loading state */
@keyframes pulse-glow {
  0%, 100% {
    box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
  }
  50% {
    box-shadow: 0 0 30px rgba(16, 185, 129, 0.5);
  }
}

.member-card:has(.attended) {
  animation: pulse-glow 2s ease-in-out infinite;
}
</style>
