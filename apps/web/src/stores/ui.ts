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

	// Sidebar section accordion. Shared through the store (not local refs) so
	// the desktop sidebar and the mobile drawer — two Sidebar instances —
	// cannot drift apart, and so a category missing from an older
	// localStorage record is seeded instead of defaulting to "open forever".
	const collapsedSections = ref<Record<string, boolean>>({});
	const isRetreatGroupCollapsed = ref(
		JSON.parse(localStorage.getItem('sidebar-retreat-group-collapsed') || 'false'),
	);

	watch(isRetreatGroupCollapsed, (val) => {
		localStorage.setItem('sidebar-retreat-group-collapsed', JSON.stringify(val));
	});

	function persistCollapsedSections() {
		try {
			localStorage.setItem('sidebar-collapsed-sections', JSON.stringify(collapsedSections.value));
		} catch (error) {
			console.error('Failed to save collapsed state:', error);
		}
	}

	// Seeds the accordion from the categories actually rendered (never from a
	// fixed list — RETREAT_CATEGORIES drags a 'services' ghost with no section).
	// Categories absent from a saved record are seeded COLLAPSED, and records
	// with more than one open section are repaired to keep the first one.
	// Idempotent: both Sidebar instances call it on mount.
	function initSidebarAccordion(categories: string[]) {
		try {
			const saved = localStorage.getItem('sidebar-collapsed-sections');
			const next: Record<string, boolean> = saved ? JSON.parse(saved) : {};
			categories.forEach((category) => {
				if (!(category in next)) next[category] = true;
			});
			const openKeys = categories.filter((category) => !next[category]);
			if (openKeys.length > 1) {
				categories.forEach((category) => {
					next[category] = true;
				});
				next[openKeys[0]] = false;
			}
			collapsedSections.value = next;
			persistCollapsedSections();
		} catch (error) {
			console.error('Failed to load collapsed state:', error);
			const next: Record<string, boolean> = {};
			categories.forEach((category) => {
				next[category] = true;
			});
			collapsedSections.value = next;
		}
	}

	// Full accordion: opening a section closes every other one. Returns
	// whether the section ended up open (the sidebar uses it to collapse the
	// retreat group when a non-retreat section opens).
	function toggleSidebarSection(category: string): boolean {
		const isCurrentlyCollapsed = collapsedSections.value[category] ?? true;
		Object.keys(collapsedSections.value).forEach((key) => {
			collapsedSections.value[key] = true;
		});
		collapsedSections.value[category] = !isCurrentlyCollapsed;
		persistCollapsedSections();
		// Whether the section ended up OPEN: collapsed→open returns true,
		// open→collapsed returns false. (The new collapsed value is
		// !isCurrentlyCollapsed; open is its negation.)
		return isCurrentlyCollapsed;
	}

	function toggleRetreatGroup() {
		const wasCollapsed = isRetreatGroupCollapsed.value;
		if (wasCollapsed) {
			// Opening the retreat group: collapse all other sections
			Object.keys(collapsedSections.value).forEach((key) => {
				collapsedSections.value[key] = true;
			});
			persistCollapsedSections();
		}
		isRetreatGroupCollapsed.value = !wasCollapsed;
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
		collapsedSections,
		isRetreatGroupCollapsed,
		initSidebarAccordion,
		toggleSidebarSection,
		toggleRetreatGroup,
	};
});
