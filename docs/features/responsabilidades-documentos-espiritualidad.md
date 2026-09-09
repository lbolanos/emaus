# El sentido del servicio en los documentos operativos

Cada documento de responsabilidad, cada texto corto y cada instrucción de equipo abre con un
bloque de cuatro subsecciones que explican **para qué sirve** la tarea antes de decir **cómo**
se hace. Antes, un servidor que abría su documento encontraba una tabla
(`# / Descripción / Cuándo / Dónde`) y, con suerte, un párrafo funcional: el Tesorero leía
"lleva la contabilidad"; el Campanero, "toca la campana en momentos clave".

## El bloque

Va **inmediatamente después de la portada del documento** (los encabezados de nivel 1-2
iniciales) y **antes de cualquier `###` del manual o de la tabla operativa**:

```markdown
## Equipo del Comedor — Anexo A-5-6

### Objetivo
Una frase: qué debe pasar en el caminante gracias a este servicio.

### Por qué importa
Qué se rompe si esto falla, o qué percibe el caminante cuando sale bien.

### La espiritualidad detrás
Una cita bíblica o litúrgica concreta que ilumine esta tarea.

### El regalo de servir aquí
Qué recibe el servidor al hacerlo.

[el contenido original del manual sigue intacto a partir de aquí]
```

Reglas al escribir uno:

- **Se le habla al equipo servidor**, nunca al caminante. Estos documentos son formación
  interna (ver `project_preparations_are_for_servers`).
- 60-120 palabras de cuerpo. Si crece más, se está reescribiendo el manual.
- **Toda cita se verifica literal** antes de escribirla. Ante la duda, se omite: mejor un
  bloque sin cita que una cita inventada.
- **Cero literales de un retiro concreto** (fechas, nombre de la casa, número de caminantes,
  montos). El guard lo comprueba **solo sobre el bloque**, no sobre el documento entero: el
  manual heredado sí menciona una parroquia por su nombre en una variante, y eso no se toca.
- El bloque **se suma**, no reescribe: quitarlo debe devolver el documento anterior byte a byte.

## Qué lo lleva y qué no

| Grupo | Fuente | Con bloque |
|---|---|---|
| Responsabilidades | `apps/api/src/data/charlaDocumentation.ts` → `responsibilityDocumentation` | **las 29**, incluida `Despedida` |
| Charlas y textos | mismo archivo → `charlaDocumentation` | **8 de 21** |
| Equipos de servicio | `apps/api/src/data/serviceTeamInstructions.ts` | **20 de 27** |

**Sin bloque, a propósito:**

- Los **13 guiones largos de charla** (De la Rosa, Máscaras, Escrituras, Oración, Sacramentos,
  Cargas, Sanación, Familia y Amigos, Servicio, Confianza, Quema de Pecados, Pared, Lavado de
  Manos): ya abren con su objetivo y su teología; el bloque sería repetirlos. Cinco de ellos
  ya traen un `### Objetivo` propio — por eso el marcador que identifica el bloque en los tests
  es `### La espiritualidad detrás`, que es único.
- Los **7 equipos de dinámicas** (Pared, Serenata, Perdón/Clausura, Rosa, Máscaras, Sanación de
  los Recuerdos, Quema de Pecados): explican su propio sentido y llevan aviso de
  confidencialidad.

`Despedida` es nueva: se creaba en cada retiro (`responsabilityService.createDefaultResponsibilitiesForRetreat`)
y no tenía documento — el servidor abría la tarjeta y no había nada. Ningún test lo veía hasta
que se añadió a `CANONICAL_FIXED` en `serviceTeamData.simple.test.ts`.

Tres pares compartían **exactamente el mismo texto** y ahora se distinguen por su bloque
(la tabla operativa sigue siendo común): Salón/Cuartos, Santísimo/Oración de Intercesión,
Compras/Snacks.

## Por qué las instrucciones de equipo viven en su propio archivo

`dynamicsTemplates.ts` importa `ServiceTeamType` de `@repo/types`, y **una migración que
importe esa cadena queda "pending" para siempre en producción** con `Unknown file extension .ts`
(ver la cabecera de `20260603120000_AddMissingServiceTeams.ts`). Cuando eso pasó, la solución
fue duplicar el markdown como literal dentro de la migración.

