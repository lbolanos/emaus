import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import * as api from '../services/api';
import { useAuthStore as _useAuthStore } from './authStore';

function useAuthStore() {
	return _useAuthStore();
}

export type TestimonialVisibility = 'public' | 'friends' | 'retreat_participants' | 'private';

export interface Testimonial {
	id: number;
	userId: string;
	retreatId?: string | null;
	content: string;
	visibility: TestimonialVisibility;
	allowLandingPage: boolean;
	approvedForLanding: boolean;
	createdAt: string;
	updatedAt: string;
	user?: {
		id: string;
		displayName: string;
		photo?: string;
	};
	retreat?: {
		id: string;
		parish: string;
	};
}

export const useTestimonialStore = defineStore('testimonial', () => {
	// State
	const testimonials = ref<Testimonial[]>([]);
	const landingTestimonials = ref<Testimonial[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);
	const defaultVisibility = ref<TestimonialVisibility>('private');

	// Getters
	const myTestimonials = computed(() => {
		const authStore = useAuthStore();
		return testimonials.value.filter((t) => t.userId === authStore.user?.id);
	});

	const publicTestimonials = computed(() => {
		return testimonials.value.filter((t) => t.visibility === 'public');
	});

	// Actions
	const fetchTestimonials = async () => {
		loading.value = true;
		error.value = null;
		try {
			const result = await api.getTestimonials();
			testimonials.value = result;
			return testimonials.value;
		} catch (err: any) {
			error.value = err.message || 'Error al cargar testimonios';
		} finally {
			loading.value = false;
		}
	};

	const fetchTestimonialsByRetreat = async (retreatId: string) => {
		loading.value = true;
		error.value = null;
		try {
			testimonials.value = await api.getTestimonialsByRetreat(retreatId);
			return testimonials.value;
		} catch (err: any) {
			error.value = err.message || 'Error al cargar testimonios';
		} finally {
			loading.value = false;
		}
	};

	const fetchUserTestimonials = async (userId: string) => {
		loading.value = true;
		error.value = null;
		try {
			testimonials.value = await api.getUserTestimonials(userId);
			return testimonials.value;
		} catch (err: any) {
			error.value = err.message || 'Error al cargar testimonios';
		} finally {
			loading.value = false;
		}
	};

	const createTestimonial = async (data: {
		content: string;
		retreatId?: string | null;
		visibility?: TestimonialVisibility;
		allowLandingPage?: boolean;
	}) => {
		loading.value = true;
		error.value = null;
		try {
			const newTestimonial = await api.createTestimonial(data);
			testimonials.value.unshift(newTestimonial);
			return newTestimonial;
		} catch (err: any) {
			error.value = err.message || 'Error al crear testimonio';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const updateTestimonial = async (
		id: number,
		data: {
			content?: string;
			visibility?: TestimonialVisibility;
			allowLandingPage?: boolean;
		},
	) => {
		loading.value = true;
		error.value = null;
		try {
			const updated = await api.updateTestimonial(id, data);
			const index = testimonials.value.findIndex((t) => t.id === id);
			if (index !== -1) {
				testimonials.value[index] = updated;
			}
			return updated;
		} catch (err: any) {
			error.value = err.message || 'Error al actualizar testimonio';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const deleteTestimonial = async (id: number) => {
		loading.value = true;
		error.value = null;
		try {
			await api.deleteTestimonial(id);
			testimonials.value = testimonials.value.filter((t) => t.id !== id);
		} catch (err: any) {
			error.value = err.message || 'Error al eliminar testimonio';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	// Check if user is superadmin
	const isSuperadmin = () => {
		const authStore = useAuthStore();
		return authStore.userProfile?.roles?.some((role) => role.role.name === 'superadmin');
	};

	const approveForLanding = async (id: number) => {
		loading.value = true;
		error.value = null;
		try {
			if (!isSuperadmin()) {
				throw new Error('Solo los superadmins pueden aprobar testimonios');
			}
			const updated = await api.approveTestimonialForLanding(id);
			const index = testimonials.value.findIndex((t) => t.id === id);
			if (index !== -1) {
				testimonials.value[index] = updated;
			}
			return updated;
		} catch (err: any) {
			error.value = err.message || 'Error al aprobar testimonio';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const revokeLandingApproval = async (id: number) => {
		loading.value = true;
		error.value = null;
		try {
			if (!isSuperadmin()) {
				throw new Error('Solo los superadmins pueden revocar aprobaciones');
			}
			const updated = await api.revokeLandingApproval(id);
			const index = testimonials.value.findIndex((t) => t.id === id);
			if (index !== -1) {
				testimonials.value[index] = updated;
			}
			return updated;
		} catch (err: any) {
			error.value = err.message || 'Error al revocar aprobación';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const fetchLandingTestimonials = async () => {
		loading.value = true;
		error.value = null;
		try {
			landingTestimonials.value = await api.getLandingTestimonials();
			return landingTestimonials.value;
		} catch (err: any) {
			error.value = err.message || 'Error al cargar testimonios';
		} finally {
			loading.value = false;
		}
	};

	const fetchDefaultVisibility = async () => {
		try {
			const data = await api.getTestimonialDefaultVisibility();
			defaultVisibility.value = data.testimonialVisibilityDefault;
			return data.testimonialVisibilityDefault;
		} catch (err: any) {
			error.value = err.message || 'Error al cargar configuración';
		}
	};

	const setDefaultVisibility = async (visibility: TestimonialVisibility) => {
		try {
			const data = await api.setTestimonialDefaultVisibility(visibility);
			defaultVisibility.value = data.testimonialVisibilityDefault as TestimonialVisibility;
			return data;
		} catch (err: any) {
			error.value = err.message || 'Error al guardar configuración';
			throw err;
		}
	};

	return {
		testimonials,
		landingTestimonials,
		loading,
		error,
		defaultVisibility,
		myTestimonials,
		publicTestimonials,
		fetchTestimonials,
		fetchTestimonialsByRetreat,
		fetchUserTestimonials,
		createTestimonial,
		updateTestimonial,
		deleteTestimonial,
		approveForLanding,
		revokeLandingApproval,
		fetchLandingTestimonials,
		fetchDefaultVisibility,
		setDefaultVisibility,
		isSuperadmin,
	};
});
