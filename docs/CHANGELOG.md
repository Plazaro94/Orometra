# Changelog

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
