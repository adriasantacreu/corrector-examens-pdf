# Especificació: reconstrucció modular de FlowGrading

**Estat:** esborrany per validar · **Origen:** app actual (`prova-app-correccio-pc`) + `README/CHRONICLE/GEMINI`

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

## Pendent de decisió (ho preguntaré)
- Inventari exacte de menús/dreceres: l'extrec de l'original abans de la fase 1.
- IA: proveïdor (Groq/qwen vs ia-gateway del servidor) i criteris per exercici.
