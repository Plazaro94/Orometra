# Banco del Monte Carlo: MC-calib4c

Generado por `node bench/montecarlo.js` el 2026-10-15. Prerregistro: `bench/PREREGISTRO-MONTECARLO.md` con las enmiendas 1 a 4. Casos por celda: 1000; simulaciones por caso: 2000. Solo pares con H ≤ n/2.

## Veredicto

| Método | mínimo de días con operaciones (k) | H = 63 | H = 126 | H = 252 |
|---|---|---|---|---|
| M1 | 0 | apto desde n = 1008 | no apto | apto desde n = 1008 |
| M1 | 20 | apto desde n = 1008 | no apto | apto desde n = 1008 |
| M1 | 30 | apto desde n = 1008 | no apto | apto desde n = 1008 |
| M1 | 40 | apto desde n = 1008 | no apto | apto desde n = 1008 |
| M1 | 60 | apto desde n = 504 | no apto | apto desde n = 1008 |
| M1 | 80 | apto desde n = 126 | no apto | apto desde n = 1008 |
| M1 | 100 | apto desde n = 126 | apto desde n = 1008 | apto desde n = 1008 |
| M1 | 150 | apto desde n = 126 | apto desde n = 1008 | apto desde n = 504 |
| M2b | 0 | no apto | no apto | no apto |
| M2b | 20 | no apto | no apto | no apto |
| M2b | 30 | no apto | no apto | no apto |
| M2b | 40 | no apto | no apto | no apto |
| M2b | 60 | no apto | no apto | no apto |
| M2b | 80 | apto desde n = 126 | no apto | no apto |
| M2b | 100 | apto desde n = 126 | apto desde n = 1008 | no apto |
| M2b | 150 | apto desde n = 126 | no apto | no apto |
| M2bc | 0 | apto desde n = 252 | no apto | apto desde n = 504 |
| M2bc | 20 | apto desde n = 126 | no apto | apto desde n = 504 |
| M2bc | 30 | apto desde n = 126 | no apto | apto desde n = 504 |
| M2bc | 40 | apto desde n = 126 | no apto | apto desde n = 504 |
| M2bc | 60 | apto desde n = 126 | no apto | apto desde n = 504 |
| M2bc | 80 | apto desde n = 126 | no apto | apto desde n = 504 |
| M2bc | 100 | apto desde n = 126 | apto desde n = 252 | no apto |
| M2bc | 150 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |

**Criterio de descarte** (algún método apto para H = 126 con n_min ≤ 252): no se puede evaluar con esta tanda (faltan procesos).
- M1: k elegido = 100 (el menor que da el mejor n_min con H = 126).
- M2b: k elegido = 100 (el menor que da el mejor n_min con H = 126).
- M2bc: k elegido = 100 (el menor que da el mejor n_min con H = 126).

## Puertas: casos sin cifras

Detectores de rachas y de volatilidad agrupada juntos, en % de casos; entre paréntesis, la mediana de días con operaciones de la muestra.

| Proceso | μ | 126/63 | 252/63 | 252/126 | 504/63 | 504/126 | 504/252 | 1008/63 | 1008/126 | 1008/252 |
|---|---|---|---|---|---|---|---|---|---|---|
| G5 | 0 | 7.4 (38) | 10.1 (76) | 8.8 (76) | 10.6 (151) | 11.7 (151) | 11.2 (151) | 13.0 (303) | 11.2 (302) | 11.2 (303) |
| G5 | 0.05 | 6.5 (38) | 9.3 (75) | 8.8 (75) | 10.1 (151) | 9.6 (151) | 11.8 (151) | 12.1 (301) | 10.7 (303) | 11.0 (302) |
| G5 | 0.1 | 8.3 (38) | 8.9 (76) | 10.8 (75) | 10.4 (151) | 10.3 (151) | 11.6 (151) | 11.3 (303) | 11.7 (303) | 11.1 (304) |
| G5b | 0 | 7.5 (13) | 10.5 (25) | 9.1 (25) | 10.1 (50) | 8.7 (51) | 8.9 (50) | 10.5 (100) | 10.3 (100) | 8.9 (101) |
| G5b | 0.05 | 8.0 (12) | 8.8 (25) | 9.6 (25) | 9.6 (51) | 8.7 (50) | 11.7 (51) | 10.2 (100) | 10.2 (100) | 11.8 (101) |
| G5b | 0.1 | 13.0 (13) | 14.4 (25) | 16.8 (25) | 15.6 (50) | 17.0 (50) | 17.9 (50) | 14.9 (101) | 13.7 (101) | 14.5 (101) |

