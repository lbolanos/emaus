import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { formatDueOffset, taskSemaphore, type PreRetreatTaskSemaphore } from "@repo/types";
import {
  preRetreatTaskApi,
  preRetreatTaskTemplateApi,
  type RetreatPreRetreatTaskDTO,
  type PreRetreatTaskTemplateDTO,
  type PreRetreatTaskTemplateSetDTO,
  type PreRetreatTaskStatus,
} from "@/services/api";
// Re-export para no romper imports existentes; la fuente vive en utils/participant.
export { isMeaninglessNickname, participantLabel } from "@/utils/participant";
import { participantLabel } from "@/utils/participant";

export interface PreRetreatTaskBucket {
  key: string;
  label: string;
  /** Días antes del retiro (para ordenar desc); null = grupo "Sin fecha". */
  offsetDays: number | null;
  tasks: RetreatPreRetreatTaskDTO[];
}

/** Fecha local de hoy como YYYY-MM-DD (semáforo de checklist, no requiere TZ del retiro). */
export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface PreRetreatTaskCounts {
  total: number;
  done: number;
  overdue: number;
  soon: number;
  unassigned: number;
}

/** Conteos agregados sobre el árbol (raíces + hijos), excluyendo `not_applicable`. */
export function computeTaskCounts(
  tasks: RetreatPreRetreatTaskDTO[],
  today: string,
): PreRetreatTaskCounts {
  const c: PreRetreatTaskCounts = { total: 0, done: 0, overdue: 0, soon: 0, unassigned: 0 };
  const visit = (t: RetreatPreRetreatTaskDTO) => {
    if (t.status === "not_applicable") return;
    c.total++;
    if (t.status === "done") {
      c.done++;
      return;
    }
    if (!t.responsibleParticipantId && !t.responsibleText) c.unassigned++;
    const s = taskSemaphore(t.dueDate ?? null, today, t.status);
    if (s === "overdue") c.overdue++;
    else if (s === "soon") c.soon++;
  };
  for (const r of tasks) {
    visit(r);
    for (const child of r.children ?? []) visit(child);
  }
  return c;
}

const CSV_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  done: "Listo",
  not_applicable: "No aplica",
};

