# Research: ejecutar canciones del MAM (móvil)

> SDD research — versión 1.0 (2026-10-19). Todo lo afirmado abajo se verificó contra master
> (commit 84b19d60) y contra una copia read-only de la DB de dev del mismo día.

## 1. El reporte

El 2026-10-19, cerrado ya Buen Despacho (Del Valle II, 16–18 oct 2026), Leonardo reporta:
«MAM celular no ejecuta canciones». Durante el retiro, quien lleva la música de las charlas
trató de lanzar las canciones desde el Minuto a Minuto en su teléfono y no hubo forma.

## 2. El dato existe y está bien cargado

- `retreat_schedule_item.musicTrackUrl` (text, nullable) — la URL de la pista.
- `retreat_schedule_item.palanquitaNotes` (text, nullable) — el nombre de la canción
  («Jesucristo Basta», «Huracán»…). En la UI se captura como «Música / palanquita».
- Captura: `ScheduleItemEditModal.vue` (campos «Música / palanquita» y «URL de música»).
- Herencia: al materializar un retiro desde plantilla, `materializeTemplate` (en
  `retreatScheduleService.ts`) copia `musicTrackUrl` y `palanquitaNotes` de
  `schedule_template` a cada item. La plantilla global también los define
  (`ScheduleTemplateView.vue`, placeholder «Canción o indicación musical»).
- Por el dato: Buen Despacho tiene 149 items, **6 con URL de música** (las seis charlas con
  palanquita de música: links de Spotify + nombre de canción en `palanquitaNotes`). La
  preparación del MAM hizo su parte; el hueco está del lado de la lectura.

## 3. Nadie reproduce esa URL

Cuatro consumidores posibles y qué hacen hoy con `musicTrackUrl`:

| Pantalla | Archivo | Qué hace |
| --- | --- | --- |
| MAM (lista del retiro) | `MinuteByMinuteView.vue` | **No renderiza `musicTrackUrl` en absoluto.** El 🎵 de `palanquitaNotes` va en un span `hidden sm:inline`: en el celular ni se ve el nombre. |
| Mi agenda | `MyScheduleView.vue` | Muestra 🎵 `palanquitaNotes` como **texto plano** (sin link). No usa `musicTrackUrl`. |
| MAM público (`/mam/:slug`) | `PublicMinuteByMinuteView.vue` | Nada: `getPublicSchedule` serializa solo id/horas/nombre/tipo/status/location/responsabilityName, a propósito (sin notes ni música). |
| Modal de edición | `ScheduleItemEditModal.vue` | La URL vive en un `<Input>` de texto: editable, no clicable. |

El único consumidor real del campo es `retreatMemoryService.importSongsFromMam`
(«Importar música del MAM» → Recuerdos), que corre **después** del retiro y deposita los
links en el dashboard. Es decir: el dato se captura *para* el retiro y solo se consume
*después* del retiro.

## 4. Por qué se reporta como «en el celular»

No es un bug móvil-vs-desktop: **no existe affordance de reproducción en ninguna pantalla**.
En el celular es donde se nota porque:

1. El nombre de la canción está oculto en pantallas chicas (`hidden sm:inline`).
2. La única ruta a la URL hoy es abrir el modal de edición item por item y copiar el texto
   del input a mano — inviable en un teléfono, en pleno retiro, con la fila compacta.
3. Los servidores consultan el MAM desde el teléfono; en desktop el coordinador tiene el
   modal a un click y la música suele salir de una laptop conectada al audio del salón.

## 5. Cómo se abre un link desde el celular

- Un `<a href="…" target="_blank" rel="noopener noreferrer">` nativo es lo más robusto: el
  navegador móvil ofrece abrir Spotify/YouTube en su app, y no depende de `window.open`
  (que en algunos WebViews sin gesto de usuario se bloquea). El tap **es** el gesto.
- Regla del repo (troubleshooting #11): `Button as="a"` es válido porque `a` es tag HTML;
  aquí no hace falta ni eso — el ancla va con clases propias, como el botón 📎 de adjuntos
  que ya vive en la misma línea de metadatos de la fila.
- La fila del MAM es clickeable (abre el modal si `canManage`) y arrastrable (reorder): el
  ancla necesita `@click.stop` para no abrir el modal al tocarla.

## 6. Contratos que ya resuelven parte del camino

- **Sin cambio de API**: `RetreatScheduleItemDTO` (web, `services/api.ts`) ya declara
  `musicTrackUrl`, y `listForRetreat` devuelve la entidad completa — el modal de edición ya
  lee `it.musicTrackUrl` del mismo listado.
- **Tap targets ≥32px**: la fila ya usa `h-8 w-8` en móvil para ▶/✓/±5 (WCAG 2.5.5); el
  ancla sigue el mismo patrón.
- **Validación de URL**: `importSongsFromMam` ya fija el criterio del repo — solo
  `^https?:\/\//i` es link real. Conviene reusar esa misma regla en la UI para no renderizar
  un ancla rota cuando alguien escribió el nombre de la canción en el campo de URL.

## 7. Terreno de tests

- `MinuteByMinuteView.vue` **no tiene test de mounting** hoy (el `mamGap.spec.ts` de
  `components/__tests__` es lógica pura de huecos/solapes). Montar la vista completa cuesta
  (stores, socket realtime, permisos). Alternativa: extraer la decisión «¿esta fila pinta un
  ancla y con qué label?» a un módulo puro (hermano de `mamTime.ts`) y testearlo aparte,
  más un mount ligero donde ya exista harness (`MyScheduleView.test.ts` existe y monta esa
  vista).
- El mock global de `@repo/ui` no molesta aquí: el control nuevo es un `<a>` nativo, no un
  componente compartido (no pasa por reka-ui ni por el mock).
- E2E manual en el worktree con el MAM de Buen Despacho (6 items reales con URL) es la
  verificación final; emular iPhone en Playwright para el chequeo móvil.
