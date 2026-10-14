# Banco del Monte Carlo: MC-calib3-m2c-b

Generado por `node bench/montecarlo.js` el 2026-10-14. Prerregistro: `bench/PREREGISTRO-MONTECARLO.md` con las enmiendas 1 a 4. Casos por celda: 1000; simulaciones por caso: 2000. Solo pares con H ≤ n/2.

## Veredicto

| Método | mínimo de días con operaciones (k) | H = 63 | H = 126 | H = 252 |
|---|---|---|---|---|
| M2c | 0 | apto desde n = 126 | apto desde n = 504 | apto desde n = 504 |
| M2c | 20 | apto desde n = 126 | apto desde n = 504 | apto desde n = 504 |
| M2c | 30 | apto desde n = 126 | apto desde n = 504 | apto desde n = 504 |
| M2c | 40 | apto desde n = 126 | apto desde n = 504 | apto desde n = 504 |
| M2c | 60 | apto desde n = 126 | apto desde n = 504 | apto desde n = 504 |
| M2c | 80 | apto desde n = 126 | apto desde n = 504 | apto desde n = 504 |
| M2c | 100 | apto desde n = 126 | apto desde n = 504 | apto desde n = 504 |
| M2c | 150 | apto desde n = 126 | apto desde n = 252 | apto desde n = 504 |

**Criterio de descarte** (algún método apto para H = 126 con n_min ≤ 252): no se puede evaluar con esta tanda (faltan procesos).
- M2c: k elegido = 150 (el menor que da el mejor n_min con H = 126).

## Puertas: casos sin cifras

Detector de rachas (contraste robusto), en % de casos; entre paréntesis, la mediana de días con operaciones de la muestra.

| Proceso | μ | 126/63 | 252/63 | 252/126 | 504/63 | 504/126 | 504/252 | 1008/63 | 1008/126 | 1008/252 |
|---|---|---|---|---|---|---|---|---|---|---|
| G12 | real |  |  | 4.6 (121) |  |  |  |  |  |  |
| G12 | 0 |  |  | 5.3 (119) |  |  |  |  |  |  |

## M2c con k = 150

Celdas evaluadas: 0; sin evaluar (menos de 100 casos aceptados): 2; pruebas por celda en la familia de Holm: 0.

Cobertura por celda (DD > p95 / DD > p50 / fuera de P05–P95, en %, sobre los casos que pasan las dos puertas; ideal 5 / 50 / 10). En negrita, las celdas que suspenden.

### H = 63

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|

### H = 126

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|
| G12 | 0 | 252 | 0 | — / — / — |
| G12 | real | 252 | 0 | — / — / — |

### H = 252

| Proceso | μ | n | aceptados | cobertura |
|---|---|---|---|---|

### Lo que suspende

- Nada.

## Tiempo (orientativo, Node, 10.000 simulaciones)

- n = 252, H = 126: M1 91 ms, M2 144 ms, M2c 1548 ms
- n = 1008, H = 252: M1 358 ms, M2 423 ms, M2c 4942 ms
