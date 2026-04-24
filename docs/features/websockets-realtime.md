# WebSockets — Actualizaciones en tiempo real

Capa de `socket.io` que empuja actualizaciones desde la API a los clientes conectados, eliminando el polling HTTP. El primer consumidor es **RecepcionView** (tarea B-3); la infraestructura está diseñada para absorber el resto del "minuto a minuto" del retiro.

---

## Resumen

| Aspecto | Detalle |
|---------|---------|
| **Transporte** | `socket.io` v4 (fallback automático a long-polling) |
| **Path** | `/api/socket.io` (bajo el location `/api` de nginx) |
| **Auth** | Cookie de sesión (`emaus.sid`) reutilizando el middleware de Express + Passport |
| **Modelo de broadcast** | Rooms por retiro: `retreat:{retreatId}:reception` |
| **Acceso** | `authorizationService.hasRetreatAccess(userId, retreatId)` antes de unir a un room |
| **Archivos clave** | `apps/api/src/realtime.ts`, `apps/web/src/services/realtime.ts`, `apps/web/src/stores/receptionStore.ts` |

---

## Arquitectura

```
┌────────────────┐   wss (cookie auth)   ┌────────────────┐
│  Browser       │ ────────────────────▶ │  Express + IO  │
│  (Pinia store) │ ◀──── reception:* ──── │  (port 3001)   │
└────────────────┘                        └──────┬─────────┘
                                                 │ emit
                                                 ▼
                               ┌──────────────────────────────┐
                               │ participantService /          │
                               │ retreatParticipantController  │
                               └──────────────────────────────┘
```

- El cliente abre **una sola** conexión WebSocket por pestaña (singleton en `services/realtime.ts`).
- El cliente emite `reception:subscribe` con el `retreatId` actual; el servidor valida acceso y une el socket al room.
- Los servicios de dominio emiten eventos al room tras mutar el estado (`setParticipantCheckIn`, `updateBagMadeController`).

---

## Autenticación

El handshake reutiliza el pipeline de Express:

```ts
io.use(wrap(sessionMiddleware));
io.use(wrap(passport.initialize()));
io.use(wrap(passport.session()));
io.use((socket, next) => {
  if (socket.request.user?.id) return next();
  return next(new Error('unauthorized'));
});
```

- **No se usan tokens Bearer**: el cliente no maneja secretos, el navegador envía la cookie `emaus.sid` automáticamente con `withCredentials: true`.
- **CSRF no aplica a WS**: los canales salientes del cliente (check-in, bag-made) siguen siendo endpoints REST con CSRF; el socket es *read-only push* desde el servidor.

---

## Eventos

### Cliente → Servidor

| Evento | Payload | Respuesta (ack) |
|--------|---------|-----------------|
| `reception:subscribe` | `retreatId: string` | `boolean` — `true` si el usuario tiene acceso al retiro y se unió al room |
| `reception:unsubscribe` | `retreatId: string` | — |

### Servidor → Cliente

Todos los eventos se emiten al room `retreat:{retreatId}:reception`.

| Evento | Payload | Origen |
|--------|---------|--------|
| `reception:checkin` | `{ retreatId, participantId, checkedIn, checkedInAt: string\|null }` | `participantService.setParticipantCheckIn` |
| `reception:bag-made` | `{ retreatId, participantId, bagMade }` | `updateBagMadeController` |

---

## Uso en el cliente

```ts
// apps/web/src/views/RecepcionView.vue
import { useReceptionStore } from '@/stores/receptionStore'

const receptionStore = useReceptionStore()
let unsubscribe: (() => void) | null = null

onMounted(async () => {
  await fetchStats() // hidratación inicial
  unsubscribe = receptionStore.subscribeRealtime(retreatId.value, {
    onCheckin: () => fetchStats(),
    onBagMade: () => fetchStats(),
  })
})

onUnmounted(() => {
  unsubscribe?.()
})
```

