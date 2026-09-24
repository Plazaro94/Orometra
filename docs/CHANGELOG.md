# Changelog

## 2026-09-24 — Recorte de alcance: fuera Desktop, sonda MQL5 y walk-forward

Decisión del usuario, no técnica: Orometra se queda como **una sola cosa, en el
navegador**. Se retira todo lo construido en la sesión anterior (entrada de más
arriba) que dependía de instalar algo fuera del navegador.

### Retirado
- **`desktop/`** entero: app Electron, ledger SQLite (`better-sqlite3`), runner que
  detectaba/lanzaba MT5 (`detect.js`, `launch.js`, `ini.js`, `queue.js`), IPC.
- **`mql5/`** entero: `OrometraProbe.mqh` y el EA de ejemplo instrumentado. Con ella se
  iba el único camino que existía hacia PBO/CSCV real y DSR publicado (necesitan la
  curva de equity de cada configuración de la rejilla, y el export de optimización de
  MT5 nunca la trae).
- `core/orf.js` (lector del `.orf`), `core/incubation.js`, `core/verdict-integrated.js`
  (solo los usaba el asistente de Desktop).
- `core/matrix/cscv.js` (PBO real), `core/matrix/wfo.js` (walk-forward multiventana),
  `core/matrix/dsr.js` (DSR publicado + nº efectivo de pruebas por clustering): los
  tres necesitaban la matriz T×N de retornos por configuración que solo daba la sonda.
- `core/matrix/risk.js`: se quedó solo con el aviso de dominancia del swap
  (`dataWarnings`). La auditoría de estructura de riesgo (martingala, grid, sin stop)
  necesitaba el lote y el SL de cada posición abierta — datos de la sonda, no del
  informe HTML de MT5 — y no se reintroduce con datos a medias.
- Dependencias `electron`, `@electron/rebuild`, `better-sqlite3`: el proyecto vuelve a
  tener **cero dependencias** en tiempo de ejecución y de compilación.

### Añadido — de las 6 cifras a las operaciones una a una
El informe HTML de backtest de una sola configuración ya traía la lista de operaciones
(`core/report.js#deals`) desde la Fase 0, pero solo se usaba para contar cuántas había.
`core/matrix/from-deals.js` las agrupa por día de cierre y con eso, en el periodo no
visto, sin ninguna instalación adicional:
- **Monte Carlo** (`bootstrap.js`, ya existía): 10.000 simulaciones por bootstrap
  estacionario (Politis & Romano 1994) sobre las operaciones reales del usuario. Los
  horizontes de pérdida a 3/6/12 meses solo se muestran si el tramo cubre esos
  63/126/252 días enteros; si no, se marca «—» en vez de repetir el mismo número bajo
  tres etiquetas distintas.
- **Tamaño de muestra / potencia** (`sample.js`, ya existía): ¿se distingue el
  resultado medio diario de cero con esta cantidad de días?
- **Stress de costes** (`costs.js`, ya existía): escenarios base/moderado/severo de
  spread, slippage y comisión extra, y el punto de equilibrio.
- **Aviso de swap** (`risk.js`): si el swap pesa más de un 15 % sobre el neto. Se
  separó `swap` de `commission` en `core/report.js#parseDeals` para poder calcularlo
  (antes iban sumados en un único `cost`).

Los tres primeros módulos (`bootstrap.js`, `sample.js`, `costs.js`) ya estaban escritos
para el pipeline de Desktop+sonda: trabajaban sobre series genéricas de retornos/PnL,
no sobre la matriz T×N, así que no hizo falta reescribirlos — solo un adaptador
(`from-deals.js`) y engancharlos en `js/ui-unseen.js`, en la pestaña «Periodo no
visto», justo debajo de la ficha del informe cargado.

### Nuevas pruebas
`tests/deals-matrix.test.js` (agrupación por día, casos no usables, swap dominante) y
`tests/matrix.test.js` recortado a lo que sobrevive.

### Documentación
`docs/SPEC.md` reescrito (la versión anterior era el plan de Desktop/Fases 1-7, ya no
aplica). `docs/MT5_ASSUMPTIONS.md` sin las filas `INI-*`/`FRAME-*`/`ORF-1`/`PROBE-1`.

---

## 2026-09-24 — Plan cerrado (malla Validar → incubación → CSP)

### Hecho
- **Validar malla:** el asistente acepta `.set`, Optimization 0/1/2, ForwardMode; estima coste; fuerza Opt=0 si no hay params Y.
- **Post-MT5:** `mt5:finishValidate` analiza ORF (PBO/DSR/effectiveTrials), importa XML (IS-only permitido con aviso), guarda summary en ledger; contador suma `effectiveTrials`.
- **Incubación UI:** vista Desktop con fijar bandas / comparar realizado; bandas también desde Validar (sessionStorage).
- **Desktop hardening:** CSP en sesión Electron + `sandbox: true`; i18n ES/EN básico del shell.
- IPC nuevos: `parseSetFile`, `setToInputs`, `finishValidate`, `incubationBands`, `compareIncubation`, `createEaVersion`.

