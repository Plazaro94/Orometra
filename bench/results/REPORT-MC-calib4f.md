# Banco del Monte Carlo: MC-calib4f

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
| M2b | 0 | apto desde n = 252 | apto desde n = 504 | no apto |
| M2b | 20 | apto desde n = 252 | apto desde n = 504 | no apto |
| M2b | 30 | apto desde n = 252 | apto desde n = 504 | no apto |
| M2b | 40 | apto desde n = 252 | apto desde n = 504 | no apto |
| M2b | 60 | apto desde n = 252 | apto desde n = 504 | no apto |
| M2b | 80 | apto desde n = 252 | apto desde n = 504 | no apto |
| M2b | 100 | apto desde n = 252 | apto desde n = 504 | no apto |
| M2b | 150 | apto desde n = 126 | apto desde n = 504 | no apto |
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
| G7 | 0 | 10.2 (126) | 9.2 (252) | 10.8 (252) | 9.5 (504) | 10.6 (504) | 9.9 (504) | 9.5 (1008) | 10.2 (1008) | 8.6 (1008) |
| G7 | 0.05 | 9.8 (126) | 10.8 (252) | 10.9 (252) | 9.8 (504) | 9.7 (504) | 9.6 (504) | 10.5 (1008) | 8.9 (1008) | 10.6 (1008) |
| G7 | 0.1 | 8.7 (126) | 8.1 (252) | 9.8 (252) | 9.4 (504) | 9.9 (504) | 9.7 (504) | 8.2 (1008) | 8.4 (1008) | 10.4 (1008) |
| G12 | real | 9.1 (60) | 12.0 (120) | 12.0 (121) | 12.1 (239) | 13.0 (240) | 15.3 (240) | 13.0 (479) | 14.4 (479) | 15.8 (479) |
| G12 | 0 | 9.7 (60) | 11.6 (120) | 12.1 (119) | 12.5 (239) | 12.7 (240) | 14.7 (239) | 13.4 (479) | 14.4 (480) | 12.1 (478) |

## M1 con k = 0

Celdas evaluadas: 45; sin evaluar (menos de 100 casos aceptados): 0; pruebas por celda en la familia de Holm: 315.

Cobertura por celda (DD > p95 / DD > p50 / fuera de P05–P95, en %, sobre los casos que pasan las dos puertas; ideal 5 / 50 / 10). En negrita, las celdas que suspenden.

### H = 63

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G7 | 0 | 126 | 898 | 5.0 / 49.7 / 10.8 |
| G7 | 0 | 252 | 908 | 6.1 / 52.0 / 10.2 |
| G7 | 0 | 504 | 905 | 4.1 / 50.6 / 8.5 |
| G7 | 0 | 1008 | 905 | 5.3 / 48.8 / 11.6 |
| G7 | 0.05 | 126 | 902 | 5.9 / 53.4 / 11.0 |
| G7 | 0.05 | 252 | 892 | 4.4 / 51.8 / 9.2 |
| G7 | 0.05 | 504 | 902 | 5.4 / 52.8 / 9.2 |
| G7 | 0.05 | 1008 | 895 | 4.5 / 48.8 / 8.8 |
| G7 | 0.1 | 126 | 913 | 4.9 / 50.8 / 13.3 |
| G7 | 0.1 | 252 | 919 | 3.9 / 52.1 / 10.2 |
| G7 | 0.1 | 504 | 906 | 6.6 / 52.5 / 10.8 |
| G7 | 0.1 | 1008 | 918 | 4.0 / 50.5 / 9.5 |
| G12 | 0 | 126 | 903 | 6.3 / 51.7 / 13.8 |
| G12 | 0 | 252 | 884 | 3.7 / 48.9 / 10.0 |
| G12 | 0 | 504 | 875 | 4.7 / 49.9 / 8.8 |
| G12 | 0 | 1008 | 866 | 4.4 / 52.9 / 9.6 |
| G12 | real | 126 | 909 | 5.6 / 52.0 / 11.0 |
| G12 | real | 252 | 880 | 4.5 / 49.0 / 9.1 |
| G12 | real | 504 | 879 | 5.1 / 49.9 / 10.1 |
| G12 | real | 1008 | 870 | 4.3 / 49.0 / 10.7 |

