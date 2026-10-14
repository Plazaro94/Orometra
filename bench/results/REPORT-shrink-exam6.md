# Expectativa ajustada por selección frente a la verdad (exam6)

Beneficio esperado por operación de la recomendada en el periodo no visto (100 × edge_unseen),
en moneda. Sesgo = media de (cifra − verdad): positivo es optimista.

| Escenario | Casos | RMSE optimizado | RMSE forward | RMSE ajustada | Sesgo forward | Sesgo ajustada | Ventaja propia: verdad bajo el límite inferior | Ventaja propia > 0 (límite inferior > 0) |
|---|---|---|---|---|---|---|---|---|
| S2 (sin ventaja) | 8 | 25.7 | 16.3 | 3.8 | -1.5 | 3.0 | 13 % | 13 % |
| S3 | 54 | 7.4 | 9.5 | 5.2 | 2.0 | -2.2 | 0 % | 80 % |
| S4 | 56 | 9.7 | 10.7 | 5.4 | 2.4 | -2.4 | 4 % | 79 % |
| S5 (sin ventaja) | 48 | 25.3 | 10.7 | 3.8 | 1.7 | 0.2 | 8 % | 8 % |
| S6 | 56 | 16.1 | 9.3 | 4.2 | 2.3 | -1.4 | 4 % | 45 % |
| S7 | 49 | 6.7 | 10.9 | 5.6 | 4.6 | -1.3 | 0 % | 51 % |
| S8 | 64 | 10.4 | 11.4 | 10.4 | -0.2 | -4.0 | 5 % | 56 % |
| **Con ventaja** | 279 | 10.7 | 10.4 | 6.7 | 2.1 | -2.3 | 3 % | 62 % |
| **Sin ventaja** | 56 | 25.4 | 11.6 | 3.8 | 1.3 | 0.6 | 9 % | 9 % |

- «Verdad bajo el límite inferior»: el límite inferior de la ventaja propia se pasa de largo.
  Con un límite al 95 % debe quedarse en torno al 5 % o menos.
- «Ventaja propia > 0»: la app dice que la recomendada se distingue de la familia. Sin ventaja
  real es un falso positivo (debe rondar el 5 % o menos); con ventaja, es la potencia.
- En S6 la ventaja se reduce a la mitad en el no visto: ningún dato pasado lo anticipa.
