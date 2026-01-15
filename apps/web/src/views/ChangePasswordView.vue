<template>
	<div class="container mx-auto p-6">
		<div class="mb-6">
			<h1 class="text-2xl font-bold text-gray-900">{{ t('changePassword.title') }}</h1>
			<p class="text-gray-600 mt-2">
				Cambia tu contraseña para mantener tu cuenta segura.
			</p>
		</div>

		<!-- Form Card -->
		<div class="max-w-md">
			<form @submit.prevent="handleSubmit" class="bg-white rounded-lg shadow-md border border-gray-200 p-6 space-y-4">
				<!-- Current Password -->
				<div class="space-y-2">
					<Label for="current-password">{{ t('changePassword.currentPassword') }}</Label>
					<div class="relative">
						<Input
							id="current-password"
							:type="showCurrentPassword ? 'text' : 'password'"
							:placeholder="t('changePassword.currentPasswordPlaceholder')"
							v-model="formData.currentPassword"
							:disabled="isLoading"
							:class="{ 'border-red-500': errors.currentPassword }"
						/>
						<button
							type="button"
							@click="showCurrentPassword = !showCurrentPassword"
							class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
							tabindex="-1"
						>
							<Eye v-if="!showCurrentPassword" class="w-5 h-5" />
							<EyeOff v-else class="w-5 h-5" />
						</button>
					</div>
					<p v-if="errors.currentPassword" class="text-sm text-red-600">{{ errors.currentPassword }}</p>
				</div>

				<!-- New Password -->
				<div class="space-y-2">
					<Label for="new-password">{{ t('changePassword.newPassword') }}</Label>
					<div class="relative">
						<Input
							id="new-password"
							:type="showNewPassword ? 'text' : 'password'"
							:placeholder="t('changePassword.newPasswordPlaceholder')"
							v-model="formData.newPassword"
							:disabled="isLoading"
							:class="{ 'border-red-500': errors.newPassword }"
						/>
						<button
							type="button"
							@click="showNewPassword = !showNewPassword"
							class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
							tabindex="-1"
						>
							<Eye v-if="!showNewPassword" class="w-5 h-5" />
							<EyeOff v-else class="w-5 h-5" />
						</button>
					</div>
					<p v-if="errors.newPassword" class="text-sm text-red-600">{{ errors.newPassword }}</p>
				</div>

				<!-- Confirm Password -->
				<div class="space-y-2">
					<Label for="confirm-password">{{ t('changePassword.confirmPassword') }}</Label>
					<div class="relative">
						<Input
							id="confirm-password"
							:type="showConfirmPassword ? 'text' : 'password'"
							:placeholder="t('changePassword.confirmPasswordPlaceholder')"
							v-model="formData.confirmPassword"
							:disabled="isLoading"
							:class="{ 'border-red-500': errors.confirmPassword }"
						/>
						<button
							type="button"
							@click="showConfirmPassword = !showConfirmPassword"
							class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
							tabindex="-1"
						>
							<Eye v-if="!showConfirmPassword" class="w-5 h-5" />
							<EyeOff v-else class="w-5 h-5" />
						</button>
					</div>
					<p v-if="errors.confirmPassword" class="text-sm text-red-600">{{ errors.confirmPassword }}</p>
				</div>

				<!-- Server Error -->
				<div v-if="serverError" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
					{{ serverError }}
				</div>

				<!-- Actions -->
				<div class="flex gap-3 pt-4">
					<Button
						type="button"
						variant="outline"
						@click="handleCancel"
						:disabled="isLoading"
						class="flex-1"
					>
						{{ t('changePassword.cancel') }}
					</Button>
					<Button
						type="submit"
						:disabled="isLoading"
						class="flex-1"
					>
						<span v-if="isLoading" class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
						{{ isLoading ? 'Cambiando...' : t('changePassword.submit') }}
					</Button>
				</div>
			</form>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useToast } from '@repo/ui';
import { Button, Input, Label } from '@repo/ui';
import { Eye, EyeOff } from 'lucide-vue-next';
import { changePassword as changePasswordApi } from '@/services/api';

const { t } = useI18n();
const router = useRouter();
const { toast } = useToast();

// Form data
const formData = reactive({
	currentPassword: '',
	newPassword: '',
	confirmPassword: ''
});

// UI state
const isLoading = ref(false);
const showCurrentPassword = ref(false);
const showNewPassword = ref(false);
const showConfirmPassword = ref(false);
const serverError = ref<string | null>(null);

// Validation errors
const errors = reactive<{
	currentPassword?: string;
	newPassword?: string;
	confirmPassword?: string;
}>({});

const validateForm = (): boolean => {
	// Reset errors
	errors.currentPassword = undefined;
	errors.newPassword = undefined;
	errors.confirmPassword = undefined;
	serverError.value = null;

	let isValid = true;

	// Validate current password
	if (!formData.currentPassword) {
		errors.currentPassword = t('changePassword.validation.currentRequired');
		isValid = false;
	}

	// Validate new password
	if (!formData.newPassword) {
		errors.newPassword = t('changePassword.validation.newRequired');
		isValid = false;
	} else if (formData.newPassword.length < 8) {
		errors.newPassword = t('changePassword.validation.minLength');
		isValid = false;
	} else if (formData.newPassword === formData.currentPassword) {
		errors.newPassword = t('changePassword.validation.sameAsOld');
		isValid = false;
	}

	// Validate confirm password
	if (!formData.confirmPassword) {
		errors.confirmPassword = t('changePassword.validation.confirmRequired');
		isValid = false;
	} else if (formData.newPassword !== formData.confirmPassword) {
		errors.confirmPassword = t('changePassword.validation.passwordsNotMatch');
		isValid = false;
	}

	return isValid;
};

const handleSubmit = async () => {
	if (!validateForm()) {
		return;
	}

	isLoading.value = true;
	serverError.value = null;

	try {
		await changePasswordApi(formData.currentPassword, formData.newPassword);

		// Show success toast
		toast({
			title: t('changePassword.successTitle'),
			description: t('changePassword.successDesc'),
			variant: 'default',
		});

		// Go back to previous page
		router.back();
	} catch (error: any) {
		const errorMessage = error?.response?.data?.message || error?.message || 'Error al cambiar la contraseña';

		// Check if it's a validation error from the server
		if (errorMessage.includes('incorrecta')) {
			errors.currentPassword = t('changePassword.validation.invalidCurrent');
		} else if (errorMessage.includes('coinciden')) {
			errors.confirmPassword = t('changePassword.validation.passwordsNotMatch');
		} else {
			serverError.value = errorMessage;
		}

		toast({
			title: t('changePassword.errorTitle'),
			description: t('changePassword.errorDesc'),
			variant: 'destructive',
		});
	} finally {
		isLoading.value = false;
	}
};

const handleCancel = () => {
	router.back();
};
</script>
