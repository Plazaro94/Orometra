# Banco del Monte Carlo: prerregistro

Fecha: 2026-10-13. Este documento se escribe **antes** de implementar los métodos y de ejecutar
el banco. Los procesos, las métricas y los criterios de aprobado no se cambian después de ver
resultados. Si hubiera que cambiar algo, se añade como enmienda fechada al final, con el
motivo, y los resultados anteriores se conservan. Mismas reglas que `bench/PREREGISTRO.md`.

Diseño completo y motivación: `docs/MONTECARLO.md`.

**Punto de retorno.** `claude/sharp-wright-0omfha` en `9e9d46e` (el Monte Carlo ya no se
enseña en la app). Los métodos nuevos irán en `core/trades/` en cambios aparte y reversibles.

**Declaración previa.** Antes de escribir este prerregistro se ejecutaron dos estudios
exploratorios con semillas propias: `bench/montecarlo-exploratorio.js` y
`bench/muestra-exploratorio.js` (resultados en `bench/results/`). Orientaron la elección de
los candidatos M1 y M2. Las semillas de este banco son otras y no se han generado.

## 1. Qué se quiere saber

1. Si los cuantiles y probabilidades que daría la app cubren lo que pasa en un periodo futuro
   del mismo proceso, para cada método, tamaño de muestra y horizonte.
2. Desde qué tamaño de muestra se puede dar cada cifra.
3. Cuánto sesga haber elegido la configuración entre muchas (se informa, no se exige).
4. Cuánto empeora con un cambio de régimen (se informa, no se exige).

## 2. Cómo se genera cada caso (verdad conocida)

Cada caso son *n* días de resultado diario (lo que tendría el usuario) y, aparte, *H* días
del **mismo proceso** que continúan la misma realización (el futuro, que solo conoce el
banco). En los procesos con memoria (G3, G4, G8) el futuro arranca del estado en que acaba la
muestra. Media diaria *μ* ∈ {0; 0,05; 0,10} desviaciones típicas.

| Id | Proceso | Definición | Grupo |
|---|---|---|---|
| G1 | Normal independiente | *μ* + N(0, 1) | Exigido |
| G2 | Colas gruesas | *μ* + t₃ / √3 | Exigido |
| G3a | Rachas | AR(1), φ = 0,3, innovaciones normales escaladas a varianza 1 | Exigido |
| G3b | Reversión | AR(1), φ = −0,2, ídem | Exigido |
| G4 | Volatilidad agrupada | GARCH(1,1): ω = 0,05, α = 0,10, β = 0,85, innovaciones normales, 300 días de arranque | Exigido |
| G5 | EA disperso | 70 % de días a 0; el resto *μ*/0,3 + t₄/√2/√0,3 | Exigido |
| G6 | Seguidor de tendencia | con prob. 0,35 una ganancia 3·LogNormal(0; 0,75²), si no una pérdida −U(0,5; 1,5); se tipifica con su media y desviación teóricas y se le suma *μ* | Exigido |
| G7 | Lote proporcional | Lista de operaciones con lote = balance × constante y rendimiento diario G1 × 0,5 %; pasa por todo el camino (operaciones → serie diaria → log-rendimiento → Monte Carlo); métricas en % del balance | Exigido |
| G8 | Cambio de régimen | Markov de dos estados, permanencia 0,99 en cada uno: A = *μ* + N(0, 1), B = −*μ* + 1,5·N(0, 1) | Se informa |
| G9 | Selección | K ∈ {1, 10, 100, 1.000} configuraciones G1 con media verdadera ~ N(0; 0,05²); se elige la de mayor media en la muestra; Monte Carlo sobre la elegida; su futuro con su media verdadera | Se informa |

G8 no se exige porque contradice la hipótesis declarada (el futuro se parece a la muestra).
G9 alimenta la decisión D2 de `docs/MONTECARLO.md`.

## 3. Tamaños, horizontes y casos

- *n* ∈ {63, 126, 252, 504, 1.008} días; *H* ∈ {63, 126, 252} con *H ≤ n* (12 pares).
- 1.000 casos por celda (error típico de una tasa del 5 %: 0,7 puntos) y *S* = 2.000
  simulaciones por caso.
