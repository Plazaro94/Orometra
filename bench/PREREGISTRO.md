# Banco de pruebas del motor: prerregistro

Fecha: 2026-09-28. Este documento se escribe **antes** de ejecutar el banco. Los criterios de
aprobado, los casos y las métricas no se cambian después de ver resultados. Si hubiera que
cambiar algo, se añade como enmienda fechada al final, con el motivo, y los resultados
anteriores se conservan.

**Punto de retorno.** Versión del motor evaluada: `main` en `c948971`. Cualquier cambio del
motor que salga de este banco irá en un cambio aparte y reversible.

## 1. Qué se quiere saber

1. Si Orometra dice «moderada» o «sólida» cuando no hay nada real (falsos positivos).
2. Si detecta una ventaja real cuando la hay (potencia).
3. Si la configuración que recomienda rinde mejor, fuera de la muestra, que lo que haría un
   usuario con métodos habituales.
4. Si los niveles de evidencia están ordenados: más nivel, mejor rendimiento real.
5. Si sabe decir que los datos no dan para concluir.

## 2. Cómo se genera cada caso (verdad conocida)

Cada caso es una optimización sintética con la forma de un export de MT5 (in-sample y forward)
y un tercer periodo, **no visto**, que solo conoce el banco.

- **Rejilla:** de 2 a 4 parámetros, de 6 a 12 niveles cada uno, búsqueda completa salvo en el
  escenario genético; como máximo unas 1.500 configuraciones.
- **Ventaja real** `edge(z)`: la media verdadera de cada operación de la configuración `z`, en
  unidades de la desviación típica de una operación. Es lo que se usa como verdad.
- **Suerte del periodo:** un campo aleatorio suave (sumas de «bultos» gaussianos de signo al
  azar), independiente en cada periodo. Modela que en un tramo concreto una zona entera puede
  salir bien por casualidad, que es el caso difícil. Se añade a la media de ese periodo.
- **Operaciones:** para cada configuración y periodo se simulan sus operaciones (t de Student
  con 4 grados de libertad, colas gruesas), y de ellas se calculan las métricas como las
  calcula MT5: beneficio, factor de beneficio, beneficio esperado, drawdown relativo sobre el
  capital, factor de recuperación, Sharpe y número de operaciones.
- **Forward como el de MT5:** solo se exporta el 25 % mejor del in-sample por beneficio.
- **Periodo no visto:** la media verdadera en ese periodo es `edge_unseen(z)`; la suerte no se
  arrastra.

## 3. Escenarios

| Id | Escenario | Verdad en el periodo no visto |
|---|---|---|
| S1 | Ruido puro, sin suerte correlacionada | Ninguna ventaja |
| S2 | Ruido con suerte correlacionada (zonas afortunadas) | Ninguna ventaja |
| S3 | Meseta ancha real + suerte | Meseta |
| S4 | Meseta real + pico estrecho que solo existe en el in-sample | Meseta |
| S5 | Ventaja solo en el in-sample (sobreajuste puro) | Ninguna ventaja |
| S6 | Cambio de régimen: la ventaja se reduce a la mitad fuera del in-sample | Meseta más débil |
| S7 | Meseta real con muestreo genético (20-35 % de la rejilla, sesgado hacia lo que puntúa alto) | Meseta |
| S8 | Meseta real sobre la rejilla de un export real (niveles del usuario) | Meseta |

Grupo **sin ventaja**: S1, S2, S5. Grupo **con ventaja**: S3, S4, S6, S7, S8.

## 4. Métodos de referencia

- **B1** la primera fila de MT5 (mayor beneficio in-sample).
- **B2** la mejor en el forward.
- **B3** la mejor sumando su puesto en in-sample y en forward.
- **B4** la mejor media de cada configuración con sus vecinas a un paso (in-sample).
- **B5** una al azar entre las que cumplen los mínimos en in-sample y forward.
- **Oráculo** la de mayor `edge_unseen` (el techo; ningún método puede conocerlo).

