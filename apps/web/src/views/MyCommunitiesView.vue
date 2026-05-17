<template>
  <div class="container max-w-5xl mx-auto p-4 md:p-6">
    <header class="mb-6">
      <h1 class="text-3xl font-light text-stone-900">{{ $t('myCommunities.title') }}</h1>
      <p class="text-sm text-stone-500 mt-1">{{ $t('myCommunities.subtitle') }}</p>
    </header>

    <div v-if="loading" class="flex justify-center py-16">
      <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-sage-600" :style="{ borderColor: '#8DAA91' }" />
    </div>

    <div v-else-if="error" class="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
      {{ $t('myCommunities.errorLoading') }}
    </div>

    <div v-else-if="communities.length === 0" class="rounded-2xl border-2 border-dashed border-stone-200 p-12 text-center">
      <MapPin :size="48" class="mx-auto mb-3 text-stone-300" />
      <h2 class="text-lg font-medium text-stone-700">{{ $t('myCommunities.emptyTitle') }}</h2>
      <p class="text-sm text-stone-500 mt-1 mb-4">{{ $t('myCommunities.emptyDesc') }}</p>
      <router-link to="/" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-stone-800 text-white text-sm">
        {{ $t('myCommunities.findCommunity') }}
      </router-link>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        v-for="entry in communities"
        :key="entry.community.id"
        class="bg-white rounded-2xl border border-stone-100 shadow-sm p-5"
      >
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="min-w-0">
            <h3 class="font-semibold text-stone-900 truncate">{{ entry.community.name }}</h3>
            <p v-if="entry.community.city" class="text-sm text-stone-500 truncate">
              {{ entry.community.city }}{{ entry.community.state ? ', ' + entry.community.state : '' }}
            </p>
          </div>
          <span class="shrink-0 text-xs uppercase tracking-widest font-medium px-2 py-1 rounded-full" :style="{ backgroundColor: 'rgba(141,170,145,0.15)', color: '#8DAA91' }">
            {{ $t('myCommunities.member') }}
          </span>
        </div>

        <div v-if="entry.upcomingMeetings.length > 0" class="space-y-2">
          <p class="text-xs font-bold text-stone-500 uppercase tracking-widest">
            {{ $t('myCommunities.upcoming') }}
          </p>
          <div
            v-for="m in entry.upcomingMeetings"
            :key="m.id"
            class="flex items-start justify-between gap-3 p-3 rounded-lg bg-stone-50 border border-stone-100"
          >
            <div class="min-w-0">
              <p class="font-medium text-sm text-stone-900 truncate">{{ m.title }}</p>
              <p class="text-xs text-stone-500 mt-0.5">
                {{ formatMeetingDate(m.startDate) }}
              </p>
            </div>
            <a
              :href="`/public/attendance/${entry.community.id}/${m.id}`"
              class="shrink-0 text-xs font-bold uppercase tracking-widest hover:underline"
              :style="{ color: '#8DAA91' }"
            >
              {{ $t('myCommunities.confirm') }}
            </a>
          </div>
        </div>

        <div v-else class="text-sm text-stone-400 italic py-2">
          {{ $t('myCommunities.noMeetings') }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { MapPin } from 'lucide-vue-next';
import { getMyCommunities } from '@/services/api';

const { t: $t } = useI18n();

const loading = ref(true);
const error = ref(false);
const communities = ref<any[]>([]);

const formatMeetingDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

onMounted(async () => {
  try {
    communities.value = await getMyCommunities();
  } catch (err) {
    console.error('Failed to fetch my communities', err);
    error.value = true;
  } finally {
    loading.value = false;
  }
});
</script>
