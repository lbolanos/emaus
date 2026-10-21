# Spec: exportar participantes a Google Contacts

**Estado**: implementado — reconcile 2026-10-21, pendiente de commit · **Branch**:
`worktree-export-google-contacts` (worktree `.claude/worktrees/export-google-contacts`) ·
**Fecha**: 2026-10-20

## Problema

Para armar el grupo de WhatsApp de un retiro agregando a los participantes **directamente**
(sin enlace de invitación), WhatsApp solo permite seleccionar gente que esté en los contactos
del teléfono. El flujo manual actual — verificado con el retiro Buen Despacho el 2026-10-20 —
exige exportar desde la app, transformar a mano el CSV al formato de Google Contacts, importar
a contacts.google.com y esperar el sync al teléfono.

El formato no es trivial y ya costó un ida y vuelta: la primera versión ponía el identificador
("Emaus ValleII") solo en la columna `Name`; Google Contacts **reconstruye el nombre visible
desde Given Name + Family Name al importar**, y el identificador se perdió. La versión que
funcionó (v2, validada a mano):

- Columnas fijas: `Name,Given Name,Family Name,Phone 1 - Type,Phone 1 - Value,Group Membership`.
- El identificador va en `Name` **y** en `Family Name`; `Given Name` queda limpio.
- `Phone 1 - Type` = `Mobile`; `Phone 1 - Value` = E.164 (`+52` + 10 dígitos).
- `Group Membership` = `<identificador> ::: * myContacts` — crea la etiqueta y los deja en
  *Mis contactos* para que sincronicen al teléfono.
- Archivo con BOM UTF-8 y CRLF (lo que el propio Google Contacts exporta).

Los teléfonos en la base son mayormente nacionales a 10 dígitos (ver docblock de
`sanitizePhoneForWhatsapp` en `apps/web/src/utils/phone.ts`): sin lada, un `5549…` sería
Brasil. La normalización ya existe en `withCallingCode` (privado en `phone.ts`).

## Objetivo

1. Desde la lista de participantes (caminantes o servidores), exportar un CSV listo para
   contacts.google.com → Importar, en 3 clics y sin transformación manual (→ M2).
2. El nombre de cada contacto lleva el identificador del retiro/edición, visible también en
   WhatsApp (→ M1).
3. Los teléfonos llegan en E.164 correcto según el país del participante (→ M1).

## Decisiones de dominio (2026-10-20)

1. **Superficie**: tercer formato dentro del diálogo de exportación existente
   (`ExportParticipantsModal`), no un botón aparte. Reusa el alcance (todos/selección) y el
   nombre de archivo. Es donde un coordinador ya busca "sacar la lista".
2. **Columnas fijas**: para este formato no hay selección de columnas — el formato de Google
   Contacts no es configurable. El bloque de columnas y la preview genérica se ocultan; a
   cambio aparece el campo **Identificador** (requerido, placeholder "Emaus ValleII").
   Identificador = sufijo del nombre **y** etiqueta de grupo de contactos.
3. **Teléfono**: `cellPhone` del participante con lada resuelta por `country` (default MX),
   la misma política que los deep links de WhatsApp.
4. **Sin celular**: la fila se exporta igual (con el teléfono vacío) — Google la acepta; quien
   importa decide. El hint del modal lo aclara.
5. **Cliente puro**: CSV generado en el navegador, sin endpoint nuevo ni cambio de API.

## Requerimientos

- **R1 (M1)**: helper exportado `toE164Phone(raw, country?)` en `apps/web/src/utils/phone.ts`
  (refactor de `withCallingCode`, misma semántica: nacional→lada, ya-internacional se mantiene,
  legacy `521` se normaliza, país por `resolveCountryToIso` con default MX).
- **R2 (M1)**: util `buildGoogleContactsCsv(participants, suffix)` en
  `apps/web/src/utils/googleContactsExport.ts` que produce el archivo completo: header fijo,
  sufijo en `Name` y `Family Name`, `Mobile`, E.164 vía R1, `Group Membership`, escape CSV de
  comillas, BOM + CRLF.
- **R3 (M2)**: radio "Google Contacts" en `ExportParticipantsModal`; al activarlo oculta
  columnas/preview, muestra el campo Identificador requerido y el botón de exportar deja de
  depender de `selectedColumns`.
- **R4 (M2)**: emit nuevo `export-google-contacts` con los participantes crudos + identificador
  + filename (los records traducidos del emit `export` no sirven para este formato);
  `ParticipantList` construye el CSV con R2 y lo descarga con el mecanismo existente
  (Blob + anchor).
- **R5 (M2)**: filename default `google_contacts_<type>_<fecha>`; claves i18n nuevas en
  `es.json` **y** `en.json`.
- **R6 (M2)**: la exportación no dispara `auditExportIfIncludesHealth` (solo exporta
  nombre+teléfono; ninguna columna de salud).

## Criterios de aceptación

Unit (Vitest, datos sintéticos con las formas reales de la base):

- **CA1**: el CSV empieza con BOM, usa CRLF, y la primera línea es exactamente
  `Name,Given Name,Family Name,Phone 1 - Type,Phone 1 - Value,Group Membership`.