- G9 solo con *n* ∈ {252, 504} y *H* = 126.
- Semilla de cada caso: `hashSeed("G|μ|n|H|caso")` (FNV-1a, como `bench/sim.js`).
  **Calibración:** casos 1-1.000. **Examen:** casos 1.000.001-1.001.000, que no se generan
  hasta el examen.

## 4. Métodos

| Id | Método |
|---|---|
| M0 | El que había en la app: `stationaryBootstrap` de `core/trades/bootstrap.js` en `dbcc488` (plug-in, bloque medio round(√n), mínimo 2). Referencia |
| M1 | Predictivo en dos etapas (`docs/MONTECARLO.md` 5.4): mundo = bootstrap estacionario de la muestra (longitud *n*); futuro = bootstrap estacionario del mundo (longitud *H*); bloque medio b̂ de Politis y White (2004) con la corrección de Patton, Politis y White (2009), mínimo 1 |
| M2 | Como M1, pero la etapa 1 elige los inicios de bloque con pesos de Dirichlet(1, …, 1) sobre los *n* días (bootstrap bayesiano por bloques) |
| M1c | M1 con el nivel calibrado por doble bootstrap (Beran, 1987), con *S′* = 200 réplicas internas |

M1c es caro: en calibración solo se mide en G1, G3a y G4 con *n* = 252 y *H* = 126. Pasa al
examen solo si en esa medición mejora a M1 en las métricas del §5 y su tiempo en un móvil de
gama media (medido en la fase 3) es razonable; si no, se declara y no se usa.

**Qué se puede ajustar en la calibración:** detalles de implementación de b̂ que el artículo
deja abiertos, elegir entre M1 y M2, y decidir sobre M1c. **Qué no:** las métricas, los
criterios ni los procesos. Tampoco se permite corregir los cuantiles con un factor sacado del
banco.

## 5. Métricas

Para cada celda (proceso, *μ*, *n*, *H*) y método:

- **Drawdown:** fracción de casos con drawdown máximo futuro > p95 del método (ideal 5 %) y
  > p50 (ideal 50 %). Drawdown en dinero, desde 0; en G7, en % del balance.
- **Resultado:** fracción con resultado futuro fuera del P05–P95 (ideal 10 %).
- **Probabilidades:** fiabilidad de P(resultado < 0) y de P(drawdown ≥ *D*) con
  *D* = k·σ·√H, k ∈ {1, 2, 3}, σ la desviación típica verdadera: los casos se agrupan por
  probabilidad predicha en tramos de 0,1 y se compara la media predicha con la frecuencia
  observada. Además, puntuación de Brier frente a M0.
- **Tiempo:** milisegundos por caso con *S* = 10.000 en Node (orientativo).

## 6. Criterios de aprobado (cerrados)

Un método es **apto** para un horizonte *H* desde un tamaño *n_min* si, en **todos** los
procesos exigidos (G1-G7) y para las tres *μ*, en todo *n ≥ n_min* de la rejilla con *H ≤ n*:

| Prueba | Aprobado si |
|---|---|
| Drawdown > p95 | entre 2,5 % y 7 % |
| Drawdown > p50 | entre 44 % y 56 % |
| Resultado fuera de P05–P95 | entre 6 % y 13 % |
| Fiabilidad de cada probabilidad | en cada tramo con ≥ 200 casos, \|predicha − observada\| ≤ 5 puntos |
| Brier | no peor que M0 |

Las bandas son asimétricas a propósito: quedarse corto (prometer menos riesgo del real) es más
dañino que pasarse.

**Criterio de descarte.** Si ningún método es apto para *H* = 126 con *n_min* ≤ 252 (seis
meses de previsión con un año de datos), **la herramienta no se construye**. El autor aceptó
este umbral de forma provisional el 2026-10-13; si lo cambia, será como enmienda fechada y
antes de generar ningún caso del examen.

Si un método es apto, la app solo enseña cada cifra para los horizontes y tamaños en que lo
es; por debajo de *n_min* dice que no hay muestra.

