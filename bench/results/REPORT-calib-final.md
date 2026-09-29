# Resultados del banco de pruebas: calibración (calib-final)

Casos: 800 · errores del motor: 0 · fallos del banco: 0

## 1. Falsos positivos (grupo sin ventaja: S1, S2, S5)

| Escenario | Casos | Moderada o sólida | Sólida | Niveles |
|---|---|---|---|---|
| S1 | 100 | 0.0 % | 0.0 % | weak 57, insufficient 43 |
| S2 | 100 | 2.0 % | 0.0 % | insufficient 31, weak 67, moderate 2 |
| S5 | 100 | 10.0 % | 0.0 % | weak 88, moderate 10, insufficient 2 |
| **Total** | 300 | **4.0 %** | **0.0 %** | |

## 2. Potencia (S3 con ventaja clara: Sharpe por operación ≥ 0,25 y ≥ 150 operaciones)

Casos: 41 · detectados como moderada o sólida: **97.6 %**

## 3. Elección: arrepentimiento normalizado (0 = perfecto, 1 = como elegir la mediana)

Orometra cuenta con 1 cuando no propone meseta (lo más exigente).

| Método | S3 | S4 | S6 | S7 | S8 | **Todos** |
|---|---|---|---|---|---|---|
| Orometra | 0.200 | 0.188 | 0.235 | 0.230 | 0.419 | **0.244** |
| B1 primera fila MT5 | 0.303 | 0.514 | 0.305 | 0.300 | 0.323 | **0.333** |
| B2 mejor en forward | 0.361 | 0.322 | 0.418 | 0.269 | 0.328 | **0.342** |
| B3 puesto IS+forward | 0.264 | 0.211 | 0.330 | 0.254 | 0.254 | **0.259** |
| B4 media con vecinas | 0.190 | 0.190 | 0.186 | 0.238 | 0.274 | **0.229** |
| B5 al azar entre las que pasan | 0.561 | 0.503 | 0.499 | 0.469 | 0.643 | **0.556** |

Abstención de Orometra (no propone meseta): S3 23.0 % · S4 22.0 % · S6 26.0 % · S7 22.0 % · S8 36.0 %

Arrepentimiento de Orometra solo cuando propone: S3 0.129 · S4 0.114 · S6 0.153 · S7 0.154 · S8 0.185

Con sugerencia orientativa cuando no hay meseta (informativo, fuera de los criterios): S3 0.173 · S4 0.132 · S6 0.168 · S7 0.183 · S8 0.272 · **Todos 0.177**

## 4. Coherencia: ventaja real media de la configuración elegida, por nivel

| Nivel | Casos con elección | Ventaja real media (σ por operación) |
|---|---|---|
| insufficient | 0 | — |
| weak | 168 | 0.063 |
| moderate | 296 | 0.194 |
| strong | 0 | — |

Tiempo del motor: mediana 69.5 ms, máximo 515 ms.

## Criterios del prerregistro

| Criterio | Resultado | Valor |
|---|---|---|
| Falsos positivos ≤ 5 % (moderada o sólida) | APROBADO | 4.0 % |
| Falsos positivos ≤ 1 % (sólida) | APROBADO | 0.0 % |
| Potencia ≥ 80 % | APROBADO | 97.6 % de 41 |
| Elección: mediana de Orometra ≤ B1 primera fila MT5 | APROBADO | 0.244 frente a 0.333 |
| Elección: mediana de Orometra ≤ B2 mejor en forward | APROBADO | 0.244 frente a 0.342 |
| Elección: mediana de Orometra ≤ B3 puesto IS+forward | APROBADO | 0.244 frente a 0.259 |
| Elección: mediana de Orometra ≤ B4 media con vecinas | **SUSPENDIDO** | 0.244 frente a 0.229 |
| Elección: mediana de Orometra ≤ B5 al azar entre las que pasan | APROBADO | 0.244 frente a 0.556 |
| Elección: en ningún escenario más de 0,10 peor que B1 | APROBADO | S3 -0.102, S4 -0.326, S6 -0.070, S7 -0.070, S8 +0.096 |
| Coherencia: insuficiente/débil < moderada ≤ sólida | APROBADO | insufficient —, weak 0.063, moderate 0.194, strong — |