- **CA2**: para "Juan Pérez" con identificador "Emaus ValleII": `Name` =
  `"Juan Pérez Emaus ValleII"`, `Given Name` = `"Juan"`, `Family Name` =
  `"Pérez Emaus ValleII"`, `Group Membership` = `"Emaus ValleII ::: * myContacts"`.
- **CA3**: `cellPhone` = `5512345678` → `+525512345678`; `+52 55 1234 5678` se mantiene;
  `5215512345678` (legacy) → `+525512345678`; `country` no-MX resuelve su lada.
- **CA4**: un apellido con comillas dobles queda escapado (`""`) y el conteo de columnas por
  fila se mantiene.
- **CA5**: participante con `cellPhone` vacío → fila completa con `Phone 1 - Value` vacío.

UI:

- **CA6**: en el modal, el formato Google oculta columnas/preview, muestra Identificador;
  exportar sin identificador bloquea con mensaje de validación, sin emitir.
- **CA7**: con identificador lleno, el emit `export-google-contacts` sale con los participantes
  del alcance elegido (todos/selección) y `handleExport` descarga `<filename>.csv`.
- **CA8**: sin `participants.export.formatGoogleContacts` cruda en pantalla: claves presentes
  en `es.json` y `en.json`.
- **CA9**: la exportación Google no llama `auditHealthDataExport` (unit del handler).

Navegador (worktree dev, retiro Buen Despacho — existe en la dev DB con 31 caminantes
verificados el 2026-10-20):

- **CA10**: en `/app/walkers`, diálogo Exportar → Google Contacts → identificador "Emaus
  ValleII" → descargar: el archivo tiene 31 filas + header y se importa limpio en
  contacts.google.com (import manual de Leonardo, documentado en tasks.md).

## Fuera de alcance

- Contactos de emergencia como filas adicionales del CSV.
- Otros destinos (vCard/iCloud, Outlook) u otros teléfonos (casa/trabajo).
- Deduplicación o merge dentro de Google Contacts (el import crea contactos aparte si el
  número ya existía; se maneja en Google).
- Crear el grupo de WhatsApp o enviar el enlace desde la app.

## Reconcile

Verificado contra el código el 2026-10-21 (branch `worktree-export-google-contacts`,
pendiente de commit):

- **R1–R6 construidos según lo especificado**: mismos archivos, contratos y comportamientos.
  **CA1–CA9** en unit tests verdes (corrida conjunta 125/125, `vue-tsc --noEmit` limpio).
- **CA10 verificado en navegador** contra el dev del worktree con Buen Despacho: radio
  Google Contacts, columnas ocultas, Identificador requerido (botón deshabilitado en vacío),
  preview de dos columnas Nombre/Teléfono, descarga `google_contacts_walker_2026-10-21.csv`
  con 31 filas + header exacto, sufijo en Name y Family Name en 31/31, teléfonos E.164 en
  31/31, BOM `EF BB BF` confirmado en los bytes del blob y del archivo descargado. El import
  real en contacts.google.com queda para Leonardo en el primer uso; el formato v2 ya se
  validó con import real el 2026-10-20, antes de codear.
- **Desviación menor**: la sección de ayuda in-app vive en `apps/web/src/docs/es/walkers.md`
  (la vista del modal), no en `crm.md` como decía el plan de tasks.md.
- **Detalle no anticipado, encontrado al verificar**: `blob.text()` **elimina el BOM** al
  decodificar UTF-8 (TextDecoder con `ignoreBOM: false`), así que el check del BOM en vivo
  debe hacerse sobre los bytes (`blob.slice(0,3).arrayBuffer()` → `[239,187,191]`), no sobre
  el texto. Los unit tests, que asertan sobre el string fuente, no se ven afectados.
- **Lo descartado, y por qué** (nada de esto se construyó):
  - Botón aparte o vista nueva para este export — se reusa el diálogo existente (decisión 1).
  - Selección de columnas para este formato — el formato de Google no es configurable; el
    bloque se oculta.
  - Endpoint de API — generación 100% en el cliente.
  - Contactos de emergencia como filas, vCard/iCloud/Outlook, deduplicación dentro de
    Google, y crear el grupo de WhatsApp desde la app — siguen fuera de alcance.

## Cambio posterior (2026-10-21)

Pedido por Leonardo tras el reconcile, antes de fusionar:

1. **Filename default con extensión**: `google_contacts_<scope><type>_<fecha>.csv`. El
   handler y el `finalFilename` no duplican la extensión si el nombre custom ya la trae
   (guard `endsWith('.csv')`).
2. **Identificador por defecto**: prop nueva `googleContactsDefaultSuffix` en el modal;
   `ParticipantList` la computa como `"Emaus " + retreat_number_version` del retiro activo
   (trim; vacío si el retiro no tiene versión → campo queda requerido como antes). El
   default se re-aplica al abrir el modal (un cambio de retiro con el modal cerrado
   actualiza el valor) y en `resetExport`; lo tecleado por el usuario no sobrevive al ciclo
   cerrar→abrir, consistente con el resto del modal.

Tests: modal (prellenado + restauración al reabrir + filename con `.csv`) y ParticipantList
(prop derivada del store + filename sin doble `.csv`) — 84/84 en las dos suites,
`vue-tsc --noEmit` limpio.
