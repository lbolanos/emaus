# Carta de solicitud al párroco

Una de las tareas pre-retiro es enviarle al sacerdote una carta pidiéndole su apoyo: el salón para
las reuniones de seguimiento, los avisos en las misas dominicales, y los actos del retiro a los que
tiene que asistir. Se escribía a mano en Word retiro a retiro, copiando y ajustando fechas.

Ahora se genera desde los datos del sistema, se puede ajustar antes de imprimir, y sale en la misma
hoja A4 que los documentos de preparación.

## Para el coordinador

`Logística → Tareas Pre-Retiro` → en la tarea **«Preparar con el párroco qué se necesita de él
(calendario)»**, menú `⋮` → **📄 Imprimir carta al párroco**.

El diálogo muestra la carta ya redactada, con el texto editable a la izquierda y la vista previa a
la derecha:

- **Imprimir** abre la hoja A4 con el logo del tipo de retiro y el diálogo del navegador (de ahí
  «Guardar como PDF»).
- **Descargar PDF** genera el PDF con marcadores directamente.
- **Restablecer** descarta las ediciones y vuelve a armar la carta desde los datos.

**Los ajustes del diálogo no se guardan**: la carta se regenera cada vez desde el retiro. Eso es
deliberado — así las fechas siguen actualizándose solas — y es también el motivo de que el texto
sea editable: hay tres cosas que el sistema no sabe y salen como `(por confirmar)` en cursiva:

| Hueco | Por qué |
| --- | --- |
| Nombre del párroco | No existe ninguna entidad ni columna de sacerdote en el modelo |
| Hora de la misa tras la que se reúne el equipo | El calendario de preparaciones guarda la hora de la reunión, no la de la misa previa |
| Número de sacerdotes para confesar | Va fijo como «entre 3 y 4», igual que el original |

## De dónde sale cada dato

| Frase de la carta | Origen |
| --- | --- |
| Nombre del retiro | `retreat.parish` + `retreat.retreat_number_version` |
| «con fechas del 5 al 7 de junio» | `startDate`/`endDate`, en prosa |
| «EMAÚS Hombres.» | `retreat.retreat_type` |
| Día, hora y cadencia de las reuniones | Calendario de `retreat_preparation` |
| «Los avisos arrancarían el domingo 26 de abril» | Domingo en o antes de `startDate − 5 semanas` |
| Iglesia de las misas | `retreat.closingChurchName` |
| Casa (charla y confesiones) | `house.name`, o el `location` del ítem del MaM |
| Las cuatro horas de «Peticiones durante el retiro» | **Minuto a Minuto del retiro** |

### El Minuto a Minuto es la fuente de los horarios

El MaM ya marca con la responsabilidad **`Sacerdotes`** exactamente los actos a los que el
sacerdote tiene que venir, así que el filtro va por responsabilidad y no por nombre. Contra el set
sembrado «Emaús — México» sale:

| Rol en la carta | Ítem del MaM |
| --- | --- |
| `sendingMass` | Misa de servidores (día 1) |
| `sacramentsTalk` | Charla: … Sacramentos (día 2) |
| `confessions` | Confesiones (día 2) |
| `nightMass` | Misa nocturna (día 2) → «Misa al terminar las confesiones (a las HH:MM hrs.)» |
| `closingMass` | Misa de Cierre del Retiro (último día) |

Lo que **no** entra, aunque lleve la responsabilidad `Sacerdotes`: la *Recepción de sacerdotes*
(`logistica`), la *Dinámica Imposición de Ceniza* (`dinamica`) y la *Bendición de los alimentos*
(`oracion`, del set Colombia) — no son cosas a las que haya que pedirle venir. Tampoco el
*Testimonio 6 — Los Sacramentos*, que comparte responsabilidad con la charla pero es
`type: 'testimonio'`.

**Si el MaM no está materializado, la carta se genera igual** con `(por confirmar)` en esos cuatro
puntos: sigue sirviendo para pedir las cosas. Lo mismo con el calendario de preparaciones.

