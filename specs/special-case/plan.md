# Plan: «Caso especial» del caminante

> SDD plan — versión 1.0 (2026-10-15). Cómo se implementa, por capas. El qué/por qué vive en
> `spec.md`; el estado verificado del código, en `research.md`.

## Diseño

Réplica del patrón `paysAtHouse`/`notes` (columnas per-retiro + virtuales hidratados en query
time), con la diferencia clave: los 3 campos viven bajo `SENSITIVE_HEALTH_FIELDS` y heredan
strip/403/ocultamiento en lugar de exponerse.

- Columnas: `retreat_participants.specialCase` (bool NOT NULL DEFAULT 0),
  `specialCaseCategory` (varchar NULL, `'room'|'health'|'other'`), `specialCaseNotes`
  (text NULL).
- Virtuales en `Participant` + `toJSON`. Sin cambios en `paymentStatus` ni finanzas.
- Escritura: `PUT /participants/:id` con `contextRetreatId` (camino de `paysAtHouse`); el 403 de
  salud del controller + el gate de ruta `participant:update` hacen el control de acceso.
- Lectura en bandeja/dashboard: computed client-side sobre el listado ya hidratado. Sin endpoint
  nuevo.

## Capa API (M1)

| Archivo | Cambio |
|---|---|
| `apps/api/src/migrations/sqlite/20261016120000_AddSpecialCaseToRetreatParticipants.ts` | NUEVO (timestamp del día real de M1, > `20261015120000`). Molde `20261015120000_AddPaysAtHouseToRetreatParticipants.ts`: un `PRAGMA table_info` + 3 guards → 3 `ALTER TABLE ADD COLUMN`. `down`: 3 DROP COLUMN. SQL plano, sin imports del workspace. |
| `apps/api/src/migrations/sqlite/20250910163337_CreateSchema.ts` | 3 columnas junto a `"paysAtHouse"` (~154). |
| `apps/api/src/entities/retreatParticipant.entity.ts` | 3 `@Column` tras `paysAtHouse` (~113), con comentario del régimen health. |
| `apps/api/src/entities/participant.entity.ts` | Virtuales `specialCase?`/`specialCaseCategory?`/`specialCaseNotes?` (~214) + `toJSON` (~560). |
| `packages/types/src/permissions.ts` | Los 3 en `SENSITIVE_HEALTH_FIELDS` + doc-comment (~47-57). |
| `packages/types/src/index.ts` | `participantSchema`: `specialCase: z.boolean().optional()`, `specialCaseCategory: z.enum(['room','health','other']).nullable().optional()`, `specialCaseNotes: z.string().nullable().optional()`. |
| `apps/api/src/services/participantService.ts` | (1) `PARTICIPANT_AUDIT_FIELDS` (~44) + comentario. (2) Overlay `findAllParticipants`: select (~813-844) + asignación (~858) — `specialCase ?? false`, categoría/nota solo si definidas (molde `notes` :894). (3) `updateParticipant`: destructure (~3020), `rpUpdates` (~3156), higiene `specialCase === false → category/notes = null` (molde beca :3157-3175), `oldAuditSnapshot` (~3136), virtuales del retorno (~3369). |
| `apps/api/src/services/participantRetreatHydration.ts` | Las 3 asignaciones en la rama rp (~73) y en la rama else (~119). |
| `apps/api/src/controllers/retreatParticipantController.ts` | Extender `stripHealthFromRetreatParticipants` (~33-41): además de `.participant`, borrar `specialCase*` del item rp (hueco de FR-4). |
| `participantController.ts` / `participantRoutes.ts` | **Sin cambios** — strip/403 heredan de `SENSITIVE_HEALTH_FIELDS`; la ruta ya gatea `participant:update`. |

## Capa Web (M3)

