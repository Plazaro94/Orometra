# Supuestos sobre MetaTrader 5

Cada fila es una afirmación sobre el comportamiento de MT5. **No inventar:** verificar o dejar pendiente.

> Hasta el 2026-09-24 esta tabla incluía también los supuestos sobre el `.ini` del
> Strategy Tester (`INI-*`) y sobre la sonda MQL5 y su fichero `.orf` (`FRAME-*`,
> `ORF-1`, `PROBE-1`). Se retiraron junto con el runner de escritorio y la sonda: ver
> `docs/CHANGELOG.md`, entrada 2026-09-24. Siguen en el historial de git si se retoma
> esa vía.

| ID | Supuesto | Impacto en Orometra | Estado | Cómo verificar |
|---|---|---|---|---|
| FWD-1 | El export Forward de una optimización contiene **todas** las pasadas del IS (o un subconjunto de las mejores) | Emparejamiento IS/OOS y vecindades en forward; sesgo de selección | **Verificado: subconjunto de las mejores** (2026-09-28) | Export real de un usuario (optimización genética): 810 pasadas IS y 256 en el forward, y las 256 están entre las 258 primeras del IS por Result. Coincide con la ayuda de MT5: el forward prueba el 10 % mejor (búsqueda completa) o el 25 % (genética) según el criterio. El motor mantiene el aviso `integrity.forwardSelectionSuspect` cuando `oosRows < 95 %` de `isRows` (con ≥20 filas IS), porque la validación en forward se hace solo entre candidatas preseleccionadas |
| SR-1 | El «Sharpe Ratio» del export de optimización es **por operación** (no anualizado / no por barra de equity) | Error típico del contraste Lo y umbrales de azar | **Verificado como FALSO, y resuelto** (búsqueda en documentación MetaQuotes) | Desde el build 3210 del terminal (11 feb 2022), MT5 calcula el Sharpe sobre los log-retornos del equity **por barra**, anualizados a un intervalo de un año, con tasa libre de riesgo = 0 — no por operación. El export de optimización no dice cuántas barras usó cada Pass, así que un error típico basado en el número de operaciones no tiene base real. **2026-09-26**: se retiró el contraste tipo Lo (2002) por operaciones de `core/analysis.js`'s `sharpeTest`; el único contraste ahora es la dispersión de los Sharpe observados *entre pasadas* (estilo Bailey y López de Prado), que no depende de operaciones ni barras — es un hecho observable sobre la malla que de verdad se probó. Su sesgo conocido va siempre en la dirección seria (más estricto cuando hay señal real, nunca falsa confianza). Ver `docs/CHANGELOG.md` |
| SET-1 | Formato `.set` de inputs: `nombre=valor\|\|inicio\|\|paso\|\|fin\|\|Y/N` | Cobertura vs rango de búsqueda | **Parcial** | Parser `core/setfile.js` + exports reales; falta checklist contra doc oficial. Los .set que exporta Orometra van en UTF-16 LE con BOM, como los que guarda MT5 (2026-10-09); falta confirmar la carga en un terminal |
| XML-1 | El informe de optimización XML Spreadsheet trae métricas agregadas por Pass, no curvas de equity | Impide CSCV/PBO/DSR publicados | **Verificado** (limitación de producto documentada) | — |
| ZIP-1 | `.xlsx` es ZIP+XML; MT5 a veces reexporta así | Lector propio `js/xlsx.js` | **Verificado** en tests | — |
| FWD-2 | El forward es más corto que el in-sample, así que el mínimo de operaciones se escala por la proporción de duración, con un suelo de **30 operaciones** | `core/analysis.js` (`minTradesOos = max(30, minTrades × periodRatio)`) | **Decisión de diseño, no un hecho de MT5** | El suelo de 30 no sale de MT5: por debajo de unas 30 operaciones, el factor de beneficio y el drawdown de un periodo son casi puro ruido y cualquier configuración puede aprobar o suspender por azar. Se documenta aquí porque el usuario no lo fija |
| DEAL-1 | La tabla de transacciones del informe HTML de backtest solo trae la hora de **cierre** de cada operación, no la de apertura | `core/trades/from-deals.js` no puede calcular duración media de operación (`avgTradeDays`); el aviso de dominancia del swap usa solo el umbral que no depende de ella | **Verificado** por inspección de un informe real; si un build futuro añade hora de apertura, reintroducir el segundo umbral | — |

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
