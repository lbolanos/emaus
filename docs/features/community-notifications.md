# Community Notifications

Sistema de notificaciones por email para el flujo de solicitudes públicas de unión a comunidades Emaús.

## Vista general

Cuando un visitante del landing público envía una solicitud para unirse a una comunidad (vía `PublicJoinRequestModal`), el sistema dispara **dos correos automáticos**:

1. **A los administradores de la comunidad** — para que sepan que hay una solicitud pendiente de aprobación.
2. **Al solicitante** — para confirmar que su solicitud fue recibida.

Ambos se ejecutan en **modo fire-and-forget**: si SMTP falla o si la red está caída, el miembro de todos modos se crea con `state='pending_verification'` y aparece en el panel admin para revisión manual.

## Flujo

```
Visitante envía form
  ↓
POST /api/communities/:id/join-public
  ↓
communityController.publicJoinRequest()
  ↓
  ├── verifyRecaptcha()
  ├── validar email + teléfono
  ├── checar duplicado (409 si ya es miembro)
  └── communityService.createPublicJoinRequest()
        ├── crear Participant (con datos mínimos N/A)
        ├── crear CommunityMember con state='pending_verification'
        └── notifyJoinRequest() ────► fire-and-forget
              ├── EmailService.isSmtpConfigured()? → si no, return silent
              ├── cargar CommunityAdmin[] active + role=owner|admin
              ├── enviar email a cada admin con datos del solicitante
              └── enviar email de confirmación al solicitante
```

Si **cualquier** paso del bloque `notifyJoinRequest` falla, el error se loguea pero el response al cliente sigue siendo `201 Created` con el miembro creado. Esto evita que problemas transientes de SMTP causen pérdida de datos (la solicitud queda guardada).

## Destinatarios

### Email a admins

Recibe el correo: todo `CommunityAdmin` que cumpla **TODAS** estas condiciones:

| Campo | Valor requerido |
|---|---|
| `communityId` | El de la comunidad solicitada |
| `status` | `'active'` |
| `role` | `'owner'` o `'admin'` |
| `user.email` | No vacío |

Los `viewer`, los pendientes (`status='pending'`) y los revocados (`status='revoked'`) **NO** reciben el correo.

### Email al solicitante

Se envía a `participant.email` si está presente.

## Contenido de los emails

### Para admins

- **Asunto:** `Nueva solicitud para unirse a {communityName}`
- **Cuerpo:**
  - Nombre completo del solicitante
  - Email del solicitante (clickable `mailto:`)
  - Teléfono (o `—` si no se proporcionó)
  - Recordatorio: el miembro fue agregado con estado `pendiente de verificación`

### Para el solicitante

- **Asunto:** `Recibimos tu solicitud — {communityName}`
- **Cuerpo:**
  - Confirmación con primer nombre
  - Nombre de la comunidad
  - Promesa de que los coordinadores se pondrán en contacto
  - Note: "si no enviaste esta solicitud, ignora este correo"

Ambos emails usan HTML inline con estilos básicos (sin imágenes, sin tracking pixels) para máxima compatibilidad con clientes de correo.

## Seguridad: prevención de XSS

Todos los campos provenientes del usuario (nombre, email, teléfono) pasan por un helper `escapeHtml()` antes de inyectarse en el template HTML del email:

