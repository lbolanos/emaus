# Shirt Types System

Per-retreat configurable shirts/jackets that participants (especially servers) can request when registering.

## Why per-retreat

Shirt styles vary by country and region. Mexico uses "Blanca con rosa", "Blanca Emaus", "Azul" and "Chamarra". Colombia uses red shirts that Mexico doesn't. Hardcoding the three legacy fields (`needsWhiteShirt`, `needsBlueShirt`, `needsJacket`) couldn't represent that, so shirt types are now configured per retreat.

## Data model

### `retreat_shirt_type`

| column | type | notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `retreatId` | uuid FK → `retreat` | cascades on delete |
| `name` | varchar | display label, e.g. "Blanca con rosa" |
| `color` | varchar nullable | hex/css name for visual cue |
| `requiredForWalkers` | boolean | walker registration must pick a size |
| `optionalForServers` | boolean | server registration shows it as optional |
| `sortOrder` | integer | render order in the form |
| `availableSizes` | json text nullable | size codes accepted by this type, e.g. `["S","M","G","X","2"]` (Mexico) or `["S","M","L","XL","XXL"]` (Colombia). `null` means "any size accepted" (legacy/backward compat) |
| `createdAt` / `updatedAt` | datetime | |

### `participant_shirt_size`

Many-to-many between participants and shirt types.

| column | type | notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `participantId` | uuid FK → `participants` | cascades on delete |
| `shirtTypeId` | uuid FK → `retreat_shirt_type` | cascades on delete |
| `size` | varchar | any size code allowed by the parent shirt type's `availableSizes` (e.g. `S`, `M`, `G`, `X`, `2` for MX or `S`, `M`, `L`, `XL`, `XXL` for CO) |

Unique on `(participantId, shirtTypeId)` — at most one size per shirt type per participant.

## Default seeding

When a retreat is created (`retreatService.createRetreat`), `seedDefaultShirtTypes(retreatId)` inserts the four Mexican-style defaults:

| name | sortOrder | optionalForServers | requiredForWalkers | availableSizes |
| --- | --- | --- | --- | --- |
| Blanca con rosa | 1 | true | false | `S, M, G, X, 2` |
| Blanca Emaus | 2 | true | false | `S, M, G, X, 2` |
| Azul | 3 | true | false | `S, M, G, X, 2` |
| Chamarra | 4 | true | false | `S, M, G, X, 2` |

Idempotent: if any shirt types already exist for the retreat, the seeder is a no-op.

For other regions, edit each type's name and `availableSizes` in the admin UI. Example for Colombia: rename "Blanca con rosa" → "Roja" and set sizes to `S, M, L, XL, XXL`.

### Per-type sizes

Sizes live on each shirt type, not on the retreat — so within one retreat, "Chamarra" can use `S, M, L, XL` while "Playera" uses `XS, S, M, L, XL, XXL`. Sizes are stored as raw display strings (no separate code/label mapping); whatever you type is what registrants see and what gets persisted in `participant_shirt_size.size`.

When `availableSizes` is `null` (or `[]`), the size is accepted as-is without validation — preserves legacy data created before this column existed.

## Migrations

`apps/api/src/migrations/sqlite/20260425120000_AddRetreatShirtTypes.ts` — single migration that:

1. **Schema** — creates `retreat_shirt_type` (including the `availableSizes` text column) and `participant_shirt_size` tables, plus the indexes (`IDX_retreat_shirt_type_retreat`, `IDX_psize_participant`, `IDX_psize_shirtType`, `UQ_psize_participant_shirtType`).
2. **Permissions** — inserts `('shirtType','read',…)` and `('shirtType','manage',…)` into `permissions` (idempotent via `INSERT OR IGNORE`). Then seeds `role_permissions` rows so:
   - `shirtType:read` → `superadmin`, `admin`, `treasurer`, `logistics`, `communications`, `regular_server`.
   - `shirtType:manage` → `superadmin`, `admin`, `logistics`.
