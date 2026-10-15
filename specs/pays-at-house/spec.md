# Spec: estado de pago "Paga en la casa de retiro"

> SDD spec — versión 1.0 (2026-10-15). Estado: borrador para revisión de Leonardo (gate de M0:
> no se codea M1 sin visto bueno de las Decisiones de dominio).

**Branch**: `worktree-pays-at-house` (worktree `.claude/worktrees/pays-at-house`) ·
**Fecha**: 2026-10-15

## Problema

En Pagos › Saldos, todo participante con saldo se muestra "Pendiente" sin distinguir *por qué* no
ha pagado. Existe un caso frecuente y operativamente distinto: el caminante avisó que **pagará al
llegar el viernes a la casa de retiro**. Hoy ese acuerdo vive en la cabeza del coordinador y en
WhatsApp sueltos, y el sistema:

- le sugiere al tesorero mandar recordatorios de cobro a quien ya comprometió pagar el viernes
  (botón de recordatorio WhatsApp en Saldos);
- no le dice nada distinto a la recepción del viernes, que es justo donde ese caminante debe
  resolverse.

Quien suele enterarse primero es el **palanquero** (contacta al caminante antes del retiro). Los
palanqueros entran al sistema con **perfil comunicaciones**, rol que ya tiene `participant:update`
(`apps/api/src/migrations/sqlite/20250910163337_CreateSchema.ts:961`) y acceso a la vista Palancas
(`participant:read`).

## Decisiones de dominio (cerradas con Leonardo, 2026-10-15)

| # | Decisión | Valor |
|---|----------|-------|
| D-semántica | Naturaleza del estado | Valor nuevo del estado de pago que **sustituye visualmente a "Pendiente"**. NO es método de pago (no toca `payments.paymentMethod`), NO exime del cobro (a diferencia de la beca). Al registrar el pago queda `paid` solo, porque el estado es derivado. |
| D-canal | Cómo "dice" el palanquero | Acción rápida por fila en la **vista Palancas** (molde del ✏ de teléfonos, `specs/palancas-quick-phone-edit`), gate `participant:update`. El palanquero logueado con perfil comunicaciones la usa directamente. Sin cuentas nuevas ni links mágicos. |

Decisiones con default propuesto en esta versión (se confirman o corrigen en la revisión de este
spec):

| # | Decisión | Default propuesto |
|---|----------|-------------------|
| D1 | ¿A quiénes sustituye el estado? | A todo "Pendiente" con saldo: visible siempre que `paymentRemaining > 0` (cubre `unpaid` **y** `partial`). El monto pagado sigue visible en las columnas Pagado/Saldo. |
| D2 | Filtros y segmentos | Igualdad estricta: los filtros `unpaid` y `partial` dejan de matchear a los marcados; el pseudo-estado `owing` (saldo > 0) **los sigue incluyendo**. Cambio de membresía explícito para segmentos guardados vivos con `unpaid`. |
| D3 | Ciclo de vida de la marca | La marca **persiste** tras quedar `paid` (bool crudo, sin auto-clear ni jobs). Es auditoría de lo acordado; una marca stale es invisible (el getter solo la muestra con saldo > 0). |
| D4 | Interacción con beca | Sin error de validación: precedencia `scholarship` > `pays_at_house` en el getter + higiene al marcar beca (limpia la marca, espejo de la higiene de `scholarshipAmount`). La UI oculta la acción en becados. |
| D5 | Recordatorio WhatsApp de Saldos | Se **oculta** para marcados: la marca significa "no insista, paga el viernes". |
| D6 | Summary de Pagos | Sin cambio: siguen debiendo, no alteran `pazYSalvoCount` ni totales. |
| D7 | Recepción | Solo muestra el badge "Paga en la casa"; el toggle vive en Pagos y Palancas. |
| D8 | Naming | Columna/virtual `paysAtHouse`, valor `'pays_at_house'`; UI es "Paga en la casa" / en "Pays at the house"; emoji 🏠, color sky. |

## Objetivo

Que el sistema registre y comunique el acuerdo "pagará al llegar el viernes", marcado por el
palanquero o el coordinador, visible para tesorería y recepción, sin cambiar el cálculo de paz y
salvo ni los montos.

## Historias de usuario

- **HU-1 (palanquero, perfil comunicaciones)**: El caminante me dice que pagará al llegar; entro
  a Palancas, encuentro su fila y marco "paga en la casa" para que tesorería deje de insistirle.
- **HU-2 (tesorero)**: En Saldos veo "Paga en la casa" en vez de "Pendiente" para esos
  participantes, con su saldo intacto; el botón de recordatorio WhatsApp no me los ofrece.
- **HU-3 (coordinador)**: Puedo marcar/desmarcar lo mismo desde Saldos y desde el modal de pago,
  igual que la beca.