Orometra se evalúa con la política por defecto de la app. Su elección es el representante de
M1. Si no propone meseta, se registra como «se abstiene».

## 5. Métricas

- **Tasa de falsos positivos:** en el grupo sin ventaja, fracción de casos con nivel del motor
  «moderada» o «sólida».
- **Potencia:** en S3 con ventaja clara (Sharpe verdadero por operación de la meseta ≥ 0,25 y
  ≥ 150 operaciones en el in-sample), fracción con «moderada» o «sólida».
- **Rendimiento de la elección:** `edge_unseen` de la configuración elegida, expresado como
  **arrepentimiento normalizado** = (oráculo − elegida) / (oráculo − mediana de la rejilla).
  0 es perfecto; 1 es lo mismo que elegir la configuración mediana.
- **Coherencia de niveles:** media de `edge_unseen` de la elegida por nivel.
- **Abstenciones:** si en un caso del grupo con ventaja Orometra no propone meseta, para la
  comparación principal cuenta con arrepentimiento 1 (como si eligiera la mediana), que es lo
  más exigente para Orometra. Se informa aparte de la tasa de abstención y del arrepentimiento
  solo en los casos en que propone. *(Aclaración añadida el 2026-09-28, antes de ejecutar.)*

## 6. Criterios de aprobado (cerrados)

| Prueba | Aprobado si |
|---|---|
| Falsos positivos | ≤ 5 % «moderada» o «sólida», y ≤ 1 % «sólida» |
| Potencia | ≥ 80 % «moderada» o más |
| Elección | Mediana del arrepentimiento de Orometra ≤ la de cada método de referencia en el grupo con ventaja, y en ningún escenario más de 0,10 por encima de B1 |
| Coherencia | La media de `edge_unseen` crece con el nivel (insuficiente/débil < moderada ≤ sólida) |
| Saber decir «no» | En el grupo sin ventaja, «débil» o «insuficiente» en ≥ 95 % (equivale al primer criterio) |

## 7. Calibración y examen

- **Calibración:** semillas 1-40 de cada escenario. Solo aquí se puede mirar el detalle y, si
  hiciera falta, ajustar el motor.
- **Examen:** semillas 1001-1040. Los criterios del apartado 6 se evalúan aquí, con el motor
  congelado. Si se ajusta algo con la calibración, el examen se repite entero.

## 8. Qué se hace si algo falla

- **Falsos positivos altos:** recalibrar los umbrales de los niveles con la calibración hasta
  el 5 %, y confirmarlo en el examen.
- **La elección pierde contra un método de referencia:** análisis por piezas (quitar una cada
  vez: robustez de vecinas, elección del centro, peso del forward, penalizaciones) para medir
  cuánto aporta cada una; cambiar o quitar lo que reste; adoptar el método que gane si gana de
  forma consistente.
- **Poca potencia:** relajar umbrales eligiendo explícitamente el equilibrio con los falsos
  positivos.
- **Niveles incoherentes:** rehacer las reglas del nivel con medidas que se correspondan con
  el rendimiento.
- **Límite de los datos de MT5:** decirlo en el producto.

## 9. Límites conocidos de este banco

- Es sintético: prueba el motor contra el mundo que describe este documento. La confirmación
  final es la prueba con optimizaciones reales y un periodo no usado (pendiente de datos).
- La suerte y las operaciones son modelos simplificados del mercado.

## Enmiendas

- **2026-09-28, antes de ver resultados.** Fallo del generador (no del motor): en S7, con una
  rejilla de menos de 40 configuraciones, el muestreo genético pedía más pasadas de las que
  existían y no terminaba. Se limita al tamaño de la rejilla. La calibración se repite entera.
