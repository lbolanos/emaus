# Tasks: Fotos de reunión grandes

Marcar al cerrar cada milestone, anotando las desviaciones reales respecto al plan.

## M0 — Specs

- [x] `spec.md`, `research.md`, `plan.md`, `tasks.md`
- [x] Decisiones D1-D3 heredadas de `memory-photo-resize` (aprobadas el 2026-10-19)

## M1 — API

- [ ] `processMemoryPhoto` → `processPhoto`; `setMeetingPhoto` lo usa
- [ ] Test S3 en `communityMeetingPhoto.test.ts`
- [ ] Suites de imagen y recuerdos verdes; `vite build` del API

## M2 — Web

- [ ] Constantes compartidas en `imageResize.ts`; `MemoryUploadForm` las importa
- [ ] `CommunityMeetingsView`: reducir antes de subir, tope de 30 MB
- [ ] `MeetingFormModal`: reducir al elegir, «Guardar» deshabilitado mientras tanto
- [ ] Tests de la lista y del modal; `vue-tsc` y lint

## M3 — Cierre

- [ ] Prueba en el navegador con una foto de más de 5 MB (lista y modal)
- [ ] `troubleshooting` §37: la foto de reunión ya no recorta; queda el fondo del volante
- [ ] Reconciliar spec ↔ código
