---
name: documentos-membretados
description: "Generar un PDF suelto con el membrete de Emaús (logo, comunidad, parroquia) para mandar por WhatsApp o correo — horarios de retiro, propuestas, listados, avisos al equipo servidor. Cubre el script build-pdf.sh, la paleta sacada del logo, y las trampas de Chrome headless que cuestan una tarde: el membrete que se imprime al pie, el borde derecho cortado, y la media página en blanco. Triggers — 'pásame un PDF', 'un PDF para enviar', 'documento membretado', 'con el logo de Emaús', 'imprimir esto y mandarlo', 'hoja para el equipo', 'PDF del horario'."
---

# Documentos PDF membretados de Emaús

Para **documentos sueltos que se mandan por WhatsApp o correo** y no viven dentro de la app:
el horario de un retiro, una propuesta que alguien tiene que avalar, un listado para el equipo
servidor.

> **No confundir con `printable-documents`.** Ese skill cubre los PDFs que genera *la app* para
> el usuario final (jsPDF con marcadores, `window.print()`, la hoja A4 de `@repo/utils`). Este
> cubre los documentos que generamos **nosotros desde la terminal** con Chrome headless. Si el
> documento lo produce un botón de la web, es el otro skill.

## Cómo se genera

```bash
.ruler/skills/documentos-membretados/scripts/build-pdf.sh \
  contenido.html  ~/Desktop/salida.pdf \
  "Horario del día 3<br>Retiro Del Valle II" \
  "Emaús del Valle · Horario Del Valle II · v2"
#   <contenido>    <salida>    <kicker, arriba a la derecha>  <pie izquierdo>
```

`contenido.html` lleva **solo el cuerpo** — sin `<html>`, `<head>` ni `<body>`. El script pone el
esqueleto, las fuentes de Google, `assets/membrete.css`, el logo embebido como data URI, y envuelve
todo en la tabla `.hoja`. Si existe un `contenido.css` junto al HTML, se inyecta después del
membrete (para estilos propios de ese documento).

Se puede cambiar la comunidad sin tocar el script:

```bash
EMAUS_COMUNIDAD="Emaús Polanco" EMAUS_PARROQUIA="Parroquia X · CDMX" build-pdf.sh …
```

En otra máquina, `CHROME_BIN=/ruta/a/chrome`.

## La paleta sale del logo, no está inventada

`assets/logo-emaus.png` es la cruz de madera con la rosa (`apps/web/public/logo_oficial.png`
reescalado a 200 px de alto). Muestreando sus píxeles opacos:

| Color del logo | % | Token |
| --- | --- | --- |
| `#381C00` madera | 40 % | `--madera` `#3A2317` — titulares y cifras |
| `#A81C1C` rosa | 16 % | `--rosa` `#A32320` — acento, filete, recortes |
| `#707038` hoja | 11 % | `--hoja` `#5E6B32` — valores positivos, anclas |

Si hace falta re-muestrear otro logo, decodificá el PNG y contá buckets de color; no le pongas
al documento un color que no esté en la marca.

## Piezas listas en `assets/membrete.css`

`header.doc` + `.eyebrow` + `h1` + `.sub` (portada) · `.cifras` / `.cifra` (tres cifras grandes
en fila) · `.panel` (lista de etiqueta + valor con total) · `.bloque` (sección con tabla) ·
`.notas` / `.nota` (avisos con filete rojo) · `.tag-anchor` / `.tag-cut`.

## Las cuatro trampas de Chrome headless

Las cuatro se pagaron generando el horario de Del Valle II. Ninguna da error: el PDF sale, y sale mal.

**1. El membrete repetido va en `<thead>`, nunca en `position: fixed`.**
El camino que parece obvio —`position:fixed` con offsets negativos contra el margen de `@page`—
Chrome lo imprime en todas las páginas pero **intercambia arriba y abajo**: el membrete acaba al
pie pisando la tabla y el pie aparece arriba. Con `top:0` / `bottom:0` sí respeta el lado, pero
entonces **no reserva espacio** y tapa el texto. Lo que funciona es envolver el documento en una
tabla cuyo `<thead>` lleva el membrete y su `<tfoot>` el pie: Chrome los repite *y* les reserva
sitio. Ya está resuelto en el script; no lo "simplifiques" a `fixed`.

**2. `html, body` necesitan `width: 186mm` explícito.**
Sin él, Chrome maqueta contra un viewport tipo Letter y **el borde derecho sale cortado** — cajas
sin su lado derecho, tablas abiertas. 186 mm = A4 (210) menos los dos márgenes de 12 mm.
Y lo contrario: **nunca `overflow-x: hidden`** en `html`/`body`, que recorta el contenido ancho.

**3. `break-inside: avoid` en un bloque largo deja media página en blanco.**
Un `.bloque` de 12 renglones que no cabe en lo que queda de hoja salta entero a la siguiente.
Los bloques se parten; lo que se protege es el encabezado (`break-after: avoid`) y cada fila
(`tbody tr { break-inside: avoid }`).

**4. `grid-template-columns: repeat(3, 1fr)` desborda.**
`1fr` es `minmax(auto, 1fr)`, y un rótulo mono con `letter-spacing` empuja el min-content por
encima del tercio. Siempre `repeat(3, minmax(0, 1fr))`.

Y un comportamiento que no es un fallo pero sorprende: en la **última** página —y por tanto en
cualquier documento de una sola hoja— el `<tfoot>` queda pegado al final del contenido, no clavado
al borde inferior. Es como funciona `tfoot`. Si un documento corto necesita el pie abajo del todo,
mételo aparte al final del contenido en vez de pelearte con la tabla.

## Revisá el PDF antes de entregarlo

No basta con que el script diga OK. Abrí el resultado y **mirá las páginas**:

```
Read <ruta>.pdf  pages: "1-4"
```

Lo que hay que buscar es justo lo que no falla en voz alta: bordes derechos cortados, el membrete
en el sitio equivocado, huecos grandes, una tabla partida a mitad de fila. Contar páginas y fuentes
embebidas:

```bash
python3 -c "import re,sys;d=open(sys.argv[1],'rb').read();\
print('paginas:',len(re.findall(rb'/Type\s*/Page[^s]',d)));\
print(sorted(set(re.findall(rb'/BaseFont\s*/([A-Za-z0-9+\-]+)',d))))" salida.pdf
```

Si solo aparecen las fuentes mono, Google Fonts no cargó y el resto cayó al fallback: subí
`--virtual-time-budget` o revisá la red.

## Qué NO poner en un documento que sale de aquí

Estos PDFs se reenvían. Antes de generar uno, decidí quién lo va a leer:

- Las notas técnicas internas (que si la base de producción, que si el SQL) **no van** en la hoja
  que recibe el equipo del retiro. Van en la conversación.
- Si el documento llega a un **caminante**, aplican las reglas de superficie pública de
  `AGENTS.md`: nada de palancas ni cartas, ni dinámicas internas, ni montos.
- Datos personales de participantes: el mínimo que el documento necesite para su función.
