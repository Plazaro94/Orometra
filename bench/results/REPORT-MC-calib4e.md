# Banco del Monte Carlo: MC-calib4e

Generado por `node bench/montecarlo.js` el 2026-10-15. Prerregistro: `bench/PREREGISTRO-MONTECARLO.md` con las enmiendas 1 a 4. Casos por celda: 1000; simulaciones por caso: 2000. Solo pares con H ≤ n/2.

## Veredicto

| Método | mínimo de días con operaciones (k) | H = 63 | H = 126 | H = 252 |
|---|---|---|---|---|
| M1 | 0 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M1 | 20 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M1 | 30 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M1 | 40 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M1 | 60 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M1 | 80 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M1 | 100 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M1 | 150 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M2b | 0 | apto desde n = 252 | apto desde n = 504 | apto desde n = 1008 |
| M2b | 20 | apto desde n = 252 | apto desde n = 504 | apto desde n = 1008 |
| M2b | 30 | apto desde n = 252 | apto desde n = 504 | apto desde n = 1008 |
| M2b | 40 | apto desde n = 252 | apto desde n = 504 | apto desde n = 1008 |
| M2b | 60 | apto desde n = 252 | apto desde n = 504 | apto desde n = 1008 |
| M2b | 80 | apto desde n = 252 | apto desde n = 504 | apto desde n = 1008 |
| M2b | 100 | apto desde n = 252 | apto desde n = 504 | apto desde n = 1008 |
| M2b | 150 | apto desde n = 126 | apto desde n = 504 | apto desde n = 1008 |
| M2bc | 0 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M2bc | 20 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M2bc | 30 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M2bc | 40 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M2bc | 60 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M2bc | 80 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M2bc | 100 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M2bc | 150 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |

**Criterio de descarte** (algún método apto para H = 126 con n_min ≤ 252): no se puede evaluar con esta tanda (faltan procesos).
- M1: k elegido = 0 (el menor que da el mejor n_min con H = 126).
- M2b: k elegido = 0 (el menor que da el mejor n_min con H = 126).
- M2bc: k elegido = 0 (el menor que da el mejor n_min con H = 126).

## Puertas: casos sin cifras

Detectores de rachas y de volatilidad agrupada juntos, en % de casos; entre paréntesis, la mediana de días con operaciones de la muestra.

| Proceso | μ | 126/63 | 252/63 | 252/126 | 504/63 | 504/126 | 504/252 | 1008/63 | 1008/126 | 1008/252 |
|---|---|---|---|---|---|---|---|---|---|---|
| G11 | 0 | 10.1 (126) | 10.2 (252) | 9.4 (252) | 9.7 (504) | 10.6 (504) | 10.9 (504) | 11.7 (1008) | 9.5 (1008) | 10.2 (1008) |
| G11 | 0.05 | 10.8 (126) | 9.9 (252) | 10.1 (252) | 8.9 (504) | 7.9 (504) | 9.6 (504) | 9.6 (1008) | 10.0 (1008) | 10.5 (1008) |
| G11 | 0.1 | 9.4 (126) | 11.2 (252) | 11.4 (252) | 9.3 (504) | 10.6 (504) | 9.4 (504) | 9.6 (1008) | 10.5 (1008) | 9.9 (1008) |

## M1 con k = 0

Celdas evaluadas: 27; sin evaluar (menos de 100 casos aceptados): 0; pruebas por celda en la familia de Holm: 180.

Cobertura por celda (DD > p95 / DD > p50 / fuera de P05–P95, en %, sobre los casos que pasan las dos puertas; ideal 5 / 50 / 10). En negrita, las celdas que suspenden.

### H = 63

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G11 | 0 | 126 | 899 | 5.2 / 49.1 / 11.9 |
| G11 | 0 | 252 | 898 | 5.1 / 50.9 / 11.5 |
| G11 | 0 | 504 | 903 | 4.8 / 50.3 / 8.5 |
| G11 | 0 | 1008 | 883 | 4.5 / 52.1 / 9.4 |
| G11 | 0.05 | 126 | 892 | 6.8 / 51.6 / 10.5 |
| G11 | 0.05 | 252 | 901 | 6.2 / 50.4 / 10.8 |
| G11 | 0.05 | 504 | 911 | 4.9 / 46.5 / 10.6 |
| G11 | 0.05 | 1008 | 904 | 5.6 / 48.0 / 11.7 |
| G11 | 0.1 | 126 | 906 | 6.1 / 49.9 / 11.4 |
| G11 | 0.1 | 252 | 888 | 4.7 / 48.4 / 11.3 |
| G11 | 0.1 | 504 | 907 | 5.0 / 50.6 / 10.8 |
| G11 | 0.1 | 1008 | 904 | 4.4 / 50.6 / 9.0 |