- **2026-09-28, tras la primera medición y antes de cambiar el motor.** La potencia se medía
  con muy pocos casos (12-17) y salió 88 % en calibración y 42 % en examen: demasiado ruido
  para decidir. Se amplía a **100 semillas por escenario** (calibración 1-100, examen
  1001-1100) y se vuelve a medir el motor actual con esa muestra antes de cualquier cambio.
  Los criterios no cambian. Las mediciones con 40 semillas se conservan en `bench/results/`.
- **2026-09-29, tras la calibración y antes del examen.** Cambios del motor elegidos solo con
  la calibración (semillas 1-100): (1) los porcentajes que exigen los dos periodos se miden
  sobre las configuraciones con forward (error de la tanda 3); (2) si la meseta recomendada
  cumple los mínimos del forward en menos del 50 % de sus configuraciones con forward, es
  crítico; (3) la configuración a desplegar se elige dentro de la meseta por puesto conjunto
  in-sample + forward promediado con sus vecinas; (4) sin meseta, el motor da una sugerencia
  **orientativa** con esa misma regla, presentada como tal. Los criterios del apartado 6 no
  cambian: la abstención sigue contando 1. El arrepentimiento con la sugerencia orientativa
  se informa aparte y no cuenta para aprobar. El motor queda congelado para el examen
  (semillas 1001-1100), que se compara con el motor publicado (`c948971`).
- **2026-09-29, tras la segunda auditoría y antes del segundo examen.** La auditoría encontró
  que (a) el primer examen no era ciego: las semillas 1001-1040 se habían mirado con el motor
  anterior; (b) el criterio agregado de falsos positivos escondía un 14 % en S5 detrás del
  0 % de S1; (c) el examen suspendió «Orometra ≤ B4» (0,234 frente a 0,216), y eso debe
  constar. Se declara: **el primer examen suspendió el criterio B4**. Cambios, elegidos solo
  con la calibración: el crítico de forward pasa de 0,5 a 0,65 (en calibración, S5 baja del
  10 % al 3 % y la potencia queda en 93 %); empates con puesto medio en la elección; sin
  forward no hay sugerencia orientativa; el veredicto no cambia al cambiar de idioma.
  **Criterio añadido** (más exigente, no más laxo): falsos positivos ≤ 5 % en **cada**
  escenario sin ventaja. **Segundo examen:** semillas 2001-2100, nunca generadas ni vistas
  antes; se ejecuta una sola vez con el motor congelado y se publica tal como salga.
  **Análisis por piezas del criterio B4 (§8), sobre la calibración:** cuando Orometra
  propone meseta (371 de 500 casos con ventaja), su arrepentimiento mediano es 0,146 frente
  a 0,180 de B4 en esos mismos casos; cuando se abstiene (129), la sugerencia orientativa da
  0,317 frente a 0,405 de B4. La derrota agregada viene solo de contar la abstención como 1.
  No se cambia ese criterio.
- **2026-10-09, tras la calibración y antes del tercer examen.** Con exports reales de MT5
  el motor no podía pasar de «moderada»: «sólida» exigía cero avisos y el aviso de que MT5
  solo reexporta al forward las mejores pasadas sale en todo export real. En el banco
  tampoco salía nunca (0 casos en el segundo examen). Cambios, elegidos solo con la
  calibración (semillas 1-100; `calib-warn.jsonl` y `calib-v3.jsonl`):
  (1) los avisos que miden el **orden de la tabla** y no la meseta propuesta (ranking de
  MT5, orden de la nota de Orometra entre periodos, transferencia del ranking, asimetría
  entre periodos, valores que se invierten por parámetro, preselección del forward) se
  siguen mostrando, pero no cuentan para los niveles altos;
  (2) **«sólida»**: sin críticos, la meseta recomendada tiene configuraciones probadas en
  el forward, se ha repetido la búsqueda moviendo los umbrales y no queda ningún aviso
  sobre la meseta; **«buena»**: lo mismo con un solo aviso; el resto con meseta,
  «moderada». Ya no hace falta el periodo no visto para «sólida»: si se aporta y va en
  contra, la interfaz la baja a «moderada»; si no la contradice, se queda igual (nunca
  sube de nivel).
  La elección de la configuración no cambia. En calibración: «buena» o «sólida» en 0 de
  300 casos sin ventaja; con ventaja, 90 «buena» y 22 «sólida» de 500; ventaja real media
  de la elegida 0,190 (moderada), 0,228 (buena), 0,256 (sólida).
  **Criterios añadidos** (más exigentes): «sólida» ≤ 1 % y «buena» o «sólida» ≤ 2 % en
  **cada** escenario sin ventaja; coherencia insuficiente/débil < moderada ≤ buena ≤
  sólida. Los anteriores no cambian («moderada o sólida» pasa a leerse «moderada o más»).
  **Tercer examen:** semillas 3001-3100, nunca generadas ni vistas antes; se ejecuta una
  sola vez con el motor congelado y se publica tal como salga.