## 7. Calibración y examen

- **Calibración:** casos 1-1.000. Se puede mirar todo el detalle y ajustar lo que permite el §4.
- **Examen:** casos 1.000.001-1.001.000, con los métodos congelados, una sola vez, y se publica
  tal como salga (`bench/results/MC-exam1.md`). Si después se cambia algo, el examen
  siguiente usa casos nuevos (2.000.001-2.001.000, y así sucesivamente), nunca los ya vistos.

## 8. Qué se hace si algo falla

- **Falla un proceso exigido con todos los métodos:** se estudia en la calibración. Si es un
  límite del método (por ejemplo, dependencia fuerte con muestras cortas), la app detecta ese
  caso en los datos del usuario y no da cifras; la detección se valida aparte y se añade como
  enmienda antes del examen.
- **Se queda corto solo en tamaños pequeños:** se sube *n_min* y se dice.
- **No hay método apto (criterio de descarte):** se declara en `docs/CHANGELOG.md` y en la
  metodología, y el Monte Carlo no vuelve a la app.

## 9. Límites conocidos de este banco

- Es sintético: comprueba los métodos contra los procesos de este documento, no contra el
  mercado. Los informes reales de MT5 que aporte el autor servirán para el lector y como
  comprobación de cordura (un EA da pocas ventanas independientes: orienta, no demuestra).
- El drawdown es de balance (operaciones cerradas); el de equidad no se puede reconstruir
  desde el informe.

## Enmiendas
- **Enmienda 1 — 2026-10-14, antes de generar ningún caso.** Aclaraciones de implementación;
  los procesos, las métricas y los criterios no cambian.
  (a) **M0 a un horizonte H:** el método retirado daba sus cifras a un horizonte h < n con los
  h primeros días de cada camino de n días; en el banco se simulan caminos de H días con el
  mismo algoritmo (bloque medio max(2, round(√n)), inicio al azar, longitud geométrica, vuelta
  circular), que tienen la misma distribución. Con H = n es exactamente el de la app.
  (b) **M2:** los inicios de bloque con pesos Dirichlet(1, …, 1) se sortean con la urna de
  Pólya (Blackwell y MacQueen, 1973), que da exactamente la misma distribución sin calcular
  los n pesos (comprobado: mismos cuantiles con 200.000 simulaciones, dentro del ruido).
  (c) **G7:** M1 y M2 trabajan en log-rendimiento y se juzgan en % del balance; M0 trabajaba
  en dinero y se le juzga en dinero, sin la fiabilidad de P(drawdown ≥ nivel) (los niveles
  k·σ·√H no tienen una σ fija en dinero cuando el lote crece con el balance).
  (d) **Drawdown operación a operación** (`docs/MONTECARLO.md` 5.1): en los procesos
  sintéticos hay un incremento por día y no cambia nada; en G7 hay una operación por día.
  (e) **Contexto del primer informe real** (`docs/MONTECARLO.md` 4.5): su serie diaria se
  parece a G5 y G6 (días sin cierres, asimetría positiva, colas gruesas, sin dependencia).
  Si el autor permite usarla, se añadirá por enmienda, antes del examen, un proceso exigido
  más: G10, remuestreo independiente de esa serie como verdad conocida.
  Implementación: `core/trades/montecarlo.js` y `bench/montecarlo.js` en el commit de esta
  enmienda; la calibración se ejecuta después.
