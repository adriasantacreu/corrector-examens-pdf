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
*Sessions de Refinament: Brand, UX, Solucionari*
- **L'objectiu**: Convertir FlowGrading en una marca professional amb una UX de gamma alta.
- **Fites**:
  - **Nova Identitat Corporativa**: Logo geomètric modern amb animació de "dibuixat" i efecte de scroll dinàmic.
  - **Suport per al Solucionari**: Introducció d'un segon PDF de referència amb control de sincronització independent al núvol.
  - **Unificació de la UI**: Substitució de diàlegs natius per targetes estètiques i un sistema de capçalera unificat amb edició d'àlies en línia.

## ⚡ Fase 5: El Flux de Treball "Total" (Velocitat i Precisió)
*L'era de l'eficiència absoluta*
- **L'objectiu**: Minimitzar l'ús del ratolí i maximitzar la precisió de les eines.
- **Fites**:
  - **Flux Ultraràpid (shortcuts 2.0)**: Enfocament i selecció de text automàtics en crear exercicis. Navegació seqüencial entre nom i nota mitjançant `Enter` i `Tab`.
  - **Editor de Zones Avançat**: Implementació del mode de redimensionament per doble clic amb un motor de restricció granular que impedeix sortir dels marges del PDF.
  - **Sistema de Zoom Unificat**: Introducció del concepte `baseScale` per garantir que totes les anotacions (bolígraf, fluorescent, marcadors) tinguin una mida consistent a la pantalla i escalin de forma natural.
  - **Sincronització Intel·ligent**: Control individual de sincronització al núvol per fitxer amb acció immediata des de les targetes de la pantalla d'inici.
  - **Dreceres Globals**: Implementació de la tecla `ESC` global per sortir de qualsevol camp de text i recuperar el control de les eines de dibuix.

---

## 📈 Resum de Metodologia de Treball
Aquest projecte demostra un enfocament de **desenvolupament iteratiu**:
1. **Analitzar** la necessitat de l'usuari (més velocitat, edició precisa).
2. **Implementar** solucions quirúrgiques (baseScale, custom Transformer, global event listeners).
3. **Validar** mitjançant compilacions estrictes (Build checks) i proves empíriques de límits.
4. **Documentar** per assegurar la sostenibilitat a llarg termini a la Crònica i al TODO.

---
*FlowGrading: No és només corregir, és fer que la correcció flueixi.*