## M1 con k = 100

Celdas evaluadas: 27; sin evaluar (menos de 100 casos aceptados): 27; pruebas por celda en la familia de Holm: 225.

Cobertura por celda (DD > p95 / DD > p50 / fuera de P05–P95, en %, sobre los casos que pasan las dos puertas; ideal 5 / 50 / 10). En negrita, las celdas que suspenden.

### H = 63

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G5 | 0 | 126 | 0 | — / — / — |
| G5 | 0 | 252 | 0 | — / — / — |
| G5 | 0 | 504 | 894 | 5.7 / 49.4 / 11.0 |
| G5 | 0 | 1008 | 870 | 6.1 / 49.0 / 12.1 |
| G5 | 0.05 | 126 | 0 | — / — / — |
| G5 | 0.05 | 252 | 1 | 0.0 / 0.0 / 0.0 |
| G5 | 0.05 | 504 | 899 | 5.8 / 51.7 / 10.3 |
| G5 | 0.05 | 1008 | 879 | 5.8 / 52.1 / 10.7 |
| G5 | 0.1 | 126 | 0 | — / — / — |
| G5 | 0.1 | 252 | 0 | — / — / — |
| G5 | 0.1 | 504 | 896 | 6.5 / 51.8 / 11.8 |
| G5 | 0.1 | 1008 | 887 | 5.1 / 48.9 / 11.2 |
| G5b | 0 | 126 | 0 | — / — / — |
| G5b | 0 | 252 | 0 | — / — / — |
| G5b | 0 | 504 | 0 | — / — / — |
| G5b | 0 | 1008 | 476 | 6.3 / 43.7 / 11.6 |
| G5b | 0.05 | 126 | 0 | — / — / — |
| G5b | 0.05 | 252 | 0 | — / — / — |
| G5b | 0.05 | 504 | 0 | — / — / — |
| G5b | 0.05 | 1008 | 493 | 5.7 / 45.8 / 9.7 |
| G5b | 0.1 | 126 | 0 | — / — / — |
| G5b | 0.1 | 252 | 0 | — / — / — |
| G5b | 0.1 | 504 | 0 | — / — / — |
| G5b | 0.1 | 1008 | 467 | 5.6 / 47.8 / 10.5 |

### H = 126

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G5 | 0 | 252 | 1 | 0.0 / 0.0 / 100.0 |
| G5 | 0 | 504 | 883 | 5.8 / 49.4 / 12.9 |
| G5 | 0 | 1008 | 888 | 6.0 / 51.7 / 12.2 |
| G5 | 0.05 | 252 | 1 | 0.0 / 0.0 / 0.0 |
| G5 | 0.05 | 504 | 904 | 7.5 / 52.3 / 10.8 |
| G5 | 0.05 | 1008 | 893 | 6.2 / 46.9 / 10.6 |
| G5 | 0.1 | 252 | 0 | — / — / — |
| G5 | 0.1 | 504 | 897 | **8.1 / 49.4 / 10.4** |
| G5 | 0.1 | 1008 | 883 | 5.8 / 53.3 / 10.9 |
| G5b | 0 | 252 | 0 | — / — / — |
| G5b | 0 | 504 | 0 | — / — / — |
| G5b | 0 | 1008 | 475 | 6.1 / 50.9 / 13.9 |
| G5b | 0.05 | 252 | 0 | — / — / — |
| G5b | 0.05 | 504 | 0 | — / — / — |
| G5b | 0.05 | 1008 | 472 | 5.5 / 48.3 / 10.4 |
| G5b | 0.1 | 252 | 0 | — / — / — |
| G5b | 0.1 | 504 | 0 | — / — / — |
| G5b | 0.1 | 1008 | 473 | 5.9 / 45.9 / 11.0 |

### H = 252

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G5 | 0 | 504 | 888 | 6.5 / 48.0 / 11.3 |
| G5 | 0 | 1008 | 888 | 5.6 / 51.2 / 11.5 |
| G5 | 0.05 | 504 | 882 | 6.2 / 52.2 / 11.5 |
| G5 | 0.05 | 1008 | 890 | 6.5 / 49.2 / 12.0 |
| G5 | 0.1 | 504 | 884 | 6.2 / 50.3 / 12.3 |
| G5 | 0.1 | 1008 | 889 | 6.6 / 51.2 / 11.4 |
| G5b | 0 | 504 | 0 | — / — / — |
| G5b | 0 | 1008 | 495 | 5.3 / 44.0 / 10.1 |
| G5b | 0.05 | 504 | 0 | — / — / — |
| G5b | 0.05 | 1008 | 477 | 6.1 / 45.9 / 12.4 |
| G5b | 0.1 | 504 | 0 | — / — / — |
| G5b | 0.1 | 1008 | 464 | 6.7 / 47.0 / 11.9 |

