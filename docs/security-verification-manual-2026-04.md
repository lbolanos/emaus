# Verificación Manual — Remediaciones de Seguridad (Abril 2026)

Complemento a [`security-audit-2026-04.md`](./security-audit-2026-04.md). Este documento describe las pruebas manuales end-to-end que los tests unitarios no cubren, a ejecutar **antes de deploy** a producción.

| Prueba | Remediación cubierta | Tiempo |
|--------|----------------------|--------|
| A-3 — XSS en flyer público | DOMPurify en `PublicRetreatFlyerModal` | ~3 min |
| M-1 — Autorización por retiro | `requireRetreatAccess` en reception + checkin + bag-made | ~7 min |
| **Total** | | **~10 min** |

---

## Setup (una sola vez)

```bash
cd /home/lbolanos/emaus
pnpm dev
```

- API: `http://localhost:3001`
- Web: `http://localhost:5173`

Login inicial (si la BD está recién seeded):
- email: `admin@example.com`
- password: `password`

> En un entorno con credenciales personalizadas, usa las tuyas. En producción nunca deberían ser las defaults (ver C-1 en `security-audit-2026-04.md`).

---

## Prueba A-3 — XSS almacenado en `paymentInfo`

### Objetivo
Verificar que un payload HTML hostil inyectado por un admin en el campo `paymentInfo` se sanitiza antes de renderizarse en el modal público del flyer.

### Paso 1. Inyectar el payload como admin

1. Login como admin en `http://localhost:5173`.
2. Navega a `/app/retreats` y abre (o crea) un retiro.
3. En el modal de edición, localiza el campo **Información de pago** (`paymentInfo`).
4. Pega exactamente:
   ```
   <img src=x onerror="alert('XSS pwned')">
   Línea segura: Banco BBVA
   Cuenta 1234 5678
   ```
5. Marca el retiro como **público** (checkbox `isPublic = true`).
6. Guarda.

### Paso 2. Abrir el flyer público sin sesión

1. Abre una **ventana de incógnito** (Ctrl+Shift+N / Cmd+Shift+N).
2. Ve a `http://localhost:5173/` (landing pública, **sin** `/app`).
3. Click en la tarjeta del retiro → se abre `PublicRetreatFlyerModal`.

### Paso 3. Verificar

**✅ Esperado:**
- No aparece ningún `alert()` del navegador.
- El texto `Línea segura: Banco BBVA` y `Cuenta 1234 5678` se ve con salto de línea.
- El `<img>` aparece sin atributo `onerror` (inspeccionar con DevTools → Elements) o como imagen rota.
- DevTools → Console: sin ejecución de script inyectado.

**❌ Fallo:**
- Salta el modal del navegador "XSS pwned" al abrir el flyer → la sanitización no funciona.

### Paso 4. Limpieza
Vuelve al admin y remueve el payload del campo `paymentInfo`.

---

## Prueba M-1 — Autorización scoped por retiro

### Objetivo
Verificar que un coordinador asignado al retiro A **no puede** leer ni modificar datos del retiro B, aunque tenga los permisos globales correctos.

### Paso 1. Preparar datos como admin

1. Crea **Retiro A Test** en `/app/retreats` → anota su UUID (`<idA>`, visible en la URL).
2. Crea **Retiro B Test** → anota su UUID (`<idB>`).
3. Crea usuario `coord@test.com` / `Test1234!` en `/app/admin/users`, **sin rol global** (o "viewer").
4. En el detalle del Retiro A, gestiona roles e invita a `coord@test.com` como `coordinator`. **No lo asignes al Retiro B.**
5. (Opcional) Crea un participante en el Retiro B y anota su `participantId` — necesario para el paso 4.

### Paso 2. Login como coordinador

1. Logout del admin.
2. Login como `coord@test.com`.
3. Abre DevTools → pestaña **Network**.
4. Navega a `/app/retreats/<idA>/reception` → debe cargar normalmente. Esto prueba el caso positivo.