### H = 126

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G7 | 0 | 252 | 892 | 5.2 / 49.3 / 11.4 |
| G7 | 0 | 504 | 894 | 6.0 / 50.2 / 10.6 |
| G7 | 0 | 1008 | 898 | 5.2 / 49.1 / 10.1 |
| G7 | 0.05 | 252 | 891 | 4.4 / 51.0 / 9.2 |
| G7 | 0.05 | 504 | 903 | 6.6 / 49.8 / 12.1 |
| G7 | 0.05 | 1008 | 911 | 4.1 / 47.9 / 9.1 |
| G7 | 0.1 | 252 | 902 | 5.5 / 50.9 / 11.8 |
| G7 | 0.1 | 504 | 901 | 4.1 / 52.3 / 8.0 |
| G7 | 0.1 | 1008 | 916 | 3.9 / 47.6 / 10.2 |
| G12 | 0 | 252 | 879 | 5.5 / 47.1 / 11.8 |
| G12 | 0 | 504 | 873 | 6.0 / 50.4 / 11.7 |
| G12 | 0 | 1008 | 856 | 4.0 / 46.5 / 10.3 |
| G12 | real | 252 | 880 | 4.2 / 45.6 / 10.6 |
| G12 | real | 504 | 870 | 4.8 / 49.7 / 10.6 |
| G12 | real | 1008 | 856 | 6.5 / 51.9 / 11.2 |

### H = 252

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G7 | 0 | 504 | 901 | 5.5 / 50.9 / 12.1 |
| G7 | 0 | 1008 | 914 | 5.6 / 54.6 / 10.2 |
| G7 | 0.05 | 504 | 904 | 4.9 / 48.6 / 11.2 |
| G7 | 0.05 | 1008 | 894 | 5.0 / 49.2 / 11.9 |
| G7 | 0.1 | 504 | 903 | 2.5 / 46.4 / 9.4 |
| G7 | 0.1 | 1008 | 896 | 6.1 / 47.0 / 8.9 |
| G12 | 0 | 504 | 853 | 6.1 / 50.6 / 12.3 |
| G12 | 0 | 1008 | 879 | 5.0 / 48.5 / 11.6 |
| G12 | real | 504 | 847 | 3.9 / 47.1 / 11.1 |
| G12 | real | 1008 | 842 | 5.1 / 48.9 / 12.6 |

### Lo que suspende

- Nada.

## M2b con k = 0

Celdas evaluadas: 45; sin evaluar (menos de 100 casos aceptados): 0; pruebas por celda en la familia de Holm: 315.

Cobertura por celda (DD > p95 / DD > p50 / fuera de P05–P95, en %, sobre los casos que pasan las dos puertas; ideal 5 / 50 / 10). En negrita, las celdas que suspenden.

### H = 63

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G7 | 0 | 126 | 898 | 6.5 / 50.0 / 12.6 |
| G7 | 0 | 252 | 908 | 6.5 / 52.3 / 10.8 |
| G7 | 0 | 504 | 905 | 4.6 / 50.4 / 8.8 |
| G7 | 0 | 1008 | 905 | 5.5 / 49.3 / 11.3 |
| G7 | 0.05 | 126 | 902 | 6.7 / 53.8 / 13.4 |
| G7 | 0.05 | 252 | 892 | 4.6 / 52.6 / 10.2 |
| G7 | 0.05 | 504 | 902 | 5.9 / 53.0 / 10.3 |
| G7 | 0.05 | 1008 | 895 | 4.7 / 48.6 / 8.7 |
| G7 | 0.1 | 126 | 913 | **6.2 / 49.7 / 15.6** |
| G7 | 0.1 | 252 | 919 | 4.1 / 52.0 / 11.8 |
| G7 | 0.1 | 504 | 906 | 7.3 / 52.9 / 11.3 |
| G7 | 0.1 | 1008 | 918 | 4.5 / 50.2 / 10.5 |
| G12 | 0 | 126 | 903 | **8.0 / 51.5 / 15.2** |
| G12 | 0 | 252 | 884 | 3.7 / 49.4 / 11.9 |
| G12 | 0 | 504 | 875 | 4.8 / 49.8 / 9.8 |
| G12 | 0 | 1008 | 866 | 5.1 / 53.2 / 9.7 |
| G12 | real | 126 | 909 | 6.1 / 52.3 / 13.0 |
| G12 | real | 252 | 880 | 5.1 / 49.1 / 10.2 |
| G12 | real | 504 | 879 | 5.3 / 49.1 / 10.5 |
| G12 | real | 1008 | 870 | 4.6 / 48.6 / 11.3 |

