# Tasques

- [x] T000 Constitució, spec i pla escrits (pendent validació)
- [x] T001 **PORTA**: OK de l'Adrià a spec.md i plan.md (2026-10-05: estètica idèntica; IA = flux de matrius dins la UI existent)
- [x] T002 Inventari de menús, botons i dreceres de l'original (només lectura) → `inventari-ui.md`
- [x] T003 Fase 1: demo de les 6 pantalles amb dades fictícies (Inici, Configuració, Organitzador, Plantilla, Correcció, Resultats)
- [x] T004 **PORTA**: validar visualment la demo contra l'original (2026-10-05: OK de l'Adrià, cap error trobat)
- [ ] T005 Fase 2: registre de features i feature de prova
- [ ] T006 Fase 3: F1 sessions · F2 PDF · F3 alumnes · F5 organitzador · F6 plantilla
- [ ] T007 Fase 4: F7 anotacions · F8 puntuació/segell · F9 exportació
- [ ] T008 Fase 5: F10 correu/Classroom · F4 OCR
- [ ] T009 Fase 6: F11 preclassificació IA (partir dels projectes legacy del servidor, vegeu spec.md)
- [ ] T010 Banc de proves automàtic (Playwright headless, dades `?demo=reset`): recorregut de les 6 pantalles, correcció (boli, comentari, destacador, desfer/refer, navegació, nota), fidelitat PDF↔pantalla (posició/mida ±2 px, nota impresa), captures de referència; `test:fast` al pre-commit, `npm run e2e`/`verify` a part; regla d'agents a les instruccions del projecte