- **Enmienda 2 — 2026-10-14, tras la primera calibración (`REPORT-MC-calib1.md`) y antes de
  cualquier examen. Aprobada por el autor.** Con los criterios originales, ni M1 ni M2 son
  aptos para ningún horizonte y no se cumple el criterio de descarte; ese resultado se
  conserva tal cual. Cambios, con su motivo:
  (a) **Dos criterios del §6 estaban mal planteados y se sustituyen.** La fiabilidad por
  tramos y la puntuación de Brier frente a M0 se medían dentro de cada celda, donde la media
  verdadera es fija: la probabilidad real de pérdida es la misma en todos los casos y la
  frecuencia observada no depende de lo que diga el método (en G1 con μ = 0 está entre un
  42 % y un 64 % en todos los tramos, casi siempre entre un 47 % y un 56 %). Solo podría cumplirlo quien conociera
  la media verdadera; y Brier, dentro de una celda, premia acertar la dirección por azar. Se
  sustituyen por la **calibración probabilística** (Gneiting, Balabdaoui y Raftery, 2007):
  el PIT, u = F̂(y), del resultado y del drawdown futuros bajo la distribución predictiva de
  cada método debe ser uniforme. Con empates (átomos), PIT aleatorizado:
  u = F̂(y⁻) + V·(F̂(y) − F̂(y⁻)), V uniforme. **Criterio:** en cada celda, la fracción de
  casos en cada décimo del PIT, para el resultado y para el drawdown, entre un 7 % y un
  13 %. Las filas de cobertura del §6 (p95, p50, P05–P95) se mantienen. La fiabilidad y
  Brier se siguen calculando y se informan, sin exigirse.
  (b) **Detector de rachas** (§8). Si el contraste de Ljung y Box (1978) sobre los
  resultados diarios, con 10 retardos, da p < 0,05, la app no da cifras y dice por qué. En el
  banco, los criterios se evalúan sobre los casos que el detector deja pasar, y se exige
  además que el detector no rechace más de un 15 % de los casos en los procesos sin
  dependencia en el nivel (G1, G2, G4, G5, G6 y G7). Se informa la tasa de rechazo de cada
  celda. G3a y G3b siguen siendo exigidos.
  (c) **Horizonte como mucho la mitad de la muestra:** H ≤ n/2. Pedir prever un periodo tan
  largo como todos los datos dejaba a M2 demasiado prudente (resultado fuera de su P05–P95
  en un 5,0-5,8 % de los casos). Las celdas evaluadas pasan a ser los 9 pares con H ≤ n/2
  (desaparece n = 63). El criterio de descarte no cambia (H = 126 con n_min ≤ 252).
  (d) **M2c:** M2 con el nivel calibrado por doble bootstrap (Beran, 1987), en lugar de M1c,
  porque M2 fue el mejor en la calibración. Para unos datos x: B = 200 réplicas externas;
  en cada una, unos datos x* de n días y un futuro y* de H días sacados de x por bootstrap
  estacionario (x hace de verdad), M2 con S′ = 500 simulaciones sobre x* y el PIT de y*.
  La distribución de esos PIT (G) corrige los niveles: el cuantil q pasa a ser
  F̂⁻¹(G⁻¹(q)) y una probabilidad F̂(c) pasa a G(F̂(c)); por separado para el resultado y
  para el drawdown. Como fija el §4, se mide primero en un subconjunto de la calibración
  (G1, G3a, G4 y G5; pares (126, 63) y (252, 126); tres μ) y pasa a la calibración
  completa y al examen solo si mejora a M2 y su tiempo es razonable.
  **Calibración 2:** casos 1-1.000 otra vez, con todo lo anterior. Examen: casos
  1.000.001-1.001.000, que siguen sin generarse.
- **Enmienda 3 — 2026-10-14, antes de la calibración 2.** Detalle de interpretación de la
  enmienda 2 (b), fijado al programarla y antes de generar ningún caso: si en una celda el
  detector deja pasar menos de 100 casos, sus fracciones no se evalúan (el error típico pasa
  de 2 puntos) y la celda no suspende por ellas; se informa. Pasa, sobre todo, en G3a con
  muestras largas, donde el detector rechaza casi todo: ahí la app no daría cifras. El
  criterio de rechazo (≤ 15 % en G1, G2, G4, G5, G6 y G7) sí se evalúa siempre.
  Orden de las tandas: calibración 2 completa con M0, M1 y M2; después M2c en su subconjunto.
  Implementación: `bench/montecarlo.js` y `core/trades/montecarlo.js` en el commit de esta
  enmienda.
