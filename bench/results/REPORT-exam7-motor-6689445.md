# Resultados del banco de pruebas: séptimo examen (ciego) (exam7-motor-6689445)

Casos: 800 · errores del motor: 0 · fallos del banco: 0

## 1. Falsos positivos (grupo sin ventaja: S1, S2, S5)

| Escenario | Casos | Moderada o más | Buena o sólida | Sólida | Niveles |
|---|---|---|---|---|---|
| S1 | 100 | 0.0 % | 0.0 % | 0.0 % | insufficient 37, weak 63 |
| S2 | 100 | 0.0 % | 0.0 % | 0.0 % | weak 69, insufficient 31 |
| S5 | 100 | 2.0 % | 1.0 % | 0.0 % | weak 98, good 1, moderate 1 |
| **Total** | 300 | **0.7 %** | **0.3 %** | **0.0 %** | |

## 2. Potencia (S3 con ventaja clara: Sharpe por operación ≥ 0,25 y ≥ 150 operaciones)

Casos: 38 · detectados como moderada o más: **89.5 %** · buena o sólida: 44.7 % · sólida: 15.8 %

## 3. Elección: arrepentimiento normalizado (0 = perfecto, 1 = como elegir la mediana)

Orometra cuenta con 1 cuando no propone meseta (lo más exigente).

| Método | S3 | S4 | S6 | S7 | S8 | **Todos** |
|---|---|---|---|---|---|---|
| Orometra | 0.167 | 0.125 | 0.162 | 0.254 | 0.350 | **0.213** |
| B1 primera fila MT5 | 0.193 | 0.459 | 0.241 | 0.239 | 0.368 | **0.291** |
| B2 mejor en forward | 0.288 | 0.291 | 0.509 | 0.321 | 0.426 | **0.355** |
| B3 puesto IS+forward | 0.148 | 0.239 | 0.262 | 0.223 | 0.338 | **0.233** |
| B4 media con vecinas | 0.158 | 0.227 | 0.161 | 0.264 | 0.256 | **0.211** |
| B5 al azar entre las que pasan | 0.550 | 0.463 | 0.562 | 0.376 | 0.767 | **0.538** |

Abstención de Orometra (no propone meseta): S3 19.0 % · S4 27.0 % · S6 21.0 % · S7 26.0 % · S8 26.0 %

Arrepentimiento de Orometra solo cuando propone: S3 0.113 · S4 0.093 · S6 0.119 · S7 0.175 · S8 0.203

Con sugerencia orientativa cuando no hay meseta (informativo, fuera de los criterios): S3 0.113 · S4 0.107 · S6 0.138 · S7 0.175 · S8 0.247 · **Todos 0.146**

## 4. Coherencia: ventaja real media de la configuración elegida, por nivel

| Nivel | Casos con elección | Ventaja real media (σ por operación) |
|---|---|---|
| insufficient | 0 | — |
| weak | 218 | 0.079 |
| moderate | 172 | 0.188 |
| good | 59 | 0.217 |
| strong | 21 | 0.230 |

Reparto de niveles en el grupo con ventaja:

| Escenario | Débil o menos | Moderada | Buena | Sólida |
|---|---|---|---|---|
| S3 | 39.0 % | 34.0 % | 16.0 % | 11.0 % |
| S4 | 44.0 % | 37.0 % | 14.0 % | 5.0 % |
| S6 | 64.0 % | 29.0 % | 7.0 % | 0.0 % |
| S7 | 45.0 % | 29.0 % | 21.0 % | 5.0 % |
| S8 | 58.0 % | 42.0 % | 0.0 % | 0.0 % |

Tiempo del motor: mediana 147.5 ms, máximo 676 ms.

## Criterios del prerregistro

| Criterio | Resultado | Valor |
|---|---|---|
| Falsos positivos ≤ 5 % (moderada o más) | APROBADO | 0.7 % |
| Falsos positivos ≤ 5 % en cada escenario sin ventaja | APROBADO | S1 0.0 %, S2 0.0 %, S5 2.0 % |
| Falsos positivos ≤ 1 % (sólida) | APROBADO | 0.0 % |
| Sólida ≤ 1 % en cada escenario sin ventaja | APROBADO | S1 0.0 %, S2 0.0 %, S5 0.0 % |
| Buena o sólida ≤ 2 % en cada escenario sin ventaja | APROBADO | S1 0.0 %, S2 0.0 %, S5 1.0 % |
| Potencia ≥ 80 % | APROBADO | 89.5 % de 38 |
| Elección: mediana de Orometra ≤ B1 primera fila MT5 | APROBADO | 0.213 frente a 0.291 |
| Elección: mediana de Orometra ≤ B2 mejor en forward | APROBADO | 0.213 frente a 0.355 |
| Elección: mediana de Orometra ≤ B3 puesto IS+forward | APROBADO | 0.213 frente a 0.233 |
| Elección: mediana de Orometra ≤ B4 media con vecinas | **SUSPENDIDO** | 0.213 frente a 0.211 |
| Elección: mediana de Orometra ≤ B5 al azar entre las que pasan | APROBADO | 0.213 frente a 0.538 |
| Elección: en ningún escenario más de 0,10 peor que B1 | APROBADO | S3 -0.025, S4 -0.334, S6 -0.079, S7 +0.015, S8 -0.018 |
| Coherencia: insuficiente/débil < moderada ≤ buena ≤ sólida | APROBADO | insufficient —, weak 0.079, moderate 0.188, good 0.217, strong 0.230 |
