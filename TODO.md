# TODO

Backlog de mejoras pendientes, organizado por urgencia. Mantenido manualmente.

## 🔴 Críticos antes de prod

- [ ] **Activar S3 en producción** para que uploads de PDF/DOC funcionen.
  - Crear IAM user dedicado `emaus-app` con política mínima sobre `emaus-media/public-assets/*`, `avatars/*`, `retreat-memories/*` (`GetObject`/`PutObject`/`DeleteObject`).
  - Agregar al `.env` de `emaus-prod`:
    ```
    AVATAR_STORAGE=s3
    S3_BUCKET_NAME=emaus-media
    AWS_REGION=us-east-1
    AWS_ACCESS_KEY_ID=...
    AWS_SECRET_ACCESS_KEY=...
    ```
  - `pm2 restart emaus-api`.
  - Verificar con un upload real desde la UI; objeto debe aparecer en `s3://emaus-media/public-assets/responsability-attachments/...`.
  - Sin esto: markdowns funcionan (inline ≤ 200KB), pero archivos > 1MB se rechazan con 503.

- [x] ~~**Bug "en curso" duplicado en MaM**~~ ✅ Resuelto 2026-04-27.
  - Antes: `relativeTime()` devolvía "en curso" para cualquier item donde `now ∈ [start, end]`. Items traslapados aparecían ambos como activos.
  - Ahora: solo `status === 'active'` dispara "en curso". Items pending cuyo horario coincide con `now` muestran "ahora" (refleja que están en su slot pero no fueron iniciados con ▶).
  - Cobertura: 8 tests nuevos en `responsabilityAttachment.simple.test.ts` enforcando el comportamiento.
  - Verificado en Chrome con simulación: pasó de varios "en curso" simultáneos → exactamente 1 (el active).

## 🟡 Importantes (UX/operacional, se nota rápido)

- [ ] **Vista directa "Documentos por Responsabilidad"** sin pasar por el template:
  - Agregar botón `📎 N` en cada fila de `RetreatRoleManagementView.vue` o `ResponsabilityList.vue`.
  - Alternativa: nueva ruta `/app/settings/responsability-attachments` con lista de roles canónicos + count + buscador.

- [ ] **Convertir endpoint legacy `/api/responsibilities/documentation`** a proxy del nuevo modelo:
  - En `responsabilityController.ts:getDocumentation`, en lugar de leer de `charlaDocumentation.ts`, leer de `responsability_attachment` (primer markdown por nombre).
  - Mantiene backwards compat con el frontend que ya lo usa, unifica fuentes.

- [ ] **WebSocket evento `schedule:attachment-changed`**:
  - Cuando un coordinador sube/edita/borra un attachment durante el retiro, los servidores con MaM abierto no lo ven hasta refresh.
  - Emit en `responsabilityAttachmentService.upload/update/delete`; frontend lo escucha en `scheduleStore.subscribeRealtime` y refresca los items afectados.

- [ ] **Mobile responsiveness del MaM compacto**:
  - Verificar viewport ≤ 640px. Las muchas columnas inline (hora · status · nombre · tipo · responsable · 📎) pueden quedar apretadas.
  - Posible solución: en mobile, ocultar tipo badge y responsable apoyo (solo principal). Acciones colapsadas en `⋮`.

- [ ] **Tests de UI (Vitest)** para `ResponsabilityAttachmentsDialog.vue`:
  - Hoy hay solo tests de la lógica del service (23 tests pure-logic). Falta cobertura del dialog: upload, drag&drop, MD editor, preview, descarga PDF, validación cliente.

## 🟢 Nice-to-have (cuando haya tiempo)

- [ ] **Limpiar `retreat_responsibilities.description`** que duplica info ahora que vive en attachments.
  - Script: truncar `description` > 200 chars a un placeholder `"Ver guion completo en 📎 Documentos"`.
  - Solo hacer una vez confirmado que prod corre estable y nadie depende del campo largo.

- [ ] **Versioning de guiones markdown**:
  - Cuando se edita un MD, guardar la versión anterior en una tabla auxiliar `responsability_attachment_history` con timestamp.
  - Botón "Restaurar versión anterior" en el dialog.

- [ ] **PDF export del MaM completo**:
  - Botón "Imprimir minuto a minuto del Día X" que genera un PDF formateado con todas las actividades del día.
  - Para coordinadores que prefieren tener el papel a mano.

- [ ] **Bulk import de attachments**:
  - Subir un ZIP con múltiples PDFs; cada archivo se asocia al rol que matchee su nombre (`Comedor.pdf` → rol `Comedor`).

- [ ] **Export ZIP del retiro**:
  - Para un retiro específico, descargar un .zip con todos los guiones de los roles asignados a participantes.

- [ ] **`Diario` y `Moderador`** que están en attachments pero no en `charlaDocumentation.ts`:
  - O agregarlos al archivo TS para que la fuente sea autoritaria.
  - O documentar el origen (legacy desde descriptions de retreats viejos).

- [ ] **Drag-to-reorder** en el MaM:
  - Reordenar items dentro de un día con drag&drop.
  - Actualiza `orderInDay` y eventualmente `startTime` si se mueve a otro slot.

- [ ] **Vista pública big-screen** (auth-less) del minuto a minuto:
  - Para proyectar en el salón durante el retiro.
  - Solo lectura, refresca cada 30 s, fuente grande, indicador "AHORA" prominente.

- [ ] **Heurística de conflictos mejorada**:
  - Hoy `resolveSantisimoConflicts` solo mira overlap temporal. No contempla "el responsable de la charla también está en una mesa". Edge case raro pero válido.

## 🛠 Deuda técnica

- [ ] **`ResponsabilityAttachmentsDialog.vue` tiene 500+ líneas** — splitear en `MarkdownEditor`, `AttachmentsList`, `UploadDropzone`.
- [ ] **`storageUrl` data URL inline** todavía se incluye en el list endpoint (solo `content` se excluye). Para markdown sin S3, `storageUrl` es un base64 grande. Considerar serializar como referencia y servirlo via endpoint dedicado `/attachments/:id/download` cuando no hay S3.
- [ ] **Tests de descripción larga seedeada en retreats**: `responsabilityAttachmentSeeder` ahora lee de `charlaDocumentation` directamente. Pero si en algún retiro alguien editó la `description` para customizar, esa edición NO se preserva. Decidir: ¿priorizar custom de DB sobre archivo TS, o documentar como limitación?

## 📦 Cleanup

- [ ] **Borrar `seedResponsabilityAttachmentsFromDescriptions` legacy** del seeder anterior (la versión que leía de `retreat_responsibilities.description`). Hoy ya usa `charlaDocumentation` directo, pero el código historico podría confundir. Verificar grep y limpiar.
- [ ] **Borrar el test ad-hoc `/tmp/seed-attachments.cjs`** (artefacto de la sesión de bootstrap).