### Pendiente (MT5 real / no inventado)
- Verificar en terminal real: compile MetaEditor, escritura `.orf` en Common\Files\Orometra, Forward XML de Optimization=1, INI-*.
- Malla genética con inputs enormes: el usuario debe confirmar coste; no hay auto-recorte de rejilla.
- Fase 7: no iniciada.

## 2026-09-24 — Validar cableado (Fases 3–5 parcial)

- IPC: `mt5:instrumentEa`, `compileMq5`, `readOrf`, `findOrf`, `analyzeOrf`, `prepareValidate`, `integratedVerdict`.
- `desktop/main/mt5/orf-matrix.js`: ORF → matriz T×N + PBO/DSR/WFO/costes + `integratedVerdict`.
- Asistente: Validar instrumenta/compila `.mq5`, encola backtest, busca `.orf`, muestra tarjetas; `.ex5` → import XML caja negra; botón «Analizar .orf…».
- Progreso MT5 se emite a todas las ventanas Electron.
- Pendiente: malla de optimización desde el wizard, auto-import forward, UI incubación.

## 2026-09-24 — CI + Pages Lite

- `.github/workflows/ci.yml`: `npm test` en push/PR a `main` (Node 22, sin Electron).
- `.github/workflows/static.yml`: deploy a Pages solo tras tests verdes; artifact = sitio Lite (sin desktop/tests/mql5).

## 2026-09-24 — Fases 2–6 (estado)

### Fase 2 — Runner MT5 — **hecho (código); aceptación MT5 real pendiente**
- `desktop/main/mt5/detect.js`: `origin.txt`, instalaciones, EAs, `parseOriginTxt` / `associateDataPaths`.
- `ini.js`, `launch.js`, `collect.js`, `cost.js`, `portable.js`, `queue.js` + IPC `mt5-ipc.js`.
- UI shell `data-view="mt5"`: listar instalaciones, estimar coste, encolar/cancelar, aviso terminal en ejecución, texto portable.
- Pruebas: `tests/mt5-ini.test.js`, `tests/mt5-detect.test.js`.
- **Pendiente:** criterio de aceptación con MT5 real (lanzar optimización de ejemplo de extremo a extremo).

### Fase 3 — Sonda / curvas por pasada — **hecho (código); verificación MT5 pendiente**
- `mql5/OrometraProbe.mqh`, Demo EA, `instrument.js` (`transformSource` / `instrumentMq5Source`), `compile.js`, `core/orf.js`.
- Pruebas: `tests/orf.test.js`, `tests/instrument.test.js`.
- **Pendiente:** FRAME-*/ORF-1/PROBE-1 en MT5; backtest instrumentado vs original; finalistas 3.4; caja negra `.ex5` en UI.

### Fase 4 — Matriz de retornos — **hecho (motor + tests)**
- `core/matrix/` (WFO, CSCV/PBO, DSR, costes, bootstrap, sample, risk).
- Prueba `tests/matrix.test.js`.
- **Pendiente:** cableado completo en el asistente / UI de resultado; contador `effectiveTrials` en ledger aún n/d hasta integrar.

### Fase 5 — Flujo guiado, pre-registro, veredicto — **parcial**
- Asistente `wizard.html` / `wizard.js`; `core/verdict-integrated.js`; perfiles Prudente/Estándar/Exploratorio.
- Ledger: `createPreregistration` + IPC `savePreregistration`.
- Prueba `tests/verdict-incubation.test.js` (veredicto).
- **Pendiente:** orquestación «Validar» extremo a extremo (instrumentar → MT5 → matriz → veredicto); pantalla de resultado con tarjetas; Research Record.

### Fase 6 — Incubación — **parcial (núcleo)**
- `core/incubation.js`: bandas esperadas + comparación con historial.
- Cubierto en `tests/verdict-incubation.test.js`.
- **Pendiente:** UI de seguimiento, import historial cuenta, calibración de costes reales, reglas de parada en shell.

### Fase 7 — Futuro
- **No implementada** (requiere aprobación explícita según SPEC).

---

## 2026-09-24 — Fase 3 (sonda / curvas por pasada)

### Hecho
- `mql5/OrometraProbe.mqh`: hooks `OrometraOnInit/OnTick/OnTester/OnTesterInit/OnTesterPass/OnTesterDeinit`; agregación diaria de deals; resumen de riesgo; `FrameAdd("orometra")`; escritura `.orf` + `.json` en `FILE_COMMON/Files/Orometra/<OrometraExperimentId>`.
- `mql5/examples/OrometraDemoEA.mq5`: cruce de medias + hooks (apto para demo de optimización).
- `desktop/main/mt5/instrument.js`: copia `*_orometra.mq5`, inserta include + handlers (puro `transformSource` / `instrumentMq5Source`); instala el `.mqh` en `MQL5/Include`.
- `desktop/main/mt5/compile.js`: localiza `metaeditor64.exe`, `/compile` + `/log`, mensajes de error en lenguaje claro.
- `core/orf.js` (+ `desktop/main/mt5/orf-read.js`): formato **ORF1** float32, roundtrip, `verifyDailyPnLSums`, `estimateOrfBytes`.
- Pruebas: `tests/orf.test.js`, `tests/instrument.test.js`.
- `docs/MT5_ASSUMPTIONS.md`: FRAME-1/2/3, ORF-1, PROBE-1 (pendientes de verificación en MT5 real).

