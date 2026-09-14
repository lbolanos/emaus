# El formato dual de `message_templates.message` (HTML legacy vs texto plano WhatsApp)

> Feature doc. Reglas duras para cualquier superficie que lea, muestre o edite el campo
> `message` de una plantilla de mensaje.

## El dato

Desde el 2026-09-14 la columna `message` convive en **dos formatos incompatibles**:

| | HTML legacy | Texto plano WhatsApp |
|---|---|---|
| Origen | Plantillas de email, editor rico | Plantillas redactadas para WhatsApp |
| Estructura | `<p>`, `<br>`, `<h1>`, tablas | Saltos de línea `\n` (párrafos = `\n\n`) |
| Énfasis | `<strong>`, `<em>` | `*asteriscos*`, `_guiones bajos_`, `~~tachado~~`, `` ``monospace`` `` |

No hay columna que diga cuál es cuál. El discriminador es el contenido mismo:

```ts
// apps/web/src/utils/message.ts
export const HTML_TAG_RE =
	/<\/?(p|div|br|ul|ol|li|dl|dt|dd|strong|b|em|i|u|s|strike|del|ins|h[1-6]|blockquote|pre|code|a|img|span|table|thead|tbody|tr|td|th|hr|html|head|body|style|font|center)(?![\p{L}\p{N}])/iu;
```

El lookahead `(?![\p{L}\p{N}])` en vez de `\b` no es un capricho: `\b` es ASCII-only, así que
texto plano como `<sí>` o `<día>` tiene un word boundary justo después del nombre (Í no es
`\w`) y se detectaría como HTML por error.

**Regla dura: toda superficie nueva que toque `message` debe discriminar el formato, o
destruye el del texto plano al guardarlo.** TipTap aplana los `\n` en silencio: el mensaje
llega multilínea, se guarda como un párrafo corrido, y nadie nota hasta que el caminante
recibe un muro de texto.

## El editor: modo congelado por sesión de edición

`BaseMessageTemplateModal.vue` edita el mensaje con la superficie que corresponde:

- **Texto plano** → `<textarea>` nativo. Round-trip exacto: los `\n` son ciudadanos de
  primera clase y el `*bold*` queda como se escribió.
- **HTML** → `RichTextEditor` (TipTap). Parséa y serializa markup de verdad.

El punto que mordió (HIGH #2, fix 2026-09-13): el detector **no puede ser un computed
reactivo sobre el mensaje**. Mientras el usuario edita una plantilla WhatsApp y el contenido
gana un tag —tipeando `<div>` a mano o pegando un fragmento con formato— el computed volteaba
el textarea a TipTap en mitad de la edición:

1. TipTap parséa el texto plano como HTML y **aplana todos los `\n`**,
2. se traga los keystrokes tipeados después del swap,
3. y la primera edición **re-serializa la estructura** como un `<p>` corrido — guardar eso
   destruye el formato.

Por eso `isPlainTextMessage` es un `ref` congelado que solo se evalúa en dos momentos:

- al cargar el template (`watch(() => props.template)`, que setea `formData`), y
- al abrir el diálogo (`watch(() => props.open)` — cubre el template que llega después del
  `open` y el reopen de un objeto con referencia stale).

**No reacciona al mensaje editado.** Reabrir el modal re-evalúa el formato; dentro de la
sesión, la superficie no cambia debajo del usuario. Si alguien convierte a mano una
plantilla de un formato al otro, el cambio de superficie ocurre en la próxima sesión, no a
mitad de la actual.

Consumidores del modo congelado en el modal: el textarea/editor del tab Editar, la rama
plain del preview (`whitespace-pre-line` con interpolación; la rama HTML sanitiza en
`v-html`), el botón "Formatear HTML", el gate de `beautifyHtml` al entrar al tab HTML
(beautify colapsa los `\n\n` separadores de párrafos — no debe correr sobre texto plano),
e `insertVariable` (inserta en el caret del textarea o del editor rico según el modo).

## Las demás superficies (mapa rápido)

- **Listas y cards** (`MessageTemplatesView`, globales): preview con `whitespace-pre-line`,
  no `v-html` — este último colapsa los saltos. El filtro de búsqueda compara contra el
  texto aplanado (una frase que cruza un salto de línea debe seguir matcheando).
- **Portapapeles** (`copyRichTextToClipboard` en `@/utils/message`): el texto plano se
  convierte a `<br>` ANTES de copiar; ambas rutas del clipboard destruyen `\n` por sí solas.
- **Resolución de variables** (`replaceAllVariables` en `@repo/utils`): colapsa solo los
  pares de énfasis **vacíos** (`**`, `__`, `~~ ~~` — marcadores con nada más que espacios
  entre ellos) que deja una variable vacía, para que WhatsApp no muestre los marcadores
  crudos. Los pares con contenido real son formato legítimo y sobreviven (`~~tachado~~`
  llega tachado). Los dobles backticks NO se tocan (son el marcador de monospace).

## Dónde está pineado

- Unit: `apps/web/src/components/__tests__/BaseMessageTemplateModal.editorMode.test.ts` —
  el contrato de la sesión congelada (modo al cargar, no-reactivo al contenido, re-evalución
  al reabrir), con el `HTML_TAG_RE` real. Verificado por mutación: reintroducir la
  reactividad en vivo pone rojos exactamente los dos tests de regresión.
- E2e: `apps/web/tests/e2e/template-preview-newlines.spec.ts` — recorre listas, preview,
  editor y cards contra el stack de dev; incluye la regresión del swap mid-edición (llenar
  el textarea con contenido que gana un tag y afirmar que la superficie no cambia y los
  `\n` sobreviven). Read-only: nunca guarda.
