# Changelog

## 2026-10-17 — El .set de la optimización, con su propio recuadro en la comprobación de datos

La comprobación de datos enseñaba dos recuadros (optimización y forward) y el .set solo salía
como una línea suelta bajo la caja. Ahora tiene un tercer recuadro: con el .set cargado, su
nombre, los parámetros que trae y cuántos se optimizaron; sin él, vacío y con «Opcional: se
analiza igual sin él». El nombre del .set sale también en la caja de carga y en el resumen que
queda tras analizar. Si solo se ha soltado el .set, la comprobación aparece y dice que falta la
optimización.

## 2026-10-15 — Monte Carlo: la enmienda 7 no cambia nada; el apartado queda cerrado

Última ronda del método (enmienda 7, aprobada por delegación del autor): dos detectores de
volatilidad más robustos (V1, sobre |e|; V2, sobre rangos) y una puerta de días con operaciones
esperados en el horizonte para la previsión a 3 meses. Calibración con los casos 1-500 de siempre
(`bench/results/REPORT-MC-e7-calib.md`), tal como salió:

- **Por la regla fijada de antemano no se elige ningún cambio.** Exigía que la variante siguiera
  apta a 12 meses desde 2 años, y en esta calibración tampoco la actual lo es (un suspenso del
  lado prudente en el EA de muy baja frecuencia, como en la calibración 4). Y la puerta nueva no
  hace falta en la calibración (3 meses ya aprueba sin ella), así que lo elegido es justo lo que
  ya se examinó. Examinar otra vez lo mismo con casos nuevos sería repetir el examen hasta que
  salga bien: **no hay examen 2** y queda como estaba (sin 3 meses).
- **Fallo de redacción, declarado:** la intención era «no peor que el detector actual». Con esa
  lectura habría salido V2, que niega menos cifras a los EAs con colas gruesas (11,3 % frente a
  13,4 %) y daría 6 meses desde 1 año. No se aplica: cambiar la regla después de ver los datos es
  lo que el prerregistro prohíbe. Queda para una versión futura, con prerregistro nuevo.
- Con el histórico completo del autor, el detector actual salta (p < 0,001) y V1 y V2 no.
- El aviso de la app ya no dice «lo estamos mejorando»: dice que se probaron dos detectores más
  robustos y que ninguno cumplió las condiciones fijadas de antemano.

Con esto el Monte Carlo queda terminado en esta versión (`docs/MONTECARLO.md`, «Cierre»).
## 2026-10-15 — Contraste del Sharpe: el umbral cuenta todas las pasadas (séptimo examen)

El umbral del contraste del Sharpe cuenta ahora como pruebas todas las pasadas que entran en él,
no las zonas distintas del espacio. Prerregistrado antes de generar el examen (enmiendas del
2026-10-15 en `bench/PREREGISTRO.md`) y examinado una sola vez en las semillas 7001-7100, con el
motor anterior al lado (`REPORT-exam7.md`, `REPORT-exam7-motor-6689445.md`).

- **Examen:** en el escenario de ruido puro, el umbral se supera en 2 de 68 casos (2,9 %); con el
  umbral anterior, en 34 de 68 (50 %). Falsos positivos 0,3 % (antes 0,7 %), potencia 89,5 %
  (igual), coherencia de niveles, y la misma elección en los 800 casos. Cambian 24 niveles, todos
  a «débil»: 23 con ventaja y una «buena» sin ventaja. Cumple los dos criterios: se adopta.
- **Motor** (`core/analysis.js`): N = pasadas del contraste. `sharpeTest.trials` es ese N y
  `sharpeTest.totalPasses` las pasadas totales. Las zonas del espacio se siguen usando en la
  expectativa ajustada.
- **Textos:** el hallazgo del veredicto dice cuántas pruebas cuenta y que, si las vecinas se
  parecen, el listón queda algo más alto de lo necesario; un análisis guardado antes conserva su
  texto. Diagnóstico enseña las pasadas que cuentan como pruebas. Metodología lo explica y dice
  lo que pasaba antes. Fuera la entrada del glosario de las pruebas efectivas.
- **Portada y Metodología** citan el séptimo examen: 1 falsa alarma de 300 (0,3 %) y ninguna
  «sólida»; 34 de 38 ventajas detectadas (89 %); gana a la suma de puestos y en la rejilla real,
  pierde por muy poco con la media con vecinas (0,213 frente a 0,211) y con la n.º 1 de MT5 en
  genética. Las rejillas de puntos, al día (la de 38, en columnas de 4).
- **En la app:** el ejemplo «sin ventaja» ya no dice «A favor: el mejor Sharpe supera el umbral
  del azar»; ahora es un hallazgo en contra (el nivel sigue en «débil»). El ejemplo con meseta
  sigue en «sólida» (umbral 2,50 frente a 2,03; fixture de regresión regenerado).
- Pruebas: N y los textos nuevo y anterior (`tests/audit-2026-10c.test.js`,
  `tests/audit-2026-09b.test.js`) y la portada contra el séptimo examen
  (`tests/home-bench.test.js`).

## 2026-10-15 — Contraste del Sharpe: el puro ruido supera el umbral el 37 % de las veces, no el 5 %

Medición en el banco, **sin cambiar el motor** (`bench/sharpe.js`, informe en
`bench/results/REPORT-calib-sharpe.md`). La app dice que, sin ventaja real, el mejor Sharpe
superaría el umbral solo el 5 % de las veces. En el escenario de ruido puro (S1) lo supera en
50 de 134 casos (37 %), entre la calibración y el sexto examen.

- Causa: el umbral cuenta las «pruebas efectivas» (las celdas del espacio grueso, de 18 a 24),
  pero en el banco los Sharpe del forward de vecinas no están correlacionados y el máximo es el
  de todas las pasadas (de 220 a 264). Contando todas las pasadas (variante B), el ruido puro lo
  supera en 6 de 134 (4,5 %).
- Con B cambian 18 niveles en la calibración y 25 en el examen, todos con ventaja, a «débil».
  La potencia baja del 92,7 % al 87,8 % y del 96,9 % al 93,8 % (sigue por encima del 80 %). Los
  falsos positivos no suben y la coherencia de niveles se mantiene.
- Una variante exploratoria (ruido medido con las diferencias entre vecinas) no está calibrada
  en S5 (38 % en la calibración, 13 % en el examen) y se descarta.
- Corrige lo que se dijo el 2026-10-10 («en los 16 casos sin ventaja, el contraste del Sharpe
  aprueba porque la suerte por zonas del forward es real»): sin esa suerte aprueba igual
  (S1). La causa es el número de pruebas.
- Límite: en un EA real las vecinas comparten operaciones y sus Sharpe pueden estar mucho más
  correlacionados que en el banco. Con eso, B es prudente de más; A, en cambio, promete un nivel
  que no cumple. No hay exports reales en el repositorio para medirlo.
- El autor decidió adoptar B con prerregistro y examen: ver la entrada de arriba.

## 2026-10-15 — Calidad del historial y caída de equidad frente a la de balance

- La ficha del informe enseña la «Calidad del historial» tal como la da MT5. El informe no dice
  qué modelado de ticks se usó, y no se sabe qué umbral de esa calidad haría poco fiable un
  backtest, así que se enseña sin juzgarla.
- El Monte Carlo mide la caída de balance (operaciones cerradas). Ahora dice además cuánto mayor
  fue en el informe la caída máxima de equidad, que cuenta lo que estaba abierto (con el informe
  real del autor, un 10 % mayor: 18.667 frente a 17.020).
- El lector del informe lee la reducción máxima del balance y la de la equidad en dinero, y la
  calidad del historial, con su prueba.

## 2026-10-15 — La prueba de fuego usa también la fecha de corte

La pregunta «¿Este informe incluye días que miraste para elegir?» sube a la ficha del informe y
vale para toda la pestaña: la prueba de fuego (el contraste con la meseta), el historial de
intentos y el Monte Carlo hablan de los mismos dos trozos. Antes, con un backtest de todo el
histórico, el contraste mezclaba los días usados para elegir con los de después.

- Con la fecha, el contraste usa solo lo de después, con las cifras calculadas desde las
  operaciones (`core/trades/mc-report.js#summaryFromDeals`): operaciones, beneficio y factor de
  beneficio, como MT5. Con el informe real del autor salen exactas (1.303 operaciones, 204.413,43 y
  1,464124), contando la comisión de la apertura como una transacción aparte, que es como lo hace
  MT5; el lector guarda ahora esa comisión por separado.
- El drawdown, el factor de recuperación y el Sharpe no se pueden reproducir desde las operaciones
  (MT5 los mide con la equidad y con su propia fórmula): se quedan en blanco y se dice por qué.
- Medido antes de cambiar nada (`bench/results/unseen-2026-10-15.txt`, `node bench/unseen.js 100
  --solo-operaciones`): con tres cifras el contraste avisa menos. Sin ventaja, 18-29 % (con las
  seis, 35-45 %); con la ventaja intacta, 8-13 % de falsas alarmas (con las seis, 24-30 %). La
  pantalla y la metodología lo dicen, y proponen un backtest de MT5 solo de esas fechas para la
  comparación completa.
- La comparación que se hizo con el informe entero deja de contar como otro intento al dar la
  fecha (no valía); cambiar la fecha varias veces sí cuenta.
- Arreglado de paso: una cifra que el informe no trae salía como «NaN» en el formulario.

## 2026-10-15 — Monte Carlo: backtest largo, antes y después de elegir

Si el informe incluye días que se miraron para elegir la configuración, la sección del Monte
Carlo pregunta hasta qué día, y parte las operaciones en dos: antes y después de elegir.

- Cada operación cuenta el día que se cerró; si se abrió antes de esa fecha y se cerró después,
  va a «después» y se dice cuántas hay (el lector del informe guarda ahora la hora de apertura).
- La radiografía sale de los dos trozos, en una tabla (caída real, cuántos órdenes darían una
  caída mayor y si el orden fue favorable, normal o desfavorable) y con el gráfico del que se elija.
- La previsión se calcula solo con lo de después, con las mismas condiciones que antes. Una fecha
  fuera del informe se dice con el periodo real.
- Una primera versión separaba también el periodo optimizado del forward; con el autor se vio que
  confundía, y se quedó en dos trozos.
- Pruebas: `tests/mc-report.test.js` (reparto, fechas que no valen, la previsión mira solo lo de
  después), la hora de apertura en `tests/report.test.js` y el flujo en el navegador.

Sigue igual: el contraste con la meseta usa las cifras del informe entero.

## 2026-10-15 — Monte Carlo en la app: radiografía y previsión

En la pestaña del periodo no visto, sobre las operaciones del informe (pendiente del visto bueno
del autor para publicar):

- **Radiografía** (con 30 operaciones o más): los mismos días en otro orden, con el gráfico de
  curvas de balance, las bandas y la curva real; dice si el orden fue afortunado y cuál sería la
  racha de pérdidas normal. Etiqueta fija: no es una previsión.
- **Previsión a 6 y 12 meses** (M2bc) solo con 2 años de operaciones, 100 días con operaciones,
  sin rachas ni volatilidad agrupada, con el informe de la configuración elegida, sin un periodo
  repetido ni otra meseta comparada con esas fechas, y tras confirmar el usuario que no las usó
  para elegir. Si falta algo, el mismo sitio dice qué y por qué. A 3 meses, nada.
- **Tipo de lote** deducido de las operaciones (`core/trades/sizing.js`) y corregible: lote fijo
  o riesgo fijo en dinero (se trabaja en dinero), proporcional (en %) o martingala (sin cifras).
- El cálculo va en el worker: la radiografía tarda 0,1-0,2 s; la previsión, unos 2 s en
  escritorio con el informe real del autor.
- Pruebas nuevas: `tests/sizing.test.js`, la regla de «otra meseta en las mismas fechas» en
  `tests/history.test.js` y una sección del navegador con informes sintéticos
  (`tests/helpers/backtest-report.js`).

## 2026-10-15 — Monte Carlo: el examen aprueba; también la radiografía

Examen de M2bc (`bench/results/REPORT-MC-exam1.md`), con casos nuevos, el método congelado y el
mínimo de 100 días con operaciones fijado de antemano, ejecutado una sola vez: apto para prever
**6 meses desde 1 año** de datos no usados para elegir y **12 meses desde 2 años**; **no apto a
3 meses** (demasiado prudente con EAs muy poco frecuentes, y corto con rachas o volatilidad
agrupada con 6 meses de datos). Se cumple el criterio de descarte vigente (6 meses con 2 años).
La calibración había pedido 2 años para los 6 meses: la volatilidad agrupada con un año de datos
es un punto débil. Lo informativo confirma la calibración: con la configuración elegida entre 100
o más, el drawdown supera su p95 un 11-27 % de las veces.

La radiografía (los mismos días en otro orden; no es una previsión) aprueba su prueba
(`bench/results/REPORT-RADIO-1.md`): en todos los procesos exigidos, también en los días reales
del EA del autor, el percentil del drawdown real se reparte por igual entre los diez décimos.

La app todavía no cambia: falta la interfaz, con capturas para el visto bueno del autor, y la
revisión externa (la interfaz, en la entrada de arriba).

## 2026-10-15 — Monte Carlo: calibración 4 completa; M2bc, el método candidato

Tras cinco enmiendas al prerregistro (todas registradas antes de medir y con los resultados
anteriores conservados en `bench/results/`), la calibración 4 (casos 1-1.000; M2bc, 1-500)
deja un método candidato, **M2bc**: bootstrap bayesiano por bloques con el nivel calibrado por
doble bootstrap, detrás de tres puertas (rachas, volatilidad agrupada y un mínimo de 100 días con
operaciones). Con las reglas corregidas (comprobadas antes con métodos simulados: uno perfecto
aprueba el 97,5 % de las veces), M2bc es apto para prever 3 meses desde 1 año de datos y 6 meses
desde 2 años. No llega a 6 meses con 1 año, que era el criterio de descarte: la volatilidad
agrupada con un año de datos solo se detecta en un 70 % de los casos y en el resto el método se
queda corto. En los días reales del EA del autor (G12), el drawdown supera el p95 de M2bc entre
un 2,5 % y un 6,6 % de las veces (ideal, 5 %).

Por el camino se encontraron y corrigieron tres errores de diseño propios: dos criterios del
prerregistro que ningún método podía cumplir, unas reglas que habrían suspendido por azar a un
método perfecto y un método (M2) que contaba dos veces la incertidumbre. Y se confirma, con 1.000
casos por celda, que con la configuración elegida entre 100 o más el drawdown supera su p95 entre
un 12 % y un 32 % de las veces: la app no dará previsiones con el periodo usado para elegir.

La app no cambia: el Monte Carlo sigue retirado. Falta la decisión del autor sobre el criterio de
descarte y, si procede, el examen con casos nuevos.

## 2026-10-14 — Informe de backtest comprobado con datos reales

Tres informes reales del probador del autor, en `.xlsx` y de un terminal en español, con comisión
y swap (de 164 a 1.303 operaciones). Orometra los lee enteros; la suma de las operaciones da
exactamente el beneficio neto de cada informe, y el valor del contrato que usa el stress de
costes sale igual en todas las operaciones que lo permiten. Queda apuntado como REP-1 en
`docs/MT5_ASSUMPTIONS.md`. Sin probar todavía: el formato `.html` (otro lector) y una cuenta de
cobertura con varias posiciones abiertas a la vez (en esos informes nunca hubo más de una). Los
archivos no se suben al repositorio.

## 2026-10-14 — Limpieza general: lo que se veía mal, documentación al día y código muerto fuera