- **HU-4 (recepción, viernes)**: En Recepción el caminante marcado muestra el badge "Paga en la
  casa"; lo cobro con el botón Cobrar existente y queda "Pagado".
- **HU-5 (coordinador de secuencias)**: Puedo usar "Paga en la casa" como condición de paso de
  secuencia y como filtro/segmento, y evalúa igual que la lista de participantes.

## Requerimientos

- **FR-1** El estado `pays_at_house` se deriva en `Participant.paymentStatus`
  (`apps/api/src/entities/participant.entity.ts:499`) y se muestra solo si el participante tiene
  la marca `paysAtHouse` y saldo pendiente; beca gana; pagado/overpaid ganan sobre la marca.
- **FR-2** La marca vive per-retiro en `retreat_participants.paysAtHouse` (bool, default false),
  migrada con un solo archivo de migration reversible, SQL plano sin imports del workspace.
- **FR-3** La marca se escribe con `PUT /participants/:id` (`participant:update`,
  `contextRetreatId`), mismo camino que `isScholarship`; sin endpoint ni permiso nuevos.
- **FR-4** Superficies de escritura: toggle por fila en Saldos, botón en el modal de pago, acción
  rápida inline en la vista Palancas (gate `participant:update` vía `useAuthPermissions`) y
  checkbox en el diálogo Gestionar Palancas.
- **FR-5** Superficies de lectura: badge en Saldos (tabla + print + export Excel), badge en
  Recepción, estado en ParticipantList (Walkers/Servers/…), opción en FilterDialog, valor en
  `CONDITION_PAYMENTS` de secuencias, `getReceptionStats` expone el bool.
- **FR-6** Hidratación de la marca en los 4 puntos que computan `paymentStatus` fuera de la
  lista principal: `participantRetreatHydration`, overlay de `findAllParticipants` (select
  explícito), `evaluateFilters` (segmentos/condiciones) y `getReceptionStats`.
- **FR-7** i18n completo en `apps/web/src/locales/es.json` y `en.json`.
- **FR-8** Sin cambios en `computeCharges`, `paymentRemaining`, `chargeBreakdown`,
  `pazYSalvoCount`, tabla `payments` ni su CHECK.

## Criterios de aceptación (end-to-end)

1. Migración: tras arrancar el API, `paysAtHouse` existe en `retreat_participants` (PRAGMA) y una
   DB fresca creada desde `CreateSchema` también la tiene.
2. Saldos: participante con saldo, sin pagos → toggle casa → confirm → badge sky "Paga en la
   casa"; columnas Esperado/Pagado/Balance y el summary quedan idénticos (D6).
3. Marca con pago parcial → sigue "Paga en la casa" (D1); al pagar el total → "Paz y salvo".
4. Becado: la acción casa no aparece; si ya tenía marca, marcar beca la limpia (D4) y el estado
   es "Becado".
5. Recordatorio WhatsApp oculto para marcados (D5); visible de nuevo al desmarcar.
6. Palancas: usuario con perfil comunicaciones marca desde la fila; Saldos lo refleja sin
   recargar el mundo (refetch del store).
7. Recepción: badge + botón Cobrar; cobro completo → badge desaparece, totalPaid actualizado;
   borrar el pago → vuelve a "Paga en la casa" (la marca persistió, D3).
8. Filtro estado "Paga en la casa" (Saldos y FilterDialog) devuelve exactamente a los marcados
   con saldo; el segmento/condición `pays_at_house` evalúa en backend idéntico a la lista (D2);
   `owing`/Pendiente los incluye.
9. Participante en dos retiros: la marca es per-retiro, no se mezcla (overlay).
10. Regresión: sin marca, `paymentStatus` es byte a byte el de antes (test de regresión exacta).
11. `pnpm --filter api build` pasa (bundle ESM intacto) y las suites api/web en verde.

**Negativos** (lo que NO debe pasar):

- Marcar casa NO cambia esperado/saldo/summary/pazYSalvoCount.
- El filtro `unpaid` exacto NO matchea a un marcado sin pagos (D2).
- No aparece botón/acción nueva en Recepción para marcar (D7).

## Fuera de alcance

- Método de pago "en la casa" (no toca `paymentMethod` ni el CHECK de `payments`).
- Links mágicos por WhatsApp o cuentas/permisos nuevos para palanqueros.
- Auto-limpieza de la marca al pagar; jobs programados; contadores "pagan en casa" en el summary.
- Import/export Excel de la marca; mapeo en imports de participantes.
- Refactor de strings hard-codeados históricos (statusMap español de `ParticipantList`).
- Wizard público de registro: el caminante no se autodeclara "pago en la casa".

## Reconcile

(pendiente — se llena al cerrar la implementación, verificando cada CA contra lo hecho)