- **2026-10-09, tras el tercer examen y antes del cuarto.** El tercer examen (semillas
  3001-3100, `REPORT-exam3.md`) se publica tal como salió. Aprueba «sólida» ≤ 1 % en cada
  escenario sin ventaja (0 %), la potencia (97,2 % de 36), la elección frente a los cinco
  métodos de referencia y la coherencia (moderada 0,181 < buena 0,218 < sólida 0,234).
  **Suspende dos criterios**, los dos en S5: «buena o sólida» ≤ 2 % (3 %) y «moderada o
  más» ≤ 5 % (7 %). El segundo no viene de este cambio: el motor anterior (`1be66b1`) da
  el mismo 7 % con esas semillas (`REPORT-exam3-motor-1be66b1.md`). De los tres «buena»
  falsos, dos tenían como único aviso que la recomendación solo aguanta el 50 % de las
  variaciones de umbral. **Cambio, elegido mirando el tercer examen** (que deja de ser
  ciego): «buena» exige además que la recomendación aguante al menos el 80 % de esas
  variaciones, como ya exigía «sólida». En calibración, «buena» pasa de 90 a 62 casos con
  ventaja y sigue en 0 sin ventaja (`calib-v3b`). Nada más cambia. **Cuarto examen:**
  semillas 4001-4100, nunca generadas; una sola vez, motor congelado, se publica tal como
  salga.
- **2026-10-09, tras el cuarto examen y antes del quinto.** El cuarto examen (semillas
  4001-4100, `REPORT-exam4.md`) aprueba los criterios nuevos y suspende dos que el motor
  anterior también suspende con esas semillas («moderada o más» en S5, 7 %; elección frente
  a la media con vecinas, 0,227 frente a 0,192). **Fallo encontrado al documentar el motor,
  no al mirar resultados:** en la repetición con los umbrales internos movidos un ±20 %, la
  fracción mínima de vecinas que cumplen (0,9) se multiplicaba por el factor y por encima
  de 1,111 pedía más del 100 %; esas repeticiones (9 de 50) no podían encontrar meseta y la
  estabilidad nunca pasaba de 0,82 (287 casos del cuarto examen en ese tope). Cambio: esa
  fracción se mueve sobre lo que le falta para 1 (0,9 queda entre 0,88 y 0,92). Nada más
  cambia. Calibración (`calib-v4`): sin falsos positivos en «buena» ni «sólida»; con
  ventaja, 64 «buena» y 22 «sólida» de 500. **Quinto examen:** semillas 5001-5100, nunca
  generadas; una sola vez, motor congelado, se publica tal como salga.
