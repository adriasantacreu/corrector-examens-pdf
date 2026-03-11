# FlowGrading - Guia de l'Enginyer (Gemini CLI)

Aquest document conté mandats fonamentals, preferències d'estil i lliçons apreses per assegurar que el desenvolupament sigui fluid i sense errors.

## 🎯 Mandats Fonamentals
- **Compilació obligatòria**: ABANS de qualsevol `git push`, s'ha d'executar `npm run build` localment. No es permet pujar codi que no passi el xec de TypeScript.
- **Importacions de Lucide**: Cada vegada que s'afegeixi una icona nova, cal verificar explícitament que s'ha importat al fitxer corresponent. Les icones no importades són la causa nº1 de crashenys en temps de renderitzat.
- **Separador de comandes**: En aquest entorn (Windows/PowerShell), NO s'ha d'utilitzar `&&`. S'han d'executar les comandes de Git (add, commit, push) de forma seqüencial i separada.
- **Diàlegs Personalitzats Obligatoris**: Està estrictament PROHIBIT utilitzar `window.alert()` o `window.confirm()`. Totes les interaccions de confirmació o alerta s'han de gestionar a través del sistema global `showAlert` / `showConfirm` definit a `App.tsx`, que utilitza l'estètica de targeta amb `HandwrittenTitle`.

## 🎨 Preferències d'Estil i UX
- **Proporcions de la Interfície**: L'usuari prefereix una densitat d'informació alta. Els marges de la Hero Section han de ser de `25vh` i el logo de `13rem`. 
- **Mode Fosc "Strong"**: 
  - Utilitzar `cubic-bezier(0.4, 0, 0.2, 1)` per a totes les transicions de color.
  - Sincronitzar totes les durades a `0.35s` mitjançant la variable `--theme-transition-duration`.
  - Evitar el "flash" blanc inicial usant l'script de bloqueig a l' `index.html`.
- **Navegació**: Mantenir sempre el botó "Enrere" funcional entre totes les pantalles.

## 🛠️ Infraestructura i Deployment
- **GitHub Pages**: El deployment es fa automàticament via GitHub Actions. 
- **Node.js**: S'ha d'utilitzar sempre **Node 24** al workflow per evitar deprecacions.
- **Git Hygiene (CRÍTIC)**: 
  - Prohibit deixar carpetes com `.claude`, `.cursor` o worktrees que continguin repositoris Git niats. Això causa l'**error 128** en el deployment.
  - ABANS de pujar, verificar que no hi hagi "untracked content" en subdirectoris que pugui interferir.
  - Si el deployment falla, revisar primer la neteja de la carpeta arrel.

## 🏗️ Arquitectura i Densitat
- **Mides Relatives**: Prioritzar l'ús de `rem` per sobre de `px` per permetre l'escalat global de la interfície.
- **Root Size**: El `font-size` base és de `14px` per mantenir la densitat d'informació desitjada per l'usuari.

## 🧹 Neteja de Codi
- **Codi cadàver**: Està prohibit deixar blocs de codi comentats o branques condicionals que ja no s'utilitzen. Si una funcionalitat es refactoritza, el codi antic s'ha d'eliminar completament.
