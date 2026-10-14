# Expectativa ajustada por selección: variantes probadas en la calibración (2026-10-14)

Todas sobre las semillas de calibración (1-100 de cada escenario), con el mismo motor salvo la
pieza indicada. Error frente al beneficio esperado por operación verdadero de la recomendada en
el periodo no visto (100 × edge_unseen), 343 casos con meseta, forward y estimación. Las cifras
crudas de partida: RMSE 15,0 con la del periodo optimizado y 11,9 con la del forward (sesgo
+1,9).

| Variante | RMSE ajustada | Sesgo | Cobertura del intervalo de dos lados (total) | Cobertura del intervalo de la ventaja propia |
|---|---|---|---|---|
| 1. Una configuración sola; varianza del in-sample entre las que cumplen tus mínimos | 7,1 | −3,1 | 55 % | 62 % |
| 2. Como 1, con su vecindad | 5,9 | −1,1 | 43 % | 62 % |
| 3. Como 2, ruido igual en todas las unidades | 6,0 | −1,5 | 48 % | 63 % |
| 4. Como 2, prior no paramétrico (EM sobre malla) | 6,2 | −2,1 | 38 % | 27 % |
| 5. Como 4, ruido por número de operaciones de la media | 6,1 | −1,4 | 39 % | 26 % |
| 6. **Elegida.** Relación del forward condicionada al in-sample, vecindad, operaciones por media armónica | 6,0 | −1,6 | 50 % | 68 % |
| 7. Como 6, operaciones por media aritmética escalada | 5,9 | −1,6 | 43 % | 60 % |
| 8. Como 6, ruido igual en todas las unidades | 5,9 | −1,3 | 55 % | 73 % |

Qué se aprendió:

- **Medir con la vecindad** baja el error de 7,1 a 5,9: Orometra elige por vecindad, y la media
  a posteriori solo descuenta la selección si condiciona sobre todos los datos que la decidieron.
- **La varianza del in-sample de las que cumplen tus mínimos está recortada** por la propia
  selección (genético, mínimos, preselección del forward). La variante 6 no la usa: solo la
  pendiente y el residuo de la regresión del forward sobre el in-sample, que esa selección no
  sesga. Es la más justificada; en error, 2, 3, 6, 7 y 8 empatan.
- **Ningún intervalo de dos lados cubre el 95 %.** Con ventaja real la estimación se queda corta
  (en la elegida, la verdad cae por encima del intervalo en 103 de 108 fallos de la ventaja
  propia); sin ventaja, está calibrada. Por eso la app solo da el **límite inferior** de la
  ventaja propia: sin ventaja real queda por encima de cero el 5 % de las veces
  (`REPORT-shrink-calib-2026-10-14.md`).
- El prior no paramétrico (4 y 5) da intervalos aún más estrechos: descartado.
