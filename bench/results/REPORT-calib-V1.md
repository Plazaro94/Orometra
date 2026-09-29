# Resultados del banco de pruebas: calibración (calib-V1)

Casos: 800 · errores del motor: 0 · fallos del banco: 0

## 1. Falsos positivos (grupo sin ventaja: S1, S2, S5)

| Escenario | Casos | Moderada o sólida | Sólida | Niveles |
|---|---|---|---|---|
| S1 | 100 | 0.0 % | 0.0 % | weak 57, insufficient 43 |
| S2 | 100 | 7.0 % | 0.0 % | weak 62, insufficient 31, moderate 7 |
| S5 | 100 | 47.0 % | 0.0 % | moderate 47, weak 51, insufficient 2 |
| **Total** | 300 | **18.0 %** | **0.0 %** | |

## 2. Potencia (S3 con ventaja clara: Sharpe por operación ≥ 0,25 y ≥ 150 operaciones)

Casos: 41 · detectados como moderada o sólida: **100.0 %**

## 3. Elección: arrepentimiento normalizado (0 = perfecto, 1 = como elegir la mediana)

Orometra cuenta con 1 cuando no propone meseta (lo más exigente).

| Método | S3 | S4 | S6 | S7 | S8 | **Todos** |
|---|---|---|---|---|---|---|
| Orometra | 0.329 | 0.236 | 0.395 | 0.390 | 0.694 | **0.392** |
| B1 primera fila MT5 | 0.303 | 0.514 | 0.305 | 0.300 | 0.323 | **0.333** |
| B2 mejor en forward | 0.361 | 0.322 | 0.418 | 0.269 | 0.328 | **0.342** |
| B3 puesto IS+forward | 0.264 | 0.211 | 0.330 | 0.254 | 0.254 | **0.259** |
| B4 media con vecinas | 0.190 | 0.190 | 0.186 | 0.238 | 0.274 | **0.229** |
| B5 al azar entre las que pasan | 0.561 | 0.503 | 0.499 | 0.469 | 0.643 | **0.556** |

Abstención de Orometra (no propone meseta): S3 23.0 % · S4 22.0 % · S6 26.0 % · S7 22.0 % · S8 36.0 %

Arrepentimiento de Orometra solo cuando propone: S3 0.225 · S4 0.179 · S6 0.168 · S7 0.290 · S8 0.366

## 4. Coherencia: ventaja real media de la configuración elegida, por nivel

| Nivel | Casos con elección | Ventaja real media (σ por operación) |
|---|---|---|
| insufficient | 0 | — |
| weak | 87 | 0.072 |
| moderate | 377 | 0.148 |
| strong | 0 | — |

Tiempo del motor: mediana 67 ms, máximo 506 ms.

## Criterios del prerregistro

| Criterio | Resultado | Valor |
|---|---|---|
| Falsos positivos ≤ 5 % (moderada o sólida) | **SUSPENDIDO** | 18.0 % |
| Falsos positivos ≤ 1 % (sólida) | APROBADO | 0.0 % |
| Potencia ≥ 80 % | APROBADO | 100.0 % de 41 |
| Elección: mediana de Orometra ≤ B1 primera fila MT5 | **SUSPENDIDO** | 0.392 frente a 0.333 |
| Elección: mediana de Orometra ≤ B2 mejor en forward | **SUSPENDIDO** | 0.392 frente a 0.342 |
| Elección: mediana de Orometra ≤ B3 puesto IS+forward | **SUSPENDIDO** | 0.392 frente a 0.259 |
| Elección: mediana de Orometra ≤ B4 media con vecinas | **SUSPENDIDO** | 0.392 frente a 0.229 |
| Elección: mediana de Orometra ≤ B5 al azar entre las que pasan | APROBADO | 0.392 frente a 0.556 |
| Elección: en ningún escenario más de 0,10 peor que B1 | **SUSPENDIDO** | S3 +0.026, S4 -0.278, S6 +0.090, S7 +0.090, S8 +0.371 |
| Coherencia: insuficiente/débil < moderada ≤ sólida | APROBADO | insufficient —, weak 0.072, moderate 0.148, strong — |
