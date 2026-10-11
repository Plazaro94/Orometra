# El aviso «La regla "primera de Result" falla» deja de bajar el nivel (2026-10-11)

Hasta el 2026-10-11 era **crítico** cuando el orden de la columna Result fallaba al cruzar
periodos la mitad de las veces o más **y** menos de 1 de cada 4 configuraciones cumplía los
mínimos en los dos periodos. Metodología dice que los avisos sobre el orden de la tabla se
enseñan pero no bajan el nivel; este era la excepción, sin escribir. Ahora es un aviso sobre el
orden de la tabla, como los demás.

Con la regla anterior, un caso solo habría tenido otro nivel si el aviso salta y no hay ningún
otro crítico. `node bench/orden-tabla.js` cuenta exactamente eso con el motor actual.

| Casos | Mínimos | Salta el aviso | Sin otro crítico | Nivel que cambia | Dentro del margen de error del 50 % |
|---|---|---|---|---|---|
| Calibración (semillas 1-100), sin ventaja (S1, S2, S5) | por defecto | 138 de 300 | 0 | **0** | |
| Calibración, con ventaja (S3, S4, S6, S7, S8) | por defecto | 80 de 500 | 0 | **0** | |
| Calibración, todos | por defecto | 218 de 800 | 0 | **0** | 12 de 218 |
| Calibración, todos | factor de beneficio ≥ 1,40 | 307 de 800 | 0 | **0** | 17 de 307 |
| Quinto examen (5001-5100, ya publicado), todos | por defecto | 216 de 800 | 0 | **0** | 11 de 216 |

Lectura:

- **No aportaba nada al nivel.** En 2.400 casos nunca fue el único crítico (siempre hay de 2 a 5;
  casi siempre, «no se ha encontrado ninguna meseta»). Quitarlo no cambia ningún nivel, así que
  las cifras del quinto examen que citan la portada y Metodología siguen valiendo.
- **Dependía de lo exigente que fuese el usuario, no de los datos.** Con un factor de beneficio
  mínimo de 1,40 salta 307 veces frente a 218: la parte «menos de 1 de cada 4 cumple en los dos
  periodos» baja por construcción al subir los mínimos.
- El margen de error de la estimación (±2 puntos) solo importaba en un 5 % de los disparos.

El banco es simulado: en datos reales podría darse un caso en que fuera el único crítico; con la
regla nueva saldría con el nivel que dan el resto de criterios en vez de «débil». En 2.400 casos
simulados no ha ocurrido.

Datos: `calib-orden-tabla.jsonl`, `calib-orden-tabla-pf1.4.jsonl`, `exam5-orden-tabla.jsonl`.
