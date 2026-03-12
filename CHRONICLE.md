# 📜 FlowGrading: Crònica d'una Evolució

Aquest document detalla el viatge tècnic i de disseny de **flowgrading**, des d'un prototip funcional fins a una eina de correcció d'exàmens d'alt nivell.

---

## 🚀 Fase 1: El Naixement i el Core (L'arquitectura base)
*Commits inicials*
- **L'objectiu**: Crear una eina capaç de carregar un PDF i permetre dibuixar anotacions a sobre.
- **Fites**:
  - Implementació de **React + Konva** per a la manipulació del Canvas.
  - Desenvolupament del motor d'exportació de PDF amb les anotacions incrustades.
  - Creació del `TemplateDefiner` per retallar exercicis de forma visual.

## ☁️ Fase 2: Integració i Ecosistema (L'era del núvol)
*Commits: Google OAuth, Drive Sync, Classroom*
- **L'objectiu**: Que el docent no hagués de dependre només del seu ordinador.
- **Fites**:
  - **Sincronització total amb Google Drive**: Guardat automàtic de l'estat de correcció en format JSON i còpies del PDF al núvol.
  - **Integració amb Google Classroom**: Importació directa de llistats d'alumnes i correus electrònics.
  - **OCR Intel·ligent**: Implementació de Tesseract.js per reconèixer els noms dels alumnes directament dels exàmens i enllaçar-los amb Classroom.

## 🛠️ Fase 3: Refinament i Robustesa (El poliment tècnic)
*Commits: F5 Persistence, Build Fixes, TypeScript*
- **L'objectiu**: Eliminar la fricció de l'usuari i assegurar l'estabilitat.
- **Fites**:
  - **Persistència F5**: Introducció d' `IndexedDB` per guardar fitxers pesats i que la recàrrega de la pàgina no impliqués perdre la feina.
  - **Dashboard de Sessions**: Creació d'una pantalla d'inici per gestionar múltiples correccions alhora.
  - **TypeScript Rigor**: Neteja sistemàtica d'errors de tipus i variables no utilitzades per garantir un deployment 100% fiable.

## 🎨 Fase 4: La Identitat "Strong" (Disseny i Experiència d'elit)
*La sessió actual: Brand, UX, Solucionari*
- **L'objectiu**: Convertir FlowGrading en una marca professional amb una UX de gamma alta.
- **Fites**:
  - **Nova Identitat Corporativa**: Logo geomètric modern, tipografia "Handwritten" i paleta de colors pastel.
  - **Densitat d'Informació**: Reducció de l'escala global (85%) per guanyar espai de correcció sense perdre llegibilitat.
  - **Suport per al Solucionari**: Introducció d'un segon PDF de referència amb gestió completa de pàgines i Drag & Drop.
  - **Unificació de la UI**: Eliminació dels diàlegs del sistema per "targetes cuquis" i transicions orgàniques amb `cubic-bezier`.

---

## 📈 Resum de Metodologia de Treball
Aquest projecte demostra un enfocament de **desenvolupament iteratiu**:
1. **Analitzar** la necessitat de l'usuari (més espai, sessions segures).
2. **Implementar** solucions quirúrgiques (rem scaling, IndexedDB).
3. **Validar** mitjançant compilacions estrictes (Build checks).
4. **Documentar** per assegurar la sostenibilitat a llarg termini.

---
*FlowGrading: No és només corregir, és fer que la correcció flueixi.*
