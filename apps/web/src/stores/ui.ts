import { ref, watch } from 'vue';
import { defineStore } from 'pinia';

export const useUIStore = defineStore('ui', () => {
	// Initialize state from localStorage, default to false (expanded)
	const isSidebarCollapsed = ref(JSON.parse(localStorage.getItem('isSidebarCollapsed') || 'false'));

	// Watch for changes and update localStorage
	watch(isSidebarCollapsed, (newValue) => {
		localStorage.setItem('isSidebarCollapsed', JSON.stringify(newValue));
	});

	function toggleSidebar() {
		isSidebarCollapsed.value = !isSidebarCollapsed.value;
	}

	return {
		isSidebarCollapsed,
		toggleSidebar,
	};
});
