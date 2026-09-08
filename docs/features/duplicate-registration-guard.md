# Public-registration guards

Three related rules enforced for public retreat registration.

## Rule 1 — No double registration per retreat

Within a single retreat, the same email can have **at most one active**
`RetreatParticipant` row (`isCancelled = false`), regardless of type
(`walker`, `server`, `waiting`, `partial_server`).

If the email already has an active row in the target retreat, a new public
registration is rejected with a localized Spanish error. If the previous row
is cancelled (`isCancelled = true`), re-registration is allowed.

## Rule 2 — No registration after the retreat has ended

If `retreat.endDate` is strictly before "today" (in the app's business
timezone), the retreat is **closed** and neither walkers nor servers can
register. Error: `"Este retiro ya terminó y no acepta nuevos registros."`
with code `RETREAT_CLOSED` → HTTP 400.

The frontend landing page (`/:slug`, `/:slug/server`,
`/register/:type/:retreatId`) also hides the "Register Now" CTA entirely
and replaces it with the `serverRegistration.retreatClosed` card when the
backend reports `isRegistrationClosed: true` on the public retreat endpoint.

## Rule 3 — A denied identity cannot claim someone else's email

Public registration identifies people **by email**: `createParticipant` reuses
the Participant that already holds the address and `Object.assign`s the new
form data over it. That is what makes re-registration work year after year,
but it also means a shared address hands one person's record to another.

It happens for real: an invitee's record gets captured with the inviter's
email (the inviter fills the form and there is no other address at hand).
When the inviter later registers with that address, the lookup screen offers
them the invitee's identity, and the two paths available were *«Sí, soy yo»* —
which registers them under the wrong name — and *«No, registrarme como nuevo»*,
which resubmitted the same email and **overwrote the other person's record**,
retreat history included. Neither outcome was correct.

So the client now states its intent. When the registrant answers "that's not
me", the submit carries `claimExisting: false`, and the backend rejects the
alta instead of taking over the record:

```json
{
  "message": "Ese correo ya pertenece al registro de otra persona. Usa un correo propio; si el registro es tuyo, regresa y confirma tu identidad.",
  "code": "EMAIL_BELONGS_TO_ANOTHER_PARTICIPANT"
}
```

When the flag is absent or `true` the behaviour is exactly the one described
in Rule 1 — re-registrations, Excel imports and admin flows are untouched.

**Trade-off:** two people who share one address can no longer both register
through this flow; the second needs an address of their own. Couple
registration uses a different endpoint (`/participants/couple/new`) and is
unaffected.

### Timezone handling

`retreat.endDate` is a DATE column (no time / no timezone). The "today" side
of the comparison is resolved in a **business timezone**, not UTC, to avoid
closing a retreat a few hours early for evening users in CDMX (UTC-6) or
keeping it open an extra day for users in Spain (UTC+1).

- Timezone source: `process.env.APP_TIMEZONE`, default `America/Mexico_City`.
- Helper: `isRetreatPast(endDate)` in `apps/api/src/services/participantService.ts`.
- `Intl.DateTimeFormat('en-CA', { timeZone }).formatToParts(new Date())`
  resolves "today" as YYYY-MM-DD in that timezone.
- `endDate` Date objects coming from TypeORM are read with UTC getters so
  the date component is preserved as stored, independent of the server's
  process timezone.

| Existing active `type`     | Group  | Error message                                                   |
| -------------------------- | ------ | --------------------------------------------------------------- |
| `walker`, `waiting`        | walker | `Este correo ya está registrado en este retiro como caminante.` |
| `server`, `partial_server` | server | `Este correo ya está registrado en este retiro como servidor.`  |
| unknown / `null`           | —      | `Este correo ya está registrado en este retiro.`                |

## Where the check runs

Defense in depth — backend is the source of truth, frontend adds an
early warning during the email-lookup step.

### Backend

`apps/api/src/services/participantService.ts`

- `isRetreatPast(endDate)` — timezone-aware comparison (see above).
- `assertRetreatAcceptsRegistrations(manager, retreatId)` — throws one of
  `RETREAT_NOT_FOUND`, `RETREAT_NOT_PUBLIC`, or `RETREAT_CLOSED` with a
  localized Spanish message.
- `assertNotDoubleRegisteredInRetreat(manager, participantId, retreatId)` —
  throws `ALREADY_REGISTERED_IN_RETREAT` if an active row exists.
