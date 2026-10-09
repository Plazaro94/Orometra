# Qué es cada archivo

Cada `.jsonl` tiene una línea por caso; cada `REPORT-*.md` es su informe (`node bench/report.js <nombre>`).

| Archivo | Motor | Semillas | Nota |
|---|---|---|---|
| `calib.jsonl`, `test.jsonl`, `REPORT-calib.md`, `REPORT-test.md` | `c948971` | 1-100 / 1001-1100 | Primera medición con 100 semillas; `test.jsonl` es el mismo contenido que `test-c948971-n100.jsonl`. El título de `REPORT-test.md` es de cuando eran 40 semillas |
| `REPORT-calib-motor-c948971.md`, `REPORT-test-motor-c948971.md` | `c948971` | 1-40 / 1001-1040 | Medición inicial con 40 semillas (ver enmienda 2) |
| `calib-c948971-n100.jsonl`, `test-c948971-n100.jsonl` | `c948971` | 1-100 / 1001-1100 | Referencia del motor anterior |
| `calib-V1..V7`, `calib-T0.6..T0.7` | variantes | 1-100 | Pruebas de calibración (opciones en `BENCH_OPTS`) |
| `calib-final`, `test-final` | `40f79b7` | 1-100 / 1001-1100 | Primer examen (no del todo ciego: ver enmienda del 2026-09-29) |
| `calib-final2` | esta versión | 1-100 | Calibración tras la segunda auditoría |
| `exam2`, `exam2-40f79b7`, `exam2-c948971` | esta versión / anteriores | 2001-2100 | **Segundo examen, ciego**, con los tres motores |
| `calib-warn.jsonl` | `2cb1fe5` | 1-100 | Calibración con los avisos de cada caso (`diag.warn`), para estudiar cuándo podría salir «sólida» (2026-10-09) |
| `calib-v3`, `calib-v3b` | `f799e7d` / `22b4b3d` | 1-100 | Calibración de «buena» y «sólida» por criterios (enmiendas del 2026-10-09) |
| `exam3`, `exam3-motor-1be66b1` | `f799e7d` / anterior | 3001-3100 | **Tercer examen, ciego**: suspende «buena o sólida» ≤ 2 % en S5 (3 %); el motor anterior, para comparar |
| `exam4`, `exam4-motor-1be66b1` | `22b4b3d` / anterior | 4001-4100 | **Cuarto examen, ciego**, motor publicado; el anterior, para comparar. Cifras que cita la portada |