### H = 126

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G7 | 0 | 252 | 892 | 6.3 / 49.2 / 13.6 |
| G7 | 0 | 504 | 894 | 6.6 / 50.4 / 11.7 |
| G7 | 0 | 1008 | 898 | 5.7 / 49.2 / 10.4 |
| G7 | 0.05 | 252 | 891 | 5.3 / 50.1 / 12.6 |
| G7 | 0.05 | 504 | 903 | 7.2 / 50.3 / 12.8 |
| G7 | 0.05 | 1008 | 911 | 4.0 / 47.9 / 9.9 |
| G7 | 0.1 | 252 | 902 | **6.0 / 49.8 / 14.1** |
| G7 | 0.1 | 504 | 901 | 4.6 / 51.2 / 8.4 |
| G7 | 0.1 | 1008 | 916 | 3.9 / 48.0 / 10.4 |
| G12 | 0 | 252 | 879 | **6.4 / 47.8 / 14.9** |
| G12 | 0 | 504 | 873 | 6.2 / 50.1 / 12.8 |
| G12 | 0 | 1008 | 856 | 4.4 / 46.5 / 11.1 |
| G12 | real | 252 | 880 | 4.9 / 45.8 / 13.8 |
| G12 | real | 504 | 870 | 4.9 / 50.2 / 11.3 |
| G12 | real | 1008 | 856 | 6.8 / 51.9 / 11.6 |

### H = 252

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G7 | 0 | 504 | 901 | **6.2 / 51.2 / 14.0** |
| G7 | 0 | 1008 | 914 | 6.0 / 54.9 / 11.1 |
| G7 | 0.05 | 504 | 904 | 5.8 / 48.7 / 13.5 |
| G7 | 0.05 | 1008 | 894 | 5.1 / 49.0 / 13.5 |
| G7 | 0.1 | 504 | 903 | 3.3 / 46.0 / 11.0 |
| G7 | 0.1 | 1008 | 896 | 6.4 / 47.1 / 10.4 |
| G12 | 0 | 504 | 853 | 6.9 / 50.8 / 14.0 |
| G12 | 0 | 1008 | 879 | 5.5 / 48.6 / 13.4 |
| G12 | real | 504 | 847 | 5.1 / 47.1 / 13.3 |
| G12 | real | 1008 | 842 | 5.2 / 49.3 / 13.7 |

### Lo que suspende

- Conjunto G12, H = 252, n ≥ 504 (3421 casos): fuera 13.6 % (p = 2.32e-11)
- Conjunto G12, H = 126, n ≥ 252 (5214 casos): fuera 12.6 % (p = 1.87e-9)
- Conjunto G7, H = 252, n ≥ 504 (5412 casos): fuera 12.2 % (p = 1.12e-7)
- Celda G7 μ 0.1 n 126 H 63: fuera 15.6 % (p = 1.82e-7)
- Conjunto G12, H = 63, n ≥ 126 (7066 casos): PIT resultado d10=11.6 (p = 7.40e-7)
- Celda G12 μ 0 n 126 H 63: fuera 15.2 % (p = 1.22e-6)
- Conjunto G12, H = 252, n ≥ 1008 (1721 casos): fuera 13.5 % (p = 2.98e-6)
- Celda G12 μ 0 n 252 H 126: fuera 14.9 % (p = 4.79e-6)
- Conjunto G7, H = 126, n ≥ 252 (8108 casos): fuera 11.5 % (p = 6.79e-6)
- Conjunto G12, H = 252, n ≥ 504 (3421 casos): PIT resultado d10=12.7 (p = 9.16e-6)
- Celda G7 μ 0.1 n 252 H 126: fuera 14.1 % (p = 9.77e-5)
- Celda G12 μ 0 n 126 H 63: DD>p95 8.0 % (p = 1.25e-4)
- Celda G7 μ 0.1 n 126 H 63: PIT resultado d10=14.6 (p = 1.32e-4)
- Celda G7 μ 0 n 504 H 252: fuera 14.0 % (p = 1.51e-4)

## M2bc con k = 0

Celdas evaluadas: 45; sin evaluar (menos de 100 casos aceptados): 0; pruebas por celda en la familia de Holm: 315.

Cobertura por celda (DD > p95 / DD > p50 / fuera de P05–P95, en %, sobre los casos que pasan las dos puertas; ideal 5 / 50 / 10). En negrita, las celdas que suspenden.

