# flowgrading 🌊
### L'eina de correcció digital que neix de la necessitat, no del codi.

**flowgrading** no és només una webapp; és la resposta a un problema real: la fricció, el desordre i el temps perdut en la correcció d'exàmens físics. Neix com un projecte de **Vibe Coding**, on la iteració ràpida i la intuïció del producte han guiat cada línia de codi.

---

## 🎯 El Problema que soluciona
Corregir 100 exàmens implica gestionar 100 lligalls de paper, repetir comentaris mil vegades i picar notes manualment a plataformes com Google Classroom. 
**flowgrading** elimina aquesta fricció digitalitzant el flux complet:
1. **Digitalització**: Puges el PDF amb tots els exàmens escanejats.
2. **Estructura**: Defines una sola vegada on estan els exercicis i el nom de l'alumne.
3. **Flux**: Correges alumne per alumne, exercici per exercici, amb eines digitals que aprenen de tu (banc de comentaris).
4. **Tancament**: Envies les notes a Classroom o generes PDFs individuals amb un clic.

**Estalvi estimat**: ~40% del temps total de correcció i 100% del desordre físic.

---

## 🛠️ Enginyeria de Solucions (Problem-Solving Log)

Com a enginyer de producte, el desenvolupament ha estat una batalla constant per eliminar la fricció. Aquests són alguns dels reptes resolts:

### 1. El repte de la Persistència (IndexedDB)
*   **Problema**: Carregar un PDF de 50MB en cada recàrrega (F5) era insostenible i feia perdre l'estat de correcció.
*   **Solució**: Implementació d'un sistema de memòria cau amb **IndexedDB** que guarda el fitxer localment al navegador. Ara, en fer F5, la sessió és instantània.

### 2. El caos de l'Escala Visual (Rem Scaling)
*   **Problema**: En pantalles estàndard, la interfície ocupava massa espai, deixant poc lloc per al més important: l'examen.
*   **Solució**: Refactorització de tot el sistema de mides a **unitats rem** i ajust de l'arrel a 14px. Resultat: Una densitat d'informació un 15% superior sense perdre llegibilitat.

### 3. El mur de l'Autenticació (OAuth Robust)
*   **Problema**: Les sessions de Google caduquen i deixaven l'app en un estat "zombie" (loguejat però sense dades).
*   **Solució**: Creació d'un sistema de **vigilància de sessió** que detecta errors 401 en temps real i neteja l'estat automàticament, convidant a l'usuari a re-connectar-se de forma neta.

### 4. Intel·ligència de Dades (OCR + Levenshtein)
*   **Problema**: Reassignar noms d'alumnes a mà és lent i propici a errors.
*   **Solució**: Integració de **Tesseract.js** per llegir noms manuscrits i un algoritme de **distància de Levenshtein** per enllaçar-los automàticament amb la llista oficial de Classroom, fins i tot amb lletra difícil de llegir.

---

## 🎨 Identitat i UX
L'aplicació fuig de l'estètica genèrica. Utilitza una identitat **"Handwritten-Modern"**:
*   **Tipografia Caveat**: Per mantenir el toc humà de la correcció.
*   **Formes Geomètriques**: Pastilles fluorescents pastel basades en `clip-path` per a una sensació fresca i actual.
*   **Transicions Orgàniques**: Corbes `cubic-bezier` personalitzades que fan que cada canvi de pantalla se senti natural.

---

## 🚀 Stack Tècnic
- **Frontend**: React 19 (TypeScript)
- **Canvas**: Konva.js (Manipulació de documents i anotacions)
- **PDF**: PDF.js (Renderitzat d'alta fidelitat)
- **IA/OCR**: Tesseract.js
- **Cloud**: Google Drive API (Sincronització de sessions) & Classroom API (Gestió d'alumnes)
- **Storage**: IndexedDB (Persistència local de fitxers)

---
*Aquest projecte és un testimoni de com el Vibe Coding, quan es combina amb un rigor tècnic d'enginyeria, pot crear eines que realment canvien el dia a dia de les persones.*
