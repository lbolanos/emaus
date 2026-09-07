# Cargar caminantes desde el registro de la parroquia

Algunas parroquias inscriben a sus caminantes en su propio sitio y nos entregan un Excel. Es el
caso del Buen Despacho (Del Valle II, 16–18 oct 2026), que registra y cobra en
`emaushombres.buendespacho.com`; en emaus.cc ese retiro tiene `externalRegistrationUrl`, de modo
que `emaus.cc/delvalleii` redirige allí (ver `external-walker-registration.md`).

Este documento es el procedimiento para pasar ese Excel a participantes del retiro.

## El procedimiento

```bash
cd ~/Developer/personal/emaus

make walkers-convert   # elige el Excel de Descargas y lo convierte
make walkers-check     # elige el retiro y comprueba ANTES de importar
#                        …importar el CSV desde Caminantes → Importar Participantes…
make walkers-verify    # comprueba DESPUÉS que no faltó nadie
```

Los tres eligen de una lista: el Excel entre los descargados hoy (o los más recientes si no hay
ninguno de hoy) y el retiro entre los que están en curso o por empezar. Si sólo hay un candidato no
preguntan. Nadie teclea rutas ni uuids — un uuid equivocado importa a los caminantes en otro retiro.

Por debajo son estos dos scripts, por si hace falta llamarlos sueltos:

```bash
python3 scripts/convert-parish-registrations.py <export.xlsx> inscripciones.csv
python3 scripts/check-import.py --before inscripciones.csv --retreat <uuid>
python3 scripts/check-import.py --after  inscripciones.csv --retreat <uuid>
```

Los pasos 2 y 4 salen con código 1 si algo va mal, así que se pueden encadenar. **El paso 4 no es
opcional**: es el único que detecta una pérdida cuya causa todavía no conocemos.

## Por qué hace falta convertir

El Excel **no se puede subir tal cual**. De las 58 claves que `mapToEnglishKeys()` lee
(`apps/api/src/services/participantService.ts`), el export de la parroquia coincide en cuatro. De
hecho el modal lo rechaza antes de empezar, porque exige una columna `email` y allí se llama
`Correo`.

Y si alguien renombrara esa columna para saltarse el guard, sería peor que el error: entraría
«bien» con los datos rotos. Sin `tipousuario` los 55 caminantes entran como **servidores**; sin
`dia`/`mes`/`anio` nadie tiene fecha de nacimiento y no se pueden asignar camas; los contactos de
emergencia, que son obligatorios, no llegan.

## Lo que el conversor resuelve por su cuenta

| Qué | Por qué |
|---|---|
| `tipousuario = 3` | Sin esto el importador asume «servidor» por omisión |
| Fecha de nacimiento → `dia`/`mes`/`anio` | El export trae una sola columna |
| Estado civil → `S/C/D/V/O` | Por tabla, nunca por inicial: *Soltero* y *Separado-Divorciado* empiezan igual |
| Sacramentos → cuatro columnas | El export trae una cadena separada por comas |
| Tallas → catálogo del retiro | Hoy el mexicano (`S/M/G/X/2`). **Verificarlo por retiro** |
| Monto sin separador de miles | `parseFloat("3,100.00")` da **3**: un pago de tres pesos que pasa la validación |
| Fecha de pago | El importador exige monto *y* fecha; sin ella el caminante entra debiendo todo y en recepción le cobran otra vez |
| Saltos de línea y celdas vacías | Ver abajo |
| Correos compartidos | Ver abajo |

## Las dos trampas que el conversor desactiva

Las seis formas de perder gente al importar están en el skill `troubleshooting` §25. Dos las
provocaba este mismo flujo:

**El CSV es más frágil que el xlsx** (§25.6). El parser del modal parte el archivo por saltos de
línea *antes* de separar campos, así que un salto dentro de un valor entrecomillado desplaza todas
las columnas desde ahí — y los detalles de salud llevan saltos reales. Además convierte las celdas
vacías en `NULL`, que el importador escribe en columnas `NOT NULL` matando la fila. El conversor
aplana los valores y emite un espacio en lugar del vacío.

**Correos compartidos** (§25.1). El importador hace upsert por `LOWER(email)`, así que N personas
con la misma dirección entran como **una**. No es raro: en el retiro de Veracruz de septiembre,
quince personas compartían una dirección. El conversor les da un correo sintético por celular
(`5512345678@sincorreo.emaus.cc`) y guarda el original en `notas`. Respeta el caso legítimo: dos
filas de la *misma* persona conservan el correo compartido, que es como se reconcilian una
cancelación y su reinscripción.

## Precauciones al importar

- **Con la app en reposo.** Queda una carrera conocida con escrituras concurrentes.
- **Con respaldo.** `make db-pull` deja una copia de producción de paso.
- **Reimportar es seguro y es el flujo previsto**: el importador reconoce a la gente por correo,
  así que actualiza a quien ya estaba y añade a los nuevos, sin duplicar.

## Lo que este flujo NO trae

El export de la parroquia no incluye punto de encuentro, becas, palancas, mesa ni habitación: todo
eso es operación interna y se captura en emaus.cc. Tampoco trae la preferencia de cuarto
individual, así que para este retiro ese campo llega siempre vacío.