- Called from:
  - `createParticipant` — first `assertRetreatAcceptsRegistrations`, then
    inside the reuse branch `assertNotDoubleRegisteredInRetreat`, both
    **before any `save`** so an existing `Participant.retreatId` and `type`
    are never overwritten.
  - `confirmExistingParticipant` — same order, both before `save`.
- `validateParticipant` (dry-run) surfaces the same error payload so the
  test-mode UI shows the retreat-closed reason without attempting a write.

`apps/api/src/controllers/participantController.ts`

- `createParticipant` and `confirmExistingParticipantEmail` map:
  - `ALREADY_REGISTERED_IN_RETREAT` (or legacy `message.includes('already exists')`) → **HTTP 409** with `{ message }`.
  - `RETREAT_CLOSED` / `RETREAT_NOT_PUBLIC` / `RETREAT_NOT_FOUND` → **HTTP 400** with `{ message, code }`.
- `createParticipant` also enforces Rule 3: it destructures `claimExisting`
  out of the body (so it never reaches the participant data) and, when it is
  `false`, looks the email up with `findParticipantByEmail`. A hit returns
  **HTTP 409** with `EMAIL_BELONGS_TO_ANOTHER_PARTICIPANT`. The check sits
  after reCAPTCHA and Zod validation and **before** the dry-run branch, so
  test mode reports the rejection instead of a valid registration.

`apps/api/src/controllers/retreatController.ts`

- `getRetreatByIdPublic` and `getRetreatBySlugPublic` include
  `isRegistrationClosed: boolean` (computed via `isRetreatPast`) so the
  frontend can hide the CTA without guessing from the raw `endDate`.

### Frontend

`apps/web/src/services/api.ts`

- `checkParticipantExists(email, recaptchaToken?, retreatId?)` passes
  `retreatId` as a query param when provided and returns the extended
  response shape described below.

`apps/web/src/views/ParticipantRegistrationView.vue`

- `handleEmailLookup` calls `checkParticipantExists(..., validRetreatId.value)`.
  If `registeredInRetreat === true`, it shows a destructive toast with
  `alreadyRegisteredMessage` (falling back to the matching i18n key) and
  does **not** advance the wizard nor pre-fill `formData.email`.
- `onSubmit` surfaces the 409 body via `error.response?.data?.message` so the
  walker flow — which has no email-lookup step — still gets the correct text.
- `handleDenyIdentity` (Rule 3) clears `formData.email` instead of pre-filling
  it with the address that belongs to someone else, toasts
  `emailLookup.deniedUseAnotherEmail`, and raises a `deniedIdentity` flag that
  makes `onSubmit` send `claimExisting: false`. The flag resets when the dialog
  reopens and after a successful alta.

`apps/web/src/components/registration/ServerRegistrationForm.vue`

- `checkEmail` passes `props.retreatId`. If `registeredInRetreat === true`,
  shows a destructive toast and keeps both the verification and new-registration
  forms hidden so the user can correct the email.

`apps/web/src/views/ParticipantRegistrationView.vue`

- Computes `isRegistrationClosed` from `retreatData.isRegistrationClosed`.
- When `true`: the landing card is replaced by a "retreat closed" message
  (title + description) — the CTA, bullet points, and subtitle are hidden
  entirely so the user never sees a disabled "Register Now" button.

i18n (`apps/web/src/locales/{es,en}.json`, under `serverRegistration.*`):

- `emailLookup.alreadyRegistered`
- `emailLookup.alreadyRegisteredAsWalker`
- `emailLookup.alreadyRegisteredAsServer`
- `emailLookup.deniedTitle`
- `emailLookup.deniedUseAnotherEmail`
- `retreatClosed.title`
- `retreatClosed.description`

## API contract

### GET `/api/participants/check-email/:email`

Query params:

- `recaptchaToken` (required) — reCAPTCHA v3 token.
- `retreatId` (optional) — when a valid UUID, the response includes
  retreat-scoped fields. Non-UUID values are ignored.

Response (all fields optional unless noted):

```jsonc
{
  "exists": true, // required
  "firstName": "Juan",
  "lastName": "Pérez",
  "message": "Se encontró un registro existente para ...",
  "registeredInRetreat": true, // only when retreatId was sent
  "registeredType": "walker", // walker|server|waiting|partial_server
  "registeredGroup": "walker", // walker|server
  "alreadyRegisteredMessage": "Este correo ya está registrado en este retiro como caminante.",
}
```