Auditoría de todo el repositorio buscando lo huérfano, lo desfasado y lo que no cuadraba. Nada
cambia en el motor: la regresión de la demo da el mismo JSON y el banco no se ha vuelto a pasar
porque ningún cálculo se ha tocado.

- **Lo que veía el usuario.** Desde `/es/`, con el navegador en inglés, la app se abría en
  inglés: las páginas en español la enlazan ahora con `?lang=es` (`tools/build-es.js`), que
  `js/theme-init.js` respeta si no hay idioma elegido. La 404 en español llevaba «Quiénes
  somos» a la versión inglesa. Metodología (paso 4) y el README decían que la elección gana a
  la suma de puestos, y en el sexto examen pierde (0,258 frente a 0,236): corregido, con una
  prueba que lo ata a `REPORT-exam6.md`. «Puertas/gates» por «mínimos/minimums» en la barra
  de progreso y en un hallazgo en inglés.
- **Caché de la hoja de estilos.** `styles.css?v=` se subía a mano y llevaba cinco cambios sin
  subir. Ahora es la huella del contenido y la pone `tools/build-es.js`; `npm test` falla si
  no está al día.
- **Política de seguridad:** fuera `blob:` de `worker-src` (no hay workers desde `blob:`).
  `tools/serve.js` sirve las fotos con su tipo y la 404 como Pages.
- **Documentación.** SPEC (principio 4 como funciona de verdad: se descubre en el in-sample y
  el forward valida; árbol de archivos), DEPLOY (política, almacenamiento), MT5_ASSUMPTIONS
  (DEAL-1: la hora de apertura sí viene, en la fila de entrada; fuera la guía para verificar
  SR-1, ya resuelto), prerregistro y `bench/results/LEEME.md` al día con el sexto examen y con
  todo lo posterior al quinto; CLAUDE.md y README dicen qué genera `build-es.js`. Referencias
  a archivos y funciones que ya no existen, corregidas.
- **Banco.** Fuera `calib.jsonl` y `test.jsonl` (copias exactas de `*-c948971-n100.jsonl`),
  `REPORT-test.md` (copia de `REPORT-test-c948971-n100.md`), `REPORT-calib.md` (regenerado como
  `REPORT-calib-c948971-n100.md`, mismas cifras) y `calib-S1_S3.jsonl` (prueba suelta de 6
  casos). Las tandas comparten las semillas de `bench/sim.js#seedBase`: un nombre desconocido
  ya no cae en silencio en las de la calibración (`orden-tabla.js exam6` lo hacía).
- **Código muerto.** Fuera `rawValue`, `setGrid`, `ENGINE_DEFAULTS.denseCoverage`, la clave
  `home.trust`, el texto de `ANALYSIS_SUCCESS` (nunca se pintaba), una comprobación de
  cancelar que no podía cumplirse, datos que se pasaban al veredicto y nadie leía, la copia
  `stabilityCheck.internal`, imports sin usar, entradas de `api` sin uso y 11 clases de CSS
  que ningún elemento lleva. Una sola versión de `isZip`, `esc`, `mt5Figure` y del tope de
  desplazamientos de la vecindad. Los motivos de los picos descartados usan los umbrales con
  que se analizó también al cambiar de idioma.
- **Herramientas.** `tools/audit.js` lee `.xlsx` y escribe sin etiquetas HTML;
  `tools/sensitivity-study.js` enseña la nula barajada que ya calculaba.
- **Pruebas que no probaban:** `audit-fixes` comprobaba la meseta sobre una rejilla sin
  ninguna (pasaba siempre); `smoke` aceptaba `aria-hidden` por `hidden`. `source.test.js`
  revisa también `core/trades/`, `bench/` y `tools/`.
- **Pendiente, a propósito:** el código sin uso de `core/trades/` (avisos de `risk.js` que nunca
  saltan, opciones de costes que nadie pasa) y su texto en `js/ui-unseen.js` se quitan cuando
  se integre la rama del Monte Carlo, que está reescribiendo esa parte.

## 2026-10-14 — Portada y Metodología citan el sexto examen (el del motor actual)

Citaban el quinto, hecho con el motor anterior. Ahora, con el sexto (semillas 6001-6100, a
ciegas, motor actual):

| | Quinto examen | Sexto examen |
|---|---|---|
| Falsas alarmas («moderada» o más sin ventaja) | 10 de 300 (3,3 %) | 4 de 300 (1,3 %) |
| De ellas, «sólida» | ninguna | 1 |
| Ventajas detectadas | 34 de 40 (85 %) | 31 de 32 (97 %) |
| Elección: Orometra / n.º 1 de MT5 | 0,23 / 0,29 | 0,26 / 0,30 |
| Criterios superados | 10 de 13 | 11 de 13 |

- **Portada:** cifras, textos y las dos rejillas de puntos (4 de 300 y 31 de 32). La rejilla
  pequeña pasa de 10 × 4 a 8 × 4 columnas con el mismo paso que la grande (clase
  `hm-dots-small`).
- **Metodología, «Cómo sabemos que funciona»:** las cifras, el enlace a `REPORT-exam6.md` y lo
  que falla en ese examen (B3 y B4, por contar como fallo cada caso sin meseta; la «sólida»
  sin ventaja, dentro del 1 % fijado). Ya no dice que el sobreajuste puro pase del 5 % (en el
  sexto, 3 %) ni que la n.º 1 de MT5 gane por más de lo permitido en la rejilla real.
- `tests/home-bench.test.js` lee ahora el sexto examen y comprueba esas frases.

## 2026-10-14 — El suspenso frente a «media con vecinas», explicado con cifras

En el banco, Orometra suspende frente a B4 («media con vecinas») y B3. No es la elección
dentro de la meseta: cuando Orometra propone meseta gana a B4 (0,145 frente a 0,164 en el
sexto examen), y contando la sugerencia orientativa también (0,191 frente a 0,213). El
suspenso sale de contar cada caso sin meseta como el peor resultado, una regla exigente
fijada a propósito en el prerregistro. Se mantiene, y no se relajan los umbrales para
abstenerse menos (subirían los falsos positivos). Metodología lo dice ahora con cifras, y la
tabla completa está en `bench/PREREGISTRO.md` (enmienda (e) del 2026-10-14).

## 2026-10-14 — Orden entre mesetas: medido en un escenario nuevo, se queda como está

Con el export auditado, Orometra pone primera una meseta grande que aguanta el forward a
medias por delante de una pequeña que lo aguanta entera. El banco no
tenía casos así, así que no podía decir qué orden acierta. Se ha medido, con todo fijado antes
de generar ningún caso (`bench/PREREGISTRO.md`, enmiendas (b), (c) y (d) del 2026-10-14):

- **Escenarios nuevos.** S9: de 5 a 7 parámetros (2 a 4 relevantes), de 2 a 4 zonas buenas
  con anchura y altura sorteadas, muestreo genético y forward del 25 % mejor. S10: su gemelo
  sin ventaja fuera del periodo optimizado.
- **Tres reglas:** la actual (R0); ordenar cada meseta por lo que se espera de ella en un
  periodo nuevo (R1, con el modelo de «qué esperar»); y por su límite inferior (R2).
- **Resultado en la calibración:** arrepentimiento mediano en S9 de 0,187 con R0, 0,193 con R1
  y 0,173 con R2 (hacía falta bajar al menos 0,02). R1 y R2 empeoran S6 en 0,019. Cuando R1
  cambia la elegida, acierta tantas veces como falla (8 y 8 de 16). **Se queda R0.**
- Lo que se aprende: ordenar por lo que se espera no elige mejor que la regla actual. En el
  banco no se ha encontrado que preferir la meseta que aguanta el forward entera, frente a la
  grande que lo aguanta a medias, mejore la elección; el aviso crítico sobre el forward sigue
  saliendo, que es lo que toca.
- Las dos reglas nuevas quedan en el motor como opción del banco (`plateauRank`), sin uso en
  la app. Las semillas de examen 7001-7100 siguen sin generar.

## 2026-10-14 — Auditoría estadística con un export real: qué esperar de la recomendada, Sharpe al 95 %, procedencia

Se auditó como lo haría un quant un export real de MT5 (un EA sobre un índice en M15: unas
10.000 pasadas genéticas, la mitad con forward, y su `.set`). Orometra reproducía sus cifras, pero tres cosas
no aguantaban la revisión, y faltaba la que más importa para planificar.

**Qué esperar de la recomendada (nuevo, `core/shrink.js`).** Lo que una configuración saca
de más en el periodo optimizado es en parte suerte, y la recomendada, por construcción, es de
las que mejor salieron. Ahora la app da su beneficio esperado por operación descontada esa
suerte, junto a la cifra del forward («unos X por operación, no los Y del forward»), y
dice si se distingue de una configuración cualquiera de las que cumplen tus mínimos.
- Modelo de efectos aleatorios. Toda la selección (genético, mínimos, preselección del forward
  de MT5) depende solo del in-sample, así que se estima con lo único que esa selección no
  sesga: la regresión del forward sobre el in-sample (pendiente y residuo) y el número de
  operaciones. Cada candidata se mide con su vecindad, que es con lo que Orometra elige.
- Medida contra la verdad del banco (`bench/shrink.js`). En el sexto examen, con ventaja real:
  error 6,7 frente a 10,4 de la cifra del forward y 10,7 de la del periodo optimizado; sesgo
  −2,3 (prudente: se queda corta, no se pasa). Sin ventaja real, la app dice que la
  recomendada se distingue de la familia el 5 % de las veces en calibración y el 9 % en el
  examen (5 de 56), y así lo dice el texto.
- Solo se da el **límite inferior** de la ventaja sobre la familia: ningún intervalo de dos
  lados cubría el 95 % que habría dicho (ocho variantes probadas,
  `bench/results/REPORT-shrink-variantes-2026-10-14.md`). Tampoco hay intervalo del total: su
  mayor incertidumbre es el régimen del próximo periodo, y con un solo forward no se mide.
- No mueve el nivel de evidencia (su peso en los niveles no está calibrado). Sale en la
  tarjeta de la recomendada, en un hallazgo de Estadística, en el resumen de texto, en el
  informe JSON y en `tools/audit.js`.
- Con el export auditado: la recomendada da por operación lo mismo que la familia; la
  alternativa que mejor salió en el forward se queda en algo más de la mitad de su cifra
  del forward, y tampoco se distingue de la familia. De cada 100 que una configuración saca de más en el periodo optimizado, en el
  forward conserva unas 17 (entre 10 y 26).

**Contraste del Sharpe: percentil 95, no la media.** El umbral era el máximo *esperado* de N
pruebas sin ventaja, y el máximo de puro ruido supera su media en torno al 43 % de las veces:
«supera el umbral del azar» no tenía ningún nivel de confianza. Ahora es el percentil 95 del
máximo, Φ⁻¹(0,95^(1/N)), exacto bajo independencia, y el texto dice que por azar se superaría
el 5 % de las veces. En calibración baja de nivel 5 casos de 800, todos con ventaja; falsos
positivos y potencia no cambian. Con el export auditado, el mejor Sharpe sigue superándolo.

**Procedencia.** Una sola pasada cuyo Back Result no cuadraba daba un crítico, «los
dos archivos no parecen de la misma optimización», con todas las demás idénticas. Mezclar
exportaciones cambia casi todas las filas (por encima del 2 % ya se rechazaba el análisis): por
debajo del 1 % ahora es un aviso que nombra las pasadas y no mueve el nivel.

**Dos textos que decían más de lo que se mide.** «La nota de Orometra conserva el orden de las
configuraciones» salía con una correlación de rangos de la nota de 0,08: lo que se mide es si
la mejor de una mitad al azar aguanta en el otro periodo. Ahora lo dice así y, si la
correlación es baja, añade que el orden completo apenas se conserva.

**Medido y sin cambiar: el orden entre mesetas.** Con el export auditado, la meseta
recomendada (muy grande, aguanta el forward a medias) queda por delante de una pequeña que
lo aguanta entera. Quitar o reforzar el peso del forward al ordenar no se distingue en el
banco: solo 34 de 800 casos tienen más de una meseta. Sin pruebas no se toca; hace falta un
escenario nuevo, prerregistrado antes de generarlo (`bench/PREREGISTRO.md`, enmienda del
2026-10-14).

**Sexto examen del banco** (semillas 6001-6100, a ciegas, una sola vez): aprueba falsos
positivos, potencia (96,9 %) y coherencia; **suspende la elección frente a B3 y B4**, igual que
el motor anterior con esas semillas, que elige lo mismo en los 800 casos.
## 2026-10-14 — Primer informe real de MT5: se lee bien y corrige el diseño del Monte Carlo

Con un backtest real del autor (NDX M15, terminal en español, .xlsx, 1.303 operaciones de
2018 a 2026; los archivos no se guardan en el repositorio), el lector de la app cuadra al
céntimo con el resumen del informe: beneficio neto, comisiones, swap, emparejamiento de las
1.303 operaciones con su apertura y valor del contrato. Los parámetros coinciden con el .set
de la configuración elegida.

Dos correcciones al diseño (`docs/MONTECARLO.md`, 4.5, 5.1 y 5.2):

- El EA arriesga una cantidad fija en dinero (≈ 1.000 por stop todos los años) con un lote
  que cambia con el precio. Deducir el dimensionado por el lote habría fallado; se hará por lo
  que se pierde cuando salta el stop.
- Sumar el día entero escondía un 6 % del drawdown (15.974 frente a 17.015 operación a
  operación, y 17.020 en el informe): se remuestrearán días, pero el drawdown se medirá
  recorriendo sus operaciones en orden.

## 2026-10-13 — Monte Carlo: reglas del banco congeladas

`bench/PREREGISTRO-MONTECARLO.md`, escrito antes de implementar nada: nueve procesos con verdad
conocida (siete exigidos; cambio de régimen y sesgo de selección solo se informan), muestras de
63 a 1.008 días, horizontes de 3, 6 y 12 meses, cuatro métodos (el retirado como referencia),
bandas de aprobado cerradas y **criterio de descarte**: si ningún método prevé bien seis meses
con un año de datos, el Monte Carlo no vuelve a la app. Umbral aceptado por el autor de forma
provisional.

## 2026-10-13 — Periodo no visto: fuera el Monte Carlo y el intervalo de la media

Decisión D1 de `docs/MONTECARLO.md`. En la sección «Desde tus operaciones» ya no salen el
resultado mediano y su rango P05–P95, la caída máxima esperada ni la probabilidad de pérdida a
3/6/12 meses: frente a un futuro del mismo proceso, el drawdown superaba su p95 entre un 10 % y
un 23 % de las veces (debía ser un 5 %). En su lugar, una línea que lo dice y que avisa de que
volverá cuando apruebe unas pruebas fijadas de antemano.

También sale el **intervalo del 90 % del resultado diario medio**: medido contra la media
verdadera, la dejaba fuera entre un 12 % y un 22 % de las veces en vez del 10 %
(`bench/muestra-exploratorio.js`). Se quedan los días de datos, «¿se distingue de cero?»
(sin ventaja real dice que sí en torno a un 1 % de las veces; con rachas, un 6-7 %) y el
stress de costes.

- `core/trades/from-deals.js` ya no calcula el bootstrap; `meanConfidenceInterval` sigue en
  `core/` (lo usan sus pruebas), con una nota de que no se enseña.
- Textos ES/EN: la guía de sobreoptimización, la del informe del probador y la metodología ya
  no prometen un Monte Carlo; en el diagrama del paso 9, «Monte Carlo» pasa a «Frente a su
  meseta», que es la comprobación principal de ese paso y no salía.
- README y CLAUDE.md, al día.

## 2026-10-13 — Monte Carlo: diseño de un módulo propio y un hallazgo sobre el actual

