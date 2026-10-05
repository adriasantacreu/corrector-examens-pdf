# Pla: arquitectura i fases

## Capes (`src/`)
| Capa | Conté | Pot importar |
|---|---|---|
| `domain/` | scoring, geometry, pageLayout, students, session, stamp, annotations | res |
| `services/` | storage, google, pdf, ai | domain |
| `state/` | stores (sessió, tema, diàlegs, auth) | domain, services |
| `features/<id>/` | UI + hooks d'una funcionalitat | domain, services, state, `ui/` |
| `ui/` | components comuns (capçalera, diàlegs, zoom…) i tema | — |
| `app/` | composició de pantalles i registre | tot |

## Extensibilitat
Registre `app/registry.ts`: `tools` (correcció), `importers`, `exporters`, `aiProviders` (servidor, Gemini…), `ocrProviders`, `panels`. Sense cap proveïdor registrat, l'app funciona igual (la IA és opcional). Una feature exporta `FeatureModule { id, register(registry) }`. La IA (F11) és un `aiProvider` + un panell al costat de la rúbrica.

## Fases
| Fase | Contingut | Fet quan… |
|---|---|---|
| 0 | Aquests documents | l'Adrià valida |
| 1 | Demo de les 6 pantalles amb dades fictícies | captures idèntiques a l'original |
| 2 | Registre i esquelet de features | una feature de prova s'afegeix en un fitxer |
| 3 | F1–F3, F5–F6 | cada una amb tests i validació |
| 4 | F7–F9 | exportació = visor |
| 5 | F10, F4 | |
| 6 | F11 IA | |

## Reaprofitament
La branca `refactor/modular` (commit 1c5a1f9) té domini, serveis i alguns components: es revisen i es porten feature a feature; no s'hi confia fins passar la validació visual.

## Control de cost
Una fase o feature per sessió, aturada i commit al final, `/compact` entre fases.
