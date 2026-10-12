<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { useParticipantStore } from '@/stores/participantStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { getPalanqueroOptions } from '@/services/api';

// Resumen de asignación de caminantes que vive arriba de la lista de palancas.
// Cuenta sobre el mismo universo que la tabla de abajo: los walkers que el
// participantStore ya cargó para el retiro activo (por defecto, no cancelados),
// así que los números se mueven solos cuando se edita la tabla.
const { t } = useI18n();
const participantStore = useParticipantStore();
const retreatStore = useRetreatStore();
const { participants, loading } = storeToRefs(participantStore);
const { selectedRetreatId } = storeToRefs(retreatStore);

// Etiquetas de los tres palanqueros del retiro ("Palanquero 1 (Ana García)").
// Se cargan aparte del listado porque cambian al reasignarse la responsabilidad,
// no al editar la tabla.
const palanqueroOptions = ref<{ value: string; label: string }[]>([]);
watch(selectedRetreatId, async (newId) => {
    palanqueroOptions.value = [];
    if (!newId) return;
    try {
        palanqueroOptions.value = await getPalanqueroOptions(newId);
    } catch (e) {
        // Sin opciones el resumen igual cuenta: los tiles muestran el valor crudo.
        console.error('Error loading palanquero options:', e);
    }
}, { immediate: true });

const walkers = computed(() => participants.value.filter(p => p.type === 'walker'));

const countsByPalanquero = computed(() => {
    const counts = new Map<string, number>();
    for (const p of walkers.value) {
        const key = (p.palancasCoordinator ?? '').trim();
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
});

const unassignedCount = computed(() =>
    walkers.value.length - [...countsByPalanquero.value.values()].reduce((sum, n) => sum + n, 0));

// "Palanquero 1 (Ana García)" → { title: "Palanquero 1", subtitle: "Ana García" }
function splitLabel(label: string): { title: string; subtitle: string | null } {
    const match = /^(.+?)\s*\((.+)\)$/.exec(label);
    return match ? { title: match[1], subtitle: match[2] } : { title: label, subtitle: null };
}

const tiles = computed(() => {
    const result: { key: string; title: string; subtitle: string | null; count: number }[] = [];
    const known = new Set<string>();
    for (const opt of palanqueroOptions.value) {
        known.add(opt.value);
        result.push({
            key: opt.value,
            ...splitLabel(opt.label),
            count: countsByPalanquero.value.get(opt.value) ?? 0,
        });
    }
    // Valores huérfanos (responsabilidad renombrada o dato histórico): se
    // muestran con su valor crudo para que el total siga cuadrando.
    for (const [value, count] of [...countsByPalanquero.value.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (!known.has(value)) result.push({ key: value, title: value, subtitle: null, count });
    }
    return result;
});

// Primera carga: esqueleto, no ceros que asusten.
const showSkeleton = computed(() => loading.value && participants.value.length === 0);
const showCard = computed(() => showSkeleton.value || walkers.value.length > 0);
</script>

<template>
    <Card v-if="showCard">
        <CardHeader class="pb-3">
            <CardTitle class="text-base">{{ t('palancasDashboard.title') }}</CardTitle>
        </CardHeader>
        <CardContent>
            <div v-if="showSkeleton" class="animate-pulse grid grid-cols-2 md:grid-cols-5 gap-4">
                <div v-for="i in 5" :key="i" class="space-y-1">
                    <div class="h-3 bg-muted rounded w-3/4"></div>
                    <div class="h-7 bg-muted rounded w-1/2"></div>
                </div>
            </div>
            <div v-else class="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div v-for="tile in tiles" :key="tile.key" :title="tile.title">
                    <p class="text-xs uppercase tracking-wider text-muted-foreground truncate">{{ tile.title }}</p>
                    <p class="text-2xl font-bold mt-1">{{ tile.count }}</p>
                    <p v-if="tile.subtitle" class="text-xs text-muted-foreground mt-0.5 truncate">{{ tile.subtitle }}</p>
                </div>
                <div>
                    <p class="text-xs uppercase tracking-wider text-muted-foreground">{{ t('palancasDashboard.unassigned') }}</p>
                    <p class="text-2xl font-bold mt-1" :class="unassignedCount > 0 ? 'text-amber-600' : ''">{{ unassignedCount }}</p>
                </div>
                <div>
                    <p class="text-xs uppercase tracking-wider text-muted-foreground">{{ t('palancasDashboard.totalWalkers') }}</p>
                    <p class="text-2xl font-bold mt-1">{{ walkers.length }}</p>
                </div>
            </div>
        </CardContent>
    </Card>
</template>
