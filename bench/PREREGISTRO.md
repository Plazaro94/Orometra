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
