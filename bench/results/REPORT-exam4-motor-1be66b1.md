# Resultados del banco de pruebas: cuarto examen (ciego) (exam4-motor-1be66b1)

Casos: 800 · errores del motor: 0 · fallos del banco: 0

## 1. Falsos positivos (grupo sin ventaja: S1, S2, S5)

| Escenario | Casos | Moderada o más | Buena o sólida | Sólida | Niveles |
|---|---|---|---|---|---|
| S1 | 100 | 0.0 % | 0.0 % | 0.0 % | weak 62, insufficient 38 |
| S2 | 100 | 1.0 % | 0.0 % | 0.0 % | weak 67, insufficient 32, moderate 1 |
| S5 | 100 | 7.0 % | 0.0 % | 0.0 % | weak 89, moderate 7, insufficient 4 |
| **Total** | 300 | **2.7 %** | **0.0 %** | **0.0 %** | |

## 2. Potencia (S3 con ventaja clara: Sharpe por operación ≥ 0,25 y ≥ 150 operaciones)

Casos: 40 · detectados como moderada o más: **90.0 %** · buena o sólida: 0.0 % · sólida: 0.0 %

## 3. Elección: arrepentimiento normalizado (0 = perfecto, 1 = como elegir la mediana)

Orometra cuenta con 1 cuando no propone meseta (lo más exigente).

| Método | S3 | S4 | S6 | S7 | S8 | **Todos** |
|---|---|---|---|---|---|---|
| Orometra | 0.101 | 0.231 | 0.182 | 0.352 | 0.335 | **0.227** |
| B1 primera fila MT5 | 0.245 | 0.405 | 0.259 | 0.293 | 0.270 | **0.288** |
| B2 mejor en forward | 0.238 | 0.352 | 0.477 | 0.212 | 0.428 | **0.327** |
| B3 puesto IS+forward | 0.215 | 0.239 | 0.326 | 0.201 | 0.294 | **0.248** |
| B4 media con vecinas | 0.185 | 0.211 | 0.171 | 0.229 | 0.164 | **0.192** |
| B5 al azar entre las que pasan | 0.448 | 0.505 | 0.490 | 0.407 | 0.677 | **0.501** |

Abstención de Orometra (no propone meseta): S3 16.0 % · S4 26.0 % · S6 20.0 % · S7 38.0 % · S8 23.0 %

Arrepentimiento de Orometra solo cuando propone: S3 0.084 · S4 0.130 · S6 0.123 · S7 0.144 · S8 0.224

Con sugerencia orientativa cuando no hay meseta (informativo, fuera de los criterios): S3 0.095 · S4 0.146 · S6 0.162 · S7 0.187 · S8 0.229 · **Todos 0.157**

## 4. Coherencia: ventaja real media de la configuración elegida, por nivel

| Nivel | Casos con elección | Ventaja real media (σ por operación) |
|---|---|---|
| insufficient | 0 | — |
| weak | 211 | 0.081 |
| moderate | 253 | 0.193 |
| good | 0 | — |
| strong | 0 | — |

Reparto de niveles en el grupo con ventaja:

| Escenario | Débil o menos | Moderada | Buena | Sólida |
|---|---|---|---|---|
| S3 | 34.0 % | 66.0 % | 0.0 % | 0.0 % |
| S4 | 40.0 % | 60.0 % | 0.0 % | 0.0 % |
| S6 | 63.0 % | 37.0 % | 0.0 % | 0.0 % |
| S7 | 59.0 % | 41.0 % | 0.0 % | 0.0 % |
| S8 | 59.0 % | 41.0 % | 0.0 % | 0.0 % |

Tiempo del motor: mediana 173.5 ms, máximo 869 ms.

## Criterios del prerregistro

| Criterio | Resultado | Valor |
|---|---|---|
| Falsos positivos ≤ 5 % (moderada o más) | APROBADO | 2.7 % |
| Falsos positivos ≤ 5 % en cada escenario sin ventaja | **SUSPENDIDO** | S1 0.0 %, S2 1.0 %, S5 7.0 % |
| Falsos positivos ≤ 1 % (sólida) | APROBADO | 0.0 % |
| Sólida ≤ 1 % en cada escenario sin ventaja | APROBADO | S1 0.0 %, S2 0.0 %, S5 0.0 % |
| Buena o sólida ≤ 2 % en cada escenario sin ventaja | APROBADO | S1 0.0 %, S2 0.0 %, S5 0.0 % |
| Potencia ≥ 80 % | APROBADO | 90.0 % de 40 |
| Elección: mediana de Orometra ≤ B1 primera fila MT5 | APROBADO | 0.227 frente a 0.288 |
| Elección: mediana de Orometra ≤ B2 mejor en forward | APROBADO | 0.227 frente a 0.327 |
| Elección: mediana de Orometra ≤ B3 puesto IS+forward | APROBADO | 0.227 frente a 0.248 |
| Elección: mediana de Orometra ≤ B4 media con vecinas | **SUSPENDIDO** | 0.227 frente a 0.192 |
| Elección: mediana de Orometra ≤ B5 al azar entre las que pasan | APROBADO | 0.227 frente a 0.501 |
| Elección: en ningún escenario más de 0,10 peor que B1 | APROBADO | S3 -0.144, S4 -0.174, S6 -0.078, S7 +0.059, S8 +0.065 |
| Coherencia: insuficiente/débil < moderada ≤ buena ≤ sólida | APROBADO | insufficient —, weak 0.081, moderate 0.193, good —, strong — |
