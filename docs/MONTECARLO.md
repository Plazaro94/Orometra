# Monte Carlo sobre las operaciones de un backtest: diseño

Estado: **en la app (pendiente del visto bueno del autor para publicar).** Diseño: 2026-10-13; interfaz: 2026-10-15.

Regla que manda sobre todo lo demás: **si el banco no aprueba un método, ese método no se
publica; si ningún método aprueba, la herramienta no se construye**, y lo que hoy enseña la app
se retira o se corrige. Es preferible no tener Monte Carlo a tener uno que dé una falsa
seguridad.

Contenido:

1. [Resumen](#1-resumen)
2. [Hallazgo previo: el Monte Carlo actual se queda corto](#2-hallazgo-previo-el-monte-carlo-actual-se-queda-corto)
3. [Qué pregunta contesta y cuáles no](#3-qué-pregunta-contesta-y-cuáles-no)
4. [Datos: qué se lee del informe y qué se pregunta](#4-datos-qué-se-lee-del-informe-y-qué-se-pregunta)
5. [Método](#5-método)
6. [Periodos y sesgo de selección](#6-periodos-y-sesgo-de-selección)
7. [Lo que se descarta y por qué](#7-lo-que-se-descarta-y-por-qué)
8. [El usuario: flujo, preguntas y rechazos](#8-el-usuario-flujo-preguntas-y-rechazos)
9. [Preguntas frecuentes](#9-preguntas-frecuentes)
10. [Borrador de prerregistro del banco](#10-borrador-de-prerregistro-del-banco)
11. [Pruebas de respuesta conocida](#11-pruebas-de-respuesta-conocida)
12. [Fases y puertas](#12-fases-y-puertas)
13. [Decisiones que tiene que tomar el autor](#13-decisiones-que-tiene-que-tomar-el-autor)
14. [Comprobado y no comprobado](#14-comprobado-y-no-comprobado)
15. [Referencias](#15-referencias)

---

## 0. Estado a 2026-10-15

Lo que sigue (secciones 1 a 15) es el diseño de partida, con las correcciones que fue pidiendo
el banco. Lo vigente, en corto:

- **Dos partes, cada una honesta con lo que es.**
  - **Radiografía** (para todos): los mismos días de operativa en otro orden. Dice si el orden
    real fue afortunado, la racha de pérdidas normal y dibuja las curvas posibles. No es una
    previsión. `core/trades/radiography.js`.
  - **Previsión** (cuando los datos lo permiten): **M2bc**, el bootstrap bayesiano por bloques
    con el nivel calibrado por doble bootstrap. `core/trades/montecarlo.js`.
- **Tres puertas antes de la previsión:** rachas (contraste robusto de Dalla, Giraitis y
  Phillips, 2020), volatilidad agrupada (McLeod y Li, 1983) y al menos 100 días con operaciones.
  Si alguna salta, no hay cifras y se dice por qué.
- **Examen (`bench/results/REPORT-MC-exam1.md`, una sola vez, casos nuevos):** M2bc es apto para
  prever **6 meses desde 1 año** de datos no usados para elegir y **12 meses desde 2 años**; **no
  es apto a 3 meses** con ningún tamaño de muestra (demasiado prudente con EAs muy poco frecuentes
  y corto con rachas o volatilidad agrupada con 6 meses de datos). Se cumple el criterio de
  descarte de la enmienda 6. La calibración 4 había pedido 2 años para los 6 meses (por la
  volatilidad agrupada con 1 año): es un punto débil y conviene quedarse con lo más estricto.
- **Radiografía (`bench/results/REPORT-RADIO-1.md`):** aprueba en todos los procesos exigidos,
  incluido el EA real del autor.
- **Nunca hay previsión con datos usados para elegir** (con 100 o más configuraciones probadas,
  el drawdown supera su p95 un 12-32 % de las veces).
- **Descartados:** M0 (el que había en la app), M1, M2 (contaba dos veces la incertidumbre) y M2c.
- **Defecto conocido:** el detector de volatilidad agrupada mira los cuadrados y, con colas
  gruesas, dos días extremos pueden dispararlo. En el informe real del autor salta en el
  histórico completo por dos ganancias de 5.187 y 6.361 separadas 9 días (recortándolas, p =
  0,08). Es un error del lado prudente (niega cifras, no da cifras malas), pero confunde.
  Mejora pendiente: un detector robusto, que exigiría calibrar y examinar de nuevo.
- **Qué recibe cada usuario:** sección 8.6. **Los gráficos:** sección 8.7.
- **Interfaz (2026-10-15).** En la pestaña del periodo no visto, sobre el informe cargado
  (`js/ui-montecarlo.js`; cálculo en el worker con `core/trades/mc-report.js`):
  - Tipo de lote deducido (`core/trades/sizing.js`: fijo, proporcional o martingala) y
    corregible por el usuario; con martingala no hay cifras.
  - Radiografía con 30 operaciones o más: 2.000 órdenes, 100 curvas de ejemplo, bandas del
    5-95 % y del 25-75 %, la curva real encima, la frase de la caída y la de la racha. Si saltan
    las puertas, con aviso.
  - Previsión a 6 y 12 meses solo con **504 días laborables o más** (lo más estricto de la
    calibración y del examen), 100 días con operaciones, las dos puertas, el informe de la
    configuración elegida (parámetros comprobados), sin repetir un periodo ya usado, sin otra
    meseta comparada con fechas que se solapan y con la **confirmación del usuario** de que no usó
    esas fechas para elegir (la app no puede comprobarlo: el export no trae fechas). A 3 meses,
    nada. Se enseñan solo cifras examinadas: p05/p50/p95 del resultado, p50/p95 de la caída,
    probabilidad de pérdida y, si el usuario la da, la de tocar su límite (con «menos del 1 %»
    en vez de 0 %). La distribución principal usa 10.000 simulaciones (el examen, 2.000); la
    calibración, 200 × 500 como en el examen.
  - **Pendiente:** el abanico hacia delante de 8.7 no está: el examen validó el final del
    horizonte y la caída máxima, no cada punto del camino. Tampoco la exportación de 8.5 ni la
    página propia (D3).
  - **Backtest largo con fechas de corte (6.1), 2026-10-15.** La pantalla pregunta si el informe
    incluye fechas usadas para elegir. Si sí, el usuario da el último día usado (y, si quiere, el
    fin del optimizado); cada operación va al tramo de su fecha de cierre
    (`core/trades/mc-report.js#splitByCuts`) y se dice cuántas posiciones cruzan un corte (el
    lector guarda ahora la hora de apertura de cada cierre). La radiografía sale por tramos, en
    una tabla y con el gráfico del tramo que se elija; la previsión, solo con el tramo posterior
    a la elección, con las mismas condiciones de arriba. Con el informe real del autor: optimizado
    89 % (orden favorable), forward 3 % (desfavorable), posterior a la elección 51 % (normal).
  - **Limitación que sigue:** el contraste con la meseta («la prueba de fuego», `core/unseen.js`)
    usa las cifras del informe entero, también cuando el usuario da fechas de corte aquí.

---

## 1. Resumen

- **Qué es.** Un módulo de Orometra, no una herramienta aparte. Toma el informe de un
  backtest de MT5 y da una **distribución predictiva** de lo que podría pasar en los próximos
  meses *si el futuro se comporta como esas operaciones*: resultado, drawdown máximo y
  probabilidad de pérdida o de tocar el drawdown que el usuario dice que no aguanta.
- **Se usa con o sin las mesetas.** Hay dos puertas («vengo de optimizar» y «ya tengo una
  configuración») y un mismo mapa.
- **Un archivo y una pregunta.** El usuario aporta *un* backtest de su configuración sobre
  todo su histórico y nos dice las fechas de corte. La app parte las operaciones y da dos
  resultados con su etiqueta: con las operaciones que usó para elegir (sesgado a favor) y con
  las que no usó (la prueba limpia).
- **El método no se elige a ojo.** El candidato es un **bootstrap predictivo en dos etapas**
  con bloques (sección 5). La sección 2 muestra con cifras por qué el bootstrap de la app,
  tal como está, se queda corto.
- **Se valida antes de existir.** Banco con verdad conocida y criterios cerrados antes de
  ejecutarlo (sección 10), con **criterio de descarte**: si con un año de datos no se alcanza
  la calibración exigida, no se construye.

---

## 2. Hallazgo previo: el Monte Carlo actual se queda corto

Hoy la sección del periodo no visto enseña, a partir de `core/trades/bootstrap.js`, la
mediana y el rango P05–P95 del resultado, la mediana de la caída máxima y la probabilidad de
pérdida a 3, 6 y 12 meses (`js/ui-unseen.js:280-285`). Se ha medido si esos cuantiles cubren
lo que pasa en un periodo **futuro del mismo proceso**, sin sesgo de selección ni cambio de
mercado (el caso más favorable posible).

**Cómo se ha medido** (`bench/montecarlo-exploratorio.js`, resultados en
`bench/results/montecarlo-exploratorio.txt`; 300 casos por celda, 1.000 simulaciones por
caso, media diaria de 0,05 desviaciones típicas, horizonte igual a la muestra): se generan
*n* días, se calcula el Monte Carlo, se generan otros *n* días del mismo proceso y se cuenta
cuántas veces el futuro cae fuera de lo que el método dijo. Si el método está bien
calibrado, el drawdown futuro supera su p95 un 5 % de las veces y el resultado total cae
fuera de su P05–P95 un 10 %.

**Tabla A1 — el método de la app (plug-in, bloque √n)** (cada celda: drawdown futuro > p95 / resultado futuro fuera de P05–P95, en %; ideal: 5 / 10)

| Proceso | n = 63 | n = 126 | n = 252 | n = 504 |
|---|---|---|---|---|
| Normal independiente | 14,7 / 33,0 | 15,7 / 29,7 | 16,7 / 36,7 | 13,3 / 29,7 |
| t3 (colas gruesas) | 18,7 / 31,3 | 19,3 / 30,3 | 21,3 / 33,3 | 12,7 / 26,3 |
| AR(1) 0,3 | 20,7 / 34,3 | 21,0 / 38,3 | 16,3 / 34,0 | 10,3 / 29,3 |
| GARCH(1,1) | 22,3 / 34,7 | 17,3 / 30,7 | 13,3 / 30,3 | 19,7 / 30,7 |
| EA disperso (70 % de días a 0) | 23,0 / 34,0 | 20,3 / 35,0 | 13,3 / 30,0 | 17,0 / 35,0 |

**Tabla A2 — predictivo en dos etapas con el mismo bloque √n** (cada celda: drawdown futuro > p95 / resultado futuro fuera de P05–P95, en %; ideal: 5 / 10)

| Proceso | n = 63 | n = 126 | n = 252 | n = 504 |
|---|---|---|---|---|
| Normal independiente | 10,3 / 19,3 | 10,3 / 14,0 | 10,0 / 16,7 | 9,0 / 11,7 |
| t3 (colas gruesas) | 13,7 / 20,7 | 11,7 / 17,3 | 11,7 / 18,3 | 7,7 / 11,0 |
| AR(1) 0,3 | 12,7 / 21,3 | 14,3 / 24,7 | 9,7 / 17,3 | 5,0 / 13,7 |
| GARCH(1,1) | 13,7 / 19,3 | 10,7 / 17,0 | 9,3 / 14,7 | 11,3 / 17,3 |
| EA disperso (70 % de días a 0) | 14,0 / 22,3 | 11,7 / 21,7 | 7,0 / 13,7 | 9,7 / 18,0 |

**Por qué pasa.** El bootstrap de la app es *plug-in*: saca el futuro de la propia muestra
como si la muestra fuera el proceso verdadero. Pero la media de la muestra también es una
estimación con su error. Con datos independientes, el resultado de un futuro de *H* días
alrededor de lo esperado tiene varianza *Hσ²* (el ruido del futuro) **más** *H²σ²/n* (lo que
no sabemos de la media). El plug-in solo ve el primer término. Con *H = n* la varianza real
es el doble, el intervalo debería ser √2 veces más ancho y la probabilidad de caer fuera del
P05–P95 plug-in es P(|Z| > 1,645/√2) = **24,5 %**, no 10 %. La tabla B lo confirma: el
plug-in sin bloques da entre un 22 % y un 29 % con datos independientes.

**Lo que corrige el predictivo en dos etapas y lo que no.** Remuestrear primero un «mundo»
y sacar el futuro de ese mundo incorpora el error de la media (Fushiki, Komaki y Aihara,
2005). Con datos independientes y sin bloques queda calibrado (el p95 del drawdown, algo
conservador: 4,0 % y 3,7 %):

**Tabla B — variantes** (misma notación; *H = n*)

| Variante | Normal indep., n = 63 | Normal indep., n = 252 | AR(1) 0,3, n = 63 | AR(1) 0,3, n = 252 |
|---|---|---|---|---|
| plug-in, bloque 1 | 9,0 / 29,0 | 7,3 / 22,3 | 25,0 / 36,7 | 28,3 / 38,3 |
| plug-in, bloque √n | 19,0 / 36,7 | 12,3 / 27,0 | 22,3 / 31,7 | 14,3 / 27,0 |
| dos etapas, bloque 1 | 4,0 / 11,0 | 3,7 / 9,3 | 16,7 / 22,0 | 17,7 / 18,7 |
| dos etapas, bloque √n | 9,3 / 19,3 | 7,0 / 13,0 | 15,3 / 19,0 | 9,0 / 13,0 |
| dos etapas, bloque 2√n | 15,0 / 26,0 | 9,7 / 16,0 | 20,3 / 24,7 | 11,7 / 15,0 |
| dos etapas, bloque 3 | 5,3 / 13,7 | 4,0 / 9,0 | 14,3 / 16,3 | 9,3 / 13,7 |
| dos etapas, bloque 4 | 6,7 / 13,7 | 4,3 / 10,3 | 13,3 / 16,7 | 8,7 / 13,0 |
| dos etapas, bloque 6 | 7,7 / 14,7 | 4,7 / 10,0 | 15,0 / 17,7 | 7,7 / 13,0 |

Pero con dependencia entre días (el AR(1) de la tabla B) sigue quedándose corto con
cualquiera de los bloques probados: con *n* = 63, el drawdown supera el p95 entre un 13 % y
un 20 % de las veces. Y con bloques demasiado largos empeora también con datos
independientes. Explicación probable, **sin demostrar**: con muestras cortas el bootstrap
por bloques subestima la varianza a largo plazo, y un camino de *n* días hecho con bloques
largos repite trozos enteros del mundo, así que su varianza se encoge. Por eso la elección del bloque no puede ser la regla fija √n de hoy (sección 5.3)
y hará falta una corrección de calibración (sección 5.5) o declarar el límite.

**Qué significa para la app hoy.** El rango P05–P95 del resultado y la caída máxima que
enseña la sección del periodo no visto **son más estrechos de lo que deberían**: en este
estudio, el resultado futuro cae fuera del rango en un 26-38 % de los casos en vez del 10 %,
y el drawdown futuro supera el p95 en un 10-23 % en vez del 5 %. La
probabilidad de pérdida no se ha medido con el rigor necesario (solo su media, y eso no
mide la calibración). Decisión D1 en la sección 13.

**Las otras cifras de las operaciones** (`bench/muestra-exploratorio.js`, resultados en
`bench/results/muestra-exploratorio.txt`):

- El **intervalo del 90 % del resultado diario medio** usa el mismo bootstrap, esta vez como
  intervalo de confianza de la media (que es lo correcto para esa pregunta). Aun así deja
  fuera la media verdadera entre un 12 % y un 22 % de las veces, en vez del 10 %.
- **«¿Se distingue de cero?»** es conservador: sin ventaja real dice que sí en torno a un 1 %
  de las veces con datos independientes, colas gruesas, GARCH o un EA disperso. Con rachas
  (AR(1) 0,3) sube a un 6-7 %, porque la fórmula no tiene en cuenta la dependencia entre días.
  A cambio detecta poco: con una ventaja real de 0,1 desviaciones típicas al día, acierta un
  18-26 % de las veces con un año de datos. Se queda en la app, con ese punto débil anotado.

*Esto es un estudio exploratorio, no el banco prerregistrado:* ha servido para elegir los
candidatos de la sección 5 y se declara en el prerregistro.

---

## 3. Qué pregunta contesta y cuáles no

### Lo que contesta

Sea *x₁ … xₙ* el resultado diario de la configuración (días laborables, con ceros los días
sin cierres). Para un horizonte *H* (63, 126 o 252 días laborables: 3, 6 o 12 meses), la
herramienta estima la **distribución predictiva** de estas magnitudes del camino futuro
*y₁ … y_H*:

| Magnitud | Definición | En pantalla |
|---|---|---|
| Resultado | *Σ yₜ* | Mediana y P05–P95 |
| Drawdown máximo | máx. caída del acumulado desde su máximo previo, empezando en 0 | Mediana y p95 |
| Probabilidad de pérdida | P(*Σ yₜ* < 0) | % |
| Probabilidad de tocar tu límite | P(drawdown máximo ≥ *D*), con *D* el que da el usuario | % |

**Hipótesis explícita:** el futuro se parece a esas operaciones (estacionariedad). Todo lo
que diga la herramienta es condicional a eso, y la pantalla lo dice.

### Lo que no contesta, y dónde se contesta

| Pregunta | Por qué no | Dónde |
|---|---|---|
| ¿Tiene ventaja real el EA? | El Monte Carlo reordena lo que hay; no distingue suerte de ventaja | Muestra y potencia (`core/trades/sample.js`) |
| ¿La configuración es un pico? | El Monte Carlo no mueve parámetros | Mesetas |
| ¿Va a cambiar el mercado? | Ningún remuestreo puede producir lo que no ha pasado | Nadie; se dice |
| ¿Opero? | Principio 3: evidencia, no permiso | — |
| ¿Cuánto perderé como mucho? | Un p95 no es un máximo | Se explica en pantalla |

---

## 4. Datos: qué se lee del informe y qué se pregunta

### 4.1 Lo que ya lee `core/report.js`

- **Por transacción:** fecha y hora, tipo, dirección, volumen, precio, símbolo, comisión,
  swap, beneficio y balance tras la transacción (`core/report.js:243-254`). Empareja cada
  cierre con su apertura por símbolo y sentido para saber el lote cerrado y el precio de
  entrada.
- **Cabecera:** experto, símbolo, periodo con sus fechas y parámetros de entrada.
- **Resumen:** beneficio, factor de beneficio, Sharpe, operaciones, y las reducciones
  relativa y máxima de la **equidad** y relativa del **balance**.

### 4.2 Lo que habría que añadir al lector (sin comprobar con un informe real)

- Depósito inicial (primera fila de la tabla de transacciones, hoy se salta).
- Modelado («Cada tick basado en ticks reales»…) y calidad del historial de la cabecera,
  para avisar si el modelado no es fiable.
- Tipo de cuenta (cobertura o compensación), si el informe lo trae de forma legible.

### 4.3 Lo que el informe no trae y no se rellena con supuestos

- **Resultado flotante y excursión adversa de cada operación.** El drawdown del Monte Carlo
  es de **balance** (operaciones cerradas), y por tanto menor que el de equidad. No se
  escala: se enseña al lado, como contexto, la proporción entre la reducción de equidad y
  la de balance que trae el propio informe (por ejemplo: «en tu backtest, la caída con
  posiciones abiertas fue 1,8 veces la de balance»).
- **Stop loss de cada posición.** Sin él no hay auditoría de estructura de riesgo (ya se
  retiró por eso, `core/trades/risk.js`).

### 4.4 Lo que se pregunta al usuario (solo esto)

| Pregunta | Por qué | Si no responde |
|---|---|---|
| Fechas de corte: fin de la optimización (y del forward) e inicio del tramo no usado | Es lo único que separa lo sesgado de lo limpio; el informe no lo sabe | Todo se etiqueta «usado para elegir» |
| ¿De dónde salen los parámetros? (optimicé yo / los del vendedor / no lo sé) | Los valores de fábrica también se eligieron sobre el histórico | «No lo sé» = sesgado |
| Lote fijo o % del balance (con lo que deducimos, para confirmar) | Cambia la unidad del remuestreo (5.2) | Se usa lo deducido y se dice |
| Drawdown que no aguantarías (opcional) | Para la probabilidad de tocarlo | No se enseña esa fila |

### 4.5 El primer informe real (2026-10-14)

Un backtest del autor: EA TPS 3.0 en NDX M15, Darwinex, terminal en español, guardado como
.xlsx, del 2018-03-01 al 2026-10-14. Los archivos no están en el repositorio. Lo que enseña:

- **El lector funciona con él.** 1.303 operaciones (las del resumen); la suma de sus netos es
  204.413,43, el beneficio neto del informe; comisión (−17.864,98) y swap (−2.253,00)
  cuadran con los totales; las 1.303 se emparejan con su apertura; el valor del contrato sale
  10 por punto y lote con acuerdo total entre 1.240 parejas. Los parámetros del informe
  coinciden con el .set de la configuración elegida en 90 de 92 (los dos distintos son de
  registro: nombre del archivo de log y modo detallado).
- **El dimensionado no es ni fijo ni proporcional:** riesgo fijo en dinero (5.2).
- **El drawdown por días esconde un 6 %** frente al de operación a operación (5.1).
- **Cómo es su serie diaria** (2.247 días laborables): un 52 % de días sin cierres,
  asimetría positiva fuerte (2,4: muchas pérdidas pequeñas y pocas ganancias grandes),
  colas gruesas (curtosis 13-18 según el tramo) y **sin dependencia** entre días
  (autocorrelaciones entre −0,06 y 0,04, y nada en los cuadrados). Se parece a G5 y G6 del
  banco y no a G3 o G4: para un EA así, el caso difícil (rachas) no aparece.
- **El informe no trae el modelado** («cada tick basado en ticks reales»…); sí la calidad
  del historial (97 %), las barras y los ticks.
- **Su periodo no visto es ciego de verdad:** el autor confirma que no miró del 2025-10-14
  al 2026-10-14 antes de elegir la configuración. Es la prueba más limpia que tiene.

---

## 5. Método

### 5.1 Unidad: el día

El remuestreo se hace por **días laborables**, con ceros los días sin cierres, como ya hace
`core/trades/from-deals.js:68-90`. No por operación, porque:

- los horizontes son de calendario («6 meses»): por operación, el número de operaciones en
  6 meses sería fijo y no lo es;
- varias posiciones abiertas a la vez (cobertura, varios símbolos) quedan sumadas en su día;
- los días conservan la frecuencia real de operaciones, también la de un EA que opera poco.

Una operación que dura varios días cuenta entera el día de su cierre. Es otra razón por la
que el drawdown es de balance (4.3).

**El drawdown se mide operación a operación, no día a día.** Se remuestrean días, pero cada
día conserva sus operaciones en su orden, y el drawdown se calcula recorriéndolas. Sumar el
día entero esconde las caídas dentro del día: con el primer informe real (sección 4.5) el
drawdown por días era 15.974 y operación a operación 17.015, un 6 % más, que es lo que da el
propio informe (17.020).

### 5.2 Unidad de medida: dinero o rendimiento

- **Lote fijo, o riesgo fijo en dinero:** el resultado diario en dinero es aditivo.
  Drawdown en dinero y, como referencia, en % del depósito del backtest. Incluye el EA que
  calcula el lote para arriesgar siempre la misma cantidad (un % de un capital fijo): su lote
  cambia con la distancia al stop y con el precio, pero lo que arriesga no cambia con el
  balance.
- **Lote proporcional al balance:** el dinero no es aditivo, porque cada operación depende
  del balance de ese momento. Se trabaja en log-rendimiento diario
  *xₜ = ln(1 + PnLₜ / Bₜ₋₁)*, con *Bₜ₋₁* el balance al cierre del día anterior (el informe
  trae el balance tras cada transacción). El camino es *E_h = B₀·exp(Σ yₜ)* y el drawdown es
  relativo.
- **Lote que crece tras pérdidas (martingala) o rejillas que promedian:** **no se calcula.**
  El riesgo de esos sistemas está en una racha que, si no ha pasado en la muestra, ningún
  remuestreo puede producir. Se dice así, y por qué.

**Cómo se deduce el dimensionado (heurística, se confirma con el usuario):**

| Señal en las operaciones | Lectura |
|---|---|
| Lote constante (salvo redondeo al paso del lote) | Fijo |
| Pérdida de las operaciones cerradas por stop estable **en dinero** a lo largo del tiempo, aunque el lote cambie | Riesgo fijo en dinero (aditivo) |
| Esa pérdida estable **en % del balance** | Proporcional |
| Lote mayor tras una pérdida que tras una ganancia, de forma sistemática | Martingala: no se calcula |
| Otra cosa | Se pregunta, y si el usuario dice «fijo» con lotes que varían, se avisa |

Los umbrales de esa tabla se fijan con informes sintéticos de cada tipo en la fase 1, y se
revisan con informes reales en la fase 2.

La señal buena es lo que se pierde cuando salta el stop, no el lote: el comentario del cierre
dice si fue por stop («sl …»). Con el lote se habría fallado el primer informe real (4.5):
el lote baja de 4,13 a 0,86 a lo largo de los años porque el precio del índice sube, pero la
pérdida mediana en stop es de 994 a 1.005 todos los años mientras el balance se triplica.

### 5.3 Bloques: longitud elegida con los datos

Los días no son independientes (rachas, volatilidad que se agrupa), así que se remuestrea
por bloques con el **bootstrap estacionario** (Politis y Romano, 1994): bloques de longitud
geométrica que empiezan en un día al azar y dan la vuelta al final de la serie. Ya está
implementado y es correcto.

Lo que cambia es la **longitud media del bloque**. Hoy es √n fija, que con datos
independientes añade dependencia inexistente y empeora la cobertura (tabla B). Se elige
con el estimador de Politis y White (2004) **con la corrección de Patton, Politis y White
(2009)**, que existe porque la varianza del bootstrap estacionario de Lahiri (1999) estaba
mal calculada (Nordman, 2009). Con datos independientes debería dar bloques cercanos a 1;
con dependencia, más largos (se comprobará en las pruebas de la sección 11).

### 5.4 Predictivo en dos etapas

Para cada una de las *S* simulaciones (*S* = 10.000, con semilla de `core/rng.js`):

```
1. mundo*  = bootstrap estacionario de x, longitud n, bloque b̂     ← lo que no sabemos del proceso
2. futuro* = bootstrap estacionario de mundo*, longitud H, bloque b̂ ← el ruido del futuro
3. guardar: Σ futuro*, drawdown máximo de futuro*, Σ < 0, drawdown ≥ D
```

Los cuantiles y las proporciones de esas *S* simulaciones son la distribución predictiva.
Es el predictivo bootstrap no paramétrico de Fushiki, Komaki y Aihara (2005): equivale a
aplicar *bagging* al problema de predicción y, según sus autores, predice asintóticamente
tan bien como el predictivo bootstrap paramétrico, que a su vez mejora al plug-in (Harris,
1989). Ellos lo estudian con datos independientes: **la versión por bloques es una
adaptación nuestra** y se llamará así (principio 4).

Alternativa que también entra en el banco: el **bootstrap bayesiano** (Rubin, 1981) por
bloques, que sustituye la etapa 1 por pesos de Dirichlet sobre los bloques. Se queda el que
mejor calibre en la calibración del banco.

**Horizonte:** *H ≤ n*. Proyectar más allá de lo que se ha observado obliga a inventar; el
banco medirá *H = 2n* solo como exploración.

**Error del propio Monte Carlo:** con *S* = 10.000, el error típico de una probabilidad del
5 % es de 0,2 puntos. Se dice en el detalle técnico.

### 5.5 Si el banco muestra que sigue quedándose corto

Con dependencia, el estudio exploratorio dice que es lo esperable. Dos opciones con base
publicada, que se evaluarán en la calibración del banco:

- **Calibración del nivel por doble bootstrap** (Beran, 1987; Loh, 1987): se estima qué
  nivel nominal da de verdad un 95 % y se usa ese. Es caro (del orden de *S × S′*
  simulaciones): solo es viable en el worker y con *S′* pequeño. Hay que medir el tiempo en
  un móvil.
- **Declarar el límite:** si con dependencia fuerte no se alcanza la calibración, la app
  detecta la dependencia (autocorrelación de la serie diaria y de sus cuadrados) y en ese
  caso no da cifras, o da solo las que aprueban.

**Lo que no se hará:** ajustar los cuantiles con un factor sacado del propio banco
sintético. Calibraría la herramienta contra el mundo que hemos inventado, no contra el
mercado.

### 5.6 Candidato secundario: «¿fue suerte el orden?»

Con el resultado total fijo, ¿cómo de afortunado fue el orden real de los días? Se permutan
los días y se mira en qué percentil cae el drawdown real. Es una prueba **exacta** si los
días son intercambiables. No predice nada (el total no cambia) y con dependencia no vale.
Es útil para leer el backtest (por ejemplo: «tu drawdown fue de los suaves: con otro orden,
la mediana sería 1,6 veces mayor»). Entra solo si aporta claridad y supera su propia prueba de
respuesta conocida. Decisión D5.

---

## 6. Periodos y sesgo de selección

### 6.1 Un backtest largo y fechas de corte

El usuario lanza **un** backtest de su configuración sobre todo el histórico (optimizado +
forward + no visto) *después* de haberla elegido. La app:

1. comprueba que los parámetros del informe coinciden con la configuración de la meseta, si
   viene de ahí (ya se hace con el periodo no visto);
2. pide las fechas de corte y comprueba que caen dentro del periodo del informe, con
   operaciones a los dos lados;
3. asigna cada operación por su **fecha de cierre** (una posición abierta antes del corte y
   cerrada después cuenta en el tramo posterior; se dice cuántas hay);
4. calcula por separado cada tramo.

Con lote proporcional, el balance pasa de un tramo al siguiente; trabajar en rendimiento
(5.2) lo hace irrelevante. El indicador que necesita «calentar» al principio del backtest
no afecta a los tramos posteriores.

Lo que hoy se acepta (un informe solo del tramo no visto) sigue valiendo: la app reconoce
por las fechas qué tiene delante.

### 6.2 El tramo que se usó para elegir

Ahí la configuración se eligió *porque* salió bien, y el Monte Carlo hereda ese sesgo: el
resultado sale inflado y el drawdown probablemente encogido (sobre todo si se eligió con un
criterio que mira el drawdown). **Desde el informe no se puede corregir.**

El banco lo medirá (escenario G9, sección 10): se eligen configuraciones por su resultado
entre 1, 10, 100 y 1.000 candidatas, se hace el Monte Carlo sobre las operaciones de la
elegida y se compara con su futuro. Con esa cifra se decide (D2) entre:

- enseñarlo con la etiqueta «sesgado a favor» y la cifra medida («en nuestras pruebas, con
  100 configuraciones probadas, el futuro superó el p95 de drawdown el X % de las veces»), o
- no enseñar ahí ninguna cifra de previsión.

### 6.3 El tramo no usado

Es la única prueba limpia, y suele ser corta. Ahí:

- el Monte Carlo es el que se presenta como principal, **si hay muestra** (sección 10:
  el mínimo lo fija el banco);
- **comprobación predictiva** (candidata): con el Monte Carlo del tramo de elección y un
  horizonte igual a la duración del tramo no usado, ¿en qué percentil cae lo que de verdad
  pasó? Como el tramo de elección está sesgado a favor, la comprobación es exigente en una
  dirección conocida: un percentil bajo es esperable incluso con ventaja real. El banco
  medirá cuánto. Complementa el contraste que ya existe frente a la meseta
  (`core/unseen.js`), no lo sustituye.

### 6.4 Historial de una cuenta real o demo

Sería la prueba más limpia de todas: operaciones que nadie eligió mirando. Es otro informe
de MT5, con otro formato; no se ha comprobado y queda fuera de la primera versión.

---

## 7. Lo que se descarta y por qué

| Método habitual | Por qué no |
|---|---|
| Reordenar operaciones como «Monte Carlo» principal | El resultado total no cambia; solo mide el camino. Y supone independencia (5.6) |
| Remuestrear operaciones sueltas con reemplazo | Ignora el calendario y la dependencia; con datos dependientes es lo peor de la tabla B |
| «Saltarse un X % de operaciones» | No hay una magnitud definida que estime; el X % es arbitrario |
| Ajustar una normal (u otra distribución) y simular | Inventa las colas que el usuario no ha observado |
| Ruido en precios, spread aleatorio, perturbar parámetros | Exige volver a lanzar el EA en MT5. Los costes ya tienen su stress analítico (`core/trades/costs.js`) y la robustez de parámetros es lo que miden las mesetas |
| Monte Carlo sobre la tabla de optimización | Solo trae agregados por pasada, no operaciones (`docs/SPEC.md`) |
| Martingala y rejillas | 5.2: su riesgo está en lo que no ha pasado |

---

## 8. El usuario: flujo, preguntas y rechazos

### 8.1 Dos puertas, un mapa

```
1. Antes de optimizar   → reserva el tramo final (ya existe: paso 1 de la app)
2. Optimiza en MT5      → XML → MESETAS → eliges configuración
3. Con esa configuración → un backtest de todo el histórico → informe → MONTE CARLO
```

- **«Vengo de optimizar»:** el paso 3 ya conoce la configuración y las fechas que se puedan
  deducir. Comprueba que el informe usa esa configuración.
- **«Ya tengo una configuración»:** solo el informe. La app pregunta de dónde salen los
  parámetros (4.4) y, si la respuesta es «optimicé yo», recomienda pasar antes por las
  mesetas: un Monte Carlo sobre un pico mide un pico.

El mapa se enseña en las dos puertas, con el paso en el que está el usuario marcado.

### 8.2 Qué mide cada cosa (texto fijo, en las dos puertas)

- **Mesetas:** ¿la configuración aguanta si mueves los parámetros?
- **Monte Carlo:** con estas mismas operaciones, ¿cómo de mala podría ser una racha?
- **Ninguna de las dos** sabe si el mercado va a cambiar.

### 8.3 «Esto es lo que hemos leído»

Al soltar el archivo, antes de preguntar nada, una tarjeta para confirmar: experto, símbolo,
fechas, depósito, operaciones, días con operaciones, modelado, dimensionado deducido (con
la señal que lo delata) y, si viene de las mesetas, si la configuración coincide. Las
preguntas de 4.4 van debajo, una cada vez.

### 8.4 Rechazos y avisos (con su texto, en trader)

| Situación | Qué dice la app |
|---|---|
| Es un export de optimización | «Esto es la tabla de una optimización. Para el Monte Carlo hace falta el informe de **un** backtest: pestaña Backtest → clic derecho → Informe.» |
| Muestra por debajo del mínimo del banco | «Con N días no hay muestra para un Monte Carlo fiable: las cifras serían ruido. Hacen falta al menos M.» |
| Martingala detectada | «El lote sube después de perder. El riesgo de ese sistema está en una racha que tu backtest no ha tenido, y ningún remuestreo puede inventarla. No damos cifras.» |
| Modelado poco fiable | «El backtest no usa ticks reales: el resultado de cada operación puede no ser el que habría sido.» |
| Fechas de corte fuera del informe | «Esa fecha no está dentro del periodo del backtest (del … al …).» |
| Dependencia que el método no cubre (si 5.5 acaba así) | «Tus resultados diarios van en rachas más largas de lo que el método puede representar con esta muestra.» |
| Parámetros distintos a los de la meseta | Ya existe; se reutiliza |

### 8.5 Cómo se enseñan las cifras

- Lenguaje de trader en la pantalla principal; IS/OOS, bloques y semillas, en el detalle.
- Cada cifra lleva la etiqueta de su tramo («con las operaciones que usaste para elegir»).
- El drawdown dice siempre que es de balance, con la proporción equidad/balance del informe.
- Nada de GO/NO-GO, colores de semáforo ni «apto».
- Todo exportable (JSON/CSV) con método, semilla, bloque, horizonte y tramo.

---

### 8.6 Qué recibe cada usuario

Solo tres cosas cambian la respuesta: si las operaciones se usaron para elegir la configuración
(se pregunta: fechas de corte y origen de los parámetros), cuántos datos limpios hay (se lee) y
cómo se comportan las operaciones (lo detectan las puertas). Que el backtest sea de 10 años o de
2, o que tenga IS y OOS o no, solo importa a través de esas tres cosas.

| Situación | Radiografía | Previsión |
|---|---|---|
| Optimizó todo el histórico, sin tramo reservado | Sí | No: «todo tu histórico se usó para elegir; cualquier previsión saldría optimista» |
| IS + OOS eligiendo con el OOS, sin tramo no visto | Sí | No, por lo mismo |
| EA comprado, con los parámetros del vendedor | Sí | No, salvo con datos posteriores a la compra |
| Tramo no visto de 1 a 2 años | Sí | A 3 meses |
| Tramo no visto de 2 años o más | Sí | A 3, 6 y 12 meses (según el examen) |
| Menos de 1 año limpio o menos de 100 días con operaciones | Sí, con 30 operaciones o más | No: «te faltan datos» y cuántos |
| Rachas o volatilidad agrupada detectadas | Con aviso (reordenar las rompe y subestima) | No, y por qué |
| Martingala o rejilla | No | No |
| Lote proporcional al balance | Sí, en % | Sí, en % |

Lo que la app no puede comprobar y cómo se protege:

- **Las fechas que da el usuario.** Cada cifra dice de qué tramo sale («según nos dijiste, este
  tramo no se usó para elegir»); Orometra ya avisa si un tramo «no visto» coincide con uno usado;
  y el historial de la app puede avisar si se probaron varias configuraciones contra el mismo
  tramo, que entonces deja de ser ciego.
- **El cambio de mercado** y **las pérdidas que nunca salieron:** aviso fijo junto a las cifras,
  con lo medido en el banco (G8: las puertas rechazan un 30-60 % y en el resto el drawdown supera
  el p95 un 5,6-10 % de las veces; G10: 4,1-7,2 %).

### 8.7 Los gráficos

- **Radiografía:** las curvas de balance de unas 100 permutaciones, finas y en gris, con las
  bandas del 5-95 % y del 25-75 %, y **la curva real resaltada encima**. Todas acaban en el mismo
  punto. Debajo, en una frase: «tu caída máxima fue de X; con otro orden, en el Y % de los casos
  habría sido mayor» y la racha de pérdidas normal frente a la real. Etiqueta fija: «Esto analiza
  tu backtest; no es una previsión».
- **Previsión:** el abanico hacia delante desde hoy, con las bandas del 5-95 % y del 25-75 %,
  unas pocas curvas de ejemplo y la línea del drawdown que el usuario diga que no aguanta. Al
  lado, en tarjetas: caída máxima probable (p95), probabilidad de perder y probabilidad de tocar
  ese límite. Sello: «cifras comprobadas en cientos de miles de escenarios con verdad conocida».
- Lo que no se puede calcular ocupa el mismo sitio, con el motivo: no desaparece sin más.

Ejemplo real (informe del autor, radiografía por tramos): en el in-sample, con otro orden la
caída habría sido mayor en el 88 % de los casos (orden favorable: lo esperable en un tramo con el
que se eligió); en el forward, solo en el 3 % (orden muy desfavorable); en el no visto, en el 53 %.

## 9. Preguntas frecuentes

**Antes de empezar**

- *¿Necesito pasar por las mesetas?* No. Sin ellas no sabemos si la configuración es un
  pico, y la app lo dice.
- *¿Qué informe subo?* Un backtest de tu configuración sobre todo tu histórico, lanzado
  después de elegirla. Luego nos dices las fechas de corte.
- *¿Por qué después de elegir?* Si lo miras antes, el tramo que reservaste deja de ser una
  prueba a ciegas.
- *¿Sirve cualquier EA?* Sí, salvo martingala y rejillas que promedian (no damos cifras). Con
  varias posiciones abiertas a la vez, el drawdown sale por debajo del real y se avisa.
- *¿Tengo que subir el EA?* No. Solo el informe, y no sale de tu navegador.
- *¿Qué modelado uso?* «Cada tick basado en ticks reales».
- *¿Cuántas operaciones hacen falta?* Las que diga el banco; por debajo, la app dice que no
  hay muestra en vez de dar una cifra.
- *¿Y si no reservé un tramo?* Un tramo anterior al que optimizaste sirve; si no, seguir en
  demo y volver con ese historial; o aceptar solo el resultado sesgado, con su etiqueta.
- *¿Puedo usar el historial de mi cuenta?* Todavía no (6.4).
- *¿Varios EAs juntos?* No, en la primera versión.

**Al leer el resultado**

- *¿El p95 es lo peor que puede pasar?* No. Es «1 de cada 20 futuros simulados fue peor»,
  y solo si el futuro se parece a tus operaciones.
- *El drawdown del Monte Carlo es mayor que el de mi backtest. ¿Es malo?* Es lo normal: tu
  backtest es un solo camino.
- *¿Por qué el resultado con el tramo de elección es mejor que con el no usado?* Porque lo
  elegiste por salir bien. Es lo que queremos que veas.
- *¿Por qué no coincide con otra herramienta?* Por el método (plug-in o predictivo),
  la unidad (operación o día) y el drawdown (balance o equidad). La metodología lo explica.
- *¿Por qué con pocas operaciones el rango es enorme?* Porque con pocas operaciones no se
  sabe casi nada. Un rango estrecho con pocos datos sería mentira (sección 2).
- *¿El drawdown cuenta las posiciones abiertas?* No; se dice al lado de la cifra.
- *Entonces, ¿lo opero?* La app no lo dice. Sí te dice cuántos futuros simulados tocan el
  drawdown que dijiste que no aguantas.

---

## 10. Borrador de prerregistro del banco

**Congelado el 2026-10-13 en `bench/PREREGISTRO-MONTECARLO.md`, que concreta los procesos,
las semillas y los métodos. Si este borrador y el prerregistro difieren, manda el
prerregistro.** Mismas reglas que `bench/PREREGISTRO.md`:
criterios cerrados, enmiendas fechadas, calibración y examen con semillas distintas, examen
una sola vez.

**Declaración previa.** Antes de escribir este prerregistro se ejecutó el estudio
exploratorio de la sección 2 (`bench/montecarlo-exploratorio.js`, semillas propias). Orientó
la elección de candidatos. Las semillas del banco serán otras.

### 10.1 Qué se quiere saber

1. Si los cuantiles y probabilidades que daría la app cubren lo que pasa en un futuro del
   mismo proceso, para cada método candidato, tamaño de muestra y horizonte.
2. Desde qué tamaño de muestra se puede dar cada cifra.
3. Cuánto sesga el resultado haber elegido la configuración entre muchas.
4. Si la detección del dimensionado acierta.

### 10.2 Procesos (verdad conocida)

Todos con media diaria *μ* ∈ {0; 0,05; 0,10} desviaciones típicas (Sharpe anual ≈ 0; 0,8;
1,6).

| Id | Proceso | Grupo |
|---|---|---|
| G1 | Normal independiente | Exigido |
| G2 | t de Student con 3 grados de libertad (colas gruesas) | Exigido |
| G3 | AR(1) con φ = 0,3 y con φ = −0,2 | Exigido |
| G4 | GARCH(1,1) (ω = 0,05; α = 0,10; β = 0,85) | Exigido |
| G5 | EA disperso: 70 % de días sin cierres | Exigido |
| G6 | Seguidor de tendencia: 35 % de días ganadores (lognormal), 65 % pérdidas pequeñas | Exigido |
| G7 | Lote proporcional: G1 en log-rendimiento, con balance compuesto | Exigido |
| G8 | Cambio de régimen (Markov de dos estados en media y volatilidad) | Se informa, no se exige |
| G9 | Selección: la mejor de K ∈ {1, 10, 100, 1.000} configuraciones por resultado | Se informa; alimenta D2 |

G8 no se exige porque viola la hipótesis declarada (3): ningún remuestreo puede anticipar un
cambio de régimen. Se publica su cifra para que el usuario sepa cuánto empeora.

### 10.3 Tamaños, horizontes y métodos

- *n* ∈ {63, 126, 252, 504, 1.008} días; *H* ∈ {63, 126, 252} con *H ≤ n*; exploratorio
  *H = 2n*.
- 1.000 casos por celda (error típico de una tasa del 5 %: 0,7 puntos) y 2.000 simulaciones
  por caso.
- Métodos: M0 la app actual (referencia); M1 dos etapas con bloque PPW; M2 bootstrap
  bayesiano por bloques con bloque PPW; M1c y M2c con calibración por doble bootstrap
  (si el tiempo de cálculo lo permite).

### 10.4 Métricas

- **Drawdown:** fracción de casos con drawdown futuro > p95 (ideal 5 %) y > p50 (ideal 50 %).
- **Resultado:** fracción fuera de P05–P95 (ideal 10 %).
- **Probabilidades:** fiabilidad de P(pérdida) y de P(drawdown ≥ *D*) con
  *D* = k·σ·√H, k ∈ {1, 2, 3}: se agrupan los casos por probabilidad predicha (tramos de
  0,1) y se compara con la frecuencia observada; además, puntuación de Brier frente a M0.
- **Detección del dimensionado:** aciertos sobre listas de operaciones sintéticas de lote
  fijo, proporcional y martingala.

### 10.5 Criterios de aprobado (para cerrar antes de ejecutar)

Un método es **apto** para un horizonte *H* desde un tamaño *n_min* si, en **todos** los
procesos exigidos, para todo *n ≥ n_min* de la rejilla:

| Prueba | Aprobado si |
|---|---|
| Drawdown > p95 | entre 2,5 % y 7 % |
| Drawdown > p50 | entre 44 % y 56 % |
| Resultado fuera de P05–P95 | entre 6 % y 13 % |
| Fiabilidad de cada probabilidad | en cada tramo con ≥ 200 casos, \|predicha − observada\| ≤ 5 puntos |
| Brier | no peor que M0 |

Las bandas son asimétricas a propósito: quedarse corto (prometer menos riesgo del real) es
más dañino que pasarse.

**Criterio de descarte:** si ningún método es apto para *H* = 126 con *n_min* ≤ 252 (seis
meses de previsión con un año de datos), **la herramienta no se construye** y se corrigen o
retiran las cifras actuales (D1). Si es apto pero solo con *n_min* > 252, se publica con ese
mínimo y se dice.

### 10.6 Qué se hace si algo falla

- Un proceso exigido falla con todos los métodos: se busca la causa en la calibración; si
  es un límite del método (dependencia fuerte), la app detecta ese caso y no da cifras (5.5).
- La detección del dimensionado falla: se pregunta siempre al usuario y la deducción solo
  sirve para avisar de incoherencias.

---

## 11. Pruebas de respuesta conocida

Para `tests/montecarlo.test.js`, antes de cualquier interfaz:

| Prueba | Respuesta conocida |
|---|---|
| Drawdown esperado de un paseo aleatorio sin deriva | *E[DD] ≈ √(π/2)·σ·√n* para el movimiento browniano (Magdon-Ismail et al., 2004), menos un sesgo de discretización. Comprobado por simulación: 1,2355·σ√n con n = 4.000, frente a 1,2533 − 2·0,5826/√n = 1,2349 (el 0,5826 es la corrección de discretización del máximo, Broadie, Glasserman y Kou, 1997; aplicarla dos veces al drawdown es una aproximación nuestra, que la simulación respalda) |
| Dos etapas, sin bloques, datos normales independientes | Resultado fuera de P05–P95 ≈ 10 % (tabla B: 11,0 % y 9,3 %) |
| Plug-in con datos normales independientes, H = n | ≈ 24,5 % fuera de P05–P95 (sección 2) |
| Longitud de bloque PPW en AR(1) | La fórmula cerrada del bloque óptimo para un AR(1) con φ conocido |
| Lote proporcional con rendimiento constante | Todos los caminos iguales: varianza 0 |
| Permutación | El total no cambia nunca |
| Determinismo | Misma semilla, mismo resultado, bit a bit |
| Días sin cierres | Ya cubierto (`tests/trades-from-deals.test.js`) |
| Dimensionado | Fijo, proporcional y martingala sintéticos se clasifican bien |

---

## 12. Fases y puertas

| Fase | Qué | Puerta para pasar a la siguiente |
|---|---|---|
| 0 | Visto bueno a este diseño; congelar el prerregistro | El autor lo aprueba |
| 1 | `core/` sin interfaz: bloque PPW, dos etapas, bayesiano, rendimiento compuesto, detección del dimensionado; pruebas de la sección 11; banco completo | Examen del banco: algún método apto según 10.5. **Si no, se para aquí** |
| 2 | Informes reales: lector (depósito, modelado, cuenta), cobertura, terminal en español, lote fijo y compuesto | El lector lee bien todos los informes reales conseguidos |
| 3 | Interfaz, textos ES/EN, guía «Monte Carlo en MT5, paso a paso», metodología, e2e | Capturas antes y después (móvil y escritorio, claro y oscuro) y visto bueno |
| 4 | Publicación y entrada en `docs/CHANGELOG.md` | — |

La decisión D1 (qué hacer ya con lo que enseña la app) no espera a ninguna fase.

---

## 13. Decisiones que tiene que tomar el autor

- **D1. El Monte Carlo que la app enseña hoy. Decidido (2026-10-13): se retira.** Sus
  rangos son más estrechos de lo que deberían (sección 2). Se quitan de la sección del
  periodo no visto el rango P05–P95, la caída máxima y la probabilidad de pérdida, y también
  el intervalo del resultado diario medio, que se mide después y tampoco cubre lo que dice.
  En su lugar, una línea que dice por qué. Se quedan «¿se distingue de cero?», los días de
  datos y los costes.
- **D2. Cifras sobre el tramo que se usó para elegir.** Decidido: ninguna previsión (G9: con
  100 o más configuraciones, el drawdown supera su p95 un 12-32 % de las veces).
- **D3. Nombre y entrada.** Propuesta: «Monte Carlo» como sección de la app y una página
  `/montecarlo/` (`/es/montecarlo/`) que explique el mapa y lleve a la app.
- **D4. Umbral de descarte.** *H* = 126 con *n_min* ≤ 252 (10.5). Aceptado por el autor de
  forma provisional (2026-10-13); si cambia, será antes de ejecutar el examen y como enmienda
  fechada.
- **D5. La permutación «¿fue suerte el orden?».** Decidido (2026-10-15): entra como la
  radiografía, con su propia prueba (enmienda 6 c).

---

## 14. Comprobado y no comprobado

**Comprobado**

- Lo que calculaba y enseñaba la app hasta la retirada (D1): `core/trades/bootstrap.js`,
  `core/trades/from-deals.js` y `js/ui-unseen.js`.
- La cobertura del intervalo del resultado diario medio (12-22 % fuera en vez de 10 %) y el
  comportamiento de «¿se distingue de cero?» (sección 2).
- La falta de cobertura del método actual frente a un futuro del mismo proceso, con cinco
  procesos y cuatro tamaños (tabla A), y su explicación teórica (24,5 % frente a 22-29 %
  observado).
- Que el predictivo en dos etapas sin bloques queda calibrado con datos independientes, y
  que con dependencia sigue quedándose corto aunque el bloque sea razonable (tabla B).
- La constante del drawdown esperado del paseo aleatorio, por simulación (sección 11).
- Las referencias de Fushiki et al. (2005), Patton, Politis y White (2009) y Magdon-Ismail
  et al. (2004): título, revista y año.

**No comprobado**

- El lector con una cuenta de cobertura y varias posiciones abiertas a la vez, y con el
  informe en HTML (el primer informe real es un .xlsx de terminal en español y se lee bien,
  sección 4.5).
- Que el informe traiga de forma legible el tipo de cuenta (el modelado no aparece en el
  primer informe real; la calidad del historial sí).
- Que el estimador PPW y la calibración por doble bootstrap basten con dependencia: lo dirá
  el banco.
- Que la calibración por doble bootstrap quepa en tiempo en un móvil.
- La fiabilidad de la probabilidad de pérdida actual (solo se ha mirado su media).
- El estudio exploratorio usa una sola media diaria (0,05) y horizonte igual a la muestra;
  con otras medias y horizontes más cortos las cifras cambiarán (con *H* < *n* el término que
  falta al plug-in pesa menos: la varianza real es *Hσ²(1 + H/n)*).
- Las causas que se dan para la falta de cobertura con dependencia (sección 2).
- Los umbrales de la detección del dimensionado.
- Las referencias de Beran (1987), Harris (1989), Lahiri (1999), Loh (1987), Rubin (1981),
  Nordman (2009) y Broadie et al. (1997) se citan de memoria: hay que confirmar la referencia exacta antes de citarlas en la
  app.

---

## 15. Referencias

- Beran, R. (1987). Prepivoting to reduce level error of confidence sets. *Biometrika*, 74(3).
- Broadie, M., Glasserman, P. y Kou, S. (1997). A continuity correction for discrete barrier
  options. *Mathematical Finance*, 7(4).
- Fushiki, T., Komaki, F. y Aihara, K. (2005). Nonparametric bootstrap prediction.
  *Bernoulli*, 11(2), 293-307.
- Harris, I. R. (1989). Predictive fit for natural exponential families. *Biometrika*,
  76(4).
- Lahiri, S. N. (1999). Theoretical comparisons of block bootstrap methods. *Annals of
  Statistics*, 27(1).
- Loh, W.-Y. (1987). Calibrating confidence coefficients. *Journal of the American
  Statistical Association*, 82(397).
- Magdon-Ismail, M., Atiya, A. F., Pratap, A. y Abu-Mostafa, Y. S. (2004). On the maximum
  drawdown of a Brownian motion. *Journal of Applied Probability*, 41(1), 147-161.
- Nordman, D. J. (2009). A note on the stationary bootstrap's variance. *Annals of
  Statistics*, 37(1).
- Patton, A., Politis, D. N. y White, H. (2009). Correction to «Automatic block-length
  selection for the dependent bootstrap». *Econometric Reviews*, 28(4), 372-375.
- Politis, D. N. y Romano, J. P. (1994). The stationary bootstrap. *Journal of the American
  Statistical Association*, 89(428).
- Politis, D. N. y White, H. (2004). Automatic block-length selection for the dependent
  bootstrap. *Econometric Reviews*, 23(1), 53-70.
- Rubin, D. B. (1981). The Bayesian bootstrap. *Annals of Statistics*, 9(1).