- **2026-10-11, tras el quinto examen.** De la auditoría de uso: el aviso «La regla "primera
  de Result" falla» era **crítico** cuando el orden de MT5 fallaba la mitad de las veces o más
  y menos de 1 de cada 4 configuraciones cumplía en los dos periodos, aunque mide el orden de
  la tabla y no la meseta (y Metodología dice que esos avisos no bajan el nivel). Medición, con
  el motor actual, de cuántos niveles cambiaría pasarlo a aviso de tabla
  (`bench/orden-tabla.js`, `REPORT-calib-orden-tabla.md`): en la calibración salta 218 veces de
  800 (307 con un factor de beneficio mínimo de 1,40) y **nunca es el único crítico**; en el
  quinto examen, ya publicado, 216 de 800 y tampoco. **Cambio:** pasa a aviso de tabla. No
  cambia ningún nivel en el banco, así que los resultados publicados del quinto examen no
  cambian y no hace falta otro examen. Los criterios no cambian.
- **2026-10-14, auditoría estadística con un export real (un EA sobre un índice en M15, unas
  10.000 pasadas genéticas, su forward y su .set).** Tres cambios y una medición, con el motor publicado
  (`dbcc488`) como referencia (`calib-motor-dbcc488.jsonl`).
  (1) **Contraste del Sharpe:** el umbral era el máximo *esperado* de N pruebas sin ventaja,
  que el máximo de puro ruido supera en torno al 43 % de las veces (`tests/shrink.test.js`
  lo mide por Monte Carlo); pasa a ser su **percentil 95**, exacto bajo independencia. Es un
  cambio de método, no de ajuste: no se eligió mirando resultados. En calibración baja de
  nivel 5 casos, todos con ventaja (4 «moderada» y 1 «buena» a «débil»); falsos positivos y
  potencia no cambian (1,3 % y 92,7 %); coherencia weak 0,074 < moderate 0,198 < good 0,232 <
  strong 0,256 (`REPORT-calib-2026-10-14.md`).
  (2) **Expectativa ajustada por selección** (`core/shrink.js`): cifra nueva que no mueve el
  nivel. Se midió contra la verdad del no visto con `bench/shrink.js`; las ocho variantes
  probadas, todas sobre la calibración, están en `REPORT-shrink-variantes-2026-10-14.md`.
  (3) La procedencia y dos textos, sin efecto en el banco.
  **Orden entre mesetas, medido y sin cambiar:** se probó a quitar el peso del forward al
  ordenar las mesetas y a darle el peso entero (`rankForward`, `calib-fw-none.jsonl`,
  `calib-fw-strong.jsonl`). El banco no lo distingue: solo 34 de 800 casos tienen más de una
  meseta, la elección cambia en 4 y en 1 casos, y el arrepentimiento queda en 0,251 y 0,244
  frente a 0,247. Sin pruebas no se cambia. Decidirlo exige un escenario con varias mesetas
  en muchas dimensiones y muestreo genético, que se prerregistrará aparte, antes de generarlo.
  **Sexto examen:** semillas 6001-6100, nunca generadas; una sola vez, motor congelado, se
  publica tal como salió (`REPORT-exam6.md`). Aprueba falsos positivos (1,3 %; «sólida» 0,3 %),
  potencia (96,9 % de 32) y coherencia. **Suspende la elección frente a B3 (0,258 frente a
  0,236) y frente a B4 (0,258 frente a 0,213).** No viene de estos cambios: el motor anterior
  elige exactamente lo mismo en los 800 casos y suspende igual (`REPORT-exam6-motor-dbcc488.md`).
  Frente a él, solo cambia el nivel de 9 casos con ventaja (a «débil» por el umbral del Sharpe).
  Expectativa ajustada en el examen: RMSE 6,7 frente a 10,4 de la cifra del forward y 10,7 de la
  del periodo optimizado en los casos con ventaja; sin ventaja, la ventaja propia sale distinta
  de cero el 9 % de las veces (5 de 56), frente al 5 % de la calibración
  (`REPORT-shrink-exam6.md`). Los criterios no cambian.