| Archivo | Cambio |
|---|---|
| `apps/web/src/components/ParticipantSpecialCaseToggle.vue` | NUEVO. Molde `ParticipantPaysAtHouseToggle.vue`; gates `participant:update` **y** `participant:health`. Al marcar abre `Dialog` de `@repo/ui`: 3 radios de categoría (obligatoria) + textarea nota (opcional) → `participantStore.updateParticipant(id, { specialCase: true, specialCaseCategory, specialCaseNotes?, contextRetreatId })` → refetch → `emit('saved')`. Desmarcar: botón directo con `confirm` i18n → `{ specialCase: false, contextRetreatId }`. |
| `apps/web/src/components/ParticipantList.vue` | Prop `inlineSpecialCaseBadge?: boolean` (`withDefaults`, default false) + badge `AlertTriangle` ámbar y el toggle en celda propia (nombre/apellido), gate `canViewHealthData`. NO tocar la rama `lastPaymentDate` (:1979). |
| `apps/web/src/views/PalancasView.vue` | Encender `inline-special-case-badge` junto a `inline-pays-at-house-toggle` (:31-33). |
| `apps/web/src/views/SpecialCasesView.vue` | NUEVO (bandeja; plantilla `WalkerView.vue`): computed `participants.filter(p => p.specialCase === true && p.type === 'walker' && !p.isCancelled)`; columnas nombre, teléfono, categoría (badge), nota; acciones: WhatsApp/tel + `MessageDialog` (reglas de frontend.md: hidratar del listado, montado sin `v-if`, `filters` reseteados) y quitar marca (reusa el desmarque del toggle). |
| `apps/web/src/router/index.ts` | Ruta `special-cases` hermana de `palancas` (~267): `meta: { requiresRetreat: true, requiresPermission: 'participant:health' }`. |
| `apps/web/src/components/layout/Sidebar.vue` | Ítem en `communications` tras `palancas` (~948): `permission: 'participant'`, `permissionOperation: 'health'`, ícono `Flag`. Badge contador en `ITEM_BADGE` (~468) si sale barato. |
| `apps/web/src/views/RetreatDashboardView.vue` | Tarjeta molde Palancas (:846-905): `v-if="dashSettings.visible.specialCases && hasPermission('participant:health')"`, count computed sobre `participants`, clicable → `special-cases`. |
| `apps/web/src/stores/dashboardSettingsStore.ts` | `'specialCases'` en `SectionKey`, `ALL_VISIBLE`, `ALL_EXPANDED`, `DEFAULT_ORDER` (antes de `palancas`). |
| `apps/web/src/locales/es.json` + `en.json` | Keys nuevas (ambos idiomas, obligatorio). |
| `apps/web/src/test/setup.ts` | `Flag` al allowlist de lucide. |
| `apps/web/src/docs/{es,en}/special-cases.md` | NUEVO, un .md por vista; edición breve de `palancas.md` y `retreat-dashboard.md`. |

### Keys de i18n

```
sidebar.specialCases                          "Casos especiales" / "Special cases"
specialCases.title                            "Casos especiales" / EN
specialCases.empty                            "No hay casos especiales marcados" / EN
specialCases.mark                             "Marcar caso especial" / EN
specialCases.markTitle                        "Caso especial" / EN
specialCases.markDescription                  "Cuéntale al coordinador qué necesita revisar de este caminante" / EN
specialCases.category                         "Categoría" / EN
specialCases.category.room                    "Habitación aparte" / EN
specialCases.category.health                  "Salud" / EN
specialCases.category.other                   "Otra" / EN
specialCases.notes                            "Nota (opcional)" / EN
specialCases.notesPlaceholder                 "p. ej. usa silla de ruedas, viaja con su mamá…" / EN
specialCases.confirmRemove                    "¿Quitar la marca de caso especial de {name}? Se borra el motivo." / EN
specialCases.remove                           "Quitar marca" / EN
specialCases.contact                          "Contactar" / EN
specialCases.count                            "{count} casos especiales" / EN
palancas.specialCase                          "Caso especial" / "Special case"
retreatDashboard.specialCases                 "Casos especiales" / EN
```

(los textos exactos en inglés se ajustan al glosario de `en.json` en M3)

## Tests (M2 backend, M3/M4 frontend)

- Backend NUEVO `tests/services/specialCaseWritePath.test.ts` (molde
  `paysAtHouseWritePath.test.ts`): marca con categoría escribe la fila del retiro de contexto y
  el retorno la refleja; desmarcado persiste false **y limpia categoría+nota**; payload sin los
  campos no borra (re-envío DTO); multi-retiro sin mezclar (molde `crossRetreatPayments`).
- Extender `tests/controllers/healthDataExposureGuards.test.ts`: GET lista/ficha strippa los 3
  sin health; PUT con cualquiera de los 3 sin health → 403 (incl. `specialCaseNotes: ''`);
  `/retreat-participants` sin las columnas (regresión del hueco FR-4).
- Extender `participantHealthAudit.test.ts`: diff registra marca/desmarca con categoría.
- Frontend: NUEVO `ParticipantSpecialCaseToggle.test.ts` (gates sin update/sin health, categoría
  obligatoria, payload con `contextRetreatId`, cancel no toca store, desmarque); NUEVO test de
  `SpecialCasesView` (filtro, quitar, contador); extender `Sidebar.test.ts` (ítem gated) y
  `ParticipantList.test.ts` (badge con/sin health).
- E2E NUEVO `apps/web/tests/e2e/special-case.spec.ts` (molde `pays-at-house.spec.ts`): overlay
  del GET → badge/bandeja/contador; diálogo → PUT abortado y payload asertado; quitar → PUT
  `{specialCase:false}`; sin persistir nada; login por UI con skip por respuesta del API.

## Verificación (M4)

Dev del worktree con `start-worktree-dev.sh` (puertos libres) + guion manual con persistencia
real (migración PRAGMA, marcar como communications, badge Palancas, bandeja, quitar, dashboard,
rol sin health, dos retiros) + e2e + suites api (2 shards secuenciales, `npx jest` directo) + web
+ `vue-tsc` + `pnpm --filter api build` + PR a master esperando checks verdes.
