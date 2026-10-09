# Resultados del banco de pruebas: calibración (calib-v3b)

Casos: 800 · errores del motor: 0 · fallos del banco: 0

## 1. Falsos positivos (grupo sin ventaja: S1, S2, S5)

| Escenario | Casos | Moderada o más | Buena o sólida | Sólida | Niveles |
|---|---|---|---|---|---|
| S1 | 100 | 0.0 % | 0.0 % | 0.0 % | weak 57, insufficient 43 |
| S2 | 100 | 1.0 % | 0.0 % | 0.0 % | insufficient 31, weak 68, moderate 1 |
| S5 | 100 | 3.0 % | 0.0 % | 0.0 % | weak 95, insufficient 2, moderate 3 |
| **Total** | 300 | **1.3 %** | **0.0 %** | **0.0 %** | |

## 2. Potencia (S3 con ventaja clara: Sharpe por operación ≥ 0,25 y ≥ 150 operaciones)

Casos: 41 · detectados como moderada o más: **92.7 %** · buena o sólida: 39.0 % · sólida: 7.3 %

## 3. Elección: arrepentimiento normalizado (0 = perfecto, 1 = como elegir la mediana)

Orometra cuenta con 1 cuando no propone meseta (lo más exigente).

| Método | S3 | S4 | S6 | S7 | S8 | **Todos** |
|---|---|---|---|---|---|---|
| Orometra | 0.212 | 0.178 | 0.235 | 0.230 | 0.420 | **0.247** |
| B1 primera fila MT5 | 0.303 | 0.514 | 0.305 | 0.300 | 0.323 | **0.333** |
| B2 mejor en forward | 0.361 | 0.322 | 0.418 | 0.269 | 0.328 | **0.342** |
| B3 puesto IS+forward | 0.264 | 0.211 | 0.330 | 0.254 | 0.254 | **0.259** |
| B4 media con vecinas | 0.190 | 0.190 | 0.186 | 0.238 | 0.274 | **0.229** |
| B5 al azar entre las que pasan | 0.561 | 0.503 | 0.499 | 0.469 | 0.643 | **0.556** |

Abstención de Orometra (no propone meseta): S3 23.0 % · S4 22.0 % · S6 26.0 % · S7 22.0 % · S8 36.0 %

Arrepentimiento de Orometra solo cuando propone: S3 0.129 · S4 0.104 · S6 0.153 · S7 0.152 · S8 0.186

Con sugerencia orientativa cuando no hay meseta (informativo, fuera de los criterios): S3 0.180 · S4 0.122 · S6 0.165 · S7 0.183 · S8 0.274 · **Todos 0.177**

## 4. Coherencia: ventaja real media de la configuración elegida, por nivel

| Nivel | Casos con elección | Ventaja real media (σ por operación) |
|---|---|---|
| insufficient | 0 | — |
| weak | 216 | 0.073 |
| moderate | 164 | 0.195 |
| good | 62 | 0.233 |
| strong | 22 | 0.256 |

Reparto de niveles en el grupo con ventaja:

| Escenario | Débil o menos | Moderada | Buena | Sólida |
|---|---|---|---|---|
| S3 | 41.0 % | 40.0 % | 16.0 % | 3.0 % |
| S4 | 39.0 % | 32.0 % | 22.0 % | 7.0 % |
| S6 | 72.0 % | 22.0 % | 5.0 % | 1.0 % |
| S7 | 44.0 % | 26.0 % | 19.0 % | 11.0 % |
| S8 | 60.0 % | 40.0 % | 0.0 % | 0.0 % |

Tiempo del motor: mediana 173.5 ms, máximo 1179 ms.

## Criterios del prerregistro

| Criterio | Resultado | Valor |
|---|---|---|
| Falsos positivos ≤ 5 % (moderada o más) | APROBADO | 1.3 % |
| Falsos positivos ≤ 5 % en cada escenario sin ventaja | APROBADO | S1 0.0 %, S2 1.0 %, S5 3.0 % |
| Falsos positivos ≤ 1 % (sólida) | APROBADO | 0.0 % |
| Sólida ≤ 1 % en cada escenario sin ventaja | APROBADO | S1 0.0 %, S2 0.0 %, S5 0.0 % |
| Buena o sólida ≤ 2 % en cada escenario sin ventaja | APROBADO | S1 0.0 %, S2 0.0 %, S5 0.0 % |
| Potencia ≥ 80 % | APROBADO | 92.7 % de 41 |
| Elección: mediana de Orometra ≤ B1 primera fila MT5 | APROBADO | 0.247 frente a 0.333 |
| Elección: mediana de Orometra ≤ B2 mejor en forward | APROBADO | 0.247 frente a 0.342 |
| Elección: mediana de Orometra ≤ B3 puesto IS+forward | APROBADO | 0.247 frente a 0.259 |
| Elección: mediana de Orometra ≤ B4 media con vecinas | **SUSPENDIDO** | 0.247 frente a 0.229 |
| Elección: mediana de Orometra ≤ B5 al azar entre las que pasan | APROBADO | 0.247 frente a 0.556 |
| Elección: en ningún escenario más de 0,10 peor que B1 | APROBADO | S3 -0.090, S4 -0.336, S6 -0.070, S7 -0.070, S8 +0.097 |
| Coherencia: insuficiente/débil < moderada ≤ buena ≤ sólida | APROBADO | insufficient —, weak 0.073, moderate 0.195, good 0.233, strong 0.256 |
