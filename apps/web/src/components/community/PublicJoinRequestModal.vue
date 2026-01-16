<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '@repo/ui';
import { publicCommunityJoinRequest } from '@/services/api';
import { getRecaptchaToken, RECAPTCHA_ACTIONS } from '@/services/recaptcha';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Button,
	Input,
	Label,
	Alert,
	AlertDescription,
} from '@repo/ui';
import { UserPlus, Loader2, AlertCircle } from 'lucide-vue-next';

const props = defineProps<{
	open: boolean;
	communityId: string;
	communityName: string;
}>();

const emit = defineEmits(['update:open', 'submitted']);

const { t } = useI18n();
const { toast } = useToast();

const formData = ref({
	firstName: '',
	lastName: '',
	email: '',
	cellPhone: '',
});

const formErrors = ref<Record<string, string>>({});
const isSubmitting = ref(false);

const modalTitle = computed(() => t('landing.joinRequest.modalTitle', { community: props.communityName }));

// Reset form when dialog opens
watch(() => props.open, (isOpen) => {
	if (isOpen) {
		resetForm();
	}
});

const resetForm = () => {
	formData.value = {
		firstName: '',
		lastName: '',
		email: '',
		cellPhone: '',
	};
	formErrors.value = {};
};

const validateForm = (): boolean => {
	formErrors.value = {};

	if (!formData.value.firstName.trim()) {
		formErrors.value.firstName = t('landing.joinRequest.validation.firstName');
	} else if (formData.value.firstName.trim().length < 2) {
		formErrors.value.firstName = t('landing.joinRequest.validation.firstNameMin');
	}

	if (!formData.value.lastName.trim()) {
		formErrors.value.lastName = t('landing.joinRequest.validation.lastName');
	} else if (formData.value.lastName.trim().length < 2) {
		formErrors.value.lastName = t('landing.joinRequest.validation.lastNameMin');
	}

	if (!formData.value.email.trim()) {
		formErrors.value.email = t('landing.joinRequest.validation.email');
	} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.value.email)) {
		formErrors.value.email = t('landing.joinRequest.validation.invalidEmail');
	}

	if (!formData.value.cellPhone.trim()) {
		formErrors.value.cellPhone = t('landing.joinRequest.validation.cellPhone');
	} else if (!/^[+]?[\d\s()-]+$/.test(formData.value.cellPhone.trim())) {
		formErrors.value.cellPhone = t('landing.joinRequest.validation.invalidCellPhone');
	}

	return Object.keys(formErrors.value).length === 0;
};

const handleSubmit = async () => {
	if (!validateForm()) {
		toast({
			title: t('landing.joinRequest.validationError'),
			description: t('landing.joinRequest.validationErrorDesc'),
			variant: 'destructive',
		});
		return;
	}

	isSubmitting.value = true;
	try {
		// Get reCAPTCHA token for bot protection
		const recaptchaToken = await getRecaptchaToken(RECAPTCHA_ACTIONS.COMMUNITY_JOIN);

		await publicCommunityJoinRequest(props.communityId, {
			firstName: formData.value.firstName.trim(),
			lastName: formData.value.lastName.trim(),
			email: formData.value.email.trim().toLowerCase(),
			cellPhone: formData.value.cellPhone.trim(),
			recaptchaToken,
		});

		toast({
			title: t('landing.joinRequest.success'),
			description: t('landing.joinRequest.successDesc'),
		});

		emit('submitted');
		emit('update:open', false);
		resetForm();
	} catch (error: any) {
		console.error('Error submitting join request:', error);

		if (error.message === 'Already a member of this community') {
			toast({
				title: t('landing.joinRequest.errorTitle'),
				description: t('landing.joinRequest.alreadyMember'),
				variant: 'destructive',
			});
		} else {
			toast({
				title: t('landing.joinRequest.errorTitle'),
				description: error.message || t('landing.joinRequest.error'),
				variant: 'destructive',
			});
		}
	} finally {
		isSubmitting.value = false;
	}
};

const handleClose = () => {
	if (!isSubmitting.value) {
		emit('update:open', false);
		resetForm();
	}
};
</script>

<template>
	<Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
		<DialogContent class="sm:max-w-[500px]">
			<DialogHeader>
				<DialogTitle class="flex items-center gap-2">
					<UserPlus class="w-5 h-5" />
					{{ modalTitle }}
				</DialogTitle>
				<DialogDescription>
					{{ t('landing.joinRequest.modalDescription') }}
				</DialogDescription>
			</DialogHeader>

			<div class="space-y-4 py-4">
				<!-- Retreat Requirement Alert -->
				<Alert variant="default" class="border-yellow-200 bg-yellow-50 text-yellow-900">
					<AlertCircle class="h-4 w-4 text-yellow-600" />
					<AlertDescription>
						{{ t('landing.joinRequest.retreatRequirement') }}
					</AlertDescription>
				</Alert>

				<!-- First Name -->
				<div class="space-y-2">
					<Label for="firstName">
						{{ t('landing.joinRequest.firstName') }} *
					</Label>
					<Input
						id="firstName"
						v-model="formData.firstName"
						:placeholder="t('landing.joinRequest.firstNamePlaceholder')"
						:class="{ 'border-destructive': formErrors.firstName }"
						:disabled="isSubmitting"
					/>
					<p v-if="formErrors.firstName" class="text-sm text-destructive">
						{{ formErrors.firstName }}
					</p>
				</div>

				<!-- Last Name -->
				<div class="space-y-2">
					<Label for="lastName">
						{{ t('landing.joinRequest.lastName') }} *
					</Label>
					<Input
						id="lastName"
						v-model="formData.lastName"
						:placeholder="t('landing.joinRequest.lastNamePlaceholder')"
						:class="{ 'border-destructive': formErrors.lastName }"
						:disabled="isSubmitting"
					/>
					<p v-if="formErrors.lastName" class="text-sm text-destructive">
						{{ formErrors.lastName }}
					</p>
				</div>

				<!-- Email -->
				<div class="space-y-2">
					<Label for="email">
						{{ t('landing.joinRequest.email') }} *
					</Label>
					<Input
						id="email"
						v-model="formData.email"
						type="email"
						:placeholder="t('landing.joinRequest.emailPlaceholder')"
						:class="{ 'border-destructive': formErrors.email }"
						:disabled="isSubmitting"
					/>
					<p v-if="formErrors.email" class="text-sm text-destructive">
						{{ formErrors.email }}
					</p>
				</div>

				<!-- Cell Phone -->
				<div class="space-y-2">
					<Label for="cellPhone">
						{{ t('landing.joinRequest.cellPhone') }} *
					</Label>
					<Input
						id="cellPhone"
						v-model="formData.cellPhone"
						type="tel"
						:placeholder="t('landing.joinRequest.cellPhonePlaceholder')"
						:class="{ 'border-destructive': formErrors.cellPhone }"
						:disabled="isSubmitting"
					/>
					<p v-if="formErrors.cellPhone" class="text-sm text-destructive">
						{{ formErrors.cellPhone }}
					</p>
				</div>
			</div>

			<DialogFooter>
				<Button
					variant="outline"
					@click="handleClose"
					:disabled="isSubmitting"
				>
					{{ t('common.cancel') }}
				</Button>
				<Button
					@click="handleSubmit"
					:disabled="isSubmitting"
				>
					<Loader2 v-if="isSubmitting" class="w-4 h-4 mr-2 animate-spin" />
					<UserPlus v-else class="w-4 h-4 mr-2" />
					{{ isSubmitting ? t('landing.joinRequest.submitting') : t('landing.joinRequest.submit') }}
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
