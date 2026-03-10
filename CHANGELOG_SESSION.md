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

## 5. Pròxims Passos Suggerits
- Refinar la vinculació manual a la pantalla de resultats.
- Millorar la detecció OCR en condicions de baixa qualitat.
- Optimitzar la descàrrega de PDFs combinats per a grans volums d'alumnes.
