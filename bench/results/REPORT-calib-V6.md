# Resultados del banco de pruebas: calibración (calib-V6)

Casos: 800 · errores del motor: 0 · fallos del banco: 0

## 1. Falsos positivos (grupo sin ventaja: S1, S2, S5)

| Escenario | Casos | Moderada o sólida | Sólida | Niveles |
|---|---|---|---|---|
| S1 | 100 | 0.0 % | 0.0 % | weak 58, insufficient 42 |
| S2 | 100 | 2.0 % | 0.0 % | insufficient 26, weak 72, moderate 2 |
| S5 | 100 | 12.0 % | 0.0 % | weak 86, moderate 12, insufficient 2 |
| **Total** | 300 | **4.7 %** | **0.0 %** | |

## 2. Potencia (S3 con ventaja clara: Sharpe por operación ≥ 0,25 y ≥ 150 operaciones)

Casos: 41 · detectados como moderada o sólida: **97.6 %**

## 3. Elección: arrepentimiento normalizado (0 = perfecto, 1 = como elegir la mediana)

Orometra cuenta con 1 cuando no propone meseta (lo más exigente).

| Método | S3 | S4 | S6 | S7 | S8 | **Todos** |
|---|---|---|---|---|---|---|
| Orometra | 0.214 | 0.220 | 0.181 | 0.308 | 0.491 | **0.292** |
| B1 primera fila MT5 | 0.303 | 0.514 | 0.305 | 0.300 | 0.323 | **0.333** |
| B2 mejor en forward | 0.361 | 0.322 | 0.418 | 0.269 | 0.328 | **0.342** |
| B3 puesto IS+forward | 0.264 | 0.211 | 0.330 | 0.254 | 0.254 | **0.259** |
| B4 media con vecinas | 0.190 | 0.190 | 0.186 | 0.238 | 0.274 | **0.229** |
| B5 al azar entre las que pasan | 0.561 | 0.503 | 0.499 | 0.469 | 0.643 | **0.556** |

Abstención de Orometra (no propone meseta): S3 21.0 % · S4 21.0 % · S6 23.0 % · S7 20.0 % · S8 29.0 %

Arrepentimiento de Orometra solo cuando propone: S3 0.174 · S4 0.141 · S6 0.126 · S7 0.225 · S8 0.304

## 4. Coherencia: ventaja real media de la configuración elegida, por nivel

| Nivel | Casos con elección | Ventaja real media (σ por operación) |
|---|---|---|
| insufficient | 0 | — |
| weak | 170 | 0.061 |
| moderate | 312 | 0.180 |
| strong | 0 | — |

Tiempo del motor: mediana 73 ms, máximo 542 ms.

## Criterios del prerregistro

| Criterio | Resultado | Valor |
|---|---|---|
| Falsos positivos ≤ 5 % (moderada o sólida) | APROBADO | 4.7 % |
| Falsos positivos ≤ 1 % (sólida) | APROBADO | 0.0 % |
| Potencia ≥ 80 % | APROBADO | 97.6 % de 41 |
| Elección: mediana de Orometra ≤ B1 primera fila MT5 | APROBADO | 0.292 frente a 0.333 |
| Elección: mediana de Orometra ≤ B2 mejor en forward | APROBADO | 0.292 frente a 0.342 |
| Elección: mediana de Orometra ≤ B3 puesto IS+forward | **SUSPENDIDO** | 0.292 frente a 0.259 |
| Elección: mediana de Orometra ≤ B4 media con vecinas | **SUSPENDIDO** | 0.292 frente a 0.229 |
| Elección: mediana de Orometra ≤ B5 al azar entre las que pasan | APROBADO | 0.292 frente a 0.556 |
| Elección: en ningún escenario más de 0,10 peor que B1 | **SUSPENDIDO** | S3 -0.089, S4 -0.294, S6 -0.125, S7 +0.008, S8 +0.168 |
| Coherencia: insuficiente/débil < moderada ≤ sólida | APROBADO | insufficient —, weak 0.061, moderate 0.180, strong — |
