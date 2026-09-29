# Resultados del banco de pruebas: segundo examen (ciego) (exam2)

Casos: 800 · errores del motor: 0 · fallos del banco: 0

## 1. Falsos positivos (grupo sin ventaja: S1, S2, S5)

| Escenario | Casos | Moderada o sólida | Sólida | Niveles |
|---|---|---|---|---|
| S1 | 100 | 0.0 % | 0.0 % | weak 72, insufficient 28 |
| S2 | 100 | 1.0 % | 0.0 % | weak 74, insufficient 25, moderate 1 |
| S5 | 100 | 12.0 % | 0.0 % | weak 85, moderate 12, insufficient 3 |
| **Total** | 300 | **4.3 %** | **0.0 %** | |

## 2. Potencia (S3 con ventaja clara: Sharpe por operación ≥ 0,25 y ≥ 150 operaciones)

Casos: 41 · detectados como moderada o sólida: **90.2 %**

## 3. Elección: arrepentimiento normalizado (0 = perfecto, 1 = como elegir la mediana)

Orometra cuenta con 1 cuando no propone meseta (lo más exigente).

| Método | S3 | S4 | S6 | S7 | S8 | **Todos** |
|---|---|---|---|---|---|---|
| Orometra | 0.120 | 0.227 | 0.155 | 0.343 | 0.386 | **0.236** |
| B1 primera fila MT5 | 0.268 | 0.462 | 0.241 | 0.275 | 0.282 | **0.297** |
| B2 mejor en forward | 0.320 | 0.254 | 0.459 | 0.313 | 0.479 | **0.357** |
| B3 puesto IS+forward | 0.186 | 0.244 | 0.258 | 0.321 | 0.365 | **0.258** |
| B4 media con vecinas | 0.152 | 0.188 | 0.159 | 0.258 | 0.208 | **0.194** |
| B5 al azar entre las que pasan | 0.533 | 0.424 | 0.471 | 0.470 | 0.644 | **0.508** |

Abstención de Orometra (no propone meseta): S3 21.0 % · S4 22.0 % · S6 21.0 % · S7 32.0 % · S8 38.0 %

Arrepentimiento de Orometra solo cuando propone: S3 0.095 · S4 0.122 · S6 0.062 · S7 0.216 · S8 0.220

Con sugerencia orientativa cuando no hay meseta (informativo, fuera de los criterios): S3 0.103 · S4 0.127 · S6 0.109 · S7 0.265 · S8 0.265 · **Todos 0.159**

## 4. Coherencia: ventaja real media de la configuración elegida, por nivel

| Nivel | Casos con elección | Ventaja real media (σ por operación) |
|---|---|---|
| insufficient | 0 | — |
| weak | 145 | 0.059 |
| moderate | 316 | 0.185 |
| strong | 0 | — |

Tiempo del motor: mediana 71 ms, máximo 512 ms.

## Criterios del prerregistro

| Criterio | Resultado | Valor |
|---|---|---|
| Falsos positivos ≤ 5 % (moderada o sólida) | APROBADO | 4.3 % |
| Falsos positivos ≤ 5 % en cada escenario sin ventaja | **SUSPENDIDO** | S1 0.0 %, S2 1.0 %, S5 12.0 % |
| Falsos positivos ≤ 1 % (sólida) | APROBADO | 0.0 % |
| Potencia ≥ 80 % | APROBADO | 90.2 % de 41 |
| Elección: mediana de Orometra ≤ B1 primera fila MT5 | APROBADO | 0.236 frente a 0.297 |
| Elección: mediana de Orometra ≤ B2 mejor en forward | APROBADO | 0.236 frente a 0.357 |
| Elección: mediana de Orometra ≤ B3 puesto IS+forward | APROBADO | 0.236 frente a 0.258 |
| Elección: mediana de Orometra ≤ B4 media con vecinas | **SUSPENDIDO** | 0.236 frente a 0.194 |
| Elección: mediana de Orometra ≤ B5 al azar entre las que pasan | APROBADO | 0.236 frente a 0.508 |
| Elección: en ningún escenario más de 0,10 peor que B1 | **SUSPENDIDO** | S3 -0.149, S4 -0.235, S6 -0.086, S7 +0.068, S8 +0.104 |
| Coherencia: insuficiente/débil < moderada ≤ sólida | APROBADO | insufficient —, weak 0.059, moderate 0.185, strong — |
