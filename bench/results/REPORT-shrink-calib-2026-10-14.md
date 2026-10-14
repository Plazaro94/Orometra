# Expectativa ajustada por selección frente a la verdad (calib-2026-10-14)

Beneficio esperado por operación de la recomendada en el periodo no visto (100 × edge_unseen),
en moneda. Sesgo = media de (cifra − verdad): positivo es optimista.

| Escenario | Casos | RMSE optimizado | RMSE forward | RMSE ajustada | Sesgo forward | Sesgo ajustada | Ventaja propia: verdad bajo el límite inferior | Ventaja propia > 0 (límite inferior > 0) |
|---|---|---|---|---|---|---|---|---|
| S2 (sin ventaja) | 10 | 19.7 | 10.3 | 3.4 | -2.1 | -0.5 | 0 % | 0 % |
| S3 | 54 | 8.8 | 10.5 | 7.1 | -1.1 | -4.4 | 2 % | 78 % |
| S4 | 54 | 8.3 | 13.1 | 5.1 | 1.3 | -2.7 | 0 % | 70 % |
| S5 (sin ventaja) | 55 | 27.2 | 12.5 | 5.4 | 5.2 | 2.2 | 5 % | 5 % |
| S6 | 42 | 13.7 | 11.5 | 5.0 | 0.1 | -1.6 | 2 % | 52 % |
| S7 | 64 | 10.4 | 10.8 | 4.3 | 1.9 | -1.3 | 2 % | 56 % |
| S8 | 64 | 12.2 | 12.7 | 8.0 | 4.0 | -2.2 | 3 % | 67 % |
| **Con ventaja** | 278 | 10.8 | 11.8 | 6.1 | 1.4 | -2.4 | 2 % | 65 % |
| **Sin ventaja** | 65 | 26.2 | 12.2 | 5.1 | 4.1 | 1.8 | 5 % | 5 % |

- «Verdad bajo el límite inferior»: el límite inferior de la ventaja propia se pasa de largo.
  Con un límite al 95 % debe quedarse en torno al 5 % o menos.
- «Ventaja propia > 0»: la app dice que la recomendada se distingue de la familia. Sin ventaja
  real es un falso positivo (debe rondar el 5 % o menos); con ventaja, es la potencia.
- En S6 la ventaja se reduce a la mitad en el no visto: ningún dato pasado lo anticipa.
