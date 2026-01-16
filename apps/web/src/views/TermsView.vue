<template>
	<div class="min-h-screen bg-white font-sans text-stone-800">
		<!-- Navigation -->
		<nav class="fixed w-full z-50 bg-white/90 backdrop-blur-md shadow-sm py-3">
			<div class="max-w-7xl mx-auto px-6 flex justify-between items-center">
				<router-link to="/" class="flex items-center gap-2">
					<img src="/crossRoseButtT.png" alt="Emmaus Rose" class="w-8 h-8" />
					<span class="text-xl font-light tracking-widest uppercase text-stone-800">{{ $t('landing.emmaus') }}</span>
				</router-link>

				<router-link
					to="/"
					class="text-sm font-medium text-stone-600 hover:text-sage-600 transition-colors"
				>
					{{ $t('terms.backToHome') }}
				</router-link>
			</div>
		</nav>

		<!-- Content -->
		<main class="pt-24 pb-16 px-6">
			<div class="max-w-4xl mx-auto">
				<!-- Header -->
				<div class="mb-12">
					<h1 class="text-4xl font-light text-stone-900 mb-4">
						{{ $t('terms.title') }}
					</h1>
					<p class="text-stone-600">
						{{ $t('terms.lastUpdated', { date: lastUpdated }) }}
					</p>
				</div>

				<!-- Sections -->
				<div class="space-y-12">
					<!-- Introduction -->
					<section>
						<h2 class="text-2xl font-medium text-stone-900 mb-4">
							{{ $t('terms.intro.title') }}
						</h2>
						<p class="text-stone-600 leading-relaxed">
							{{ $t('terms.intro.content') }}
						</p>
					</section>

					<!-- Acceptance -->
					<section>
						<h2 class="text-2xl font-medium text-stone-900 mb-4">
							{{ $t('terms.acceptance.title') }}
						</h2>
						<p class="text-stone-600 leading-relaxed">
							{{ $t('terms.acceptance.content') }}
						</p>
					</section>

					<!-- User Responsibilities -->
					<section>
						<h2 class="text-2xl font-medium text-stone-900 mb-4">
							{{ $t('terms.responsibilities.title') }}
						</h2>
						<div class="text-stone-600 leading-relaxed space-y-4">
							<p>{{ $t('terms.responsibilities.content') }}</p>
							<ul class="list-disc pl-6 space-y-2">
								<li v-for="item in responsibilityItems" :key="item">{{ item }}</li>
							</ul>
						</div>
					</section>

					<!-- Data Accuracy -->
					<section>
						<h2 class="text-2xl font-medium text-stone-900 mb-4">
							{{ $t('terms.dataAccuracy.title') }}
						</h2>
						<p class="text-stone-600 leading-relaxed">
							{{ $t('terms.dataAccuracy.content') }}
						</p>
					</section>

					<!-- Privacy -->
					<section>
						<h2 class="text-2xl font-medium text-stone-900 mb-4">
							{{ $t('terms.privacy.title') }}
						</h2>
						<p class="text-stone-600 leading-relaxed">
							{{ $t('terms.privacy.content') }}
						</p>
					</section>

					<!-- Limitation of Liability -->
					<section>
						<h2 class="text-2xl font-medium text-stone-900 mb-4">
							{{ $t('terms.liability.title') }}
						</h2>
						<p class="text-stone-600 leading-relaxed">
							{{ $t('terms.liability.content') }}
						</p>
					</section>

					<!-- Termination -->
					<section>
						<h2 class="text-2xl font-medium text-stone-900 mb-4">
							{{ $t('terms.termination.title') }}
						</h2>
						<p class="text-stone-600 leading-relaxed">
							{{ $t('terms.termination.content') }}
						</p>
					</section>

					<!-- Intellectual Property -->
					<section>
						<h2 class="text-2xl font-medium text-stone-900 mb-4">
							{{ $t('terms.intellectual.title') }}
						</h2>
						<p class="text-stone-600 leading-relaxed">
							{{ $t('terms.intellectual.content') }}
						</p>
					</section>

					<!-- Modifications -->
					<section>
						<h2 class="text-2xl font-medium text-stone-900 mb-4">
							{{ $t('terms.modifications.title') }}
						</h2>
						<p class="text-stone-600 leading-relaxed">
							{{ $t('terms.modifications.content') }}
						</p>
					</section>

					<!-- Governing Law -->
					<section>
						<h2 class="text-2xl font-medium text-stone-900 mb-4">
							{{ $t('terms.law.title') }}
						</h2>
						<p class="text-stone-600 leading-relaxed">
							{{ $t('terms.law.content') }}
						</p>
					</section>

					<!-- Contact -->
					<section>
						<h2 class="text-2xl font-medium text-stone-900 mb-4">
							{{ $t('terms.contact.title') }}
						</h2>
						<div class="text-stone-600 leading-relaxed space-y-4">
							<p>{{ $t('terms.contact.content') }}</p>
							<p class="font-medium text-stone-800">
								{{ $t('terms.contact.email') }}: <a href="mailto:leonardo.bolanos@gmail.com" class="text-sage-600 hover:underline">leonardo.bolanos@gmail.com</a>
							</p>
						</div>
					</section>
				</div>
			</div>
		</main>

		<!-- Footer -->
		<footer class="py-12 border-t border-stone-100">
			<div class="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
				<router-link to="/" class="flex items-center gap-2">
					<img src="/crossRoseButtT.png" alt="Emmaus Rose" class="w-6 h-6" />
					<span class="text-sm font-light tracking-widest uppercase">{{ $t('landing.emmaus') }}</span>
				</router-link>
				<div class="flex gap-8 text-sm text-stone-400">
					<router-link to="/privacy" class="hover:text-stone-900 transition-colors">
						{{ $t('landing.footer.privacy') }}
					</router-link>
					<router-link to="/terms" class="hover:text-stone-900 transition-colors">
						{{ $t('landing.footer.terms') }}
					</router-link>
					<a href="mailto:leonardo.bolanos@gmail.com" class="hover:text-stone-900 transition-colors">
						{{ $t('landing.footer.contactUs') }}
					</a>
				</div>
			</div>
			<p class="text-center text-[10px] text-stone-300 mt-8 tracking-widest uppercase font-bold">
				{{ $t('landing.footer.copyright', { year: new Date().getFullYear() }) }}
			</p>
		</footer>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// Last updated date - you can update this when you change the terms
const lastUpdated = ref(new Date().toLocaleDateString('es-ES', {
	year: 'numeric',
	month: 'long',
	day: 'numeric',
}));

// Responsibility items
const responsibilityItems = ref([
	t('terms.responsibilities.items.accurate'),
	t('terms.responsibilities.items.password'),
	t('terms.responsibilities.items.conduct'),
	t('terms.responsibilities.items.legal'),
]);
</script>

<style scoped>
/* Sage color utility */
.hover\:text-sage-600:hover {
	color: #8DAA91;
}

.text-sage-600 {
	color: #8DAA91;
}
</style>
