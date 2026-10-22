<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <!-- Full screen on mobile; a tall dialog from sm up. The middle block scrolls, the footer stays. -->
    <DialogContent
      class="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-3 overflow-hidden rounded-none p-4 sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-lg"
    >
      <DialogHeader>
        <DialogTitle class="pr-8">Asistencia con la foto de grupo</DialogTitle>
        <DialogDescription>
          Revisa cada cara antes de confirmar: nada se guarda hasta que pulses «Confirmar».
        </DialogDescription>
      </DialogHeader>

      <div
        v-if="analyzing"
        class="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <Loader2 class="h-8 w-8 animate-spin text-primary" />
        <p>Analizando la foto…</p>
        <p class="text-xs">Puede tardar hasta un minuto.</p>
      </div>

      <div v-else class="flex-1 space-y-5 overflow-y-auto pr-1">
        <p
          v-if="result?.degraded"
          class="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          role="alert"
          data-testid="degraded-notice"
        >
          No pudimos reconocer las caras ahora ({{ degradedReason }}). La foto de la reunión ya se
          guardó; marca la asistencia a mano aquí abajo.
        </p>
        <p
          v-else-if="result && result.faces.length === 0"
          class="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground"
        >
          No se detectaron caras en la foto. Puedes marcar la asistencia a mano aquí abajo.
        </p>

        <!-- Suggestions: preselected, each one can be removed -->
        <section v-if="suggestions.length" class="space-y-2" aria-labelledby="gp-suggestions">
          <h3 id="gp-suggestions" class="text-sm font-semibold">
            Sugerencias ({{ suggestions.length }})
          </h3>
          <ul class="grid gap-2 sm:grid-cols-2">
            <li
              v-for="item in suggestions"
              :key="item.index"
              class="flex items-center gap-3 rounded-lg border bg-green-50 p-2 dark:bg-green-950"
              data-testid="suggestion"
            >
              <img
                :src="item.face.crop"
                :alt="`Cara ${item.index + 1} de la foto`"
                class="h-20 w-20 flex-shrink-0 rounded-md border object-cover"
              />
              <MemberAvatar
                :photo-url="item.member.photoUrl"
                :full-name="nameOf(item.member)"
                size="lg"
              />
              <div class="min-w-0 flex-1">
                <div class="break-words text-sm font-medium">{{ nameOf(item.member) }}</div>
                <div v-if="!item.member.photoUrl" class="text-xs text-muted-foreground">
                  Sin foto de perfil
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                :aria-label="`Quitar a ${nameOf(item.member)}`"
                @click="removeSuggestion(item.index)"
              >
                <X class="h-4 w-4" />
              </Button>
            </li>
          </ul>
        </section>

        <!-- Faces nobody was suggested for (or whose suggestion was removed) -->
        <section v-if="unidentified.length" class="space-y-2" aria-labelledby="gp-unidentified">
          <h3 id="gp-unidentified" class="text-sm font-semibold">
            Sin identificar ({{ unidentified.length }})
          </h3>
          <ul class="grid gap-3 sm:grid-cols-2">
            <li
              v-for="item in unidentified"
              :key="item.index"
              class="space-y-2 rounded-lg border p-3"
              data-testid="unidentified"
            >
              <div class="flex items-start gap-3">
                <img
                  :src="item.face.crop"
                  :alt="`Cara ${item.index + 1} sin identificar`"
                  class="h-24 w-24 flex-shrink-0 rounded-md border object-cover"
                />
                <div class="min-w-0 flex-1 space-y-1 text-sm">
                  <template v-if="item.decision?.kind === 'member'">
                    <div class="font-medium">
                      Es {{ nameOfId(item.decision.memberId) }}
                    </div>
                  </template>
                  <div v-else-if="item.decision?.kind === 'none'" class="text-muted-foreground">
                    No es de la comunidad
                  </div>
                  <div v-else-if="item.decision?.kind === 'skip'" class="text-muted-foreground">
                    Omitida
                  </div>
                  <div v-else class="text-muted-foreground">¿Quién es?</div>

                  <Button
                    v-if="item.decision"
                    type="button"
                    size="sm"
                    variant="outline"
                    @click="undoDecision(item.index)"
                  >
                    Deshacer
                  </Button>
                </div>
              </div>

              <template v-if="!item.decision">
                <FaceMemberPicker
                  :candidates="availableCandidates"
                  placeholder="Buscar al miembro por nombre"
                  @select="(memberId: string) => assign(item.index, memberId)"
                />
                <!--
                  Slot for the voice step (M5): one per unidentified face. It gets the same
                  actions as the buttons below and the members still free to pick.
                -->
                <slot
                  name="voice"
                  :face="item.face"
                  :index="item.index"
                  :candidates="availableCandidates"
                  :assign="(memberId: string) => assign(item.index, memberId)"
                  :skip="() => decide(item.index, { kind: 'skip' })"
                  :mark-not-member="() => decide(item.index, { kind: 'none' })"
                >
                  <!-- Default content: the voice step. The picker above is its text fallback. -->
                  <FaceVoiceIdentifier
                    :candidates="availableCandidates"
                    :show-picker="false"
                    @assign="(memberId: string) => assign(item.index, memberId)"
                    @skip="decide(item.index, { kind: 'skip' })"
                    @not-member="decide(item.index, { kind: 'none' })"
                  />
                </slot>
                <div class="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    @click="decide(item.index, { kind: 'none' })"
                  >
                    No es de la comunidad
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    @click="decide(item.index, { kind: 'skip' })"
                  >
                    Saltar
                  </Button>
                </div>
              </template>
            </li>
          </ul>
        </section>

        <!-- Manual marks: the way in when the engine failed, and for anyone the photo missed -->
        <section class="space-y-2" aria-labelledby="gp-manual">
          <h3 id="gp-manual" class="text-sm font-semibold">Agregar a mano</h3>
          <FaceMemberPicker
            :candidates="availableCandidates"
            placeholder="Buscar al miembro por nombre"
            @select="addManual"
          />
          <ul v-if="manualMembers.length" class="flex flex-wrap gap-2" data-testid="manual-list">
            <li
              v-for="member in manualMembers"
              :key="member.id"
              class="flex items-center gap-1 rounded-full border bg-green-50 py-1 pl-3 pr-1 text-sm dark:bg-green-950"
            >
              {{ nameOf(member) }}
              <button
                type="button"
                class="rounded-full p-1 hover:bg-muted"
                :aria-label="`Quitar a ${nameOf(member)}`"
                @click="removeManual(member.id)"
              >
                <X class="h-3 w-3" />
              </button>
            </li>
          </ul>
        </section>
      </div>

      <DialogFooter class="gap-2 sm:gap-2">
        <span v-if="!analyzing" class="mr-auto self-center text-xs text-muted-foreground" data-testid="summary">
          {{ summaryText }}
        </span>
        <Button type="button" variant="outline" :disabled="confirming" @click="emit('update:open', false)">
          Cancelar
        </Button>
        <Button
          type="button"
          :disabled="analyzing || confirming || presentCount === 0"
          data-testid="confirm"
          @click="confirm"
        >
          <Loader2 v-if="confirming" class="mr-2 h-4 w-4 animate-spin" />
          Confirmar {{ presentCount }} {{ presentCount === 1 ? 'presente' : 'presentes' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Loader2, X } from 'lucide-vue-next';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui';
import { resolveMemberProfile } from '@repo/utils';
import type { FaceBox, FaceMatchFace, FaceMatchResult } from '@/services/api';
import MemberAvatar from '@/components/community/MemberAvatar.vue';
import FaceMemberPicker from '@/components/community/FaceMemberPicker.vue';
import FaceVoiceIdentifier from '@/components/community/FaceVoiceIdentifier.vue';

/** What the review hands back; the parent sends it to `confirmMeetingFaceMatch`. */
export interface GroupPhotoConfirmPayload {
  present: string[];
  /** Crops that become a profile photo: only members without one and not excluded (D6, D8). */
  photos: { memberId: string; crop: string }[];
  /** One per confirmed face (FR-28); the server skips the excluded. */
  tags: { memberId: string; box: FaceBox }[];
}

type Decision = { kind: 'member'; memberId: string } | { kind: 'none' } | { kind: 'skip' };

const props = defineProps<{
  open: boolean;
  /** Waiting for the analysis answer. */
  analyzing?: boolean;
  /** Analysis answer; `degraded` opens the review without suggestions (D12). */
  result: FaceMatchResult | null;
  /** The community's members, with `photoUrl` and `faceRecognitionOptOut`. */
  members: any[];
  /** The confirmation is being sent. */
  confirming?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'confirm', payload: GroupPhotoConfirmPayload): void;
}>();