- **Enmienda 4 — 2026-10-14, tras la primera tanda de la calibración 2 y antes de la
  calibración 3. Aprobada por el autor.** La calibración 2 dejó a la vista dos fallos más de
  diseño, comprobados con métodos simulados de calibración conocida (oráculo): con las reglas
  de la enmienda 2, un método **perfecto** suspendía siempre por azar (el PIT por décimos,
  miles de comprobaciones a 1.000 casos), y con las bandas de cobertura originales, casi la
  mitad de las veces. Y el detector de Ljung y Box rechazaba hasta un 19 % de series sin
  autocorrelación cuando la volatilidad va por rachas (G4). La primera tanda de la calibración
  2 se conserva (`REPORT-MC-calib2a.md`); la segunda se interrumpió a las 56 de 116 celdas,
  porque con estos cambios ya no servía para decidir, y lo calculado se conserva
  (`MC-calib2b.jsonl`). Cambios:
  (a) **Reglas.** Cada método se juzga con dos clases de pruebas: por celda (cobertura del
  p95, del p50 y del P05–P95, con sus bandas de siempre, y el PIT del resultado y del
  drawdown, con cada décimo entre un 7 % y un 13 %) y por grupo (lo mismo sumando las celdas
  de un proceso y un horizonte con n ≥ n0; bandas: p95 entre 4 % y 6,5 %, p50 entre 46 % y
  54 %, P05–P95 entre 8,5 % y 11,5 %, cada décimo del PIT entre 8,5 % y 11,5 %). Una prueba
  suspende solo si se sale de su banda **y** es significativa con Holm-Bonferroni al 5 %
  sobre todas las pruebas del método (binomial exacta bilateral para las coberturas;
  chi-cuadrado con 9 grados de libertad para el PIT). n_min(H) es el menor n0 sin ninguna
  prueba suspendida en las celdas con n ≥ n0 ni en los grupos con ese n0. **Comprobado antes
  de medir**, con el mismo código (`node bench/montecarlo.js oracle`, 200 bancos simulados):
  con 1.000 casos por celda un método perfecto no es apto en el 2,5 % de los bancos (con 500,
  en el 4,0 %); uno que se queda corto con P(DD > p95) = 5,7 %, 6,4 %, o demasiado prudente
  (3,4 %), no es apto en el 100 %.
  (b) **Detector de rachas robusto:** el contraste de Dalla, Giraitis y Phillips (2020,
  *Econometric Theory*), con 10 retardos y p < 0,05, en lugar del de Ljung y Box. Medido
  antes de la calibración 3 (2.000 series por fila): rechaza un 4,7-5,5 % en G4 (el clásico,
  un 11-19 %), un 2-5,6 % en G1, G2 y G5 y un 6,5-9,4 % en G6; en G3a con un año, un 91 %. El
  límite del 15 % de rechazo se aplica a G1, G2, G4, G5, G5b, G6, G6b, G7, G11 y G12.
  (c) **Mínimo de días con operaciones (k):** segunda puerta. Se evalúan k ∈ {0, 20, 30, 40,
  60, 80, 100, 150}; en la calibración 3 se elige para cada método el menor k que da el mejor
  n_min con H = 126, y queda fijo para el examen. Esta puerta no cuenta para el límite del
  15 %, que es solo del detector de rachas.
  (d) **Procesos nuevos.** Exigidos: **G5b**, EA de muy baja frecuencia (90 % de días sin
  cierres; el resto μ/0,1 + t₄/√2/√0,1); **G6b**, muchas ganancias pequeñas y pérdidas grandes
  y raras (G6 cambiado de signo); **G11**, scalper (Poisson(8) operaciones al día, cada una
  μ/8 + N(0, 1/8); el drawdown se mide operación a operación); **G12**, los días reales del EA
  del autor (2.247 días, `bench/data/ea-real-diario.json`, divididos por su desviación típica,
  sin fechas y barajados, cedidos por el autor), remuestreados de forma independiente con su
  media real y con media 0 (restando a cada operación lo justo). Se informa: **G10**, pérdidas
  extremas que pueden no estar en la muestra (G1 más, con probabilidad 0,2 % al día, una
  pérdida de 12 desviaciones típicas). Con esto hay 12 procesos exigidos.
  (e) Fiabilidad y Brier se siguen calculando y se guardan; no se exigen.
  **Calibración 3:** casos 1-1.000 con M0, M1 y M2; después M2c en el subconjunto de la
  enmienda 2 más G3b, G5b, G6b, G11 y G12. Examen: casos 1.000.001-1.001.000, sin generar.
