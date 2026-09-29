# Resultados del banco de pruebas: examen (semillas 1001-1040)

Casos: 320 · errores del motor: 0 · fallos del banco: 0

## 1. Falsos positivos (grupo sin ventaja: S1, S2, S5)

| Escenario | Casos | Moderada o sólida | Sólida | Niveles |
|---|---|---|---|---|
| S1 | 40 | 0.0 % | 0.0 % | insufficient 19, weak 21 |
| S2 | 40 | 0.0 % | 0.0 % | weak 33, insufficient 7 |
| S5 | 40 | 12.5 % | 0.0 % | weak 35, moderate 5 |
| **Total** | 120 | **4.2 %** | **0.0 %** | |

## 2. Potencia (S3 con ventaja clara: Sharpe por operación ≥ 0,25 y ≥ 150 operaciones)

Casos: 12 · detectados como moderada o sólida: **41.7 %**

## 3. Elección: arrepentimiento normalizado (0 = perfecto, 1 = como elegir la mediana)

Orometra cuenta con 1 cuando no propone meseta (lo más exigente).

| Método | S3 | S4 | S6 | S7 | S8 | **Todos** |
|---|---|---|---|---|---|---|
| Orometra | 0.451 | 0.249 | 0.400 | 0.533 | 0.455 | **0.416** |
| B1 primera fila MT5 | 0.340 | 0.424 | 0.360 | 0.258 | 0.312 | **0.328** |
| B2 mejor en forward | 0.307 | 0.289 | 0.512 | 0.228 | 0.435 | **0.332** |
| B3 puesto IS+forward | 0.213 | 0.272 | 0.339 | 0.200 | 0.343 | **0.257** |
| B4 media con vecinas | 0.216 | 0.158 | 0.195 | 0.187 | 0.208 | **0.192** |
| B5 al azar entre las que pasan | 0.388 | 0.539 | 0.618 | 0.508 | 0.687 | **0.539** |

Abstención de Orometra (no propone meseta): S3 32.5 % · S4 12.5 % · S6 35.0 % · S7 32.5 % · S8 25.0 %

Arrepentimiento de Orometra solo cuando propone: S3 0.249 · S4 0.212 · S6 0.206 · S7 0.229 · S8 0.281

## 4. Coherencia: ventaja real media de la configuración elegida, por nivel

| Nivel | Casos con elección | Ventaja real media (σ por operación) |
|---|---|---|
| insufficient | 0 | — |
| weak | 122 | 0.110 |
| moderate | 63 | 0.179 |
| strong | 0 | — |

Tiempo del motor: mediana 75 ms, máximo 504 ms.

## Criterios del prerregistro

| Criterio | Resultado | Valor |
|---|---|---|
| Falsos positivos ≤ 5 % (moderada o sólida) | APROBADO | 4.2 % |
| Falsos positivos ≤ 1 % (sólida) | APROBADO | 0.0 % |
| Potencia ≥ 80 % | **SUSPENDIDO** | 41.7 % de 12 |
| Elección: mediana de Orometra ≤ B1 primera fila MT5 | **SUSPENDIDO** | 0.416 frente a 0.328 |
| Elección: mediana de Orometra ≤ B2 mejor en forward | **SUSPENDIDO** | 0.416 frente a 0.332 |
| Elección: mediana de Orometra ≤ B3 puesto IS+forward | **SUSPENDIDO** | 0.416 frente a 0.257 |
| Elección: mediana de Orometra ≤ B4 media con vecinas | **SUSPENDIDO** | 0.416 frente a 0.192 |
| Elección: mediana de Orometra ≤ B5 al azar entre las que pasan | APROBADO | 0.416 frente a 0.539 |
| Elección: en ningún escenario más de 0,10 peor que B1 | **SUSPENDIDO** | S3 +0.111, S4 -0.175, S6 +0.040, S7 +0.275, S8 +0.143 |
| Coherencia: insuficiente/débil < moderada ≤ sólida | APROBADO | insufficient —, weak 0.110, moderate 0.179, strong — |
