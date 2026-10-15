# Resultados del banco de pruebas: sexto examen (ciego) (exam6)

Casos: 800 · errores del motor: 0 · fallos del banco: 0

## 1. Falsos positivos (grupo sin ventaja: S1, S2, S5)

| Escenario | Casos | Moderada o más | Buena o sólida | Sólida | Niveles |
|---|---|---|---|---|---|
| S1 | 100 | 0.0 % | 0.0 % | 0.0 % | insufficient 37, weak 63 |
| S2 | 100 | 1.0 % | 0.0 % | 0.0 % | insufficient 25, weak 74, moderate 1 |
| S5 | 100 | 3.0 % | 1.0 % | 1.0 % | weak 96, moderate 2, insufficient 1, strong 1 |
| **Total** | 300 | **1.3 %** | **0.3 %** | **0.3 %** | |

## 2. Potencia (S3 con ventaja clara: Sharpe por operación ≥ 0,25 y ≥ 150 operaciones)

Casos: 32 · detectados como moderada o más: **96.9 %** · buena o sólida: 46.9 % · sólida: 15.6 %

## 3. Elección: arrepentimiento normalizado (0 = perfecto, 1 = como elegir la mediana)

Orometra cuenta con 1 cuando no propone meseta (lo más exigente).

| Método | S3 | S4 | S6 | S7 | S8 | **Todos** |
|---|---|---|---|---|---|---|
| Orometra | 0.243 | 0.147 | 0.254 | 0.290 | 0.445 | **0.258** |
| B1 primera fila MT5 | 0.250 | 0.442 | 0.269 | 0.259 | 0.399 | **0.304** |
| B2 mejor en forward | 0.353 | 0.240 | 0.483 | 0.297 | 0.418 | **0.356** |
| B3 puesto IS+forward | 0.200 | 0.203 | 0.260 | 0.221 | 0.320 | **0.236** |
| B4 media con vecinas | 0.166 | 0.197 | 0.186 | 0.330 | 0.212 | **0.213** |
| B5 al azar entre las que pasan | 0.543 | 0.412 | 0.434 | 0.498 | 0.697 | **0.522** |

Abstención de Orometra (no propone meseta): S3 29.0 % · S4 24.0 % · S6 21.0 % · S7 33.0 % · S8 36.0 %

Arrepentimiento de Orometra solo cuando propone: S3 0.132 · S4 0.078 · S6 0.171 · S7 0.202 · S8 0.149

Con sugerencia orientativa cuando no hay meseta (informativo, fuera de los criterios): S3 0.166 · S4 0.101 · S6 0.194 · S7 0.254 · S8 0.233 · **Todos 0.191**

## 4. Coherencia: ventaja real media de la configuración elegida, por nivel

| Nivel | Casos con elección | Ventaja real media (σ por operación) |
|---|---|---|
| insufficient | 0 | — |
| weak | 221 | 0.077 |
| moderate | 137 | 0.190 |
| good | 58 | 0.238 |
| strong | 28 | 0.239 |

Reparto de niveles en el grupo con ventaja:

| Escenario | Débil o menos | Moderada | Buena | Sólida |
|---|---|---|---|---|
| S3 | 40.0 % | 35.0 % | 15.0 % | 10.0 % |
| S4 | 39.0 % | 32.0 % | 22.0 % | 7.0 % |
| S6 | 79.0 % | 13.0 % | 7.0 % | 1.0 % |
| S7 | 52.0 % | 26.0 % | 13.0 % | 9.0 % |
| S8 | 71.0 % | 28.0 % | 1.0 % | 0.0 % |

Tiempo del motor: mediana 129 ms, máximo 609 ms.

## Criterios del prerregistro

| Criterio | Resultado | Valor |
|---|---|---|
| Falsos positivos ≤ 5 % (moderada o más) | APROBADO | 1.3 % |
| Falsos positivos ≤ 5 % en cada escenario sin ventaja | APROBADO | S1 0.0 %, S2 1.0 %, S5 3.0 % |
| Falsos positivos ≤ 1 % (sólida) | APROBADO | 0.3 % |
| Sólida ≤ 1 % en cada escenario sin ventaja | APROBADO | S1 0.0 %, S2 0.0 %, S5 1.0 % |
| Buena o sólida ≤ 2 % en cada escenario sin ventaja | APROBADO | S1 0.0 %, S2 0.0 %, S5 1.0 % |
| Potencia ≥ 80 % | APROBADO | 96.9 % de 32 |
| Elección: mediana de Orometra ≤ B1 primera fila MT5 | APROBADO | 0.258 frente a 0.304 |
| Elección: mediana de Orometra ≤ B2 mejor en forward | APROBADO | 0.258 frente a 0.356 |
| Elección: mediana de Orometra ≤ B3 puesto IS+forward | **SUSPENDIDO** | 0.258 frente a 0.236 |
| Elección: mediana de Orometra ≤ B4 media con vecinas | **SUSPENDIDO** | 0.258 frente a 0.213 |
| Elección: mediana de Orometra ≤ B5 al azar entre las que pasan | APROBADO | 0.258 frente a 0.522 |
| Elección: en ningún escenario más de 0,10 peor que B1 | APROBADO | S3 -0.007, S4 -0.294, S6 -0.015, S7 +0.032, S8 +0.046 |
| Coherencia: insuficiente/débil < moderada ≤ buena ≤ sólida | APROBADO | insufficient —, weak 0.077, moderate 0.190, good 0.238, strong 0.239 |
