# Especificació: UX fina (bloc B)

**Carpeta**: `specs/002-ux-fina` · **Creada**: 2026-10-05 · **Estat**: validada per l'Adrià (2026-10-05)
**Entrada**: «Que l'experiència d'usuari sigui MERAVELLOSA quan fa qualsevol cosa», el logo sense la «fg» bona, el mode fosc (fluorescent que tapa, «Molt bé» il·legible), millores R2–R4 i C1–C6 acceptades.

**Límit fix (constitució I)**: mateixos menús, botons, layouts, colors i tipografia. Aquí s'arreglen errors i es fa que cada acció respongui bé; no es redissenya res.

## Escenaris d'usuari i proves

### H1 — El mode fosc es llegeix bé (P1)

L'Adrià corregeix de nit en mode fosc. Ara el fluorescent és un bloc marró opac que tapa el que hi ha a sota, i un comentari de color fosc (p. ex. «Molt bé») gairebé no es veu sobre el full invertit.

**Prova independent**: obrir la correcció de la demo en fosc, posar un fluorescent sobre text i un comentari negre; tots dos es llegeixen. Exportar el PDF: surt amb els colors originals (clar).

1. **Donat** el mode fosc, **quan** hi ha un fluorescent sobre text, **llavors** el text de sota es continua llegint (efecte de retolador, no de capa opaca).
2. **Donat** el mode fosc, **quan** un comentari o un traç té un color fosc, **llavors** a pantalla es mostra amb prou contrast; el color desat i l'exportat no canvien.
3. **Donat** el mode clar, **llavors** tot es veu exactament com ara (captures de referència sense canvis).

### H2 — El logo i la icona amb la lletra bona (P1)

**Prova independent**: la icona de la pestanya i el logo mostren «fg» / «flowgrading» en Caveat a qualsevol ordinador, encara que no tingui la font instal·lada.

1. **Donat** un navegador sense Caveat instal·lada, **quan** s'obre l'app, **llavors** la «fg» de la icona de la pestanya és la de Caveat (no la cursiva per defecte del sistema).
2. **Donat** el logo de la capçalera, **llavors** «flow» i «grading» surten amb els gruixos de l'original (sense negreta sintetitzada pel navegador).

### H3 — Cada acció respon (P1)

Auditoria de **totes** les accions de les 6 pantalles (`specs/001-flowgrading/inventari-ui.md`): cap clic queda mut.

1. **Donat** qualsevol acció que trigui més de ~300 ms (obrir PDF, OCR, exportar, enviar), **llavors** hi ha indicador de progrés i, en acabar, confirmació o error entenedor amb què fer.
2. **Donat** una acció destructiva (esborrar sessió, netejar tot, esborrar zona), **llavors** es pot desfer o demana confirmació dins l'app (mai `alert`/`confirm`).
3. **Donat** un botó que ara no fa res o que falla en silenci, **llavors** queda a l'informe d'auditoria i s'arregla o es documenta per què.

### H4 — Corregir més de pressa (P2) — C1, C2, C4

1. **C1** Canviar d'alumne és instantani: el següent ja està pintat (pre-càrrega).
2. **C2** En tornar a un exercici, es recupera el zoom i la posició que hi tenies.
3. **C4** Es veuen els exercicis/alumnes pendents i hi ha drecera per saltar al següent pendent.

### H5 — Anotacions que no se'n van (P2) — C5, C6

1. **C5** El segell de nota es col·loca sol en una zona lliure del retall (es pot moure a mà).
2. **C6** Comentaris, fluorescents i segell no poden quedar fora del paper en crear-los ni en moure'ls.

### H6 — Plantilla més còmoda (P3) — R2, R3, R4

1. **R2** A la plantilla: fletxes per moure la zona seleccionada (Maj = pas gran), Ctrl+D duplica, Ctrl+Z / Ctrl+Maj+Z desfer/refer.
2. **R3** En moure o redimensionar, les zones s'enganxen a les vores del full i a les altres zones (Alt ho desactiva).
3. **R4** Avís si una zona queda en blanc en algun alumne (senyal de pàgines mal assignades), amb enllaç a aquell alumne.

### Casos límit

- Fluorescent de color molt clar o molt fosc; comentari blanc en mode clar.
- Canvi de tema a mitja correcció (la pàgina es re-pinta; les anotacions no es mouen).
- Retall més petit que el segell (C5): es posa a la cantonada menys ocupada, encara que trepitgi.
- Alumne sense pàgines a la pre-càrrega (C1): no peta.

## Requisits

- **RF-001** En mode fosc, el fluorescent es pinta amb un mode de fusió que deixa veure el text de sota; en clar, igual que ara.
- **RF-002** En mode fosc, el color d'un comentari o traç es mostra ajustat per contrast; el valor desat i el PDF exportat són els originals.
- **RF-003** La icona de la pestanya duu la «fg» de Caveat com a traçat (no depèn de fonts del sistema).
- **RF-004** Caveat es carrega amb tots els gruixos que fa servir el logo.
- **RF-005** Informe d'auditoria de cada acció (pantalla, acció, resposta actual, correcció) a `specs/002-ux-fina/auditoria.md`; cada fila acaba arreglada o justificada.
- **RF-006** Indicador de progrés i resultat per a tota acció lenta; errors amb missatge i sortida.
- **RF-007** C1, C2, C4, C5, C6, R2, R3, R4 tal com es descriuen a H4–H6.
- **RF-008** Cap canvi visible en mode clar fora del que demanen aquests requisits: les captures de referència només canvien on toca, i es revisen.
- **RF-009** Cada requisit duu el seu test (unitari o e2e); el de C6 i RF-002 també comproven que el PDF exportat no canvia.

## Criteris d'èxit

- **CE-001** En fosc, un comentari negre té contrast ≥ 4,5:1 i la tinta sota un fluorescent ≥ 5,5:1 (amb el pintat d'abans, 4,7), mesurat als píxels.
- **CE-002** Canvi d'alumne a la correcció < 150 ms amb el següent pre-carregat (mesura e2e).
- **CE-003** 0 accions de l'auditoria sense resposta visible.
- **CE-004** `npm run verify` en verd; la prova de fidelitat pantalla↔PDF segueix passant en clar i en fosc.
- **CE-005** L'Adrià valida la demo pública en clar i en fosc sense trobar res «estrany».

## Decisions i supòsits

- **R1 (ajust automàtic de la zona per alumne) passa al bloc E** (retalls automàtics): és la mateixa tècnica (detectar on és el contingut a cada escaneig) i així no es fa dues vegades.
- **C3 (refer) ja és fet** (T010 ho prova).
- La «fg que no és bona» és la **icona de la pestanya**: és un SVG amb `font-family=cursive`, i cada sistema hi posa la seva cursiva. [Supòsit: si et referies al logo de la capçalera, digues-ho.]
- El mode fosc només afecta la pantalla; el PDF sempre surt com en mode clar.
