<template>
  <section id="the-path" class="py-24 px-6 bg-white">
    <div class="max-w-7xl mx-auto">
      <div class="text-center max-w-2xl mx-auto mb-16">
        <span class="font-semibold tracking-widest uppercase text-xs mb-3 block" :style="{ color: '#8DAA91' }">
          {{ $t('landing.thePath.badge') }}
        </span>
        <h2 class="text-4xl font-light text-stone-900 leading-tight">{{ $t('landing.thePath.title') }}</h2>
        <p class="text-stone-600 mt-4 font-light leading-relaxed">{{ $t('landing.thePath.subtitle') }}</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
        <div v-for="step in STEPS" :key="step.key" class="text-center md:text-left">
          <div
            class="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto md:mx-0 mb-5"
            :style="{ backgroundColor: 'rgba(141, 170, 145, 0.18)', color: '#6B8E6F' }"
          >
            <component :is="step.icon" :size="22" />
          </div>
          <h3 class="text-xl font-medium text-stone-900 mb-3">{{ $t(`landing.thePath.steps.${step.key}.title`) }}</h3>
          <p class="text-stone-600 leading-relaxed font-light">
            {{ $t(`landing.thePath.steps.${step.key}.body`) }}
          </p>
        </div>
      </div>

      <div class="max-w-3xl mx-auto">
        <h3 class="text-2xl font-light text-stone-900 text-center mb-8">{{ $t('landing.thePath.faqTitle') }}</h3>
        <div class="divide-y divide-stone-200 border-y border-stone-200">
          <details v-for="key in FAQ_KEYS" :key="key" class="group py-4">
            <summary
              class="flex items-center justify-between gap-4 cursor-pointer list-none text-stone-900 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 rounded"
            >
              {{ $t(`landing.thePath.faq.${key}.q`) }}
              <ChevronDown :size="18" class="faq-chevron shrink-0 text-stone-400 transition-transform" />
            </summary>
            <p class="text-stone-600 leading-relaxed font-light mt-3 pr-8">
              {{ $t(`landing.thePath.faq.${key}.a`) }}
            </p>
          </details>
        </div>

        <div class="text-center mt-10">
          <a
            href="#retreats"
            class="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-stone-900 text-white font-medium hover:bg-stone-700 transition-colors"
          >
            {{ $t('landing.thePath.cta') }}
            <ChevronRight :size="18" />
          </a>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ChevronDown, ChevronRight, HeartHandshake, Sunrise, Users } from 'lucide-vue-next';

// Each step/question renders from i18n keys so the copy stays editable in es.json / en.json
const STEPS = [
  { key: 'weekend', icon: Sunrise },
  { key: 'team', icon: Users },
  { key: 'after', icon: HeartHandshake },
] as const;

const FAQ_KEYS = ['who', 'duration', 'bring', 'cost', 'signup', 'serve'] as const;
</script>

<style scoped>
/* Native <details> keeps the FAQ accessible and JS-free; only the arrow needs styling */
details[open] .faq-chevron {
  transform: rotate(180deg);
}

summary::-webkit-details-marker {
  display: none;
}
</style>
