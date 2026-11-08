# Tasks — Cartas de familias por email

> Estado al 2026-11-06: T1-T23 implementadas y verificadas (ver Reconcile en spec.md).
> IDs estables para referencias (convención del repo: si una tarea se divide, sufijo `T4b`,
> nunca renumerar).

## Fase 1 — API: esquema y gestión

- [x] T1 — Migration `20261105100000_CreateLetterMailboxes.ts` completa (columnas + índices +
      tablas + seed de permisos + down reversa), escrita entera antes del primer guardado.
- [x] T2 — Test de migration: instala en DB de test (down+up), verifica índices únicos parciales
      y grants a los 4 roles. (5/5 verde)
- [x] T3 — Entidades `letter.entity.ts` + `letterAttachment.entity.ts` + columnas/relación en
      `retreatParticipant.entity.ts`; registro en `database/config.ts` y `tests/test-setup.ts`.
- [x] T4 — Schemas zod en `packages/types/src/letter.ts` + `letter` en `RESOURCES`
      (`permissions.ts`) + acciones de audit `letter.*` en `audit.ts`.
- [x] T5 — Prefijo `letters/` en `config/env.ts` y `s3Service.ts` (S3_PREFIXES, PRIVATE_PREFIXES,
      uploadLetterAttachment) + `LETTER_WEBHOOK_SECRET`/`LETTER_MAILBOX_DOMAIN` en config.
- [x] T6 — `letterMailboxService.ts` (generateMailboxCode, activateMailboxesForRetreat,
      setMailboxEnabled, resolveMailbox) + test de servicio (10/10 verde).
- [x] T7 — `letterService.ts` (ingestLetter, listLetters, reviewLetter, markPrinted,
      getLetterDetail, getPrintBatch, getLetterRetreatId).
- [x] T8 — `letterRoutes.ts` + `letterController.ts` (un solo controller: mailbox handlers
      incluidos); montaje en `routes/index.ts`; test de controller (8/8 verde: 403 anti-IDOR en
      review, transiciones, print-mark + audit, wiring source-level de permisos).

## Fase 2 — API: webhook

- [x] T9 — `letterWebhookLimiter` en `rateLimiting.ts` (60/min por IP).
- [x] T10 — `letterWebhookRoutes.ts` + `letterWebhookController.ts` (constant-time secret sobre
      SHA-256, mapeo 404/401/413/400/503, dedupe 200).
- [x] T11 — CSRF-exempt + montaje en `routes/index.ts` (ANTES de shirtTypeRoutes: su blanket
      `router.use(isAuthenticated)` sin path se come lo montado después — bug encontrado por el
      test de wiring); parser 16 MB antes del global en `apps/api/src/index.ts`.
- [x] T12 — Test `letterWebhook.simple.test.ts` (9/9 verde): contrato completo + html→text sin
      tags + magic bytes (jpeg/png/gif/webp/heic/pdf/descartado) + wiring.

## Fase 3 — Web: bandeja

- [x] T13 — Funciones API en el servicio central de `apps/web` (`lettersApi`).
- [x] T14 — `letterStore.ts` (Pinia) + test (6/6 verde).
- [x] T15 — `LettersView.vue` (activación, resumen, filtros, lista, revisión, detalle sin
      v-html, badge no imprimible, marca impresa) + test de componente (6/6 verde).
- [x] T16 — `LettersMailboxDialog.vue` (tabla de buzones: copiar dirección, toggle).
- [x] T17 — Router (`retreats/:id/letters`, grupo retreats como santisimo) + Sidebar (ícono
      `Mail`, `'letter'` en PermissionType) + locales es/en + help docs es/en + helpIndex;
      `landingPublicContent.test.ts` verde (11/11).

## Fase 4 — Web: impresión

- [x] T18 — `printHtmlDocument` en `usePrintableDocument.ts`.
- [x] T19 — `lettersPrint.ts` (`buildLettersBodyHtml`) + test (8/8 verde).
- [x] T20 — Selector de alcance + botón Imprimir + markPrinted con toast en `LettersView.vue`.
      Verificado e2e contra el dist: ventana + autoPrint disparados y `printed: true` en las
      cartas del lote.

## Fase 5 — Web: difusión

- [x] T21 — `LettersShareDialog.vue` (mensaje por participante, Copiar, WhatsApp E.164, copia
      masiva). El test del CODE correcto vive en el e2e del navegador (dialog renderiza la
      dirección `carta.{CODE}@emaus.cc` por fila) y el store test cubre los datos.

## Fase 6 — Infra

- [x] T22 — `infra/workers/email-inbound/` (worker.js con postal-mime + wrangler.toml +
      package.json; setReject solo en 404/413 y pre-filtro `carta.`). NOTA de convención:
      se despliega con wrangler (necesita bundler para postal-mime), no vía cloudflare.tf
      como el failover worker (single-file).
- [x] T23 — `infra/README.md` §Email inbound: diagrama, contrato, checklist operativo y
      runbook (rotar secret, apagar catch-all, bucket policy Deny de `letters/`).

## Cierre

- [x] T24 — Verificación e2e contra el dist del worktree (criterios 1-7 de `spec.md`): curl
      completo (activate 62 buzones idempotente, webhook accepted, dedupe, 404, bandeja,
      review, print-mark, 401) + navegador (bandeja, dialog de buzones, detalle con foto,
      impresión con autoPrint y marca en DB, papel capturado). Evidencia en Reconcile.
- [x] T25 — `pnpm --filter api build` OK; dist arranca (ESM) y sirve; `grep __dirname
      dist/index.js` = solo el shim preexistente de index.ts:216.
- [x] T26 — API completa (2 shards): 342 suites / ~5024 tests verde. Web completa: 275
      suites / 3965 tests verde. Slice routes+migrations+controllers: 1 suite con 4 fallos =
      `invitationController` — el branch del worktree salió de origin/master (3 commits
      atrás de master local) y no trae el fix 129d0994 (mock de recaptcha); en master local
      pasa 16/16. Se resuelve al fusionar a master.
- [x] T27 — Reconcile en `spec.md` v1.1 + desviaciones corregidas en plan.md/tasks.md.
