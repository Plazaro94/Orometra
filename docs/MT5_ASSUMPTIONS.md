# Supuestos sobre MetaTrader 5

Cada fila es una afirmación sobre el comportamiento de MT5. **No inventar:** verificar o dejar pendiente.

> Hasta el 2026-09-24 esta tabla incluía también los supuestos sobre el `.ini` del
> Strategy Tester (`INI-*`) y sobre la sonda MQL5 y su fichero `.orf` (`FRAME-*`,
> `ORF-1`, `PROBE-1`). Se retiraron junto con el runner de escritorio y la sonda: ver
> `docs/CHANGELOG.md`, entrada 2026-09-24. Siguen en el historial de git si se retoma
> esa vía.

| ID | Supuesto | Impacto en Orometra | Estado | Cómo verificar |
|---|---|---|---|---|
| FWD-1 | El export Forward de una optimización contiene **todas** las pasadas del IS (o un subconjunto de las mejores) | Emparejamiento IS/OOS y vecindades en forward; sesgo de selección | **Pendiente (mitigado)** | Misma optimización: contar filas IS vs Forward; comprobar si Pass IDs del FW ⊆ IS y si faltan los peores IS. El motor ya marca `integrity.forwardSelectionSuspect` y avisa en el veredicto si `oosRows < 95 %` de `isRows` (con ≥20 filas IS) |
| SR-1 | El «Sharpe Ratio» del export de optimización es **por operación** (no anualizado / no por barra de equity) | Error típico del contraste Lo y umbrales de azar | **Pendiente** | Comparar Sharpe del export con cálculo manual sobre nº de operaciones del mismo Pass; contrastar con ayuda MT5 / build. Hasta entonces el contraste se etiqueta como **adaptación**, no DSR publicado |
| SET-1 | Formato `.set` de inputs: `nombre=valor\|\|inicio\|\|paso\|\|fin\|\|Y/N` | Cobertura vs rango de búsqueda | **Parcial** | Parser `core/setfile.js` + exports reales; falta checklist contra doc oficial |
| XML-1 | El informe de optimización XML Spreadsheet trae métricas agregadas por Pass, no curvas de equity | Impide CSCV/PBO/DSR publicados | **Verificado** (limitación de producto documentada) | — |
| ZIP-1 | `.xlsx` es ZIP+XML; MT5 a veces reexporta así | Lector propio `js/xlsx.js` | **Verificado** en tests | — |
| DEAL-1 | La tabla de transacciones del informe HTML de backtest solo trae la hora de **cierre** de cada operación, no la de apertura | `core/matrix/from-deals.js` no puede calcular duración media de operación (`avgTradeDays`); el aviso de dominancia del swap usa solo el umbral que no depende de ella | **Verificado** por inspección de un informe real; si un build futuro añade hora de apertura, reintroducir el segundo umbral | — |

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
