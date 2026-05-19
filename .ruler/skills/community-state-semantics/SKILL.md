# Community member state semantics

**Cargar cuando** se toque `community_member.state`, se agreguen nuevos
estados, se cambien filtros de roster/asistencia/notificaciones, o se
revise por qué un miembro aparece (o no) en un listado.

## Regla #1 — `state` es marcador de seguimiento, NO permiso

`community_member.state` describe **dónde está el coordinador en el
follow-up con este miembro**, no si "puede" asistir o "tiene permiso".
Cualquier código que use el state como permiso está mal.

## Los 10 estados (a 2026-05-19)

### Estados "activos" — incluir en roster/asistencia/notificaciones

| Estado | Significado |
|---|---|
| `active_member` | Confirmado por el coordinador. Asume que vendrá. |
| `pending_verification` | Aún no contactado / por verificar. Se incluye en roster porque puede aparecer. |

### Declinaciones explícitas — excluir

| Estado | Significado |
|---|---|
| `far_from_location` | Vive lejos de la comunidad. |
| `no_answer` | No responde a comunicaciones. |
| `another_group` | Está en otro grupo de Emaús. |
| `no_time` | No tiene tiempo en este momento (declinación blanda). |
| `not_interested` | No le interesa. Definitivo. |

### Canales rotos / no contactar — excluir + SILENT

| Estado | Significado | SILENT |
|---|---|---|
| `wrong_contact_info` | Correo o teléfono inválido. No se puede contactar hasta que se corrija. | ✅ |
| `paused` | Pausa temporal (viaje, enfermedad, luto). | ✅ |
| `do_not_contact` | Lista negra explícita. | ✅ |

**SILENT** = `notifyMemberStateChange` corta sin mandar email cuando el
miembro pasa A este estado (canal roto, lista negra, o pausa interna no
debe disparar un email automático).

## Filtros canónicos

```ts
// Roster, asistencia, notificaciones masivas, próxima reunión para mensajes
where: { communityId, state: In(['active_member', 'pending_verification']) }
```

NUNCA usar `NOT IN [...]` con lista de declinados, porque al agregar un
estado nuevo "activo" en el futuro se rompería silenciosamente. Lista
positiva corta es la regla.

## SILENT_STATES (notify)

```ts
const SILENT_STATES = new Set(['wrong_contact_info', 'do_not_contact', 'paused']);
if (SILENT_STATES.has(newState)) return; // antes de cualquier sendEmail
```

## Excepciones documentadas

- `MyCommunitiesView` (frontend) filtra solo `active_member` porque la
  vista es desde la perspectiva del user (qué comunidades soy miembro
  confirmado), no del coordinador.
- `aiChatService` tools (`bulkAddCommunityMembers`, etc.) solo permiten
  agregar como `active_member | pending_verification`. Los demás son
  decisiones de seguimiento del coordinador manual, fuera del bot.

## Migration history

| Migration | Cambio |
|---|---|
| `20260108132921_CreateCommunityTables` | CHECK inicial: 4 estados (sin pending_verification). |
| `20260112200000_AddPendingVerificationToMemberState` | +pending_verification (5 estados). |
| `20260519100000_ExtendMemberStateValues` | +wrong_contact_info, no_time, paused, not_interested, do_not_contact (10 estados). |

Toda migration al CHECK requiere recreate-table → skill `sqlite-migrations`.

## Incidente histórico

2026-05-17 (`feedback_community_member_state_semantics`):
`getPublicAttendanceData` solo mostraba 11/62 miembros porque filtraba
solo `active_member`, dejando fuera los `pending_verification`. El
coordinador esperaba ver TODOS los del roster (activos + por contactar).
Fix: extender el `In(...)` a incluir `pending_verification`.
