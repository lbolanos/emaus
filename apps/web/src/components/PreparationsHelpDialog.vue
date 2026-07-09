<template>
  <Dialog :open="open" @update:open="(v: boolean) => $emit('update:open', v)">
    <DialogContent class="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <HelpCircle class="w-5 h-5" />
          Cómo usar las Preparaciones
        </DialogTitle>
        <p class="text-sm text-gray-500">
          Guía rápida para coordinadores. Haz clic fuera del modal o pulsa ESC para cerrar.
        </p>
      </DialogHeader>

      <div class="space-y-6 text-sm">
        <!-- Qué es -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">📖</span> ¿Qué son las Preparaciones?
          </h3>
          <p class="text-gray-600 leading-relaxed">
            Son las <b>reuniones semanales del equipo de servidores</b> antes del retiro. En cada
            una se trabaja una charla con un objetivo específico —Servicio, Conocerte a ti mismo,
            Sanación y Perdón, Familia y Amigos, Palabra y Oración, La Confianza, El Amor del Padre—
            para que el equipo llegue preparado a darlas. No son para los caminantes: son la
            formación del equipo que servirá el retiro.
          </p>
        </section>

        <hr class="border-gray-100" />

        <!-- Calendario -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">🗓️</span> El calendario
          </h3>
          <ul class="space-y-2 text-gray-600">
            <li class="flex gap-3">
              <span class="shrink-0">•</span>
              <span>
                Al crear un retiro, el calendario se genera solo: <b>siete reuniones semanales</b>
                que terminan justo antes del retiro, cada una con su documento de charla adjunto.
              </span>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0">•</span>
              <span>
                <b>Configurar y crear</b>: eliges cuántas semanas (7 a 9 es lo habitual), el día y
                la hora. Abajo ves las fechas resultantes antes de crear. Marca
                <b>“Adjuntar documentos por defecto”</b> para incluir el material de cada charla.
              </span>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0">•</span>
              <span>
                Cada reunión es <b>editable en la página</b>: cambia su título, fecha y hora
                directamente. Con <b>Agregar entrada</b> añades una reunión suelta.
              </span>
            </li>
          </ul>
        </section>

        <hr class="border-gray-100" />

        <!-- Documentos -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">📎</span> Documentos de cada charla
          </h3>
          <ul class="space-y-2 text-gray-600">
            <li class="flex gap-3">
              <span class="shrink-0">•</span>
              <span><b>Subir archivo</b>: adjunta un PDF o Word (la guía de la charla).</span>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0">•</span>
              <span>
                <b>Nuevo texto</b>: escribe un documento en formato de texto (markdown) editable
                dentro de la app, sin subir archivos.
              </span>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0">•</span>
              <span>El equipo los ve y descarga desde el enlace público, sin necesidad de cuenta.</span>
            </li>
          </ul>
        </section>

        <hr class="border-gray-100" />

        <!-- Festivos -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">🚩</span> Saltar una fecha por festivo
          </h3>
          <p class="text-gray-600 leading-relaxed">
            Si una reunión cae en festivo, pulsa <b>Saltar por festivo</b> y anota el motivo. Esa
            fecha queda marcada como festivo y <b>las reuniones anteriores se adelantan una
            semana</b>: la primera comienza antes. La fecha del retiro nunca se mueve.
          </p>
        </section>

        <hr class="border-gray-100" />

        <!-- Enlace público -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">🔗</span> Enlace público para el equipo
          </h3>
          <p class="text-gray-600 leading-relaxed">
            <b>Copiar enlace público</b> te da una dirección para compartir por WhatsApp. Los
            servidores la abren sin usuario ni contraseña: ven el calendario, la
            <b>próxima reunión destacada</b> y descargan el documento de cada charla. Requiere que
            el retiro tenga enlace (slug) y esté marcado como público.
          </p>
        </section>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@repo/ui';
import { HelpCircle } from 'lucide-vue-next';

defineProps<{ open: boolean }>();
defineEmits<{ 'update:open': [value: boolean] }>();
</script>
