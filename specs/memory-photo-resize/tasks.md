# Tasks: Fotos del recuerdo grandes

Marcar al cerrar cada milestone, anotando las desviaciones reales respecto al plan.

## M0 — Specs

- [x] `specs/memory-photo-resize/spec.md`
- [x] `specs/memory-photo-resize/research.md`
- [x] `specs/memory-photo-resize/plan.md`
- [x] `specs/memory-photo-resize/tasks.md`
- [x] Aprobación de D1-D4 (2026-10-19, sin cambios)

## M1 — Navegador: reducir antes de subir (D1, D3, D4) [P]

- [x] `MemoryUploadForm.vue`: `resizeImageToDataUrl` a 1600 px, tope de 30 MB, lote por archivo, cupo, texto de ayuda
- [x] `MemoryUploadForm.spec.ts`: 8 MB reducida, más de 30 MB, formato no válido, falla a mitad de lote, cupo
- [x] `pnpm --filter web test` (220 archivos, 3317 tests) y `vue-tsc` verdes

**Done**: una foto de celular de más de 5 MB sube en local (modo base64).

Desviaciones:

- El cupo se aplica **después** de descartar los archivos inválidos (`files.filter(validateFile).slice(0, slots)`),
  no antes como decía el plan. Así un archivo rechazado no ocupa el lugar de uno bueno.
- Test extra: si la **reducción** falla (no solo la subida), el lote sigue.
- Tras el code review del cierre: las fallas del lote se reportan en **un solo toast** al final
  (antes, uno por foto: con la sesión vencida, 10 fotos daban 10 toasts), y las fotos que no caben
  en el cupo se avisan con «Máximo 30 fotos por retiro» en vez de descartarse en silencio.

## M2 — API: no recortar (D2) [P]

- [x] `imageService.ts`: `processWithoutCrop` + `processMemoryPhoto`; `processFlyerAsset` delega
- [x] `retreatMemoryService.addPhoto` usa `processMemoryPhoto`
- [x] Test S3 en `retreatMemoryService.integration.test.ts` (3000×2000 → WebP 1600×1067, con `sharp` real)
- [x] `flyerAsset.test.ts` e `imageService.test.ts` verdes sin cambios
- [x] `vite build` del API verde; `__dirname` aparece 2 veces en `dist/index.js`, las mismas que en el bundle del main

**Done**: en modo S3 la foto se sube completa, sin recortar.

Desviaciones:

- Test extra: una foto de 800×600 no se agranda (`withoutEnlargement`).
- `tsc --noEmit` del API sigue con los errores que ya tenía en archivos no tocados; los tres de
  `imageService.ts` son código previo (el `catch` que ya estaba en `processFlyerAsset` se movió tal cual).

## M3 — Cierre

- [x] Prueba en el navegador (worktree en 3005/5177, Playwright): JPEG de 4032×3024 y 7,6 MB →
      sube como JPEG de 1600×1200 y 451 KB, `POST /memory-photos` 201, contador 1/30, sin toasts.
      La imagen de prueba es ruido sintético, el peor caso para comprimir: una foto real queda más chica.
- [x] Reconciliar spec ↔ código y anotar desviaciones aquí
- [ ] Avisar que las 10 fotos de prod se quedan cuadradas hasta que se vuelvan a subir (borrador listo, sin enviar)

Encontrado al cerrar, fuera de alcance: la **foto de reunión de la comunidad**
(`communityService.ts`, `uploadCommunityMeetingPhoto`) también pasa por `processAvatar` y se
guarda como cuadrado de 512 px (12 objetos en `community-meetings/`); su formulario limita a 2 MB
sin reducir. Mismo arreglo que aquí; queda para otra tarea.

Lo que no se probó: D2 en el navegador. El dev local guarda en base64 y no pasa por `sharp`; el
camino S3 queda cubierto por el test de integración. Se verá en prod con la primera foto que se
suba después del deploy.
