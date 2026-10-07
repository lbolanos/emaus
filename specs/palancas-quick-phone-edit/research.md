# Research: estado actual del código (pre-M1)

Exploración del 2026-10-07 sobre master (`0bf120ac`). Anclas `archivo:línea` — verificar al
usar, los rangos son andamio.

## Entities

- `apps/api/src/entities/participant.entity.ts`: `cellPhone` NOT NULL (90-91),
  `emergencyContact1CellPhone` NOT NULL (135-136), `emergencyContact2*` nullable (143-154).
  Bloque inviter espejo legado (175-191); source of truth del inviter per-retreat en
  `retreat_participants` (`retreatParticipant.entity.ts:150-168`).
- Sin ningún campo "registrador"/`registeredBy`: el único tercero modelado es el invitador.

## Registro público (por qué el teléfono llega mal)

- Wizard `ParticipantRegistrationView.vue` → `Step1PersonalInfo.vue:76-90` captura
  `homePhone/workPhone/cellPhone` como campos del caminante declarado; la esposa que llena el
  formulario escribe su número en `cellPhone` del esposo.
- Validación del registro: al menos un teléfono obligatorio (`ParticipantRegistrationView.vue:221-223`)
  y formato por país del retiro (`retreatCountry` 64, `addPhoneIssues` 86-91). El submit va por
  `POST /participants/new` con reCAPTCHA + Zod + `validateParticipantPhones(...,
  retreat.house.country)` y persiste canonizado (`participantController.ts:419-439`).

## Update actual y sus huecos

- `PUT /participants/:id` (`apps/api/src/routes/participantRoutes.ts:95-100`), permiso
  `participant:update`, `validateRequest(updateParticipantSchema)`.
- `updateParticipantSchema` (`packages/types/src/index.ts:906-924`):
  `participantSchema.partial()` + preprocess `null|'' → undefined` — no se puede limpiar un
  campo por esta vía y no hay regla de teléfono (memoria `feedback_zod_optional_empty_string`,
  `feedback_write_schemas_readonly_fields`).
- Service `participantService.ts:2986-3479`: `normalizeParticipantPhones` **sin país** (3001,
  solo separadores); merge sobre `participants`; audit `logUpdate` con allowlist
  `PARTICIPANT_AUDIT_FIELDS` (36-49, incluye `cellPhone`).
- El controller del update (667-730) streapea `scholarshipAmount` y campos de salud sin
  permiso — respuesta y gates pensados para la ficha completa, no para un patch angosto.

## Validación/canonización de teléfono (reutilizable, no tocar)

- `packages/types/src/phone.ts`: longitudes por país (15-38), ladas/prefijos MX 044/045/01
  (46-79), alias país texto-libre → ISO (86-116; `house.country` es texto libre, memoria
  `reference_house_country_free_text`), `normalizePhone` (163-166), `toNationalPhone`
  (219-228), `validatePhoneForCountry` (239-260, vacío = válido),
  `phoneValidationMessage` (265-279, **español fijo**), `PARTICIPANT_PHONE_FIELDS` (284-297),
  `validateParticipantPhones` (305-317), `normalizeParticipantPhones` (329-340).
- No existe componente `PhoneInput`: en todos lados es `Input` genérico `type="tel"`.

## Vista Palancas y teléfono

- `apps/web/src/views/PalancasView.vue`: wrapper delgado de `ParticipantList type="walker"` con
  columnas fijas palanca (sin `cellPhone` hoy).
- `ParticipantList.vue`: catálogo de columnas (cellPhone ya existe, línea ~420), celda default
  (~1913), `openEditDialog` (879-903), diálogo (2018-2029), columnas del form =
  `columnsToShowInForm ∪ visibleColumns` (807-819).
- `EditParticipantForm.vue`: `isPalancasView` (72) = `columnsToShow` incluye
  `palancasCoordinator`; header palancas muestra `participant.cellPhone` (471-474);
  `participantRetreat` computed (47-51) sobre `retreatStore.retreats` (GET /retreats trae
  `relations: ['house']`, `retreatService.ts:86`); colapsable contactos con EC1/EC2 (~528-545).
- Cola masiva: `WhatsAppSendQueue.vue:53` lee `p.cellPhone` al vuelo → corrije con el PATCH sin
  re-resolución.

## Precedentes de "un campo desde la tabla"

- `PATCH /participants/:id/attendance-confirmation` (`participantRoutes.ts:89-94`):
  `requirePermission('participant:update')` + `requireRetreatAccess('retreatId', 'body')` —
  molde directo del nuevo endpoint.
- Optimista+rollback en store: `setAttendanceConfirmation`
  (`apps/web/src/stores/participantStore.ts:335-348`).
- Popover inline manual: `apps/web/src/components/PreRetreatTaskAssignInline.vue` (raíz
  `relative` + panel absoluto + cierre por fuera/Esc). El `Popover` de reka-ui no se exporta de
  `@repo/ui`.
- Columnas persistidas **por vista**: `participant-columns-${viewName}` en localStorage
  (`participantStore.ts:262-323`); `getColumnSelection` hace merge agregando defaults nuevos
  (306-319) → agregar `cellPhone` al default de Palancas alcanza para que todos lo vean.

## Mensajería dependiente del teléfono

- Secuencias palanca: pasos `PALANCA_REQUEST/REMINDER` a `emergencyContact1/2`
  (siembra `20260612130000_CrmSequencingSchemaAndSeed.ts:125-128`); resolución
  `messageSequenceService.ts:610-625`; **snapshot** `sm.resolvedContact` al encolar (:1285) —
  los pasos ya encolados NO se re-resuelven (decisión: fuera de alcance).
- `PALANQUERO_NEW_WALKER` con `{participant.cellPhone}`
  (`20260914120000_FormatWhatsappMessageTemplates.ts:156-162`).
- Envío manual `MessageDialog.vue` ofrece `cellPhone` y `emergencyContact{1,2}*` como destino
  (661-674).

## RBAC

- `participant:update`: superadmin, admin, treasurer, logistics, communications (siembra
  `20250910163337_CreateSchema.ts`). Sin él: `regular_server`, `regular`, `region_admin`.
- El frontend no oculta el lápiz de edición por permiso ( ParticipantList.vue:1950); el editor
  nuevo sí debe gatearse (R8/CA12).
- Gate de permisos en frontend: `useAuthPermissions().hasPermission` (usarlo en el editor).

## Tests

- Jest del API: suites de services/controllers en `apps/api/src/tests/`. Una corrida a la vez
  (SQLite compartida). La DB de test enforcea FKs.
- Vitest del web con mocks globales en `apps/web/src/test/setup.ts` (`@repo/ui`, lucide,
  vue-router, vue-i18n, axios): el mock de `@repo/ui` acepta cualquier prop — para contratos,
  importar el componente real por ruta (molde `apps/web/src/test/repoUiToggleApi.test.ts`).
- Vistas con `onMounted` async: `flushPromises`, no `nextTick`.
