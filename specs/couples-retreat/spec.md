# Spec: Retiros "Emaús de parejas"

> Metodología SDD. Artefactos: [spec.md](spec.md) (qué y por qué) →
> [research.md](research.md) (estado actual) → [plan.md](plan.md) (cómo) →
> [tasks.md](tasks.md) (desglose ejecutable).
> Estado: **aprobada** (2026-08-22). Branch: `feature/couples-retreat`.

## Problema

La plataforma gestiona retiros Emaús de un solo género (hombres o mujeres) con participantes
individuales. La organización quiere operar **retiros de matrimonios**: parejas que se
inscriben, asisten y sirven juntas. Hoy el tipo "Matrimonios" existe solo como etiqueta
cosmética — nada en el registro, capacidad, camas, mesas ni mensajería entiende de parejas.

## Decisiones de dominio (fijadas por la organización)

| # | Decisión | Valor |
| --- | --- | --- |
| D1 | Inscripción | Un solo formulario público registra a ambos cónyuges |
| D2 | Habitación compartida | Configurable por retiro |
| D3 | Mesa junta o separada | Configurable por retiro |
| D4 | Servidores | También participan en pareja |
| D5 | Email | Los cónyuges pueden compartir un email |
| D6 | Género | El formulario captura esposo/esposa; se persiste `gender` en el participante |
| D7 | Costo | El `cost` del retiro es el monto por pareja |
| D8 | Cupo | Se mide en personas; la admisión es atómica por pareja (entran ambos o esperan ambos) |

## Historias de usuario

- **HU-1 (caminantes)**: Como matrimonio invitado a un retiro de parejas, quiero inscribirnos
  a los dos en un solo formulario (aunque compartamos email), para no llenar todo dos veces ni
  arriesgar que uno quede fuera.
- **HU-2 (coordinador, configuración)**: Como coordinador, al crear un retiro de tipo
  "Matrimonios" quiero decidir si las parejas comparten habitación y si se sientan en la misma
  mesa, porque cada retiro lo maneja distinto.
- **HU-3 (coordinador, camas)**: Como coordinador quiero que la auto-asignación de camas
  respete la configuración: parejas juntas en una habitación, o dormitorios separados por
  género, sin que el algoritmo mezcle géneros en un dormitorio.
- **HU-4 (coordinador, mesas)**: Como coordinador quiero que la asignación de mesas mantenga a
  la pareja junta o separada según la configuración, y que la UI me avise si una asignación
  manual la contradice.
- **HU-5 (tesorería)**: Como tesorero quiero que el cargo por pareja cuadre con el ledger de
  pagos por persona existente.
- **HU-6 (comunicación)**: Como coordinador quiero plantillas que puedan mencionar al cónyuge
  del destinatario (`{spouse.*}`).
- **HU-7 (admin)**: Como admin quiero ver, filtrar y exportar el vínculo de pareja en la lista
  de participantes.

## Requerimientos funcionales

- **FR-1**: Un retiro con `retreat_type='couples'` expone en su link público un formulario que
  captura a los dos cónyuges (esposo y esposa) y los crea **vinculados y atómicamente**.
- **FR-2**: El vínculo de pareja es simétrico, por retiro, y sobrevive a la cancelación de un
  solo cónyuge (se cancela solo esa persona; el vínculo queda para historial/UI).
- **FR-3**: Dos cónyuges pueden compartir email dentro del mismo retiro; cualquier otro
  duplicado de email en el retiro sigue bloqueado (incluido el doble submit de la misma pareja).
- **FR-4**: Si no hay 2 lugares libres, **ambos** cónyuges quedan en lista de espera; la
  promoción desde la lista también es atómica (ambos o ninguno).
- **FR-5**: Con `couplesShareRoom=true`, la auto-asignación coloca a la pareja como unidad en
  una habitación con ≥2 camas libres. Con `false`, ningún participante puede quedar en una
  habitación con ocupantes de otro género (filtro duro, también en asignación manual).
- **FR-6**: Con `couplesShareTable=true`, la pareja queda en la misma mesa (auto y rebalance);
  con `false`, nunca en la misma mesa. La asignación manual que contradiga la config produce
  una advertencia (no un bloqueo).
- **FR-7**: El cargo por participante en retiros de parejas es la mitad del `cost` del retiro,
  compatible con el ledger de pagos individual existente.
- **FR-8**: Las plantillas de mensajes soportan el scope `{spouse.*}`.
- **FR-9**: La lista de participantes muestra, filtra y exporta el cónyuge vinculado.
- **FR-10**: Los retiros existentes (`men`/`women`/`effeta`) no cambian de comportamiento en
  nada — todo lo anterior se activa solo con `retreat_type='couples'`.

## Criterios de aceptación (end-to-end)

1. Registro público de una pareja con email compartido → dos participantes vinculados
   simétricamente, mismo `family_friend_color`, un solo submit.
2. Con el cupo a 1 lugar del límite, la siguiente pareja cae **completa** a `waiting`.
3. Auto-asignación de camas en ambas configs: juntos → misma habitación; separados → cero
   habitaciones con géneros mezclados.
4. Auto-asignación y rebalance de mesas en ambas configs; warning al contradecirla manualmente.
5. Un retiro `men` existente: registro, camas, mesas y suites de tests idénticos a hoy.
6. `landingPublicContent.test.ts` sigue verde (nunca montos ni dinámicas en la landing pública).

## Fuera de alcance

- Formulario público de angelitos (partial_server) en pareja — solo por reclasificación admin.
- Parejas mixtas walker/server por el formulario público (solo override manual admin).
- Import masivo de parejas por Excel (el import sigue siendo por persona).
- Vista de tesorería con saldo combinado de la pareja (nice-to-have posterior a M3).
- Variantes de plantillas default para parejas (las actuales siguen siendo correctas).

## Riesgos conocidos

- Guard de celular único por comunidad: si ambos cónyuges comparten teléfono y luego se unen a
  la misma comunidad, chocarán — documentado, se resolverá en el módulo de comunidad.
- El costo "por pareja" partido en dos medios cargos individuales puede confundir a tesorería
  si la pareja paga todo contra un solo cónyuge — mitigación en M3 (etiqueta "por pareja").
