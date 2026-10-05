# Comportament esperat de FlowGrading

Què **havia de fer** l'app (la «funcionalitat teòrica»), no només el que fa el codi de `main`. La v2 ha de ser idèntica en UI i **funcional del tot**: el que a l'original falla s'hi fa bé; el que no existeix però era la idea, es marca per decidir.

Fonts: `inventari-ui.md` (UI), README/CHRONICLE/CHANGELOG_SESSION/GEMINI/TODO de l'original, historial de git (102 commits, ~40 de «fix»), estudi del codi del 22/09–01/10 (sessió `a311b50c`) i peticions de l'Adrià.

Llegenda: ✅ funciona · ⚠ existeix però falla · ❌ era la idea però no hi és · 🗑 no es porta

## Principis (de l'Adrià)
- L'estètica, els menús i els layouts no canvien; el que canvia és el funcionament per dins, que ha d'estar arreglat.
- Modular: cada funcionalitat o camí nou s'afegeix sense que el codi base creixi.
- La IA és un afegit opcional.
- Cada demo s'ensenya amb **enllaç públic**.

## 0 · Transversal
| Ha de fer | Original | v2 |
|---|---|---|
| Guardar tot sol (zones, notes, traços, OCR) i recuperar-ho amb F5 | ⚠ estat a `localStorage` (~5 MB): les sessions grans es perden | IndexedDB, esquema versionat amb migració |
| Sincronitzar amb Drive per fitxer (PDF, solucionari, estat) | ⚠ consultes trencades amb apòstrofs, sense paginació, desades simultànies que es trepitgen | consultes escapades, paginació, cua de desades |
| Sessió de Google caducada → avisar i reconnectar net | ⚠ estat «zombi» en alguns camins (401 no gestionat a tot arreu) | un sol client Google amb 401 → reconnexió |
| Diàlegs propis (mai `alert/confirm`), Esc global, tema clar/fosc sense flaix | ✅ | igual |
| PDF.js | ⚠ worker per CDN (sense xarxa no va) | worker local |

## 1 · Inici
| Ha de fer | Original | v2 |
|---|---|---|
| Deixar anar un PDF → sessió nova i preguntar si se sincronitza al núvol | ✅ | igual |
| Targetes de sessions recents: progrés, continuar, reanomenar, eliminar, núvol per fitxer | ✅ | igual |
| Si el PDF no és a la memòria cau → demanar-lo o baixar-lo de Drive | ⚠ irregular | flux únic: cau → Drive → demanar |

## 2 · Configuració
| Ha de fer | Original | v2 |
|---|---|---|
| Pàgines per examen ⇄ total d'alumnes, l'un calcula l'altre | ✅ | igual |
| Canviar el nombre d'alumnes **sense perdre** el que ja hi ha | ⚠ es regeneren els alumnes i es perden assignacions | conservar i només afegir o treure al final |
| Solucionari (segon PDF) | ⚠ es carrega i s'organitza però **no es fa servir enlloc** | vegeu la pregunta 1 |
| Alumnes de Classroom (curs → sincronitzar) o llista enganxada | ✅ | igual |

## 3 · Organitzador de pàgines
| Ha de fer | Original | v2 |
|---|---|---|
| Moure pàgines en cascada o d'una en una, ignorar, arrossegar, afegir/treure alumne, restablir | ⚠ l'arrossegament depèn d'un `setTimeout` i a vegades falla | arrossegament determinista |
| Assignar les pàgines del solucionari | ✅ (però no serveix per a res després) | vegeu la pregunta 1 |

## 4 · Plantilla
| Ha de fer | Original | v2 |
|---|---|---|
| Dibuixar zones (R), pàgina completa (P), àrea de nom (N), àrea de nota (S), seleccionar (V) | ✅ | igual |
| Moure i redimensionar zones sense sortir del paper | ⚠ salts: la zona torna a 0, l'arrossegament de les nanses es propaga, coordenades barrejades | un sol espai de coordenades |
| Flux de teclat (nom seleccionat → Enter/Tab → nota), auto-repartiment, avís de suma > màxim | ✅ | igual |
| Àrea de codi QR (`qr_code`) | 🗑 tipus definit, cap eina | no es porta |

## 5 · Correcció
| Ha de fer | Original | v2 |
|---|---|---|
| Eines (boli, goma, text, destacador, colors, gruix, opacitat), dreceres | ⚠ dos gestors de teclat duplicats | un de sol |
| Desfer (Ctrl+Z) | ⚠ historial **global**: desfer pot esborrar un traç d'un altre alumne o exercici | historial per alumne i exercici |
| Destacadors predefinits amb punts i límit; banc de comentaris amb punts i límit | ⚠ un clic sense arrossegar crea destacadors de mida 0 | ignorar els de mida 0 |
| Nota de l'exercici i nota final en temps real; segell de nota | ⚠ la nota es calcula en **3 llocs** que no coincideixen (l'exportació ignora els límits) | un sol motor de puntuació |
| Exercici a dues pàgines (costat a costat) | ✅ al visor | igual |
| Rendiment | ⚠ `new Image()` a cada render | memòria cau d'imatges |

## 6 · Resultats
| Ha de fer | Original | v2 |
|---|---|---|
| Llista de notes, vinculació manual amb Classroom | ✅ | igual |
| Baixar el PDF d'un alumne o de tots | ⚠ l'exportació no coincideix amb el visor (2a pàgina, costat a costat) | la mateixa disposició que el visor |
| Correu amb plantilla (`{nom}`, `{nota}`, `{nota_maxima}`), de prova, individual i massiu | ✅ | igual, sempre amb confirmació |
| **Publicar les notes a Classroom** | ❌ el README ho promet, però no existeix | vegeu la pregunta 2 |
| Informe a l'estil de matrius | ❌ (nou) | segon exportador, decidit 2026-10-05 |

## 7 · OCR de noms
| Ha de fer | Original | v2 |
|---|---|---|
| Llegir el nom de cada examen i emparellar-lo amb la llista (Levenshtein) | ⚠ **no funciona**: el model de Groq s'ha retirat; el mosaic té números de 10 px | proveïdor d'OCR intercanviable (com la IA) per lots, i Tesseract com a alternativa |

## Preguntes per a l'Adrià
1. **Solucionari a la correcció**: entenc que la idea era veure la solució de l'exercici al costat mentre corregeixes, per això l'organitzes. Era així? On el vols: un panell plegable o un botó per alternar-lo?
2. **Publicar notes a Classroom**: el README ho promet. Hi ha de ser? Seria un tercer camí a Resultats (sempre amb confirmació).
3. Hi ha **alguna cosa que no funcionés** i que no surti en aquesta llista? Tu l'has feta servir i jo només n'he llegit el codi.
