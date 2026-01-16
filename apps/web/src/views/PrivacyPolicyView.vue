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
					{{ $t('privacy.backToHome') }}
				</router-link>
			</div>
		</nav>

		<!-- Content -->
		<main class="pt-24 pb-16 px-6">
			<div class="max-w-4xl mx-auto">
				<!-- Header -->
				<div class="mb-12">
					<h1 class="text-4xl font-light text-stone-900 mb-4">
						{{ $t('privacy.title') }}
					</h1>
					<p class="text-stone-600">
						{{ $t('privacy.lastUpdated', { date: lastUpdated }) }}
					</p>
				</div>

				<!-- Sections -->
				<div class="space-y-12">
					<!-- Introduction -->
					<section>
						<h2 class="text-2xl font-medium text-stone-900 mb-4">
							{{ $t('privacy.intro.title') }}
						</h2>
						<p class="text-stone-600 leading-relaxed">
							{{ $t('privacy.intro.content') }}
						</p>
					</section>

					<!-- Information Collection -->
					<section>
						<h2 class="text-2xl font-medium text-stone-900 mb-4">
							{{ $t('privacy.information.title') }}
						</h2>
						<div class="text-stone-600 leading-relaxed space-y-4">
							<p>{{ $t('privacy.information.content') }}</p>
							<ul class="list-disc pl-6 space-y-2">
								<li v-for="item in informationItems" :key="item">{{ item }}</li>
							</ul>
						</div>
					</section>

					<!-- Use of Information -->
					<section>
						<h2 class="text-2xl font-medium text-stone-900 mb-4">
							{{ $t('privacy.use.title') }}
						</h2>
						<div class="text-stone-600 leading-relaxed space-y-4">
							<p>{{ $t('privacy.use.content') }}</p>
							<ul class="list-disc pl-6 space-y-2">
								<li v-for="item in useItems" :key="item">{{ item }}</li>
							</ul>
						</div>
					</section>

					<!-- Data Protection -->
					<section>
						<h2 class="text-2xl font-medium text-stone-900 mb-4">
							{{ $t('privacy.protection.title') }}
						</h2>
						<p class="text-stone-600 leading-relaxed">
							{{ $t('privacy.protection.content') }}
						</p>
					</section>

					<!-- Cookies -->
					<section>
						<h2 class="text-2xl font-medium text-stone-900 mb-4">
							{{ $t('privacy.cookies.title') }}
						</h2>
						<p class="text-stone-600 leading-relaxed">
							{{ $t('privacy.cookies.content') }}
						</p>
					</section>

					<!-- Third Parties -->
					<section>
						<h2 class="text-2xl font-medium text-stone-900 mb-4">
							{{ $t('privacy.thirdParties.title') }}
						</h2>
						<div class="text-stone-600 leading-relaxed space-y-4">
							<p>{{ $t('privacy.thirdParties.content') }}</p>
							<ul class="list-disc pl-6 space-y-2">
								<li>{{ $t('privacy.thirdParties.google') }}</li>
								<li>{{ $t('privacy.thirdParties.recaptcha') }}</li>
							</ul>
						</div>
					</section>

					<!-- User Rights -->
					<section>
						<h2 class="text-2xl font-medium text-stone-900 mb-4">
							{{ $t('privacy.rights.title') }}
						</h2>
						<div class="text-stone-600 leading-relaxed space-y-4">
							<p>{{ $t('privacy.rights.content') }}</p>
							<ul class="list-disc pl-6 space-y-2">
								<li v-for="item in rightsItems" :key="item">{{ item }}</li>
							</ul>
						</div>
					</section>

					<!-- Contact -->
					<section>
						<h2 class="text-2xl font-medium text-stone-900 mb-4">
							{{ $t('privacy.contact.title') }}
						</h2>
						<div class="text-stone-600 leading-relaxed space-y-4">
							<p>{{ $t('privacy.contact.content') }}</p>
							<p class="font-medium text-stone-800">
								{{ $t('privacy.contact.email') }}: <a href="mailto:leonardo.bolanos@gmail.com" class="text-sage-600 hover:underline">leonardo.bolanos@gmail.com</a>
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
					<a href="#" class="hover:text-stone-900 transition-colors">{{ $t('landing.footer.terms') }}</a>
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

// Last updated date - you can update this when you change the policy
const lastUpdated = ref(new Date().toLocaleDateString('es-ES', {
	year: 'numeric',
	month: 'long',
	day: 'numeric',
}));

// Information items
const informationItems = ref([
	t('privacy.information.items.personal'),
	t('privacy.information.items.contact'),
	t('privacy.information.items.demographic'),
]);

// Use of information items
const useItems = ref([
	t('privacy.use.items.registration'),
	t('privacy.use.items.communication'),
	t('privacy.use.items.improvement'),
]);

// User rights items
const rightsItems = ref([
	t('privacy.rights.items.access'),
	t('privacy.rights.items.correction'),
	t('privacy.rights.items.deletion'),
	t('privacy.rights.items.objection'),
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
