import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getSocket } from "@/services/realtime";
import {
  retreatScheduleApi,
  scheduleTemplateApi,
  type RetreatScheduleItemDTO,
  type ScheduleTemplateDTO,
  type ScheduleTemplateSetDTO,
} from "@/services/api";

export type ScheduleItemStartedEvent = {
  retreatId: string;
  itemId: string;
  actualStartTime: string;
};
export type ScheduleItemCompletedEvent = {
  retreatId: string;
  itemId: string;
  actualEndTime: string;
};
export type ScheduleUpcomingEvent = {
  retreatId: string;
  itemId: string;
  name: string;
  startTime: string;
  minutesUntil: number;
  targetParticipantIds: string[];
};
export type ScheduleUpdatedEvent = { retreatId: string; itemId: string };
export type ScheduleBellEvent = { retreatId: string; message?: string };
export type ScheduleDelayEvent = {
  retreatId: string;
  itemId: string;
  minutesDelta: number;
};

type Handlers = {
  onStarted?: (e: ScheduleItemStartedEvent) => void;
  onCompleted?: (e: ScheduleItemCompletedEvent) => void;
  onUpcoming?: (e: ScheduleUpcomingEvent) => void;
  onUpdated?: (e: ScheduleUpdatedEvent) => void;
  onBell?: (e: ScheduleBellEvent) => void;
  onDelay?: (e: ScheduleDelayEvent) => void;
};

export const useScheduleStore = defineStore("schedule", () => {
  const items = ref<RetreatScheduleItemDTO[]>([]);
  const templates = ref<ScheduleTemplateDTO[]>([]);
  const templateSets = ref<ScheduleTemplateSetDTO[]>([]);
  const loading = ref(false);
  const connected = ref(false);
  let subscribedRetreatId: string | null = null;

  const itemsByDay = computed(() => {
    const map = new Map<number, RetreatScheduleItemDTO[]>();
    for (const it of items.value) {
      const arr = map.get(it.day) ?? [];
      arr.push(it);
      map.set(it.day, arr);
    }
    for (const arr of map.values())
      arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  });

  async function loadForRetreat(retreatId: string) {
    loading.value = true;
    try {
      items.value = await retreatScheduleApi.list(retreatId);
    } finally {
      loading.value = false;
    }
  }

  async function loadTemplates(setId?: string) {
    templates.value = await scheduleTemplateApi.list(setId);
  }
  async function loadTemplateSets() {
    templateSets.value = await scheduleTemplateApi.listSets();
  }

  async function materialize(
    retreatId: string,
    baseDate: string,
    templateSetId?: string,
    clearExisting = false,
  ) {
    const next = await retreatScheduleApi.materialize(
      retreatId,
      baseDate,
      templateSetId,
      clearExisting,
    );
    items.value = next;
  }

  async function start(id: string) {
    const updated = await retreatScheduleApi.start(id);
    patch(updated);
  }
  async function complete(id: string) {
    const updated = await retreatScheduleApi.complete(id);
    patch(updated);
  }
  async function shift(id: string, minutesDelta: number, propagate = true) {
    const updated = await retreatScheduleApi.shift(id, minutesDelta, propagate);
    // reload whole list for the retreat since many items changed
    if (updated[0]) await loadForRetreat(updated[0].retreatId);
  }
  async function updateItem(id: string, data: Partial<RetreatScheduleItemDTO>) {
    const updated = await retreatScheduleApi.update(id, data);
    patch(updated);
  }
  async function createItem(
    retreatId: string,
    data: Partial<RetreatScheduleItemDTO> & { responsableParticipantIds?: string[] },
  ) {
    const created = await retreatScheduleApi.create(retreatId, data);
    items.value = [...items.value, created].sort((a, b) =>
      a.startTime.localeCompare(b.startTime),
    );
  }
  async function removeItem(id: string) {
    await retreatScheduleApi.remove(id);
    items.value = items.value.filter((x) => x.id !== id);
  }
  async function ringBell(retreatId: string, message?: string) {
    await retreatScheduleApi.ringBell(retreatId, message);
  }
  async function resolveSantisimo(retreatId: string) {
    return retreatScheduleApi.resolveSantisimo(retreatId);
  }

  function patch(updated: RetreatScheduleItemDTO) {
    const idx = items.value.findIndex((x) => x.id === updated.id);
    if (idx >= 0) items.value[idx] = updated;
    else items.value.push(updated);
  }

  function subscribeRealtime(retreatId: string, handlers: Handlers) {
    const socket = getSocket();
    subscribedRetreatId = retreatId;

    const join = () => {
      socket.emit("schedule:subscribe", retreatId, (ok: boolean) => {
        connected.value = !!ok;
      });
    };

    if (socket.connected) join();
    socket.on("connect", join);

    const onStarted = (e: ScheduleItemStartedEvent) => {
      if (e.retreatId !== subscribedRetreatId) return;
      const it = items.value.find((x) => x.id === e.itemId);
      if (it) {
        it.status = "active";
        it.actualStartTime = e.actualStartTime;
      }
      handlers.onStarted?.(e);
    };
    const onCompleted = (e: ScheduleItemCompletedEvent) => {
      if (e.retreatId !== subscribedRetreatId) return;
      const it = items.value.find((x) => x.id === e.itemId);
      if (it) {
        it.status = "completed";
        it.actualEndTime = e.actualEndTime;
      }
      handlers.onCompleted?.(e);
    };
    const onUpcoming = (e: ScheduleUpcomingEvent) => {
      if (e.retreatId !== subscribedRetreatId) return;
      handlers.onUpcoming?.(e);
    };
    const onUpdated = (e: ScheduleUpdatedEvent) => {
      if (e.retreatId !== subscribedRetreatId) return;
      // Cheap approach: reload the full list for this retreat.
      void loadForRetreat(e.retreatId);
      handlers.onUpdated?.(e);
    };
    const onBell = (e: ScheduleBellEvent) => {
      if (e.retreatId !== subscribedRetreatId) return;
      handlers.onBell?.(e);
    };
    const onDelay = (e: ScheduleDelayEvent) => {
      if (e.retreatId !== subscribedRetreatId) return;
      handlers.onDelay?.(e);
    };

    socket.on("schedule:item-started", onStarted);
    socket.on("schedule:item-completed", onCompleted);
    socket.on("schedule:upcoming", onUpcoming);
    socket.on("schedule:updated", onUpdated);
    socket.on("schedule:bell", onBell);
    socket.on("schedule:delay", onDelay);

    return function unsubscribe() {
      socket.emit("schedule:unsubscribe", retreatId);
      socket.off("connect", join);
      socket.off("schedule:item-started", onStarted);
      socket.off("schedule:item-completed", onCompleted);
      socket.off("schedule:upcoming", onUpcoming);
      socket.off("schedule:updated", onUpdated);
      socket.off("schedule:bell", onBell);
      socket.off("schedule:delay", onDelay);
      connected.value = false;
      subscribedRetreatId = null;
    };
  }

  return {
    items,
    templates,
    templateSets,
    loading,
    connected,
    itemsByDay,
    loadForRetreat,
    loadTemplates,
    loadTemplateSets,
    materialize,
    start,
    complete,
    shift,
    updateItem,
    createItem,
    removeItem,
    ringBell,
    resolveSantisimo,
    subscribeRealtime,
  };
});
