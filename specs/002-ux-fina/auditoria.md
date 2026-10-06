# Auditoria d'accions (B004)

**Data**: 2026-10-05 · **Mètode**: rastrejador Playwright sobre la demo pública (`?demo=reset`, 1440×900, clar). Per a cada pantalla, clica **cada element clicable** (cursor de mà, `button`, `select`, `input`) un a un, amb context de navegador net, i anota: canvi al DOM o al canvas, errors de consola, excepcions, diàlegs natius, descàrregues, selector de fitxers. Els botons de Google s'ometen (cal sessió real). Complementat amb una revisió del codi de les accions lentes i dels `catch`.

**Estat (2026-10-06)**: B005 fet. Totes les files de les taules estan arreglades, V3 i V4 arreglades a B007 (C5 i C6: `e2e/fidelity.spec.ts`, `e2e/correction.spec.ts`, `keepInPaper.test.ts`). Ho proven `e2e/feedback.spec.ts` (A1–A3, D1, D2, E1) i les captures revisades (A4, V1).

**Resum**: 159 elements (7 pantalles, inclosa la llista de sessions) · 0 excepcions · 0 diàlegs natius (`alert`/`confirm`) · 2 errors de consola (401 de l'OCR per IA, esperat a la demo estàtica). Els «muts» són els de la taula de sota; la resta respon.

## Clics muts o sense explicació

| # | Pantalla | Acció | Què passa | Correcció (B005) |
|---|---|---|---|---|
| A1 | Correcció | `SCROLL`/`COMPLET` en un exercici de retall | No fa res (només val per a exercicis de pàgina sencera) | Desactivat, amb un títol que diu per què |
| A2 | Correcció | `+` del nou comentari amb el text buit | No fa res | Desactivat fins que hi ha text |
| A3 | Organitzador | Moure grup ↑ del primer alumne / ↓ del darrer | No fa res | Desactivats als extrems |
| A4 | Resultats | «Enviament massiu», «Correu de prova», «Enviar correu» sense Google | Desactivats sense dir per què | Títol: «Connecta amb Google per enviar correus» |

No compten com a muts:
- `select` natius: obren el desplegable.
- Selectors de color: obren el selector del sistema.
- «Ajustar a la pàgina»: ja està ajustada.
- «Dibuixar zona»: ja és l'eina activa.
- Elements fora de la pantalla (y > 900).

## Errors que no arriben a l'usuari

| # | On | Què passa | Correcció (B005) |
|---|---|---|---|
| E1 | Desat de la sessió (`useSessionStore`) | Si IndexedDB falla, `saveError` es calcula però **no es mostra enlloc**: es pot perdre feina sense saber-ho | Avís fix mentre no es pugui desar |
| E2 | Correcció (`useExerciseRender`) i Plantilla (`TemplateDefiner`) | Si una pàgina no es pot pintar, només `console.error`: retall en blanc | Missatge al lloc del retall, amb «Torna-ho a provar» |
| E3 | Resultats · enviament massiu | Si en fallen uns quants, el toast és verd («èxit») i no diu quins | Toast d'error amb el nombre i els noms dels que han fallat |
| E4 | Plantilla · OCR de noms | Si la IA no respon (401 a la demo), passa a Tesseract sense dir-ho | Avís discret: «IA no disponible: s'ha fet servir l'OCR local» |

## Accions destructives sense confirmació ni desfer

| # | On | Acció | Correcció (B005) |
|---|---|---|---|
| D1 | Organitzador | Paperera d'un grup (esborra un alumne sencer amb les seves pàgines) | Confirmació dins l'app (`showConfirm`) |
| D2 | Correcció | Esborrar un fluorescent predefinit (`Delete`) | Confirmació si hi ha anotacions que el fan servir |

Ja tenen confirmació:
- eliminar sessió;
- netejar tot;
- eliminar exercici;
- restablir l'organitzador;
- eliminar-ho tot (llistat);
- enviar correus.

## Detalls visuals (errors, no redisseny)

| # | On | Què passa | Correcció |
|---|---|---|---|
| V1 | Correcció · panell dret | El títol «Rúbrica» surt tallat («…ica»): `HandwrittenTitle` es desplaça −3,5 rem i el panell el talla (igual a l'original) | `noMargin`, com «Generals» (B005) |
| V2 | Inici · targetes | La data surt en el format de l'idioma del navegador (`10/4/2026` en anglès) | Format fix `ca-ES` (B005) |
| V3 | Correcció | La llegenda del segell queda sota la barra de zoom i a tocar de la vora | ✓ C5: segell a la zona lliure (B007) |
| V4 | Correcció | L'etiqueta d'un fluorescent a dalt del retall trepitja l'enunciat | ✓ C6: etiqueta a sota si no hi cap (B007) |

## Fora d'abast (anotat)

- `?demo=reset` no oblida l'última sessió oberta: surt a «Continuar PDF» pel nom de fitxer. Només afecta la demo.
- Les accions lentes que ja tenen progrés i resultat:
  - obrir un PDF;
  - recuperar-lo del núvol;
  - sincronitzar;
  - OCR;
  - baixar els PDF (amb %);
  - enviar correus (amb comptador).
