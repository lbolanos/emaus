import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useReceptionStore = defineStore('reception', () => {
	const pendingCount = ref<number | null>(null);

	function setPending(count: number) {
		pendingCount.value = count;
	}

	function clear() {
		pendingCount.value = null;
	}

	return { pendingCount, setPending, clear };
});
