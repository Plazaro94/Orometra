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
