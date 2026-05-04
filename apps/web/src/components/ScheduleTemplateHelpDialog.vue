<template>
  <Dialog :open="open" @update:open="(v: boolean) => $emit('update:open', v)">
    <DialogContent class="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <HelpCircle class="w-5 h-5" />
          Cómo usar el editor de Templates
        </DialogTitle>
        <p class="text-sm text-gray-500">
          Guía para administradores. Click fuera del modal o ESC para cerrar.
        </p>
      </DialogHeader>

      <div class="space-y-6 text-sm">
        <!-- Concepto -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">📋</span> ¿Qué es un Template?
          </h3>
          <p class="text-gray-600 leading-relaxed">
            Un Template es una <b>plantilla maestra</b> de la agenda Minuto a Minuto. Define los
            items canónicos de un retiro (charlas, comidas, dinámicas, campanas) con su día,
            hora, duración y rol responsable. Cada retiro nuevo elige UN template al "Importar",
            y los items se materializan a fechas concretas.
          </p>
          <p class="text-gray-600 leading-relaxed mt-2">
            Edita el template <b>una vez</b> y todos los retiros futuros que lo usen reciben el
            cambio. Útil para consolidar el conocimiento operativo del retiro entre coordinadores.
          </p>
        </section>

        <hr class="border-gray-100" />

        <!-- Templates incluidos -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">📚</span> Templates incluidos
          </h3>
          <ul class="space-y-2 text-gray-600">
            <li class="flex gap-3">
              <span class="text-amber-500 shrink-0">★</span>
              <div>
                <p><b>Emaús — México</b> (predeterminado)</p>
                <p class="text-xs text-gray-500">Basado en Polanco III. ~136 items con descripciones detalladas, Plan A/B, y música específica por charla.</p>
              </div>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0">·</span>
              <div>
                <p><b>Emaús — Colombia</b></p>
                <p class="text-xs text-gray-500">Basado en Sta. Clara, Bogotá. ~86 items con los 10 testimonios clásicos.</p>
              </div>
            </li>
          </ul>
          <p class="text-gray-500 text-xs mt-2">
            Puedes crear nuevos templates con <b>+ Nuevo template</b>, marcarlos predeterminado
            con la estrella ★, o eliminarlos (cuidado: rompe retiros vinculados).
          </p>
        </section>

        <hr class="border-gray-100" />

        <!-- Editar items -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">✏</span> Editar items del template
          </h3>
          <ul class="space-y-2 text-gray-600">
            <li class="flex gap-3">
              <span class="text-blue-700 shrink-0">click fila</span>
              <span>Abre el modal de edición con todos los campos: nombre, tipo, día, hora, duración, responsable, descripción, palanquita, planB, etc.</span>
            </li>
            <li class="flex gap-3">
              <span class="font-mono text-emerald-700 shrink-0">📎 N</span>
              <span><b>Documentos del rol</b>: abre los guiones (markdown editable, PDF). Estos guiones viven globalmente vinculados al nombre del rol — editar acá los actualiza en TODOS los retiros donde aparezca ese rol.</span>
            </li>
            <li class="flex gap-3">
              <span class="font-mono text-red-600 shrink-0">🗑</span>
              <span><b>Eliminar item</b> (hover en fila): elimina del template. Los retiros ya materializados conservan su copia.</span>
            </li>
          </ul>
        </section>

        <hr class="border-gray-100" />

        <!-- Documentos -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">📎</span> Editar documentos (guiones)
          </h3>
          <p class="text-gray-600 leading-relaxed mb-2">
            Cada rol canónico (Logística, Comedor, Charla: De la Rosa, etc.) tiene <b>uno o más
            guiones</b> almacenados como markdown editable, PDF o imagen. El dialog de documentos
            se ensancha automáticamente cuando entras a editar para que el textarea + preview
            tengan espacio.
          </p>
          <ul class="space-y-2 text-gray-600">
            <li class="flex gap-3">
              <span class="shrink-0">⬆</span>
              <span><b>Subir archivo</b>: PDF, DOCX o imagen (máx 10MB, 5 archivos por rol).</span>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0">✏</span>
              <span><b>Crear texto (Markdown)</b>: editor con preview en vivo. Soporta tablas, listas, encabezados, código, blockquotes.</span>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0">🖨</span>
              <span><b>Imprimir</b> guion individual: abre nueva ventana con CSS A4-friendly.</span>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0">📜</span>
              <span><b>Versiones</b>: historial de las últimas 20 ediciones con preview. Click en 👁 para vista completa antes de restaurar.</span>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0">↩</span>
              <span><b>Restaurar</b>: vuelve a una versión anterior. La versión actual se snapshota automáticamente para poder deshacer.</span>
            </li>
          </ul>
        </section>

        <hr class="border-gray-100" />

        <!-- Workflow recomendado -->
        <section class="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <h3 class="font-semibold text-sm mb-2 flex items-center gap-2">
            <span class="text-base">💡</span> Workflow recomendado
          </h3>
          <ol class="space-y-1 text-xs text-gray-700 list-decimal pl-5">
            <li>Selecciona el template a editar (Polanco / Sta Clara) en el selector superior.</li>
            <li>Para corregir un guion: abre 📎 del rol, click en el guion markdown, edita, "Guardar".</li>
            <li>Para agregar un item: <b>+ Nueva actividad</b>; ajusta día, hora, duración, rol.</li>
            <li>Para reordenar items: usa los campos <b>defaultDay</b> + <b>defaultOrder</b> en cada item; el listado se ordena por esos campos.</li>
            <li>Cambios al template aplican automáticamente a retiros NUEVOS. Los retiros ya materializados conservan su copia (no se sobrescriben).</li>
          </ol>
        </section>

        <hr class="border-gray-100" />

        <!-- Cuidados -->
        <section class="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <h3 class="font-semibold text-sm mb-2 flex items-center gap-2">
            <span class="text-base">⚠</span> Cuidados
          </h3>
          <ul class="space-y-1 text-xs text-gray-700">
            <li>• <b>Eliminar template</b>: rompe retiros vinculados. Solo hazlo si nadie está usando ese template.</li>
            <li>• <b>Cambiar nombre del rol</b> de un item: rompe el JOIN con guiones. Mejor crea un rol nuevo.</li>
            <li>• <b>defaultStartTime menor a 06:00 con defaultDay=N</b>: se interpreta como after-midnight de Día N (calendar pasa al día siguiente).</li>
            <li>• Guardar markdown muy grande (&gt;200KB): el sistema rechaza, divide en archivos.</li>
          </ul>
        </section>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="$emit('update:open', false)">Cerrar</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button } from '@repo/ui';
import { HelpCircle } from 'lucide-vue-next';

defineProps<{ open: boolean }>();
defineEmits<{ 'update:open': [value: boolean] }>();
</script>
