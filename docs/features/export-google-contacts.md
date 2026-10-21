# Exportar participantes a Google Contacts

Tercer formato del diálogo **Exportar Participantes** (menú ⋮ de la lista de caminantes y
servidores): un CSV listo para **contacts.google.com → Importar**, pensado para armar el
grupo de WhatsApp del retiro agregando a los participantes **directamente** (sin enlace de
invitación) — WhatsApp solo deja agregar al grupo a quienes ya están en los contactos del
teléfono.

Feature agregada el 2026-10-20. Spec: [`specs/export-google-contacts/spec.md`](../../specs/export-google-contacts/spec.md).
Ayuda in-app: sección "Exportar Caminantes" en `apps/web/src/docs/es/walkers.md`.

## Por qué el formato es lo que es

La primera versión manual ponía el identificador ("Emaus ValleII") solo en la columna
`Name`; Google Contacts **reconstruye el nombre visible desde Given Name + Family Name al
importar**, y el identificador se perdía. El formato que exporta la app (v2, validado con
import real el 2026-10-20):

- Columnas fijas: `Name,Given Name,Family Name,Phone 1 - Type,Phone 1 - Value,Group Membership`.
- El identificador va en `Name` **y** en `Family Name`; `Given Name` queda limpio.
- `Phone 1 - Type` = `Mobile`; `Phone 1 - Value` = E.164 (`+52` + 10 dígitos en MX).
- `Group Membership` = `<identificador> ::: * myContacts` — crea la etiqueta en la agenda y
  los deja en *Mis contactos* para que sincronicen al teléfono.
- BOM UTF-8 + CRLF (lo que el propio Google Contacts exporta).

## Cómo funciona

- `apps/web/src/utils/googleContactsExport.ts` — `buildGoogleContactsCsv(participants, suffix)`
  arma el archivo completo (escape CSV de comillas incluido). Cliente puro, sin endpoint
  nuevo.
- `apps/web/src/utils/phone.ts` — `toE164Phone(raw, country?)`, refactor del `withCallingCode`
  de los deep links de WhatsApp: número nacional → lada del país (default MX vía
  `resolveCountryToIso`), ya-internacional se mantiene, legacy `521` se normaliza.
- `ExportParticipantsModal.vue` — radio "Google Contacts": oculta la selección de columnas
  (el formato no es configurable), pide el **Identificador** (requerido) y muestra una
  preview de dos columnas (Nombre / Teléfono) con el mismo nombre que irá a la agenda.
  Emite `export-google-contacts` con los participantes crudos — los records traducidos del
  emit `export` no sirven para este formato.
- `ParticipantList.vue` — handler que construye el CSV y lo descarga (Blob + anchor, el
  mecanismo existente). **No dispara `auditExportIfIncludesHealth`**: las columnas son fijas
  y no incluyen datos de salud.
- Participantes sin `cellPhone`: la fila se exporta igual con el teléfono vacío (Google la
  acepta; quien importa decide).

## Verificado

- 2026-10-20: import real en contacts.google.com con los 31 caminantes de Buen Despacho
  (formato v2 validado a mano antes de codear).
- 2026-10-21: flujo completo en el navegador contra el dev del worktree (login →
  `/app/walkers` → exportar con identificador "Emaus ValleII"): 31 filas + header exacto,
  sufijo en Name y Family Name en 31/31, teléfonos E.164 en 31/31, BOM `EF BB BF` en el
  archivo descargado, filename `google_contacts_walker_<fecha>.csv`.

## Tests

- `apps/web/src/utils/__tests__/googleContactsExport.test.ts` — formato, sufijo en las dos
  columnas, E.164, escape de comillas, teléfono vacío.
- `apps/web/src/utils/__tests__/phone.test.ts` — `toE164Phone`.
- `apps/web/src/components/__tests__/ExportParticipantsModal.test.ts` — columnas ocultas,
  identificador requerido, emit con participantes crudos.
- `apps/web/src/components/__tests__/ParticipantList.test.ts` (describe "Google Contacts
  Export") — descarga del CSV sin audit de salud.
- Corrida conjunta de los 4 archivos: 125/125 · `vue-tsc --noEmit` limpio.
