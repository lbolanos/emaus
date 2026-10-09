# Plan técnico: milestones M0-M4

Orden: M0 → M1 → M2 → M3 → M4. M2 y M3 dependen de M1 (endpoint); M3 depende del componente
de M2. M4 cierra.

**Reglas por milestone**: jest verde (una corrida a la vez), `pnpm --filter api exec tsc
--noEmit` y `pnpm --filter web exec vue-tsc --noEmit` limpios, i18n es+en completo, `tasks.md`
cerrado con **Done** + desviaciones. Commits `type(scope): descripción (MN)`.

## M0 — worktree + specs SDD

- Branch `palancas-quick-phone-edit` + worktree `.claude/worktrees/palancas-quick-phone-edit`
  desde master HEAD (`0bf120ac`), `pnpm install`, copia de `apps/api/.env` del main,
  `pnpm --filter @repo/ui build` (el worktree nuevo no hereda `packages/ui/dist`).
- Artefactos: `spec.md`, `research.md`, `plan.md`, `tasks.md` (este directorio).
- Commit: `docs(specs): palancas-quick-phone-edit spec, research, plan, tasks (M0)`.

## M1 — backend: `PATCH /participants/:id/phones`

1. **Schema** `packages/types/src/index.ts`: `updateParticipantPhonesSchema` — objeto con
   `cellPhone?`, `emergencyContact1CellPhone?`, `emergencyContact2CellPhone?` (string, trim) y
   `retreatId` (uuid, requerido — access check). **Sin** preprocess `''→undefined` (la
   semántica de vacío es explícita, la valida el controller). Rechazo de `''` en
   cellPhone/EC1 en el controller (400 con campo nombrado) para dar mensaje i18n-eable.
2. **Ruta** `apps/api/src/routes/participantRoutes.ts` (molde: `PATCH /:id/attendance-confirmation`,
   líneas 89-94): `router.patch('/:id/phones', validateRequest(updateParticipantPhonesSchema),
   requirePermission('participant:update'), requireRetreatAccess('retreatId', 'body'),
   updateParticipantPhones)`.
3. **Controller** `participantController.ts` `updateParticipantPhones`:
   - cargar participante (404 si no existe);
   - `retreatService.findById(retreatId)` → `retreat.house.country` (texto libre);
   - validar cada campo presente con `validatePhoneForCountry(value, country)` → 400
     `{ errors: { campo: phoneValidationMessage(...) } }` si alguno falla; `''` en
     cellPhone/EC1 → 400 (required); `''` en EC2 → pasa como `null`;
   - llamar al service, responder angosto
     `{ id, cellPhone, emergencyContact1CellPhone, emergencyContact2CellPhone }`.
4. **Service** `participantService.ts` `updateParticipantPhones(id, fields, actor)`:
   canonizar cada valor con `toNationalPhone(value, country)`, merge, save, audit `logUpdate`
   con allowlist `['cellPhone','emergencyContact1CellPhone','emergencyContact2CellPhone']`.
   Nota: canonizar en el service (no en el controller) para que el valor persistido y el
   auditado coincidan.
5. **Tests Jest** (`apps/api/src/tests/…`, molde suite existente de attendance-confirmation):
   CA1-CA6: happy path, canonización `+52`/`044`, inválido → 400 por campo, `''` EC1/EC2,
   403 permiso, 403 retreat ajeno, audit row.
6. Commit: `feat(api): quick phone patch endpoint for palancas (M1)`.

## M2 — frontend: editor + tabla

1. **api.ts** `apps/web/src/services/api.ts`: `updateParticipantPhones(participantId, payload)`
   → PATCH angosto.
2. **Store** `participantStore.ts`: action `updateParticipantPhones` junto a
   `setAttendanceConfirmation` (335-348) — optimista + rollback + sobrescribir el row con la
   respuesta angosta (valores canónicos del servidor).
