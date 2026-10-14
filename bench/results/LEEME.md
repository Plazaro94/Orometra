# Qué es cada archivo

Cada `.jsonl` tiene una línea por caso y sale de `node bench/run.js <tanda> [escenarios]`, con
`BENCH_TAG` y `BENCH_OPTS` si es una variante del motor. Cada `REPORT-<nombre>.md` del banco es
su informe (`node bench/report.js <nombre>`). Los demás informes salen de su propio script, que
se indica en la tabla. Los hashes son el commit del motor con el que se generó cada tanda.

## Exámenes y calibraciones del motor

| Archivo | Motor | Semillas | Nota |
|---|---|---|---|
| `calib-c948971-n100.jsonl`, `test-c948971-n100.jsonl` y sus `REPORT-` | `c948971` | 1-100 / 1001-1100 | Primera medición con 100 semillas, motor anterior al banco |
| `REPORT-calib-motor-c948971.md`, `REPORT-test-motor-c948971.md` | `c948971` | 1-40 / 1001-1040 | Medición inicial con 40 semillas (ver enmienda 2); su `.jsonl` no se conservó |
| `calib-V1..V7.jsonl` y sus `REPORT-` | variantes | 1-100 | Variantes de la primera calibración (#74, 2026-09-29): base del refugio sobre configuraciones con forward, representante por media y regla crítica de forward (V5, V6). Las opciones exactas de cada una no constan |
| `calib-T0.6.jsonl`, `calib-T0.65.jsonl`, `calib-T0.7.jsonl` | variantes | 1-100 | Corte crítico del forward al 60, 65 y 70 % (#75, 2026-09-29), del que salió el 65 % actual (`plateauForwardCritical`). Sin informe |
| `calib-final`, `test-final` | `40f79b7` | 1-100 / 1001-1100 | Primer examen (no del todo ciego: ver enmienda del 2026-09-29) |
| `calib-final2` | `a3352bc` | 1-100 | Calibración tras la segunda auditoría |
| `exam2`, `exam2-40f79b7`, `exam2-c948971` | `a3352bc` / anteriores | 2001-2100 | **Segundo examen, ciego**, con los tres motores |
| `calib-warn.jsonl` | `2cb1fe5` | 1-100 | Calibración con los avisos de cada caso (`diag.warn`), para estudiar cuándo podría salir «sólida» (2026-10-09) |
| `calib-v3`, `calib-v3b` | `f799e7d` / `22b4b3d` | 1-100 | Calibración de «buena» y «sólida» por criterios (enmiendas del 2026-10-09) |
| `exam3`, `exam3-motor-1be66b1` | `f799e7d` / anterior | 3001-3100 | **Tercer examen, ciego**: suspende «buena o sólida» ≤ 2 % en S5 (3 %); el motor anterior, para comparar |
| `exam4`, `exam4-motor-1be66b1` | `22b4b3d` / anterior | 4001-4100 | **Cuarto examen, ciego**; el anterior, para comparar |
| `calib-v4` | `36be999` | 1-100 | Calibración tras corregir el tope de 0,82 de la estabilidad frente a los umbrales |
| `exam5`, `exam5-motor-22b4b3d` | `36be999` / anterior | 5001-5100 | **Quinto examen, ciego**; el anterior, para comparar (mismos tres suspensos). Lo citó la portada hasta el sexto |
| `calib-motor-dbcc488.jsonl` | `dbcc488` | 1-100 | Calibración con el motor publicado antes de la auditoría estadística del 2026-10-14 (referencia) |
| `calib-2026-10-14` | `f778c5b` | 1-100 | Calibración tras la auditoría estadística (umbral del Sharpe al percentil 95, expectativa ajustada) |
| `calib-fw-none.jsonl`, `calib-fw-strong.jsonl` | `f778c5b` con `rankForward` | 1-100 | Orden entre mesetas sin el peso del forward y con el peso entero; el banco no lo distingue (enmienda del 2026-10-14) |
| `exam6`, `exam6-motor-dbcc488` | `f778c5b` / anterior | 6001-6100 | **Sexto examen, ciego**, motor actual; el anterior, para comparar (elige lo mismo en los 800 casos). **Cifras que cita la portada** (`tests/home-bench.test.js` las lee de `REPORT-exam6.md`) |

## Estudios aparte

| Archivo | De dónde sale | Nota |
|---|---|---|
| `calib-orden-tabla.jsonl`, `calib-orden-tabla-pf1.4.jsonl`, `exam5-orden-tabla.jsonl`, `REPORT-calib-orden-tabla.md` | `bench/orden-tabla.js` | Si el aviso «La regla "primera de Result" falla» cambiaba algún nivel al dejar de ser crítico (2026-10-11). Estos `.jsonl` tienen otro formato: `bench/report.js` no los lee |
| `REPORT-shrink-calib-2026-10-14.md`, `REPORT-shrink-exam6.md` | `node bench/shrink.js calib-2026-10-14` / `exam6` | Expectativa ajustada por selección frente a la verdad del no visto |
| `REPORT-shrink-variantes-2026-10-14.md` | `bench/shrink.js` con cada variante | Las ocho variantes de la expectativa ajustada probadas en la calibración |
| `calib-S1_S2_S3_S4_S5_S6_S7_S8_S9_S10-orden-current.jsonl`, `-expected`, `-lower` | `BENCH_TAG=orden-<regla> BENCH_OPTS='{"plateauRank":"<regla>"}' node bench/run.js calib S1,…,S10` | Orden entre mesetas con R0 (`current`), R1 (`expected`) y R2 (`lower`), con los escenarios S9 y S10 (enmiendas del 2026-10-14 (b) a (d)). Su parte S1-S8 de R0 es la misma que `calib-2026-10-14` |
| `REPORT-orden-mesetas-calib.md`, `REPORT-orden-calib-R0-s1s8.md`, `-R1-s1s8`, `-R2-s1s8` | `node bench/orden-mesetas.js calib-S1_…_S10-orden` | Los criterios prerregistrados aplicados a las tres reglas. Los `REPORT-orden-calib-R*-s1s8.md` los vuelve a escribir el script cada vez: son el informe del banco de cada regla en S1-S8 |
