# Checklist de videos tutoriales — canal "Emaús Retiros"

Plan de contenido para el canal de ayuda. Cada video se graba con el pipeline de
`apps/web/e2e/demo/` (skill **`demo-videos`**) y se publica con **`youtube-publishing`**.
Convención: ~1–3 min, en español, narrado, conduciendo la app real.

**Hechos: 7 · Pendientes: ~18**

---

## ✅ Publicados

- [x] **Cómo entrar a Emaús** (login / crear cuenta / Google / pedir acceso / roles) — https://youtu.be/Jh0LWC9wKvE
- [x] **Registro al retiro** (inscripción pública de caminante) — https://youtu.be/jQb3q-mUG-8
- [x] **Registro de servidor** (búsqueda por correo, angelito, horarios, camisetas) — https://youtu.be/2DGScPALLDY
- [x] **Dar acceso y roles** (ubicación en menú, solicitudes, permisos por rol, Asignación Rápida) — https://youtu.be/-5nbC10cPQg · _(borrar previos: yvNfMx8P5Ic, 0UpgoH21JY8)_
- [x] **Tareas Pre-Retiro** (checklist qué hacer y cuándo) — https://youtu.be/pPguV-Gg7Bs
- [x] **Minuto a Minuto** (agenda en vivo del retiro) — https://youtu.be/YYwjzHcumpA
- [x] **Crear y configurar un retiro** (casa/máximos, templates, publicar, finanzas, recuerdos) — https://youtu.be/XG3v2C7u9qo

---

## 🔴 P0 — Onboarding / dudas más frecuentes (hacer primero)

Cierran la confusión "cuenta de usuario vs. registro al retiro" que ya viene en los mensajes.

- [x] ~~**Registro de participante al retiro**~~ — publicado (arriba). *(+ video aparte de servidor.)*
- [x] ~~**Dar acceso y roles (para el dueño del retiro)**~~ — publicado (arriba).
- [ ] **Primeros pasos / tour general** — qué es la plataforma, navegación, selector de retiro, dónde está cada cosa.

## 🟠 P1 — Configuración y núcleo del retiro

- [x] ~~**Crear y configurar un retiro**~~ — publicado (arriba).
- [ ] **Casas y camas** — configurar habitaciones/camas de la casa (`houses`, `rooms`).
- [ ] **Caminantes** — alta, edición, importar/exportar Excel, colores familia/amigo (`walkers`).
- [ ] **Servidores** — alta y gestión de servidores (`servers`).
- [ ] **Asignación de camas** — flujo por edad/ronquidos/tipo de cama (`bed-assignments`).
- [ ] **Mesas** — asignar líderes y caminantes, evitar conflictos familia/amigo (`tables`).
- [ ] **Pagos** — registrar y dar seguimiento a pagos (`payments`).

## 🟡 P2 — Logística y features del retiro

- [ ] **Equipos de servicio y responsabilidades** — `service-teams`, `responsibilities`, `asignar-responsables`.
- [ ] **Inventario** — control de inventario del retiro (`inventory`).
- [ ] **Santísimo (guardias de adoración)** — armado del horario de guardias (`santisimo`).
- [ ] **Angelitos** — asignación de angelitos (`angelitos`).
- [ ] **Misa de clausura** — captura de iglesia + invitación a familiares (skill `closing-mass-church`).
- [ ] **Palancas** — gestión de palancas (`palancas`).
- [ ] **Camisetas y comida** — tipos de camiseta y reporte, comida (`shirts`, `food`).
- [ ] **Reportes y gafetes** — bolsas, medicinas, camisetas, gafetes (`*-report`, `walker-badges`).

## 🟢 P3 — Comunicación y comunidades (CRM)

- [ ] **Comunidades** — miembros, reuniones, asistencia (`communities`, `community-*`).
- [ ] **Secuencias y plantillas de mensajes** — automatización (`message-sequences`, `message-templates`).
- [ ] **Tablero de comunicación y seguimiento** — `communication-dashboard`, `follow-up`.
- [ ] **WhatsApp** — envío y administración (skill `whatsapp-admin`).

## 🔵 P4 — Vista del usuario / servidor

- [ ] **Mi agenda** — qué le toca a cada servidor (`my-schedule`).
- [ ] **Mis retiros y mi perfil** — `my-retreats`, `profile`, social.

---

## Notas de producción

- Al publicar cada uno: pegar la URL como link 📺 en su doc de ayuda (`apps/web/src/docs/es/<sección>.md`)
  para que aparezca en "Obtener ayuda para esta página".
- Generar miniatura a juego (estilo acuarela "Camino a Emaús") y subirla en Studio.
- Considerar una **playlist por prioridad** (Onboarding, Configuración, Logística, Comunicación).
- Fijar como **video destacado** del canal el de onboarding (P0) para nuevos visitantes.
