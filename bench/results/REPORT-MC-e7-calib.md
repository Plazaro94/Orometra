# Banco del Monte Carlo, enmienda 7: MC-e7-calib

Generado por `node bench/montecarlo-e7.js` el 2026-10-15. Prerregistro: `bench/PREREGISTRO-MONTECARLO.md`, enmienda 7. M2bc, k = 100, 500 casos por celda (primer caso 1), 2000 simulaciones por caso. Reglas de aptitud: las de las enmiendas 4 y 5.

## Rechazo de las dos puertas (media de las celdas)

| Variante | G1 | G2 | G3a | G3b | G4 | G5 | G5b | G6 | G6b | G7 | G11 | G12 | G2, G6, G6b y G12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| V0 | 10.0 % | 10.5 % | 93.5 % | 79.5 % | 84.0 % | 10.8 % | 11.5 % | 15.4 % | 15.0 % | 9.8 % | 10.2 % | 12.5 % | 13.4 % |
| V1 | 10.1 % | 9.6 % | 93.5 % | 79.4 % | 81.0 % | 8.9 % | 10.7 % | 13.4 % | 13.1 % | 10.2 % | 10.5 % | 9.1 % | 11.5 % |
| V2 | 10.1 % | 9.8 % | 93.5 % | 79.3 % | 68.6 % | 8.9 % | 8.6 % | 12.7 % | 12.0 % | 10.3 % | 10.4 % | 10.0 % | 11.3 % |

Límite (enmienda 5 d): como mucho un 20 % en G1, G2, G5, G5b, G6, G6b, G7, G11, G12.

## Veredicto por variante y m

| Variante | m | H = 63 | H = 126 | H = 252 |
|---|---|---|---|---|
| V0 | 0 | apto desde n = 252 | apto desde n = 504 | no apto |
| V0 | 10 | apto desde n = 252 | apto desde n = 504 | no apto |
| V0 | 15 | apto desde n = 252 | apto desde n = 504 | no apto |
| V0 | 20 | apto desde n = 252 | apto desde n = 504 | no apto |
| V1 | 0 | apto desde n = 252 | apto desde n = 252 | apto desde n = 1008 |
| V1 | 10 | apto desde n = 252 | apto desde n = 252 | apto desde n = 1008 |
| V1 | 15 | apto desde n = 252 | apto desde n = 252 | apto desde n = 1008 |
| V1 | 20 | apto desde n = 252 | apto desde n = 252 | apto desde n = 1008 |
| V2 | 0 | apto desde n = 252 | apto desde n = 252 | no apto |
| V2 | 10 | apto desde n = 252 | apto desde n = 252 | no apto |
| V2 | 15 | apto desde n = 252 | apto desde n = 252 | no apto |
| V2 | 20 | apto desde n = 252 | apto desde n = 252 | no apto |

## Elección (enmienda 7 e)

- V0: rechazo medio en G2, G6, G6b y G12 13.4 %; con m = 0, apto desde n = 252 | apto desde n = 504 | no apto; no cumple las condiciones.
- V1: rechazo medio en G2, G6, G6b y G12 11.5 %; con m = 0, apto desde n = 252 | apto desde n = 252 | apto desde n = 1008; no cumple las condiciones (rechazo > 20 % en 1 celdas).
- V2: rechazo medio en G2, G6, G6b y G12 11.3 %; con m = 0, apto desde n = 252 | apto desde n = 252 | no apto; no cumple las condiciones.

**Variante elegida: V0.** **m elegida: 0.**
- V0 con m = 0: apto desde n = 252 | apto desde n = 504 | no apto
- V0 con m = 10: apto desde n = 252 | apto desde n = 504 | no apto
- V0 con m = 15: apto desde n = 252 | apto desde n = 504 | no apto
- V0 con m = 20: apto desde n = 252 | apto desde n = 504 | no apto

### Lo que suspende con V0 y m = 0

- Conjunto G3a, H = 63, n ≥ 126 (622 casos): fuera 17.8 % (p = 2.68e-9)
- Celda G3a μ 0.05 n 126 H 63: PIT drawdown 4.4 · 5.4 · 9.4 · 10.8 · 5.4 · 7.9 · 9.4 · 10.8 · 12.8 · 23.6 (p = 9.48e-9)
- Conjunto G3a, H = 63, n ≥ 126 (622 casos): PIT drawdown 8.5 · 7.2 · 8.2 · 9.8 · 7.9 · 10.0 · 11.3 · 8.5 · 10.5 · 18.2 (p = 1.27e-8)
- Conjunto G3a, H = 63, n ≥ 126 (622 casos): DD>p95 10.1 % (p = 1.68e-7)
- Celda G3a μ 0.05 n 126 H 63: DD>p95 13.3 % (p = 4.00e-6)
- Conjunto G5b, H = 252, n ≥ 504 (712 casos): DD>p50 41.7 % (p = 1.11e-5)
- Conjunto G5b, H = 252, n ≥ 1008 (712 casos): DD>p50 41.7 % (p = 1.11e-5)
- Conjunto G4, H = 126, n ≥ 252 (466 casos): PIT drawdown 7.1 · 6.0 · 7.5 · 11.4 · 10.3 · 9.9 · 9.0 · 9.9 · 12.7 · 16.3 (p = 2.13e-5)

## Se informa (h): casos que marca cada detector, antes de las puertas

| Proceso | V0 | V1 | V2 |
|---|---|---|---|
| G1 | 5.1 % | 5.3 % | 5.2 % |
| G2 | 6.3 % | 5.3 % | 5.5 % |
| G3a | 24.9 % | 20.3 % | 12.1 % |
| G3b | 9.1 % | 8.1 % | 6.3 % |
| G4 | 83.1 % | 80.0 % | 66.8 % |
| G5 | 7.4 % | 5.4 % | 5.4 % |
| G5b | 7.9 % | 7.1 % | 5.1 % |
| G6 | 7.7 % | 6.0 % | 5.7 % |
| G6b | 7.5 % | 5.8 % | 5.0 % |
| G7 | 4.8 % | 5.2 % | 5.4 % |
| G11 | 5.3 % | 5.6 % | 5.5 % |
| G12 | 8.3 % | 5.0 % | 5.7 % |
