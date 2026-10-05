# Inventari de la UI de l'original (T002)

Font: branca `main` (18/03/2026), només lectura. Referència per comparar la demo (T003/T004). Línies = fitxer de `main`.

## Navegació
`mode`: `upload` (Inici) → `setup` (Configuració) → `organize_pages` → `configure_crops` (Plantilla) → `correction` → `results`. «Enrere» (`ChevronLeft`) torna al pas anterior (`App.tsx:871`).
Pantalla de correcció en ús: **`CorrectionViewB.tsx`** (`CorrectionView.tsx` és codi mort; no es porta).

## Comú a totes les pantalles (capçalera unificada)
| Element | Detall |
|---|---|
| Enrere | `ChevronLeft`, títol «Enrere» |
| Nom de la sessió | editable en línia («Clic per canviar el nom de la sessió»): Enter desa, Esc cancel·la |
| Tema clar/fosc | `Moon`/`Sun` |
| Google | «Connecta» (sense sessió) / `LogOut` (amb sessió) |
| Següent | `ChevronRight` / `Check` (acció del pas) |
| Diàlegs propis | targeta amb «Cancel·lar» i «D'acord» (`Check`), en lloc dels natius |
| Títols | `HandwrittenTitle` (Caveat), colors verd/vermell |
| Esc global | treu el focus de qualsevol camp (`App.tsx:167`) |

## 1 · Inici (`upload`)
- Logo animat `FlowGradingLogo`, «Deixa anar el PDF» (zona d'arrossegar), «Connecta amb Google».
- Fletxa `ArrowDown` → «Darreres sessions».
- Targetes de sessió: «Continuar PDF %» (`RefreshCw`), reanomenar (`Pencil`, Enter/Esc), eliminar (`Trash2` + confirmació «Eliminar sessió»), sincronització al núvol per fitxer (`Cloud`, «Sincronitzar ara»).

## 2 · Configuració (`setup`) — «Configuració de l'examen»
- **Pàgines i alumnes**: pàgines per alumne, «Total alumnes».
- **Solucionari**: segon PDF (opcional), amb eliminar (`Trash2`) i sincronitzar (`RefreshCw`).
- **Carrega el teu llistat**: «Connecta amb Google» (Classroom) · «O enganxar llista manual» (`ClipboardPaste`) → «Enganxar llista» + «Guardar llista».
- «Llistat d'alumnes importats»: taula (Nom de l'alumne · Acció) i «Eliminar-ho tot» (`UserMinus`, confirmació).

## 3 · Organitzador de pàgines
- Validar (`Check`), «Restablir original» (`RotateCcw`).
- Per alumne: navegar pàgines (`ChevronLeft/Right`), «Moure EN CASCADA amunt/avall» (`ChevronsUp/Down`), «Moure només 1 pàgina amunt/avall» (`ArrowUp/Down`), ignorar pàgina, arrossegar pàgina, moure grup (`ChevronUp/Down`), eliminar grup (`Trash2`), «Afegir nou alumne» (`Plus`).
- Nom del grup editable (Enter/Esc).

## 4 · Plantilla (`configure_crops`) — «Definir plantilla»
| Eina | Tecla |
|---|---|
| Dibuixar zona (`Square`) | R |
| Afegir pàgina completa (`FileText`) | P |
| Àrea de nom OCR (`TextSelect`) | N |
| Àrea de nota final (`Award`) | S |
| Seleccionar / moure (`MousePointer2`) | V |
| Esborrar seleccionat | Supr / Retrocés |
| Zoom: allunyar / apropar / ajustar | − / + / `RefreshCw` · Ctrl+roda |

- Panells: «Regions de control» (OCR i nota final; «Tornar a executar OCR») i «Exercicis corregibles».
- Per exercici: nom (seleccionat en crear-lo; Enter/Tab → nota màxima), nota màxima, mode «0 ↑» / «MAX ↓», pàgines, eliminar.
- Rúbrica: «Concepte...» + punts, `Plus`, auto-repartiment (es desactiva si s'edita una nota), avís si la suma passa del màxim (un sol cop, sense bloquejar).
- Navegació de pàgines de l'examen (`ChevronLeft/Right`); doble clic per redimensionar una zona, sense sortir dels marges.

## 5 · Correcció (`CorrectionViewB`)
**Barra superior**: «Tornar a Configuració», exercici anterior/següent («Exercici N — nom»), «ocupa dues pàgines» (`Maximize2`/`AlignJustify`), tema, Google, «Finalitzar» (`Send`, «Finalitzar i enviar notes per correu»).

**Barra lateral d'eines**
| Eina | Tecla |
|---|---|
| Seleccionar | V |
| Boli | P |
| Goma | X |
| Text | T (Enter confirma, Maj+Enter salt, Esc cancel·la) |
| Destacador | H |
| Colors del boli | Q vermell · W taronja · E blau · R indi · A verd · S negre (+ color personalitzat) |
| Gruix i opacitat del boli | lliscadors |
| Destacadors predefinits | 1–9 (globals + de l'exercici) |
| Desfer | Ctrl+Z (`^Z`) |
| Esborrar seleccionat | Supr (`DEL`) |
| Zoom | − / + / ajustar · Ctrl+roda |
| Navegar | Espai/→ següent, ← anterior, ↓/↑ (alumne/exercici) |
| Esc | desselecciona / surt del camp |

**Panell dret**
- Alumne anterior/següent (nom; títol amb el nom OCR).
- **Rúbrica**: comptadors −/+ per criteri, «Editar rúbrica» (`Pencil`/`Check`): descripció, punts, afegir (`Plus`), eliminar.
- **Destacadors predefinits** (fluorescent amb etiqueta): crear, editar (`Pencil`), eliminar (`Trash2`), límit de contribució («Límit…»), mode llegenda/individual («Toggle Legend Mode»).
- **Banc de comentaris** (globals i per exercici): «Text...» + «Pts» + «Cap», confirmar (`Check`), × per treure'n.
- Anotació seleccionada: canviar color, eliminar, `Check`.
- **Segell de nota**: canvi de posició amb confirmació (aplicar a tots / només aquest / «Cancel·lar»).
- Pantalla final: «Definir zones», «Tornar a començar» (`RefreshCw`), «Sortir»; sense zones: «Tornar a Configuració» / «Provar següent».

## 6 · Resultats — «Resultats i exportació»
- Capçalera: «Configurar plantilla del missatge» (`MessageSquareText`) → «Plantilla de correu» («Restaurar defecte», «Desar i tancar»), «Enviament massiu» (`SendIcon`), «Baixar tots els PDF» (`FileDown`, «Generant… %»).
- «Llistat de qualificacions», per alumne: vinculació manual a Classroom / «Desvincular» (`XCircle`), «Baixar PDF» (`Download`), «Rebre correu de prova (format real)» (`MailCheck`), «Enviar correu a l'alumne» (`SendIcon`).

## Observacions per a la reconstrucció
- La correcció té **dos gestors de teclat** que se solapen (`CorrectionViewB.tsx:574` i `:977`, tots dos amb V/P/T/H/X, Supr i Ctrl+Z): a la v2, un de sol.
- El text del codi barreja català i anglès («Undo», «Edit», «Pen Width», «Toggle Legend Mode»): els títols es mantenen tal com estan per fidelitat, llevat que l'Adrià digui el contrari.