Propuesta de diseño en `docs/MONTECARLO.md`, sin código de producto: un módulo de Monte Carlo
dentro de Orometra (no una herramienta aparte), usable con o sin las mesetas, que toma **un**
backtest de la configuración sobre todo el histórico y las fechas de corte, y separa lo que se
usó para elegir (sesgado a favor) de lo que no (la prueba limpia). Candidato: bootstrap
predictivo en dos etapas con bloques elegidos con los datos (Politis-White con la corrección
de 2009). Lleva un borrador de prerregistro del banco con **criterio de descarte**: si con un
año de datos no se alcanza la calibración exigida, no se construye.

**Hallazgo** (estudio exploratorio, no prerregistrado: `bench/montecarlo-exploratorio.js`,
`bench/results/montecarlo-exploratorio.txt`): los rangos del Monte Carlo que enseña hoy la
sección del periodo no visto son más estrechos de lo que deberían. Frente a un futuro del
mismo proceso, sin sesgo de selección, el resultado cae fuera del P05–P95 en un 26-38 % de los
casos (ideal, 10 %) y el drawdown supera el p95 en un 10-23 % (ideal, 5 %). Causa principal:
el bootstrap es *plug-in* y no cuenta lo que no se sabe de la media; con datos independientes
la teoría da un 24,5 % fuera del P05–P95 y el estudio, un 22-29 %. La app no cambia todavía:
qué hacer con esas cifras es la decisión D1 del documento.

## 2026-10-13 — Pie: por orden de importancia, «Analizar» y «GitHub»

Los enlaces del pie van ahora de lo más usado a lo menos: Analizar · Guías · Metodología ·
Quiénes somos · GitHub · Privacidad · correo (en las páginas interiores, «Orometra», el inicio,
sigue delante). «App» pasa a «Analizar» («Analyze»): «App» era un nombre nuestro, interno, y no
decía adónde llevaba. «Código en GitHub» queda en «GitHub». El menú del móvil, que copia el pie,
hereda el orden.

## 2026-10-13 — Fotos de la portada en tema claro: sin el velo blanco que las lavaba

En tema claro, las fotos de la portada y del cierre se veían blanqueadas. El velo que deja leer el
texto era blanco, y el blanco no oscurece: sube las sombras hacia el gris. En el móvil cubría toda
la foto con un 40 % de blanco como mínimo (y casi un 90 % abajo); en el cierre, una foto de cielo
negro, la dejaba gris. Medido en la foto ya pintada, el contraste (desviación típica de la luminosidad) y la
saturación media pasan:

| Tema claro | Antes | Ahora |
|---|---|---|
| Portada, móvil 390 px | contraste 18, saturación 8 % | 51 y 32 % |
| Portada, tableta 820 px | 25 y 6 % | 32 y 10 % |
| Portada, escritorio 1440 px | 37 y 10 % | 40 y 12 % |
| Cierre, escritorio | 27 y 4 % | 21 y 24 % (la foto oscura, como en el tema oscuro) |

- **Móvil:** el texto va sobre el cielo y la cumbre asoma debajo, sin velo. Encima de la foto
  sigue el cielo con su mismo color. La tarjeta crece (de 466 a 646 px a 390 px de ancho).
- **Tableta y escritorio:** velo más corto y ligero, más un refuerzo solo detrás de «Solo
  necesitas el XML»; al titular y la entrada, un halo del color del fondo. En escritorio la mejora
  es pequeña: la foto es de luz de atardecer y ya es suave de por sí.
- **Cierre:** la misma banda oscura en los dos temas, con sus colores de texto y botón.
- El tema oscuro no cambia (mismas cifras). El texto sigue por encima de 4,5:1 contra lo que
  tiene detrás en todos los casos (percentil 10 del contraste en cada línea: 7,7 o más).

## 2026-10-13 — «Cómo conseguir los archivos»: pasos del 1 al 4, en 2 × 2

La pantalla de la app antes de subir nada numeraba los pasos del 0 al 3, con el 0 (reservar el
periodo no visto) en una fila entera y los otros tres debajo. Ahora van del 1 al 4 en una rejilla
de dos columnas: el 1 y el 2 arriba, el 3 y el 4 abajo. En el móvil, una columna, como antes.

## 2026-10-12 — Privacidad, metodología e historial, como páginas propias; pie de portada en el móvil

Al pulsar «Privacidad» en la app, el texto legal salía debajo del titular y de la carga de
archivos, como si fuera parte del informe; a «Metodología» e «Historial» les pasaba lo mismo. Y había
dos textos legales: la pestaña de la app (condiciones, privacidad y descargo) y la página /privacy/,
más completa. Dos textos legales a mano acaban contradiciéndose.

- **Un solo texto legal: la página de privacidad.** Recibe lo que solo tenía la app: el descargo
  ampliado (un backtest no predice, la calidad depende de tus datos, el apalancamiento, «tal cual»)
  y las condiciones de uso. La pestaña legal de la app desaparece; `/app/#legal` lleva a la página.
- **Desde la app, las páginas se abren en otra pestaña** (privacidad, «Ayuda» de la barra lateral
  y del menú del móvil, los «Leer →» de la metodología y los enlaces del pie del móvil): los
  archivos solo están en memoria, y salir de la app perdía el análisis cargado. «Inicio», en el
  menú del móvil, sigue en la misma pestaña: es salir de la app a propósito.
- **Metodología e historial, sin titular ni carga de archivos encima** (`body.page-view`): empiezan
  arriba, como una página. La carga sigue en el veredicto.
- **Fuera «Motor v2»** de la barra lateral: era un texto fijo que no está en los exports ni en el
  historial y no le decía nada a nadie.
- **Pie del móvil como el de la portada**: marca, lema y Metodología, Guías, Quiénes somos,
  Privacidad, Código en GitHub y correo (sin «App»: ya estás en ella).
- Prueba: AUD-08 (`tests/input-guards.test.js`) comprueba ahora que la página de privacidad nombra
  todo lo que se guarda en el navegador.

## 2026-10-12 — Pie de la app: privacidad, comentarios y GitHub en una línea; la versión, como dato

Debajo del idioma y el tema había cuatro líneas sueltas (aviso legal, comentarios, GitHub y la
versión del motor). En español cada enlace ocupaba su línea y en inglés dos compartían una, así que
la zona cambiaba de forma según el idioma; la versión, con el mismo aspecto que los enlaces,
parecía uno más; y con 768 px de alto (portátil típico) la barra medía 815 px y había que
desplazarla para ver el final. En el móvil, el pie de la página repetía lo de los dos enlaces en
una línea y GitHub solo en la siguiente.

- «Privacidad · Comentarios · GitHub» («Privacy · Feedback · GitHub») en una sola línea, en la
  barra lateral y en el pie del móvil. «Privacidad» y no «Aviso legal»: es lo que más se busca
  ahí, y la página es la misma. Cada enlace conserva su nombre completo para lectores de
  pantalla (`aria-label`, que contiene el texto visible).
- En escritorio, debajo, «Motor v2» («Engine v2»), más pequeño. La barra cabe ahora en
  1366 x 768 en los dos idiomas.

## 2026-10-12 — Paso 0 en la app: reservar el periodo no visto antes de optimizar

La app pedía probar la configuración en «un periodo que no hayas usado» solo después de analizar,
cuando muchos usuarios ya habían optimizado hasta hoy y no les quedaba ese tramo. La guía de
sobreoptimización sí lo decía («divide tu histórico en tres»), la app no.

- «Cómo conseguir los archivos» (pantalla inicial de la app) empieza con un paso 0, **opcional, pero
  muy recomendable**: dejar fuera de las fechas del probador el último tramo del histórico y no mirarlo hasta
  haber elegido configuración, lo bastante largo para que el EA opere en él con normalidad (sin plazos ni cifras: cada
  estrategia opera a su ritmo, y no hay un porcentaje publicado que valga para todas), con la salida si ya se optimizó hasta hoy (un tramo anterior al optimizado). Opcional porque
  la evidencia puede llegar a buena o sólida sin él (enmienda del 2026-10-09 del banco).
- «Por qué →» lleva a la sección «Cómo tenerla bajo control en MT5, paso a paso» de la guía, que
  estrena ancla (`#workflow`, en las dos versiones).

## 2026-10-12 — «Qué hacer ahora» tras el periodo no visto: débil no lleva a real, y en contra hay opciones

Dos ramas en las que la app aconsejaba de más o dejaba al usuario sin salida (auditoría del recorrido).

- **Débil y el periodo no visto no la contradice**: antes, el mismo paso que con buena o sólida
  («pruébala en demo o en real con riesgo reducido»). Ahora dice que esa prueba detecta poco y no
  compensa lo que la deja en débil, remite a la limitación de «Por qué este nivel», limita a demo sin
  dinero real y avisa de que para más evidencia hace falta un tramo nuevo. Sin forward, pide
  reoptimizar con Forward en fechas no usadas (tampoco las de ese tramo). Moderada, buena y sólida,
  como antes.
- **El periodo no visto va en contra**: antes, «revisa en esa pestaña qué métrica falla antes de dar
  ningún paso más», sin ningún paso. Ahora, cuatro opciones: no reoptimizar sobre ese tramo ni buscar
  otro hasta que uno salga bien; mirar qué falla y cuánto (la prueba también da falsas alarmas); si
  se sigue, en demo sin dinero real; o volver a empezar reservando antes un tramo final. El resumen
  de «Por qué este nivel» y el resumen exportado remiten a ellas.
- **Un informe que no cuenta** (otra configuración, otra meseta, un periodo ya usado) ya no se trata
  como un fallo: se dice por qué no cuenta y que hay que lanzar el backtest de la propuesta.
- Con cuatro pasos, la rejilla es 2 x 2 en escritorio (antes, tres y uno suelto).
- Prueba: `tests/recorrido-2026-10.test.js` (R4, R5).

## 2026-10-12 — Cada backtest del periodo no visto queda apuntado, no solo el último

La prueba final vale si se hace una vez. Antes se podía soltar un informe tras otro hasta que uno
saliera bien: el nivel volvía a subir y el historial solo guardaba el último («no contradice»).
Lo reprodujo la auditoría del recorrido: informe bueno → malo → bueno, y no quedaba rastro del malo.

- **Cada backtest comparado** queda apuntado como intento del análisis (`core/history.js#addUnseenTry`),
  en la sesión aunque el historial esté apagado, y en el historial si está encendido. Lo identifican
  sus fechas, operaciones y beneficio: el mismo, comparado otra vez (con otra meseta o corrigiendo
  otra cifra), no es otro intento. Recargar la página y volver a soltar los mismos archivos no los
  borra.
- **Aviso** en la pestaña del periodo no visto, en «Qué hacer ahora» y en el resumen exportado
  cuando antes se comparó otro backtest que contaba (de la configuración propuesta y de un periodo
  no usado): cuál, con qué resultado, que el nivel solo tiene en cuenta el último y, si alguno fue en
  contra, que buscar otro tramo hasta que uno salga bien no es más evidencia. Un informe de otro
  .set corregido después no cuenta: es una corrección, no otra prueba.
- **No cambia cómo se calcula el nivel**: sigue saliendo del backtest en pantalla. Solo se hace visible
  lo anterior.
- **Historial**: la columna «Periodo no visto» enseña todos los backtests en orden («2 backtests: fuera
  de rango → no contradice»), con los que no valían marcados.
- Pruebas: `tests/history.test.js` (respuesta conocida) y `tests/e2e.mjs` (5c).

## 2026-10-12 — Tres contradicciones del recorrido, corregidas

De la auditoría del recorrido completo (exports del banco recorridos en el navegador como un
usuario de MT5). Solo textos y botones; el motor no cambia.

- **Mesetas sin forward**: cuando MT5 no pasa al forward ninguna configuración de una meseta
  (FWD-1: a veces solo pasa las mejores del periodo optimizado), la alternativa salía «frágil al
  validar» y con «Descargar .set», aunque solo se había medido en el periodo optimizado. Ahora
  sale «sin forward» y solo ofrece el rango de refinamiento, como cuando no hay archivo forward
  (`js/ui-state.js#deployableSet`). En el banco pasa en 3 de 6 alternativas y en ninguna
  recomendada de 47; si le pasara a la recomendada, los pasos lo dicen y ofrecen el rango.
- **Sugerencia orientativa**: decía «No la uses sin probarla antes en un periodo no visto», y la
  pestaña del periodo no visto contestaba «No hay ninguna configuración propuesta que validar»
  (sin meseta no hay recorrido normal con el que comparar). Ahora la sugerencia dice que no se
  puede contrastar ahí y que es solo un punto de partida para volver a optimizar, y la pestaña
  lo explica y, si se ha soltado un informe, dice que se ha leído pero no se compara.
- **Validando una alternativa**, la ficha del informe decía «coinciden con la configuración
  propuesta»; ahora nombra la meseta elegida.
- Prueba: `tests/recorrido-2026-10.test.js`.

## 2026-10-12 — Un forward con las pasadas perdedoras sin número ya no es «un export dañado»

Lo destapó un export real del autor (genética, 23 parámetros): Orometra decía «El export del
forward está dañado: en 1839 de 5423 filas falta el número de pasada…» y paraba. No lo estaba.

- **Qué pasaba** (FWD-4 en `docs/MT5_ASSUMPTIONS.md`): el export de la optimización traía solo
  las 3584 pasadas con beneficio (el del día anterior traía 1550 con pérdidas), y el del forward
  las 5423, con las 1839 perdedoras sin número de pasada. Esas filas están completas y sanas; las
  otras 3584 emparejan perfectamente. Por qué MT5 lo exporta así, sin confirmar.
- **Ahora** (`core/schema.js#screenHiddenLosers`, `core/analysis.js`): si las filas sin pasada del
  forward no tienen ningún valor imposible, ninguna de sus configuraciones está en la optimización
  y la optimización no trae ninguna pasada con pérdidas, se **recuperan** como lo que son:
  configuraciones probadas que perdieron dinero en el periodo optimizado (calidad 0, no cumplen
  los mínimos, igual que con su fila completa), con su forward entero y su Result. Lo demás de
  ese periodo queda vacío, no se inventa. Si la firma no se cumple entera, sigue siendo un export
  dañado, como antes. El usuario no tiene que tocar nada en MT5.
- **Medido** con el export completo del día anterior, ocultando sus 1550 perdedoras como en el
  nuevo: misma recomendada, misma meseta (38) y mismo nivel; solo cambia el mínimo de operaciones
  del forward (47 frente a 48), que se estima sin las operaciones de esas pasadas, y con él la
  meseta pasa del 63 % al 66 % en el forward. Apartarlas sin recuperarlas (la primera versión
  del arreglo) daba ~5 operaciones por parámetro en vez de ~10 y otra cifra de dependencia de los
  mínimos (29 % en vez de 46 %); en la prueba sintética, otra meseta y otro nivel.
- **Diagnóstico**: «Filas forward» cuenta todas las del archivo (antes salía 3584 de 5423) y una fila
  dice cuántas se han recuperado.
- **Aviso informativo** (no cuenta para el nivel ni pide nada): MT5 dejó fuera del export de la
  optimización las pasadas que perdieron dinero, Orometra las ha recuperado del forward y, como
  de ese periodo solo se sabe su resultado, en Descartes y en el CSV salen sin el resto de cifras.
- Con el export real nuevo: 17 mesetas, «débil», recomendada con beneficio 152569.21 · 534
  operaciones · Resultado 252569.21. El export del día anterior no cambia.
- Pruebas: 15 más en `tests/audit-2026-10b.test.js` (62), de respuesta conocida con datos
  sintéticos: el mismo análisis que con el export completo, y los tres casos que siguen siendo un
  export dañado.

