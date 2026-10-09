# Resultados del banco de pruebas: quinto examen (ciego) (exam5-motor-22b4b3d)

Casos: 800 · errores del motor: 0 · fallos del banco: 0

## 1. Falsos positivos (grupo sin ventaja: S1, S2, S5)

| Escenario | Casos | Moderada o más | Buena o sólida | Sólida | Niveles |
|---|---|---|---|---|---|
| S1 | 100 | 0.0 % | 0.0 % | 0.0 % | insufficient 43, weak 57 |
| S2 | 100 | 2.0 % | 0.0 % | 0.0 % | insufficient 27, weak 71, moderate 2 |
| S5 | 100 | 8.0 % | 2.0 % | 0.0 % | weak 91, insufficient 1, moderate 6, good 2 |
| **Total** | 300 | **3.3 %** | **0.7 %** | **0.0 %** | |

## 2. Potencia (S3 con ventaja clara: Sharpe por operación ≥ 0,25 y ≥ 150 operaciones)

Casos: 40 · detectados como moderada o más: **85.0 %** · buena o sólida: 35.0 % · sólida: 17.5 %

## 3. Elección: arrepentimiento normalizado (0 = perfecto, 1 = como elegir la mediana)

Orometra cuenta con 1 cuando no propone meseta (lo más exigente).

| Método | S3 | S4 | S6 | S7 | S8 | **Todos** |
|---|---|---|---|---|---|---|
| Orometra | 0.127 | 0.194 | 0.183 | 0.260 | 0.429 | **0.228** |
| B1 primera fila MT5 | 0.261 | 0.410 | 0.235 | 0.249 | 0.316 | **0.288** |
| B2 mejor en forward | 0.247 | 0.294 | 0.296 | 0.250 | 0.476 | **0.310** |
| B3 puesto IS+forward | 0.205 | 0.238 | 0.262 | 0.197 | 0.317 | **0.241** |
| B4 media con vecinas | 0.119 | 0.192 | 0.161 | 0.238 | 0.267 | **0.198** |
| B5 al azar entre las que pasan | 0.505 | 0.507 | 0.492 | 0.498 | 0.687 | **0.534** |

Abstención de Orometra (no propone meseta): S3 21.0 % · S4 25.0 % · S6 15.0 % · S7 23.0 % · S8 37.0 %

Arrepentimiento de Orometra solo cuando propone: S3 0.076 · S4 0.112 · S6 0.125 · S7 0.202 · S8 0.220

Con sugerencia orientativa cuando no hay meseta (informativo, fuera de los criterios): S3 0.110 · S4 0.162 · S6 0.147 · S7 0.211 · S8 0.292 · **Todos 0.187**

## 4. Coherencia: ventaja real media de la configuración elegida, por nivel

| Nivel | Casos con elección | Ventaja real media (σ por operación) |
|---|---|---|
| insufficient | 0 | — |
| weak | 210 | 0.078 |
| moderate | 186 | 0.180 |
| good | 46 | 0.213 |
| strong | 28 | 0.252 |

Reparto de niveles en el grupo con ventaja:

| Escenario | Débil o menos | Moderada | Buena | Sólida |
|---|---|---|---|---|
| S3 | 40.0 % | 40.0 % | 10.0 % | 10.0 % |
| S4 | 38.0 % | 40.0 % | 12.0 % | 10.0 % |
| S6 | 67.0 % | 27.0 % | 5.0 % | 1.0 % |
| S7 | 43.0 % | 34.0 % | 16.0 % | 7.0 % |
| S8 | 62.0 % | 37.0 % | 1.0 % | 0.0 % |

Tiempo del motor: mediana 187 ms, máximo 1004 ms.

## Criterios del prerregistro

| Criterio | Resultado | Valor |
|---|---|---|
| Falsos positivos ≤ 5 % (moderada o más) | APROBADO | 3.3 % |
| Falsos positivos ≤ 5 % en cada escenario sin ventaja | **SUSPENDIDO** | S1 0.0 %, S2 2.0 %, S5 8.0 % |
| Falsos positivos ≤ 1 % (sólida) | APROBADO | 0.0 % |
| Sólida ≤ 1 % en cada escenario sin ventaja | APROBADO | S1 0.0 %, S2 0.0 %, S5 0.0 % |
| Buena o sólida ≤ 2 % en cada escenario sin ventaja | APROBADO | S1 0.0 %, S2 0.0 %, S5 2.0 % |
| Potencia ≥ 80 % | APROBADO | 85.0 % de 40 |
| Elección: mediana de Orometra ≤ B1 primera fila MT5 | APROBADO | 0.228 frente a 0.288 |
| Elección: mediana de Orometra ≤ B2 mejor en forward | APROBADO | 0.228 frente a 0.310 |
| Elección: mediana de Orometra ≤ B3 puesto IS+forward | APROBADO | 0.228 frente a 0.241 |
| Elección: mediana de Orometra ≤ B4 media con vecinas | **SUSPENDIDO** | 0.228 frente a 0.198 |
| Elección: mediana de Orometra ≤ B5 al azar entre las que pasan | APROBADO | 0.228 frente a 0.534 |
| Elección: en ningún escenario más de 0,10 peor que B1 | **SUSPENDIDO** | S3 -0.134, S4 -0.216, S6 -0.052, S7 +0.011, S8 +0.113 |
| Coherencia: insuficiente/débil < moderada ≤ buena ≤ sólida | APROBADO | insufficient —, weak 0.078, moderate 0.180, good 0.213, strong 0.252 |
