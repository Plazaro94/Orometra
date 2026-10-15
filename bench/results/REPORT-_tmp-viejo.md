# Banco del Monte Carlo: _tmp-viejo

Generado por `node bench/montecarlo.js` el 2026-10-15. Prerregistro: `bench/PREREGISTRO-MONTECARLO.md` con las enmiendas 1 a 4. Casos por celda: 30; simulaciones por caso: 2000. Solo pares con H ≤ n/2.

## Veredicto

| Método | mínimo de días con operaciones (k) | H = 63 | H = 126 | H = 252 |
|---|---|---|---|---|
| M2b | 0 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M2b | 20 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M2b | 30 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M2b | 40 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M2b | 60 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M2b | 80 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M2b | 100 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |
| M2b | 150 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |

**Criterio de descarte** (algún método apto para H = 126 con n_min ≤ 504): no se puede evaluar con esta tanda (faltan procesos).
- M2b: k elegido = 0 (el menor que da el mejor n_min con H = 126).

## Puertas: casos sin cifras

Detectores de rachas y de volatilidad agrupada juntos, en % de casos; entre paréntesis, la mediana de días con operaciones de la muestra.

| Proceso | μ | 126/63 | 252/63 | 252/126 | 504/63 | 504/126 | 504/252 | 1008/63 | 1008/126 | 1008/252 |
|---|---|---|---|---|---|---|---|---|---|---|
| G1 | 0 |  |  | 10.0 (252) |  |  |  | 3.3 (1008) |  |  |
| G1 | 0.05 |  |  | 3.3 (252) |  |  |  | 10.0 (1008) |  |  |
| G1 | 0.1 |  |  | 20.0 (252) |  |  |  | 13.3 (1008) |  |  |
| G5b | 0 |  |  | 13.3 (24) |  |  |  | 6.7 (102) |  |  |
| G5b | 0.05 |  |  | 16.7 (25) |  |  |  | 6.7 (101) |  |  |
| G5b | 0.1 |  |  | 10.0 (26) |  |  |  | 13.3 (100) |  |  |
| G7 | 0 |  |  | 13.3 (252) |  |  |  | 3.3 (1008) |  |  |
| G7 | 0.05 |  |  | 10.0 (252) |  |  |  | 16.7 (1008) |  |  |
| G7 | 0.1 |  |  | 6.7 (252) |  |  |  | 6.7 (1008) |  |  |
| G12 | real |  |  | 10.0 (124) |  |  |  | 16.7 (478) |  |  |
| G12 | 0 |  |  | 6.7 (119) |  |  |  | 10.0 (484) |  |  |

## M2b con k = 0

Celdas evaluadas: 0; sin evaluar (menos de 100 casos aceptados): 22; pruebas por celda en la familia de Holm: 0.

Cobertura por celda (DD > p95 / DD > p50 / fuera de P05–P95, en %, sobre los casos que pasan las dos puertas; ideal 5 / 50 / 10). En negrita, las celdas que suspenden.

### H = 63

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G1 | 0 | 1008 | 29 | 6.9 / 51.7 / 10.3 |
| G1 | 0.05 | 1008 | 27 | 7.4 / 51.9 / 18.5 |
| G1 | 0.1 | 1008 | 26 | 7.7 / 46.2 / 19.2 |
| G5b | 0 | 1008 | 28 | 3.6 / 32.1 / 14.3 |
| G5b | 0.05 | 1008 | 28 | 7.1 / 60.7 / 14.3 |
| G5b | 0.1 | 1008 | 26 | 11.5 / 46.2 / 15.4 |
| G7 | 0 | 1008 | 29 | 3.4 / 55.2 / 10.3 |
| G7 | 0.05 | 1008 | 25 | 4.0 / 28.0 / 4.0 |
| G7 | 0.1 | 1008 | 28 | 7.1 / 42.9 / 17.9 |
| G12 | 0 | 1008 | 27 | 3.7 / 51.9 / 7.4 |
| G12 | real | 1008 | 25 | 4.0 / 24.0 / 20.0 |

### H = 126

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G1 | 0 | 252 | 27 | 7.4 / 59.3 / 11.1 |
| G1 | 0.05 | 252 | 29 | 6.9 / 44.8 / 10.3 |
| G1 | 0.1 | 252 | 24 | 4.2 / 29.2 / 12.5 |
| G5b | 0 | 252 | 26 | 23.1 / 57.7 / 19.2 |
| G5b | 0.05 | 252 | 25 | 16.0 / 60.0 / 12.0 |
| G5b | 0.1 | 252 | 27 | 14.8 / 59.3 / 22.2 |
| G7 | 0 | 252 | 26 | 3.8 / 38.5 / 15.4 |
| G7 | 0.05 | 252 | 27 | 3.7 / 55.6 / 7.4 |
| G7 | 0.1 | 252 | 28 | 14.3 / 60.7 / 28.6 |
| G12 | 0 | 252 | 28 | 7.1 / 46.4 / 17.9 |
| G12 | real | 252 | 27 | 0.0 / 37.0 / 11.1 |

### H = 252

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|

### Lo que suspende

- Nada.

## Tiempo (orientativo, Node, 10.000 simulaciones)

- n = 252, H = 126: M1 82 ms, M2b 52 ms, M2bc 553 ms
- n = 1008, H = 252: M1 366 ms, M2b 88 ms, M2bc 874 ms
