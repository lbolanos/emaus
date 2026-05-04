<template>
  <Dialog :open="open" @update:open="(v: boolean) => $emit('update:open', v)">
    <DialogContent class="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <HelpCircle class="w-5 h-5" />
          Cómo usar el Minuto a Minuto
        </DialogTitle>
        <p class="text-sm text-gray-500">
          Guía rápida para coordinadores y servidores. Click fuera del modal o ESC para cerrar.
        </p>
      </DialogHeader>

      <div class="space-y-6 text-sm">
        <!-- Qué es -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">📋</span> ¿Qué es el Minuto a Minuto?
          </h3>
          <p class="text-gray-600 leading-relaxed">
            La agenda en vivo del retiro, dividida por días. Cada item es una actividad con su
            hora, duración, responsable y guion. Reemplaza la "hoja minuto a minuto" en papel:
            el coordinador la maneja desde aquí en tiempo real y los servidores ven los cambios
            al instante en sus dispositivos.
          </p>
        </section>

        <hr class="border-gray-100" />

        <!-- Durante el retiro -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">▶</span> Durante el retiro (controles en cada fila)
          </h3>
          <ul class="space-y-2 text-gray-600">
            <li class="flex gap-3">
              <span class="font-mono text-blue-700 shrink-0">▶</span>
              <span><b>Iniciar</b>: marca el item como "en curso". Notifica al responsable y aparece como AHORA en la pantalla pública.</span>
            </li>
            <li class="flex gap-3">
              <span class="font-mono text-green-600 shrink-0">✓</span>
              <span><b>Completar</b>: cierra el item activo. Sólo aparece cuando el item está en curso.</span>
            </li>
            <li class="flex gap-3">
              <span class="font-mono text-gray-500 shrink-0">−5 / +5</span>
              <span><b>Ajustar ±5 min</b>: corre el item (y los siguientes del día) por 5 minutos hacia atrás o adelante.</span>
            </li>
            <li class="flex gap-3">
              <span class="font-mono text-emerald-700 shrink-0">📎 N</span>
              <span><b>Documentos</b>: abre los guiones del rol (markdown editable, PDF, imágenes). El "N" es el conteo.</span>
            </li>
            <li class="flex gap-3">
              <span class="text-blue-700 shrink-0">click fila</span>
              <span><b>Editar</b>: abre el modal completo con todos los campos (hora, duración, responsable, notas, status, horarios reales).</span>
            </li>
          </ul>
        </section>

        <hr class="border-gray-100" />

        <!-- Drag to reorder -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">🎯</span> Reordenar items (drag & drop)
          </h3>
          <p class="text-gray-600 leading-relaxed">
            Sólo cuando agrupas <b>por Día</b>: arrastra una fila sobre otra del mismo día para
            intercambiar sus posiciones. Las horas se preservan (cada slot conserva su hora original);
            cambia <b>qué</b> item ocupa cada slot. Útil si el coordinador decide intercambiar dos
            charlas o mover una al final.
          </p>
        </section>

        <hr class="border-gray-100" />

        <!-- Header / "Más acciones" -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">⋮</span> Menú "Más acciones"
          </h3>
          <ul class="space-y-2 text-gray-600">
            <li class="flex gap-3">
              <span class="shrink-0">🔔</span>
              <span><b>Tocar campana</b>: dispara una notificación en pantalla a todos los servidores conectados (pasa a comedor, capilla, etc.).</span>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0">🖨</span>
              <span><b>Imprimir</b>: genera vista de impresión con todo el calendario en formato A4. Incluye descripciones, oculta acciones y "tiempo relativo".</span>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0">📦</span>
              <span><b>Descargar guiones (zip)</b>: bundle con todos los markdowns y PDFs del retiro, organizados por carpeta de responsabilidad. Útil para llevar offline.</span>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0">📺</span>
              <span><b>Copiar link de pantalla pública</b>: vista big-screen <i>auth-less</i> en <code>/mam/&lt;slug&gt;</code> para proyectar en el salón. Refleja en vivo lo que el coordinador marca como AHORA.</span>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0">⏱</span>
              <span><b>Mover día</b> (en el header de cada día): corre todos los items del día por N minutos. Útil cuando se atrasa el retiro completo.</span>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0">⏱</span>
              <span><b>Re-vincular responsabilidades</b>: vuelve a unir los items con sus roles canónicos por nombre (sólo manage).</span>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0">✨</span>
              <span><b>Auto-asignar angelitos</b>: rellena automáticamente los slots de Santísimo durante comidas con participantes tipo "Angelito" disponibles.</span>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0">📥</span>
              <span><b>Importar desde template</b> (sobrescribe): borra todos los items actuales y materializa de nuevo desde Polanco/Sta Clara. <span class="text-amber-700">Cuidado: pierde shifts y reorders.</span></span>
            </li>
          </ul>
        </section>

        <hr class="border-gray-100" />

        <!-- Pantalla pública -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">📺</span> Pantalla pública (proyector)
          </h3>
          <p class="text-gray-600 leading-relaxed mb-2">
            Se muestra como big-screen sin login (sólo lectura). El item AHORA es lo que el coordinador
            marcó con ▶. Los próximos items aparecen en la lista de abajo. WS en vivo: cuando el
            coordinador completa un item, el proyector lo refleja en menos de 1 segundo.
          </p>
          <p class="text-xs text-gray-500">
            Para activarla, edita el retiro y marca "Retiro Público" = sí. La URL queda en
            <code>/mam/&lt;slug&gt;</code> donde slug se autogenera de la parroquia + número.
          </p>
        </section>

        <hr class="border-gray-100" />

        <!-- Documentos -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">📎</span> Documentos por responsabilidad
          </h3>
          <p class="text-gray-600 leading-relaxed mb-2">
            Los guiones (markdown, PDF, imágenes) viven globalmente vinculados al <b>nombre canónico</b>
            del rol. Si editas el guion de "Logistica" en un retiro, el cambio se ve en TODOS los
            retiros donde aparezca ese rol y en el template global. Es deliberado: arregla el typo
            una vez, queda arreglado para siempre.
          </p>
          <p class="text-gray-600 leading-relaxed">
            En el dialog 📎: <b>🖨 Imprimir</b> guion individual, <b>⬇ MD/PDF</b> descargar,
            <b>📜 Versiones</b> ver historial (las últimas 20 ediciones), <b>👁 Ver</b> preview de
            una versión antes de restaurar.
          </p>
        </section>

        <hr class="border-gray-100" />

        <!-- Atajos -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">⌨</span> Atajos útiles
          </h3>
          <ul class="space-y-1 text-gray-600">
            <li><kbd class="px-1.5 py-0.5 border border-gray-300 rounded text-xs font-mono">Ctrl/Cmd+P</kbd> imprimir el calendario</li>
            <li><kbd class="px-1.5 py-0.5 border border-gray-300 rounded text-xs font-mono">/</kbd> enfocar la búsqueda</li>
            <li><kbd class="px-1.5 py-0.5 border border-gray-300 rounded text-xs font-mono">ESC</kbd> cerrar modal o limpiar búsqueda</li>
            <li><kbd class="px-1.5 py-0.5 border border-gray-300 rounded text-xs font-mono">Enter</kbd> en un item activo: marcarlo como completado</li>
          </ul>
        </section>

        <hr class="border-gray-100" />

        <!-- Tips operativos -->
        <section class="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <h3 class="font-semibold text-sm mb-2 flex items-center gap-2">
            <span class="text-base">💡</span> Tips operativos
          </h3>
          <ul class="space-y-1 text-xs text-gray-700">
            <li>• El "tiempo relativo" (en X / hace X) bajo cada hora es solo orientación visual; en papel impreso no aparece.</li>
            <li>• La descripción del template aparece bajo cada item; click para expandir si está truncada.</li>
            <li>• Para retiros pasados (datos legacy), el botón "Save Changes" en Edit Retreat está habilitado — puedes corregir slug/notas a posteriori.</li>
            <li>• Un cambio en startDate del retiro shifta automáticamente todos los items por el delta.</li>
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
