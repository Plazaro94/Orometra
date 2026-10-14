# Resultados del banco de pruebas: tercer examen (ciego) (exam3-motor-1be66b1)

Casos: 800 · errores del motor: 0 · fallos del banco: 0

## 1. Falsos positivos (grupo sin ventaja: S1, S2, S5)

| Escenario | Casos | Moderada o más | Buena o sólida | Sólida | Niveles |
|---|---|---|---|---|---|
| S1 | 100 | 0.0 % | 0.0 % | 0.0 % | insufficient 31, weak 69 |
| S2 | 100 | 0.0 % | 0.0 % | 0.0 % | weak 68, insufficient 32 |
| S5 | 100 | 7.0 % | 0.0 % | 0.0 % | moderate 7, weak 91, insufficient 2 |
| **Total** | 300 | **2.3 %** | **0.0 %** | **0.0 %** | |

## 2. Potencia (S3 con ventaja clara: Sharpe por operación ≥ 0,25 y ≥ 150 operaciones)

Casos: 36 · detectados como moderada o más: **97.2 %** · buena o sólida: 0.0 % · sólida: 0.0 %

## 3. Elección: arrepentimiento normalizado (0 = perfecto, 1 = como elegir la mediana)

Orometra cuenta con 1 cuando no propone meseta (lo más exigente).

| Método | S3 | S4 | S6 | S7 | S8 | **Todos** |
|---|---|---|---|---|---|---|
| Orometra | 0.139 | 0.159 | 0.163 | 0.346 | 0.255 | **0.196** |
| B1 primera fila MT5 | 0.319 | 0.454 | 0.236 | 0.325 | 0.306 | **0.321** |
| B2 mejor en forward | 0.237 | 0.312 | 0.457 | 0.299 | 0.365 | **0.323** |
| B3 puesto IS+forward | 0.205 | 0.256 | 0.263 | 0.314 | 0.293 | **0.263** |
| B4 media con vecinas | 0.176 | 0.259 | 0.144 | 0.316 | 0.179 | **0.209** |
| B5 al azar entre las que pasan | 0.486 | 0.597 | 0.475 | 0.452 | 0.741 | **0.550** |

Abstención de Orometra (no propone meseta): S3 20.0 % · S4 23.0 % · S6 25.0 % · S7 29.0 % · S8 29.0 %

Arrepentimiento de Orometra solo cuando propone: S3 0.110 · S4 0.117 · S6 0.119 · S7 0.139 · S8 0.171

Con sugerencia orientativa cuando no hay meseta (informativo, fuera de los criterios): S3 0.120 · S4 0.123 · S6 0.140 · S7 0.239 · S8 0.238 · **Todos 0.155**

## 4. Coherencia: ventaja real media de la configuración elegida, por nivel

| Nivel | Casos con elección | Ventaja real media (σ por operación) |
|---|---|---|
| insufficient | 0 | — |
| weak | 191 | 0.078 |
| moderate | 265 | 0.200 |
| good | 0 | — |
| strong | 0 | — |

Reparto de niveles en el grupo con ventaja:

| Escenario | Débil o menos | Moderada | Buena | Sólida |
|---|---|---|---|---|
| S3 | 37.0 % | 63.0 % | 0.0 % | 0.0 % |
| S4 | 37.0 % | 63.0 % | 0.0 % | 0.0 % |
| S6 | 63.0 % | 37.0 % | 0.0 % | 0.0 % |
| S7 | 44.0 % | 56.0 % | 0.0 % | 0.0 % |
| S8 | 61.0 % | 39.0 % | 0.0 % | 0.0 % |

Tiempo del motor: mediana 178 ms, máximo 853 ms.

## Criterios del prerregistro

| Criterio | Resultado | Valor |
|---|---|---|
| Falsos positivos ≤ 5 % (moderada o más) | APROBADO | 2.3 % |
| Falsos positivos ≤ 5 % en cada escenario sin ventaja | **SUSPENDIDO** | S1 0.0 %, S2 0.0 %, S5 7.0 % |
| Falsos positivos ≤ 1 % (sólida) | APROBADO | 0.0 % |
| Sólida ≤ 1 % en cada escenario sin ventaja | APROBADO | S1 0.0 %, S2 0.0 %, S5 0.0 % |
| Buena o sólida ≤ 2 % en cada escenario sin ventaja | APROBADO | S1 0.0 %, S2 0.0 %, S5 0.0 % |
| Potencia ≥ 80 % | APROBADO | 97.2 % de 36 |
| Elección: mediana de Orometra ≤ B1 primera fila MT5 | APROBADO | 0.196 frente a 0.321 |
| Elección: mediana de Orometra ≤ B2 mejor en forward | APROBADO | 0.196 frente a 0.323 |
| Elección: mediana de Orometra ≤ B3 puesto IS+forward | APROBADO | 0.196 frente a 0.263 |
| Elección: mediana de Orometra ≤ B4 media con vecinas | APROBADO | 0.196 frente a 0.209 |
| Elección: mediana de Orometra ≤ B5 al azar entre las que pasan | APROBADO | 0.196 frente a 0.550 |
| Elección: en ningún escenario más de 0,10 peor que B1 | APROBADO | S3 -0.180, S4 -0.295, S6 -0.073, S7 +0.021, S8 -0.051 |
| Coherencia: insuficiente/débil < moderada ≤ buena ≤ sólida | APROBADO | insufficient —, weak 0.078, moderate 0.200, good —, strong — |
