<template>
  <div class="min-h-screen bg-gray-50 flex flex-col">
    <header class="bg-gray-900 text-white py-4 px-6 shadow">
      <div class="max-w-2xl mx-auto">
        <h1 class="text-xl font-semibold flex items-center gap-2">
          <span>✝</span>
          {{ t('receiptClaim.title') }}
        </h1>
        <p v-if="context" class="text-sm text-gray-300">{{ context.retreatParish }}</p>
      </div>
    </header>

    <main class="flex-1 max-w-2xl mx-auto w-full p-4 md:p-6">
      <div v-if="loading" class="text-gray-500 text-center py-12">
        {{ t('receiptClaim.loading') }}
      </div>

      <div
        v-else-if="loadError"
        class="border border-red-200 bg-red-50 text-red-700 rounded p-6 space-y-2"
        data-testid="receipt-link-error"
      >
        <p class="font-semibold">{{ t('receiptClaim.invalidTitle') }}</p>
        <p>{{ t('receiptClaim.invalidBody') }}</p>
        <p class="text-sm">{{ t('receiptClaim.invalidHint') }}</p>
      </div>

      <template v-else-if="context && !submitted">
        <div class="bg-white border rounded p-4 md:p-6 shadow-sm space-y-3">
          <h2 class="text-lg font-semibold" data-testid="receipt-participant-name">
            {{ context.participantName }}
          </h2>
          <p class="text-sm text-gray-600">{{ t('receiptClaim.intro') }}</p>

          <div class="space-y-2">
            <button
              type="button"
              class="w-full border rounded p-3 text-left hover:bg-gray-50 disabled:opacity-50"
              :disabled="photoLoading"
              data-testid="receipt-pick"
              @click="pickPhoto"
            >
              📷 {{ photoLoading ? t('receiptClaim.pickLoading') : t('receiptClaim.pick') }}
            </button>
            <img
              v-if="photoPreview"
              :src="photoPreview"
              :alt="t('receiptClaim.previewAlt')"
              class="max-h-64 w-full object-contain border rounded"
              data-testid="receipt-preview"
            />
            <p v-if="photoError" class="text-sm text-red-600">{{ photoError }}</p>
          </div>

          <input
            v-model="amountInput"
            type="number"
            min="1"
            step="0.01"
            :placeholder="t('receiptClaim.amountPlaceholder')"
            class="w-full border rounded px-3 py-2 text-sm"
            data-testid="receipt-amount"
          />
          <input
            v-model="referenceInput"
            type="text"
            :placeholder="t('receiptClaim.referencePlaceholder')"
            class="w-full border rounded px-3 py-2 text-sm"
            data-testid="receipt-reference"
          />
          <textarea
            v-model="noteInput"
            rows="2"
            :placeholder="t('receiptClaim.notePlaceholder')"
            class="w-full border rounded px-3 py-2 text-sm"
            data-testid="receipt-note"
          ></textarea>
          <input
            v-model="senderInput"
            type="text"
            :placeholder="t('receiptClaim.senderPlaceholder')"
            class="w-full border rounded px-3 py-2 text-sm"
            data-testid="receipt-sender"
          />
        </div>

        <button
          class="mt-4 w-full bg-purple-600 text-white rounded p-3 font-medium hover:bg-purple-700 disabled:opacity-50"
          :disabled="submitting || !photoDataUrl"
          data-testid="receipt-submit"
          @click="submit"
        >
          {{ submitting ? t('receiptClaim.submitting') : t('receiptClaim.submit') }}
        </button>
      </template>

      <div
        v-else-if="submitted"
        class="border border-green-200 bg-green-50 text-green-800 rounded p-6 space-y-2 text-center"
        data-testid="receipt-received"
      >
        <p class="text-3xl">✅</p>
        <p class="font-semibold">{{ t('receiptClaim.receivedTitle') }}</p>
        <p class="text-sm">{{ t('receiptClaim.receivedBody') }}</p>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { receiptClaimsApi } from '@/services/api';
import { pickFile } from '@/utils/filePicker';
import { receiptPhotoFromFile } from '@/utils/imageResize';

/**
 * Página PÚBLICA del link de capacidad (comprobantes por link): la familia
 * sube la captura de su transferencia sin login. El token cifrado (AES
 * server-side) identifica al participante; el servidor reprocesa la foto
 * (magic bytes + resize) — no se confía en lo que manda el navegador.
 */
const props = defineProps<{ token: string }>();

const { t } = useI18n();

const context = ref<{ participantName: string; retreatParish: string } | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);

const photoDataUrl = ref<string | null>(null);
const photoPreview = ref<string | null>(null);
const photoLoading = ref(false);
const photoError = ref<string | null>(null);

const amountInput = ref('');
const referenceInput = ref('');
const noteInput = ref('');
const senderInput = ref('');
const submitting = ref(false);
const submitted = ref(false);

onMounted(async () => {
  try {
    context.value = await receiptClaimsApi.getContext(props.token);
  } catch {
    loadError.value = t('receiptClaim.invalidBody');
  } finally {
    loading.value = false;
  }
});

const pickPhoto = async () => {
  photoError.value = null;
  photoLoading.value = true;
  try {
    const file = (await pickFile({ accept: 'image/*', capture: 'environment' })) as File;
    if (!file) return;
    const dataUrl = await receiptPhotoFromFile(file);
    photoDataUrl.value = dataUrl;
    photoPreview.value = dataUrl;
  } catch (err) {
    photoError.value = (err as Error)?.message || t('receiptClaim.photoError');
  } finally {
    photoLoading.value = false;
  }
};

const submit = async () => {
  if (!photoDataUrl.value || submitting.value) return;
  submitting.value = true;
  try {
    await receiptClaimsApi.submit(props.token, {
      photo: photoDataUrl.value,
      amountClaimed: amountInput.value ? Number(amountInput.value) : undefined,
      reference: referenceInput.value || undefined,
      note: noteInput.value || undefined,
      senderContact: senderInput.value || undefined,
    });
    submitted.value = true;
    context.value = null;
  } catch {
    photoError.value = t('receiptClaim.sendError');
  } finally {
    submitting.value = false;
  }
};
</script>
