# Edición rápida de teléfonos para Palancas

Cuando un tercero (p. ej. la esposa) inscribe a un caminante por el registro público, la ficha
queda con el teléfono de **quien llenó el formulario** en `participants.cellPhone`. Para la
operación de palancas ese número es crítico (cola de WhatsApp masiva, plantilla
`PALANQUERO_NEW_WALKER`, confirmación de asistencia), y las peticiones de cartas van además a
los **contactos de emergencia** 1 y 2. Corregirlo exigía abrir el diálogo completo de edición
(11 secciones) para tocar un solo campo — y esa vía ni valida formato ni canoniza por país.

Feature agregada el 2026-10-07 (`palancas-quick-phone-edit`).

## Dónde vive

Un solo mini-editor (`ParticipantQuickPhoneEditor.vue`) con los 3 teléfonos del flujo de
palancas, disponible en dos superficies — solo en la vista **Palancas** (`/app/palancas`):

1. **Tabla**: columna "Celular" con ✏ inline junto al número (prop `inlinePhoneEdit` de
   `ParticipantList`, default `false` — las demás vistas no lo renderizan).
2. **Diálogo "Gestionar Palancas"**: ✏ junto al número del header (`EditParticipantForm` en
   su layout palancas). Al guardar, el diálogo refresca el participante en edición
   (`participant-patched`) y el colapsable de contactos de emergencia se actualiza en caliente.

Requiere permiso `participant:update`; sin él no se renderiza el ✏ (solo el número).

## Comportamiento

- **3 campos**: celular del caminante + celular de emergencia 1 + celular de emergencia 2.
  Las etiquetas de emergencia incluyen el nombre del contacto («Celular de emergencia 1 —
  Carmen Vazquez») para no confundir a quién pertenece cada número.
- **Semántica de vacío**: celular y EC1 no se pueden vaciar (los usa el flujo de cartas);
  EC2 sí (se limpia → `null` en la base).
- **Validación por país** al guardar, contra el país de la casa del retiro — mismas reglas
  y mensajes que el registro público ([phone-validation-by-country.md](phone-validation-by-country.md)):
  tolera `+52`/`044` y separadores, y **canoniza al número nacional** antes de persistir.
- **Payload cambios-only**: el request solo lleva los campos que cambiaron respecto de la
  fila (el botón Guardar queda deshabilitado si no hay cambios). La validación aplica
  únicamente a esos campos: un valor legacy inválido que no se toca no bloquea corregir
  otro (misma semántica que el server).
- **Patch optimista**: la fila se actualiza al instante con los valores canónicos que
  devuelve el servidor; si el request falla, rollback + toast, y el popover queda abierto
  con lo tecleado para corregir.

## Backend

`PATCH /participants/:id/phones` (endpoint dedicado; **no** reusa el `PUT /participants/:id`,
que no valida teléfono y su preprocess `''→undefined` impide limpiar un campo):

- Body angosto: solo `cellPhone` / `emergencyContact1CellPhone` /
  `emergencyContact2CellPhone` (+ `retreatId` para el access check). Campos extra los
  strippea el `assignParsedBody` del middleware de validación.
- Permisos: `participant:update` + `requireRetreatAccess('retreatId', 'body')`.
- Valida cada valor contra `retreat.house.country` (400 con mensaje que nombra el campo),
  canoniza con `toNationalPhone` y audita con allowlist propia de los 3 campos (DomainAudit).
  Si el país de la casa (texto libre) no resuelve a ninguna regla, aplica un piso E.164
  (6–15 dígitos) para no persistir un número absurdo con 200.
- Respuesta angosta `{ id, cellPhone, emergencyContact1CellPhone, emergencyContact2CellPhone }`.

## Limitación conocida: mensajes ya encolados

Los snapshots de mensajes **ya encolados** (`sm.resolvedContact` en
`messageSequenceService`) conservan el número viejo: corregir el teléfono NO re-resuelve los
pasos pendientes de una secuencia ni los envíos ya agendados en la cola de WhatsApp. Los pasos
que se encolen **después** de la corrección y los envíos masivos nuevos sí toman el número
corregido. Si un envío programado lleva el número equivocado, corregir la ficha no basta: hay
que cancelar/reencolar ese envío.

## Otras reglas

- `cellPhone` entró a la tabla de Palancas **con ✏ pero sin edición genérica** en el
  diálogo: el PUT genérico no valida teléfono, así que la única vía de edición es el
  mini-editor. Como la lista de edición del diálogo une las columnas visibles de la tabla,
  la exclusión es explícita (`columnsExcludedFromFormEdit` de `ParticipantList`, que
  `PalancasView` usa para `cellPhone`).
- Las selecciones de columnas se persisten por vista (`participant-columns-palancas`); el
  merge de defaults agrega la columna nueva automáticamente sin tocar otras vistas.
- i18n: claves `participants.quickPhones.*` en `es.json` y `en.json`; los mensajes de
  formato inválido salen de `phoneValidationMessage` (español directo, mismo contrato que el
  wizard público).

## Tests

- **API** (`apps/api/src/tests/{controllers,services,routes}/participant*Phones*.test.ts`,
  28 tests): validación por campo, canonización `+52`/`044`, semántica de vacío, 401/403
  (permiso y retiro ajeno), strip de campos extra, persistencia canónica en DB, audit row.
- **Web**: editor (permiso, validación bloquea, piso 6–15 con país no resoluble, payload
  cambios-only, rollback — 10), formulario (montaje solo en layout palancas, re-emit
  `participant-patched`, preservación de ediciones y tallas sucias — 14), wiring de la
  tabla (default sin ✏, con prop abre seedeado de la fila, exclusión del diálogo —
  dentro de la suite de `ParticipantList`).