### H = 63

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G7 | 0 | 126 | 450 | 5.1 / 50.4 / 8.4 |
| G7 | 0 | 252 | 460 | 5.4 / 52.4 / 10.9 |
| G7 | 0 | 504 | 454 | 3.1 / 49.1 / 8.8 |
| G7 | 0 | 1008 | 451 | 4.7 / 49.2 / 10.2 |
| G7 | 0.05 | 126 | 453 | 4.2 / 53.0 / 9.9 |
| G7 | 0.05 | 252 | 448 | 4.0 / 48.0 / 8.3 |
| G7 | 0.05 | 504 | 451 | 5.1 / 52.8 / 10.0 |
| G7 | 0.05 | 1008 | 437 | 3.7 / 48.1 / 8.9 |
| G7 | 0.1 | 126 | 454 | 3.7 / 50.0 / 12.6 |
| G7 | 0.1 | 252 | 462 | 4.5 / 54.8 / 10.8 |
| G7 | 0.1 | 504 | 456 | 4.8 / 51.3 / 9.9 |
| G7 | 0.1 | 1008 | 454 | 3.7 / 48.5 / 10.1 |
| G12 | 0 | 126 | 461 | 6.1 / 52.7 / 12.8 |
| G12 | 0 | 252 | 438 | 2.5 / 50.0 / 7.5 |
| G12 | 0 | 504 | 447 | 3.6 / 47.7 / 9.6 |
| G12 | 0 | 1008 | 444 | 5.0 / 52.9 / 10.4 |
| G12 | real | 126 | 463 | 5.2 / 52.9 / 9.5 |
| G12 | real | 252 | 438 | 3.2 / 48.2 / 7.5 |
| G12 | real | 504 | 443 | 3.4 / 47.9 / 8.8 |
| G12 | real | 1008 | 435 | 4.4 / 48.0 / 10.3 |

### H = 126

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G7 | 0 | 252 | 441 | 4.5 / 46.9 / 10.9 |
| G7 | 0 | 504 | 446 | 7.0 / 52.0 / 12.8 |
| G7 | 0 | 1008 | 448 | 5.4 / 48.7 / 13.2 |
| G7 | 0.05 | 252 | 445 | 4.0 / 50.8 / 9.2 |
| G7 | 0.05 | 504 | 454 | 6.6 / 52.2 / 12.1 |
| G7 | 0.05 | 1008 | 457 | 4.6 / 47.5 / 8.8 |
| G7 | 0.1 | 252 | 453 | 6.0 / 52.8 / 9.7 |
| G7 | 0.1 | 504 | 452 | 4.2 / 49.3 / 8.4 |
| G7 | 0.1 | 1008 | 457 | 2.4 / 45.3 / 9.4 |
| G12 | 0 | 252 | 435 | 4.8 / 47.1 / 9.7 |
| G12 | 0 | 504 | 440 | 5.5 / 50.7 / 11.8 |
| G12 | 0 | 1008 | 424 | 3.8 / 45.8 / 10.4 |
| G12 | real | 252 | 442 | 4.1 / 46.2 / 10.0 |
| G12 | real | 504 | 432 | 4.9 / 53.0 / 7.6 |
| G12 | real | 1008 | 429 | 6.1 / 51.3 / 11.9 |

### H = 252

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G7 | 0 | 504 | 452 | 4.4 / 50.2 / 11.9 |
| G7 | 0 | 1008 | 461 | 5.6 / 54.2 / 10.2 |
| G7 | 0.05 | 504 | 442 | 4.8 / 52.3 / 9.7 |
| G7 | 0.05 | 1008 | 443 | 5.2 / 47.2 / 11.7 |
| G7 | 0.1 | 504 | 449 | 3.6 / 49.0 / 10.2 |
| G7 | 0.1 | 1008 | 451 | 6.0 / 46.3 / 9.5 |
| G12 | 0 | 504 | 433 | 3.9 / 49.9 / 9.0 |
| G12 | 0 | 1008 | 438 | 3.9 / 47.5 / 11.4 |
| G12 | real | 504 | 415 | 4.6 / 50.6 / 10.8 |
| G12 | real | 1008 | 422 | 6.6 / 50.5 / 12.6 |

### Lo que suspende

- Nada.

## Tiempo (orientativo, Node, 10.000 simulaciones)

- n = 252, H = 126: M1 99 ms, M2b 58 ms, M2bc 616 ms
- n = 1008, H = 252: M1 320 ms, M2b 84 ms, M2bc 1001 ms
