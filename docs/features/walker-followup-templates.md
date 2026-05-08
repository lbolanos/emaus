# Plantillas de seguimiento de caminante (cuarto día)

Conjunto de plantillas globales para acompañar al caminante después del
retiro. Se introducen como tipos `WALKER_FOLLOWUP_*` y
`WALKER_REUNION_INVITATION` en el enum `GlobalMessageTemplateType`, y se
copian a cada comunidad existente al desplegar.

## Tipos disponibles

| Type | Cuándo se envía | Plantilla por defecto |
|---|---|---|
| `WALKER_FOLLOWUP_WEEK_1` | A los 7 días post-retiro | "Seguimiento Caminante - 1 Semana" |
| `WALKER_FOLLOWUP_MONTH_1` | Al primer mes | "Seguimiento Caminante - 1 Mes" |
| `WALKER_FOLLOWUP_MONTH_3` | A los 3 meses | "Seguimiento Caminante - 3 Meses" |
| `WALKER_FOLLOWUP_MONTH_6` | A los 6 meses | "Seguimiento Caminante - 6 Meses" |
| `WALKER_FOLLOWUP_YEAR_1` | Al primer aniversario | "Seguimiento Caminante - 1 Año" |
| `WALKER_REUNION_INVITATION` | Para invitar a una reunión específica | "Invitación a Reunión de Comunidad" |

Las plantillas son texto base con variables (`{participant.firstName}`,
etc.) que el `MessageDialog` resuelve antes de enviar. Pueden editarse
por comunidad en `/app/communities/:id/templates`.

## Dónde viven los tipos

| Capa | Archivo |
|---|---|
| Schema (CHECK constraint) | `apps/api/src/migrations/sqlite/20260507240000_AddWalkerFollowupTemplates.ts` |
| Entity TypeORM | `apps/api/src/entities/globalMessageTemplate.entity.ts` (`GlobalMessageTemplateType`) |
| Zod schema compartido | `packages/types/src/message-template.ts` (`messageTemplateTypes`) |
| Traducciones | `apps/web/src/locales/{es,en}.json` → `messageTemplates.types.*` |

Si agregas un nuevo tipo, las cuatro capas deben actualizarse a la vez.
El test `apps/web/src/test/unit/i18nKeys.test.ts` verifica que la
traducción exista en ambos locales.

## Cómo se distribuyen a las comunidades

`20260507260000_ImportGlobalTemplatesToCommunities.ts` corre al
desplegar y, para cada comunidad existente, copia toda plantilla global
activa no-`SYS_*` que aún no esté creada en `message_templates` con
`scope='community'`. El criterio de "ya existe" es `(communityId, type)`,
así que si una comunidad editó su versión de `WALKER_WELCOME` la
migration NO la sobreescribe.

La importación es idempotente: correr la migration dos veces no duplica.
Para comunidades creadas DESPUÉS de la migration, se deben importar
manualmente vía la UI de `/app/communities/:id/templates → Importar
Plantillas` (o agregando un nuevo INSERT en una migration futura).

## Convenciones del mensaje base

- Tono cálido, primera persona plural ("te esperamos", "estamos aquí").
- Cierre estándar de Emaús: *"De Cristo Resucitado, ¡siempre!"*.
- Cada plantilla termina con una propuesta concreta de acción
  (orar, escribir a un compañero de mesa, asistir a la próxima reunión,
  pensar en servir, etc.) — el seguimiento sin acción tiende a quedarse
  en buenas intenciones.
- Las plantillas asumen contexto comunitario; para mensajes uno-a-uno
  o respuestas individuales, usar el modo "mensaje directo" del
  MessageDialog (ver
  [`direct-message-no-template.md`](./direct-message-no-template.md)).

## Tests

- `apps/api/src/tests/migrations/sqliteSafePattern.simple.test.ts`
  garantiza que la migration de seguimiento usa `transaction = false`
  porque hace recreate-table sobre `global_message_templates` para
  expandir el CHECK constraint.
- `apps/api/src/tests/migrations/importGlobalTemplatesToCommunities.test.ts`
  valida que la copia: (a) sólo toma activas no-SYS, (b) skipea cuando la
  comunidad ya tiene una plantilla del mismo type, (c) es idempotente.
- `apps/web/src/test/unit/i18nKeys.test.ts` valida que cada uno de los
  6 nuevos types tiene traducción en `messageTemplates.types` para
  ambos locales.