- **Enmienda 5 — 2026-10-14, tras la calibración 3 y antes de la calibración 4. Aprobada por
  el autor.** La calibración 3 (`REPORT-MC-calib3-exigidos.md`, M2c en `MC-calib3-m2c-*.jsonl`)
  se conserva tal cual. Hallazgos que motivan los cambios:
  (a) **M2, tal como se definió en el §4, cuenta dos veces la incertidumbre:** sortea pesos de
  Dirichlet y además un mundo de n días con ellos. Con datos normales, n = 252 y H = 126, deja
  fuera del P05–P95 un 5,9 % de los futuros (la teoría para ese error da un 5,7 %), frente a un
  9,8 % de M1 y un 9,4 % del bootstrap bayesiano bien hecho. Lo que parecía ventaja de M2 en
  colas gruesas era ese exceso de anchura. Se sustituye por **M2b**: los pesos de Dirichlet y el
  futuro sacado directamente de la muestra con ellos (Rubin, 1981, por bloques; urna de Pólya),
  sin mundo intermedio. M2 y M2c dejan de ser candidatos; M0 y M1 siguen de referencia.
  (b) **M2bc:** M2b con el nivel calibrado por doble bootstrap (como M2c: B = 200, S′ = 500).
  Por su coste (0,5-1 s por caso), en las calibraciones y el examen se evalúa con los **500
  primeros casos** de cada celda; las reglas con 500 casos están comprobadas en el oráculo (un
  método perfecto no es apto en el 2-4 % de los bancos).
  (c) **Tercera puerta, detector de volatilidad agrupada:** Ljung-Box sobre los cuadrados de las
  desviaciones (McLeod y Li, 1983), 10 retardos, p < 0,05. M2c fallaba solo en G4 (drawdown sobre
  el p95 un 6,7 % en conjunto, un 7,9 % en el peor caso) y alargar los bloques con la
  autocorrelación de |x| no lo arreglaba (bloque mediano 2,3; DD > p95 7,0 %). Medido antes de
  la calibración 4 (1.000 series por fila): detecta G4 en un 67 % con 252 días y en un 99,9 % con
  1.008; en el resto de procesos, incluido G12, rechaza un 4-9 %.
  (d) **Límite de rechazo:** los dos detectores juntos no deben rechazar más de un **20 %** de los
  casos en los procesos sin rachas ni volatilidad agrupada (G1, G2, G5, G5b, G6, G6b, G7, G11 y
  G12). Sustituye al límite del 15 % de la enmienda 4 (b).
  (e) Las reglas, los procesos, el mínimo de días con operaciones y el criterio de descarte no
  cambian. **Calibración 4:** casos 1-1.000 (M2bc, 1-500) con M0, M1, M2b y M2bc. Examen: casos
  1.000.001-1.001.000 (M2bc, 1.000.001-1.000.500), sin generar.