const REASON_TEXT: Record<string, string> = {
  busy: 'el servicio está saturado',
  quota: 'se agotó la cuota de hoy',
  timeout: 'tardó demasiado',
  error: 'hubo un error',
};
const degradedReason = computed(() => REASON_TEXT[props.result?.reason ?? 'error'] ?? REASON_TEXT.error);

const memberById = computed(() => new Map(props.members.map((m) => [m.id, m])));
const nameOf = (member: any) => resolveMemberProfile(member).fullName;
const nameOfId = (id: string) => {
  const member = memberById.value.get(id);
  return member ? nameOf(member) : 'miembro';
};

// Decisions live here; a new analysis starts a clean review.
const removed = ref<Record<number, boolean>>({});
const decisions = ref<Record<number, Decision>>({});
const manual = ref<string[]>([]);

watch(
  () => props.result,
  () => {
    removed.value = {};
    decisions.value = {};
    manual.value = [];
  },
);

const faces = computed<FaceMatchFace[]>(() => props.result?.faces ?? []);

/** A face whose suggested member is not in the roster cannot be shown: it goes to "sin identificar". */
const suggestedMember = (face: FaceMatchFace) =>
  face.suggestedMemberId ? memberById.value.get(face.suggestedMemberId) ?? null : null;

const suggestions = computed(() =>
  faces.value
    .map((face, index) => ({ face, index, member: suggestedMember(face) }))
    .filter((item) => item.member && !removed.value[item.index]) as {
    face: FaceMatchFace;
    index: number;
    member: any;
  }[],
);

