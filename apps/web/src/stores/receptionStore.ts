import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getSocket } from '@/services/realtime';

export type ReceptionCheckinEvent = {
	retreatId: string;
	participantId: string;
	checkedIn: boolean;
	checkedInAt: string | null;
};

export type ReceptionBagMadeEvent = {
	retreatId: string;
	participantId: string;
	bagMade: boolean;
};

type CheckinHandler = (e: ReceptionCheckinEvent) => void;
type BagMadeHandler = (e: ReceptionBagMadeEvent) => void;

export const useReceptionStore = defineStore('reception', () => {
	const pendingCount = ref<number | null>(null);
	const connected = ref(false);
	let subscribedRetreatId: string | null = null;

	function setPending(count: number) {
		pendingCount.value = count;
	}

	function clear() {
		pendingCount.value = null;
	}

	function subscribeRealtime(
		retreatId: string,
		handlers: { onCheckin?: CheckinHandler; onBagMade?: BagMadeHandler },
	) {
		const socket = getSocket();
		subscribedRetreatId = retreatId;

		const join = () => {
			socket.emit('reception:subscribe', retreatId, (ok: boolean) => {
				connected.value = !!ok;
			});
		};

		if (socket.connected) join();
		socket.on('connect', join);

		const checkinListener = (e: ReceptionCheckinEvent) => {
			if (e.retreatId === subscribedRetreatId) handlers.onCheckin?.(e);
		};
		const bagListener = (e: ReceptionBagMadeEvent) => {
			if (e.retreatId === subscribedRetreatId) handlers.onBagMade?.(e);
		};

		socket.on('reception:checkin', checkinListener);
		socket.on('reception:bag-made', bagListener);

		return function unsubscribe() {
			socket.emit('reception:unsubscribe', retreatId);
			socket.off('connect', join);
			socket.off('reception:checkin', checkinListener);
			socket.off('reception:bag-made', bagListener);
			connected.value = false;
			subscribedRetreatId = null;
		};
	}

	return { pendingCount, connected, setPending, clear, subscribeRealtime };
});