- **Enmienda 6 — 2026-10-15, tras la calibración 4 y antes del examen. Decidida por el autor.**
  La calibración 4 (`REPORT-MC-calib4.md`) deja a M2bc, con k = 100, apto para H = 63 desde
  n = 252 y para H = 126 desde n = 504; con H = 252 le falta un suspenso del lado prudente
  (G5b). No cumple el criterio de descarte original (H = 126 con n_min ≤ 252): lo impide la
  volatilidad agrupada con un año de datos, que ninguna de las seis variantes del detector
  probadas detecta en más de un 72 % de los casos sin rechazar de más al resto. El autor aceptó
  ese umbral de forma provisional y, conocida la calibración, lo cambia; se declara así:
  (a) **Criterio de descarte: H = 126 con n_min ≤ 504** (seis meses de previsión con dos años de
  datos). El resto de reglas no cambia.
  (b) **Examen:** M2bc congelado (`core/trades/montecarlo.js` en el commit de esta enmienda),
  con **k = 100** fijado de antemano; M0 de referencia. Casos 1.000.001-1.000.500 para M2bc y
  1.000.001-1.001.000 para M0, en todos los procesos (exigidos e informativos). Se ejecuta una
  vez y se publica tal como salga (`REPORT-MC-exam1.md`). La app solo enseñará la previsión en
  los horizontes y tamaños de muestra en que M2bc sea apto en el examen.
  (c) **Radiografía** (no es una previsión): los días con operaciones del backtest en otro orden
  (permutaciones), con el percentil del drawdown real entre ellas, la racha de pérdidas y las
  curvas. Es exacta si los días son intercambiables. Prueba propia antes de enseñarla: con los
  procesos sin rachas ni volatilidad agrupada, el percentil del drawdown real debe repartirse
  por igual entre los diez décimos (mismas reglas de Holm y bandas que el §6 con la enmienda 4,
  aplicadas a ese percentil), y las puertas de rachas y volatilidad se aplican igual. Mínimo:
  30 operaciones. Casos 2.000.001 en adelante; si suspende, se corrige y se repite con casos
  nuevos (3.000.001 en adelante).