- **2026-10-14 (b), prerregistro del orden entre mesetas, ANTES de generar ningún caso.**
  *Pregunta:* con muchas dimensiones, muestreo genético y varias zonas buenas, ¿qué regla
  para ordenar las mesetas elige mejor en el periodo no visto? *Conflicto declarado:* quien
  escribe esto conoce un caso real (el export de la enmienda anterior) en el que
  la regla actual pone primera una meseta grande que falla el forward por delante de una
  pequeña que lo aguanta. Por eso las zonas del escenario se sortean, las reglas son pocas y
  todo se fija aquí, antes de ver un solo resultado.
  **Escenarios nuevos** (`bench/sim.js`; no entran en los criterios del §6, que siguen
  midiendo S1-S8):
  - **S9, varias zonas con ventaja.** Rejilla de 5 a 7 parámetros, de 5 a 8 niveles cada uno
    (el espacio entero no se simula). Ventaja verdadera: K zonas, K al azar entre 2, 3 y 4;
    cada zona con centro al azar (a un paso del borde como mínimo), anchura por parámetro
    uniforme entre 0,8 y 2,5 pasos y altura uniforme entre 0,05 y 0,35 desviaciones por
    operación; la ventaja de una configuración es la mayor de las zonas. Es la misma en el
    in-sample, el forward y el no visto. Suerte del periodo y operaciones, como en S1-S8
    (amplitud de 0,04 a 0,12; de 150 a 600 operaciones in-sample; forward del 25 % al 50 %).
  - **Muestreo genético de S9:** de 1.500 a 4.000 configuraciones distintas. El 25 % al azar
    uniforme; el resto, en tandas de 100 hijos: padre al azar entre el 20 % mejor por
    beneficio in-sample de lo ya probado, hijo mutando 1 o 2 parámetros ±1 o ±2 pasos (dentro
    de la rejilla); los repetidos se descartan. Forward: el 25 % mejor por beneficio
    in-sample, como en S1-S8.
  - **S10, su gemelo sin ventaja:** lo mismo, pero las zonas solo existen en el in-sample;
    en el forward y en el no visto no hay ventaja.
  **Reglas candidatas (lista cerrada):**
  - **R0**, la actual: suelo × tamaño × evidencia × penalizaciones × (0,35 + 0,65 × fracción
    validada en el forward).
  - **R1, por lo que se espera:** cada meseta se ordena por su beneficio esperado por
    operación en un periodo nuevo, con el modelo de `core/shrink.js` aplicado a la meseta
    entera como una unidad (media de sus configuraciones en cada periodo; operaciones por
    media armónica).
  - **R2, por su límite inferior:** como R1, por esperado − 1,96 × su desviación a posteriori.
  - Si el modelo no se puede estimar (sin forward, o con menos de 30 candidatas), R1 y R2
    usan R0. La misma clave ordena las mesetas y la prueba de estabilidad.
  **Métricas:** las del §5. Las reglas no cambian qué mesetas existen, solo su orden, así que
  la abstención es la misma con las tres.
  **Criterios (cerrados).** R1 o R2 se adopta solo si, en la calibración (semillas 1-100 de
  S1-S10), cumple las cuatro:
  (a) mediana del arrepentimiento en S9 al menos 0,02 por debajo de la de R0;
  (b) en ningún escenario de S1 a S8 su mediana supera la de R0 en más de 0,01;
  (c) «moderada o más» ≤ 5 % en S1, S2, S5 y S10, y en ninguno más de 1 punto por encima de R0;
  (d) sigue aprobando los criterios del §6 que R0 aprueba en esa misma calibración.
  Si las dos cumplen, la de menor mediana en S9. Si ninguna, se queda R0 y se dice.
  **Examen:** semillas 7001-7100 de S1-S10, nunca generadas; una sola vez, con el motor
  congelado, la regla elegida y R0 al lado. Se publica tal como salga. La adopción se
  confirma si en el examen la mediana en S9 de la elegida no supera la de R0 y se cumple (c);
  si no, se vuelve a R0 y se dice.
  **Depurar el generador** solo con semillas de 900.000 en adelante, que no son de ningún
  tramo, y mirando solo que funciona (tiempos, mesetas, forward), nunca arrepentimientos.
  **El caso real** (el export del autor y su periodo no visto, cuando exista) se informa
  aparte: es un caso, no decide.
