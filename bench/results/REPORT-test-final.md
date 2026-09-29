# Resultados del banco de pruebas: examen (test-final)

Casos: 800 · errores del motor: 0 · fallos del banco: 0

## 1. Falsos positivos (grupo sin ventaja: S1, S2, S5)

| Escenario | Casos | Moderada o sólida | Sólida | Niveles |
|---|---|---|---|---|
| S1 | 100 | 0.0 % | 0.0 % | insufficient 37, weak 63 |
| S2 | 100 | 0.0 % | 0.0 % | weak 73, insufficient 27 |
| S5 | 100 | 14.0 % | 0.0 % | moderate 14, weak 86 |
| **Total** | 300 | **4.7 %** | **0.0 %** | |

## 2. Potencia (S3 con ventaja clara: Sharpe por operación ≥ 0,25 y ≥ 150 operaciones)

Casos: 34 · detectados como moderada o sólida: **85.3 %**

## 3. Elección: arrepentimiento normalizado (0 = perfecto, 1 = como elegir la mediana)

Orometra cuenta con 1 cuando no propone meseta (lo más exigente).

| Método | S3 | S4 | S6 | S7 | S8 | **Todos** |
|---|---|---|---|---|---|---|
| Orometra | 0.211 | 0.167 | 0.233 | 0.231 | 0.432 | **0.234** |
| B1 primera fila MT5 | 0.298 | 0.478 | 0.312 | 0.258 | 0.367 | **0.341** |
| B2 mejor en forward | 0.307 | 0.296 | 0.535 | 0.230 | 0.460 | **0.347** |
| B3 puesto IS+forward | 0.228 | 0.227 | 0.313 | 0.213 | 0.353 | **0.249** |
| B4 media con vecinas | 0.198 | 0.203 | 0.193 | 0.223 | 0.249 | **0.216** |
| B5 al azar entre las que pasan | 0.386 | 0.554 | 0.540 | 0.474 | 0.636 | **0.521** |

Abstención de Orometra (no propone meseta): S3 22.0 % · S4 19.0 % · S6 30.0 % · S7 25.0 % · S8 32.0 %

Arrepentimiento de Orometra solo cuando propone: S3 0.141 · S4 0.145 · S6 0.115 · S7 0.196 · S8 0.210

Con sugerencia orientativa cuando no hay meseta (informativo, fuera de los criterios): S3 0.171 · S4 0.160 · S6 0.163 · S7 0.200 · S8 0.245 · **Todos 0.190**

## 4. Coherencia: ventaja real media de la configuración elegida, por nivel

| Nivel | Casos con elección | Ventaja real media (σ por operación) |
|---|---|---|
| insufficient | 0 | — |
| weak | 146 | 0.066 |
| moderate | 311 | 0.185 |
| strong | 0 | — |

Tiempo del motor: mediana 76 ms, máximo 545 ms.

## Criterios del prerregistro

| Criterio | Resultado | Valor |
|---|---|---|
| Falsos positivos ≤ 5 % (moderada o sólida) | APROBADO | 4.7 % |
| Falsos positivos ≤ 1 % (sólida) | APROBADO | 0.0 % |
| Potencia ≥ 80 % | APROBADO | 85.3 % de 34 |
| Elección: mediana de Orometra ≤ B1 primera fila MT5 | APROBADO | 0.234 frente a 0.341 |
| Elección: mediana de Orometra ≤ B2 mejor en forward | APROBADO | 0.234 frente a 0.347 |
| Elección: mediana de Orometra ≤ B3 puesto IS+forward | APROBADO | 0.234 frente a 0.249 |
| Elección: mediana de Orometra ≤ B4 media con vecinas | **SUSPENDIDO** | 0.234 frente a 0.216 |
| Elección: mediana de Orometra ≤ B5 al azar entre las que pasan | APROBADO | 0.234 frente a 0.521 |
| Elección: en ningún escenario más de 0,10 peor que B1 | APROBADO | S3 -0.087, S4 -0.312, S6 -0.079, S7 -0.027, S8 +0.065 |
| Coherencia: insuficiente/débil < moderada ≤ sólida | APROBADO | insufficient —, weak 0.066, moderate 0.185, strong — |
