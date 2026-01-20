<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useTestimonialStore, type Testimonial } from '@/stores/testimonialStore';
import { useToast } from '@repo/ui';
import { useAuthStore as _useAuthStore } from '@/stores/authStore';
import TestimonialList from '@/components/social/TestimonialList.vue';
import TestimonialForm from '@/components/social/TestimonialForm.vue';
import type { TestimonialVisibility } from '@/stores/testimonialStore';

const testimonialStore = useTestimonialStore();
const { toast } = useToast();

// Use storeToRefs to maintain reactivity
const { testimonials, loading } = storeToRefs(testimonialStore);

// State
const showForm = ref(false);
const editingTestimonial = ref<Testimonial | null>(null);

// Methods
const loadTestimonials = async () => {
	try {
		await testimonialStore.fetchTestimonials();
	} catch (error: any) {
		toast({
			title: 'Error',
			description: error.message || 'No se pudieron cargar los testimonios',
			variant: 'destructive',
		});
	}
};

const handleCreateNew = () => {
	editingTestimonial.value = null;
	showForm.value = true;
};

const handleCancelForm = () => {
	showForm.value = false;
	editingTestimonial.value = null;
};

const handleSubmitForm = async (data: {
	content: string;
	retreatId: string | null;
	visibility: TestimonialVisibility;
	allowLandingPage: boolean;
}) => {
	try {
		if (editingTestimonial.value) {
			await testimonialStore.updateTestimonial(editingTestimonial.value.id, data);
			toast({
				title: 'Testimonio actualizado',
				description: 'Tu testimonio ha sido actualizado correctamente',
			});
		} else {
			await testimonialStore.createTestimonial(data);
			toast({
				title: 'Testimonio publicado',
				description: 'Tu testimonio ha sido publicado correctamente',
			});
		}
		showForm.value = false;
		editingTestimonial.value = null;
	} catch (error: any) {
		toast({
			title: 'Error',
			description: error.message || 'No se pudo guardar el testimonio',
			variant: 'destructive',
		});
	}
};

const handleEditTestimonial = (testimonial: Testimonial) => {
	const authStore = _useAuthStore();
	const isOwner = testimonial.userId === authStore.user?.id;

	// If user is the owner, show the edit form
	// Otherwise (superadmin), this is a landing approval toggle
	if (isOwner) {
		editingTestimonial.value = testimonial;
		showForm.value = true;
	} else {
		handleLandingToggle(testimonial);
	}
};

const handleLandingToggle = async (testimonial: Testimonial) => {
	try {
		if (testimonial.approvedForLanding) {
			await testimonialStore.approveForLanding(testimonial.id);
			toast({
				title: 'Testimonio aprobado',
				description: 'El testimonio ahora aparecerá en la landing page',
			});
		} else {
			await testimonialStore.revokeLandingApproval(testimonial.id);
			toast({
				title: 'Aprobación revocada',
				description: 'El testimonio ya no aparecerá en la landing page',
			});
		}
	} catch (error: any) {
		toast({
			title: 'Error',
			description: error.message || 'No se pudo actualizar el estado',
			variant: 'destructive',
		});
	}
};

const handleDeleteTestimonial = async (testimonial: Testimonial) => {
	if (!confirm('¿Estás seguro de que quieres eliminar este testimonio?')) {
		return;
	}

	try {
		await testimonialStore.deleteTestimonial(testimonial.id);
		toast({
			title: 'Testimonio eliminado',
			description: 'Tu testimonio ha sido eliminado correctamente',
		});
	} catch (error: any) {
		toast({
			title: 'Error',
			description: error.message || 'No se pudo eliminar el testimonio',
			variant: 'destructive',
		});
	}
};

onMounted(() => {
	loadTestimonials();
});
</script>

<template>
	<div class="container mx-auto px-4 py-8 max-w-4xl">
		<!-- Header -->
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-3xl font-bold">Testimonios</h1>
				<p class="text-sm text-muted-foreground mt-1">
					Comparte tus experiencias de los retiros
				</p>
			</div>
			<button
				v-if="!showForm"
				@click="handleCreateNew"
				class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
					<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
				</svg>
				Nuevo testimonio
			</button>
		</div>

		<!-- Form (when creating/editing) -->
		<div v-if="showForm" class="mb-6">
			<TestimonialForm
				:edit-testimonial="editingTestimonial"
				:onCancelCallback="handleCancelForm"
				@submit="handleSubmitForm"
			/>
		</div>

		<!-- Testimonials List -->
		<TestimonialList
			:testimonials="testimonials"
			:loading="loading"
			@edit="handleEditTestimonial"
			@delete="handleDeleteTestimonial"
		/>
	</div>
</template>