```ts
function escapeHtml(value: string | null | undefined): string {
  if (!value) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

Esto previene XSS en clientes de correo que renderizan HTML. Por ejemplo, un input malicioso `<script>alert(1)</script>` aparece literal en el email como `&lt;script&gt;alert(1)&lt;/script&gt;` sin ejecutarse.

## Configuración requerida

El sistema requiere SMTP funcional. Variables de entorno en `apps/api/.env`:

```bash
SMTP_HOST=smtp.gmail.com           # o smtp.sendgrid.net, etc.
SMTP_PORT=587                       # 587 (TLS) o 465 (SSL)
SMTP_SECURE=false                   # true si usas 465
SMTP_USER=noreply@emaus.cc          # usuario SMTP
SMTP_PASS=xxxxxxxxxxx               # app password / API key
SMTP_FROM="Retiros Emaús <noreply@emaus.cc>"
```

El helper `EmailService.isSmtpConfigured()` verifica que existan `SMTP_HOST`, `SMTP_USER` y `SMTP_PASS`. Si alguno falta, las notificaciones se omiten silenciosamente con un `console.warn` (sin error al cliente).

## Archivos clave

| Archivo | Propósito |
|---|---|
| `apps/api/src/services/communityService.ts` | Método `notifyJoinRequest()` (orquesta la notificación) y `createPublicJoinRequest()` (lo invoca fire-and-forget) |
| `apps/api/src/services/emailService.ts` | `EmailService.sendEmail()`, `isSmtpConfigured()` |
| `apps/api/src/controllers/communityController.ts` | `publicJoinRequest()` — endpoint HTTP que dispara el flujo |
| `apps/api/src/tests/services/communityService.test.ts` | Bloque `describe('createPublicJoinRequest — notificaciones')` — 8 tests |

## Tests

```bash
pnpm --filter api test -- src/tests/services/communityService.test.ts
```

**Casos cubiertos:**

| Test | Verifica |
|---|---|
| `crea el miembro y dispara notificaciones a admins + solicitante` | Happy path completo (admin + solicitante reciben) |
| `escapa HTML del solicitante para prevenir XSS` | `<script>` se convierte en `&lt;script&gt;` |
| `NO falla la creación si la notificación falla` | Robustez del fire-and-forget |
| `envía solo el email al solicitante si no hay admins activos` | Comunidad sin admins → solo confirmación |
| `notifica a TODOS los admins activos` | Múltiples destinatarios |
| `omite admin sin email configurado` | Admin con `user.email = ''` no se incluye |
| `no crashea si la comunidad ya no existe al notificar` | Race condition con borrado de comunidad |
| `NO notifica a admins con status=pending o role=viewer` | Filtrado por status + role |

Los tests usan un mock de `EmailService` con bus observable en `globalThis.__sentEmails` (patrón estándar del proyecto para ESM experimental en Jest — ver `.ruler/AGENTS.md`).

## Patrón fire-and-forget

`createPublicJoinRequest` invoca `notifyJoinRequest` con `.catch()` sin `await`:

```ts
this.notifyJoinRequest(communityId, savedParticipant).catch((err) => {
  console.error('[communityService] notifyJoinRequest failed:', err);
});
return result; // Devuelve inmediatamente
```

**Por qué:**
- El usuario no debería esperar 1-3 segundos por SMTP antes de ver "solicitud enviada"
- Si SMTP falla, el miembro de todos modos quedó creado en BD
- Los admins pueden revisar la lista de pendientes manualmente como backup

**Tradeoffs:**
- Si SMTP falla, el solicitante recibe 201 pero los admins nunca se enteran por email (solo en panel)
- Para mayor garantía habría que usar una cola (Bull, BullMQ) y reintentos exponenciales — pendiente

## Decisiones de diseño

- **HTML inline en lugar de `MessageTemplate` row**: las plantillas son simples y específicas a este flujo. Crear un `MessageTemplate` añadiría complejidad sin beneficio inmediato. Si en el futuro se quiere permitir customización por comunidad, migrar.
- **Sin opt-out de admins**: todos los admins activos reciben siempre. Una preferencia "no me notifiques" requeriría una tabla nueva (`CommunityAdminPreferences`) o columna en `CommunityAdmin`. No implementado.
- **Sin batching / digest**: cada solicitud manda un email. Para comunidades con muchas solicitudes (>10/día), sería ruidoso. Se podría agregar un job diario que mande resumen, pero no aplica con el volumen actual.
- **Sin auditoría en `ParticipantCommunication`**: la tabla existe pero solo se usa para emails authenticated. Los emails public-flow no se registran (no hay un `participantId` con relación válida hasta después de crear).

## Auto-link de líder con su comunidad

Cuando alguien registra una comunidad públicamente (con `contactEmail`) y luego crea cuenta de usuario en el sistema con ese mismo email, el sistema vincula automáticamente al user como **owner** o **admin** de su comunidad — sin intervención manual del superadmin.

### Flujo híbrido (cubre ambos órdenes)

```
Caso A: Usuario se registra DESPUÉS de aprobación
─────────────────────────────────────────────────
1. Líder llena form en /registrar-comunidad → Community pending, contactEmail='leader@x.com'
2. Superadmin aprueba → status='active', superadmin=owner
3. Líder se registra como user → email='leader@x.com'
4. authController.register() → llama linkUserToContactCommunities(newUser)
5. Líder se vuelve admin de su comunidad (superadmin sigue siendo owner)

