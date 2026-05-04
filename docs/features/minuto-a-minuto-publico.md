# Vista pública del Minuto a Minuto (📺 big-screen)

URL: `/mam/<slug-del-retiro>`. Auth-less. Diseñada para proyectar la agenda del retiro en el salón o para que servidores sin cuenta la abran en su celular vía QR.

## Para el coordinador

1. En la vista del Minuto a Minuto, click en `📺 Pantalla pública` — copia el link al clipboard.
2. Pegar en el navegador del proyector / smart TV / celular del responsable de logística.
3. **WebSocket en vivo**: cuando el coordinador clickea ▶/✓/±5, la vista pública lo refleja en ~100ms. Polling cada 60s como fallback. El indicador "● en vivo" verde confirma la conexión WS.

**Requisitos del retiro:**
- `isPublic = true` (en "Editar retiro" → casilla "Retiro público").
- `slug` definido (se autogenera al marcar `isPublic`; si no hay slug el botón no aparece).

Si la URL se abre con un slug que no existe o de un retiro privado, la vista muestra "Este retiro no existe o no es público" — no se filtra nada.

## Qué se muestra

```
┌─────────────────────────────────────────────────────────┐
│ Parroquia Santa Cruz                                    │
│ Día 2 · sábado, 27 de abril · 14:30          AHORA      │
├─────────────────────────────────────────────────────────┤
│ ● AHORA · 14:00 – 15:00                                 │
│   Charla 4 — Confianza                                  │
│   🎤 Charlista: confianza · 📍 Capilla                  │
├─────────────────────────────────────────────────────────┤
│ A continuación                                          │
│ 15:00  +30m  Refrigerio        🎤 Comedor               │
│ 15:30  +60m  Dinámica de la pared                       │
│ 17:00  +150m Confesiones        🎤 Sacerdotes           │
│ 19:00  +270m Cena                                       │
│ 20:00  +330m Santísimo                                  │
└─────────────────────────────────────────────────────────┘
Completados hoy: 8 / 18
```

- Banner verde grande con el item AHORA + responsabilidad + ubicación
- Lista de los próximos 5 items con minutos relativos
- Conteo de completados/total del día

## Qué NO se muestra (PII stripping)

El payload del endpoint público excluye, por diseño:
- Emails / teléfonos / IDs de participantes
- Notas internas (`notes`, `palanquitaNotes`)
- Descripciones (`responsability.description`)
- IDs internos (responsabilityId, scheduleTemplateId, etc.)

Solo se exponen:
- Por retiro: `id`, `parish`, `startDate`, `endDate`
- Por item: `id`, `day`, `startTime`, `endTime`, `durationMinutes`, `name`, `type`, `status`, `location`, `responsabilityName`

## Para desarrolladores

### Endpoint

```
GET /api/schedule/public/mam/:slug
```

Auth: ninguna (registrado antes de `router.use(isAuthenticated)`). CSRF: exento (en la lista de `applyCsrfProtectionExcept` en `routes/index.ts`). Cache-Control: `public, max-age=10` (cubre el caso de muchos celulares en el salón refrescando al mismo tiempo).

Devuelve `404` si:
- No existe retiro con ese slug
- El retiro tiene `isPublic = false`

### Service

`retreatScheduleService.getPublicSchedule(slug)` en `apps/api/src/services/retreatScheduleService.ts`. JOIN con `responsability` para obtener el nombre canónico; mapea explícitamente solo los campos seguros.

### Frontend

- Ruta: `/mam/:slug` con `meta: { requiresAuth: false }` (`apps/web/src/router/index.ts`).
- Componente: `apps/web/src/views/PublicMinuteByMinuteView.vue`.
- WebSocket: `socket.emit('public:schedule:subscribe', slug, ack)`. Server valida `isPublic=true` → joins `public:retreat:<id>:schedule`. Eventos escuchados: `schedule:item-started`, `schedule:item-completed`, `schedule:updated`, `schedule:delay`. Started/completed parchean local; updated/delay disparan refetch.
- Polling fallback: `setInterval(refresh, 60_000)` corre en paralelo al WS para cubrir reconexiones y drift. Se detiene en `onUnmounted`.
- Cliente: `retreatScheduleApi.publicGetMam(slug)` en `apps/web/src/services/api.ts`.

### Lógica de derivación cliente

- **Día activo**: el día cuyo rango `[primer item, último item]` contiene `now`. Fallback: próximo día futuro si el retiro aún no empezó; último día si ya terminó.
- **Item AHORA**: prioriza `status === 'active'` (lo que el coordinador marcó con ▶); fallback al item cuyo slot temporal contiene `now`.
- **Próximos**: hasta 5 items pending/delayed cuyo `endTime > now`, ordenados por startTime, excluyendo el AHORA.

### Tests

`apps/api/src/tests/services/schedulePublicView.simple.test.ts` (12 tests):
- Public access guard (404 si no existe / no es público / 200 si lo es)
- PII stripping (notes, palanquitaNotes, description, IDs internos)
- Filtering & ordering (solo retiro matched, day ASC + startTime ASC)
- Payload shape (10 fields exactos por item, 4 fields por retreat, 5 status pasan)

## Operación durante el retiro

- **Modo proyector**: navegador en kiosk mode (Chrome `--kiosk --app=https://emaus.cc/mam/<slug>`). El WS empuja cambios en ~100ms; el polling cada 60s cubre reconexiones.
- **QR para servidores**: generar QR del link público (cualquier QR generator) y pegarlo en lugares visibles. Los servidores escanean y ven la agenda en su celular sin login.
- **No usar para coordinación activa**: la vista es solo lectura. Cualquier cambio se hace desde la vista autenticada.

## Limitaciones

- ~~No hay WebSocket~~ ✅ Ahora sí. Un coordinador iniciando un item con ▶ aparece en ~100ms en el proyector vía `schedule:item-started` mirroring al `publicScheduleRoom`.
- No hay paginación de días — todo el retiro completo se devuelve en un solo GET. Para retiros con 200+ items esto es ~50KB JSON, OK. Si crece más, considerar `?day=N`.
- Sin rate-limiting específico (usa el global de `apiLimiter`). Si se vuelve un vector de abuso, agregar limit por slug.