### H = 126

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G11 | 0 | 252 | 906 | 5.1 / 51.0 / 10.8 |
| G11 | 0 | 504 | 894 | 4.7 / 50.3 / 10.5 |
| G11 | 0 | 1008 | 905 | 5.0 / 49.9 / 10.5 |
| G11 | 0.05 | 252 | 899 | 4.0 / 50.2 / 8.8 |
| G11 | 0.05 | 504 | 921 | 5.6 / 50.6 / 11.4 |
| G11 | 0.05 | 1008 | 900 | 4.9 / 47.1 / 10.2 |
| G11 | 0.1 | 252 | 886 | 5.3 / 51.0 / 11.4 |
| G11 | 0.1 | 504 | 894 | 4.9 / 48.8 / 10.4 |
| G11 | 0.1 | 1008 | 895 | 4.5 / 50.2 / 8.5 |

### H = 252

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G11 | 0 | 504 | 891 | 4.9 / 50.5 / 9.9 |
| G11 | 0 | 1008 | 898 | 4.9 / 48.1 / 9.6 |
| G11 | 0.05 | 504 | 904 | 5.0 / 49.8 / 11.3 |
| G11 | 0.05 | 1008 | 895 | 5.0 / 50.5 / 9.9 |
| G11 | 0.1 | 504 | 906 | 5.3 / 50.0 / 11.0 |
| G11 | 0.1 | 1008 | 901 | 4.6 / 51.5 / 9.8 |

### Lo que suspende

- Nada.

## M2b con k = 0

Celdas evaluadas: 27; sin evaluar (menos de 100 casos aceptados): 0; pruebas por celda en la familia de Holm: 180.

Cobertura por celda (DD > p95 / DD > p50 / fuera de P05–P95, en %, sobre los casos que pasan las dos puertas; ideal 5 / 50 / 10). En negrita, las celdas que suspenden.

### H = 63

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G11 | 0 | 126 | 899 | **6.8 / 48.7 / 13.9** |
| G11 | 0 | 252 | 898 | 5.8 / 51.3 / 12.4 |
| G11 | 0 | 504 | 903 | 5.0 / 50.3 / 9.7 |
| G11 | 0 | 1008 | 883 | 5.0 / 52.0 / 9.1 |
| G11 | 0.05 | 126 | 892 | 7.7 / 51.7 / 13.0 |
| G11 | 0.05 | 252 | 901 | 6.4 / 49.9 / 12.0 |
| G11 | 0.05 | 504 | 911 | 5.0 / 46.8 / 11.2 |
| G11 | 0.05 | 1008 | 904 | 5.1 / 48.1 / 12.2 |
| G11 | 0.1 | 126 | 906 | 7.1 / 50.7 / 13.5 |
| G11 | 0.1 | 252 | 888 | 5.2 / 48.5 / 12.5 |
| G11 | 0.1 | 504 | 907 | 5.4 / 50.3 / 11.6 |
| G11 | 0.1 | 1008 | 904 | 4.6 / 50.6 / 9.2 |

### H = 126

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G11 | 0 | 252 | 906 | 6.4 / 50.2 / 13.2 |
| G11 | 0 | 504 | 894 | 4.8 / 49.8 / 11.6 |
| G11 | 0 | 1008 | 905 | 5.0 / 49.7 / 11.5 |
| G11 | 0.05 | 252 | 899 | 5.3 / 49.7 / 11.8 |
| G11 | 0.05 | 504 | 921 | 6.1 / 50.5 / 12.2 |
| G11 | 0.05 | 1008 | 900 | 5.0 / 46.4 / 10.3 |
| G11 | 0.1 | 252 | 886 | 5.8 / 51.8 / 12.9 |
| G11 | 0.1 | 504 | 894 | 5.4 / 48.9 / 11.4 |
| G11 | 0.1 | 1008 | 895 | 5.0 / 50.3 / 9.5 |