3. **Data seed** — the four Mexican-style default types for every existing retreat, each pre-filled with `availableSizes = ["S","M","G","X","2"]`.
4. **Legacy data migration** — for each participant, copies `needsWhiteShirt` → "Blanca con rosa", `needsBlueShirt` → "Azul", `needsJacket` → "Chamarra". `'null'` and empty values are skipped.

Legacy columns (`needsWhiteShirt`, `needsBlueShirt`, `needsJacket`) on `participants` are kept untouched for one release as a safety fallback. The `down()` undoes everything: drops the role-permission rows, deletes the `shirtType` permissions, drops the indexes and tables.

Earlier iterations split this work across two migrations (`20260425120000` for tables/seeds and `20260426120000` for the `availableSizes` column). They were folded into a single migration so a fresh restore from backup runs cleanly.

## API

All endpoints live under `apps/api/src/routes/shirtTypeRoutes.ts`. Authentication required.

| method | path | permission | purpose |
| --- | --- | --- | --- |
| `GET` | `/retreats/:retreatId/shirt-types` | `shirtType:read` | list types for a retreat |
| `POST` | `/retreats/:retreatId/shirt-types` | `shirtType:manage` | create a type |
| `PATCH` | `/shirt-types/:id` | `shirtType:manage` | update a type |
| `DELETE` | `/shirt-types/:id` | `shirtType:manage` | delete a type |

The public retreat endpoints (`GET /retreats/public/:id`, `GET /retreats/public/slug/:slug`) include `shirtTypes` in their response so the registration page can render the dynamic selectors without a separate fetch.

### Role assignments (seeded in the shirt-types migration)

| Role | `shirtType:read` | `shirtType:manage` |
| --- | --- | --- |
| superadmin | ✅ | ✅ |
| admin (retreat) | ✅ | ✅ |
| logistics | ✅ | ✅ |
| treasurer | ✅ | ❌ |
| communications | ✅ | ❌ |
| regular_server | ✅ | ❌ |
| public (no auth) | via `/retreats/public/:id` | — |

Treasurer and communications can see what's configured but cannot edit; their scopes (payments / message templates) don't include shirt configuration. Logistics owns the equivalent of inventory and shirts, so it gets full management.

### Submitting sizes

Both `POST /participants/new` and `POST /participants/confirm-registration` accept an optional `shirtSizes` array:

```json
{
  "shirtSizes": [
    { "shirtTypeId": "uuid-1", "size": "M" },
    { "shirtTypeId": "uuid-2", "size": "G" }
  ]
}
```

`size === "null"` and missing entries are filtered out before persisting. On `confirm-registration`, existing rows for the participant scoped to the retreat's shirt types are deleted and replaced (so re-confirmations overwrite, not stack).

## Admin UI

`apps/web/src/views/RetreatShirtTypesView.vue` (route `/app/settings/shirt-types`, sidebar entry "Tipos de playera"). Retreat-scoped via `useRetreatStore().selectedRetreatId`; reloads automatically when the user switches retreats in the sidebar.

Provides:

- Add a new type (name, color, sort order, walker-required flag, server-optional flag, available sizes).
- Edit any field of an existing type inline.
- Delete a type (cascades to `participant_shirt_size` rows).

**Color**: native HTML color picker swatch + hex display. Legacy named colors (`white`, `blue`, `navy`, …) are mapped to hex on render so existing rows show correctly. Saving with the picker persists hex.

**Sizes editor**: chips/bubbles. Each size is a removable pill; an inline input adds new sizes (`Enter` or `,` to commit, also flushes on blur and on Save). Three preset chips above each list — **México** (`S, M, G, X, 2`), **Colombia** (`S, M, L, XL, XXL`), **Internacional** (`XS, S, M, L, XL, XXL`) — apply the full set in one click. The active preset is highlighted in primary. Any list that comes from the server with `null`/empty falls back to México on load so the admin always sees a usable starting point.

