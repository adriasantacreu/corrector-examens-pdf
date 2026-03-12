# Registre de Canvis - Sessió de Refinament FlowGrading

Aquest document detalla totes les millores, correccions i canvis de disseny aplicats durant la sessió de desenvolupament per assolir l'estètica "FlowGrading" definitiva.

## 1. Identitat Visual i Marca
- **Logotip FlowGrading:**
    - Disseny de contrast: "Flow" en estil extra-light (200) i "Grading" en extra-bold (900).
    - Efecte "Handwritten": Desalineament individual de lletres, rotacions aleatòries i inclinació de -4.5 graus.
    - Highlight: Línia de fluorescent blau Holi més gruixuda i alineada.
    - Favicon: Nova icona de pestanya amb les lletres "fg" manuscrites sobre degradat blau.
- **Títols Manuscrits:**
    - Implementació del component `HandwrittenTitle` que aplica l'estètica del logo a tots els encapçalaments principals.
    - Sistema de colors dinàmics (cycling colors) que alterna entre verd, groc, vermell i lila (excloent el blau del logo per evitar redundància).
    - Desplaçament negatiu a l'esquerra per trencar la rigidesa del layout.

## 2. Experiència d'Usuari (UX) i Navegació
- **Header Unificat:**
    - Botó "Enrere" simplificat: només una fletxa neta a totes les pantalles.
    - Logo centralitzat i botons d'acció/tema a la dreta.
    - Integració de l'avatar de Google i botó de logout amb forma de píndola coherent.
- **Pantalla d'Inici:**
    - Fons blanc pur per a un look "Ultra-Clean".
    - Targeta de càrrega de PDF minimalista.
    - Secció de sessions recents amb barres de progrés i indicadors de sincronització al nuvol (Cloud icon).
- **Gestió de Sessions:**
    - Millora en la recuperació de fitxers PDF des de la memòria local o demanant selecció manual si el fitxer no existeix a la cau.

## 3. Configuració de l'Examen (Setup)
- **Càlcul Intel·ligent:** Inputs vinculats que permeten definir l'examen per "Pàgines/Examen" o per "Total alumnes", calculant l'altre valor automàticament.
- **Entrada de Dades:** Millora dels inputs per permetre esborrar i escriure sense restriccions, confirmant el valor només en prémer Enter o sortir del camp.
- **Gestió d'Alumnes:**
    - Flux de Classroom en dos passos: selecció de curs i botó manual de sincronització.
    - Modal emergent per enganxar llistes de text, evitant saturar la pantalla principal.
    - Taula de roster modernitzada que mostra els noms i emails importats realment.

## 4. Estabilitat i Correccions Tècniques
- **Corrector (CorrectionView):** Restauració absoluta al codi estable de GitHub (6d2565c) per garantir el funcionament correcte de Konva.
- **Organitzador de Pàgines:** Redisseny complet a estil targetes (Grid) amb miniatures de càrrega seqüencial.
- **Eliminació d'Artefactes:** Correcció de desbordaments i espais en blanc al peu de pàgina mitjançant una reestructuració amb Flexbox.
- **Sincronització:** Verificació del guardat automàtic de tot el progrés (OCR, zones, notes, traços) tant en local com a Google Drive.

## 7. Millores al Definidor de Plantilla (TemplateDefiner)
- **Seguretat de Flux:**
    - Bloqueig del botó "Finalitzar" si no s'ha definit cap exercici real (retall o pàgina).
    - Missatge d'avís dinàmic a la barra lateral si manquen exercicis corregibles.
    - Prevenció de la pantalla "HAS ACABAT!" buida si s'accedeix a la correcció sense dades.
- **Barra d'Eines Professional:**
    - Disseny a tota l'amplada de la barra lateral (Grid de 5 columnes).
    - **Shortcuts de Teclat (Dreçeres):** Implementació de tecles ràpides funcionals (**V**, **R**, **P**, **N**, **S**) amb indicadors visuals als botons.
    - **Eina de Pàgina Completa:** Nova icona personalitzada (full de paper amb '+') per afegir tota la pàgina com a exercici amb un clic.
- **Gestió Avançada de Pàgines:**
    - Possibilitat d'afegir o treure pàgines a un exercici de tipus "pàgines".
    - Selector per activar/desactivar la visualització de "Dues pàgines en paral·lel".

## 6. Millores de Sessió i Sincronització (Última actualització)
- **Gestió de l'Última Sessió:**
  - S'ha assegurat que en tornar a l'inici des de la pantalla de configuració (fent servir el botó d'enrere), el botó de continuar l'última sessió activa torni a aparèixer automàticament sense necessitat de recarregar la pàgina (F5).
- **Control del Nom de Sessió:**
  - Ara es pot editar el nom de la sessió (l'àlies) directament clicant-lo a la barra superior a les pantalles de configuració, organitzador i plantilla.
  - Si la sessió té un àlies, el nom original del fitxer es mostra a sota en cursiva per no perdre la referència.
- **Sincronització al Núvol Per-Fitxer:**
  - S'ha eliminat el botó global de sincronització al núvol de la pantalla de configuració.
  - S'ha introduït un quadre de diàleg (prompt) en pujar un PDF nou per preguntar a l'usuari si vol activar la sincronització al núvol per a aquest fitxer en concret.
  - Els selectors d'activació al núvol ara es troben a la part inferior dreta de cada targeta de sessió (alineats amb el recompte d'alumnes) i executen l'acció de pujar o esborrar de Drive de forma **immediata**.
  - S'ha afegit també un control independent per a la sincronització al núvol del **solucionari**.
- **Refinaments Visuals:**
  - Efecte de scroll animat al logotip de la pantalla d'inici: el subratllat blau es retalla linealment segons la posició del scroll, però manté la forma geomètrica original.
  - Els títols manuscrits principals (a l'organitzador de pàgines i resultats) ja no tenen un marge negatiu a l'esquerra per evitar que quedin tallats per la vora de la pantalla (`noMargin={true}`).
