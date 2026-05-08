# Incidente 2026-05-07 — pérdida silenciosa de community_member y community_meeting

## Resumen

La migration `AddPublicRegistrationToCommunity20260507120000` recreó
la tabla `community` para hacer `createdBy` nullable. Usó el patrón
estándar `CREATE new + COPY + DROP old + RENAME` y se intentó
proteger con `PRAGMA foreign_keys = OFF`, pero TypeORM corre cada
migration dentro de una transacción implícita. **SQLite ignora
silenciosamente el PRAGMA dentro de una transacción multi-sentencia.**

Resultado: el `DROP TABLE community` cascadeó por las FK
`ON DELETE CASCADE` de las tablas hijas y borró:

- 66 rows en `community_member` (62 de Buen despacho + 4 de Tlalpan)
- 8 rows en `community_meeting` (7 + 1)
- 2 rows en `community_admin` (los owners de cada comunidad)

No hubo error visible. El daño se descubrió cuando un usuario reportó
"antes había miembros, ahora no veo nada" 6 horas después.

## Cita técnica

> *"It is not possible to enable or disable foreign key support in the
> middle of a multi-statement transaction (when SQLite is not in
> autocommit mode). Attempting to do so does not return an error; it
> simply has no effect."*
>
> — https://www.sqlite.org/foreignkeys.html#fk_enable

## Recuperación

1. **Local**: existía `database.sqlite.backup-pre-community-public`
   tomado a las 11:25 (antes de correr la migration). Se hizo
   `ATTACH DATABASE` y se restauraron los rows con `INSERT OR IGNORE`
   filtrando por parents existentes.
2. **Producción**: el backup nightly comprimido
   (`backups/emaus_*.sqlite.gz`) ya tenía la migration aplicada y NO
   servía. La recuperación se hizo subiendo la BD local restaurada y
   aplicando una nueva migration con los datos embebidos como bind
   parameters (`RestoreCommunityChildrenInline20260507250000`).

## Por qué no se detectó antes

- La migration se commiteó y deployeó sin ningún test que validara que
  los `COUNT(*)` de las tablas hijas se preservaban.
- TypeORM no devuelve error, sólo "applied successfully".
- Las consultas que devuelven 0 rows se ven idénticas a "esa comunidad
  no tiene miembros todavía" — no hay alerta automática.

## Mitigaciones aplicadas

1. **Skill `sqlite-migrations`** (`.ruler/skills/sqlite-migrations/SKILL.md`)
   con el patrón seguro `transaction = false` + `PRAGMA foreign_keys = OFF`,
   plantilla de migration, requisitos de testing y receta de
   recuperación.

2. **Static guard test**
   (`apps/api/src/tests/migrations/sqliteSafePattern.simple.test.ts`)
   que escanea todas las migrations creadas a partir del 2026-05-07 y
   falla la build si una contiene `DROP TABLE` o `PRAGMA foreign_keys = OFF`
   sin `transaction = false`.

3. **Memoria persistente de Claude**
   (`~/.claude/projects/.../memory/feedback_sqlite_migration_recreate_table.md`)
   con un pointer en `MEMORY.md` para que cualquier sesión futura cargue
   el contexto del incidente sin tener que re-investigar.

4. **Migrations de fix** (idempotentes, todas en
   `apps/api/src/migrations/sqlite/2026050724*`):
   - `AddWalkerFollowupTemplates` — agrega 6 plantillas globales nuevas
     (un trabajo no relacionado, pero usa el patrón seguro como
     ejemplo de referencia).
   - `RestoreCommunityChildrenInline` — restaura los 76 rows
     embebidos. Skip silencioso si las communities target no existen.
   - `ImportGlobalTemplatesToCommunities` — copia globales activas
     no-SYS a cada comunidad existente. Idempotente.

## Cómo evitar repetirlo

Antes de aprobar / commitear cualquier migration en
`apps/api/src/migrations/sqlite/`:

1. ¿Hay `DROP TABLE` o `PRAGMA foreign_keys = OFF`? Entonces:
   - **Obligatorio** declarar `transaction = false` en la clase.
   - **Obligatorio** un test seed-and-verify que valide que las
     tablas hijas no caen a 0.
   - **Obligatorio** backup manual de `apps/api/database.sqlite` en
     local antes de correr.
2. ¿Es un INSERT/UPDATE/DELETE simple sobre tabla existente? Sin
   precauciones especiales (`INSERT OR IGNORE` para idempotencia es
   el patrón habitual).
3. **Nunca** asumir que `PRAGMA foreign_keys = OFF` funcionará. Si lo
   pones, declara `transaction = false` aunque "no lo necesites" —
   el guard test ya lo exige.

## Archivos relacionados

- `.ruler/skills/sqlite-migrations/SKILL.md` — guía completa.
- `apps/api/src/tests/migrations/sqliteSafePattern.simple.test.ts` — el guard.
- `apps/api/src/migrations/sqlite/20260507120000_AddPublicRegistrationToCommunity.ts` — la migration ofensora original (no se edita; ya corrió en todas las BDs).
- `apps/api/src/migrations/sqlite/20260507250000_RestoreCommunityChildrenInline.ts` — el fix.