Para no volver a duplicar 60 KB, el markdown se movió a
**`apps/api/src/data/serviceTeamInstructions.ts`**, que **no importa nada**.
`dynamicsTemplates.ts` lo consume y conserva su API (`defaultServiceTeams`, 27 equipos con los
mismos campos). Así una migración puede importar el texto directamente, igual que ya hace con
`charlaDocumentation.ts`.

> Si tocás ese archivo, mantenelo sin imports. Comprobación tras `pnpm --filter api build`:
> `apps/api/dist/data/serviceTeamInstructions.js` debe existir (tsc lo arrastra porque la
> migración lo importa).

## Cómo llega el texto nuevo a una base ya sembrada

El contenido se **copia** a la base por tres caminos, y ninguno sobrescribe una copia existente:

| Tabla | Columna | Quién la escribe |
|---|---|---|
| `responsability_attachment` | `content` | `seedCanonicalResponsabilityAttachments()` en cada arranque — inserta solo lo que falta |
| `retreat_responsibilities` | `description` | al crear el retiro |
| `service_teams` | `instructions` | al crear los equipos del retiro |

Por eso **editar el fuente no basta**: sin migración, producción seguiría mostrando el texto
viejo para siempre. La migración
`20260908120000_RefreshCanonicalDocsWithSpirituality` refresca las tres tablas con una regla
única: compara el **SHA-256** de la fila contra las revisiones congeladas en
`canonicalDocHashes.ts`; si coincide la reemplaza, y si no la deja intacta porque alguien la
editó. Las descripciones vacías o de relleno (retiros viejos guardaban solo `"A-2-1"`) también
se rellenan.

Antes de pisar un attachment guarda la versión previa en `responsability_attachment_history`
con `savedById NULL`, así que **el coordinador puede volver al texto anterior desde el propio
diálogo de historial**. `down()` restaura los attachments desde ahí; las descripciones y las
instrucciones no tienen historial y no se revierten (para eso está el backup — en este repo
`migration:revert` no se usa).

Corrida real sobre una copia de la base de dev: `attachments: 35, descripciones: 242,
equipos: 140, respetados por estar editados: 9`.

## Si vuelves a cambiar estos textos

1. **Primero** congelá la revisión actual, con el árbol limpio:

   ```bash
   pnpm --filter api exec vite-node scripts/freeze-canonical-doc-hashes.ts
   ```

   Acumula: conserva las revisiones ya registradas y añade la de hoy. Hacerlo después de editar
   pierde el hash del texto que hay en las bases, y con él la capacidad de distinguir una copia
   intacta de una editada.

2. Editá los diccionarios.
3. Escribí una migración de refresco con la misma regla de hash (copiá la de esta feature).
4. Corré los guards:

   ```bash
   pnpm --filter api test src/tests/services/responsibilityDocsSpirituality.simple.test.ts
   pnpm --filter api test src/tests/migrations/refreshCanonicalDocsWithSpirituality.test.ts
   pnpm --filter api test src/tests/services/serviceTeamData.simple.test.ts
   ```

## Archivos

| Archivo | Rol |
|---|---|
| `apps/api/src/data/charlaDocumentation.ts` | Charlas, textos y responsabilidades (fuente única) |
| `apps/api/src/data/serviceTeamInstructions.ts` | Instrucciones de equipo, **sin imports** |
| `apps/api/src/data/dynamicsTemplates.ts` | `defaultServiceTeams`, ahora consume el archivo anterior |
| `apps/api/src/data/serviceTeamData.ts` | `moderadorDescription`, `diarioDescription` |
| `apps/api/src/data/canonicalDocHashes.ts` | Generado: hashes de cada revisión canónica |
| `apps/api/scripts/freeze-canonical-doc-hashes.ts` | Regenera lo anterior |
| `apps/api/src/migrations/sqlite/20260908120000_RefreshCanonicalDocsWithSpirituality.ts` | Propagación a bases sembradas |
| `apps/api/src/tests/services/responsibilityDocsSpirituality.simple.test.ts` | Contrato del bloque |
| `apps/api/src/tests/migrations/refreshCanonicalDocsWithSpirituality.test.ts` | Frontera "intacto vs editado" |
