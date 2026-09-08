import { computed, ref, watch } from 'vue';
import type { ParticipationFrequency, ServerAttendanceEntry } from '@repo/types';
import { getRetreatServerAttendance } from '@/services/api';

/**
 * Asistencia del equipo servidor a las preparaciones DE ESTE RETIRO, para
 * decidir a quién poner de líder de mesa.
 *
 * Mide sólo el calendario del propio retiro, no todas las preparaciones que la
 * comunidad haya tenido: la pregunta de esta pantalla es "¿quién viene a
 * preparar ESTE retiro?". Por eso no hay selector de tipo — el conjunto ya está
 * delimitado.
 *
 * El dato vive en la comunidad, así que sólo hay métrica si el retiro está
 * vinculado a una (`retreat.communityId`, opcional) y sus preparaciones están
 * sincronizadas como reuniones. Cada una de esas dos condiciones tiene su propio
 * aviso en la UI: sin ellas no se pintan ceros, se explica qué falta.
 *
 * Un servidor que no está en el padrón, o sin ninguna reunión que le cuente, NO
 * aparece en el mapa: "sin dato" y "no asistió" son cosas distintas.
 */

export interface ServerAttendanceState {
	ratePercent: number;
	attended: number;
	total: number;
	frequency: ParticipationFrequency;
}

export const useServerAttendance = (
	retreatId: () => string | null | undefined,
	communityId: () => string | null | undefined,
) => {
	const loading = ref(false);
	const enabled = ref(false);
	const matchedCount = ref(0);
	const serverCount = ref(0);
	const meetingCount = ref(0);
	const linkedMeetingCount = ref(0);
	const byParticipantId = ref<Record<string, ServerAttendanceState>>({});

	const isLinked = computed(() => Boolean(communityId()));

	const reset = () => {
		byParticipantId.value = {};
		matchedCount.value = 0;
		serverCount.value = 0;
		meetingCount.value = 0;
		linkedMeetingCount.value = 0;
	};

	const load = async () => {
		const retreat = retreatId();
		const community = communityId();
		if (!enabled.value || !retreat || !community) {
			reset();
			return;
		}
		loading.value = true;
		try {
			const result = await getRetreatServerAttendance(community, retreat);
			const map: Record<string, ServerAttendanceState> = {};
			for (const entry of result.entries as ServerAttendanceEntry[]) {
				map[entry.participantId] = {
					ratePercent: entry.ratePercent,
					attended: entry.attended,
					total: entry.total,
					frequency: entry.frequency,
				};
			}
			byParticipantId.value = map;
			matchedCount.value = result.matchedCount;
			serverCount.value = result.serverCount;
			meetingCount.value = result.meetingCount;
			linkedMeetingCount.value = result.retreatLinkedMeetingCount;
			return result;
		} finally {
			loading.value = false;
		}
	};

	/** Estado de un servidor concreto; `null` = no está en el padrón. */
	const forParticipant = (participantId: string): ServerAttendanceState | null =>
		byParticipantId.value[participantId] ?? null;

	watch(
		() => retreatId(),
		() => reset(),
		{ immediate: true },
	);

	watch([() => communityId(), () => retreatId(), enabled], () => {
		void load();
	});

	return {
		loading,
		enabled,
		isLinked,
		matchedCount,
		serverCount,
		meetingCount,
		linkedMeetingCount,
		byParticipantId,
		forParticipant,
		load,
	};
};
