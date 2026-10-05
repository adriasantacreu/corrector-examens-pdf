# Pla tècnic: UX fina (bloc B)

Spec validada per l'Adrià el 2026-10-05.

## Decisions

| Tema | Decisió | Per què |
|---|---|---|
| Colors en fosc | Les anotacions **sempre es desen amb colors de paper** (els del mode clar). La pantalla els adapta en pintar-los: `displayColor(color, isDark)` a `domain/colors.ts`, que inverteix la lluminositat HSL dels colors foscos (L < 0.5) i manté el to i l'alfa | El PDF és paper blanc. Abans `stampComment` desava colors de fosc i el PDF sortia pàl·lid |
| Fluorescent en fosc | Konva `globalCompositeOperation: 'screen'` al rectangle (mateixa capa que la pàgina) | `screen` no enfosqueix mai: la tinta clara del full invertit continua clara a sota |
| Mode clar | Sense canvis (mateix pintat i mateixes captures) | Constitució I |
| Icona «fg» | SVG amb la «fg» de Caveat convertida en traçat (`fonttools`/`opentype.js` un cop, resultat enganxat a `index.html`) | Un SVG de favicon no pot carregar fonts web |
| Gruixos de Caveat | Carregar `wght@400..700` i treure el `900` sintètic si l'original no el té | El navegador inventa la negreta |
| Auditoria | `auditoria.md`: taula pantalla · acció · resposta · arreglat? | RF-005 |
| C1 | Ja hi ha pre-càrrega a `useExerciseRender` (render de `nextStudent`): mesurar-la i completar-la | No refer el que ja funciona |
| R3 | Imant de 8 px de pantalla a vores i zones, Alt el desactiva | Habitual a editors |

## Fitxers

- `src/domain/colors.ts` (nou) + test · `src/domain/annotations.ts` (`stampComment`, `droppedComment`) · `src/components/correction/AnnotationShapes.tsx` · `index.html`
- Proves: `e2e/dark.spec.ts` (contrast sota el fluorescent i del comentari en fosc; PDF amb colors de paper)
