# Aviso de privacidad y eliminación de datos (ARCO / GDPR)

## Motivación

La ley mexicana (LFPDPPP) y el GDPR europeo exigen que:

1. El titular **consienta** expresamente al tratamiento de sus datos personales.
2. El titular pueda **cancelar** (borrar) sus datos en cualquier momento sin trámites complejos.

Este documento describe cómo el sistema cumple ambos puntos.

## Flujo de consentimiento

### Formulario público

El primer paso (`Step1PersonalInfo.vue`) incluye un checkbox obligatorio:

> ☐ Acepto el aviso de privacidad y el tratamiento de mis datos personales. [Leer aviso de privacidad →]

- El enlace apunta a `/privacy` (componente `PrivacyPolicyView.vue`, i18n key `privacy.*`).
- El Step 1 valida con Zod: `acceptedPrivacyNotice: z.literal(true)`. No avanza sin aceptación.
- El backend también valida: `createParticipantSchema` lleva un `.refine(d => d.acceptedPrivacyNotice === true)` — una petición directa al API sin el flag es rechazada (400).

### Registro

`participantService.createParticipant` al guardar un nuevo participante:

- Persiste `acceptedPrivacyNoticeAt = new Date()` (timestamp de la aceptación).
- Genera `dataDeleteToken = crypto.randomBytes(24).toString('hex')` (48 caracteres hex, 24 bytes de entropía).

Si el email ya existe y el registro reusa el participante, solo se setea `acceptedPrivacyNoticeAt` si estaba vacío, y se genera `dataDeleteToken` solo si faltaba. Nunca se sobrescriben estos valores.

## Flujo de eliminación

### Correo dedicado

Tras el correo de bienvenida (`WALKER_WELCOME` / `SERVER_WELCOME`), el sistema envía un segundo correo usando la plantilla `PRIVACY_DATA_DELETE`. Contenido por defecto:

```text
Hola {participant.firstName},

... {participant.dataDeleteUrl} ...
```

La variable `{participant.dataDeleteUrl}` se resuelve a `${PUBLIC_WEB_URL|FRONTEND_URL}/eliminar-datos/<token>` en `packages/utils/src/index.ts` (función `buildParticipantReplacements`).

### Página pública de borrado

Ruta: `/eliminar-datos/:token` → `DataDeleteRequestView.vue` (sin auth).

Estados:

| Estado | Condición |
|---|---|
| `loading` | mientras se consulta `GET /participants/delete-data/:token` |
| `ready` | token válido, muestra nombre/email/retiro y botón de confirmación |
| `confirming` | usuario hizo click en "Eliminar", esperando respuesta |
| `deleted` | éxito — muestra mensaje de confirmación |
| `notFound` | token inválido, expirado, o participante ya anonimizado |
| `error` | error inesperado del servidor |

### Endpoint backend

- `GET /api/participants/delete-data/:token` — público, rate-limited (`publicParticipantLimiter`). Devuelve `{ firstName, lastName, email, retreatName }`. Valida formato del token (regex `^[a-f0-9]{48}$`).
- `POST /api/participants/delete-data/:token` — público, rate-limited. Ejecuta la anonimización.

### Anonimización (no borrado duro)

`anonymizeParticipantByToken` (en `participantService.ts`) **no borra la fila** del participante. En su lugar:

- Sobrescribe los campos PII con valores genéricos o nulos:
  - `firstName = '(eliminado)'`
  - `lastName = ''`, `nickname = ''`
  - `email = 'deleted-<id>@local'`
  - Todos los teléfonos, direcciones, contactos de emergencia, notas médicas, palancas, etc. → `''` o `null`.
- Setea `dataDeletedAt = new Date()`.
- Anula `dataDeleteToken = null` (el enlace deja de funcionar después de un click exitoso — el endpoint devuelve 404 si se reintenta).

**¿Por qué no hard delete?** Romper FK cascadas (pagos, asignaciones de mesa, cama, comunicaciones históricas) implicaría o perder datos financieros/operativos o implementar cascadas destructivas en toda la gráfica de entidades. La anonimización cumple el requisito legal (los datos personales ya no son identificables) preservando la integridad referencial.

La función es **idempotente**: un segundo POST con el mismo token devuelve `false` (endpoint responde 404) porque el token ya es `null` y/o `dataDeletedAt` está set.

## Esquema de base de datos

Tres columnas nuevas en `participants` (migración `20260423120000_AddPrivacyAndDataDeleteToParticipants.ts`):

| Columna | Tipo | Uso |
|---|---|---|
| `acceptedPrivacyNoticeAt` | `DATETIME NULL` | timestamp del consentimiento; null = no consentido (participantes antiguos o importados) |
| `dataDeleteToken` | `VARCHAR(64) NULL UNIQUE` | token hex de 48 chars; null tras anonimización |
| `dataDeletedAt` | `DATETIME NULL` | timestamp de anonimización; null = activo |

Índice único parcial sobre `dataDeleteToken` (solo filas donde no es null) para lookups rápidos sin colisiones.

### Backfill

La migración inicial ejecuta:

```sql
UPDATE participants SET dataDeleteToken = lower(hex(randomblob(24)))
WHERE dataDeleteToken IS NULL;
```

Todos los participantes existentes reciben un token retroactivamente, de modo que pueden ejercer su derecho de cancelación incluso si se registraron antes de esta feature.

## Plantillas de mensajes

Nuevo tipo: `PRIVACY_DATA_DELETE` (agregado en `packages/types/src/message-template.ts`, `messageTemplate.entity.ts`, `globalMessageTemplate.entity.ts`).

La migración `20260424130000_SeedPrivacyDataDeleteTemplate.ts`:

1. Recrea `global_message_templates` para relajar el `CHECK` constraint e incluir `PRIVACY_DATA_DELETE`.
2. Inserta **1 plantilla global** `PRIVACY_DATA_DELETE` — los retiros creados en el futuro la heredan automáticamente vía `GlobalMessageTemplateService.copyAllActiveTemplatesToRetreat` (llamado en `retreatService.createRetreat`).
3. Inserta **1 plantilla por retiro** existente, copiando el contenido global.

Los coordinadores pueden editar la plantilla por retiro en el admin (`/message-templates`). Las plantillas `WALKER_WELCOME` / `SERVER_WELCOME` **no se modifican** — el enlace de borrado se envía como correo separado.

## Configuración

### Variable de entorno

La variable `{participant.dataDeleteUrl}` usa:

1. `PUBLIC_WEB_URL` si está set.
2. Fallback a `FRONTEND_URL` (ya usado por el API para invitaciones, password reset, etc.).
3. Fallback final a `http://localhost:5173` (desarrollo).

En producción, asegurar que `FRONTEND_URL=https://<tu-dominio>` esté configurado en el `.env` del API — de lo contrario los correos saldrán con URLs a localhost.

## Seguridad

- **Rate limit**: tanto GET como POST usan `publicParticipantLimiter` (el mismo limit que `POST /participants/new`) para prevenir enumeración de tokens.
- **Validación de formato**: tokens que no matchean `^[a-f0-9]{48}$` devuelven 404 sin consultar la BD.
- **No reCAPTCHA**: el token ya actúa como capability — solo quien recibe el correo conoce la URL. Agregar reCAPTCHA añadiría fricción al usuario legítimo sin mejorar la seguridad significativamente (el rate limit es suficiente).
- **Token unguessable**: 192 bits de entropía (24 bytes de `crypto.randomBytes`) — fuera de alcance de fuerza bruta.
- **One-shot**: tras anonimización exitosa, `dataDeleteToken = null` y el endpoint devuelve 404 para cualquier reintento.

## Archivos clave

### Backend
- `apps/api/src/migrations/sqlite/20260423120000_AddPrivacyAndDataDeleteToParticipants.ts` — schema + backfill
- `apps/api/src/migrations/sqlite/20260424130000_SeedPrivacyDataDeleteTemplate.ts` — plantillas
- `apps/api/src/entities/participant.entity.ts` — columnas
- `apps/api/src/services/participantService.ts` — `createParticipant` (guarda consentimiento + genera token, envía correo privacy), `findParticipantByDeleteToken`, `anonymizeParticipantByToken`
- `apps/api/src/controllers/participantController.ts` — `getParticipantByDeleteToken`, `deleteParticipantByDeleteToken`
- `apps/api/src/routes/participantRoutes.ts` — rutas públicas
- `packages/types/src/index.ts` — `participantSchema`, `createParticipantSchema` con refine
- `packages/types/src/message-template.ts` — tipo `PRIVACY_DATA_DELETE`
- `packages/utils/src/index.ts` — variable `{participant.dataDeleteUrl}`, helper `getPublicWebUrl`

### Frontend
- `apps/web/src/components/registration/Step1PersonalInfo.vue` — checkbox
- `apps/web/src/views/ParticipantRegistrationView.vue` — validación en `step1Schema`
- `apps/web/src/views/DataDeleteRequestView.vue` — página de confirmación
- `apps/web/src/router/index.ts` — ruta `/eliminar-datos/:token`
- `apps/web/src/services/api.ts` — `getParticipantByDeleteToken`, `deleteParticipantByDeleteToken`
- `apps/web/src/locales/{es,en}.json` — strings `serverRegistration.fields.acceptedPrivacyNotice`, `privacyLinkText`, `dataDelete.*`

## Pruebas

Ubicación: `apps/api/src/tests/services/`

- `dataDeletePrivacy.simple.test.ts` — 8 tests:
  - `findParticipantByDeleteToken` devuelve info correcta / null para desconocido / null para ya anonimizado
  - `anonymizeParticipantByToken` sobrescribe PII, anula token, stampa timestamp
  - Idempotencia: segundo llamado retorna false
  - Validación de formato de token (accept/reject).
- `messageVariables.test.ts` — 3 tests nuevos:
  - Construye la URL desde `PUBLIC_WEB_URL`
  - Fallback a `FRONTEND_URL`
  - Cadena vacía cuando el participante no tiene token.

Ejecutar:

```bash
cd apps/api
NODE_OPTIONS="--experimental-vm-modules" npx jest src/tests/services/dataDeletePrivacy.simple.test.ts src/tests/services/messageVariables.test.ts
```

## Verificación manual end-to-end

1. `pnpm --filter api migration:run` — confirma migraciones aplicadas.
2. `pnpm dev` → abrir `/inscripcion/<retreatId>` (URL pública del retiro).
3. En Step 1, intentar avanzar sin marcar el checkbox → error.
4. Completar y enviar; verificar en `apps/api/database.sqlite`:
   ```sql
   SELECT acceptedPrivacyNoticeAt, dataDeleteToken FROM participants
   WHERE email = '<email>';
   ```
   Ambos poblados.
5. Revisar bandeja (o `SELECT * FROM participant_communications WHERE templateName LIKE '%privacidad%'`): llegó el segundo correo con la URL.
6. Visitar la URL → botón "Eliminar mis datos" → confirmar.
7. Verificar en BD: `firstName='(eliminado)'`, `dataDeletedAt` populated, `dataDeleteToken = NULL`.
8. Recargar la URL → página muestra "El enlace no es válido o ya fue utilizado".
