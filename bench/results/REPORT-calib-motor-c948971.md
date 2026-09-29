# Resultados del banco de pruebas: calibración (semillas 1-40)

Casos: 320 · errores del motor: 0 · fallos del banco: 0

## 1. Falsos positivos (grupo sin ventaja: S1, S2, S5)

| Escenario | Casos | Moderada o sólida | Sólida | Niveles |
|---|---|---|---|---|
| S1 | 40 | 0.0 % | 0.0 % | weak 22, insufficient 18 |
| S2 | 40 | 0.0 % | 0.0 % | insufficient 13, weak 27 |
| S5 | 40 | 2.5 % | 0.0 % | weak 39, moderate 1 |
| **Total** | 120 | **0.8 %** | **0.0 %** | |

## 2. Potencia (S3 con ventaja clara: Sharpe por operación ≥ 0,25 y ≥ 150 operaciones)

Casos: 17 · detectados como moderada o sólida: **88.2 %**

## 3. Elección: arrepentimiento normalizado (0 = perfecto, 1 = como elegir la mediana)

Orometra cuenta con 1 cuando no propone meseta (lo más exigente).

| Método | S3 | S4 | S6 | S7 | S8 | **Todos** |
|---|---|---|---|---|---|---|
| Orometra | 0.318 | 0.411 | 0.479 | 0.400 | 1.000 | **0.454** |
| B1 primera fila MT5 | 0.267 | 0.584 | 0.269 | 0.303 | 0.347 | **0.339** |
| B2 mejor en forward | 0.346 | 0.234 | 0.395 | 0.290 | 0.311 | **0.329** |
| B3 puesto IS+forward | 0.277 | 0.241 | 0.318 | 0.285 | 0.246 | **0.271** |
| B4 media con vecinas | 0.174 | 0.278 | 0.194 | 0.242 | 0.410 | **0.262** |
| B5 al azar entre las que pasan | 0.562 | 0.634 | 0.473 | 0.654 | 0.685 | **0.623** |

Abstención de Orometra (no propone meseta): S3 25.0 % · S4 22.5 % · S6 32.5 % · S7 25.0 % · S8 47.5 %

Arrepentimiento de Orometra solo cuando propone: S3 0.214 · S4 0.310 · S6 0.153 · S7 0.252 · S8 0.293

## 4. Coherencia: ventaja real media de la configuración elegida, por nivel

| Nivel | Casos con elección | Ventaja real media (σ por operación) |
|---|---|---|
| insufficient | 0 | — |
| weak | 111 | 0.100 |
| moderate | 59 | 0.205 |
| strong | 0 | — |

Tiempo del motor: mediana 58.5 ms, máximo 471 ms.

## Criterios del prerregistro

| Criterio | Resultado | Valor |
|---|---|---|
| Falsos positivos ≤ 5 % (moderada o sólida) | APROBADO | 0.8 % |
| Falsos positivos ≤ 1 % (sólida) | APROBADO | 0.0 % |
| Potencia ≥ 80 % | APROBADO | 88.2 % de 17 |
| Elección: mediana de Orometra ≤ B1 primera fila MT5 | **SUSPENDIDO** | 0.454 frente a 0.339 |
| Elección: mediana de Orometra ≤ B2 mejor en forward | **SUSPENDIDO** | 0.454 frente a 0.329 |
| Elección: mediana de Orometra ≤ B3 puesto IS+forward | **SUSPENDIDO** | 0.454 frente a 0.271 |
| Elección: mediana de Orometra ≤ B4 media con vecinas | **SUSPENDIDO** | 0.454 frente a 0.262 |
| Elección: mediana de Orometra ≤ B5 al azar entre las que pasan | APROBADO | 0.454 frente a 0.623 |
| Elección: en ningún escenario más de 0,10 peor que B1 | **SUSPENDIDO** | S3 +0.052, S4 -0.172, S6 +0.211, S7 +0.097, S8 +0.653 |
| Coherencia: insuficiente/débil < moderada ≤ sólida | APROBADO | insufficient —, weak 0.100, moderate 0.205, strong — |