## 2026-10-11 — «La regla "primera de Result" falla» deja de bajar el nivel, medido en el banco

- **Motor** (`core/verdict.js`): el aviso era **crítico** cuando el orden de la columna Result
  fallaba al cruzar periodos la mitad de las veces o más y menos de 1 de cada 4 configuraciones
  cumplía en los dos periodos. Mide el orden de la tabla, no la meseta, y Metodología dice que
  esos avisos se enseñan pero no bajan el nivel: era una excepción sin escribir. Ahora es un
  aviso de tabla, como los demás; se sigue viendo en Diagnóstico → Pruebas estadísticas.
- **Medido antes de cambiarlo** (`bench/orden-tabla.js`, `bench/results/REPORT-calib-orden-tabla.md`,
  enmienda en `bench/PREREGISTRO.md`): en 2.400 casos (calibración con los mínimos por defecto y
  con factor de beneficio ≥ 1,40, y el quinto examen) salta 741 veces y **nunca es el único
  crítico**, así que no cambia ningún nivel y las cifras publicadas del quinto examen siguen
  valiendo. Además saltaba más cuanto más exigentes los mínimos (218 frente a 307 en la
  calibración), no por los datos.
- Con el export real del autor, el veredicto pasa de 4 a 3 limitaciones serias y sigue en
  «débil».
- Pruebas: 2 más en `tests/audit-2026-10b.test.js` (47; las dos fallan con la regla anterior).

## 2026-10-11 — El CSV trae las cifras para encontrar cada configuración en MT5

- **CSV** (`js/export.js#buildCsv`): tres columnas al final de cada fila, `beneficio_is`,
  `operaciones_is` y `result_is` (en inglés, `profit_is`, `trades_is`, `result_is`): el
  beneficio, las operaciones y el Result del periodo optimizado. Hasta ahora solo traía el número
  de pasada, que no sirve para encontrarla en MT5 (PASS-2). Van al final para no descolocar a
  quien lea el CSV por posición. Comprobado con el export real del autor: 5517 filas, todas
  iguales a su fila del XML.
- **Enums que el XML trae como número** (CLAUDE.md, «Aceptado a propósito»): siguen contando
  como distancia al buscar vecinas, con o sin .set. Tratarlos como categoría haría que el mismo
  XML diera mesetas distintas según se aporte el .set, y el banco no lo puede medir. En el
  refinamiento, el .set ya los deja fijos.
- Pruebas: 2 más en `tests/audit-2026-10b.test.js` (45).

## 2026-10-11 — Cuatro textos que se contradecían o no decían de qué es la cifra

Segunda tanda de la auditoría de uso. Solo textos; ninguna cifra del análisis cambia.

- **«Se mantiene al validar»** (veredicto): la nota decía «qué parte de **su** calidad conserva»,
  pero la cifra es la mediana de la meseta (con el export real, 63 %, mientras la configuración
  recomendada conserva el 75 %: 0,95 → 0,71). Ahora lo dice.
- **Dos frases que se contradecían** (`core/verdict.js`): «La recomendación es una propiedad de
  tus datos» (umbrales internos) salía junto a «la decide el umbral que has escrito, no tus
  datos» (tus mínimos); ahora dice que no depende de nuestros cortes y que lo de tus mínimos se
  mide aparte. Y «no hay región amplia donde refugiarse» salía bajo «Sí hay 11 mesetas»: ahora
  dice cuántas configuraciones cumplen en los dos periodos (9,4 % en el export real; hace falta
  1 de cada 4) o, si no hay mesetas, que no hay ninguna.
- **Mapa de los dos parámetros** (Parámetros): dice que cuenta todas las configuraciones, también
  las que no cumplen tus mínimos; el gráfico de perfil de encima solo cuenta las que cumplen, y
  la misma pareja salía con 0,58 en uno y 0,00 en el otro.
- **Sharpe máximo** (veredicto y Diagnóstico): dice que es el de las pasadas con más de 30
  operaciones (`sharpeTest.minTrades`). Sin forward, en el export real, la app decía 33,37 y la
  tabla de MT5 tiene 40,24 (una pasada de 24 operaciones).
- Pruebas: 7 más en `tests/audit-2026-10b.test.js` (43; todas las nuevas fallan con el código
  anterior).

## 2026-10-11 — Auditoría de uso: CSV, gráficos, refinamiento con enums y el forward de cada meseta

Auditoría de la app usándola de verdad (Playwright, 1440 y 390 px, claro y oscuro, ES y EN)
con el export real del autor (5517 pasadas, su forward y su .set) y cifras recalculadas
desde el XML. Se arreglan siete fallos y se añade una mejora; el resto de propuestas queda
para decidir.

- **CSV, columna «meseta»** (`js/export.js`): llevaba el orden en que se encontró cada meseta,
  no su puesto. Con el export real, las 38 configuraciones de la «Meseta 1» salían con
  `meseta=2` y el `1` era la Meseta 4. Ahora es el número de la pantalla y del JSON.
- **Nube de puntos** (`styles.css`, `js/charts.js`): «Pasan mínimos» y «En meseta» tenían el
  mismo color (`--ok` y `--info` valen lo mismo en los dos temas) y solo cambiaba la opacidad.
  Ahora son tres pasos del mismo azul, del más tenue (no pasan) al más intenso (meseta),
  validados como rampa ordinal en los dos temas, y la meseta se dibuja encima. El texto ya no
  dice «en lavanda» (en el tema claro era azul marino); el del 3D, tampoco «en azul».
- **Deciles** (`js/charts.js`): la leyenda de D1–D9 no tenía el color de sus barras, y las barras
  salían del mínimo del eje, no del cero: con el export real, las medianas negativas de D1–D4
  se dibujaban hacia arriba, y en el ejemplo D10 parecía 4,2 veces D1 cuando es 3. Ahora salen
  del cero, con línea del cero si hay negativos.
- **Refinamiento con .set** (`core/engine.js#refinementRange`): un enum que el .set delata (paso
  0) pero que el XML trae como número se barría (`InpEntryMode=0||0||1||1||Y`) mientras la
  cabecera del .set decía que los enums se dejan fijos. Ahora se deja fijo. El análisis no
  cambia (mismas mesetas y misma recomendada con y sin .set); sin .set, como antes. Que las
  vecinas traten esos enums como categoría queda para decidir: haría que el .set cambiara las
  mesetas.
- **Aviso «La recomendación depende de los mínimos que elijas»** (`core/verdict.js`): citaba
  siempre «1,25 en vez de 1,15», fuera cual fuera el mínimo; con 1,10 se prueba de 1,08 a 1,12.
  Ahora da el tramo probado (`stabilityCheck.gates.profitFactorRange`).
- **Mesetas, «Ordenadas por cómo rinden sus configuraciones más flojas»**: el orden también
  depende del tamaño y del forward (con el export real, la de 0,86 va antes que la de 0,92).
  La frase lo dice. **Descartes**: «Vecinas flojos» → «Vecinas flojas».
- **Lo que aguanta cada meseta en el forward, a la vista** (`js/ui-state.js#forwardHoldHtml`):
  columna «Cumplen en el forward» en la tabla de mesetas, fila en la comparativa del veredicto
  y cifra en las tarjetas de las alternativas (en el móvil, las columnas de la derecha no se
  ven sin deslizar). Con el export real, la recomendada aguanta el 63 % (24 de 38) y por eso
  lleva un aviso crítico; las alternativas 1 y 2, el 100 %. La elección no cambia.
- Caché de estilos `?v=20261011a`. Pruebas: `tests/audit-2026-10b.test.js` (36; cada sección
  falla con el código anterior) y 2 de navegador.

## 2026-10-11 — Cada configuración se busca en MT5 por sus cifras, no por su número de pasada

El número de pasada no identifica una configuración en MT5 (PASS-2 en
`docs/MT5_ASSUMPTIONS.md`). Con el export real del autor, las pasadas 4300…4310 que enseñaba
el probador estaban en el XML con otro `Pass` (4300 → 1431, 4305 → 1448…), y al cerrar y
reabrir MT5 la columna «Paso» sale vacía: el probador no lo guarda. Orometra recomendaba la
configuración correcta, pero con un número que no servía para encontrarla.

- **Veredicto, sugerencia orientativa y ficha de la meseta** (`js/ui-state.js#findInMt5Html`):
  «Búscala en los resultados de la optimización de MT5 por sus cifras: beneficio 29136.64 ·
  190 operaciones · Resultado 5.70», con punto decimal como en MT5, y que el número de pasada es
  el del archivo exportado. Si otras configuraciones tienen las mismas cifras (≈10 % de las filas
  en dos exports reales, las que solo cambian parámetros que no influyen), lo dice y remite a sus
  parámetros (`core/analysis.js#markResultTwins`).
- **Descartes, comparativa del Top 3 y gráfico de la meseta**: beneficio al optimizar de cada una.
- **Exportaciones**: el resumen da las cifras de cada configuración; el .set lo dice en la
  cabecera («Pasada N del archivo exportado» y sus cifras); el JSON añade cuántas comparten
  cifras y el beneficio y operaciones de los descartes.
- Pruebas: `tests/real-export.test.js` (59) y una de navegador más (114).

## 2026-10-11 — Forward con todas las pasadas, enums sin «borde», un aviso de cobertura y prueba estable

- **Textos del forward** (guías de exportación, forward, sobreoptimización y criterio;
  Metodología, paso 5; `docs/MT5_ASSUMPTIONS.md` FWD-1): decían que MT5 solo vuelve a probar
  el 10 % o el 25 % mejor. Un export real del autor (genética, 5517 pasadas) las trae todas.
  Ahora dicen lo que dice la ayuda de MT5 y que hay exports que las traen todas. El motor ya
  funcionaba en los dos casos.
- **Enums del .set sin «pegada al borde»** (`core/analysis.js`): un enum optimizado llega al XML
  como número y salía en el aviso con «amplía el rango». Con el .set (paso 0) se excluye, como
  ya se hacía con los booleanos. Sin .set no cambia nada (el banco no usa .set).
- **Un aviso de cobertura, no dos** (`core/verdict.js`): con muestreo disperso y .set salían
  «Muestreo disperso (sobre niveles vistos)» y «Solo X del rango del .set», a menudo con la
  misma cifra. Ahora sale uno («Muestreo disperso: solo X del rango del .set»), y la cifra sobre
  niveles vistos va en el detalle si es distinta. Aportar el .set ya no suma un aviso (y los
  avisos cuentan para el nivel).
- **Prueba de navegador 2b estable** (`tests/e2e.mjs`): tras el ejemplo, «Analizar» ya está
  activo y la prueba leía la caja antes de que la app colocara el archivo («Ejemplo sintético
  cargado»). Reproducido retrasando la lectura del archivo: fallaba 3 de 3; ahora espera al
  nombre del archivo y pasa.
- Pruebas: `tests/real-export.test.js` (47).

## 2026-10-11 — Pasada real sin forward, .set con booleanos y enums, export dañado y GitHub

Lo destapó un export real de MT5 (optimización genética de 19 parámetros, su forward y su
.set) y un comentario de Reddit.

