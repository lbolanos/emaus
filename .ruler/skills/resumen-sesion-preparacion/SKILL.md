---
name: resumen-sesion-preparacion
description: Generar la infografía vertical (PNG para WhatsApp) que resume una sesión de preparación de un retiro de Emaús — encabezado con el nombre del retiro y la parroquia, fecha y tema de la reunión, y 6-8 bloques numerados con íconos. Usar cuando se pida "un resumen de la sesión N", "una imagen/infografía de la preparación", "algo como el de Santa Clara", o rehacer/ajustar uno ya generado.
---

# Resumen de sesión de preparación (infografía)

Pieza vertical 1080px de ancho, pensada para mandar por WhatsApp al equipo servidor.
Formato calcado del que circula entre comunidades (Emaús Hombres Santa Clara): encabezado
azul con logo, píldora de etapa, fecha + tema, y bloques numerados con ícono circular.

**Audiencia: servidores.** Las preparaciones son formación del equipo, no material para
caminantes — no se publica ni se manda a caminantes, y aplican las reglas de contenido de
`CLAUDE.md` (no palancas, no cartas, no dinámicas internas) si alguna vez sale de ese círculo.

## 1. Sacar el contenido real — nunca inventarlo

El texto de cada sesión existe. Dos fuentes, en este orden:

1. **La DB del retiro** (lo que esa comunidad realmente usa; puede diferir del genérico).
   Copia read-only, nunca el `.sqlite` vivo (ver memoria `feedback_no_sqlite_cli_on_live_wal_db`):

   ```bash
   S=<scratchpad>; for f in database.sqlite database.sqlite-wal database.sqlite-shm; do
     cp /Users/lbolanos/Developer/personal/emaus/apps/api/$f $S/; done

   sqlite3 -header $S/database.sqlite "select id,name from community;"
   sqlite3 -header $S/database.sqlite "select id,parish,startDate from retreat where communityId='<id>';"
   sqlite3 -header $S/database.sqlite \
     "select id,weekNumber,title,date,time from retreat_preparation
      where retreatId='<id>' order by sortOrder;"
   sqlite3 $S/database.sqlite \
     "select content from retreat_preparation_document
      where preparationId='<id>' and kind='markdown';"
   ```

   Ojo con `weekNumber`: hay filas sin número (feriados, p. ej. "Independencia") intercaladas
   en `sortOrder`. La "cuarta sesión" es `weekNumber = 4`, **no** la cuarta fila.

2. **El genérico del repo**, si el retiro no tiene documento propio:
   `/Users/lbolanos/Developer/personal/emaus/apps/api/src/data/preparation-docs/semanaN-*.md`

Los documentos traen 8-10 páginas (meditación, lecturas, parábolas, oraciones). El trabajo es
**condensar**, respetando las palabras del original en las frases fuertes — citas bíblicas y
remates entre comillas van textuales.

## 2. Estructura que funciona

- 6-8 bloques. Menos se ve vacío; más no cabe legible en una sola imagen.
- Mezclar párrafo y viñetas: párrafo para lo conceptual y las narraciones (parábolas,
  historias), viñetas de 3-4 para listas y señales.
- El **último bloque siempre es el compromiso de la semana**: acciones concretas y las
  lecturas recomendadas.
- Cada bloque cierra con una **frase de un santo** sobre ese tema, en la línea en cursiva.
- Cerrar con la cita más fuerte en la caja azul clara, con su autor.
- Una idea por bloque; si un bloque pasa de ~4 líneas de párrafo, se parte.

## 3. Generar

Partir de `assets/template.html` (es el de la 4ª sesión, Familia y Amigos — sirve de ejemplo
completo del tono y la densidad). Copiar el HTML **y el logo** al scratchpad (el `<img>` es
relativo), editar encabezado y bloques, y renderizar:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --hide-scrollbars --screenshot=$S/sesion.png --window-size=1080,2400 \
  --default-background-color=FFFFFFFF --virtual-time-budget=6000 $S/sesion.html
```

Render en dos pasadas: la primera con alto generoso (2400) deja una franja blanca al pie;
**mirar el PNG**, medir dónde termina la caja de la cita y repetir con esa altura exacta.
Sin eso la imagen sale con un vacío que en WhatsApp se nota.

Entregar el PNG en `~/Desktop/` con nombre `emaus-sesionN-<tema>.png`.

## 3 bis. Las citas de santos: atribución o nada

Los documentos de preparación arrastran atribuciones falsas — la 4ª sesión daba
«No puedo ganarle a Dios cuando se trata de dar» a un **Peter Coates** que no existe
(el poema se atribuye a Juan Romero, publicado por Radio María). No se copia el autor
del documento sin comprobarlo.

Regla: **solo entra una cita que se pueda anclar a obra y lugar.** «Circula atribuida a
X» no basta, por muchos sitios que la repitan — así se cuelan las apócrifas de Santo
Tomás sobre la amistad o de San Francisco de Sales sobre la mansedumbre, que no tienen
fuente primaria localizable. Si no hay fuente, se busca otra cita o se deja el bloque sin
frase; nunca se inventa la referencia.

Las que ya están verificadas y sirven de banco de salida:

| Tema | Cita | Fuente |
|---|---|---|
| Amor al prójimo | «A la tarde te examinarán en el amor.» | San Juan de la Cruz, *Dichos de luz y amor*, 60 |
| Familia | «El amor empieza en casa.» | Santa Teresa de Calcuta, discurso del Nobel, 1979 |
| Compasión, servicio | «Los pobres son nuestros señores y maestros.» | San Vicente de Paúl, *Conferencias* |
| Paciencia, carácter | «La paciencia todo lo alcanza.» | Santa Teresa de Jesús, «Nada te turbe» |
| Amistad | «No hay amistad verdadera sino entre aquellos a quienes Tú unes.» | San Agustín, *Confesiones* IV, 4 |
| Caridad (1 Cor 13) | «En el corazón de la Iglesia, mi Madre, yo seré el amor.» | Santa Teresa de Lisieux, *Manuscrito B* |
| Obras, compromiso | «El amor se debe poner más en las obras que en las palabras.» | San Ignacio de Loyola, *Ejercicios Espirituales*, 230 |
| Cierre | «Donde no hay amor, pon amor y sacarás amor.» | San Juan de la Cruz, carta de 1589 |

## 4. Trampas ya pagadas

- **Íconos**: son SVG inline con `stroke` blanco, sin librería (la fuente de Google sí se
  carga por red, el `--virtual-time-budget=6000` le da tiempo). Un `path` complejo a 38px se
  vuelve una mancha ilegible — trazos simples, 2-3 elementos máximo por ícono.
- El subtítulo usa `-webkit-text-stroke` (letra hueca). Solo se ve bien en Playfair Display
  bold; con otra fuente el contorno se rompe.
- El logo va como archivo junto al HTML, no como `data:` — Chrome headless lo resuelve bien y
  evita un HTML de megabytes.
- No meter montos ni datos de contacto: la pieza se reenvía sola.

## 5. Variantes

Si piden las 7 sesiones de un retiro, se generan en una tanda desde el mismo HTML cambiando
solo encabezado y bloques — pero el contenido de cada una hay que leerlo y condensarlo aparte;
no hay atajo que valga.