### Lo que suspende

- Conjunto G5, H = 126, n ≥ 252 (5348 casos): DD>p95 6.6 % (p = 4.96e-7)
- Conjunto G5, H = 126, n ≥ 504 (5348 casos): DD>p95 6.6 % (p = 4.96e-7)
- Celda G5 μ 0.1 n 504 H 126: DD>p95 8.1 % (p = 6.13e-5)
- Conjunto G5, H = 252, n ≥ 504 (5321 casos): fuera 11.7 % (p = 8.42e-5)

## M2b con k = 100

Celdas evaluadas: 27; sin evaluar (menos de 100 casos aceptados): 27; pruebas por celda en la familia de Holm: 225.

Cobertura por celda (DD > p95 / DD > p50 / fuera de P05–P95, en %, sobre los casos que pasan las dos puertas; ideal 5 / 50 / 10). En negrita, las celdas que suspenden.

### H = 63

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G5 | 0 | 126 | 0 | — / — / — |
| G5 | 0 | 252 | 0 | — / — / — |
| G5 | 0 | 504 | 894 | 5.9 / 50.1 / 11.7 |
| G5 | 0 | 1008 | 870 | 6.3 / 48.3 / 11.8 |
| G5 | 0.05 | 126 | 0 | — / — / — |
| G5 | 0.05 | 252 | 1 | 0.0 / 0.0 / 0.0 |
| G5 | 0.05 | 504 | 899 | 6.0 / 51.4 / 10.2 |
| G5 | 0.05 | 1008 | 879 | 5.8 / 51.4 / 10.8 |
| G5 | 0.1 | 126 | 0 | — / — / — |
| G5 | 0.1 | 252 | 0 | — / — / — |
| G5 | 0.1 | 504 | 896 | 6.5 / 51.8 / 11.2 |
| G5 | 0.1 | 1008 | 887 | 5.5 / 48.8 / 11.2 |
| G5b | 0 | 126 | 0 | — / — / — |
| G5b | 0 | 252 | 0 | — / — / — |
| G5b | 0 | 504 | 0 | — / — / — |
| G5b | 0 | 1008 | 476 | 6.5 / 43.1 / 12.0 |
| G5b | 0.05 | 126 | 0 | — / — / — |
| G5b | 0.05 | 252 | 0 | — / — / — |
| G5b | 0.05 | 504 | 0 | — / — / — |
| G5b | 0.05 | 1008 | 493 | 5.3 / 45.6 / 9.5 |
| G5b | 0.1 | 126 | 0 | — / — / — |
| G5b | 0.1 | 252 | 0 | — / — / — |
| G5b | 0.1 | 504 | 0 | — / — / — |
| G5b | 0.1 | 1008 | 467 | 5.4 / 47.8 / 11.3 |

### H = 126

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G5 | 0 | 252 | 1 | 0.0 / 0.0 / 100.0 |
| G5 | 0 | 504 | 883 | 5.9 / 49.5 / 13.6 |
| G5 | 0 | 1008 | 888 | 6.1 / 51.9 / 13.3 |
| G5 | 0.05 | 252 | 1 | 0.0 / 0.0 / 0.0 |
| G5 | 0.05 | 504 | 904 | **8.1 / 52.1 / 11.7** |
| G5 | 0.05 | 1008 | 893 | 6.3 / 47.0 / 11.4 |
| G5 | 0.1 | 252 | 0 | — / — / — |
| G5 | 0.1 | 504 | 897 | 7.8 / 49.9 / 11.3 |
| G5 | 0.1 | 1008 | 883 | 6.5 / 53.3 / 11.8 |
| G5b | 0 | 252 | 0 | — / — / — |
| G5b | 0 | 504 | 0 | — / — / — |
| G5b | 0 | 1008 | 475 | 5.7 / 49.3 / 13.9 |
| G5b | 0.05 | 252 | 0 | — / — / — |
| G5b | 0.05 | 504 | 0 | — / — / — |
| G5b | 0.05 | 1008 | 472 | 5.3 / 47.2 / 11.9 |
| G5b | 0.1 | 252 | 0 | — / — / — |
| G5b | 0.1 | 504 | 0 | — / — / — |
| G5b | 0.1 | 1008 | 473 | 6.3 / 45.9 / 11.4 |

