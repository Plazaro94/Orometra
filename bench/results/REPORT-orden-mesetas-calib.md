# Orden entre mesetas: R0, R1 y R2 (calib)

Criterios prerregistrados en `bench/PREREGISTRO.md` (2026-10-14 (b) y (c)). Arrepentimiento
normalizado del §5 (1 si no propone meseta). Mediana por escenario.

| Regla | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | S10 |
|---|---|---|---|---|---|---|---|---|---|---|
| R0 | 1.000 | 1.000 | 0.212 | 0.178 | 1.000 | 0.235 | 0.230 | 0.420 | 0.187 | 1.000 |
| R1 | 1.000 | 1.000 | 0.212 | 0.174 | 1.000 | 0.254 | 0.235 | 0.420 | 0.193 | 1.000 |
| R2 | 1.000 | 1.000 | 0.212 | 0.174 | 1.000 | 0.254 | 0.235 | 0.420 | 0.173 | 1.000 |

| «Moderada o más» | S1 | S2 | S5 | S10 |
|---|---|---|---|---|
| R0 | 0.0 % | 1.0 % | 3.0 % | 0.0 % |
| R1 | 0.0 % | 1.0 % | 3.0 % | 0.0 % |
| R2 | 0.0 % | 1.0 % | 3.0 % | 0.0 % |

- R1 en S9: cambia la elegida en 16 de 100 casos (mejor en el no visto 8, peor 8).
- R1 en S10: cambia la elegida en 0 de 100 casos (mejor en el no visto 0, peor 0).
- R2 en S9: cambia la elegida en 15 de 100 casos (mejor en el no visto 8, peor 7).
- R2 en S10: cambia la elegida en 0 de 100 casos (mejor en el no visto 0, peor 0).

## Criterios

### R1

- (a) S9: 0.193 frente a 0.187 de R0 (hace falta ≤ 0.167): **no cumple**
- (b) S1-S8, la peor diferencia con R0: S6 +0.019 (máximo +0,010): **no cumple**
- (c) falsos positivos: S1 0.0 %, S2 1.0 %, S5 3.0 %, S10 0.0 %: **cumple**
- (d) criterios del §6 que R0 aprueba y R1 no: ninguno: **cumple**

### R2

- (a) S9: 0.173 frente a 0.187 de R0 (hace falta ≤ 0.167): **no cumple**
- (b) S1-S8, la peor diferencia con R0: S6 +0.019 (máximo +0,010): **no cumple**
- (c) falsos positivos: S1 0.0 %, S2 1.0 %, S5 3.0 %, S10 0.0 %: **cumple**
- (d) criterios del §6 que R0 aprueba y R2 no: ninguno: **cumple**

**Resultado:** ninguna regla cumple los cuatro criterios; se queda **R0**.
