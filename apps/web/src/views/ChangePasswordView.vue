<template>
	<div class="container mx-auto p-6">
		<div class="mb-6">
			<h1 class="text-2xl font-bold text-gray-900">
				{{ userHasPassword ? t('changePassword.title') : t('setPassword.title') }}
			</h1>
			<p class="text-gray-600 mt-2">
				{{ userHasPassword ? 'Cambia tu contraseña para mantener tu cuenta segura.' : t('setPassword.description') }}
			</p>
		</div>

		<!-- Form Card -->
		<div class="max-w-md">
			<form @submit.prevent="handleSubmit" class="bg-white rounded-lg shadow-md border border-gray-200 p-6 space-y-4">
				<!-- Current Password (only shown for users with existing password) -->
				<div v-if="userHasPassword" class="space-y-2">
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
					<Label for="new-password">
						{{ userHasPassword ? t('changePassword.newPassword') : t('setPassword.newPassword') }}
					</Label>
					<div class="relative">
						<Input
							id="new-password"
							:type="showNewPassword ? 'text' : 'password'"
							:placeholder="userHasPassword ? t('changePassword.newPasswordPlaceholder') : t('setPassword.newPasswordPlaceholder')"
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
						{{ isLoading ? 'Guardando...' : (userHasPassword ? t('changePassword.submit') : t('setPassword.submit')) }}
					</Button>
				</div>
			</form>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useToast } from '@repo/ui';
import { Button, Input, Label } from '@repo/ui';
import { Eye, EyeOff } from 'lucide-vue-next';
import { changePassword as changePasswordApi, getAuthStatus } from '@/services/api';

const { t } = useI18n();
const router = useRouter();
const { toast } = useToast();

// Track whether user has a password (for Google users who haven't set one yet)
const userHasPassword = ref<boolean>(true);

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

// Check if user has a password on mount
onMounted(async () => {
	try {
		const authStatus = await getAuthStatus();
		userHasPassword.value = !!authStatus.password;
	} catch (error) {
		console.error('Error checking auth status:', error);
		// Default to true (assume user has password) on error
		userHasPassword.value = true;
	}
});

const validateForm = (): boolean => {
	// Reset errors
	errors.currentPassword = undefined;
	errors.newPassword = undefined;
	errors.confirmPassword = undefined;
	serverError.value = null;

	let isValid = true;

	// Validate current password (only for users with existing password)
	if (userHasPassword.value && !formData.currentPassword) {
		errors.currentPassword = t('changePassword.validation.currentRequired');
		isValid = false;
	}

	// Validate new password
	if (!formData.newPassword) {
		errors.newPassword = userHasPassword.value
			? t('changePassword.validation.newRequired')
			: t('setPassword.validation.newRequired');
		isValid = false;
	} else if (formData.newPassword.length < 8) {
		errors.newPassword = t('changePassword.validation.minLength');
		isValid = false;
	} else if (userHasPassword.value && formData.newPassword === formData.currentPassword) {
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
		await changePasswordApi(
			userHasPassword.value ? formData.currentPassword : undefined,
			formData.newPassword
		);

		// Show success toast
		toast({
			title: userHasPassword.value
				? t('changePassword.successTitle')
				: t('setPassword.successTitle'),
			description: userHasPassword.value
				? t('changePassword.successDesc')
				: t('setPassword.successDesc'),
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
			title: userHasPassword.value
				? t('changePassword.errorTitle')
				: 'Error al Configurar Contraseña',
			description: userHasPassword.value
				? t('changePassword.errorDesc')
				: 'No se pudo configurar la contraseña. Inténtalo nuevamente.',
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
