# Tasks: Fotos del recuerdo grandes

Marcar al cerrar cada milestone, anotando las desviaciones reales respecto al plan.

## M0 — Specs

- [x] `specs/memory-photo-resize/spec.md`
- [x] `specs/memory-photo-resize/research.md`
- [x] `specs/memory-photo-resize/plan.md`
- [x] `specs/memory-photo-resize/tasks.md`
- [ ] Aprobación de D1-D4

## M1 — Navegador: reducir antes de subir (D1, D3, D4) [P]

- [ ] `MemoryUploadForm.vue`: `resizeImageToDataUrl` a 1600 px, tope de 30 MB, lote por archivo, cupo, texto de ayuda
- [ ] `MemoryUploadForm.spec.ts`: 8 MB reducida, más de 30 MB, formato no válido, falla a mitad de lote, cupo
- [ ] `pnpm --filter web test` y `vue-tsc` verdes

**Done**: una foto de celular de más de 5 MB sube en local (modo base64).

## M2 — API: no recortar (D2) [P]

- [ ] `imageService.ts`: `processWithoutCrop` + `processMemoryPhoto`; `processFlyerAsset` delega
- [ ] `retreatMemoryService.addPhoto` usa `processMemoryPhoto`
- [ ] Test S3 en `retreatMemoryService.integration.test.ts` (3000×2000 → WebP 1600×1067)
- [ ] `flyerAsset.test.ts` e `imageService.test.ts` verdes sin cambios
- [ ] `pnpm --filter api build` y `grep __dirname dist/index.js` vacío

**Done**: en modo S3 la foto se sube completa, sin recortar.

## M3 — Cierre

- [ ] Prueba en el navegador con una foto real de más de 5 MB
- [ ] Reconciliar spec ↔ código y anotar desviaciones aquí
- [ ] Avisar que las 10 fotos de prod se quedan cuadradas hasta que se vuelvan a subir

M1 y M2 no se tocan entre sí y pueden ir en paralelo. M3 depende de los dos.
