# Pla tècnic: informe de correcció (bloc C)

## Decisions (proposta)

| Tema | Decisió | Per què |
|---|---|---|
| On es genera | **Al navegador amb pdf-lib** (ja és dependència) + `@pdf-lib/fontkit` per incrustar Noto Sans (regular i negreta, subconjunt) | LaTeX al servidor no funcionaria a la demo pública ni sense connexió; mateix camí que l'exportador actual |
| Pàgines dels exercicis | Reutilitzar el pintat de `pdfExport.ts` (retall + anotacions), sense duplicar-lo | Fidelitat pantalla↔PDF ja provada |
| Dades | `domain/report.ts`: funció pura `buildReport(session, student) → ReportModel` (blocs, files, notes, colors). El pintat (`services/pdf/reportPdf.ts`) només dibuixa el model | Es prova sense PDF; un altre format (HTML, correu) només és un pintat nou |
| Registre | Tots dos són `exporters` (`{id, label, exportStudent, exportAll}`) en una llista; Resultats en llegeix les opcions | Camí per a futurs exportadors (001 §Camins) sense tocar el nucli |
| Tria | Selector al costat dels botons d'exportar que ja hi ha; es desa a la sessió | Constitució I: no canviar el layout |
| Text llarg | Ajust de línia propi (amplada mesurada amb la font) i salt de pàgina automàtic | pdf-lib no talla línies |

## Fitxers
- Nous: `src/domain/report.ts` + test · `src/services/pdf/reportPdf.ts` · `src/services/export/registry.ts` · `public/fonts/NotoSans-*.ttf` (OFL) · `e2e/report.spec.ts`
- Modificats: `ResultsView.tsx` (selector + crida al registre) · `package.json` (`@pdf-lib/fontkit`)