- **Enmienda 7 — 2026-10-15, tras el examen y antes de generar ningún caso nuevo. Aprobada por
  delegación del autor** (a la pregunta de si se aprobaba, respondió «Lo que tú consideres»), y
  congelada en el commit que la implementa (`core/trades/montecarlo.js`, variantes V1 y V2;
  `bench/montecarlo-e7.js`). Última ronda del método en esta versión. El examen (`REPORT-MC-exam1.md`) y la app publicada no se tocan.
  Hallazgos que la motivan, todos del examen:
  (a) **El detector de volatilidad agrupada reacciona de más a días extremos aislados.** Las dos
  puertas juntas rechazan un 8-12 % en G1 y G11 (lo esperable con dos contrastes al 5 %, ~10 %),
  pero un 12-18 % en G6 y G6b y un 13-15 % en G12, procesos sin volatilidad agrupada y con colas
  gruesas. En el histórico completo del EA del autor salta por dos ganancias de 5.187 y 6.361
  separadas 9 días (sin ellas, p = 0,084). Es un error del lado prudente (niega cifras), pero
  deja sin previsión a quien podría tenerla.
  (b) **A 3 meses (H = 63) M2bc no es apto con k = 100** por dos motivos: con n = 126, G3a y G4
  (rachas y volatilidad que las puertas no ven con tan pocos días: la app nunca daría 3 meses con
  n = 126) y, para cualquier n, **G5b** (90 % de días sin cierres): DD > p50 en un 40,6 % de los
  casos (del lado prudente). Con k = 100, G5b solo pasa las puertas con n = 1.008, y entonces en
  63 días hay unos 6 días con operaciones: la caída de 3 meses es casi siempre la de una o dos
  operaciones, una distribución con saltos en la que la cifra del p50 no significa gran cosa.
  Cambios que se evalúan:
  (c) **Detector de volatilidad: tres variantes**, todas con 10 retardos y p < 0,05, sobre
  eₜ = xₜ − x̄ de los resultados diarios: **V0**, el actual (Ljung-Box sobre eₜ², McLeod y Li,
  1983); **V1**, Ljung-Box sobre |eₜ|; **V2**, Ljung-Box sobre los rangos de |xₜ − mediana|
  (rangos medios en los empates; no depende del tamaño de los días extremos, solo de su orden:
  centrada en la media sí dependería, porque la media se mueve con el extremo; corregido en el
  borrador antes de generar ningún caso, al escribir su prueba de respuesta conocida). El detector de rachas (Dalla, Giraitis y
  Phillips, 2020) y k = 100 no cambian.
  (d) **Mínimo de días con operaciones esperados en el horizonte (m):** cuarta puerta, solo para
  el horizonte que se pide: la previsión a H días exige (días con operaciones / n) × H ≥ m. Se
  evalúa m ∈ {0, 10, 15, 20}.
  (e) **Calibración:** casos 1-500, solo M2bc (es el único candidato), todos los procesos
  exigidos, los 9 pares con H ≤ n/2, cada variante de (c) con cada m de (d). Para no repetir el
  cálculo, en cada caso se calculan antes todas las puertas y M2bc se ejecuta una vez si alguna
  combinación lo deja pasar; cada combinación se evalúa con los casos que deja pasar. Se elige,
  en este orden: **la variante** con la menor tasa media de rechazo de las dos puertas en G2,
  G6, G6b y G12, siempre que con ella M2bc siga apto para H = 126 y H = 252 desde n ≤ 504 y que
  rechace como mucho un 20 % en los procesos sin rachas ni volatilidad (enmienda 5 d); si
  ninguna baja esa tasa al menos 2 puntos respecto de V0, se queda V0. Después, **m**: el menor
  que deje H = 63 apto desde n ≤ 252 sin empeorar el n_min de H = 126 ni de H = 252; si ninguno lo
  consigue, H = 63 sigue fuera y m no se usa. Reglas de aptitud, bandas, Holm y procesos: los
  del §6 con las enmiendas 4 y 5, sin cambios.
  (f) **Examen:** M2bc con la variante y la m elegidas, congeladas en el commit que las fije;
  casos **4.000.001-4.000.500** (no se han generado: los 2.000.001 en adelante los usó la
  radiografía con otra clave de semilla, y se dejan los 3.000.001 en adelante para una posible
  repetición de la radiografía). Una sola vez y se publica tal como salga
  (`REPORT-MC-exam2.md`).
  (g) **Regla de cierre, fijada ahora:** lo que apruebe el examen pasa a la app con los
  tamaños de muestra más estrictos de la calibración y del examen, como hasta ahora. Lo que
  suspenda se queda como está hoy (V0 y sin 3 meses), se documenta como límite conocido y **no
  se vuelve a intentar en esta versión**.
  (h) Se informa, sin exigirse: si la variante elegida salta con el histórico completo del EA
  del autor, y cuántos de los casos de G4 detecta cada variante.
  **Resultado (2026-10-15, `REPORT-MC-e7-calib.md`, casos 1-500, tal como salió).** Ninguna
  variante cumple las condiciones de (e): en esta calibración tampoco V0 es apto a H = 252 desde
  n ≤ 504 (G5b, DD > p50 en un 41,7 %, del lado prudente, como ya pasó en la calibración 4), así
  que V1 (H = 252 desde n = 1.008 y una celda con más de un 20 % de rechazo) y V2 (H = 252 no apto)
  no pueden «seguir» aptos. Se queda **V0**. Con V0, la m más pequeña que cumple (e) es **0**:
  en la calibración, H = 63 ya es apto desde n = 252 sin la puerta nueva (en el examen 1 no lo fue).
  Variante y m elegidas son, por tanto, las del examen 1: no hay ningún cambio que examinar, y
  examinar otra vez el mismo método con casos nuevos sería repetir el examen hasta que salga bien.
  **No se ejecuta el examen 2.** Por (g), se queda como estaba (V0, sin 3 meses) y queda como
  límite conocido. Se declara además un fallo de redacción de esta enmienda: (e) exigía que la
  variante «siguiera» apta a H = 252 desde n ≤ 504, cuando en la calibración V0 tampoco lo era; la
  intención era «no peor que V0». Con esa lectura, V2 habría salido elegida (rechazo medio en G2,
  G6, G6b y G12 de un 11,3 % frente a un 13,4 %, y H = 126 apto desde n = 252 en lugar de 504). No
  se aplica: cambiar la regla después de ver la calibración es lo que este prerregistro prohíbe.
  Queda anotado para una versión futura, con prerregistro nuevo. Informativo (h): con el histórico
  completo del EA del autor, V0 salta (p < 0,001) y V1 y V2 no (p = 0,156 y 0,734); con lo
  posterior a la elección, ninguna (p = 0,999, 0,579 y 0,162). Casos de G4 marcados antes de las
  puertas: V0 83 %, V1 80 %, V2 67 %.
