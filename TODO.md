# TO DO - FlowGrading

## Flux de Treball Ràpid (TemplateDefiner)
- [x] **Selecció i Enfocament Automàtic:** En crear una zona o pàgina, el cursor ha d'anar al títol de l'exercici.
- [x] **Selecció de Text:** El títol per defecte ("Exercici de retall N" o "Exercici de pàgina N") ha d'estar seleccionat completament per sobreescriure'l fàcilment.
- [x] **Navegació amb Teclat:** Al prémer `Enter` o `Tab` al títol, el focus ha de saltar directament al camp de la nota màxima.
- [x] **Auto-repartiment de Rúbrica:**
    - [x] Opció (activada per defecte) per dividir la nota màxima entre el nombre d'ítems de la rúbrica.
    - [x] Desactivació automàtica de l'auto-repartiment si es modifica una nota manualment.
- [x] **Avisos de Puntuació:**
    - [x] Avisar si la suma de la rúbrica sobrepassa la nota màxima de l'exercici.
    - [x] No bloquejar el canvi (permetre control total a l'usuari).
    - [x] No repetir l'avís si ja s'ha mostrat per a aquell exercici.

## Millores Pendents
- [ ] Refinar la vinculació manual a la pantalla de resultats.
- [ ] Millorar la detecció OCR en condicions de baixa qualitat.
- [ ] Optimitzar la descàrrega de PDFs combinats per a grans volums d'alumnes.