When `retreatId` is omitted or the Participant has no active row in that
retreat, the four retreat-scoped fields are omitted (or
`registeredInRetreat: false`).

### POST `/api/participants/new` — 409 response

```json
{ "message": "Este correo ya está registrado en este retiro como caminante." }
```

Same shape for `POST /api/participants/confirm-registration`.

### POST `/api/participants/new` — 409 response (email owned by someone else)

Body field `claimExisting: false` (optional; sent by the wizard after a
*«No, registrarme como nuevo»*):

```json
{
  "message": "Ese correo ya pertenece al registro de otra persona. Usa un correo propio; si el registro es tuyo, regresa y confirma tu identidad.",
  "code": "EMAIL_BELONGS_TO_ANOTHER_PARTICIPANT"
}
```

Returned for `dryRun: true` as well. Omitting the flag keeps the pre-existing
reuse behaviour.

### POST `/api/participants/new` — 400 response (closed retreat)

```json
{
  "message": "Este retiro ya terminó y no acepta nuevos registros.",
  "code": "RETREAT_CLOSED"
}
```

Also emitted for `RETREAT_NOT_PUBLIC` and `RETREAT_NOT_FOUND` with the
corresponding Spanish message.

### GET `/api/retreats/public/slug/:slug` and `/api/retreats/public/:id`

Adds `isRegistrationClosed: boolean` to the existing response shape.

## Testing

- `apps/api/src/tests/services/doubleRegistrationGuard.test.ts` — 14 tests
  covering the service helper, `checkParticipantExists` with/without
  `retreatId`, the group-mapping rules, the cancelled-row exemption, and
  both `createParticipant` and `confirmExistingParticipant` guard paths.
- `apps/api/src/tests/services/emailLookup.test.ts` — adds coverage for
  the controller: UUID-only `retreatId` forwarding, 409 mapping for the new
  error code, and retrocompat for the legacy `already exists` text.
- `apps/api/src/tests/controllers/claimExistingParticipant.test.ts` — 6 tests
  for Rule 3: the 409 and its code, that `createParticipant` is never reached,
  the dry-run rejection, a free email going through, that `claimExisting` does
  not leak into the participant data, and that omitting the flag keeps the
  reuse behaviour.
- `apps/web/src/views/__tests__/ParticipantRegistrationView.test.ts` — 3 tests
  for the deny path: the email is cleared, the submit is flagged, and the
  registrant is told to use their own address.

Run:

```bash
pnpm --filter api test -- src/tests/services/doubleRegistrationGuard.test.ts
pnpm --filter api test -- src/tests/services/emailLookup.test.ts
pnpm --filter api test -- src/tests/controllers/claimExistingParticipant.test.ts
pnpm --filter web test src/views/__tests__/ParticipantRegistrationView.test.ts
```

## Manual verification

Preparation: two public retreats `R1`, `R2`; email `test@x.com`.

1. Register `test@x.com` as walker in `R1` → 201.
2. Retry in `R1` as walker → toast "...como caminante"; wizard blocked.
3. Retry in `R1` as server → toast "...como caminante"; DB `type` unchanged.
4. Register `other@x.com` as server in `R1`; retry as walker → "...como servidor".
5. Force `type='waiting'` / `type='partial_server'` in DB → mapping is
   walker / server respectively.
6. With active row in `R1`, register in `R2` as server → succeeds; R1 intact.
7. Mark `R1` row `isCancelled=true` → re-register → succeeds.
8. `POST /confirm-registration` for an active email in `R1` → 409.
9. Raw `POST /participants/new` bypassing the lookup → 409 (defense in depth).
10. `GET /check-email/:email` without `retreatId` → legacy shape.
11. Rule 3: look up an email that belongs to another participant, answer
    *«No, registrarme como nuevo»* → the wizard opens with an **empty** email
    field and a toast asking for one of your own. Typing that same address
    again and submitting → 409 `EMAIL_BELONGS_TO_ANOTHER_PARTICIPANT`, and the
    other person's row is unchanged.

Useful SQL:

```sql
SELECT "participantId", type, "isCancelled"
FROM retreat_participants
WHERE "retreatId" = '<retreatId>';
```

## Non-goals

- No DB unique constraint was added. Enforcement is at the service layer so
  that cancelled rows (which remain in history) do not block re-registration.
- No schema migration.
- Admin import / bulk flows are not guarded here; they already use a
  different code path (`importParticipants`).
