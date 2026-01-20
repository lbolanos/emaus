<template>
  <div class="min-h-screen bg-white font-sans text-stone-800">
    <!-- Navigation -->
    <nav :class="['fixed w-full z-50 transition-all duration-300', scrolled ? 'bg-white/90 backdrop-blur-md shadow-sm py-3' : 'bg-transparent py-6']">
      <div class="max-w-7xl mx-auto px-6 flex justify-between items-center">
        <router-link to="/" class="flex items-center gap-2">
          <img src="/crossRoseButtT.png" alt="Emmaus Rose" class="w-8 h-8" />
          <span :class="['text-xl font-light tracking-widest uppercase', scrolled ? 'text-stone-800' : 'text-white']">{{ $t('landing.emmaus') }}</span>
        </router-link>

        <div class="hidden md:flex items-center gap-8">
          <a
            href="#the-path"
            :class="['text-sm font-medium hover:text-sage-600 transition-colors', scrolled ? 'text-stone-600' : 'text-white/90']"
          >
            {{ $t('landing.nav.thePath') }}
          </a>
          <a
            href="#retreats"
            :class="['text-sm font-medium hover:text-sage-600 transition-colors', scrolled ? 'text-stone-600' : 'text-white/90']"
          >
            {{ $t('landing.nav.retreats') }}
          </a>
          <a
            href="#community"
            :class="['text-sm font-medium hover:text-sage-600 transition-colors', scrolled ? 'text-stone-600' : 'text-white/90']"
          >
            {{ $t('landing.nav.community') }}
          </a>
          <a
            href="#stories"
            :class="['text-sm font-medium hover:text-sage-600 transition-colors', scrolled ? 'text-stone-600' : 'text-white/90']"
          >
            {{ $t('landing.nav.stories') }}
          </a>
          <div class="flex items-center gap-4 ml-4">
            <button @click="handleLoginClick" :class="['text-sm font-medium', scrolled ? 'text-stone-600' : 'text-white/90']">{{ $t('landing.loginLink') }}</button>
            <button @click="handleLoginClick" class="px-5 py-2 rounded-full bg-stone-800 text-white text-sm font-medium hover:bg-stone-700 transition-all">
              {{ $t('landing.signupLink') }}
            </button>
          </div>
        </div>

        <button class="md:hidden" @click="isMenuOpen = !isMenuOpen">
          <X v-if="isMenuOpen" :class="scrolled ? 'text-stone-800' : 'text-white'" :size="24" />
          <Menu v-else :class="scrolled ? 'text-stone-800' : 'text-white'" :size="24" />
        </button>
      </div>
    </nav>

    <!-- Hero Section -->
    <section class="relative h-screen flex items-center justify-center overflow-hidden">
      <div class="absolute inset-0 z-0">
        <img
          src="/landing.png"
          :alt="$t('landing.heroTitle')"
          class="w-full h-full object-cover scale-105"
        />
        <div class="absolute inset-0 bg-black/20"></div>
        <div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/90"></div>
      </div>

      <div class="relative z-10 text-center px-6 max-w-4xl animate-fade-in-up">
        <h1 class="text-5xl md:text-7xl font-light text-white mb-6 tracking-tight">
          {{ $t('landing.heroTitle') }}
        </h1>
        <p class="text-lg md:text-xl text-white/90 mb-10 font-light max-w-2xl mx-auto leading-relaxed">
          {{ $t('landing.heroSubtitle') }}
        </p>
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <a href="#retreats" class="px-8 py-4 rounded-full bg-white text-stone-800 font-medium hover:shadow-xl transition-all transform hover:-translate-y-1">
            {{ $t('landing.ctaButton') }}
          </a>
          <button class="px-8 py-4 rounded-full bg-white/10 backdrop-blur-md border border-white/30 text-white font-medium hover:bg-white/20 transition-all">
            {{ $t('landing.watchStory') }}
          </button>
        </div>
      </div>

      <div class="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce hidden md:block">
        <div class="w-px h-12 bg-gradient-to-b from-white to-transparent"></div>
      </div>
    </section>

    <!-- Upcoming Retreats Grid -->
    <section id="retreats" class="py-24 px-6 bg-white">
      <div class="max-w-7xl mx-auto">
        <div class="flex justify-between items-end mb-16">
          <div>
            <span class="text-sage-600 font-semibold tracking-widest uppercase text-xs mb-3 block" :style="{ color: '#8DAA91' }">
              {{ $t('landing.seasonalCalendar') }}
            </span>
            <h2 class="text-4xl font-light text-stone-900">{{ $t('landing.upcomingRetreats') }}</h2>
          </div>
          <router-link to="/login" class="hidden md:flex items-center gap-2 text-stone-500 hover:text-stone-900 transition-colors">
            {{ $t('landing.viewAllDates') }}
            <ChevronRight :size="18" />
          </router-link>
        </div>

        <div v-if="loadingRetreats" class="flex justify-center py-12">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-sage-600" :style="{ borderColor: '#8DAA91' }"></div>
        </div>

        <div v-else-if="retreats.length === 0" class="text-center py-12 text-stone-500">
          {{ $t('landing.noUpcomingRetreats') }}
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-10">
          <router-link
            v-for="retreat in retreats"
            :key="retreat.id"
            :to="`/login`"
            class="group cursor-pointer block"
          >
            <div class="aspect-[4/5] overflow-hidden rounded-2xl mb-6 relative">
              <img
                :src="getRetreatImage(retreats.indexOf(retreat))"
                :alt="retreat.parish"
                class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <button
                @click="openRetreatFlyer(retreat, $event)"
                class="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter hover:bg-white hover:shadow-lg transition-all cursor-pointer"
              >
                {{ $t('landing.viewDetails') }}
              </button>
            </div>
            <div class="flex items-start justify-between">
              <div>
                <h3 class="text-xl font-medium mb-1 group-hover:text-sage-600 transition-colors leading-tight">
                  {{ retreat.parish }}
                </h3>
                <p class="text-stone-500 text-sm flex items-center gap-1">
                  <MapPin :size="14" :style="{ color: '#8DAA91' }" />
                  {{ retreat.house?.city || '' }}{{ retreat.house?.state ? ', ' + retreat.house.state : '' }}
                </p>
              </div>
              <div class="text-right">
                <p class="text-xs font-bold text-stone-400 uppercase tracking-widest">
                  {{ formatDateRange(retreat.startDate, retreat.endDate).monthYear }}
                </p>
                <p class="text-sm font-medium text-stone-900">
                  {{ formatDateRange(retreat.startDate, retreat.endDate).dayRange }}
                </p>
              </div>
            </div>
          </router-link>
        </div>
      </div>
    </section>

    <!-- Interactive Map Section -->
    <section id="community" class="py-24 bg-stone-50 overflow-hidden relative">
      <div class="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div>
          <span class="text-sage-600 font-semibold tracking-widest uppercase text-xs mb-3 block" :style="{ color: '#8DAA91' }">
            {{ $t('landing.globalPresence') }}
          </span>
          <h2 class="text-4xl font-light text-stone-900 mb-6 leading-tight">{{ $t('landing.findCommunity') }}</h2>
          <p class="text-stone-600 mb-8 leading-relaxed max-w-md">
            {{ $t('landing.communityDesc') }}
          </p>

          <div class="space-y-4">
            <div class="p-4 rounded-xl bg-white shadow-sm border border-stone-100 flex items-center gap-4">
              <div class="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-500">
                <MapPin :size="20" />
              </div>
              <div>
                <h4 class="font-medium">{{ $t('landing.useMyLocation') }}</h4>
                <p class="text-xs text-stone-400">{{ $t('landing.findNearest') }}</p>
              </div>
            </div>
            <div class="relative">
              <input
                v-model="searchQuery"
                type="text"
                :placeholder="$t('landing.searchPlaceholder')"
                class="w-full px-6 py-4 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-sage-200 transition-all"
              />
              <button class="absolute right-2 top-2 bottom-2 px-4 bg-stone-800 text-white rounded-lg text-sm font-medium">
                {{ $t('landing.search') }}
              </button>
            </div>
          </div>
        </div>

        <div class="relative">
          <div class="aspect-square bg-white rounded-3xl shadow-2xl overflow-hidden border-8 border-white relative group">
            <!-- Mock Map UI -->
            <div class="absolute inset-0 bg-[#e5e7eb] opacity-40"></div>
            <svg class="absolute inset-0 w-full h-full text-stone-300" viewBox="0 0 800 800">
              <path d="M100,200 Q400,100 700,300 T500,600 T100,200" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="8 8" />
            </svg>

            <!-- Pulse Map Pins -->
            <button
              v-for="(community, i) in communities.slice(0, 4)"
              :key="community.id"
              @click="openJoinModal(community.id, community.name)"
              class="absolute flex items-center justify-center cursor-pointer hover:scale-125 transition-transform"
              :style="getMapPinPosition(i)"
              :title="community.name"
            >
              <div class="absolute w-12 h-12 bg-sage-500/20 rounded-full animate-ping" :style="{ backgroundColor: 'rgba(141, 170, 145, 0.2)' }"></div>
              <div class="relative w-4 h-4 bg-sage-600 rounded-full border-2 border-white shadow-lg" :style="{ backgroundColor: '#8DAA91' }"></div>
            </button>

            <div class="absolute bottom-6 left-6 right-6 p-4 bg-white/90 backdrop-blur rounded-xl shadow-lg transform transition-all group-hover:-translate-y-2.5">
              <div class="flex justify-between items-center">
                <div>
                  <p class="text-[10px] font-bold text-sage-600 uppercase tracking-widest" :style="{ color: '#8DAA91' }">
                    {{ $t('landing.nearestCircle') }}
                  </p>
                  <p class="font-medium">{{ communities[0]?.name || 'Loading...' }}</p>
                </div>
                <button
                  @click="openJoinModal(communities[0]?.id || '', communities[0]?.name || 'Community')"
                  class="px-3 py-1.5 bg-stone-800 text-white text-xs rounded-lg hover:bg-stone-700 transition-colors"
                >
                  {{ $t('landing.join') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Community Table -->
    <section class="py-24 px-6 bg-white">
      <div class="max-w-4xl mx-auto">
        <div class="text-center mb-16">
          <h2 class="text-3xl font-light mb-4">{{ $t('landing.communityMeetings') }}</h2>
          <div class="w-12 h-1 bg-sage-600 mx-auto" :style="{ backgroundColor: '#8DAA91' }"></div>
        </div>

        <div v-if="loadingMeetings" class="flex justify-center py-12">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-sage-600" :style="{ borderColor: '#8DAA91' }"></div>
        </div>

        <div v-else-if="meetings.length === 0" class="text-center py-12 text-stone-500">
          {{ $t('landing.noUpcomingMeetings') }}
        </div>

        <div v-else class="overflow-hidden border border-stone-100 rounded-2xl shadow-sm">
          <table class="w-full text-left">
            <thead class="bg-stone-50 border-b border-stone-100">
              <tr>
                <th class="px-8 py-5 text-sm font-semibold text-stone-500 uppercase tracking-wider">{{ $t('landing.tableHeaders.community') }}</th>
                <th class="px-8 py-5 text-sm font-semibold text-stone-500 uppercase tracking-wider">{{ $t('landing.tableHeaders.schedule') }}</th>
                <th class="px-8 py-5 text-sm font-semibold text-stone-500 uppercase tracking-wider">{{ $t('landing.tableHeaders.venue') }}</th>
                <th class="px-8 py-5"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-100">
              <tr v-for="meeting in meetings" :key="meeting.id" class="hover:bg-sage-50/30 transition-colors">
                <td class="px-8 py-6">
                  <div class="font-medium text-stone-900">{{ meeting.community?.name || meeting.community?.city || $t('landing.notAvailable') }}</div>
                </td>
                <td class="px-8 py-6">
                  <div class="flex items-center gap-2 text-stone-600 text-sm">
                    <Calendar :size="14" class="text-stone-300" />
                    <span>{{ formatMeetingDate(meeting.startDate) }}</span>
                    <span class="mx-1 text-stone-300">•</span>
                    <Clock :size="14" class="text-stone-300" />
                    <span>{{ formatMeetingTime(meeting.startDate) }}</span>
                  </div>
                </td>
                <td class="px-8 py-6">
                  <div class="text-sm text-stone-500">{{ meeting.community?.address || meeting.community?.city || $t('landing.toBeDetermined') }}</div>
                </td>
                <td class="px-8 py-6 text-right">
                  <button
                    @click="openJoinModal(meeting.community?.id || '', meeting.community?.name || meeting.community?.city || $t('landing.community'))"
                    class="text-xs font-bold uppercase tracking-widest hover:text-sage-700 transition-colors"
                    :style="{ color: '#8DAA91' }"
                  >
                    {{ $t('landing.inquire') }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Stories/Testimonials Section -->
    <section id="stories" class="py-24 px-6 bg-stone-50">
      <div class="max-w-7xl mx-auto">
        <div class="text-center mb-16">
          <span class="text-sage-600 font-semibold tracking-widest uppercase text-xs mb-3 block" :style="{ color: '#8DAA91' }">
            {{ $t('landing.storiesBadge') }}
          </span>
          <h2 class="text-4xl font-light text-stone-900">{{ $t('landing.storiesTitle') }}</h2>
          <p class="text-stone-600 mt-4 max-w-2xl mx-auto">{{ $t('landing.storiesSubtitle') }}</p>
        </div>

        <!-- Loading state -->
        <div v-if="loadingTestimonials" class="flex justify-center py-12">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-sage-600" :style="{ borderColor: '#8DAA91' }"></div>
        </div>

        <!-- Empty state -->
        <div v-else-if="testimonials.length === 0" class="text-center py-12 text-stone-500">
          <p>{{ $t('landing.noStories') }}</p>
        </div>

        <!-- Testimonials grid -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div
            v-for="testimonial in testimonials"
            :key="testimonial.id"
            class="bg-white rounded-2xl p-8 shadow-sm border border-stone-100 hover:shadow-lg transition-shadow"
          >
            <!-- Header: User info -->
            <div class="flex items-center gap-4 mb-4">
              <div class="w-12 h-12 rounded-full bg-sage-100 flex items-center justify-center text-sage-700 font-semibold overflow-hidden" :style="{ backgroundColor: 'rgba(141, 170, 145, 0.2)', color: '#6B8E6F' }">
                <img
                  v-if="testimonial.user?.photo"
                  :src="testimonial.user.photo"
                  :alt="`${testimonial.user.displayName} avatar`"
                  class="w-full h-full object-cover"
                />
                <span v-else>{{ getInitials(testimonial.user?.displayName) }}</span>
              </div>
              <div>
                <h4 class="font-semibold text-stone-900">{{ testimonial.user?.displayName }}</h4>
                <p class="text-xs text-stone-500">{{ formatDate(testimonial.createdAt) }}</p>
              </div>
            </div>

            <!-- Content -->
            <p class="text-stone-700 mb-4 whitespace-pre-wrap">{{ testimonial.content }}</p>

            <!-- Retreat info (if applicable) -->
            <div v-if="testimonial.retreat" class="flex items-center gap-2 text-xs text-stone-500 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
              <span>{{ testimonial.retreat.parish }}</span>
            </div>

            <!-- Landing indicator -->
            <div class="flex items-center gap-2 text-xs text-sage-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>{{ $t('landing.publishedOnLanding') }}</span>
            </div>
          </div>
        </div>

        <!-- CTA to share your story -->
        <div v-if="!authStore.isAuthenticated" class="text-center mt-12">
          <p class="text-stone-600 mb-4">{{ $t('landing.shareYourStory') }}</p>
          <button @click="handleLoginClick" class="px-6 py-3 rounded-full bg-stone-800 text-white font-medium hover:bg-stone-700 transition-colors">
            {{ $t('landing.loginToShare') }}
          </button>
        </div>
      </div>
    </section>

    <!-- CTA Footer Wrapper -->
    <section class="py-20 px-6">
      <div class="max-w-7xl mx-auto rounded-[3rem] overflow-hidden relative bg-stone-900 text-white p-12 md:p-24 text-center">
        <div class="absolute inset-0 opacity-20 pointer-events-none">
          <img
            src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=2000&auto=format&fit=crop" 
            class="w-full h-full object-cover"
          />
        </div>
        <div class="relative z-10 max-w-2xl mx-auto">
          <h2 class="text-4xl md:text-5xl font-light mb-8">{{ $t('landing.cta.title') }}</h2>
          <p class="text-stone-300 mb-10 text-lg font-light leading-relaxed">
            {{ $t('landing.cta.description') }}
          </p>
          <div class="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input
              v-model="email"
              type="email"
              :placeholder="$t('landing.cta.emailPlaceholder')"
              :disabled="subscribing"
              class="flex-1 px-6 py-4 rounded-full bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-white/30 disabled:opacity-50"
            />
            <button
              @click="handleSubscribe"
              :disabled="subscribing || !email.trim()"
              class="px-8 py-4 rounded-full bg-white text-stone-900 font-bold text-sm hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ subscribing ? $t('landing.subscribe.subscribing') : $t('landing.cta.subscribe') }}
            </button>
          </div>
          <p v-if="subscribeMessage" :class="['mt-4 text-sm', subscribeSuccess ? 'text-green-300' : 'text-red-300']">
            {{ $t(subscribeMessage) }}
          </p>
        </div>
      </div>
    </section>

    <!-- Simple Footer -->
    <footer class="py-12 border-t border-stone-100">
      <div class="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
        <router-link to="/" class="flex items-center gap-2">
          <img src="/crossRoseButtT.png" alt="Emmaus Rose" class="w-6 h-6" />
          <span class="text-sm font-light tracking-widest uppercase">{{ $t('landing.emmaus') }}</span>
        </router-link>
        <div class="flex gap-8 text-sm text-stone-400">
          <a href="#" class="hover:text-stone-900 transition-colors">{{ $t('landing.footer.about') }}</a>
          <router-link to="/privacy" class="hover:text-stone-900 transition-colors">{{ $t('landing.footer.privacy') }}</router-link>
          <router-link to="/terms" class="hover:text-stone-900 transition-colors">{{ $t('landing.footer.terms') }}</router-link>
          <a href="mailto:leonardo.bolanos@gmail.com" class="hover:text-stone-900 transition-colors">{{ $t('landing.footer.contactUs') }}</a>
        </div>
        <div class="flex gap-4">
          <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
            <Instagram :size="20" class="text-stone-400 hover:text-stone-900 transition-colors" />
          </a>
          <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
            <Facebook :size="20" class="text-stone-400 hover:text-stone-900 transition-colors" />
          </a>
          <a href="mailto:leonardo.bolanos@gmail.com" aria-label="Email">
            <Mail :size="20" class="text-stone-400 hover:text-stone-900 transition-colors" />
          </a>
        </div>
      </div>
      <p class="text-center text-[10px] text-stone-300 mt-8 tracking-widest uppercase font-bold">
        {{ $t('landing.footer.copyright', { year: new Date().getFullYear() }) }}
      </p>
    </footer>

    <!-- Public Join Request Modal -->
    <PublicJoinRequestModal
      v-if="selectedCommunity"
      :open="isJoinModalOpen"
      :community-id="selectedCommunity.id"
      :community-name="selectedCommunity.name"
      @update:open="isJoinModalOpen = $event"
      @submitted="isJoinModalOpen = false"
    />

    <!-- Public Retreat Flyer Modal -->
    <PublicRetreatFlyerModal
      :open="isRetreatFlyerOpen"
      :retreat="selectedRetreat"
      @update:open="isRetreatFlyerOpen = $event"
    />

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  MapPin,
  Calendar,
  Clock,
  ChevronRight,
  Menu,
  X,
  Instagram,
  Facebook,
  Mail
} from 'lucide-vue-next';
import { getPublicRetreats, getPublicCommunities, getPublicCommunityMeetings, subscribeToNewsletter, getLandingTestimonials } from '@/services/api';
import { formatDate as formatDateUtil } from '@repo/utils';
import { useToast } from '@repo/ui';
import { useAuthStore } from '@/stores/authStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useRouter } from 'vue-router';
import { getRecaptchaToken, RECAPTCHA_ACTIONS } from '@/services/recaptcha';
import PublicJoinRequestModal from '@/components/community/PublicJoinRequestModal.vue';
import PublicRetreatFlyerModal from '@/components/PublicRetreatFlyerModal.vue';

const { toast } = useToast();
const { t: $t } = useI18n();
const authStore = useAuthStore();
const retreatStore = useRetreatStore();
const router = useRouter();

// Handle login button click - check if user is already logged in
const handleLoginClick = async () => {
  // Check authentication status
  await authStore.checkAuthStatus();

  if (authStore.isAuthenticated) {
    // User is already logged in, redirect to dashboard
    await retreatStore.fetchRetreats();
    if (retreatStore.mostRecentRetreat) {
      router.push({ name: 'retreat-dashboard', params: { id: retreatStore.mostRecentRetreat.id } });
    } else {
      router.push('/app');
    }
  } else {
    // User is not logged in, go to login page
    router.push('/login');
  }
};

// State
const isMenuOpen = ref(false);
const scrolled = ref(false);
const searchQuery = ref('');
const email = ref('');
const loadingRetreats = ref(true);
const loadingMeetings = ref(true);
const loadingTestimonials = ref(true);
const subscribing = ref(false);
const subscribeMessage = ref('');
const subscribeSuccess = ref(false);

// Join modal state
const isJoinModalOpen = ref(false);
const selectedCommunity = ref<{ id: string; name: string } | null>(null);

// Retreat flyer modal state
const isRetreatFlyerOpen = ref(false);
const selectedRetreat = ref<any>(null);

// Data
const retreats = ref<any[]>([]);
const communities = ref<any[]>([]);
const meetings = ref<any[]>([]);
const testimonials = ref<any[]>([]);

// Pool of retreat images
const retreatImages = [
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=1000&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=1000&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1000&auto=format&fit=crop'
];

// Get image for retreat based on index
const getRetreatImage = (index: number) => {
  return retreatImages[index % retreatImages.length];
};

// Map pin positions for demo (distributed across the map)
const getMapPinPosition = (index: number) => {
  const positions = [
    { top: '30%', left: '40%' },
    { top: '55%', left: '70%' },
    { top: '45%', left: '20%' },
    { top: '20%', left: '80%' }
  ];
  return positions[index % positions.length];
};

// Get initials for avatar
const getInitials = (name: string) => {
  if (!name) return '?';
  const names = name.trim().split(/\s+/);
  if (names.length === 1) return names[0].charAt(0).toUpperCase();
  return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
};

// Format testimonial date
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return $t('landing.today');
  if (diffDays === 1) return $t('landing.yesterday');
  if (diffDays < 7) return `${diffDays} ${$t('landing.daysAgo')}`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} ${$t('landing.weeksAgo')}`;
  return `${Math.floor(diffDays / 30)} ${$t('landing.monthsAgo')}`;
};

// Format date range for retreat cards (using shared utility to avoid timezone issues)
const formatDateRange = (startDate: string, endDate: string) => {
  // Parse dates properly to avoid timezone shifts
  const parseDate = (dateStr: string) => {
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, year, month, day] = match.map(Number);
      return new Date(year, month - 1, day);
    }
    return new Date(dateStr);
  };

  const start = parseDate(startDate);
  const end = parseDate(endDate);

  const monthYear = start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const startDay = start.getDate();
  const endDay = end.getDate();
  const dayRange = `${startDay}${start.getMonth() === end.getMonth() ? `-${endDay}` : ''}`;

  return { monthYear, dayRange };
};

// Format meeting date (day of week)
const formatMeetingDate = (dateStr: string) => {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'long' });
};

// Format meeting time
const formatMeetingTime = (dateStr: string) => {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const timeMatch = dateStr.match(/T(\d{2}):(\d{2})/);
    const date = new Date(year, month, day);
    if (timeMatch) {
      date.setHours(Number(timeMatch[1]), Number(timeMatch[2]));
    }
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

// Fetch data on mount
const fetchData = async () => {
  try {
    loadingRetreats.value = true;
    loadingMeetings.value = true;

    const [retreatsData, communitiesData, meetingsData] = await Promise.all([
      getPublicRetreats(),
      getPublicCommunities(),
      getPublicCommunityMeetings()
    ]);

    retreats.value = retreatsData;
    communities.value = communitiesData;
    meetings.value = meetingsData;
  } catch (error) {
    console.error('Failed to fetch landing page data:', error);
  } finally {
    loadingRetreats.value = false;
    loadingMeetings.value = false;
  }
};

// Fetch landing testimonials
const fetchTestimonials = async () => {
  try {
    loadingTestimonials.value = true;
    const data = await getLandingTestimonials();
    testimonials.value = data;
  } catch (error) {
    console.error('Failed to fetch landing testimonials:', error);
    testimonials.value = [];
  } finally {
    loadingTestimonials.value = false;
  }
};

// Subscribe to newsletter
const handleSubscribe = async () => {
  const emailValue = email.value.trim();

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailValue || !emailRegex.test(emailValue)) {
    subscribeMessage.value = 'landing.subscribe.invalidEmail';
    subscribeSuccess.value = false;
    return;
  }

  subscribing.value = true;
  subscribeMessage.value = '';

  try {
    // Get reCAPTCHA token for bot protection
    const recaptchaToken = await getRecaptchaToken(RECAPTCHA_ACTIONS.NEWSLETTER_SUBSCRIBE);

    const result = await subscribeToNewsletter(emailValue, recaptchaToken);

    if (result.alreadySubscribed) {
      subscribeMessage.value = 'landing.subscribe.alreadySubscribed';
      subscribeSuccess.value = true;
    } else {
      subscribeMessage.value = 'landing.subscribe.success';
      subscribeSuccess.value = true;
      email.value = ''; // Clear email on successful subscription
    }
  } catch (error: any) {
    console.error('Newsletter subscription error:', error);
    if (error.response?.status === 409) {
      subscribeMessage.value = 'landing.subscribe.alreadySubscribed';
    } else {
      subscribeMessage.value = 'landing.subscribe.error';
    }
    subscribeSuccess.value = false;
  } finally {
    subscribing.value = false;
  }
};

// Scroll handler
const handleScroll = () => {
  scrolled.value = window.scrollY > 20;
};

// Open join modal for a community
const openJoinModal = (communityId: string, communityName: string) => {
  console.log('Opening join modal:', { communityId, communityName });
  selectedCommunity.value = { id: communityId, name: communityName };
  isJoinModalOpen.value = true;
};

// Open retreat flyer modal
const openRetreatFlyer = (retreat: any, event: Event) => {
  event.preventDefault();
  event.stopPropagation();
  selectedRetreat.value = retreat;
  isRetreatFlyerOpen.value = true;
};

// Lifecycle
onMounted(() => {
  window.addEventListener('scroll', handleScroll);
  fetchData();
  fetchTestimonials();
});

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
});
</script>

<style scoped>
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fade-in-up 1s ease-out forwards;
}

@keyframes bounce {
  0%, 100% {
    transform: translateX(-50%) translateY(0);
  }
  50% {
    transform: translateX(-50%) translateY(-10px);
  }
}

.animate-bounce {
  animation: bounce 2s infinite;
}

@keyframes ping {
  75%, 100% {
    transform: scale(2);
    opacity: 0;
  }
}

.animate-ping {
  animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
}

/* Sage color utility */
.hover\:text-sage-600:hover {
  color: #8DAA91;
}

.bg-sage-600 {
  background-color: #8DAA91;
}

.text-sage-600 {
  color: #8DAA91;
}

.hover\:text-sage-700:hover {
  color: #7a9680;
}

.focus\:ring-sage-200:focus {
  --tw-ring-color: rgba(141, 170, 145, 0.5);
}

.hover\:bg-sage-50\/30:hover {
  background-color: rgba(141, 170, 145, 0.15);
}

.bg-sage-500\/20 {
  background-color: rgba(141, 170, 145, 0.2);
}
</style>
