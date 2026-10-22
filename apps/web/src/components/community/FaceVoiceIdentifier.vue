<template>
  <div class="space-y-2" data-testid="face-voice">
    <div v-if="micAvailable" class="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-testid="mic"
        :aria-pressed="isListening"
        @click="toggleListening"
      >
        <svg
          class="mr-1 h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v4" />
        </svg>
        {{ isListening ? 'Escuchando… toca para terminar' : 'Decir nombre' }}
      </Button>
    </div>
    <p v-else class="px-1 text-xs text-muted-foreground" data-testid="mic-hint">
      Usa el micrófono del teclado para dictar
    </p>

    <div aria-live="polite" class="space-y-2">
      <p v-if="isListening && interimTranscript" class="text-sm italic" data-testid="interim">
        {{ interimTranscript }}
      </p>
      <p v-if="errorMessage" class="text-xs text-destructive" role="alert" data-testid="voice-error">
        {{ errorMessage }}
      </p>
      <p v-if="heard" class="px-1 text-xs text-muted-foreground" data-testid="heard">
        Escuché: «{{ heard }}»
      </p>
      <div v-if="matches.length" class="flex flex-wrap gap-2" data-testid="voice-candidates">
        <Button
          v-for="match in matches"
          :key="match.id"
          type="button"
          variant="outline"
          class="h-auto gap-2 py-1 pl-1"
          :data-member-id="match.id"
          @click="pick(match.id)"
        >
          <MemberAvatar :photo-url="photoOf(match.id)" :full-name="match.name" size="md" />
          {{ match.name }}
        </Button>
      </div>
      <p v-else-if="noMatch" class="text-sm" data-testid="no-match">
        No encontré a nadie con ese nombre
      </p>
    </div>

    <FaceMemberPicker
      v-if="showPicker"
      :candidates="candidates"
      placeholder="Buscar al miembro por nombre"
      @select="(memberId: string) => emit('assign', memberId)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button } from '@repo/ui';
import FaceMemberPicker, { type PickerCandidate } from '@/components/community/FaceMemberPicker.vue';
import MemberAvatar from '@/components/community/MemberAvatar.vue';
import { useSpeechRecognition } from '@/composables/useSpeechRecognition';
import { matchNames } from '@/utils/nameMatcher';

const props = withDefaults(
  defineProps<{
    candidates: PickerCandidate[];
    /** The review dialog already renders its own picker, so it turns this one off. */
    showPicker?: boolean;
  }>(),
  { showPicker: true },
);

const emit = defineEmits<{
  (e: 'assign', memberId: string): void;
  (e: 'skip'): void;
  (e: 'not-member'): void;
}>();

// D5: no audio leaves the browser. In fallback mode (MediaRecorder only) the blob is ignored and
// the text autocomplete is used instead.
const { isListening, transcript, interimTranscript, isFallbackMode, isSupported, error, start, stop } =
  useSpeechRecognition();

const micAvailable = computed(() => isSupported.value && !isFallbackMode.value);

// matchNames returns {id, name, score}: the photo comes from the candidate list.
const photoOf = (id: string) => props.candidates.find((c) => c.id === id)?.photoUrl ?? null;

const heard = ref('');
const matches = ref<{ id: string; name: string; score: number }[]>([]);
const noMatch = ref(false);
const errorMessage = ref('');

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const SKIP_COMMANDS = ['saltar', 'siguiente'];
const NOT_MEMBER_COMMANDS = ['no es', 'no es de la comunidad'];

const reset = () => {
  heard.value = '';
  matches.value = [];
  noMatch.value = false;
  errorMessage.value = '';
};

const handleTranscript = (spoken: string) => {
  const normalized = normalize(spoken);
  if (!normalized) return;
  heard.value = spoken.trim();
  if (SKIP_COMMANDS.includes(normalized)) {
    emit('skip');
    return;
  }
  if (NOT_MEMBER_COMMANDS.includes(normalized)) {
    emit('not-member');
    return;
  }
  matches.value = matchNames(spoken, props.candidates, { limit: 3 });
  noMatch.value = matches.value.length === 0;
};

// A final transcript ends the listening: the speaker said a name, not a dictation.
watch(transcript, (value) => {
  if (!value) return;
  if (isListening.value) stop();
  handleTranscript(value);
});

watch(error, (code) => {
  if (!code) return;
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    errorMessage.value = 'No hay permiso para usar el micrófono';
  } else if (code === 'no-speech') {
    errorMessage.value = 'No te escuché, inténtalo de nuevo';
  } else {
    errorMessage.value = 'No se pudo usar el micrófono';
  }
});

const toggleListening = () => {
  if (isListening.value) {
    stop();
    return;
  }
  reset();
  start();
};

const pick = (memberId: string) => {
  emit('assign', memberId);
  reset();
};
</script>
