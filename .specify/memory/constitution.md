# Constitució de FlowGrading

Regles del workspace (`/mnt/data/workspace/AGENTS.md`) per sobre de tot. Aquí només el que és propi d'aquest projecte.

## Principis

### I. L'estètica i la UI de l'app actual no es toquen
Mateixos menús, layouts, colors, tipografia (Caveat), rem (arrel 14px), modes clar/fosc. L'original (`projects/prova-app-correccio-pc`) és la referència visual: cada pantalla es valida comparant-la amb ell.

### II. Modularitat per capes, dependències en un sol sentit
`domain` (pur, sense React ni xarxa) → `services` (I/O) → `state` → `features` (una carpeta per funcionalitat) → `app` (composició). Cap capa importa de les de dalt. Cap feature importa d'una altra feature: es parlen via `domain` o el registre.

### III. Tota funcionalitat és un mòdul que es connecta
Eines de correcció, importadors, exportadors i proveïdors d'IA s'afegeixen registrant-se; afegir-ne una no obliga a editar el nucli.

### IV. Una sola font de veritat per regla de negoci
Puntuació, disposició de pàgines i coordenades es calculen en un únic lloc (domini) i les fan servir el visor i l'exportació.

### V. Demo primer, lògica després
Cada pantalla s'ensenya primer amb dades inventades i estètica validada; la funcionalitat real s'hi connecta feature a feature, amb tests.

### VI. Ni secrets al client ni dades d'alumnes al git
Claus d'IA només al servidor (`api/`). Dades de proves sempre fictícies.

### VII. Sense codi cadàver ni diàlegs natius
Res de `alert/confirm` (diàlegs propis), res de codi comentat o duplicat.