/** Serializa el árbol de tareas a CSV (una fila por tarea/sub-tarea). */
export function tasksToCsv(tasks: RetreatPreRetreatTaskDTO[]): string {
  const headers = [
    "Tarea",
    "Sub-tarea",
    "Tiempo antes",
    "Fecha límite",
    "Estado",
    "Responsable",
    "Notas",
    "Apoyado con",
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const resp = (t: RetreatPreRetreatTaskDTO) =>
    [participantLabel(t.responsible), t.responsibleText].filter(Boolean).join(" · ");
  const offsetLabel = (days: number | null | undefined) =>
    days != null ? formatDueOffset(days) : "";

  const rows: string[][] = [headers];
  for (const r of tasks) {
    const rootOffset = offsetLabel(r.dueOffsetDays);
    rows.push([
      r.name,
      "",
      rootOffset,
      r.dueDate ?? "",
      CSV_STATUS_LABEL[r.status] ?? r.status,
      resp(r),
      r.notes ?? "",
      r.supportNotes ?? "",
    ]);
    for (const child of r.children ?? []) {
      rows.push([
        r.name,
        child.name,
        child.dueOffsetDays != null ? offsetLabel(child.dueOffsetDays) : rootOffset,
        child.dueDate ?? "",
        CSV_STATUS_LABEL[child.status] ?? child.status,
        resp(child),
        child.notes ?? "",
        child.supportNotes ?? "",
      ]);
    }
  }
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

export const usePreRetreatTaskStore = defineStore("preRetreatTask", () => {
  // `tasks` es el árbol que devuelve el backend: raíces con children + progress.
  const tasks = ref<RetreatPreRetreatTaskDTO[]>([]);
  const templates = ref<PreRetreatTaskTemplateDTO[]>([]);
  const templateSets = ref<PreRetreatTaskTemplateSetDTO[]>([]);
  const loading = ref(false);
  let loadedRetreatId: string | null = null;

  /** Agrupa raíces por "tiempo antes" (desc). Sin offset pero con fecha → "Otras fechas"; sin fecha → "Sin fecha". */
  const buckets = computed<PreRetreatTaskBucket[]>(() => {
    const byKey = new Map<string, PreRetreatTaskBucket>();
    for (const t of tasks.value) {
      let key: string;
      let label: string;
      let offsetDays: number | null;
      if (t.dueOffsetDays != null) {
        key = `offset:${t.dueOffsetDays}`;
        label = `${formatDueOffset(t.dueOffsetDays)} antes`;
        offsetDays = t.dueOffsetDays;
      } else if (t.dueDate) {
        key = "dated";
        label = "Otras fechas";
        offsetDays = -1; // después de todos los offsets, antes de "Sin fecha"
      } else {
        key = "none";
        label = "Sin fecha";
        offsetDays = null;
      }
      const bucket = byKey.get(key) ?? { key, label, offsetDays, tasks: [] };
      bucket.tasks.push(t);
      byKey.set(key, bucket);
    }
    return [...byKey.values()].sort((a, b) => {
      if (a.offsetDays == null) return 1;
      if (b.offsetDays == null) return -1;
      return b.offsetDays - a.offsetDays;
    });
  });

  const totalProgress = computed(() => {
    let done = 0;
    let total = 0;
    const count = (t: RetreatPreRetreatTaskDTO) => {
      if (t.status === "not_applicable") return;
      total++;
      if (t.status === "done") done++;
    };
    for (const root of tasks.value) {
      count(root);
      for (const c of root.children ?? []) count(c);
    }
    return { done, total };
  });

  const counts = computed(() => computeTaskCounts(tasks.value, todayISO()));

  function semaphoreFor(task: RetreatPreRetreatTaskDTO): PreRetreatTaskSemaphore {
    return taskSemaphore(task.dueDate ?? null, todayISO(), task.status);
  }

  function findTask(id: string): RetreatPreRetreatTaskDTO | undefined {
    for (const root of tasks.value) {
      if (root.id === id) return root;
      const child = root.children?.find((c) => c.id === id);
      if (child) return child;
    }
    return undefined;
  }

  async function fetchForRetreat(retreatId: string) {
    const first = loadedRetreatId !== retreatId || tasks.value.length === 0;
    if (first) loading.value = true;
    try {
      tasks.value = await preRetreatTaskApi.list(retreatId);
      loadedRetreatId = retreatId;
    } finally {
      loading.value = false;
    }
  }

  async function createTask(retreatId: string, data: Partial<RetreatPreRetreatTaskDTO>) {
    const created = await preRetreatTaskApi.create(retreatId, data);
    await fetchForRetreat(retreatId);
    return created;
  }

  async function updateTask(retreatId: string, id: string, data: Partial<RetreatPreRetreatTaskDTO>) {
    const updated = await preRetreatTaskApi.update(id, data);
    await fetchForRetreat(retreatId);
    return updated;
  }

  /** Cambio de estado optimista con rollback si el server falla. */
  async function setStatus(id: string, status: PreRetreatTaskStatus) {
    const task = findTask(id);
    const prevStatus = task?.status;
    const parent = task?.parentId ? findTask(task.parentId) : undefined;
    const prevProgress = parent?.progress ? { ...parent.progress } : undefined;
    if (task) {
      task.status = status;
      if (parent?.children) {
        let done = 0;
        let total = 0;
        for (const c of parent.children) {
          if (c.status === "not_applicable") continue;
          total++;
          if (c.status === "done") done++;
        }
        parent.progress = { done, total };
      }
    }
    try {
      return await preRetreatTaskApi.setStatus(id, status);
    } catch (err) {
      if (task && prevStatus) task.status = prevStatus;
      if (parent && prevProgress) parent.progress = prevProgress;
      throw err;
    }
  }

  function recomputeProgress(parent: RetreatPreRetreatTaskDTO) {
    let done = 0;
    let total = 0;
    for (const c of parent.children ?? []) {
      if (c.status === "not_applicable") continue;
      total++;
      if (c.status === "done") done++;
    }
    parent.progress = { done, total };
  }

  /**
   * Marca/desmarca una tarea con cascada, ignorando las que están en
   * "no aplica" (no activas):
   *  - Marcar/desmarcar un PADRE propaga el mismo estado a sus hijos activos.
   *  - Al tocar un HIJO, si todos los hijos activos quedan marcados el padre
   *    se marca; si alguno queda pendiente, el padre vuelve a pendiente.
   * Optimista; ante error del server recarga desde el backend.
   */
  async function toggleDone(id: string) {
    const task = findTask(id);
    if (!task || task.status === "not_applicable") return;
    const parent = task.parentId ? findTask(task.parentId) : undefined;
    const next: PreRetreatTaskStatus = task.status === "done" ? "pending" : "done";

    const changes: Array<{ t: RetreatPreRetreatTaskDTO; from: PreRetreatTaskStatus }> = [];
    const apply = (t: RetreatPreRetreatTaskDTO, s: PreRetreatTaskStatus) => {
      if (t.status === "not_applicable" || t.status === s) return;
      changes.push({ t, from: t.status });
      t.status = s;
    };

    apply(task, next);

    if (task.children && task.children.length) {
      // Padre → propaga a hijos activos.
      for (const c of task.children) apply(c, next);
      recomputeProgress(task);
    } else if (parent) {
      // Hijo → recalcula el padre según sus hijos activos.
      const active = (parent.children ?? []).filter((c) => c.status !== "not_applicable");
      const allDone = active.length > 0 && active.every((c) => c.status === "done");
      apply(parent, allDone ? "done" : "pending");
      recomputeProgress(parent);
    }

    if (changes.length === 0) return;
    try {
      await Promise.all(changes.map((ch) => preRetreatTaskApi.setStatus(ch.t.id, ch.t.status)));
    } catch (err) {
      // Rollback simple: recarga el árbol coherente desde el servidor.
      if (loadedRetreatId) await fetchForRetreat(loadedRetreatId);
      throw err;
    }
  }

  async function removeTask(retreatId: string, id: string) {
    await preRetreatTaskApi.remove(id);
    await fetchForRetreat(retreatId);
  }

  async function materialize(
    retreatId: string,
    opts: { templateSetId?: string; clearExisting?: boolean } = {},
  ) {
    tasks.value = await preRetreatTaskApi.materialize(retreatId, opts);
    loadedRetreatId = retreatId;
  }

  async function addMissing(retreatId: string, templateSetId?: string) {
    const r = await preRetreatTaskApi.addMissing(retreatId, templateSetId);
    await fetchForRetreat(retreatId);
    return r;
  }

  async function fetchTemplateSets() {
    templateSets.value = await preRetreatTaskTemplateApi.listSets();
  }

  async function fetchTemplates(setId?: string) {
    templates.value = await preRetreatTaskTemplateApi.list(setId);
  }

  return {
    tasks,
    templates,
    templateSets,
    loading,
    buckets,
    totalProgress,
    counts,
    semaphoreFor,
    findTask,
    fetchForRetreat,
    createTask,
    updateTask,
    setStatus,
    toggleDone,
    removeTask,
    materialize,
    addMissing,
    fetchTemplateSets,
    fetchTemplates,
  };
});
