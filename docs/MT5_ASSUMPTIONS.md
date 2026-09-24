# Supuestos sobre MetaTrader 5

Cada fila es una afirmación sobre el comportamiento de MT5. **No inventar:** verificar o dejar pendiente.

| ID | Supuesto | Impacto en Orometra | Estado | Cómo verificar |
|---|---|---|---|---|
| FWD-1 | El export Forward de una optimización contiene **todas** las pasadas del IS (o un subconjunto de las mejores) | Emparejamiento IS/OOS y vecindades en forward; sesgo de selección | **Pendiente (mitigado)** | Misma optimización: contar filas IS vs Forward; comprobar si Pass IDs del FW ⊆ IS y si faltan los peores IS. El motor ya marca `integrity.forwardSelectionSuspect` y avisa en el veredicto si `oosRows < 95 %` de `isRows` (con ≥20 filas IS) |
| SR-1 | El «Sharpe Ratio» del export de optimización es **por operación** (no anualizado / no por barra de equity) | Error típico del contraste Lo y umbrales de azar | **Pendiente** | Comparar Sharpe del export con cálculo manual sobre nº de operaciones del mismo Pass; contrastar con ayuda MT5 / build. Hasta entonces el contraste se etiqueta como **adaptación**, no DSR publicado |
| SET-1 | Formato `.set` de inputs: `nombre=valor\|\|inicio\|\|paso\|\|fin\|\|Y/N` | Cobertura vs rango de búsqueda | **Parcial** | Parser `core/setfile.js` + exports reales; falta checklist contra doc oficial |
| XML-1 | El informe de optimización XML Spreadsheet trae métricas agregadas por Pass, no curvas de equity | Impide CSCV/PBO/DSR publicados en Lite | **Verificado** (limitación de producto documentada) | — |
| ZIP-1 | `.xlsx` es ZIP+XML; MT5 a veces reexporta así | Lector propio `js/xlsx.js` | **Verificado** en tests | — |
| INI-EXP | `[Tester] Expert` = ruta relativa bajo `MQL5\Experts` (sin `.ex5` o con, según build) | Runner genera `.ini` | **Pendiente** | Lanzar `/config` con EA de ejemplos y comprobar que arranca |
| INI-SYM | `Symbol` = nombre exacto del símbolo en el Market Watch del terminal | Fallo silencioso / sin ticks | **Pendiente** | Probar símbolo inexistente vs existente |
| INI-PER | `Period` acepta `M1`…`MN1` (texto) | Timeframe incorrecto | **Pendiente** | Doc oficial / trial con H1 |
| INI-MODEL | `Model` 0=every tick, 1=1-min OHLC, 2=open prices, 3=math calculations, 4=every tick based on real ticks | Calidad del backtest | **Pendiente** | Contrastar con UI del tester |
| INI-OPT | `Optimization` 0=off, 1=complete, 2=genetic (fast) | Tipo de búsqueda | **Pendiente** | Verificar valores en ayuda MT5 build actual |
| INI-CRIT | `OptimizationCriterion` numérico (0 balance, 1 profit factor, …) | Criterio de ranking | **Pendiente** | Tabla oficial de criterios vs export |
| INI-DATES | `FromDate`/`ToDate` formato `YYYY.MM.DD` | Periodo del test | **Parcial** | Usado en práctica por la comunidad; confirmar en doc |
| INI-FWD | `ForwardMode` 0=no, 1=½, 2=⅓, 3=¼, 4=`ForwardDate` | Periodo OOS automático | **Pendiente** | Probar cada modo y export forward |
| INI-DEP | `Deposit`, `Currency`, `Leverage` (p. ej. `1:100`) | Condiciones de cuenta simulada | **Pendiente** | Contrastar con UI |
| INI-EXEC | `ExecutionMode` = retardo en ms (0 sin retardo) | Realismo de fills | **Pendiente** | Doc «execution delay» |
| INI-REP | `Report` = ruta del informe; MT5 añade `.htm`/`.xml`; `ReplaceReport=1` sobrescribe | `collect.js` | **Pendiente** | Observar extensión real generada |
| INI-SHUT | `ShutdownTerminal=1` cierra el terminal al terminar; `Visual=0` sin visual | Jobs desatendidos | **Pendiente** | Job real y comprobar que el proceso termina |
| INI-INPUTS | `[TesterInputs]` `name=value\|\|start\|\|step\|\|stop\|\|Y\|N` | Espacio de búsqueda | **Parcial** (alineado con SET-1 / `.set`) | Mismo formato que `.set`; falta checklist doc oficial |
| INI-CFG | Arranque `terminal64.exe /config:"ruta.ini"` y opcional `/portable` | Runner | **Pendiente** | Job real Fase 2 en máquina con MT5 |
| INI-ORIGIN | `origin.txt` en `%APPDATA%\MetaQuotes\Terminal\<id>\` contiene la ruta de instalación | `detect.js` asocia data↔install | **Pendiente** | Inspeccionar `origin.txt` en un PC con MT5 |
| FRAME-1 | Límite de tamaño de un frame (`FrameAdd` double[]): hay un tope práctico por pasada; payloads muy grandes fallan o se truncan | Presupuesto de días activos × 6 doubles + cabecera; avisar si la estimación supera el tope | **Pendiente** | Optimización corta con payload creciente (muchos días sintéticos / muchas operaciones); anotar tamaño máximo aceptado y mensaje de error en el journal |
| FRAME-2 | Los frames funcionan con agentes locales; en **MQL5 Cloud Network** pueden no llegar al terminal, llegar incompletos o tener límites distintos | Si el usuario usa cloud, la app debe avisar y recomendar agentes locales para la sonda | **Pendiente** | Misma optimización local vs cloud; comparar nº de frames en `OnTesterDeinit` / tamaño del `.orf` |
| FRAME-3 | En optimización genética, solo se generan frames de las pasadas evaluadas (no de todo el espacio); el conjunto está sesgado por la búsqueda | WFO/PBO sobre genética ≠ exhaustivo; documentar y recomendar exhaustivo para validación | **Pendiente** | Optimización genética pequeña: contar frames vs pasadas listadas en el XML; confirmar si hay pasadas XML sin frame |
| ORF-1 | El fichero `.orf` en `FILE_COMMON` (`…/Terminal/Common/Files/Orometra/`) es float32 little-endian magic `ORF1` (ver `core/orf.js` y cabecera de `OrometraProbe.mqh`) | Lector Node y estimación de tamaño | **Definido en código** (no verificado aún contra un `.orf` real de MT5) | Compilar Demo EA, optimizar ~N pasadas, leer el `.orf` con `readOrfFile` y contrastar sumas diarias vs XML |
| PROBE-1 | `HistorySelect` + deals en `OnTester` reflejan el mismo P&L neto que `TesterStatistics(STAT_PROFIT)` / columna Profit del XML (tolerancia céntimos) | `verifyDailyPnLSums` | **Pendiente** | Tras ORF-1, comprobar `verifyDailyPnLSums` por pasada |

## Cómo verificar FWD-1 tú (en MT5)

1. Lanza una optimización con **Forward** activado (p. ej. 1/4 o fecha fija).
2. Exporta el informe de resultados del **in-sample** y el del **forward** (XML/XLS).
3. Cuenta filas de datos (sin cabecera) en ambos.
4. Anota: ¿tienen el mismo número de Pass? ¿Los Pass del forward son un subconjunto de los del IS?
5. Si el forward tiene **menos** filas, anota también si en el tester hay opción de «mostrar solo las mejores» / filtro de resultados.

Hasta tener esa evidencia, Orometra **no afirma** el comportamiento de MT5: solo detecta la asimetría de filas y advierte del posible sesgo.

## Cómo verificar SR-1 tú (en MT5)

1. Elige un Pass concreto del export y anota su Sharpe y su nº de operaciones.
2. Si tienes el informe HTML de backtest de ese Pass, calcula el Sharpe a mano sobre la lista de operaciones (media / desv. de resultados netos por operación).
3. Compara con la cifra del export. Si coinciden ≈ por operación, SR-1 queda **verificado**. Si la cifra del export es mucho mayor (p. ej. anualizada), hay que corregir el error típico en el motor.

## Cómo verificar FRAME-* / ORF-1 (Fase 3)

1. Copia `mql5/OrometraProbe.mqh` a `MQL5/Include/` y compila `mql5/examples/OrometraDemoEA.mq5` (o usa `desktop/main/mt5/instrument.js` + `compile.js`).
2. En el Strategy Tester, optimiza FastMA/SlowMA (exhaustivo, agentes **locales**, sin cloud) con `OrometraExperimentId` = p. ej. `demo_fase3`.
3. Al terminar, mira `%APPDATA%\MetaQuotes\Terminal\Common\Files\Orometra\demo_fase3.orf` (+ `.json`).
4. Anota: nº de pasadas en el XML vs `nPasses` del `.json`; si faltan frames → FRAME-2/FRAME-3.
5. Con la app/pruebas: suma de P&L diarios por pasada ≈ Profit del XML (`verifyDailyPnLSums`, tolerancia 1 céntimo).
6. Repite un run breve en **Cloud Network** si puedes: si el `.orf` queda vacío o incompleto, FRAME-2 queda confirmado como limitación.
