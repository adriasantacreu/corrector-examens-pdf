# Especificació: informe de correcció (bloc C)

**Carpeta**: `specs/003-informe` · **Creada**: 2026-10-06 · **Estat**: esborrany, pendent de l'OK de l'Adrià
**Entrada**: «No em dones opció de fer l'informe com el de la precorrecció» + decisió del 2026-10-05: dos exportadors a triar (001 §F11, «Dos exportadors»).

**Límit fix (constitució I)**: la pantalla de Resultats no es redissenya. S'hi afegeix només la tria del format allà on ja hi ha «Baixar tots els PDF» i el botó per alumne.

## Què és l'informe

El mateix que fa `scratch/2026-10-01_precorreccio/reports.py`, però des de l'app i amb les dades de FlowGrading. Per alumne:

1. **Capçalera**: matèria i curs, títol de l'examen i data; alumne, grup i **nota final** (vermella si < 5, verda si no).
2. **Per exercici**: les pàgines del retall **amb les anotacions** (com l'exportador actual), i després un bloc amb el títol de l'exercici, la nota (verd = màxim, ambre = parcial, vermell = 0) i:
   - la **rúbrica**: criteri · vegades aplicat · punts;
   - els **fluorescents amb criteri** (preset): etiqueta · punts;
   - els **comentaris del banc** amb punts.
3. **Resum**: taula exercici · punts · màxim, total i nota final destacada.

Estètica `adria`: Noto Sans, blau fosc (25, 75, 135) per als títols, taules amb línies a dalt i a baix (com `booktabs`), coma decimal.

## Escenaris d'usuari

### H1 — Triar el format en exportar (P1)
1. **Donat** Resultats, **quan** exporto un alumne o tots, **llavors** puc triar «PDF corregit» (l'actual) o «Informe». L'última tria es recorda.
2. **Donat** «PDF corregit», **llavors** surt exactament el mateix que ara (cap canvi a les proves de fidelitat).

### H2 — L'informe diu el mateix que la pantalla (P1)
1. **Donat** un alumne, **llavors** la nota de cada exercici i la final de l'informe són les mateixes que les de Resultats i la Correcció (una sola funció de puntuació, `domain/scoring.ts`).
2. **Donat** un exercici sense rúbrica ni presets, **llavors** el bloc només mostra la nota (sense taula buida).

### H3 — Funciona sense IA, sense servidor i a la demo (P1)
1. **Donat** la demo pública o un ordinador sense connexió, **llavors** l'informe es genera igual (tot al navegador).

### H4 — Envia l'informe per correu (P2)
1. **Donat** l'enviament per correu de Resultats (F10), **quan** el format triat és «Informe», **llavors** s'adjunta l'informe. Com ara, res s'envia sense confirmar.

## Fora d'abast (ara)
- **Valoració global** de l'alumne (001: «pendent de decidir on va»). L'informe hi deixa el lloc preparat i no surt si és buida.
- Les marques de la IA (bloc D) i les respostes esperades per criteri («Esperat: …» de la precorrecció): arribaran amb el bloc D.

## Criteris d'acceptació
- Proves unitàries de la taula de l'informe (dades → files, notes i colors).
- e2e: exportar l'informe d'un alumne de la demo, llegir-ne el text (pdf.js) i comprovar nom, nota de cada exercici i final = les de pantalla.
- Captura de la primera pàgina i del resum, revisades a mà.
- `npm run verify` en verd.