### Cómo probar (con MT5)
1. `npm test` (incluye orf + instrument).
2. Instrumentar el Demo EA o copiar a mano el `.mqh` a Include; compilar.
3. Optimización exhaustiva local con `OrometraExperimentId` distinto de vacío.
4. Abrir `Common/Files/Orometra/<id>.orf` y contrastar sumas vs XML.

### Pendiente / no cerrado en Fase 3
- Verificación real FRAME-* / ORF-1 / PROBE-1 en MT5 (sin inventar límites).
- Backtest de verificación instrumentado vs original (mismo profit / nº trades) — orquestación completa en runner Fase 2.
- Lista de operaciones de finalistas (3.4) y modo caja negra `.ex5` en UI.

---

## 2026-09-24 — Fase 2 (Runner MT5)

### Hecho
- Detección de instalaciones (`detect.js`) y generación `.ini` (`ini.js`) + estimador de coste + cola + IPC.
- Vista Desktop **MT5 / Runner** (`data-view="mt5"`): instalaciones, EA, símbolo/fechas, estimar, encolar, cola/cancelar, aviso si el terminal está abierto, info `/portable`.
- Pruebas unitarias ini/detect sin MT5.

### Pendiente
- Aceptación E2E con terminal real; progreso fino de pasadas; reintento automático documentado en UI.

---

## 2026-09-24 — Fase 1 (Desktop + ledger)

### Hecho
- App Electron en `desktop/` (`npm run desktop`): shell de estrategias + ventana de análisis (misma UI Lite).
- Ledger SQLite (`better-sqlite3`) con tablas: strategy, ea_version, dataset, experiment, preregistration, result.
- Búsqueda previa obligatoria al crear estrategia (`prior_search_note` / `prior_search_approx`).
- Contador honesto por estrategia: experimentos, versiones EA, pasadas totales; pruebas efectivas = n/d hasta integrar Fase 4.
- Importar XML/XLS IS+Forward → analiza con `core/` (mismo motor) y guarda experimento + resumen.
- Exportar / importar ledger completo (JSON).
- Host del ledger en proceso Node aparte (evita ABI Electron vs prebuild Node).
- `createPreregistration` + IPC `savePreregistration` (pre-registro Fase 5).
- Prueba `tests/ledger.test.js`.

### Cómo probar
1. `npm run desktop`
2. Nueva estrategia (pon «0» o «no lo sé» en búsqueda previa).
3. Importar XML: elige estrategia + IS + Forward de la misma optimización.
4. Mira el historial y el contador; cierra y vuelve a abrir: debe persistir.
5. Exportar ledger → Importar ledger (copia de seguridad).
6. «Abrir análisis» debe comportarse como Lite (`?demo=1` sigue válido en esa ventana).
7. Vista MT5 / Runner: detectar instalaciones y estimar coste (sin lanzar si no hay MT5).

### Pendiente Fase 1 / siguiente
- Contador embebido junto a métricas en el informe Lite (parcial: visible en shell Desktop).

---

## 2026-09-24 — Fase 0 (saneamiento)

### Hecho
- Motor de cálculo movido a `core/` (`engine`, `analysis`, `stats`, `metrics`, `schema`, `parse`, `verdict`, `setfile`, `unseen`, `report`, `errors`).
- `core/rng.js` unificado (mulberry32); `demo.js` y `stats.js` lo reutilizan.
- `js/ui.js` partido en módulos ≤~600 líneas (`ui-state`, `ui-files`, `ui-audit`, `ui-chrome`, `ui-verdict`, `ui-plateaus`, `ui-unseen`, `ui-export`).
- README unificado: «fragilidad de la selección» y «contraste de selección sobre el Sharpe (adaptación)»; sección Temas al final.
- Detección de forward sospechosamente incompleto (`integrity.forwardSelectionSuspect`) + aviso en veredicto (FWD-1 mitigado, no verificado).
- Prueba de regresión `tests/regression.test.js` + fixture `tests/fixtures/demo-regression.json`.
- `docs/SPEC.md`, `docs/MT5_ASSUMPTIONS.md` (este changelog).

### Pendiente / no cerrado en Fase 0
- **SR-1** (cómo calcula MT5 el Sharpe del export): sigue pendiente de verificación manual en MT5.
- **FWD-1**: mitigado con aviso; falta confirmar con exports reales el comportamiento exacto de MT5.
- Reorganizar la app web bajo carpeta `web/` (arquitectura objetivo): aplazado.
- Verificación manual FWD-1 / SR-1 en MT5 (sigue pendiente).

### Trabajo Lite previo (aún puede estar sin commit limpio)
- Cobertura vs `.set`, copy DoF/Sharpe, UX evidencia débil, IS+Forward obligatorio, i18n del veredicto, etc.

---

## Cómo usar este archivo
Al cerrar cada fase: fecha, qué se hizo, qué falta, y supuestos MT5 pendientes.