- **Número de pasada sin forward** (`core/analysis.js`, `core/schema.js#passIds`): sin forward,
  cada configuración se numeraba por su posición en la tabla, empezando en 0. MT5 exporta las
  pasadas desordenadas, así que la «pasada» recomendada era otra configuración (en el export
  real, la fila 1432 es la pasada 4194, y la pasada 1432 de MT5 tiene otros parámetros) o no
  existía (el «#75» de Reddit). Ahora se usa la columna `Pass`; si falta o repite números, se
  numera por fila y el informe lo avisa. El .set descargado ya llevaba los parámetros
  correctos. Afecta a todo lo que muestra el número (veredicto, mesetas, .set, CSV, JSON,
  historial): un análisis sin forward guardado antes en el historial ya no se reconoce como
  «mismos datos» que uno nuevo, porque su huella usaba el número de fila.
- **.set: booleanos y enums optimizados** (`core/setfile.js#discreteRange`): MT5 los guarda como
  `false||false||0||true||Y` y con paso 0 (`16385||16385||0||16388||Y`), y se tomaban como
  fijos. En el export real la cobertura salía 32 veces más pequeña: 8.230 millones de
  combinaciones en vez de 263.364 millones.
- **Proporciones diminutas** (`js/i18n-core.js#shareText`): «Muestreo disperso: 0,0000 %» y
  «Solo 0,00 % del rango del .set» dicen ahora «1 de cada 26.111.817 combinaciones» y «Solo 1
  de cada 52.223.635 combinaciones del rango del .set». Igual en Diagnóstico y en la ficha del
  veredicto.
- «Mediana de 1 vecinas» → «1 vecina» (y en inglés, «1 neighbor»).
- **Export dañado** (`core/schema.js#screenDamaged`): con el 1 % de las filas o más sin número
  de pasada o con valores que MT5 no genera (subnormales, enteros de más de 15 cifras), el
  análisis para y dice qué archivo está dañado. Antes, el forward real salía como «los archivos
  no encajan» (sí eran de la misma optimización), y uno con un 10 % de filas sanas se analizaba
  en silencio con esas filas. Por debajo del 1 %, esas filas se descartan antes de analizar
  (una con un beneficio imposible ya no puede encabezar el ranking) y el informe dice cuántas.
  Una celda numérica vacía se lee vacía, no como 0.
- **Enlace a GitHub** en el pie de todas las páginas y en la app («Código en GitHub»). Antes solo
  estaba en una pestaña de la portada.
- `docs/MT5_ASSUMPTIONS.md`: PASS-1, SET-2 y FWD-3. Pruebas: `tests/real-export.test.js` (34) y
  4 de navegador (una carga un export con las pasadas desordenadas y sin forward: con el número
  de fila, falla).

## 2026-10-10 — Escala de letra y espaciado, guías por orden de uso y detalles

Lo que quedaba de la auditoría de diseño, salvo las fotos de cabecera (se quedan).

- **Escala de tamaños de letra:** fuera los medios píxeles (12,5 → 13; 13,5 → 14; 14,5 → 15;
  15,5 → 16; 16,5 → 17) y el 19 (→ 20). Los tamaños de 13, 14, 15, 17 y 20 px van con su token
  (antes, 13 px se escribía a mano 93 veces). `--fs-xs` desaparece: valía lo mismo que
  `--fs-sm`. `--fs-lg` pasa de 16,5 a 17 px y `--fs-xl` de 19,5 a 20. El texto de los diagramas
  SVG va en unidades del dibujo y no cambia.
- **Escala de espaciado** (margin, padding, gap): los impares, al par de arriba (nunca más
  apretado); por encima de 20 px, múltiplos de 4. De 39 valores distintos a 25. Se quedan el
  1 px, el 44 (zona táctil) y el 52 (hueco entre secciones en el móvil).
- `tests/design-scale.test.js` falla si vuelve a aparecer un tamaño o un espaciado fuera de la
  escala.
- **Índice de guías** en dos grupos, en el orden en que hacen falta: «Antes de optimizar»
  (criterio, genética o completa, forward) y «Después de optimizar» (exportar, sobreoptimización,
  informe del probador). En escritorio, una fila de tres por grupo.
- **«Cómo exportarlo →» en tema claro:** un halo del color del fondo detrás de la línea. Sobre la
  roca de la foto, el contraste mediano pasa de 4,2 a 5,8:1 a 1440 px, y de 1024 a 1920 px
  queda entre 5,6 y 5,8:1 (antes, entre 4,0 y 4,3).
- **App vacía:** la nota del .set, alineada con el contenido de la caja de carga y con aire
  debajo. Abajo ya no se repite «Ver un informe de ejemplo» (el botón de arriba sigue): solo el
  ejemplo sin ventaja.
- **Privacidad:** el texto de las tres tarjetas, de 14 a 16 px.
- **Diagnóstico, «Columnas detectadas»:** las notas, a lo ancho debajo de las dos listas; antes
  dejaban vacía la columna de los parámetros.
- Cabecera del informe a ≤ 420 px: relleno lateral de 8 px (con la letra a 14 px, «Exportar»
  volvía a bajar de fila a 360 px en español).
- El texto de reserva del HTML de la app dice «optimized period», como `js/i18n.js`.
- Caché de estilos `?v=20261010e`.

## 2026-10-10 — Portada: «Cómo funciona» justo después del titular

De la auditoría de diseño: lo más claro para quien llega nuevo estaba escondido. El resto de la
portada no cambia.

- **«Cómo funciona» (exporta → suéltalos aquí → llévate tu configuración)** pasa a ser la
  segunda sección, a la vista. Antes era la primera de cuatro pestañas en la sección 5 de 7.
- «Lo que hay detrás del resultado» se queda con tres pestañas: «El motor» (abierta al entrar),
  «Por qué fiarte» y «¿Y una IA?».
- En el móvil, las tres pestañas van en una fila y cada una mide lo que su texto; a partes
  iguales, «Por qué fiarte» no cabía a 320 px. Antes eran cuatro, en dos filas de dos.
- La portada mide más (en el móvil, unos 900 px): los pasos ya no están detrás de una
  pestaña, y la que se abre al entrar es ahora «El motor», más larga que los pasos.
- Caché de estilos `?v=20261010d`. Prueba de navegador: «Cómo funciona» es la segunda sección,
  con sus tres pasos a la vista, y quedan tres pestañas.

## 2026-10-10 — Auditoría de diseño: cuatro fallos

Auditoría visual de todas las páginas (inglés y español, claro y oscuro, 375, 768 y 1440 px).
Sin desbordes ni textos cortados en ninguna combinación. Se arreglan los cuatro fallos objetivos;
las propuestas de organización (portada, cabeceras con foto, orden de las guías, escala de
tamaños) quedan para decidir.

- **«Solid» y «Strong» en inglés:** el titular del veredicto decía «Solid evidence» y la escala,
  la cabecera de las pestañas, la portada y la Metodología, «Strong». Ahora es «Strong evidence»
  en los dos titulares (`core/verdict.js`, `js/ui-verdict.js`). En español ya era «sólida».
- **Metodología:** «periodo optimizado», como en la app, en vez de «in-sample» (8 frases, en los
  dos idiomas). Las guías siguen diciendo «in-sample», y la de exportación lo define.
- **Mesetas en el móvil:** a 360 y 375 px los parámetros de la configuración representativa iban
  de uno en uno (393 px de alto con seis): la rejilla pedía columnas de 150 px y había 299.
  Ahora de 140 px: a dos columnas desde 360 px (197 px de alto). Tableta y escritorio, igual.
- **Cabecera del informe en español:** a 375 px, «Exportar» bajaba solo a una tercera fila
  (los tres botones sumaban 353 px y había 343). Por debajo de 420 px los botones llevan menos
  relleno lateral: una fila desde 360 px en español y desde 320 en inglés.
- Caché de estilos `?v=20261010c`. Pruebas: `tests/audit-2026-10.test.js` (titulares con el
  nombre de la escala; Metodología sin «in-sample») y 4 de navegador a 360 y 375 px.

## 2026-10-10 — Historial: cuatro fallos y tres detalles

Revisión del historial en el navegador (escritorio y móvil, claro y oscuro) y en Node.

- **Parámetros de sí/no o de lista siempre «fuera»:** con los mismos datos dos veces, la
  comparación decía «En parte: 6 de 7» e «InpUseFilter true — fuera (—)». El tramo de la meseta
  solo se guardaba para parámetros numéricos. Ahora, para los de sí/no o de lista, se guardan
  los valores que toma la meseta (hasta 20) y se compara si el de ahora es uno de ellos. Lo
  guardado antes sin ese tramo sale como «no consta la otra vez» y no cuenta ni dentro ni fuera.
- **Un intento fallido borraba el periodo no visto ya guardado:** comprobarlo y después pulsar
  Comparar con un dato vacío dejaba el análisis «sin comprobar». Ahora solo se apunta un
  resultado; un error no toca lo guardado.
- **«Borrar todo el historial»:** a los 5 s el botón seguía diciendo «¿Seguro? Toca otra vez»,
  pero ese toque solo lo volvía a armar. Ahora vuelve a su texto. Además, la confirmación es de
  ese botón concreto: tras un repintado no se borra todo con un solo toque.
- **Dos optimizaciones distintas con el mismo nombre de archivo** (la misma rejilla sobre otro
  periodo, con la misma pasada recomendada) contaban como el mismo análisis y la nueva sustituía
  a la anterior. Ahora cada resumen lleva una huella de las cifras de la tabla
  (`core/history.js#dataSignature`): mismos datos y mismos mínimos es el mismo análisis, aunque
  cambie el nombre; la comparación dice «mismos datos» solo si lo son. Lo guardado antes, con la
  regla de antes.
- **Detalles:** «No guardar historial» (aviso de la primera vez) borra también los nombres de los
  EA; al borrar el último análisis de un EA se borra su nombre; cada botón «Borrar» dice de qué
  análisis es para el lector de pantalla.
- Privacidad (ES/EN): el historial guarda también ese código calculado a partir de las cifras.
- Pendiente de decidir: optimizar otro conjunto de parámetros del mismo EA (por ejemplo, el
  refinamiento con alguno fijado) cuenta como otro EA.
- 17 pruebas de respuesta conocida nuevas (`tests/history.test.js`) y 6 de navegador.

## 2026-10-10 — Periodo no visto repetido, ejemplo sin ventaja y tarjeta de la portada exacta

- **Un «periodo no visto» que repite uno ya usado ya no valida** (`core/unseen.js#repeatedPeriod`).
  Repetir el backtest con las fechas de la optimización (o quitar el forward y probar el rango
  entero) daba «no contradice» y dejaba el nivel en «sólida»: esas cifras forman parte de la
  meseta con la que se comparan (comprobado con el ejemplo: las 5 métricas en «normal»). Ahora,
  si las operaciones y el beneficio coinciden con los de la configuración en el periodo
  optimizado, en el forward o con la suma de los dos (±1 % en operaciones; ±1 % en beneficio,
  ±2 % con la suma; y el factor de beneficio si lo hay), el resultado sale como «No valida»,
  dice por qué y no cuenta para el nivel, como un informe de otra configuración. Un solape
  parcial no se puede detectar: el export de MT5 no trae fechas. Pruebas de respuesta conocida
  (`tests/unseen.test.js`, `tests/verdict-coherence.test.js`) y de navegador.
- **Segundo ejemplo: un EA sin ninguna ventaja** (`js/demo.js#buildNoEdgeDemoTables`). Cada
  operación es ruido y solo hay suerte por zonas en cada periodo (como el escenario S2 del banco);
  el forward trae el 25 % mejor, como MT5. La n.º 1 de MT5 sale con factor de beneficio 2,08 y
  drawdown del 4 %, y Orometra da «débil» sin meseta. Semilla de un caso típico: con 16 semillas,
  15 «débil» sin meseta y 1 «moderada». Se abre desde la pantalla vacía de la app, desde la nota
  del otro ejemplo, desde la portada y con `/app/?demo=noedge`.
- **La tarjeta «Una decisión, no una tabla» de la portada** enseñaba la pasada 4283, una meseta
  de 412, «buena», 88/100 y 94 %, y su enlace abría el ejemplo, que da la pasada 11445, una meseta
  de 5018, «sólida», 93/100 y 90 %. Ahora enseña lo que da el ejemplo, con sus seis parámetros y
  sus nombres. La sección de arriba («En MT5, el n.º 1 suele ser el más frágil») sigue siendo una
  ilustración propia. `tests/home-sample.test.js` calcula el ejemplo y compara la tarjeta en los
  dos idiomas.
- Visto al hacerlo, sin cambiar: en los 16 casos sin ventaja, el contraste del Sharpe aprueba (la
  suerte por zonas del forward es real dentro de ese periodo). Ya se dice que aprobarlo no
  demuestra nada por sí solo.
- Caché de estilos `?v=20261010b`.

## 2026-10-10 — Portada: el banco de pruebas, dicho más claro

- Título nuevo: «Lo probamos con casos de respuesta conocida». La entradilla dice qué se hizo
  (800 optimizaciones simuladas en las que se sabía si había ventaja real) y presenta la escala
  de niveles («insuficiente» a «sólida»), sin la cual «moderada o más» no se entendía. Fuera
  la jerga de examen («criterios escritos antes», «a ciegas»).
- Se quita la nota de «dónde falla» de la portada: los criterios no superados siguen
  explicados en Metodología, a un clic desde el enlace de la franja.
- `tests/home-bench.test.js`: la comprobación de «10 de los 13» pasa a vigilar solo
  Metodología; en la portada se comprueba que la entradilla sigue diciendo «simuladas».
- Caché de estilos `?v=20261010a`.

## 2026-10-09 — Portada: las cifras del banco de pruebas, también en puntos

- En «Puesto a prueba donde se sabe la respuesta», cada cifra lleva una rejilla con un punto
  por optimización: 300 sin ventaja, con las 10 falsas alarmas en rojo, y 40 con ventaja, con
  las 34 detectadas en lima. Las dos rejillas usan el mismo paso, así que también se ve que
  una muestra es mucho más pequeña que la otra. En vez de foto de fondo: ya hay dos (portada y
  cierre) y una tercera restaba contraste a las cifras.
- SVG con patrones, sin peso apreciable; decorativo (`aria-hidden`), porque el texto ya dice lo
  mismo. En escritorio, la rejilla de 40 ocupa el alto de la de 300 para que los textos de debajo
  queden alineados.
- `tests/home-bench.test.js` cuenta los puntos de cada rejilla contra `REPORT-exam5.md`.
- Caché de estilos `?v=20261009l`.

## 2026-10-09 — Portada: la franja del banco de pruebas, más sencilla

- «Ventajas detectadas» dicho como la cifra de al lado: «De 40 optimizaciones con una ventaja
  real clara, 34 recibieron «moderada» o más» (antes, «le dio…», sin sujeto). Igual en Metodología.

- Dos cifras que se entienden solas (falsas alarmas y ventajas detectadas), con la misma letra
  que el resto de la web; antes llevaban una tipografía con remates que no se usa en ningún otro
  sitio.
- La distancia a la mejor configuración (0,23 frente a 0,29) y «Dónde no gana» pasan a
  Metodología, que ahora explica también por qué: si no ve meseta no propone ninguna, y el
  examen lo cuenta como fallo. En la portada queda una nota corta («superó 10 de los 13
  criterios… son datos simulados») y un solo enlace, «Cómo lo probamos →», a Metodología.
- Sin enlaces a GitHub en la franja (la tarjeta «El código es público» sigue igual).
  `tests/home-bench.test.js` lo comprueba, junto con las cifras.

## 2026-10-09 — Buscadores y redes: fechas del sitemap y etiquetas que faltaban

- **Sitemap:** 18 direcciones seguían con fecha del 29 de septiembre aunque la portada,
  Metodología, Privacidad, Quiénes somos y las guías han cambiado esta semana (las guías decían
  «modificado el 8 de octubre» en sus datos estructurados). Ahora cada fecha es la del último
  cambio real de contenido.
- **og:url** en todas las páginas indexables (y su versión española la suya, desde
  `tools/build-es.js`), y **og:type** en Quiénes somos, Metodología y Privacidad.
- Prueba nueva (`tests/seo.test.js`): cada página indexable en el sitemap y al revés, canonical
  y og:url propios, versiones de idioma enlazadas en los dos sentidos y la fecha del sitemap
  nunca anterior a la que declara la guía. Con el sitemap anterior falla en 12 comprobaciones.
- Sin cambiar: títulos y descripciones algo largos (Google los recorta); tocarlos afecta al
  posicionamiento y el beneficio es pequeño.

## 2026-10-09 — Quiénes somos, Privacidad y aviso legal: lo que dicen, exacto

- **Aviso legal de la app:** se mostraba al visitante una nota interna («estos textos son
  borradores…»). Pasa a `docs/LEGAL-NOTAS.md`. «No hay servidor porque no hay servidor» pasa a
  «ningún servidor recibe tus archivos: no hay servidor de análisis» (sí hay alojamiento y
  analítica).
- **Privacidad, qué se envía a la analítica:** también el título de la página, y los eventos
  salen también de algunos botones de la web, no solo de la app.
- **Privacidad, qué guarda el historial:** la lista completa (pasada, robustez, calidad, número
  de pasadas, resultado del periodo no visto y etiquetas), no solo una parte.
- **Quiénes somos:** dos principios más, los que distinguen a Orometra: «evidencia, no permiso»
  y «puede decir aquí no hay nada», con enlace a cómo se prueba el método.

## 2026-10-09 — Carga de archivos (3/3): textos de los avisos y los mínimos

- **Errores con título de trader:** «Error de datos / esquema» pasa a «Los archivos no encajan»,
  con una pista que dice qué hacer (exportar los dos de la misma optimización). Un solo
  archivo sin parámetros reconocibles ya no sale como un problema de emparejar archivos.
- **Pistas que contradecían al mensaje:** la de «datos no utilizables» ya no habla del forward
  cuando no hay; un .set ilegible ya no pide «volver a exportar el XML» (dice cómo guardar el
  .set); la del informe del backtest ya no repite el mensaje.
- **Dos optimizaciones soltadas juntas:** era una alerta roja aunque se podía seguir; ahora es
  un aviso en la caja.
- **Mínimos no válidos:** salían como «Datos no utilizables» con una pista sobre columnas.
  Ahora «Revisa los mínimos», se abren los ajustes y se enfoca el campo. El drawdown dice lo
  que acepta («mayor que 0 y como mucho 100 %»).
- **«1,5» se guardaba como 15** en los mínimos y en el formulario del periodo no visto: los
  campos pasan a texto (con teclado decimal en el móvil) y aceptan coma o punto; con los dos,
  el último es el decimal. Prueba de respuesta conocida (`tests/number-input.test.js`).
- El selector de archivos admite `.xlsm`, como ya hacía la carga.

## 2026-10-09 — Carga de archivos (2/3): la ficha y el botón dicen lo que hay

- **Solo el forward:** la ficha decía «Listo para analizar · Los archivos se leen bien» con el
  botón desactivado. Ahora dice «Falta la optimización» y cómo exportarla.
- **Archivos que el motor rechaza** (forward de otra optimización, sin parámetros comunes…):
  tras el error, la ficha seguía en «Listo» y el botón en verde. Ahora dice «No se pueden
  analizar así» y el botón pide cambiar los archivos, hasta que cambien.
- **«Analizar» activo mientras se leía el archivo:** se podía pulsar con la ficha en «Leyendo…».
- **Menos de 10 configuraciones:** se avisa en la ficha al cargar, no al pulsar Analizar.
- **Tres archivos con uno que no sirve** (un `.opt` junto a los dos XML): el `.opt` ocupaba la
  ranura de la optimización, se rechazaba y el XML bueno se perdía sin aviso. Ahora lo que no
  es una tabla se aparta antes de repartir y se dice; si sobra un archivo, también.
- **Informe del backtest soltado antes de analizar:** se leía sin ninguna señal y, tras
  analizar, el veredicto decía «Periodo no visto: no aportado». Ahora la caja lo confirma y al
  analizar se compara solo, como cuando se suelta después.
- **Tras un análisis, un archivo rechazado no mostraba nada** (el aviso iba a la caja plegada).
- Si cancelar o un fallo del motor corta la lectura de un archivo, se vuelve a leer una vez en
  vez de marcarlo como ilegible.
- Pruebas de navegador de cada caso.

## 2026-10-09 — Carga de archivos (1/3): lo que se analiza es lo que se ve

- **Del ejemplo a tus archivos:** soltar un solo archivo propio tras ver el ejemplo lo
  juntaba con la otra mitad del ejemplo (que no es un archivo) y el análisis acababa en
  «Error interno». Ahora un archivo propio vacía las dos ranuras del ejemplo.
- **El .set ya no lanza el análisis por su cuenta.** En una tanda se procesaba antes que las
  tablas y analizaba lo que hubiera cargado: con el ejemplo en pantalla y tus tres archivos,
  salía el informe del ejemplo con el nombre de tu archivo, y así se guardaba en el
  Historial. Ahora se colocan primero las tablas, después el .set y al final el informe del
  backtest, y el .set solo vuelve a analizar si lo cargado es lo que ya se analizó.
- **Lo que se suelta durante un análisis espera** y se coloca al terminar (o al cancelar);
  la barra de progreso lo dice. Antes se colaba a medias en el análisis en marcha.
- `runAudit` fija al empezar los archivos que analiza: los nombres del informe y del
  Historial salen de esa copia. La barra de progreso pasa a la línea siguiente en el móvil
  en vez de quedarse sin ancho.
- Prueba de navegador con los tres recorridos (falla con el código anterior).

## 2026-10-09 — Lo que te llevas: .set, refinamiento, resumen, impresión, CSV y JSON

- **.set en UTF-16 con BOM**, como los guarda MT5 (antes UTF-8 sin BOM). Sin confirmar todavía
  con un terminal; la prueba de navegador comprueba la codificación del archivo descargado.
- **Refinamiento con el paso a la mitad en una rejilla completa** (`core/engine.js#finerRefinement`):
  repetir los mismos pasos no aportaba nada. Alrededor de la recomendada, sin salir de lo
  probado, el paso va a la mitad (en los enteros, nunca por debajo de 1); si no cabe en
  20.000 combinaciones se fijan los menos influyentes, y si sobra se amplía el tramo de los
  más influyentes. El .set y la pantalla lo explican. Prueba de respuesta conocida
  (`tests/refinement.test.js`). Con búsqueda parcial o genética, como antes.
- **Resumen .txt:** escribía «undefined» cuando una meseta alternativa no tenía forward;
  ahora lo dice. Añade archivos, pasadas y mínimos usados, y de cada configuración el factor
  de beneficio, el drawdown y las operaciones de cada periodo. Sin dobles dos puntos.
- **«A favor»** (pantalla, resumen e impresión) ya no incluye notas informativas que no son un
  punto a favor.
- **Impresión:** el nivel activo del medidor salía en lima claro sobre blanco; ahora con los
  colores del tema claro. El papel lleva «Orometra · orometra.com». La línea de datos incluye
  el mínimo de operaciones del forward.
- **CSV y JSON:** columnas `vecinas`; en el JSON, `neighborFloorQ25` y los textos de los
  hallazgos sin etiquetas HTML. Las cifras del aviso de preselección del forward llevan
  separador de miles.

## 2026-10-09 — Pestañas del informe (3/3): términos y estilo

- **«%» que se separaba de su cifra al saltar de línea** («19» en una línea y «% de» en la
  siguiente): `pctSign()` y las cifras con % de los textos en español llevan ahora espacio
  irrompible, en toda la web.
- **«Vecinas», no «vecinos»:** las pestañas decían «vecinos» y el veredicto y Metodología
  «vecinas» (configuraciones vecinas). Unificado, con la concordancia.
- **Plurales:** fuera «parámetro(s)», «paso(s)» y «periodo(s)»; «1 configuración»,
  «1 detectado».
- **Jerga:** «Centro» (el núcleo de la meseta) pasa a «Núcleo», con su explicación; las
  columnas Robustez, Las más flojas y Variación tienen explicación al pasar el ratón; en
  inglés, «Spread» (la variación de la calidad) pasa a «Variation» para no confundirlo con el
  spread del bróker; «Q10–Q90» pasa a «80 % central»; la potencia y el intervalo de confianza
  dicen qué miden; «Calidad» en Descartes dice que es la del periodo optimizado.
- **Contraste:** el texto ámbar de una métrica «en la cola», en tema claro, se quedaba en
  4,48:1 (mínimo 4,5:1). axe sin errores en las ocho pestañas del informe, en español e
  inglés, temas claro y oscuro, escritorio y móvil.

## 2026-10-09 — Pestañas del informe (2/3): el móvil

- **Periodo no visto:** el resultado va justo después del informe cargado (antes, detrás del
  Monte Carlo y del formulario, a ~5.500 px en el móvil); al comparar a mano, la vista baja
  hasta él.
- **Tablas que se cortaban en el móvil:** en la de costes, «¿Sigue rentable?», y en «Métrica
  a métrica», la insignia normal / en la cola, quedaban fuera de pantalla a la derecha. Ahora
  cada fila es una tarjeta (el patrón de la tabla de descartes): el escenario arriba con sus
  cuatro cifras, y la métrica con su veredicto, tu cifra, lo habitual y la caja a lo ancho.

## 2026-10-09 — Pestañas del informe (1/3): textos que decían algo que no era cierto

Revisión de Mesetas, Descartes, Parámetros, Diagnóstico, Periodo no visto y Método contra el
motor (dos revisiones de código en paralelo y capturas en todos los tamaños).

- **Periodo no visto:** la cabecera dice ya que el resultado solo puede mantener o bajar el
  nivel, y la tarjeta del resultado dice qué ha hecho con él («Por eso el nivel de evidencia
  del veredicto baja de sólida a moderada»). Se compara con la **meseta**, no con «el EA».
  El Monte Carlo remuestrea días por bloques, no «baraja» operaciones. Un drawdown que queda
  mejor que todo lo visto ya no «supera» todo lo visto. Sin forward, los textos no hablan de
  él. «Días con operaciones» era días de mercado; «se usan las fechas» era «se muestran»;
  «arriba» no lo era. El sello «En el límite» pasa a «En la cola», como en la tabla.
- **Método (app):** enseña todos los límites de la página pública (eran 6 de 8, fijos en el
  código). Prueba de navegador que compara las dos.
- **Descartes:** «Poca robustez» salía en configuraciones con robustez 86-94; la causa real
  era una zona de menos de 3 configuraciones, y ahora lo dice. Si el forward no trae una
  columna Forward Result reconocible, la tabla se ordena por Result (y lo avisa) en vez de
  quedarse vacía diciendo que eso era «buena señal».
- **Parámetros invertidos:** el valor que gana en el periodo optimizado «no es el que gana
  en el forward» (lo que se mide), no «es de los que pierden». Motor, pestañas, veredicto y
  Metodología.
- **Parámetros:** el mapa enseña de verdad los dos parámetros más influyentes (los mismos
  que las barras y el 3D) y no se pinta con un solo parámetro; la nota del gráfico de
  sensibilidad dice lo que marca; «aislado» pasa a «por sí solo».
- **Mesetas:** en una rejilla completa ya no propone «reoptimizar» lo que ya está probado
  entero (propone afinar con pasos más finos). La ficha avisa si MT5 no pasó esa
  configuración al forward.
- **Diagnóstico:** «Métricas usadas para juzgar» ya no incluye el beneficio esperado, que no
  puntúa; la columna Result también sirve para medir si el orden de MT5 aguanta; el Sharpe
  máximo dice de qué periodo es; sin forward se ocultan las filas que no aplican y se
  explica cómo se detectaron los parámetros; el formato interno del .set ya no se enseña.
- **Glosario:** robustez (es una nota por configuración, no lo que ordena las mesetas) y
  Sharpe (sobre la curva de equity desde el build 3210).
- **Motor, sin cambiar resultados:** el mínimo de operaciones del forward se redondea hacia
  arriba (con operaciones enteras exigir 50,1 es exigir 51; comprobado en 60 casos del banco:
  ningún cambio). Los días necesarios para distinguir el resultado de cero se calculan en
  forma cerrada (la búsqueda de 10 en 10 dejaba «potencia 86 %» junto a «no se distingue de
  cero»), con prueba de respuesta conocida.

## 2026-10-09 — Metodología al día con el motor, y un fallo de la estabilidad corregido

- **Fallo corregido** (`core/analysis.js`): al repetir la búsqueda moviendo nuestros umbrales
  un ±20 %, la fracción mínima de vecinas que cumplen (0,9) se multiplicaba por el factor y
  por encima de ×1,111 pedía más del 100 %. Esas 9 de 50 repeticiones nunca encontraban
  meseta, así que la estabilidad no pasaba de 0,82 (y el dibujo de Metodología, «48 / 50»,
  era imposible). Ahora se mueve lo que le falta para 1 (entre 0,88 y 0,92). Salió al
  documentar el motor, no al mirar resultados.
- **Banco:** enmienda en `bench/PREREGISTRO.md` y quinto examen ciego (5001-5100). Aprueba
  los criterios de «buena» y «sólida» (ninguna «sólida» sin ventaja; «buena» 2 % en S5, en
  el límite) y suspende tres que el motor anterior suspende igual con esas semillas
  («moderada o más» en S5, 8 %; media con vecinas, 0,198 frente a 0,228; S8 más de 0,10
  peor que la n.º 1 de MT5). La portada cita ahora este examen.
- **Metodología reescrita** contra el código, en lenguaje de trader (ES y EN): cómo se
  puntúa la calidad (escala desde tus mínimos, media geométrica, qué pesa más); qué es
  vecina y qué hace falta para una meseta; el forward con sus cifras (80 % y 65 %, las
  configuraciones sin forward no cuentan como validadas); el contraste del azar como
  adaptación y el resto de comprobaciones que el informe enseña; los umbrales de la
  estabilidad; los avisos de la tabla que no bajan el nivel; el periodo no visto comparado
  con la meseta, que solo mantiene o baja el nivel y cuánto detecta. Sección nueva «Cómo
  sabemos que funciona» con las cifras del último examen y dónde falla, y tres límites más
  en «Lo que no hace». `tests/home-bench.test.js` vigila también esas cifras.

## 2026-10-09 — «Sólida» sin periodo no visto, medida en el banco

- **El problema:** con exports reales de MT5 el nivel no podía pasar de «moderada».
  «Sólida» exigía cero avisos, y el aviso de que MT5 solo reexporta al forward las mejores
  pasadas sale en todo export real. «Buena» solo se veía en el ejemplo, cuyo forward trae
  todas las filas. En el banco, 0 «sólidas» en el segundo examen.
- **Motor** (`core/verdict.js`): los avisos que miden el orden de la tabla y no la meseta
  (ranking de MT5, orden de la nota de Orometra entre periodos, transferencia del ranking,
  asimetría entre periodos, valores que se invierten por parámetro, preselección del
  forward) se siguen mostrando, pero no cuentan para los niveles altos. «Sólida»: sin
  críticos, meseta con configuraciones probadas en el forward, búsqueda repetida moviendo
  los umbrales y ningún aviso sobre la meseta. «Buena»: lo mismo con un aviso, si la
  recomendación aguanta al menos el 80 % de las variaciones de umbral. La elección de la
  configuración no cambia. Dos textos de avisos ajustados a lo que miden.
- **Periodo no visto** (`js/ui-verdict.js`): mantiene el nivel («Evidencia sólida, y el
  periodo no visto no la contradice») o lo baja a «moderada» si va en contra; nunca lo
  sube. Un informe de otra configuración no cambia nada.
- **Banco** (`bench/PREREGISTRO.md`, dos enmiendas): criterios nuevos «sólida» ≤ 1 % y
  «buena o sólida» ≤ 2 % en cada escenario sin ventaja. El tercer examen (3001-3100)
  suspendió el segundo en S5 (3 %) y se publica tal cual; «buena» se endureció y el cuarto
  examen (4001-4100, ciego) aprueba los criterios nuevos: «sólida» 0 % y «buena o sólida»
  1 % como máximo sin ventaja; con ventaja, 52 «buena» y 24 «sólida» de 500; ventaja real
  media de la elegida 0,178 (moderada) < 0,219 (buena) < 0,239 (sólida). Suspende dos
  criterios que ya suspendía el motor anterior con esas semillas: «moderada o más» en S5
  (7 %) y la elección frente a la media con vecinas (0,227 frente a 0,192).
- **Portada:** la sección del banco cita ahora el cuarto examen (falsas alarmas 2,7 % y
  ninguna «sólida», ventajas detectadas 90 %, 0,23 frente a 0,29 de la n.º 1 de MT5) y
  añade el punto débil de S5. El ejemplo de la tarjeta, la metodología, la guía del
  forward y el README describen los niveles nuevos. Pruebas: `tests/levels.test.js` y
  las de coherencia del veredicto.

## 2026-10-09 — Portada: cifras del banco de pruebas y foto del cierre más ligera

- **Sección nueva en la portada, «Puesto a prueba donde se sabe la respuesta»**, entre la
  tarjeta de ejemplo y «Lo que hay detrás». Tres cifras del segundo examen, ciego
  (`bench/results/REPORT-exam2.md`): falsas alarmas 1,7 % (5 de 300 optimizaciones sin
  ventaja con «moderada» o más), ventajas detectadas 85 % (35 de 41 con ventaja clara) y
  distancia mediana a la mejor configuración en el periodo no visto 0,22 frente a 0,30 de la
  n.º 1 de MT5. Debajo, en caja, dónde no gana: la media con vecinas queda por delante en el
  total (0,19) y la n.º 1 de MT5 gana en S7 (genética) y S8 (rejilla de un export real),
  porque cada abstención cuenta como fallo; 9 de 11 criterios; datos simulados. Enlaces al
  prerregistro y a los resultados.
- Antes de citarlas, el examen se repitió con el motor actual (`BENCH_TAG=now node
  bench/run.js exam2`): el informe sale idéntico al publicado, salvo los tiempos.
- `tests/home-bench.test.js` lee `REPORT-exam2.md` y comprueba que los textos en los dos
  idiomas citan esas cifras, y que lo que afirma la nota es cierto en el informe (incluido
  el «por eso»: con la sugerencia orientativa, gana en S7, S8 y a la media con vecinas).
- **Foto del cierre en móvil** (`cierre-mov-915`): AVIF de 192 a 98 KB y WebP de reserva de
  216 a 164 KB, sin diferencia visible. La portada en móvil baja de 599 a 508 KB. El resto
  de la portada ya estaba en su sitio (485-732 KB en escritorio según tema y pantalla).
- Caché de estilos `?v=20261009a`.

## 2026-10-08 — Guías revisadas una a una y ampliadas

Revisión de las seis guías (EN y ES) contra la ayuda de MetaQuotes y el código.

- **Errores corregidos:**
  - Informe del probador: el drawdown relativo no es «esa misma caída en porcentaje»: el
    máximo en dinero y el relativo en % son dos máximos distintos y pueden ser episodios
    diferentes (ayuda de MT5). Ejemplo resuelto en la guía.
  - Forward: decía que Orometra contrasta «sin mezclar ni promediar los dos periodos», y el
    motor elige dentro de la meseta por puesto conjunto in-sample + forward. Ahora lo
    explica tal cual, y por qué eso obliga a pedir un periodo no visto.
- **Precisión:** el forward prueba el 10 % (completa) o el 25 % (genética) mejor, con un
  número mínimo de pasadas (ayuda de MT5; el export real de `MT5_ASSUMPTIONS.md`, 810 → 256,
  encaja con el mínimo de 256 que se cita en los foros). Los criterios «Profit Factor max» y
  similares se describían en la ayuda antigua combinados con el balance: la guía lo dice y
  remite a la ayuda del propio terminal. Los rótulos del MT5 en español, sin confirmar, van
  con el inglés entre paréntesis.
- **Ampliadas** (de ~650 a ~1.150–1.450 palabras cada una), con ejemplos resueltos:
  exportar (preparar el probador, columnas de cada archivo, Back Result, comprobar los
  archivos); forward (cuántas operaciones necesita, qué pasadas llegan y por qué no es una
  muestra al azar, cómo leer su tabla con un ejemplo, el tercer tramo); genética o completa
  (contar combinaciones, estimar el tiempo con los agentes, cobertura, decidir paso a paso);
  criterio (tabla de qué premia cada uno, criterio complejo de la versión 2615, ejemplo de
  `OnTester()`); informe (fórmulas de cada cifra, drawdowns con ejemplo, Sharpe de la versión
  3210 y sus franjas, calidad del histórico, modos de modelado y costes). Sobreoptimización:
  el mínimo de pasadas del forward y la prueba de tus mínimos en «Se examina a sí mismo».
- Tablas, ejemplos y código con estilo propio (`guide-table`, `guide-note`, `guide-code`),
  desplazables con teclado si no caben. Fecha de revisión de las seis guías: 2026-10-08.

## 2026-10-08 — Historial local de análisis

- **Qué guarda:** tras cada análisis (no el ejemplo), un resumen de ~0,7 KB en el navegador
  (`orometra.history`): nombres de archivo y de parámetros, mínimos, nivel mostrado,
  configuración recomendada, tamaño, robustez y tramo de su meseta por parámetro, y el
  resultado del periodo no visto si se comprueba. Nunca los archivos ni las tablas. Se
  conservan los 50 más recientes. Volver a analizar exactamente lo mismo no cuenta como otro
  intento. Activado por defecto, con un aviso la primera vez («Entendido» / «No guardar
  historial») y un interruptor en la pestaña.
- **El mismo EA:** el XML de MT5 no trae nombre, símbolo ni fechas, así que se reconoce por
  sus parámetros (huella FNV-1a del conjunto de nombres). Cada EA admite una etiqueta propia.
- **En el veredicto:** «Frente a tu análisis anterior de este EA»: nivel antes y ahora,
  tamaño y robustez de la meseta y, sobre todo, si la configuración recomendada ahora cae
  dentro del tramo de la meseta de la otra vez, parámetro a parámetro. Si cambiaron los
  mínimos o el forward, se dice que los niveles no son comparables. «Coherente con una meseta
  real; si son los mismos datos, no es una prueba independiente».
- **Aviso de intentos:** desde el 3.er análisis del mismo EA, «subir de nivel tras varios
  intentos no es más evidencia: es probar más veces». No se sabe si el periodo es el mismo
  (no hay fechas) y se dice.
- **Pestaña Historial** (08, accesible sin análisis): lista por EA con fecha, archivos,
  mínimos, nivel, configuración recomendada y periodo no visto; borrar uno o todo (con
  confirmación) e interruptor.
- **Privacidad** (página y aviso legal de la app, ES/EN) al día; la prueba AUD-08 exige ahora
  que se nombre el historial. `core/history.js` con 34 pruebas de respuesta conocida
  (`tests/history.test.js`) y 11 comprobaciones de navegador nuevas.
- Sin exportar ni importar el historial por ahora (decisión del autor).

## 2026-10-08 — Tema según el sistema en la primera visita

- Sin elección guardada, la web usa el tema del sistema (claro u oscuro) en lugar de
  empezar siempre en oscuro, y lo sigue si el sistema cambia (modo noche automático). En
  cuanto el usuario elige un tema, manda su elección. Vale para portada, páginas de texto y
  app.
- La etiqueta `color-scheme` sigue al tema antes de pintar: con el sistema en claro ya no
  hay un instante de fondo oscuro al cargar.
- Prueba de navegador nueva: sistema claro u oscuro, con y sin elección guardada, en la
  portada y en la app (8 comprobaciones).

## 2026-10-08 — Portada equilibrada, guías en el móvil, tarjeta de ejemplo clicable y gráficos del veredicto en el móvil

Comprobado a 320, 390, 768, 1024, 1440 y 1920 px, en los dos temas.

- **Portada, «En MT5, el n.º 1 suele ser el más frágil»:** las dos tarjetas comparten filas
  (subgrid): título, recuadro, imagen y texto quedan a la misma altura. Antes, a la de MT5 le
  sobraban 118–149 px abajo en escritorio. Lleva un recuadro neutro gemelo del lima: «La n.º 1
  de MT5: pasada 1842 · El Resultado más alto entre miles de pasadas». En el móvil, una
  debajo de otra como siempre. Las etiquetas del diagrama crecen (de 8 a 10 px a 320 px).
- **Guías en el móvil:** sin huecos de hasta 46 px sobre «Leer la guía». Las tarjetas solo se
  igualan en altura cuando van a dos columnas.
- **Tarjeta de ejemplo de la portada:** sus botones («Descargar .set», «Copiar parámetros»)
  parecían funcionar y no hacían nada. Ahora toda la tarjeta es una vista previa: tocarla en
  cualquier punto abre el informe de ejemplo completo, donde esos botones funcionan. Lo hace
  el enlace «Ver el informe de ejemplo completo», estirado sobre el bloque (el texto se sigue
  leyendo como texto); al pasar el ratón la tarjeta se eleva, y con teclado se ve el foco.
- **Veredicto → «Gráficos: optimización frente a validación» en el móvil:** la nube de puntos
  y los deciles se dibujan con un formato compacto (280 unidades, ejes y etiquetas más cortos)
  y caben sin deslizar desde 320 px. Al girar el móvil se redibujan solos sin cerrar el
  desplegable. En escritorio, igual que antes.
- **Medidor de fiabilidad:** no cambia. El comentario de la regla de color de `styles.css`
  recoge ahora la escala de rojo a lima como excepción deliberada.

## 2026-10-08 — Diagrama de cajas y mapa de calor enteros en el móvil

- **Parámetros → «Calidad por valor del parámetro» y «Los dos parámetros más
  influyentes»:** pasan de SVG de 620 unidades a HTML con rejilla CSS. En el móvil se
  deslizaban de lado y a 390 px solo se veían 3 de los 7 valores del diagrama y 5 de las 7
  columnas del mapa; ahora caben enteros desde 360 px. En escritorio se ven como antes.
  Solo si hay más valores de los que caben (o en pantallas de 320 px) se vuelve a deslizar,
  con el mismo difuminado que avisa.
- Celdas y cajas se imprimen (`print-color-adjust`); el detalle de cada celda sigue al pasar
  el ratón.
- El aviso «Se necesitan dos parámetros con varios valores» salía solo en español; ahora
  también en inglés.
- Prueba de navegador nueva: en el móvil, los tres gráficos de Parámetros caben sin deslizar y
  su texto no baja de 10 px.

## 2026-10-08 — Tarjetas anchas del informe a dos columnas

Medido a 1440 px: tres tarjetas usaban la mitad de su ancho (el texto va a 72 caracteres
como máximo) y dejaban la otra mitad vacía. Ahora, cuando la tarjeta mide 880 px o más (se
mide la tarjeta, no la ventana: *container queries*), se reparten en dos columnas. En tablet
y móvil no cambian.

- **«Por qué este nivel»** con un solo lado (solo «A favor» o solo «En contra»): las
  razones en dos columnas. Del 54 % al 98 % del ancho y de 667 a 509 px de alto.
- **«Influencia relativa»:** el gráfico a la izquierda y su explicación a la derecha
  (del 49 % al 98 %; de 408 a 330 px).
- **«Carga aquí el informe del backtest»** (periodo no visto): el texto a la izquierda y, a la
  derecha, dónde soltar el informe, con el botón (del 49 % al 92 %).
- El mapa de calor se queda como estaba: partido, salía un 17 % más pequeño (su ancho de
  referencia de 620 unidades es a propósito) y su lado derecho ya es parte del SVG.

## 2026-10-08 — Cabecera compacta en el informe y pico frente a meseta en la portada

- **Informe, fuera del veredicto:** la cabecera pasa de un titular de tres líneas (~285 px
  antes del contenido en cada pestaña) a una línea con el nivel («● Evidencia buena»), la
  pasada y «Descargar .set» junto a «Empezar de cero» y «Exportar». En escritorio queda fija
  arriba al bajar; en el móvil no, porque ya están fijas las pestañas. Sin forward, el botón
  es «Descargar rango»; sin meseta, no hay botón y se dice «Ninguna configuración con
  garantías» (o la sugerencia orientativa). El titular completo sigue en el h1 para el lector
  de pantalla y al imprimir; la pestaña del veredicto no cambia.
- **Portada, «Lo que hace Orometra»:** un diagrama con las mismas pasadas que la tabla de al
  lado: la n.º 1 de MT5 (1842) es un pico solo cuyas vecinas no pasan tus mínimos; la 4283,
  el centro de una meseta que sí los pasa. Pico en gris y elegida en lima, como en la tabla.
  Es SVG en la propia página, sin código 3D. Desde que salieron el relieve 3D (#117) y los
  estorninos, ninguna imagen de la portada contaba la idea de pico frente a meseta.

## 2026-10-08 — Auditoría de diseño: seis arreglos visuales

- **Influencia relativa (pestaña Parámetros):** pasa de SVG de 620 px a una lista HTML que
  se adapta al ancho. En el móvil, el gráfico se deslizaba de lado y las cifras
  («0.87 · aislado 0.67») quedaban fuera de vista; ahora va nombre y cifra en una línea y la
  barra debajo. En escritorio se ve como antes. Las barras se imprimen
  (`print-color-adjust`).
- **Tablas apiladas en el móvil:** las etiquetas («Parámetro», «Valores») salían en
  monoespaciada si la celda lo era; ahora siempre en la letra del texto.
- **Títulos de pestaña** con interlineado 1,2 (heredaban 1,55: en el móvil, dos líneas muy
  separadas).
- **Índice de las guías:** sin doble número («01 1. Antes de optimizar…» → «01 Antes de
  optimizar…»).
- **Accesibilidad:** `role="group"` en la tarjeta de ejemplo de la portada y en los valores
  recomendados del informe (un `aria-label` en un `div` sin rol no se anuncia); fuera un
  `aria-labelledby` redundante en las preguntas frecuentes.
- **Portada:** «12 de 12» como en la app (antes «12 / 12»). Caché de estilos `?v=20261008a`.

## 2026-10-07 — Plurales, «%» en inglés y la banda del periodo no visto

- **Singular con una sola unidad:** «1 configuración supera los mínimos», «1 pasada sin
  pareja», «solo 1 vecino probado», «Has optimizado 1 parámetro», «Falta #3: esa
  configuración…», «El .set solo lleva el parámetro que optimizaste»… (antes, siempre en
  plural). Lo mismo en inglés.
- **Mínimos que no filtran:** con varios, la frase dice «por ninguno de ellos, así que
  moverlos» (antes, siempre «moverlo»).
- **Porcentajes:** nuevo `pctSign()` en `js/i18n-core.js`: «20 %» en español y «20%» en inglés
  donde la cifra se compone igual para los dos idiomas (antes, en inglés salía «20 %»).
- **Periodo no visto:** la banda de cada métrica tiene descripción para lectores de pantalla
  (valor, estado y rango habitual).

## 2026-10-07 — CLAUDE.md

- Nuevo `CLAUDE.md` en la raíz: lo lee Claude Code al empezar cada sesión. Resume cómo
  trabajar con el autor, los comandos, la estructura, los principios de `docs/SPEC.md`, las
  normas de código y de texto (español de España con tú, inglés americano, términos
  asentados), cómo se publica y lo pendiente conocido, para no repetirlo en cada chat.

## 2026-10-07 — Un solo botón en la portada, «Analizar» en la app y diagrama del paso 9

- **Portada:** fuera el círculo con flecha junto a «Analizar mis resultados» (arriba y en el
  cierre): llevaba al mismo sitio que el botón.
- **App vacía:** «Analizar» desactivado ya no parece otra tarjeta (sin fondo, con su flecha
  apagada) y dice cuándo se activa en vez de repetir lo que ya dice la zona de carga. La
  nota del .set pasa de cuatro líneas a dos y de 13 a 14 px.
- **Metodología, paso 9:** «Monte Carlo», «Tamaño de muestra» y «Stress de costes» caben en
  una línea mientras el diagrama mide más de 470 px; por debajo, con la letra agrandada, se
  siguen partiendo en dos.

## 2026-10-07 — Páginas de texto: una columna de lectura y letra más grande

- **Metodología, Guías, Privacidad y Quiénes somos:** el contenido va en una columna centrada
  de 640 px; separadores, listas y diagramas miden lo mismo que el texto. Antes, el texto
  ocupaba ~470 px pegado a la izquierda y dejaba media pantalla vacía. El índice de la
  Metodología y las tarjetas de Privacidad y de Guías se abren a 920 px. La cabecera con foto
  no cambia.
- **Metodología:** cada paso lleva su diagrama debajo del texto, a lo ancho de la columna, en
  vez del zigzag (que apretaba el texto de esos pasos en 360 px).
- **Texto largo a 18 px** (16 en el móvil, antes 15) y entradilla a 20 px; títulos de sección
  a 24 px para que sigan destacando. Unos 70–80 caracteres por línea en escritorio.

## 2026-10-07 — Escala de fiabilidad en el móvil y texto del informe más legible

- **Escala de fiabilidad:** en móviles de 361 a ~420 px (iPhone de 390 px), «Insuficiente»
  se salía de su tramo y quedaba pegado a «Débil». Ahora, si la escala mide menos de 356 px,
  se muestra solo el nivel actual (antes, por debajo de 313 px); desde 356 px hay 8 px o más
  entre nombres.
- **Informe de la app:** el 87 % del texto iba a 13–14 px. Los párrafos de lectura (notas de
  gráficos, introducciones de panel, hallazgos, «A favor / En contra», límites, pasos de
  «Qué hacer ahora», nota de la pasada elegida) pasan a 15 px, y las notas secundarias a
  14 px. Etiquetas, cifras, tablas y botones no cambian.

## 2026-10-07 — Portada sin la sección de los estorninos

- Se quita «Ningún estornino vuela solo»: repetía la idea de las vecinas, que la portada ya
  explica dos secciones antes, con una metáfora que competía con la del relieve. Fuera también
  sus textos, las 12 fotos de la bandada y su etalonado en `tools/fotos.mjs`.

## 2026-10-07 — Auditoría de textos en español e inglés

Revisión de todos los textos visibles (diccionario, veredicto, mesetas, periodo no visto,
errores, exportaciones y páginas públicas), comparando cada pareja ES/EN. Unos 190 cambios
puntuales; lo que estaba bien no se ha tocado.

- **Incoherencias ES↔EN corregidas:** el inglés decía «no plateau to fall back on» donde el
  español (y la lógica) dicen «no hay región amplia»; «cerca de la mitad de los casos» con
  estabilidades de hasta el 80 % pasa a «hasta en la mitad»; la nota del Sharpe menciona los
  rendimientos logarítmicos en los dos idiomas; el glosario de coherencia y la descripción
  de privacidad para compartir dicen lo mismo en ambos.
- **Sin traducir:** el pie de página (`aria-label`, `title`) y la navegación de la app
  quedaban en inglés en las páginas españolas; el gráfico de sensibilidad pintaba
  «particion»/«plano» en inglés; los nombres de los archivos descargados salían siempre en
  español.
- **Términos unificados:** «drawdown» en vez de «caída», «minimums» en vez de «gates» y
  «Minima», «meseta» en vez de «región», «probador» en vez de «tester», «columna Result»,
  «rejilla», «archivo», y «test/check» en vez del calco «contrast» en inglés.
- **Errores en lenguaje llano:** «masa interior» y «región conexa con soporte local» se
  explican sin jerga; «exporta el informe XML» pasa a «Exportar a XML».
- **Ortografía:** inglés americano (modeling, gray, around, parenthesized), espacio antes de
  % y comillas «» en español, tildes, rayas y concordancias. «Sharpe» ya no sale en
  minúscula en el periodo no visto.

## 2026-10-07 — Revisión independiente del PR de la auditoría

- **Reversiones «in/out» (cuentas de compensación):** el stress de costes contaba dos veces
  el lote que se abre en sentido contrario, así que el punto de equilibrio salía a la
  mitad. Ahora se usa solo el volumen que cierra cada operación.
- **Cierres «out by»:** no sacaban sus posiciones de la cola de aperturas, y un solo «out
  by» descolocaba el emparejado de todo lo que venía detrás (el stress de costes se
  apagaba). Ahora se consumen, aunque su precio no se usa para el valor del contrato.
- **Tipos en alemán:** «Verkauf» se leía como compra (contiene «kauf»).
- **Precios con artefactos de coma flotante** (`1.0876500000000001`): ya no fijan un tamaño
  de punto absurdo.
- **Periodo no visto:** la banda ensanchada del factor de beneficio no baja de 0, y la
  tabla dice que el rango está «ajustado a tu tramo».
- **Pruebas:** en navegador, dos mesetas (el menú «Exportar» baja M1 aunque se haya mirado
  M2; con el código anterior bajaba M2) y sin forward (ningún botón .set que dé error).
  En `tests/report.test.js`, los cuatro casos de emparejado de arriba.

## 2026-10-07 — Auditoría (3): detalles de presentación y del periodo no visto

- **Muestra de menos de 30 días:** ya no enseña «potencia 99 %» junto a «no se distingue
  de cero». Por debajo de 30 días no se calcula y se dice por qué (`sampleAudit.reason`).
- **Drawdown del Monte Carlo y del stress de costes:** el capital inicial cuenta como primer
  pico (`[-100, 50]` caía 0 en vez de 100).
- **Botones «Descargar .set» sin forward:** ya no aparecen donde solo podían dar error (ficha
  de meseta, alternativas, periodo no visto). Los de la ficha de meseta y el de
  refinamiento llevan la meseta explícita.
- **«Ver la meseta completa»** baja al relieve de esa misma meseta en vez de saltar a M1.
- **Cómo cargar el .set en MT5:** el paso 1 y el rango de refinamiento lo dicen (pestaña de
  parámetros de entrada, clic derecho → «Cargar»). El paso 1 cuenta los parámetros que
  lleva de verdad el .set (también los no optimizados si cargaste el .set de la optimización).
- **Textos:** la leyenda del gráfico dice «lavanda» (decía «verde»); la configuración se
  describe igual en la tarjeta y en el .set («elegida por buen puesto…», no «el centro»);
  las operaciones por parámetro dicen que son la mediana de las configuraciones;
  «Pasada original» en el .set en español; «minimums» en la leyenda en inglés; el resumen
  .txt ya no repite el nivel.
- **Pruebas:** la del bootstrap comparaba el total de cada camino con la media diaria y
  pasaba solo porque la serie tenía media ~0; ahora compara magnitudes equivalentes.

## 2026-10-07 — Auditoría (2): valores exactos, avisos al día y periodo no visto

- **Los parámetros se muestran exactos, como en el .set.** La tarjeta, el Top 3, la tabla
  de refinamiento y el resumen .txt redondeaban a 4 decimales y escribían con coma
  (0.00015 salía «0,0002»; «1,5» en el .txt). Ahora llevan punto decimal y todas sus cifras.
- **El título de la pestaña y el resumen .txt siguen al nivel mostrado.** El título se
  quedaba con el nivel del primer análisis y el .txt seguía diciendo «pruébala en un
  periodo no usado» después de haberlo probado.
- **Un informe al que le faltan parámetros optimizados ya no «coincide».** Antes bastaba
  con que hubiera uno y ninguno distinto; si no se leía ninguno, el sello salía en verde.
  Ahora sale «No valida» y se listan los que faltan.
- **«Evidencia insuficiente» da la misma cifra en el resumen y en el hallazgo** (las
  configuraciones que pasan en el periodo optimizado, que es donde se buscan las mesetas).
- **Contraste del periodo no visto más fiable con tramos cortos** (`core/unseen.js`). El
  drawdown se corregía por duración con la raíz de n, que vale para una estrategia sin
  ventaja; ahora con n^0,35 (y el factor de recuperación con n^0,65). Las bandas del factor
  de beneficio, del beneficio por operación y del Sharpe se ensanchan por
  √(n_referencia / n_tramo) cuando el tramo es más corto. `bench/unseen.js` mide ahora tres
  duraciones (×1, ×0,4 y ×0,2 las operaciones del forward). Con 100 semillas por escenario:
  falsas alarmas con la ventaja intacta 24/29/30 % (antes 27/37/40 %), avisos sin ventaja
  35/44/45 % (antes 35/48/45 %). La nota de alcance de la app cita estas cifras y la
  proporción del tramo del usuario frente al forward. Con este banco, la regla anterior
  daba 35 % de avisos sin ventaja con un tramo como el forward, no el 49 % que citaba.

## 2026-10-07 — Auditoría: exportar, costes y nivel «sólida»

- **El menú «Exportar» baja siempre la configuración propuesta (M1).** Antes usaba la
  última meseta abierta en la pestaña de mesetas: tras mirar una alternativa, «Configuración
  propuesta (.set)» bajaba el `.set` de M2.
- **El stress de costes ya no depende del instrumento ni del lote.** Restaba cantidades
  fijas de dinero (0,5 por lote, 0,2 por lado…): en EURUSD el escenario moderado equivalía a
  4 pips por operación con 0,01 lotes y a 0,09 con 1 lote, y en oro o índices no significaba
  nada. Ahora el coste extra se mide en puntos básicos del precio (moderado +1 pb ≈ 1 pip en
  EURUSD, severo +3 pb), y el valor en dinero de cada movimiento de precio se deduce de las
  operaciones del informe emparejando cada cierre con su apertura (`core/report.js`,
  `core/trades/costs.js#contractValues`). El punto de equilibrio se da en puntos del
  instrumento, en pb y por lote. Si no se puede deducir el valor del contrato, no se
  simulan escenarios y se dice por qué.
- **«Sólida» ya no dice «confirmada».** El medidor decía «validada y confirmada en un
  periodo no visto» mientras el siguiente paso decía que aprobarlo «no la confirma». Ahora
  es «validada en el forward y sin contradicción en un periodo no visto», también en
  Metodología.

## 2026-10-04 — Limpieza del repositorio

- Fuera lo que ya no usaba nada: unas 30 reglas y 20 variables de `styles.css` de pantallas
  antiguas del veredicto, 20 textos de `js/i18n.js` y una captura suelta en la raíz.
- Fuera `vercel.json` y `_headers`: la web solo se publica en GitHub Pages. La política de
  seguridad de referencia es la de `tools/serve.js`, y el test comprueba ahora el `<meta>`
  de **todas** las páginas, no solo de ocho.
- `npm test` ejecuta `tests/all.js`, que recorre todos los `tests/*.test.js` (una prueba
  nueva ya no hay que añadirla a mano a `package.json`). `run.js`, `stress.js` e
  `invariance.js` pasan a llamarse `engine.test.js`, `stress.test.js` e `invariance.test.js`.
- `core/matrix/` pasa a llamarse `core/trades/`: el nombre venía del CSCV retirado el
  2026-09-24 y hoy la carpeta solo analiza las operaciones del periodo no visto (sus
  pruebas: `tests/trades.test.js` y `tests/trades-from-deals.test.js`).
- Licencias OFL de las tres tipografías, con su aviso de copyright correcto (faltaba la de
  IBM Plex Mono).
- `README.md` y `DEPLOY.md` al día: cinco niveles de fiabilidad, páginas en español,
  cómo se usa, y cada tema en un solo sitio.

## 2026-10-01 → 2026-10-04 — Portada, app y fiabilidad

- **Fiabilidad en cinco niveles** (insuficiente, débil, moderada, buena, sólida), de rojo a
  lima. «Buena» es una meseta sin avisos validada en el forward a falta del periodo no
  visto; si ese periodo va en contra, baja a moderada.
- **Portada** editorial: titular nuevo, fotos de paisaje (portada, cierre, guías,
  metodología, 404), sección «Lo que te llevas», preguntas frecuentes reescritas y página
  «Quiénes somos». Paleta «Noche y señal»: azul medianoche, lavanda y el lima solo para lo
  importante; tipografía Source Sans 3 / Source Serif 4 / IBM Plex Mono servida desde el
  propio dominio.
- **App**: la misma cabecera que la portada (fija al bajar, con menú en el móvil), el
  veredicto se entiende en 10 segundos, lenguaje claro en todas las pestañas, un nombre por
  concepto, nada por debajo de 12 px, mapa de calor y relieve 3D legibles en los dos temas,
  y la auditoría de interfaz resuelta en cuatro bloques.
- **Robustez**: optimizaciones de hasta 160.000 filas, errores con código y pista,
  cancelar un análisis, `.xlsx` leído fuera del hilo principal y pruebas de navegador
  (Playwright) en CI.

## 2026-09-30 — Textos: adiós a «la primera fila»

- «La primera fila» no se entendía sin conocer MT5 y se quedaba corta: con miles de
  combinaciones falla el grupo de arriba, no solo una. Ahora se habla de «los mejores
  resultados», «lo primero de la lista» o «los primeros puestos», con «suelen» / «a menudo»
  donde antes se afirmaba sin matices. La tabla de la portada se marca como ejemplo.

## 2026-09-30 — Informe: lectura más rápida

- La tarjeta de arriba del veredicto lleva ya los valores recomendados (antes había que bajar
  dos pantallas); se quitan de «Configuración ganadora» para no repetirlos.
- «Qué demuestran estos datos» en lenguaje llano («5018 combinaciones parecidas», «probaste
  todas las combinaciones»); la robustez se muestra sobre 100.
- Sin puntos en contra (o a favor) ya no se reserva una columna vacía.

## 2026-09-30 — Portada: superficie 3D renovada

- Relieve sombreado con curvas de nivel reales, más grande y con etiquetas de ejes. Al pasar
  el ratón (o solo, en táctil) muestra el mismo resultado en un periodo nuevo: el pico de
  MT5 n.º 1 (4,71) cae y la meseta de Orometra (2,18) aguanta. Se gira arrastrando (o con
  ← →). Las cifras enlazan con la tabla de la portada (`tests/hero-surface.test.js`).

## 2026-09-29 — Banco de pruebas, auditorías 2 y 3, verificación con datos reales

- **Motor** (medido en `bench/`, criterios en `bench/PREREGISTRO.md`): los porcentajes que
  exigen los dos periodos se miden sobre las configuraciones con forward; la elección
  dentro de la meseta es por puesto conjunto in-sample + forward promediado con vecinas
  (empates con puesto medio); una meseta que aguanta menos del 65 % en el forward es
  crítico; sin meseta y con forward hay una sugerencia orientativa. Segundo examen ciego:
  9 de 11 criterios frente a 5 del motor anterior.
- **Periodo no visto:** el informe del backtest se lee en HTML, Open XML (.xlsx, también en
  UTF-16 como lo guarda MT5) y XML; una métrica mejor que todo lo visto se marca como tal;
  «normal» pasa a «no contradice» y se explica el alcance con cifras medidas
  (`bench/unseen.js`: avisa en 4 de cada 10 casos en que la ventaja había caído).
- **Carga:** avisos claros con archivos que no son de MT5, con un segundo in-sample y con
  más de 4 archivos; columnas clave sin reconocer (otro idioma) son un aviso crítico y no
  se bloquea por no reconocer parámetros en un solo archivo.
- **Impresión** siempre en paleta clara; etiquetas de calidad e identificadores de métricas
  en el idioma de la interfaz; `.set` en el idioma activo y sin formato regional; «Empezar
  de cero» restablece menú y título; textos de metodología corregidos (los mínimos se
  exigen por periodo; no existe un modo «Todos los parámetros» en MT5).

## 2026-09-26 — SR-1 resuelto: fuera el contraste de Sharpe basado en operaciones

`core/analysis.js`'s `sharpeTest` calculaba el error típico de cada Sharpe (Lo,
2002) usando el número de operaciones de cada Pass como tamaño de muestra —
pero SR-1 (ver `docs/MT5_ASSUMPTIONS.md`) ya establecía que MT5 calcula ese
Sharpe sobre los log-retornos de la curva de equity **por barra**, anualizados,
no por operación. El export de optimización no dice cuántas barras usó cada
Pass, así que ese error típico no tenía base real: podía salir demasiado
laxo o demasiado estricto según el timeframe de cada usuario, sin que fuera
un sesgo conocido en ninguna dirección.

- **Retirado**: el contraste tipo Lo (2002) por operaciones (`typicalSe`,
  `bestSe`, `chanceMax`/`chanceMaxEffective` basados en operaciones,
  `deflated`), y el finding "El Sharpe aprueba con nuestro criterio, no con
  el más estricto" que comparaba ambos umbrales.
- **Único criterio ahora**: la dispersión de los Sharpe observados *entre
  pasadas* (estilo Bailey y López de Prado, ya calculada antes como umbral
  "más estricto" secundario). No depende de operaciones ni de barras — es
  un hecho observable sobre la malla que de verdad se probó. Su sesgo
  conocido va siempre en la dirección seria: más estricto cuanta más señal
  real hay, nunca da falsa confianza.
- `sharpeTest` pierde los campos `observedTrades`, `typicalSe`, `bestSe`,
  `chanceMaxEffective`, `chanceMaxConservative`, `conservativeSigma`,
  `crossSectionalSd`, `deflated`; gana `sigma` (antes `conservativeSigma`/
  `crossSectionalSd`, ahora un único campo). `chanceMax` cambia de
  significado: antes era el umbral por operaciones con N total, ahora es el
  único umbral, calculado con pruebas efectivas.
- Actualizados: panel de Diagnósticos (`js/ui-plateaus.js`), herramienta de
  consola (`tools/audit.js`), `tests/run.js`, fixture de regresión
  (`tests/fixtures/demo-regression.json`), y los 2 títulos de finding en
  `tests/finding-categories.test.js` (114 → 112 tras retirar el finding del
  segundo umbral).

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
(Después: SR-1 se resolvió el 2026-09-26; FWD-1 se observó en exports reales el 2026-09-28 y el
2026-10-11, ver `docs/MT5_ASSUMPTIONS.md`; la carpeta `web/` no se hizo.)
- **SR-1** (cómo calcula MT5 el Sharpe del export): sigue pendiente de verificación manual en MT5.
- **FWD-1**: mitigado con aviso; falta confirmar con exports reales el comportamiento exacto de MT5.
- Reorganizar la app web bajo carpeta `web/` (arquitectura objetivo): aplazado.
- Verificación manual FWD-1 / SR-1 en MT5 (sigue pendiente).

### Trabajo Lite previo
- Cobertura vs `.set`, copy DoF/Sharpe, UX evidencia débil, IS+Forward obligatorio, i18n del veredicto, etc.

---

## Cómo usar este archivo
Al cerrar un trabajo relevante, una entrada arriba del todo (la más reciente primero): fecha,
qué se hizo y por qué, qué se midió y qué queda pendiente.