**Save semantics**: clicking Guardar shows a toast like `Guardado · Blanca con rosa · Tallas: S, M, L, XL, XXL` so the admin can verify which sizes hit the DB. The local row is then synced to the server response. If a pending size was being typed in the chip input, it is auto-flushed before the request fires.

**Read-only mode**: when the current user lacks `shirtType:manage` (e.g. `treasurer`, `communications`, `regular_server`), the page renders an amber banner explaining the limitation; the "Agregar tipo" card and the per-row Guardar/Eliminar buttons are hidden via `v-if`; each existing row gets `pointer-events-none opacity-70` so the values are visible but un-editable. Permission gate uses `useAuthPermissions().hasPermission('shirtType:manage')`.

## Registration UX

- **Server registration** (`Step5ServerInfo.vue`): renders one `Select` per shirt type with `optionalForServers === true`, ordered by `sortOrder`. Each defaults to "No necesita". Sizes are mirrored into `formData.shirtSizes` for submission.
- **Walker registration** (`Step5OtherInfo.vue`): the single `tshirtSize` dropdown is now driven by the retreat's shirt types — picks the type marked `requiredForWalkers === true`, or the first by `sortOrder` if none is flagged. The dropdown shows the type's `availableSizes` and the field label includes the type name in parentheses ("Talla de playera (Blanca con rosa)"). If no shirt types are configured for the retreat, falls back to the Mexican defaults `['S','M','G','X','2']`.
- **Email-lookup confirm flow** (existing servers re-registering for a new retreat): a "¿Necesitas alguna playera o chamarra?" block shows the same selectors so servers can request additional shirts on top of what they already own.

The walker-side change relaxed the entity column type, the route's `participantSchema.tshirtSize`, and `step5WalkerSchema.tshirtSize` from the closed enum `'S' | 'M' | 'G' | 'X' | '2'` to plain `string` so any size configured by the admin is accepted. The `Participant.tshirtSize` SQL column was always `varchar` (no CHECK in the live DB), so no migration was required.

## Validation

`participantService.createParticipant` and `confirmExistingParticipant` validate every `{ shirtTypeId, size }` pair before persisting:

- The `shirtTypeId` must exist and belong to the target retreat.
- If the type has a non-empty `availableSizes`, `size` must be in the list. Otherwise (legacy `null`), any size string is accepted.

A failed check throws an error and rolls back the transaction. Useful: protects against a Colombian retreat receiving a Mexican-format size from a stale client.

The same logic is exposed as `validateSizesAgainstType(shirtTypeId, size): Promise<boolean>` for callers that want a non-throwing check.

### Update semantics (gotcha)

`updateShirtType` uses `repo.update({id}, partialFields)` rather than `repo.save(entity)`. TypeORM's change-detection on `simple-json` columns can miss array reference changes when the full entity is round-tripped from the client (with stringified `createdAt`/`updatedAt`), silently omitting the column from the generated SQL UPDATE. The whitelist-based update guarantees the configured fields actually persist. This was the root cause of a bug where the API returned the new sizes in the response but the DB stayed on the previous values.

## Touchpoints elsewhere

When walker shirts went per-retreat, several legacy hardcoded references were removed:

| File | Change |
| --- | --- |
| `apps/web/src/views/BagsReportView.vue` | Removed Mexican→International label map (`G→L`, `X→XL`, `2→XXL`). Bag count panel and per-row size badge show raw codes. Order list extended to handle MX + international codes; unknown codes are sorted alphabetically. |
| `apps/web/src/components/ParticipantList.vue` | The `tshirtSize` filter chip displays the raw code instead of going through the i18n options namespace. |
| `apps/web/src/components/FilterDialog.vue` | `tshirtSize` filter switched from a `select` with hardcoded `['S','M','G','X','2']` to free-text input. Sizes vary per retreat so the previous select was wrong for non-MX retreats. |
| `apps/web/src/components/BulkEditParticipantsModal.vue` | `tshirtSize` bulk-edit field switched from a `select` with `XS/S/M/L/XL/XXL` hardcoded to free-text. Admin types whatever code the target retreat uses. |
| `apps/api/src/services/participantService.ts` (`mapToEnglishKeys`) | Excel import no longer rejects sizes outside `['S','M','G','X','2']`. Trims and uppercases whatever the legacy `camiseta` column contains. |