### Paso 3. Acceso cruzado a reception del Retiro B (debe fallar)

En DevTools → Console:

```javascript
const csrf = document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? '';
fetch('/api/participants/reception/<idB>', {
  credentials: 'include',
  headers: { 'X-CSRF-Token': csrf }
}).then(r => console.log('GET reception B status:', r.status));
```

**✅ Esperado:** `status: 403`
**❌ Fallo:** `status: 200` — `requireRetreatAccess` no está aplicado a `getReceptionStats`.

### Paso 4. Check-in cruzado en participante del Retiro B (debe fallar)

```javascript
const csrf = document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? '';
fetch('/api/participants/<participantIdDeB>/checkin', {
  method: 'PUT',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrf
  },
  body: JSON.stringify({ retreatId: '<idB>', checkedIn: true })
}).then(r => console.log('PUT checkin B status:', r.status));
```

**✅ Esperado:** `status: 403`
**❌ Fallo:** `status: 200` — `requireRetreatAccess('retreatId', 'body')` no lee correctamente del body.

### Paso 5. Caso positivo (debe pasar)

Repite pasos 3 y 4 usando `<idA>` y un participante del Retiro A:

```javascript
fetch('/api/participants/reception/<idA>', {
  credentials: 'include',
  headers: { 'X-CSRF-Token': csrf }
}).then(r => console.log('GET reception A status:', r.status));
```

**✅ Esperado:** `status: 200` en ambas. Confirma que el middleware no es demasiado restrictivo.

### Paso 6. (Opcional) Check bag-made cruzado

Si quieres verificar también el endpoint `PATCH .../bag-made`:

```javascript
fetch('/api/history/retreat/<idB>/participant/<participantIdDeB>/bag-made', {
  method: 'PATCH',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrf
  },
  body: JSON.stringify({ bagMade: true })
}).then(r => console.log('PATCH bag-made B status:', r.status));
```

**✅ Esperado:** `status: 403`

### Paso 7. Limpieza
Borra retiros de prueba y usuario `coord@test.com` desde el admin.

---

## Checklist de resultados

Antes de mergear/deploy marca cada línea:

- [ ] **A-3 paso 3:** no salta `alert`, HTML hostil sanitizado en flyer público
- [ ] **M-1 paso 3:** `GET /participants/reception/<idB>` como coord → `403`
- [ ] **M-1 paso 4:** `PUT /participants/.../checkin` con `retreatId=<idB>` → `403`
- [ ] **M-1 paso 5:** mismas llamadas con `<idA>` → `200` (no falsos positivos)
- [ ] **M-1 paso 6 (opcional):** `PATCH .../bag-made` cruzado → `403`

Si los 4 primeros dan ✅, las remediaciones están verificadas end-to-end.

---

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---------|---------------|-----|
| `GET /reception/<idB>` devuelve `401` en vez de `403` | Sesión expiró o no llegó la cookie | Re-login del coord en la misma ventana |
| Los fetch fallan con CORS | `credentials: 'include'` mal o CSRF roto | Verificar que la cookie `csrf_token` existe en Application → Cookies |
| `alert` sí salta en paso A-3/3 | DOMPurify no está cargado o el computed no se usó | `git log --oneline` debe incluir `1573d63` con cambios en `PublicRetreatFlyerModal.vue` |
| `status: 200` en paso M-1/3 | Middleware no se agregó a la ruta | `grep requireRetreatAccess apps/api/src/routes/participantRoutes.ts` debe mostrar 2+ líneas |
| Todo funciona pero quieres re-verificar | Reinicia API: `pkill -f "apps/api" && pnpm dev` | |

---

## Ver también

- [`security-audit-2026-04.md`](./security-audit-2026-04.md) — hallazgos completos y remediaciones
- `apps/api/src/tests/security/securityAuditApril2026.test.ts` — 29 tests unitarios complementarios