const unidentified = computed(() =>
  faces.value
    .map((face, index) => ({ face, index, member: suggestedMember(face), decision: decisions.value[index] }))
    .filter((item) => !item.member || removed.value[item.index]),
);

const manualMembers = computed(() =>
  manual.value.map((id) => memberById.value.get(id)).filter(Boolean) as any[],
);

/** Confirmed (member, face) pairs, one per member: a member picked once cannot be picked twice. */
const confirmed = computed(() => {
  const byMember = new Map<string, { memberId: string; faceIndex: number | null }>();
  const add = (memberId: string, faceIndex: number | null) => {
    if (!byMember.has(memberId)) byMember.set(memberId, { memberId, faceIndex });
  };
  suggestions.value.forEach((item) => add(item.member.id, item.index));
  unidentified.value.forEach((item) => {
    if (item.decision?.kind === 'member') add(item.decision.memberId, item.index);
  });
  manual.value.forEach((id) => add(id, null));
  return [...byMember.values()];
});

const presentCount = computed(() => confirmed.value.length);

const availableCandidates = computed(() => {
  const taken = new Set(confirmed.value.map((c) => c.memberId));
  return props.members
    .filter((m) => !taken.has(m.id))
    .map((m) => ({ id: m.id, name: nameOf(m), photoUrl: m.photoUrl ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
});

const removeSuggestion = (index: number) => {
  removed.value = { ...removed.value, [index]: true };
};

const decide = (index: number, decision: Decision) => {
  decisions.value = { ...decisions.value, [index]: decision };
};

const assign = (index: number, memberId: string) => {
  // Re-check at the moment of the pick: the list may have been stale.
  if (confirmed.value.some((c) => c.memberId === memberId)) return;
  decide(index, { kind: 'member', memberId });
};

const undoDecision = (index: number) => {
  const next = { ...decisions.value };
  delete next[index];
  decisions.value = next;
};

const addManual = (memberId: string) => {
  if (confirmed.value.some((c) => c.memberId === memberId)) return;
  manual.value = [...manual.value, memberId];
};

const removeManual = (memberId: string) => {
  manual.value = manual.value.filter((id) => id !== memberId);
};

const summaryText = computed(() => {
  const assigned = unidentified.value.filter((i) => i.decision?.kind === 'member').length;
  const skipped = unidentified.value.filter((i) => i.decision && i.decision.kind !== 'member').length;
  const pending = unidentified.value.length - assigned - skipped;
  const parts = [
    `${suggestions.value.length} sugeridas`,
    `${assigned} asignadas`,
    `${manual.value.length} a mano`,
  ];
  if (skipped) parts.push(`${skipped} omitidas`);
  if (pending) parts.push(`${pending} sin decidir`);
  return parts.join(' · ');
});

const confirm = () => {
  const present: string[] = [];
  const photos: GroupPhotoConfirmPayload['photos'] = [];
  const tags: GroupPhotoConfirmPayload['tags'] = [];
  for (const { memberId, faceIndex } of confirmed.value) {
    present.push(memberId);
    if (faceIndex === null) continue;
    const face = faces.value[faceIndex];
    const member = memberById.value.get(memberId);
    tags.push({ memberId, box: face.box });
    // The crop of an excluded member is never sent as a photo (D8, FR-21); one who already has a
    // profile photo keeps it (D6).
    if (member && !member.faceRecognitionOptOut && !member.photoUrl) {
      photos.push({ memberId, crop: face.crop });
    }
  }
  emit('confirm', { present, photos, tags });
};
</script>
