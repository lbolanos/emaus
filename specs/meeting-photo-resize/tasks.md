# Tasks: Fotos de reunión grandes

Marcar al cerrar cada milestone, anotando las desviaciones reales respecto al plan.

## M0 — Specs

- [x] `spec.md`, `research.md`, `plan.md`, `tasks.md`
- [x] Decisiones D1-D3 heredadas de `memory-photo-resize` (aprobadas el 2026-10-19)

## M1 — API

- [x] `processMemoryPhoto` → `processPhoto`; `setMeetingPhoto` lo usa
- [x] Test S3 en `communityMeetingPhoto.test.ts` (3000×2000 → WebP 1600×1067, `sharp` real)
- [x] Suites de imagen, recuerdos y reuniones verdes (5 suites, 58 tests); `vite build` del API
      (2 `__dirname` en `dist/index.js`, los mismos que en master)

## M2 — Web

- [x] Constantes compartidas en `imageResize.ts`; `MemoryUploadForm` las importa
- [x] `CommunityMeetingsView`: reducir antes de subir, tope de 30 MB
- [x] `MeetingFormModal`: reducir al elegir, «Guardar» deshabilitado mientras tanto
- [x] Tests de la lista y del modal (`MeetingFormModalPhoto.test.ts`, nuevo); suite web completa
      (222 archivos, 3327 tests), `vue-tsc` y lint

Desviaciones:

- El test del modal se comprobó por mutación: sin `|| isProcessingPhoto` en «Guardar» falla.
  La primera versión verificaba el botón con el formulario vacío, que ya lo deshabilita por sí
  solo, y habría pasado sin el arreglo.
- Mientras se reduce la foto, el mosaico «Agregar foto» también se deshabilita y dice «Procesando
  foto...». El plan solo hablaba de «Guardar».

## M3 — Cierre

- [x] Prueba en el navegador (worktree en 3005/5177, Playwright, JPEG de 4032×3024 y 7,6 MB):
      - lista: sube como JPEG de 1600×1200 y 450 KB, `PUT /communities/meetings/:id/photo` 200,
        el botón pasa a «Cambiar foto»;
      - modal: la vista previa ya es la versión reducida (1600×1200, 450 KB) y se ve el texto de
        ayuda nuevo. **No se guardó**: crear una reunión manda avisos a los miembros y la base de
        dev es copia de datos reales. El guardado con foto queda cubierto por el test del modal.
- [x] `troubleshooting` §37: la foto de reunión ya no recorta; queda el fondo del volante
- [x] Reconciliar spec ↔ código

Lo que no se probó: el camino S3 en el navegador (dev guarda en base64). Lo cubre el test de
integración; se verá con la primera foto de reunión que se suba en prod tras el deploy.