`subscribeRealtime` se encarga de:
- Obtener (o crear) el socket singleton con `getSocket()`.
- Reenviar `reception:subscribe` tras cada reconexión (handler de `connect`).
- Registrar listeners filtrados por `retreatId` actual.
- Devolver un `unsubscribe` idempotente que sale del room, remueve listeners y limpia estado.

---

## Emitir desde el servidor

```ts
import { emitReceptionCheckin, emitReceptionBagMade } from '../realtime';

emitReceptionCheckin({
  retreatId,
  participantId,
  checkedIn: rp.checkedIn,
  checkedInAt: rp.checkedInAt ? rp.checkedInAt.toISOString() : null,
});
```

Los helpers son **no-op silenciosos** si `initRealtime` no fue llamado aún (importante para tests unitarios que cargan el servicio sin el servidor HTTP).

---

## Infraestructura

### Nginx

El reverse proxy ya propaga los headers WS (no requiere cambios):

```nginx
location /api/ {
  proxy_pass http://localhost:3001;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  ...
}
```

El endpoint `/socket.io` se sirve también desde `localhost:3001` y pasa por la misma regla de upgrade.

### PM2

No requiere modo cluster: `socket.io` corre en el mismo proceso que Express. Si en el futuro se escala a múltiples workers habrá que agregar un adapter (`@socket.io/redis-adapter`) para compartir rooms entre instancias.

### Costo

- Lightsail micro_3_0 (tarifa plana): **$0 adicional**.
- Una conexión WS idle consume ~10–50 KB; ~10 recepcionistas simultáneos ≪ 1 MB sobre 1 GB disponibles.
- El tráfico saliente **disminuye** vs. el polling de 30 s (que transfería la lista completa aunque nada hubiera cambiado).

---

## Agregar nuevos eventos

Cuando se extienda al "minuto a minuto" del retiro:

1. Declarar tipos y helpers en `apps/api/src/realtime.ts`:
   ```ts
   export function scheduleRoom(retreatId: string) {
     return `retreat:${retreatId}:schedule`;
   }
   export function emitScheduleUpdate(payload: ...) {
     io?.to(scheduleRoom(payload.retreatId)).emit('schedule:update', payload);
   }
   ```
2. Agregar un par `subscribe`/`unsubscribe` con el mismo patrón de `hasRetreatAccess`.
3. Emitir desde el servicio correspondiente después de persistir.
4. En el cliente, reutilizar `getSocket()` y crear un store análogo a `receptionStore`.

**Convención de naming**: prefijo por dominio (`reception:`, `schedule:`, `table:`…) para que los listeners sean selectivos y la superficie no se desborde.

---

## Tests

- **Unitarios**: `apps/api/src/tests/services/realtime.simple.test.ts` — cubre naming de rooms, no-op cuando no hay init, y routing a rooms correctos (socket.io mockeado).
- **Integración manual**:
  1. `pnpm dev`
  2. Login en dos navegadores distintos en el mismo retiro.
  3. Abrir `/app/retreats/:id/reception` en ambos.
  4. Hacer check-in en uno → el otro actualiza en <1 s (sin esperar 30 s).
  5. DevTools → Network → filtrar `WS` → verificar handshake `101` y frames `reception:checkin`.
  6. Activar modo avión y restaurar → la UI debe reconectar y re-sincronizar.

---

## Notas operativas

- **TTL de sesión**: 24 h (`maxAge` de la cookie). Si la sesión expira, el socket recibe un error en el handshake y cae silenciosamente; el polling inicial sigue funcionando pero las actualizaciones ya no llegan — redirigir al login es responsabilidad del interceptor HTTP.
- **Reconexión**: `socket.io-client` reconecta automáticamente con backoff exponencial. No implementar reconexión manual.
- **Múltiples pestañas**: cada pestaña abre su propia conexión (expected). El servidor los trata como sockets independientes unidos al mismo room.
- **Filtrado por `retreatId` en el cliente**: aunque el servidor ya hace broadcast por room, los listeners validan `event.retreatId === subscribedRetreatId` por si el usuario cambió de retiro sin desmontar el componente.
