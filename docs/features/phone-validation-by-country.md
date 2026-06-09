# Validación de teléfonos por país del retiro

En el registro de **caminantes y servidores**, todos los teléfonos se validan y se
**normalizan** según el **país del retiro** (el de la casa). La regla por defecto en
México y Colombia es **10 dígitos**; se acepta cualquier formato con separadores
(`(55) 1234-5678`, `55 1234 5678`) porque se normaliza antes de validar, y en la base
se guarda **solo dígitos** (`5512345678`).

Feature agregada el 2026-06-09.

## Reglas

1. **El país lo define el retiro, no el participante.** Aunque el participante elija
   otro país en su dirección (Step 2), la cantidad de dígitos exigida es la del país
   de la **casa** del retiro. Ej.: un retiro en México siempre pide 10 dígitos.
2. **Solo números.** Letras → error "El teléfono solo puede contener números (sin
   letras ni espacios)". Los separadores de formato (espacios, guiones, paréntesis,
   puntos, `+`) **sí se aceptan**: se eliminan al normalizar. Las letras **no** se
   eliminan, para que el mensaje de error tenga sentido.
3. **Longitud por país.** Si el país tiene regla, el número (ya normalizado) debe
   tener exactamente esa cantidad de dígitos. Si no la tiene, solo se exige que sean
   dígitos (sin restricción de longitud).
4. **Todos los teléfonos.** Se validan los del participante (casa/trabajo/celular),
   los de los **2 contactos de emergencia** y los del **invitador**.
5. **Vacío = válido.** La obligatoriedad de cada campo se maneja aparte en los schemas
   de cada paso; la validación de teléfono no obliga a llenar campos opcionales.
6. **`+52`/código de país.** No se intenta quitar el prefijo internacional:
   `+52 55 1234 5678` normaliza a `525512345678` (12 dígitos) y **falla** la regla de
   10. "10 dígitos" es literal (número nacional).

## Países con regla de longitud

Definidos en `PHONE_DIGIT_LENGTHS_BY_COUNTRY`. La clave es ISO-2, pero el país de la
casa se guarda como **texto libre** (ej. `"México"`, `"Mexico"`), así que
`resolveCountryToIso()` mapea nombres en español/inglés → ISO antes de buscar la regla.

| Dígitos | Países |
| --- | --- |
| 10 | MX, CO, US, CA, AR, VE, DO, PR |
| 9 | PE, CL, EC, ES, PY |
| 8 | GT, SV, HN, NI, CR, BO, UY |
| 7 u 8 | PA |
| 10 u 11 | BR |

Para agregar/ajustar un país, editar el mapa en `packages/types/src/phone.ts`. Si el
nombre que guarda la casa no está en `COUNTRY_NAME_TO_ISO`, agregar el alias
normalizado (minúsculas, sin acentos).

## Arquitectura

Lógica compartida en **`packages/types/src/phone.ts`** (consumida por web y api):

- `normalizePhone(value)` — quita separadores de formato (`/[\s().\-+]/g`); no quita letras.
- `resolveCountryToIso(country)` — ISO-2 o nombre → ISO-2, o `null`.
- `getPhoneDigitLengths(country)` — longitudes válidas, o `null` si el país no tiene regla.
- `validatePhoneForCountry(value, country)` — normaliza y valida; devuelve
  `{ valid, error?: 'not_digits' | 'wrong_length', expectedLengths? }`.
- `phoneValidationMessage(result)` — mensaje en español listo para mostrar.
- `PARTICIPANT_PHONE_FIELDS` — los 12 campos de teléfono de un participante.
- `validateParticipantPhones(data, country)` — valida todos; devuelve `{ field, message }[]`.
- `normalizeParticipantPhones(data)` — copia con todos los teléfonos normalizados (para persistir).

### Frontend (`apps/web`)

- El endpoint público del retiro devuelve `country`; el form lo lee en
  `retreatCountry` (`ParticipantRegistrationView.vue`).
- Los schemas de los pasos 1 (participante), 4 (emergencia) y 5 (invitador) agregan
  issues de Zod vía `addPhoneIssues` → el error sale **inline** junto al campo.
- Inputs de teléfono con `type="tel" inputmode="numeric"` para abrir el teclado
  numérico en móvil (Step1/Step4/Step5).

### Backend (`apps/api`)

- `getRetreatByIdPublic` / `getRetreatBySlugPublic` exponen `country` (de `house.country`).
- `createParticipant` (controlador, `POST /participants/new`) revalida todos los
  teléfonos contra el país del retiro y responde `400 { message, errors[] }` si algo
  falla (defensa en profundidad; se ejecuta también en `dryRun`).
- `participantService.createParticipant` y `updateParticipant` llaman a
  `normalizeParticipantPhones` antes de persistir → la base guarda solo dígitos en
  todos los orígenes (registro público, import Excel, alta/edición admin).

## Tests

- `apps/api/src/tests/services/phoneValidation.simple.test.ts` — 23 tests del helper
  (normalización, separadores, letras, longitud, resolución por nombre, multi-longitud BR).
- `apps/api/src/tests/controllers/participantPhoneValidation.test.ts` — 8 tests del
  controlador (400 por letras/longitud, acepta separadores, país por nombre, todos los
  teléfonos, país del retiro vs del participante, dryRun).
- `apps/web/src/views/__tests__/ParticipantRegistrationPhone.test.ts` — 5 tests del
  formulario (país expuesto desde el endpoint, rechazo por letras/longitud, acepta
  separadores, sin país → solo dígitos).