### H = 252

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G5 | 0 | 504 | 888 | **7.2 / 48.0 / 14.3** |
| G5 | 0 | 1008 | 888 | 6.3 / 51.2 / 12.7 |
| G5 | 0.05 | 504 | 882 | 7.5 / 51.9 / 13.6 |
| G5 | 0.05 | 1008 | 890 | 6.9 / 49.3 / 12.6 |
| G5 | 0.1 | 504 | 884 | 7.2 / 49.3 / 13.6 |
| G5 | 0.1 | 1008 | 889 | 7.1 / 50.5 / 12.6 |
| G5b | 0 | 504 | 0 | — / — / — |
| G5b | 0 | 1008 | 495 | 5.7 / 43.6 / 10.7 |
| G5b | 0.05 | 504 | 0 | — / — / — |
| G5b | 0.05 | 1008 | 477 | 6.1 / 47.0 / 13.8 |
| G5b | 0.1 | 504 | 0 | — / — / — |
| G5b | 0.1 | 1008 | 464 | 7.3 / 46.3 / 12.5 |

### Lo que suspende

- Conjunto G5, H = 252, n ≥ 504 (5321 casos): fuera 13.2 % (p = 5.00e-14)
- Conjunto G5, H = 252, n ≥ 504 (5321 casos): DD>p95 7.0 % (p = 1.26e-10)
- Conjunto G5, H = 252, n ≥ 504 (5321 casos): PIT resultado d1=11.6 d10=12.3 (p = 2.08e-9)
- Conjunto G5, H = 252, n ≥ 504 (5321 casos): PIT drawdown d10=12.4 (p = 9.90e-9)
- Conjunto G5, H = 126, n ≥ 252 (5348 casos): DD>p95 6.8 % (p = 1.53e-8)
- Conjunto G5, H = 126, n ≥ 504 (5348 casos): DD>p95 6.8 % (p = 1.53e-8)
- Conjunto G5, H = 126, n ≥ 252 (5348 casos): fuera 12.2 % (p = 2.54e-7)
- Conjunto G5, H = 126, n ≥ 504 (5348 casos): fuera 12.2 % (p = 2.54e-7)
- Conjunto G5, H = 126, n ≥ 252 (5348 casos): PIT resultado d10=11.7 (p = 5.09e-7)
- Conjunto G5, H = 126, n ≥ 504 (5348 casos): PIT resultado d10=11.7 (p = 5.09e-7)
- Conjunto G5, H = 252, n ≥ 1008 (2667 casos): fuera 12.6 % (p = 1.11e-5)
- Conjunto G5b, H = 252, n ≥ 504 (1436 casos): PIT drawdown d1=11.9 d2=12.4 d9=7.2 d10=11.6 (p = 4.05e-5)
- Conjunto G5b, H = 252, n ≥ 1008 (1436 casos): PIT drawdown d1=11.9 d2=12.4 d9=7.2 d10=11.6 (p = 4.05e-5)
- Celda G5 μ 0 n 504 H 252: fuera 14.3 % (p = 5.28e-5)
- Conjunto G5, H = 252, n ≥ 1008 (2667 casos): DD>p95 6.7 % (p = 7.43e-5)
- Celda G5 μ 0.05 n 504 H 126: DD>p95 8.1 % (p = 8.88e-5)
- Conjunto G5, H = 252, n ≥ 1008 (2667 casos): PIT drawdown d10=12.3 (p = 2.37e-4)

## M2bc con k = 100

Celdas evaluadas: 27; sin evaluar (menos de 100 casos aceptados): 27; pruebas por celda en la familia de Holm: 225.

Cobertura por celda (DD > p95 / DD > p50 / fuera de P05–P95, en %, sobre los casos que pasan las dos puertas; ideal 5 / 50 / 10). En negrita, las celdas que suspenden.

