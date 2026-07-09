# Preparaciones semanales pre-retiro

**Reuniones semanales del equipo de servidores** antes del retiro (número variable, 1–12;
típico 7–9). Cada reunión trabaja una charla con un objetivo específico (Servicio, Conocerte
a ti mismo, Sanación y Perdón, Familia y Amigos, Palabra y Oración, La Confianza, El Amor del
Padre) para que el equipo llegue preparado a darlas. **No son para los caminantes** — son la
formación del equipo que servirá el retiro. Cada reunión lleva el documento de su charla, y hay
una **vista pública sin auth** (calendario y archivos públicos) para compartir con los servidores.

## Modelo

- `retreat_preparation`: entrada del calendario por retiro.
  - `type = 'session'`: preparación semanal (`weekNumber`, `title`, `date` YYYY-MM-DD, `time` HH:MM local).
  - `type = 'break'`: festivo — fecha saltada, solo informativa.
- `retreat_preparation_document`: documentos por sesión, modelo dual como los docs de responsabilidades:
  - `kind = 'file'`: archivo en S3 bajo `public-assets/preparations/{retreatId}/…` (URL pública directa,
    sin cambios de IAM). Fallback inline data-url ≤1MB si no hay S3.
  - `kind = 'markdown'`: texto editable in-app (`content`), renderizado con `marked` + DOMPurify.
- Migración: `20260708120000_CreateRetreatPreparations.ts` (+ permisos `retreatPreparation:read/manage`,
  matriz de roles espejo de `preRetreatTask`).

## Comportamiento

- **Al crear un retiro** se genera automáticamente el calendario por defecto: 7 sesiones semanales
  que terminan una semana antes de `startDate`, a las 20:00 (`retreatService.createRetreat` paso 6.6),
  **con los documentos por defecto de cada semana ya adjuntos**.
- **Documentos por defecto** (serie "Emaús hombres IX", la única completa 1ª–7ª): viven como assets
  en `apps/api/src/data/preparation-docs/` con manifest en `apps/api/src/data/preparationDocSeeder.ts`.
  `generate({ includeDefaultDocs: true })` adjunta a cada semana su copia (S3 en prod, inline en dev);
  la semana 5 lleva dos (charla + dinámica de oración). El checkbox del diálogo "Configurar y crear"
  viene marcado por defecto. Si el folder de assets no está en el deploy, el calendario se genera
  igual sin documentos (degradación silenciosa con warn).
- Retiros existentes: botón **"Configurar y crear"** en la vista admin (semanas, fecha de la primera,
  hora; preview de fechas; `clearExisting` para reemplazar).
- **Saltar por festivo** (`POST /:id/skip`): registra un `break` en la fecha original y **adelanta
  −7 días esa sesión y todas las anteriores**. Las posteriores no se mueven: la fecha del retiro es
  fija, así que el final del calendario queda anclado y la **primera preparación toma una fecha
  anterior**. Los breaks existentes no se mueven.
- Todo es editable inline (título, fecha, hora) y se pueden agregar entradas manuales.
- Vista pública `/preparaciones/:slug` (requiere `retreat.slug` + `retreat.isPublic`, mismo gate que
  Santísimo): calendario completo + tarjeta **"Próxima preparación"** con botón de descarga directa
  del documento de la siguiente sesión.

## Archivos clave

| Capa | Archivo |
|---|---|
| Types | `packages/types/src/retreatPreparation.ts` |
| Entities | `apps/api/src/entities/retreatPreparation{,Document}.entity.ts` |
| Service | `apps/api/src/services/retreatPreparationService.ts` |
| Controller/Routes | `apps/api/src/{controllers,routes}/retreatPreparation*.ts` (montado en `/api/retreat-preparations`, público exento de CSRF) |
| Vista admin | `apps/web/src/views/RetreatPreparationsView.vue` (sidebar → Logística → Preparaciones) |
| Vista pública | `apps/web/src/views/PublicPreparationsView.vue` |
| Ayuda in-app | `apps/web/src/components/PreparationsHelpDialog.vue` (botón ⍰ en la vista admin, patrón `MamHelpDialog`) |
| Tests | `apps/api/src/tests/services/retreatPreparationService.simple.test.ts`, `apps/web/src/views/__tests__/PublicPreparationsView.test.ts`, `apps/web/src/components/__tests__/PreparationsHelpDialog.test.ts` |
| Video demo | `apps/web/e2e/demo/record-preparations.mjs` (→ `output/preparaciones-demo.mp4` + `.meta.json`) |

## Gotchas

- Fechas siempre como strings `YYYY-MM-DD`/`HH:MM` (nunca `Date` — skill `timezone-handling`);
  aritmética de días con componentes UTC (`addDaysYmd`).
- El endpoint público devuelve URLs de S3 directas; los archivos bajo `public-assets/` ya son
  públicos por bucket policy.
- `generate` con calendario existente exige `clearExisting` y borra también los documentos (S3 incluido).
