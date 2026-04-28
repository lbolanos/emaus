# Angelitos (servidores parciales / `partial_server`)

## ¿Qué es un angelito?

Un **angelito** es un servidor que participa de forma parcial o simbólica en el retiro. Son personas que apoyan al equipo pero no pueden (o no necesitan) comprometerse con la agenda completa de un servidor regular.

Reglas de negocio:

- **No pagan** — no se les aplica el costo del retiro (se marcan automáticamente como becados).
- **No se asignan a mesa** — las mesas son para caminantes; los angelitos no aparecen en la asignación de mesas.
- **No se les asigna cama** — no se muestran en `BedAssignmentsView` ni se auto-asignan en backend.
- Sí reciben camisas / chamarra si aplica (los campos de Step 5 siguen disponibles).

Técnicamente, un angelito es un `Participant` con `type = 'partial_server'` e `isScholarship = true`.

## Modelo de datos

| Campo | Valor esperado |
|---|---|
| `Participant.type` | `'partial_server'` |
| `Participant.isScholarship` | `true` (forzado por backend) |
| `RetreatParticipant.type` | `'partial_server'` |
| `RetreatParticipant.roleInRetreat` | `'server'` (misma categoría que servidor) |

El enum vive en `packages/types/src/index.ts`:

```ts
type: z.enum(['walker', 'server', 'waiting', 'partial_server'])
```

## Cómo se registra

### A) Registro público nuevo (servidor sin historial)

1. El usuario entra a `/app/:slug/server`.
2. Escribe su correo en el lookup → "no encontrado" → formulario completo de 5 pasos.
3. En **Step 5 (Server Info)** aparece un checkbox en morado:
   > **Registrar como angelito** — Apoyo parcial: no se asigna a mesa ni cama, y no requiere pago.
4. Si lo marca, al enviar el payload lleva `type: 'partial_server'` e `isScholarship: true`.

Archivos:
- `apps/web/src/components/registration/Step5ServerInfo.vue` — checkbox.
- `apps/web/src/views/ParticipantRegistrationView.vue` — conversión `server → partial_server` en `onSubmit`.

### B) Registro por email encontrado (servidor que ya tiene historial)

1. El usuario escribe su correo y el sistema lo encuentra.
2. Aparece la pantalla "¿Eres tú, Juan Pérez?".
3. Arriba de los botones de acción aparece el **mismo checkbox "Angelito"**.
4. Si lo marca y confirma, `confirmExistingRegistration` envía `type: 'partial_server'`.

Archivo: `apps/web/src/views/ParticipantRegistrationView.vue` (`handleConfirmIdentity`).

### C) Importación / alta admin

Si un proceso externo (importación Excel, alta manual vía admin) manda `type: 'partial_server'`, el backend fuerza `isScholarship = true` automáticamente. No hay forma de crear un angelito sin beca.

## Defensa en profundidad (backend)

Dos puntos centralizan la regla de "angelito → beca":

### 1. `createParticipant` — entrada del flujo normal

`apps/api/src/services/participantService.ts` (al inicio de la función):

```ts
if (participantData.type === "partial_server") {
  participantData.isScholarship = true;
}
```

Cubre: registro público, alta admin, import Excel, reuso de participante por correo.

### 2. `confirmExistingParticipant` — flujo de email encontrado

`apps/api/src/services/participantService.ts`:

```ts
if (type === "partial_server") {
  existing.isScholarship = true;
}
await participantRepo.save(existing);
```

Cubre: confirmación de identidad desde el email lookup público.

### 3. Exclusión de cama/mesa (ya existente, se mantiene)

- `participantService.ts:1590-1594` — `assignBedAndTableToParticipant` NO se invoca si `type === 'partial_server'`.
- `BedAssignmentsView.vue` filtra por `type === 'walker'` o `type === 'server'` — los `partial_server` quedan fuera.
- Asignación de mesa solo lista `type === 'walker'`.

## UI y reportes

- **Sidebar** (`Sidebar.vue`): muestra el conteo de angelitos con badge morado (`bg-purple-500`).
- **PaymentsView**: al tener `isScholarship = true`, el `paymentStatus` de un angelito es `'paid'` y el `paymentRemaining` es 0 — nunca aparece como moroso.
- **BedAssignmentsView**: no aparecen en "Servidores sin cama".
- **Tables/Mesas**: no aparecen como candidatos.

## Tests

`apps/api/src/tests/services/angelitoScholarship.test.ts` — 8 tests:

1. `createParticipant` con `type='partial_server'` + `isScholarship=false` → persiste `isScholarship=true`.
2. `createParticipant` con `type='partial_server'` y sin `isScholarship` → persiste `isScholarship=true`.
3. `createParticipant` con `type='server'` → respeta el valor enviado (no auto-flagea).
4. Reuso por email + `type='partial_server'` → persiste `isScholarship=true`.
5. `confirmExistingParticipant` con `type='partial_server'` → setea `isScholarship=true`.
6. `confirmExistingParticipant` con `type='server'` → no altera `isScholarship`.
7. `confirmExistingParticipant` preserva `isScholarship=true` preexistente.
8. `confirmExistingParticipant` crea `RetreatParticipant` con `type='partial_server'` y `roleInRetreat='server'`.

Ejecución:

```bash
pnpm --filter api exec jest src/tests/services/angelitoScholarship.test.ts
```

## Verificación manual

1. `pnpm dev` → ir a `/app/<slug>/server`.
2. Llenar los 5 pasos, marcar **Angelito** en Step 5, enviar.
3. En la base (`apps/api/database.sqlite`), verificar: `type='partial_server'`, `isScholarship=1`.
4. En el sidebar, el badge "Angelitos" subió en 1.
5. Abrir `BedAssignmentsView`: el angelito NO aparece en la columna de servidores sin cama.
6. Abrir asignación de mesas: el angelito NO aparece como candidato.
7. Abrir `PaymentsView`: el angelito NO figura entre los morosos.
8. Repetir el registro con el mismo correo (flujo de email encontrado), marcar Angelito en la pantalla de confirmación → misma verificación.
9. Regresión: registrar otro servidor sin marcar angelito → debe quedar `type='server'` y recibir cama/mesa como antes.

## Decisiones y trade-offs

- **Coerción en backend** (no solo en frontend) para cubrir importación Excel y alta admin sin duplicar lógica.
- **Reutilizar `isScholarship`** en vez de agregar una columna `isAngelito` separada: el cómputo de pago ya respeta beca y la UI ya muestra correctamente a becados.
- **Step 5 visible con `props.type === 'server'`**: el checkbox vive en el formulario de servidor. La mutación `server → partial_server` ocurre solo al enviar, así el Step 5 no se oculta al marcar el toggle.