### H = 252

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G11 | 0 | 504 | 891 | 7.2 / 50.8 / 12.9 |
| G11 | 0 | 1008 | 898 | 5.1 / 48.4 / 10.7 |
| G11 | 0.05 | 504 | 904 | 5.6 / 49.8 / 12.9 |
| G11 | 0.05 | 1008 | 895 | 5.3 / 50.6 / 11.2 |
| G11 | 0.1 | 504 | 906 | 5.8 / 50.1 / 12.8 |
| G11 | 0.1 | 1008 | 901 | 5.0 / 51.8 / 10.9 |

### Lo que suspende

- Conjunto G11, H = 63, n ≥ 126 (10796 casos): fuera 11.7 % (p = 1.33e-8)
- Conjunto G11, H = 126, n ≥ 252 (8100 casos): fuera 11.6 % (p = 2.52e-6)
- Conjunto G11, H = 252, n ≥ 504 (5395 casos): fuera 11.9 % (p = 5.59e-6)
- Celda G11 μ 0 n 126 H 63: fuera 13.9 % (p = 1.88e-4)

## M2bc con k = 0

Celdas evaluadas: 27; sin evaluar (menos de 100 casos aceptados): 0; pruebas por celda en la familia de Holm: 180.

Cobertura por celda (DD > p95 / DD > p50 / fuera de P05–P95, en %, sobre los casos que pasan las dos puertas; ideal 5 / 50 / 10). En negrita, las celdas que suspenden.

### H = 63

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G11 | 0 | 126 | 449 | 5.1 / 49.9 / 12.2 |
| G11 | 0 | 252 | 452 | 4.6 / 46.0 / 8.6 |
| G11 | 0 | 504 | 448 | 4.0 / 48.9 / 8.5 |
| G11 | 0 | 1008 | 446 | 3.4 / 50.7 / 10.1 |
| G11 | 0.05 | 126 | 448 | 7.1 / 51.8 / 10.7 |
| G11 | 0.05 | 252 | 450 | 4.7 / 49.1 / 12.0 |
| G11 | 0.05 | 504 | 451 | 3.5 / 46.6 / 13.1 |
| G11 | 0.05 | 1008 | 447 | 5.1 / 48.8 / 10.3 |
| G11 | 0.1 | 126 | 449 | 4.5 / 50.6 / 12.9 |
| G11 | 0.1 | 252 | 432 | 5.3 / 48.6 / 10.2 |
| G11 | 0.1 | 504 | 451 | 5.3 / 49.2 / 10.4 |
| G11 | 0.1 | 1008 | 454 | 3.3 / 50.0 / 10.6 |

### H = 126

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G11 | 0 | 252 | 454 | 5.5 / 51.8 / 10.6 |
| G11 | 0 | 504 | 441 | 5.0 / 49.4 / 11.8 |
| G11 | 0 | 1008 | 444 | 5.0 / 50.7 / 10.1 |
| G11 | 0.05 | 252 | 453 | 2.9 / 52.3 / 8.2 |
| G11 | 0.05 | 504 | 460 | 6.1 / 51.5 / 12.8 |
| G11 | 0.05 | 1008 | 461 | 6.1 / 46.6 / 9.1 |
| G11 | 0.1 | 252 | 443 | 5.2 / 52.8 / 10.4 |
| G11 | 0.1 | 504 | 449 | 5.3 / 46.5 / 10.5 |
| G11 | 0.1 | 1008 | 440 | 5.0 / 53.0 / 9.8 |

### H = 252

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G11 | 0 | 504 | 448 | 6.3 / 54.7 / 10.5 |
| G11 | 0 | 1008 | 449 | 4.2 / 48.6 / 8.0 |
| G11 | 0.05 | 504 | 458 | 6.1 / 50.2 / 10.0 |
| G11 | 0.05 | 1008 | 446 | 4.3 / 47.3 / 10.1 |
| G11 | 0.1 | 504 | 447 | 5.1 / 49.7 / 11.0 |
| G11 | 0.1 | 1008 | 455 | 3.7 / 51.9 / 11.2 |

### Lo que suspende

- Nada.

## Tiempo (orientativo, Node, 10.000 simulaciones)

- n = 252, H = 126: M1 120 ms, M2b 57 ms, M2bc 638 ms
- n = 1008, H = 252: M1 358 ms, M2b 100 ms, M2bc 1021 ms
