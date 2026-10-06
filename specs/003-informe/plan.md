# Pla tècnic: informe de correcció (bloc C)

## Decisions

| Tema | Decisió | Per què |
|---|---|---|
| On es genera | **Al navegador amb pdf-lib** (ja és dependència) + `@pdf-lib/fontkit` per incrustar Noto Sans (regular i negreta, subconjunt) | LaTeX al servidor no funcionaria a la demo pública ni sense connexió; mateix camí que l'exportador actual |
| Pàgines dels exercicis | Reutilitzar el pintat de `pdfExport.ts` (retall + anotacions), sense duplicar-lo | Fidelitat pantalla↔PDF ja provada |
| Dades | `domain/report.ts`: funció pura `buildReport(session, student) → ReportModel` (blocs, files, notes, colors). El pintat (`services/pdf/reportPdf.ts`) només dibuixa el model | Es prova sense PDF; un altre format (HTML, correu) només és un pintat nou |
| Registre | Tots dos són `exporters` (`{id, label, exportStudent, exportAll}`) en una llista; Resultats en llegeix les opcions | Camí per a futurs exportadors (001 §Camins) sense tocar el nucli |
| Tria | Selector al costat dels botons d'exportar que ja hi ha; es desa a la sessió | Constitució I: no canviar el layout |
| Text llarg | Ajust de línia propi (amplada mesurada amb la font) i salt de pàgina automàtic | pdf-lib no talla línies |

| Fet: ordre | Primer les pàgines de l'informe (capçalera, nota final, resum amb barres verd/ambre/vermell, detall per exercici) i al darrere l'examen corregit sencer, escalat a A4 | L'alumne veu la nota i el perquè abans dels fulls |
| Fet: dades | Títol = àlies de la sessió o nom del fitxer; data = dia d'exportar. Sense assignatura ni grup (no són a la sessió) | No inventar camps |
| Fet: punts | Escalats a la nota final, com el segell; els fluorescents i comentaris s'agrupen per preset/banc amb el seu límit | Mateix motor (`scoring.ts`) |
| Fet: glifs | Noto Sans no té `−`, `≤`, `√`: negatius amb guió mitjà `–` i `printable()` substitueix el que falti | Abans sortia un forat |
| Fet: fonts | Subconjunt (llatí, grec, fletxes, operadors) ~64 kB cadascuna a `src/assets/fonts/` (OFL), carregades només en exportar | No pesa a l'arrencada |
| Fet: tria | `session.exportFormat` ('pdf' per defecte); el correu adjunta el format triat | |

## Fitxers
- Nous: `src/domain/report.ts` + test · `src/services/pdf/reportPdf.ts` · `src/services/export/registry.ts` · `src/assets/fonts/NotoSans-*.ttf` (OFL) · `e2e/report.spec.ts`
- Modificats: `ResultsView.tsx` (selector + crida al registre) · `package.json` (`@pdf-lib/fontkit`)