Out-of-scope leftovers (intentional):

- `apps/api/src/migrations/sqlite/20250910163337_CreateSchema.ts:138` — initial-schema CHECK constraint on `tshirtSize` is not enforced in the live SQLite DB; rewriting requires recreating the table and is unnecessary.
- `apps/web/src/locales/{es,en}.json` `walkerRegistration.fields.tshirtSize.options.*` — translation keys still exist but no caller references them. Kept for now to avoid touching localization for a follow-up change.
- Frontend component tests for the chip editor, color picker, dynamic walker dropdown, and read-only gate — `apps/web` has no Vitest harness yet. Setting one up is a separate effort.

## Tests

`apps/api/src/tests/services/shirtTypeService.test.ts` — 21 tests covering:

- CRUD on shirt types (list/create/update/delete).
- Default Mexican-style seeding (4 types in correct order, idempotent, all marked `optionalForServers`).
- `availableSizes` column behavior: defaults when omitted, custom Colombian list, trimming/empty filtering, update.
- **Persistence across reload** — recreates a type, updates its `availableSizes`, then re-fetches via a separate call to confirm the change actually hit the DB (catches the `repo.save()` simple-json regression mentioned above).
- `validateSizesAgainstType` accept/reject paths and the legacy `null` fallback.

Run with:

```bash
pnpm --filter api test src/tests/services/shirtTypeService.test.ts
```

### Coverage gaps

The following are not covered automatically because the test infra doesn't support them cleanly today:

- **Migration permission seed** — the test setup uses `synchronize: true`, which auto-builds the schema from entity metadata and skips migrations entirely. Until the test harness can run real migrations, the role/permission seed is verified manually by inspecting `role_permissions` after `migration:run`.
- **Route permission gates** — the routes (`shirtTypeRoutes.ts`) wire `shirtType:read` and `shirtType:manage` through `requirePermission()` middleware. The middleware itself has its own coverage; the gate strings are a one-line config and not unit-tested per route.
- **Frontend permission UI** — `RetreatShirtTypesView.vue` hides Add/Save/Delete and renders a banner when `useAuthPermissions().hasPermission('shirtType:manage')` is false. The web app has no Vitest setup, so this is verified manually (sign in as `treasurer` or `regular_server`; banner appears, no edit buttons).

### Manual end-to-end verification

1. After `pnpm --filter api migration:run`, check perms:
   ```bash
   sqlite3 apps/api/database.sqlite "SELECT r.name, p.resource||':'||p.operation \
     FROM role_permissions rp JOIN roles r ON r.id=rp.roleId \
     JOIN permissions p ON p.id=rp.permissionId WHERE p.resource='shirtType' \
     ORDER BY r.id, p.operation;"
   ```
   Expected: superadmin/admin/logistics get both read+manage; treasurer/communications/regular_server get read only.
2. Edit "Blanca con rosa" sizes via the admin UI; toast confirms which sizes were persisted.
3. Reload the admin page — chips reflect what the toast reported.
4. Open the walker registration URL of the same retreat (or hard-refresh if already open) — dropdown shows the retreat's sizes.
5. Submit a registration — the walker's `tshirtSize` row reflects the chosen code.
6. Sign in as a `treasurer` — `/app/settings/shirt-types` shows the amber read-only banner; rows appear at 70% opacity, no Add card or Save/Delete buttons. Hitting `PATCH /shirt-types/:id` directly returns 403.