### H = 63

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G5 | 0 | 126 | 0 | — / — / — |
| G5 | 0 | 252 | 0 | — / — / — |
| G5 | 0 | 504 | 441 | 4.8 / 47.4 / 9.5 |
| G5 | 0 | 1008 | 424 | 5.7 / 46.0 / 10.4 |
| G5 | 0.05 | 126 | 0 | — / — / — |
| G5 | 0.05 | 252 | 0 | — / — / — |
| G5 | 0.05 | 504 | 447 | 4.3 / 50.1 / 8.9 |
| G5 | 0.05 | 1008 | 435 | 5.5 / 53.3 / 10.8 |
| G5 | 0.1 | 126 | 0 | — / — / — |
| G5 | 0.1 | 252 | 0 | — / — / — |
| G5 | 0.1 | 504 | 439 | 5.7 / 51.0 / 9.6 |
| G5 | 0.1 | 1008 | 439 | 3.6 / 46.5 / 10.9 |
| G5b | 0 | 126 | 0 | — / — / — |
| G5b | 0 | 252 | 0 | — / — / — |
| G5b | 0 | 504 | 0 | — / — / — |
| G5b | 0 | 1008 | 241 | 2.9 / 39.4 / 10.8 |
| G5b | 0.05 | 126 | 0 | — / — / — |
| G5b | 0.05 | 252 | 0 | — / — / — |
| G5b | 0.05 | 504 | 0 | — / — / — |
| G5b | 0.05 | 1008 | 240 | 5.8 / 46.7 / 10.0 |
| G5b | 0.1 | 126 | 0 | — / — / — |
| G5b | 0.1 | 252 | 0 | — / — / — |
| G5b | 0.1 | 504 | 0 | — / — / — |
| G5b | 0.1 | 1008 | 243 | 4.9 / 45.7 / 11.5 |

### H = 126

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G5 | 0 | 252 | 0 | — / — / — |
| G5 | 0 | 504 | 446 | 4.9 / 46.0 / 10.5 |
| G5 | 0 | 1008 | 446 | 5.2 / 47.1 / 13.0 |
| G5 | 0.05 | 252 | 0 | — / — / — |
| G5 | 0.05 | 504 | 448 | 8.0 / 50.0 / 12.3 |
| G5 | 0.05 | 1008 | 444 | 5.6 / 47.7 / 11.5 |
| G5 | 0.1 | 252 | 0 | — / — / — |
| G5 | 0.1 | 504 | 437 | 6.4 / 49.0 / 10.3 |
| G5 | 0.1 | 1008 | 443 | 6.5 / 53.5 / 8.4 |
| G5b | 0 | 252 | 0 | — / — / — |
| G5b | 0 | 504 | 0 | — / — / — |
| G5b | 0 | 1008 | 238 | 4.6 / 46.2 / 14.7 |
| G5b | 0.05 | 252 | 0 | — / — / — |
| G5b | 0.05 | 504 | 0 | — / — / — |
| G5b | 0.05 | 1008 | 250 | 2.8 / 49.6 / 10.0 |
| G5b | 0.1 | 252 | 0 | — / — / — |
| G5b | 0.1 | 504 | 0 | — / — / — |
| G5b | 0.1 | 1008 | 233 | 5.6 / 49.4 / 9.9 |

### H = 252

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G5 | 0 | 504 | 439 | 4.3 / 44.9 / 10.0 |
| G5 | 0 | 1008 | 445 | 5.8 / 49.0 / 11.2 |
| G5 | 0.05 | 504 | 442 | 5.4 / 51.4 / 9.0 |
| G5 | 0.05 | 1008 | 445 | 6.3 / 51.5 / 12.1 |
| G5 | 0.1 | 504 | 446 | 5.8 / 46.2 / 11.2 |
| G5 | 0.1 | 1008 | 441 | 4.5 / 49.2 / 10.7 |
| G5b | 0 | 504 | 0 | — / — / — |
| G5b | 0 | 1008 | 231 | 3.5 / 42.9 / 7.4 |
| G5b | 0.05 | 504 | 0 | — / — / — |
| G5b | 0.05 | 1008 | 239 | 5.0 / 40.2 / 10.9 |
| G5b | 0.1 | 504 | 0 | — / — / — |
| G5b | 0.1 | 1008 | 242 | 5.8 / 42.1 / 10.7 |

### Lo que suspende

- Conjunto G5b, H = 252, n ≥ 504 (712 casos): DD>p50 41.7 % (p = 1.11e-5)
- Conjunto G5b, H = 252, n ≥ 1008 (712 casos): DD>p50 41.7 % (p = 1.11e-5)

## Tiempo (orientativo, Node, 10.000 simulaciones)

- n = 252, H = 126: M1 97 ms, M2b 65 ms, M2bc 597 ms
- n = 1008, H = 252: M1 335 ms, M2b 95 ms, M2bc 999 ms