Caso B: Usuario se registra ANTES de aprobación
─────────────────────────────────────────────────
1. Líder llena form de comunidad → Community pending, contactEmail='leader@x.com'
2. Líder se registra como user → linkUserToContactCommunities lo conecta como owner
   (porque la comunidad pending NO tiene admin/owner todavía)
3. Superadmin aprueba → al ser wasPending, también busca contactUser → ya está vinculado, skip
4. Líder sigue como owner de su comunidad
```

### Reglas de asignación

| Estado comunidad | Tiene owner activo | Resultado |
|---|---|---|
| `pending` | No | Usuario = `owner` |
| `pending` | Sí | Usuario = `admin` |
| `active` | No | Usuario = `owner` |
| `active` | Sí (otro user) | Usuario = `admin` |
| `rejected` | — | No se vincula |

**No duplica:** si el user ya tiene un registro `CommunityAdmin` para esa comunidad, se omite.

**Case-insensitive:** la comparación `user.email` ↔ `community.contactEmail` ignora mayúsculas/minúsculas y espacios.

**Múltiples comunidades:** si el mismo email es `contactEmail` de varias comunidades, el user se vincula a todas.

### Email de bienvenida

Si SMTP está configurado, después del link se envía un email al usuario con la lista de comunidades a las que ahora tiene acceso. El HTML escapa nombre/displayName del usuario para prevenir XSS.

### Hooks

Dos puntos de entrada al helper `linkUserToContactCommunities(user)`:

| Trigger | Archivo / línea |
|---|---|
| Registro de usuario nuevo | `apps/api/src/controllers/authController.ts` — al final del `try` de `register()` |
| Aprobación de comunidad | `apps/api/src/services/communityService.ts` — dentro del `if (wasPending)` de `approveCommunity()` |

Ambos hooks son **fire-and-forget**: errores se loguean pero no rompen el flujo principal (registro de user o aprobación de comunidad).

### Tests

Bloque `describe('linkUserToContactCommunities')` en `apps/api/src/tests/services/communityService.test.ts` — **10 casos**:

| Test | Verifica |
|---|---|
| `asigna como owner cuando la comunidad está pending y sin owner` | Caso B paso 2 |
| `asigna como admin cuando la comunidad activa ya tiene otro owner` | Caso A paso 4 |
| `NO duplica si el usuario ya es admin de la comunidad` | Idempotencia |
| `NO vincula a comunidades con status=rejected` | Filtro de estado |
| `match case-insensitive entre user.email y community.contactEmail` | Normalización |
| `vincula a múltiples comunidades si el mismo email es contacto de varias` | Loop completo |
| `envía email de bienvenida cuando se vincula al menos una comunidad` | Notificación |
| `NO envía email de bienvenida si no se vinculó nada` | Sin spam vacío |
| `escapa HTML del displayName y nombre de comunidad en el email` | Anti-XSS |
| `approveCommunity también vincula al contactUser si existe` | Integración con flujo de aprobación |

## Posibles mejoras futuras

- **Email de aprobación**: cuando un admin aprueba/rechaza al miembro, enviar email al solicitante.
- **Cola de reintentos**: BullMQ + Redis para garantizar entrega bajo SMTP intermitente.
- **Preferencias por admin**: opt-in/opt-out por tipo de notificación.
- **WebSocket**: además del email, push en tiempo real al panel admin si está abierto.
- **Plantillas customizables**: cada comunidad puede personalizar el HTML.
