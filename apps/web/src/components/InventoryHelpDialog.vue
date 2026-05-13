<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <HelpCircle class="w-5 h-5" />
          Cómo usar el Inventario
        </DialogTitle>
      </DialogHeader>

      <div class="space-y-5 text-sm">

        <!-- Flujo general -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">📦</span> Flujo básico
          </h3>
          <ol class="space-y-2 list-none">
            <li class="flex gap-3">
              <span class="flex-none w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">1</span>
              <div>
                <p class="font-medium">Recalcular cantidades requeridas</p>
                <p class="text-gray-500 text-xs mt-0.5">Usa el botón <b>Recalcular</b> para que el sistema calcule cuánto se necesita de cada artículo según los caminantes inscritos.</p>
              </div>
            </li>
            <li class="flex gap-3">
              <span class="flex-none w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">2</span>
              <div>
                <p class="font-medium">Registrar lo que ya tienes</p>
                <p class="text-gray-500 text-xs mt-0.5">Edita la columna <b>Actual</b> en cada artículo para indicar la cantidad disponible. El semáforo cambia automáticamente.</p>
              </div>
            </li>
            <li class="flex gap-3">
              <span class="flex-none w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">3</span>
              <div>
                <p class="font-medium">Asignar cajas y estado</p>
                <p class="text-gray-500 text-xs mt-0.5">Etiqueta cada artículo con una caja (ej. "Caja 1") y avanza su estado: Pendiente → Empacado → En sitio → Consumido.</p>
              </div>
            </li>
            <li class="flex gap-3">
              <span class="flex-none w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">4</span>
              <div>
                <p class="font-medium">Imprimir lista de empaque o compras</p>
                <p class="text-gray-500 text-xs mt-0.5">Desde <b>Más acciones</b> imprime la lista de empaque completa o la lista de lo que falta comprar.</p>
              </div>
            </li>
          </ol>
        </section>

        <hr class="border-gray-100" />

        <!-- Agregar artículos -->
        <section>
          <h3 class="font-semibold text-base mb-3 flex items-center gap-2">
            <span class="text-lg">➕</span> Agregar artículos
          </h3>
          <div class="space-y-3">
            <div class="flex gap-3 p-3 rounded-lg bg-gray-50">
              <span class="text-xl flex-none">📋</span>
              <div>
                <p class="font-medium">Del catálogo global</p>
                <p class="text-gray-500 text-xs mt-0.5">Agrega artículos predefinidos que tienen ratio automático de caminante (ej. cobija = 1 por caminante).</p>
              </div>
            </div>
            <div class="flex gap-3 p-3 rounded-lg bg-gray-50">
              <span class="text-xl flex-none">✏️</span>
              <div>
                <p class="font-medium">Artículo personalizado</p>
                <p class="text-gray-500 text-xs mt-0.5">Crea artículos que solo viven en este retiro. Útil para cosas específicas que no quieres en el catálogo global (ej. "Café Marlboro 30g").</p>
              </div>
            </div>
            <div class="flex gap-3 p-3 rounded-lg bg-gray-50">
              <span class="text-xl flex-none">👕</span>
              <div>
                <p class="font-medium">Camisetas (sincronización automática)</p>
                <p class="text-gray-500 text-xs mt-0.5">Las filas de camisetas se sincronizan con los "Tipos de playera del retiro". Usa <b>Sincronizar camisetas</b> para refrescar tallas y conteos.</p>
              </div>
            </div>
          </div>
        </section>

        <hr class="border-gray-100" />

        <!-- Acciones en masa -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">☑️</span> Acciones en masa
          </h3>
          <p class="text-gray-600 mb-2">Selecciona varios artículos con los checkboxes para:</p>
          <ul class="space-y-1 text-gray-600 list-disc ml-4">
            <li>Asignar todos a la misma <b>caja</b></li>
            <li>Cambiar el <b>estado</b> de varios a la vez</li>
            <li><b>Quitar</b> artículos del inventario del retiro</li>
          </ul>
        </section>

        <hr class="border-gray-100" />

        <!-- Estados -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">🔄</span> Ciclo de estados
          </h3>
          <div class="grid grid-cols-1 gap-1.5">
            <div class="flex items-center gap-2">
              <span class="text-base">⏳</span>
              <span class="font-medium w-24">Pendiente</span>
              <span class="text-gray-500 text-xs">No se ha conseguido ni empacado</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-base">📦</span>
              <span class="font-medium w-24">Empacado</span>
              <span class="text-gray-500 text-xs">Listo en su caja, esperando el retiro</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-base">🏠</span>
              <span class="font-medium w-24">En sitio</span>
              <span class="text-gray-500 text-xs">Llegó a la casa de retiro</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-base">✅</span>
              <span class="font-medium w-24">Consumido</span>
              <span class="text-gray-500 text-xs">Usado durante el retiro</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-base">↩️</span>
              <span class="font-medium w-24">Devuelto</span>
              <span class="text-gray-500 text-xs">Regresó sobrante</span>
            </div>
          </div>
        </section>

        <hr class="border-gray-100" />

        <!-- Alertas -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">🔴</span> Alertas de inventario
          </h3>
          <p class="text-gray-600">El banner rojo en la parte superior lista artículos donde la cantidad <b>Actual</b> es menor a la <b>Requerida</b>. Usa el botón <b>Filtrar solo insuficientes</b> para enfocarte en ellos.</p>
        </section>

        <hr class="border-gray-100" />

        <!-- Consejos -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">💡</span> Consejos
          </h3>
          <ul class="space-y-1.5 text-gray-600 list-disc ml-4">
            <li>Usa <b>Copiar de retiro anterior</b> para arrastrar cantidades empacadas de un retiro previo.</li>
            <li>El <b>Historial de cambios</b> registra quién modificó qué y cuándo.</li>
            <li>Oculta columnas con el botón <b>Columnas</b> para simplificar la vista en móvil.</li>
            <li>La <b>Lista de compras</b> solo muestra artículos con déficit — ideal para llevar al súper.</li>
          </ul>
        </section>

      </div>

      <DialogFooter class="mt-4">
        <Button @click="$emit('update:open', false)">Cerrar</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button } from '@repo/ui';
import { HelpCircle } from 'lucide-vue-next';

defineProps({ open: { type: Boolean, required: true } });
defineEmits(['update:open']);
</script>
