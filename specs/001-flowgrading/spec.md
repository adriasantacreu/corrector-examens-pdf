# Especificació: reconstrucció modular de FlowGrading

**Estat:** validada (2026-10-05) · **Origen:** app actual (`prova-app-correccio-pc`) + `README/CHRONICLE/GEMINI`

## Objectiu
Refer FlowGrading des de zero amb **la mateixa UI, estètica i funcionalitat**, però modular i preparada per afegir funcionalitats noves (inclosa la preclassificació amb IA).

## Workflow (el «flux» teòric)
1. **Inici**: llista de sessions (targetes) amb sincronització al núvol per fitxer.
2. **Configuració**: pujar PDF d'exàmens (i solucionari opcional), nom de sessió, alumnes (Classroom o llista), pàgines per alumne.
3. **Organitzador de pàgines**: reordenar/moure pàgines i assignar-les als alumnes.
4. **Plantilla**: dibuixar sobre un examen les zones dels exercicis i la del nom; puntuació, rúbrica i mode (suma/resta) per exercici.
5. **Correcció**: alumne per alumne, exercici per exercici: bolígraf, fluorescent (amb llegenda), text, imatges, comentaris del banc, segell de nota, desfer, zoom, dreceres.
6. **Resultats**: notes, enviar correu a l'alumne (plantilla editable), baixar PDF, publicar a Classroom (sempre amb confirmació).

## Funcionalitats (cada una és un mòdul)
| Id | Mòdul | Notes |
|---|---|---|
| F1 | Sessions i persistència | IndexedDB, migració d'esquema, Drive appData |
| F2 | PDF (càrrega, render, miniatures) | worker local |
| F3 | Alumnes i Classroom | importació, emparellament de noms |
| F4 | OCR de noms | per lots, fallback Tesseract |
| F5 | Organitzador de pàgines | |
| F6 | Plantilla (zones, rúbrica) | |
| F7 | Eines d'anotació | pen, highlighter, text, imatge, comentaris |
| F8 | Puntuació i segell | motor únic |
| F9 | Exportació PDF | mateixa disposició que el visor |
| F10 | Correu i Classroom | Gmail API; res visible sense confirmar |
| F11 | **Preclassificació IA** | suggeriments per exercici, aplicar/descartar, mai automàtic |
| F12 | Tema, diàlegs, dreceres | |

## Errors coneguts a no repetir
Model Groq retirat; consultes Drive amb apòstrofs i sense paginació; puntuació calculada en 3 llocs; exportació ≠ visor; arrossegaments de plantilla; historial d'undo global; localStorage limitat; 401 de Google sense gestió; `new Image()` a cada render; worker de pdf.js per CDN.

## Criteris d'acceptació
- Cada pantalla, comparada amb l'original, és visualment idèntica (captura al costat).
- Una funcionalitat nova s'afegeix en un fitxer + un registre, sense editar el nucli.
- Tests de domini en verd, `tsc` i `build` nets.

## Fora d'abast
Canvis d'estètica, de menús o de layouts; funcionalitats noves no demanades.

## Decisions (2026-10-05, OK de l'Adrià)
- **Estètica i funcionalitat idèntiques a l'original** (`main`): és la referència visual i de comportament de tot.
- La IA (F11) **no té interfície pròpia**: s'integra a la rúbrica, als comentaris i a la pantalla de resultats que ja hi ha.
- **La IA és un afegit opcional**: l'app ha de ser 100 % funcional sense la precorrecció (sense proveïdor configurat, cap pantalla ni flux en depèn; la feature F11 s'activa o no via registre).
- **Una sessió per versió** de l'examen (A, B…): no cal suport de versions dins una sessió.
- Inventari de menús i dreceres: s'extreu de l'original (T002) abans de la fase 1.

## F11 · Preclassificació amb IA = el flux de la precorrecció de matrius
Referència: `docs/plans/2026-10-01_precorreccio-matrius-2bat.md` (2BAT, 12 alumnes, validat a l'editor web). Cada pas es correspon amb el que ja fa FlowGrading:

| Precorrecció de matrius | A FlowGrading (sense UI nova) |
|---|---|
| `build_crops.py`: retall per alumne i problema | zones de la **Plantilla** (F6) |
| Solucionari escanejat, retallat per problema | **PDF solucionari** de la sessió, mateixa zona |
| Criteris oficials `checks[]` (descripció, punts, resultat esperat) | **Rúbrica** de l'exercici; el resultat esperat va a `aiInstructions` |
| Regles («qualsevol camí vàlid», sense determinants…) | `aiInstructions` de l'exercici |
| Comentari per apartat, adreçat a l'alumne | **comentari** de l'exercici (`AiSuggestion.comment`) |
| Valoració global transversal (ordre, presentació, claredat) | ⚠ l'original **no té comentari general** per alumne: decidir on va (vegeu pendents) |
| Editor web per validar | **pantalla de Correcció**: la proposta precarrega els comptadors de la rúbrica i el comentari; aplicar / modificar / descartar |
| `reports.py`: informe per alumne | **exportació PDF** (F9) i correu (F10) que ja hi ha |

Regles: la proposta és sempre un suggeriment (estat `pending` fins que l'Adrià l'aplica); mai es publica ni s'envia res sol; temperatura 0, sortida JSON, reintents. Esbós ja fet a la branca `refactor/modular`: `src/services/ai/preGrading.ts` (prompt per criteris + comentari) i `AiSuggestion` a `types.ts`.

Pendent de decidir: **proveïdor** (vegeu la resposta a l'Adrià del 2026-10-05) i **on va la valoració global** (l'original no en té: text a la 1a pàgina, cos del correu o camp nou a Resultats).

Projectes antics que també serveixen de referència: `docencia/legacy/correccio_examens_2eso|maig/` (`auto_detect_crops.py`, registre d'imatge NCC) i `scratch/pregrade_exercises_groq_robust.py`.