## Arquitectura

Dos capas, para que la prosa se pueda testear en Jest sin zonas horarias ni DTOs:

| Capa | Archivo | Qué hace |
| --- | --- | --- |
| Prosa pura | `packages/utils/src/priestLetter.ts` | Arma el markdown desde datos ya resueltos (fechas `YYYY-MM-DD`, horas `HH:MM`). Cero `Intl`, cero `new Date()` sin argumentos |
| Adaptación | `apps/web/src/utils/priestLetterData.ts` | Convierte los payloads: zona horaria efectiva, horas de pared, domingo de los avisos, nombre de la responsabilidad |
| UI | `apps/web/src/components/PriestLetterDialog.vue` | Diálogo editable + preview; imprime y descarga |
| Entrada | `apps/web/src/views/PreRetreatTasksView.vue` | Ítem de menú en la tarea del párroco |

`@repo/utils` solo depende de `zod`, así que no puede importar de `apps/web` ni de `@repo/types`:
de ahí el corte. El helper tampoco importa de `./index`, que lo re-exporta (sería un ciclo).

### En qué tarea aparece el ítem

`isPriestLetterTask({ name, description })` casa por nombre normalizado (sin acentos, minúsculas)
y exige **las dos mitades**: alguien (`parroco` | `sacerdote`) **y** una acción (`calendario` |
`carta` | `necesita`).

La conjunción es el punto: el checklist canónico tiene media docena de tareas que nombran a un
sacerdote — «Tener Parroquia / apoyo del Párroco», «Invitar sacerdotes a confesar», «Organizar cómo
llegan los sacerdotes», «cena de sacerdotes» — y ninguna es esta. Con solo la primera mitad el
botón salía en todas.

`priestLetter.simple.test.ts` recorre `PRE_RETIRO_EMAUS` (el seeder real, exportado para esto) y
exige que case con **exactamente una** tarea, así que añadir al template una tarea que mencione al
párroco y a un calendario rompe el test en vez de duplicar el botón en silencio.

> Si el coordinador renombra la tarea y se pierde una de las dos mitades (y además borra la
> descripción), el ítem desaparece de esa fila. La salida es reimportar el template con «Solo
> agregar faltantes», que recrea la tarea canónica. Es el precio de no añadir una columna
> `actionKey` al template.

### El logo va en la hoja, no en el texto

`PrintableDocumentData` de `packages/utils/src/printableDocument.ts` ganó un `logoUrl?` opcional
que se pinta dentro de `header.doc-head`, con su propia regla `max-height: 24mm`.

Hace falta esa regla porque la global de la hoja es `img { max-height: 105mm }`. Y el logo **no**
debe emitirse también en el markdown: se probó y salía **dos veces** en el impreso (uno acotado
arriba y otro a 105mm en el cuerpo, que empujaba la carta a una segunda página), además de dejar al
coordinador borrar la marca al editar el texto. El logo lo resuelve el diálogo con
`retreatLetterLogoUrl` y lo pasa a la hoja y a la vista previa, nunca al texto.

Los tres consumidores anteriores (`RetreatPreparationsView`, `PublicPreparationsView`,
`ResponsabilityAttachmentsDialog`) no pasan `logoUrl`, así que su salida no cambia — hay un test
que lo fija.

### Interlineado holgado, y por qué 1.65

La carta pide `relaxedLeading`, que pone `class="relaxed"` en el `<body>` y sube el interlineado de
**1.42 a 1.65** (y el hueco entre párrafos de 8 a 12pt). El generador de jsPDF tiene su equivalente
en `RELAXED_LEADING = 1.16`, la misma proporción, para que las dos rutas no divergan.

**Las preparaciones lo dejan apagado a propósito**: su 1.42 sale de los `.docx` originales, y
subirlo les añadiría páginas a documentos que ya son largos. Hay un test que fija que
`downloadPreparationPdf` no lo pida.

