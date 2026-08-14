# Saneo de lo que el autofill del celular mete en los formularios

Cuando alguien completa un campo desde **Contactos** en iOS (o pega un valor copiado
del teléfono), el sistema operativo no siempre entrega texto limpio: envuelve el valor
en **caracteres de formato Unicode invisibles** — marcas de dirección bidireccional,
espacios de ancho cero, BOM — y a veces deja espacios en los bordes.

Esos caracteres **no se ven en pantalla** pero cuentan como contenido. Una validación
estricta los rechaza y el usuario recibe un mensaje que contradice lo que está viendo:
su teléfono se lee `5530978314`, perfectamente numérico, y la app le dice *"el teléfono
solo puede contener números"*.

Agregado el 2026-08-14, tras el incidente de Celaya descrito abajo.

## El incidente que lo originó

Un servidor del retiro de Celaya no lograba pasar del paso 1 del registro público.
Sus capturas mostraban todos los campos llenos y correctos. Reproduciendo el flujo real
en producción (`https://emaus.cc/celayav/server`) con los mismos datos **tecleados a
mano**, el formulario avanzaba sin problema; el paso 1 solo se trababa al meter el
celular con las marcas invisibles que agrega el autocompletado de iOS.

Lo que hacía el bug difícil de ver desde el lado del usuario:

- El único aviso era un *toast* que se desvanece, fácil de perder en un celular.
- El borde rojo del campo **se limpia en cuanto tocás el campo** para revisarlo
  (hay un `watch` sobre `formData` que borra el error al editar), así que al mirar la
  pantalla ya no quedaba rastro del error.
- El resultado percibido era *"el botón Siguiente no hace nada"*.

Es el mismo síntoma del incidente de junio de 2026 por la lada `+52`/`044`
(ver [phone-validation-by-country.md](phone-validation-by-country.md)), pero por otra
causa: allí el número tenía dígitos de más, aquí tiene caracteres que nadie ve.

## Qué se sanea y dónde

Todo el saneo vive en **`packages/types/src/text.ts`**, compartido por web y api:

- `stripInvisibleFormatChars(value)` — elimina los caracteres de formato invisibles:
  `U+200B`–`U+200F` (espacios de ancho cero y marcas bidi), `U+202A`–`U+202E`
  (embeddings y overrides bidi), `U+2060`–`U+206F` (separadores invisibles) y
  `U+FEFF` (BOM). **No toca espacios normales ni ningún carácter visible.**
- `normalizeEmail(value)` — lo anterior más recorte de espacios en los bordes.
  **No cambia mayúsculas/minúsculas** ni nada del contenido visible del correo.

Aplicado en dos lugares:

| Dato | Dónde se aplica | Efecto |
| --- | --- | --- |
| Teléfonos | `normalizePhone` en `packages/types/src/phone.ts` | Se limpian los invisibles antes de quitar separadores, así que la validación por país y `toNationalPhone` operan sobre dígitos reales |
| Correos | `requiredEmailSchema` / `optionalEmailSchema` en `packages/types/src/index.ts` (`participantSchema`) y los schemas por paso en `ParticipantRegistrationView.vue` | Un `z.preprocess` limpia el valor **antes** de `.email()`, y como preprocess transforma la salida, lo que se persiste ya viene limpio |

En el formulario, los helpers locales `requiredEmailField` y `optionalEmailField`
envuelven cada campo de correo. La variante opcional convierte a `undefined` un valor
que queda vacío tras limpiarlo, de modo que un campo con solo espacios no se guarda
como cadena inválida.

## Reglas al tocar esto

1. **Sanear no es validar.** Se quita únicamente lo que el usuario no puede ver ni
   quiso escribir. Las letras en un teléfono siguen sin eliminarse, para que el mensaje
   *"solo números"* siga teniendo sentido; el case del correo no se altera, porque
   cambiarlo afectaría búsquedas y comparaciones existentes.
2. **Sanear en el schema, no en el componente.** Al hacerlo con `z.preprocess`, el
   valor limpio es el que sale del `parse` y por tanto el que viaja al API y se
   persiste. Si se limpiara solo en el input, el valor sucio seguiría en `formData`.
3. **Un campo nuevo de correo usa los helpers.** No copiar el viejo
   `z.preprocess(val => val === '' ? undefined : val, …)`: usar `optionalEmailField`
   (formulario) u `optionalEmailSchema` (`packages/types`).
4. **Nunca escribir el carácter invisible literal en un archivo.** En tests va siempre
   como escape (`'\u202D'`) o como constante con nombre; en la documentación, por su
   nombre de code point. Un invisible literal es ilegible en el diff y cualquier
   formatter puede comérselo sin dejar rastro.

## Cómo diagnosticar un reporte parecido

Si alguien dice que un formulario "no avanza" y los datos se ven bien en su captura:

```js
// En la consola del navegador, sobre el valor del campo sospechoso
[...document.querySelector('#cellPhone').value].map((c) => c.codePointAt(0).toString(16));
// Un carácter 202d / 202c / 200b / feff en la lista es el culpable.
```

Para reproducirlo sin un iPhone a mano, sirve WebKit (el motor de Safari) emulando el
dispositivo y llenando el campo con el valor envuelto en `U+202D`…`U+202C`.

**Desbloqueo inmediato para el usuario, sin esperar un deploy:** borrar el campo por
completo y teclear el valor a mano, sin pegar ni aceptar la sugerencia de
autocompletar.

## Tests

- `apps/api/src/tests/services/emailNormalization.simple.test.ts` — los helpers de
  `text.ts` (qué quitan y qué respetan) y `participantSchema` con correos del autofill:
  se acepta y se limpia, un opcional con solo espacios queda `undefined`, y un correo
  realmente inválido sigue fallando por el campo correcto.
- `apps/api/src/tests/services/phoneValidation.simple.test.ts` — `normalizePhone` con
  marcas bidi, espacio de ancho cero y BOM; `validatePhoneForCountry` y
  `toNationalPhone` con el número envuelto en invisibles.
- `apps/api/src/tests/controllers/participantPhoneValidation.test.ts` — el registro
  público acepta teléfonos y correo del autofill y **persiste el número nacional
  canónico** (`5530978314`, sin invisibles ni lada).
- `apps/web/src/views/__tests__/ParticipantRegistrationPhone.test.ts` — el paso 1 del
  formulario avanza con los datos exactos del incidente. Este test falla si se revierte
  el saneo en `normalizePhone`, así que cubre la regresión de verdad.
