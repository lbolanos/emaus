# Crear retiro copiando de uno anterior

Al crear un retiro nuevo (Sidebar → **+** → modal), una card **"Copiar de un retiro anterior"**
permite elegir un retiro origen. Al elegirlo pasan dos cosas independientes:

1. **Prefill de escalares** (tab General): identidad (parroquia y número), comunidad, registro
   externo, casa, zona horaria, tipo, costos, métodos de pago, teléfonos de contacto, notas de
   apertura/cierre, qué llevar, iglesia de clausura, banderas de pareja/recogida y los flags del
   volante que maneja el modal (QRs, info de recogida). **Nunca** se copian: fechas (el retiro
   nuevo tiene las suyas), slug (se autogenera de parroquia+número) ni visibilidad — el retiro
   nuevo nace **Borrador** aunque el origen esté publicado. Los textos/bloques del volante
   (flyer editor) tampoco viajan: se editan por retiro.
2. **Pestaña "Copiar de…"** (solo visible con origen elegido): 9 secciones, **todas marcadas por
   defecto**, que se copian *después* de crear el retiro. Cada sección marcada **borra los
   defaults** con los que nace el retiro y los reemplaza con los del origen. Las desmarcadas
   dejan los defaults intactos.

## Las 9 secciones y qué copia cada una

| Sección | Copia | Deliberadamente NO viaja |
| --- | --- | --- |
| Mesas | Solo `name` (estructura) | Líderes, colíderes, caminantes, foto |
| Responsabilidades | Catálogo completo | `participantId` (queda sin responsable) |
| Minuto a minuto | Ítems re-anclados a las fechas nuevas (misma hora de pared en la TZ del retiro), `responsabilityId` remapeado por nombre, slots de Santísimo regenerados | `actualStart/EndTime`, responsables asignados |
| Tareas pre-retiro | Árbol raíz→hijos con `parentId` remapeado, `dueDate = startDate − dueOffsetDays` (el offset propio o el de su raíz) | `responsibleParticipantId`, estados (todo nace `pending`) |
| Inventario | `requiredQuantity`, notas, caja, ratios; filas ad-hoc | `currentQuantity` (nace **0**), `status` (nace `pending`) |
| Tallas de playera | Tipos y precios por talla (nuevos ids) | — |
| Plantillas de mensajes | Copia dentro del retiro nuevo (nuevos ids, `templateIdMap`) | — |
| Secuencias de mensajes | Secuencias y steps con `templateId` remapeado al `templateIdMap` | Envíos programados (`scheduled_messages` queda vacío), `segmentId` (por retiro), steps archivados |
| Equipos de servicio | name/tipo/descripción/instrucciones/prioridad/activo | Líder, miembros |

Casos borde que avisan por warning en el toast (y quedan en `warnings` de la respuesta):
`tallas` desmarcada con inventario marcado (filas shirt se saltan), `plantillas` desmarcada con
secuencias marcadas (steps quedan con `templateId` null), responsability sin nombre equivalente
en el destino, steps con segmento.

## Pieza por archivo

| Pieza | Archivo |
| --- | --- |
| Orquestador (orden, guardas, remaps, counts) | `apps/api/src/services/retreatCloneService.ts` |
| Clona MAM + regenera slots de Santísimo | `retreatScheduleService.ts` → `cloneScheduleFromRetreat` |
| Clona árbol de pretareas | `retreatPreRetreatTaskService.ts` → `cloneFromRetreat` |
| Endpoint `POST /retreats/:id/clone-from` | `apps/api/src/controllers/retreatController.ts` + `routes/retreatRoutes.ts` |
| Schemas `cloneRetreatFromSchema` / `retreatCloneSectionsSchema` | `packages/types/src/index.ts` |
| UI (card origen, pestaña de secciones, interacción con templates) | `apps/web/src/components/RetreatModal.vue` |
| `createRetreat(data, { cloneFrom })`: POST + clon + toast con counts | `apps/web/src/stores/retreatStore.ts` |
| `retreatApi.cloneFrom` | `apps/web/src/services/api.ts` |

## Decisiones no obvias

- **El modal crea vía store, no vía `emit('submit')`.** El bloque post-create del modal (auto
  materialize, diálogo de éxito con enlaces de registro) estaba muerto: `const retreat = await
  emit('submit', …)` nunca devuelve nada (Vue descarta el retorno del handler) y los padres no
  retornaban el retreat. Ahora `handleSubmit` llama directo `retreatStore.createRetreat(…)` —
  que **retorna el retreat creado** — y ese bloque revive. Los padres (`Sidebar.vue`,
  `MyRetreatsView.vue`) ya no crean desde el handler.
- **Copiar agenda/pretareas apaga el import por template** de MAM/pretareas del propio modal
  (sería doble trabajo sobre lo mismo); al revés no.
- **Sin transacción global**: la copia es secuencial por sección, igual que `createRetreat`. Las
  guardas minimizan el daño: mismo id → 400, retiro inexistente → 404, destino con participantes
  activos → 409 (no se clona encima de un retiro con gente).
- **Orden fijo de secciones**: responsabilidades → mesas → equipos → tallas → inventario →
  plantillas → secuencias → MAM → pretareas (los remaps por id-nuevo dependen de ese orden).
- **`clonedFrom` de las secuencias es metadata de auditoría** (acción `RETREAT_CLONE_FROM`), no
  columna de entidad.
- Guardas de FK: el test DB enforcea FKs, por eso los tests crean `Participant` reales para
  líder/responsable aunque el clonado los deje en null.

## Verificación E2E (2026-10-21, dev)

Retiro **Tlalpan** (2027-03-05 → 2027-03-07) desde **La Esperanza de María XII**: 11 mesas sin
líderes, 49 responsabilidades sin responsable (el origen tenía 2 asignados), 27 equipos sin
líder ni miembros, 4 tallas, 146 inventario con existencias 0, 25 plantillas, 5 secuencias con
7/7 steps remapeados a plantillas locales, 0 envíos programados, 7 preparaciones default.
Shift del MAM verificado con un scratch copiando solo agenda+pretareas de **Buen Despacho Del
Valle II**: 149 ítems re-anclados día por día (misma hora de pared, +140 días), 76 pretareas con
`dueOffsetDays` idéntico al origen (0 diferencias), slots regenerados, responsabilityId
remapeado por nombre salvo los que el catálogo default no tiene (warning).