1.65 es el **techo medido**, no un número redondo. La carta tiene que caber en una hoja como el
original, y con el nombre de parroquia más largo que se ha visto —«Parroquia del Señor del Buen
Despacho | Mexico City», que aparece tres veces— a 1.7 ya se desborda a una segunda página.
Si algún día se alarga el cuerpo de la carta, hay que volver a medirlo:

```bash
pdfinfo salida.pdf | grep -i "^Pages"
```

## Gotchas ganados a pulso

- **`1.-` y no `1.`** en los puntos numerados: `marked` abre una `<ol>` con `\d+[.)]` + espacio y
  renumera. Con guion sobrevive como texto plano. Y hace falta una línea en blanco entre puntos, o
  se juntan en un párrafo.
- **`hourCycle: 'h23'`, no `hour12: false`**: varios ICU devuelven `24` para medianoche con el
  segundo.
- **La fecha del ítem sale de su propio instante**, nunca de `startDate + (day - 1)`: la
  materialización aplica `h < 6 ? day : day - 1`, así que una actividad de madrugada cae en el día
  calendario siguiente y solo el instante lo sabe.
- **No copiar `clockParts` de `MinuteByMinuteView.vue`**: usa `getHours()`, o sea la zona del
  navegador. En pantalla da igual; en una carta impresa desde otro país, no.
- **Nombres de lugar con punto**: los del MaM vienen como «San José Del Carmen.» y sin recortarlos
  el papel salía con «..» a la vista.
- **«a la San Agustín»**: el artículo solo cabe si el nombre empieza por Parroquia/Iglesia/Capilla…
- **Backticks dentro de `PRINT_STYLESHEET`**: es un template literal. Un `` `img` `` en un
  comentario CSS cierra la cadena y rompe el build con «Expected ";" but found img». Pasó **dos
  veces** al escribir esta feature — una con `img` y otra con `relaxedLeading`. Lo caza el
  typecheck, no los tests.

## Tests

| Archivo | Cubre |
| --- | --- |
| `apps/api/src/tests/services/priestLetter.simple.test.ts` | 40 casos: aritmética date-only, prosa en español, cadencia de reuniones (moda de los gaps), filtro del MaM sobre los sets México y Colombia, el matcher contra el seeder completo, y el texto de la carta contra el `.docx` original |
| `apps/web/src/utils/__tests__/priestLetterData.test.ts` | Horas de pared por zona (misma instante → 13:00 en México, 21:00 en Madrid), medianoche sin `24:00`, cascada de timezone, `Date` y ISO sin desplazar el día |
| `apps/web/src/components/__tests__/PriestLetterDialog.test.ts` | Carga, siembra del borrador, imprime el texto **editado**, PDF, restablecer, degradación con MaM/preparaciones caídas, resolución por `retreatId` |
| `apps/web/src/views/__tests__/PreRetreatTasksView.test.ts` | El ítem sale solo en la tarea del párroco, abre el diálogo, y sigue visible sin `preRetreatTask:manage` (imprimir es lectura) |
| `apps/web/src/composables/__tests__/usePreparationPdf.test.ts` | `downloadMarkdownPdf` genérico + que `downloadPreparationPdf` siga usando `renderedContent` |
| `apps/web/src/composables/__tests__/usePrintableDocument.test.ts` | El `logoUrl` opcional y la no-regresión de quien no lo pasa |

## Permisos

El ítem hereda el `⋮` de la vista, que ahora se muestra con
`canManage.preRetreatTask || isPriestLetterTask(task)`: los roles con solo `preRetreatTask:read`
(`communications`, `treasurer`, `regular_server`) pueden imprimir la carta sin poder tocar el
checklist. Los ítems de mutación conservan su propio gating.

El diálogo lee además el MaM (`schedule:read`) y las preparaciones
(`retreatPreparation:read`) con `Promise.allSettled`: si una falla, avisa en ámbar y la carta sale
con los huecos marcados en vez de romperse.