- **2026-10-14 (c), corrección del generador antes de la calibración.** Depurando con semillas
  900.001-900.040, sin mirar arrepentimientos: en S9, 30 de 40 casos no tenían ninguna meseta y
  solo 4 tenían dos o más. El escenario no podía responder a la pregunta. La causa es de
  realismo: todos los parámetros movían la ventaja, y en un EA real solo unos pocos la mueven
  (por eso los exports reales tienen mesetas grandes en muchas dimensiones). Cambio: de los 5
  a 7 parámetros, solo de 2 a 4, sorteados, mueven las zonas; en el resto la zona no cambia.
  Nada más cambia (alturas, anchuras en los relevantes, suerte, genético, reglas y criterios).
  Con ello, en esas mismas semillas de depuración: S9 con dos o más mesetas en 20 de 40 y S10
  en 27 de 40. Ahora se calibra.
- **2026-10-14 (d), resultado de la calibración del orden entre mesetas** (semillas 1-100 de
  S1-S10, `REPORT-orden-mesetas-calib.md`; criterios aplicados por `bench/orden-mesetas.js`).
  Medianas del arrepentimiento en S9: R0 0,187, R1 0,193 y R2 0,173 (hacía falta ≤ 0,167).
  En S6, R1 y R2 empeoran 0,019 (máximo permitido 0,010). Falsos positivos iguales en las tres.
  R1 cambia la elegida en 16 de 100 casos de S9 y acierta en 8 y falla en 8; R2, en 15 (8
  mejor, 7 peor). **Ninguna cumple (a) y (b): se queda R0.** Como no se adopta nada, no hay
  examen que confirmar: las semillas 7001-7100 quedan sin generar para la próxima pregunta.
- **2026-10-14 (e), de dónde viene el suspenso frente a B4 (y B3).** No es la elección dentro
  de la meseta. Arrepentimiento mediano en los escenarios con ventaja (S3, S4, S6, S7 y S8):

  | | Calibración | Quinto examen | Sexto examen |
  |---|---|---|---|
  | Cuando Orometra propone meseta: Orometra / B4 | 0,146 / 0,180 | 0,135 / 0,172 | 0,145 / 0,164 |
  | Cuando no la propone: sugerencia orientativa / B4 | 0,317 / 0,405 | 0,324 / 0,323 | 0,346 / 0,412 |
  | Lo que enseña la app (meseta o sugerencia): Orometra / B4 | 0,177 / 0,229 | 0,187 / 0,198 | 0,191 / 0,213 |
  | Como cuenta el criterio (sin meseta = 1): Orometra / B4 | 0,247 / 0,229 | 0,228 / 0,198 | 0,258 / 0,213 |

  El suspenso sale de contar cada caso sin meseta (del 21 % al 36 % según el escenario) como
  el peor resultado, que se decidió así a propósito. Se mantiene el criterio, y no se relajan
  los umbrales para abstenerse menos: subirían los falsos positivos, que es lo que más
  protege al usuario. Metodología lo explica con las cifras del sexto examen, que es el que
  cita la portada (antes del commit 8b3cde2, las del quinto).

  Nota del 2026-10-14, añadida después: la casilla del quinto examen «cuando no la propone»
  estaba vacía; calculada sobre `exam5.jsonl` (121 casos sin meseta), 0,324 frente a 0,323.
  Ahí la sugerencia no gana a B4; en lo que enseña la app, sí (0,187 frente a 0,198).
