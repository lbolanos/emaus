# Registration Flow

Public participant registration UX. Single Vue view, six steps, draft persistence, separate paths for walkers and servers.

## Entry points

| route | type | who |
| --- | --- | --- |
| `/register/:type/:retreatId` | walker / server | direct link with retreat id |
| `/:slug` | walker | retreat slug → walker landing |
| `/:slug/server` | server | retreat slug → server landing |

`ParticipantRegistrationView.vue` resolves the retreat by id or slug via `GET /retreats/public/:id` (or `/slug/:slug`) and reads `parish`, `flyer_options`, `shirtTypes`, and `isRegistrationClosed` from the response.

## Steps

| # | component | purpose |
| --- | --- | --- |
| 1 | `Step1PersonalInfo` | name, birth date, marital status, contact, occupation, **privacy notice** |
| 2 | `Step2AddressInfo` | full mailing address |
| 3 | `Step3ServiceInfo` | snoring, medication, dietary restrictions, sacraments (walker only), disability support |
| 4 | `Step4EmergencyContact` | two emergency contacts; only contact-1 required for walkers |
| 5 (walker) | `Step5OtherInfo` | t-shirt size (required, dynamic per retreat), invited-by, pickup info |
| 5 (server) | `Step5ServerInfo` | angelito toggle, dynamic shirt selectors |
| 6 | inline summary | review and submit |

### Validation

Each step has its own `zod` schema (`step1Schema`..`step5*Schema`); the `Next` button only advances when the current step parses cleanly. On submit, every step is re-validated in case fields were cleared after initial entry.

For servers and angelitos:

- Sacraments are pre-filled with `['baptism', 'communion', 'confirmation']` and the field is hidden (servers already walked, so they're assumed to have them). Validation is `optional()` for server types.
- Emergency contact 1 is optional. The route-level schema (`createParticipantSchema` in `@repo/types`) relaxes the strict requirement and only enforces it via `.refine()` when `type === 'walker'`.

## Email lookup (server only)

Server registration starts with an email lookup (`POST /participants/check`). Three outcomes:

1. **Already registered in this retreat** → toast error, can't proceed.
2. **Found in another retreat** → "confirm identity" screen (avatar + name + email). On confirm, calls `POST /participants/confirm-registration` with `{ email, retreatId, type, shirtSizes }`. The backend creates a `RetreatParticipant` row, updates the participant's primary `retreatId`, replaces shirt sizes scoped to this retreat's shirt types, and emails the welcome message. Skips the full form.
3. **Not found** → falls through to the regular six-step form with email pre-filled.

The angelito toggle and shirt selectors appear in the confirm screen too, so existing servers can mark themselves as angelito and request additional shirts without re-entering their data.

## Draft persistence

Form data is auto-saved to `localStorage` under `registration-draft:{type}:{retreatId-or-slug}` on every keystroke and step change. Restored automatically when the dialog reopens (toast notifies the user). Cleared on successful submit. Discarded after 7 days. `acceptedPrivacyNotice` is stripped before saving — users must re-accept on each session.

## UI affordances

- **Visual progress bar** + step indicator with click-to-jump for completed steps.
- **Slide-fade transition** between steps (180ms).
- **Pill toggles** for yes/no questions, **chip selectors** for multi-select (sacraments, disability support).
- **Card-style** privacy notice / angelito / "arrives on own" toggles — the entire block is clickable.
- **Per-retreat shirt sizes**: walker and server dropdowns render the codes configured by the retreat's admin (Mexican `S/M/G/X/2`, Colombian `S/M/L/XL/XXL`, etc.). See `shirt-types.md` for details. The walker dropdown is driven by the first shirt type marked `requiredForWalkers=true`, falling back to the first by `sortOrder`.
- **Defensive privacy stamp**: `acceptedPrivacyNotice` is forced `true` and `acceptedPrivacyNoticeAt` is timestamped at submit time (after step 1 already validated the literal `true`), so the route validator and audit log get a consistent body even if reactivity / draft restoration intermediated.
- **Test mode**: append `?test=true` to the URL for dry-run validation (no DB writes, no email).

## Submission

`participantStore.createParticipant(data, recaptchaToken, dryRun?)` posts to `/participants/new`. The `data` object includes `shirtSizes: { shirtTypeId, size }[]` when present. Server-side, `participantService.createParticipant` saves the participant and any shirt sizes inside a single transaction.

## Tests

- `apps/api/src/tests/services/shirtTypeService.test.ts` — shirt type CRUD, default seeding, `availableSizes` validation, persistence across reload (21 tests).
- `apps/api/src/tests/services/angelitoScholarship.test.ts` — partial_server auto-scholarship rule (pre-existing).
- `apps/api/src/tests/services/emailNormalization.test.ts` — case-insensitive email lookup (pre-existing).

The shirt-size validation that runs inside `participantService.createParticipant` and `confirmExistingParticipant` is covered indirectly through `validateSizesAgainstType` (called from both flows). Direct integration tests of those flows aren't possible right now because `apps/api/src/tests/services/participantService.test.ts` is `describe.skip`'d due to a known TypeORM metadata caching issue documented in that file.
