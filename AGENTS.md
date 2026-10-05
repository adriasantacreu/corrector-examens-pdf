# FlowGrading v2 — instruccions per a agents

Regles del workspace (`/mnt/data/workspace/AGENTS.md`) i constitució (`.specify/memory/constitution.md`) per sobre de tot.

## Banc de proves (obligatori)

Cap canvi és «fet» fins que passa el banc. Si en trenca res, s'arregla abans de continuar.

| Ordre | Què fa | Quan |
|---|---|---|
| `npm run test:fast` | `tsc -b` + vitest (`src/**/*.test.ts`) | Sol, al hook de pre-commit (`.githooks/`) |
| `npm run e2e` | Playwright headless sobre `?demo=reset`: navegació, correcció, fidelitat pantalla↔PDF, captures clar/fosc | Abans de donar per acabat qualsevol canvi |
| `npm run verify` | Tot l'anterior | Abans de fusionar o publicar |
| `npm run e2e:update` | Regenera les captures | Només per a un canvi visual **volgut**: revisar les imatges noves abans del commit (la tolerància de les captures no veu un dígit: les notes es comproven amb asserts) |

- Cada funcionalitat nova duu el seu test (unitari a `src/`, de navegador a `e2e/`).
- Selectors de test: `data-testid` (no visibles), mai canviar la UI per testejar.
- Mai `--no-verify` per saltar-se el hook.
