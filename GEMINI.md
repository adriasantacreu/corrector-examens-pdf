# FlowGrading - Guia de l'Enginyer (Gemini CLI)

Aquest document conté mandats fonamentals, preferències d'estil i lliçons apreses per assegurar que el desenvolupament sigui fluid i sense errors.

## 🎯 Mandats Fonamentals
- **Compilació obligatòria**: ABANS de qualsevol `git push`, s'ha d'executar `npm run build` localment. No es permet pujar codi que no passi el xec de TypeScript.
- **Importacions de Lucide**: Cada vegada que s'afegeixi una icona nova, cal verificar explícitament que s'ha importat al fitxer corresponent. Les icones no importades són la causa nº1 de crashenys en temps de renderitzat.
- **Separador de comandes**: En aquest entorn (Windows/PowerShell), NO s'ha d'utilitzar `&&`. S'han d'executar les comandes de Git (add, commit, push) de forma seqüencial i separada.

## 🎨 Preferències d'Estil i UX
- **Proporcions de la Interfície**: L'usuari prefereix una densitat d'informació alta. Els marges de la Hero Section han de ser de `25vh` i el logo de `13rem`. 
- **Mode Fosc "Strong"**: 
  - Utilitzar `cubic-bezier(0.4, 0, 0.2, 1)` per a totes les transicions de color.
  - Sincronitzar totes les durades a `0.35s` mitjançant la variable `--theme-transition-duration`.
  - Evitar el "flash" blanc inicial usant l'script de bloqueig a l' `index.html`.
- **Navegació**: Mantenir sempre el botó "Enrere" funcional entre totes les pantalles.

## 🛠️ Infraestructura i Deployment
- **GitHub Pages**: El deployment es fa automàticament via GitHub Actions. Si falla amb `exit code 128`, cal revisar els permisos del `GITHUB_TOKEN` al fitxer de workflow.
- **Sessió i Persistència**: 
  - La clau global és `flowgrading_global`.
  - La detecció de sessions pendents ha de ser proactiva: si no hi ha una sessió activa marcada, cercar la més recent al `localStorage`.

## 🧹 Neteja de Codi
- **Codi cadàver**: Està prohibit deixar blocs de codi comentats o branques condicionals que ja no s'utilitzen. Si una funcionalitat es refactoritza, el codi antic s'ha d'eliminar completament.
