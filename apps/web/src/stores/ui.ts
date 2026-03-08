import { ref, watch, onScopeDispose } from 'vue';
import { defineStore } from 'pinia';

const MOBILE_BREAKPOINT = '(max-width: 767px)';

export const useUIStore = defineStore('ui', () => {
	// Initialize state from localStorage, default to false (expanded)
	const isSidebarCollapsed = ref(JSON.parse(localStorage.getItem('isSidebarCollapsed') || 'false'));

	// Mobile state
	const mql = window.matchMedia(MOBILE_BREAKPOINT);
	const isMobile = ref(mql.matches);
	const isMobileMenuOpen = ref(false);
	const pageTitle = ref('');

	const handleMediaChange = (e: MediaQueryListEvent) => {
		isMobile.value = e.matches;
		if (!e.matches) {
			isMobileMenuOpen.value = false;
		}
	};
	mql.addEventListener('change', handleMediaChange);

	// Watch for changes and update localStorage
	watch(isSidebarCollapsed, (newValue) => {
		localStorage.setItem('isSidebarCollapsed', JSON.stringify(newValue));
	});

	function toggleSidebar() {
		if (isMobile.value) {
			isMobileMenuOpen.value = !isMobileMenuOpen.value;
		} else {
			isSidebarCollapsed.value = !isSidebarCollapsed.value;
		}
	}

	function openMobileMenu() {
		isMobileMenuOpen.value = true;
	}

	function closeMobileMenu() {
		isMobileMenuOpen.value = false;
	}

	function cleanup() {
		mql.removeEventListener('change', handleMediaChange);
	}

	return {
		isSidebarCollapsed,
		isMobile,
		isMobileMenuOpen,
		pageTitle,
		toggleSidebar,
		openMobileMenu,
		closeMobileMenu,
		cleanup,
	};
});
