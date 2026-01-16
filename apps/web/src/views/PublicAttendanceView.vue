<template>
  <div class="public-attendance p-4 max-w-2xl mx-auto">
    <!-- Loading State -->
    <div v-if="loading" class="flex justify-center items-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-center py-12">
      <AlertCircle class="w-16 h-16 mx-auto mb-4 text-destructive" />
      <h2 class="text-xl font-bold mb-2">Error</h2>
      <p class="text-muted-foreground">{{ error }}</p>
    </div>

    <!-- Attendance View -->
    <template v-else>
      <!-- Header -->
      <div class="text-center mb-6">
        <h1 class="text-xl font-bold">{{ communityName }}</h1>
        <p class="text-muted-foreground">{{ meetingTitle }}</p>
        <div class="flex justify-center gap-4 mt-3 text-sm">
          <div class="flex items-center gap-1">
            <Check class="w-4 h-4 text-green-600" />
            <span>{{ presentCount }} {{ $t('community.attendance.present') }}</span>
          </div>
          <div class="flex items-center gap-1">
            <Users class="w-4 h-4 text-muted-foreground" />
            <span>{{ members.length }} {{ $t('community.attendance.total') }}</span>
          </div>
        </div>
      </div>

      <!-- Search -->
      <div class="relative mb-4">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          :placeholder="$t('community.attendance.searchMembers')"
          class="pl-9"
        />
      </div>

      <!-- Members List -->
      <div class="space-y-2">
        <div
          v-for="member in filteredMembers"
          :key="member.id"
          class="member-card flex items-center justify-between p-3 border rounded-lg transition-all"
          :class="{
            'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800': member.attended,
            'opacity-50 cursor-not-allowed': savingStates[member.id]
          }"
          @click="toggleAttendance(member)"
        >
          <div class="flex-1 min-w-0">
            <div class="font-medium truncate">
              {{ member.participant.firstName }} {{ member.participant.lastName }}
            </div>
            <div class="text-sm text-muted-foreground" v-if="hasPhone(member.participant)">
              {{ formatPhones(member.participant) }}
            </div>
          </div>
          <button
            class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all"
            :class="member.attended
              ? 'bg-green-600 text-white'
              : 'bg-muted text-muted-foreground'"
          >
            <Loader2 v-if="savingStates[member.id]" class="w-5 h-5 animate-spin" />
            <Check v-else-if="member.attended" class="w-5 h-5" />
            <div v-else class="w-3 h-3 rounded-full border-2 border-current" />
          </button>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="filteredMembers.length === 0" class="text-center py-12 text-muted-foreground">
        <Users class="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>{{ $t('community.attendance.noMembersFound') }}</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Search, Check, Users, AlertCircle, Loader2 } from 'lucide-vue-next';
import { Input } from '@repo/ui';
import { getApiUrl } from '@/config/runtimeConfig';
import { getRecaptchaToken, RECAPTCHA_ACTIONS } from '@/services/recaptcha';

const { t: $t } = useI18n();
const route = useRoute();
const communityId = route.params.communityId as string;
const meetingId = route.params.meetingId as string;

const API_BASE = getApiUrl();
const attendanceUrl = `${API_BASE}/communities/public/attendance/${communityId}/${meetingId}`;

const members = ref<any[]>([]);
const communityName = ref('');
const meetingTitle = ref('');
const searchQuery = ref('');
const savingStates = ref<Record<string, boolean>>({});
const loading = ref(true);
const error = ref('');

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
    error.value = $t('community.attendance.saveError');
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
        error.value = $t('community.attendance.notFound');
      } else {
        throw new Error('Failed to load attendance');
      }
      return;
    }

    const data = await res.json();
    members.value = data.members || [];
    communityName.value = data.communityName || '';
    meetingTitle.value = data.meetingTitle || '';
  } catch (err) {
    console.error('Failed to load attendance data:', err);
    error.value = $t('community.attendance.loadError');
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
</style>