3. **Componente** `apps/web/src/components/ParticipantQuickPhoneEditor.vue`:
   - popover manual molde `PreRetreatTaskAssignInline.vue` (raíz `relative`, panel absoluto,
     cierre por fuera/Esc, `panelShift` si no cabe);
   - props: `participant` (fila/ficha), `country` (texto libre de `house.country`);
   - 3 `Input` `type="tel"` con labels i18n (el de EC1 incluye `{nombre EC1}` si existe);
   - al guardar: `validatePhoneForCountry` por campo (país → ISO con el resolver de alias de
     `phone.ts`); error inline i18n (es+en); payload **solo campos cambiados**; `''` en
     cellPhone/EC1 bloquea Guardar (botón disabled + hint);
   - gate: `useAuthPermissions().hasPermission('participant:update')` — sin permiso, no renderiza
     el trigger;
   - emite `saved(payloadAngosto)` y `close`.
4. **Tabla** `ParticipantList.vue`:
   - prop `inlinePhoneEdit?: boolean` con `withDefaults` default `false` (regla de
     `.claude/rules/frontend.md`);
   - celda `cellPhone` (bloque default ~1913): cuando `inlinePhoneEdit`, renderiza el valor +
     trigger ✏ con el editor anclado (solo si el row es del retreat activo);
   - handler `onPhonesSaved(p)`: llama al store action; el store ya parchea `participants`;
     si el diálogo de edición está abierto con ese participante, actualizar
     `participantToEdit`.
5. **PalancasView.vue**: agregar `'cellPhone'` a `palancaTableColumns` (y a
   `palancaFormShowColumns` NO — el form completo ya tiene el campo en su sección Contacto) y
   `:inline-phone-edit="true"`. El merge de `getColumnSelection`
   (`participantStore.ts:306-319`) agrega la columna a selecciones guardadas.
6. Commit: `feat(web): inline phone editor in palancas table (M2)`.

## M3 — frontend: diálogo + i18n + tests

1. **Dialog** `EditParticipantForm.vue`: ✏ junto al `participant.cellPhone` del header
   palancas (471-474) montando el mismo editor; `country` de
   `participantRetreat?.house?.country`; al `saved` → actualizar `localParticipant` con los
   valores canónicos y emitir `participant-patched` hacia `ParticipantList`.
2. **i18n**: claves es+en (labels de los 3 campos, botones, errores de validación mapeados de
   `validatePhoneForCountry`, toasts de éxito/error). Verificar ambas (una key ausente pinta
   la key cruda).
3. **Tests Vitest**: suite del editor (con/sin permiso, validación por país bloquea envío,
   payload solo con cambios, rollback con fallo de API) — montar con i18n real o mock de `t`;
   para contratos de `@repo/ui` en el editor, importar por ruta el componente real si hace
   falta. Suite del wiring en `ParticipantList` (prop apagada por default: no renderiza ✏ en
   vistas que no la pasan).
4. Commit: `feat(web): quick phone editor in palancas dialog, i18n, tests (M3)`.

## M4 — verificación + docs

1. Checklist de verificación (abajo) completo, incluida corrida del bundle de prod del API
   (regla ESM/`__dirname`).
2. `docs/features/palancas-quick-phone-edit.md` (español, estilo del directorio: problema,
   piezas, anclas a archivos, limitación de snapshots).
3. Reconcile del spec a modo retroactivo (la skill `especificaciones` lo pide al fusionar).
4. Commit: `docs(features): document quick phone edit, close M4`.

## Verificación (M4, y checkpoints parciales)

- `pnpm --filter api exec tsc --noEmit` · `pnpm --filter web exec vue-tsc --noEmit`.
- Jest M1 (verificar `ps aux | grep "[j]est"` antes) · Vitest M3.
- `pnpm build` api+web; con el API tocado: correr `dist/index.js` una vez o
  `grep __dirname dist/index.js`.
- Navegador con `bash .ruler/skills/worktree-testing/scripts/start-worktree-dev.sh`
  (si `audit-secuencias` ocupa 3002/5174 → `API_PORT=3003 WEB_PORT=5175`), login dev
  (`DEMO_EMAIL`/`DEMO_PASSWORD` de `apps/web/e2e/demo/.env`, ver `.env.example`):
  - CA7: columna Celular + ✏ corrige sin recargar;
  - CA8: agregar EC2; CA10: ✏ del diálogo refresca header;
  - CA2/CA11: `+52…` se canoniza; inválido muestra error y no guarda;
  - CA9/CA12: `/app/walkers` sin ✏; usuario sin permiso sin ✏;
  - confirmar que el puerto sirve ESTE worktree:
    `curl -s http://localhost:<webPort>/src/views/PalancasView.vue | grep cellPhone`.
