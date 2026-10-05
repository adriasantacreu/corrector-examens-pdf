/**
 * Colors de les anotacions. Es desen sempre en "color de paper" (el del mode clar, que és el que surt al PDF);
 * en mode fosc la pantalla els adapta en pintar-los, perquè el full es veu invertit.
 */

export interface Rgba { r: number; g: number; b: number; a: number }

/** Entén `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(...)` i `rgba(...)`. Desconegut → negre. */
export function parseColor(color: string): Rgba {
    const m = color.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? parseFloat(m[4]) : 1 };
    let c = color.trim().replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c)) {
        const a = c.length === 8 ? parseInt(c.slice(6, 8), 16) / 255 : 1;
        return { r: parseInt(c.slice(0, 2), 16), g: parseInt(c.slice(2, 4), 16), b: parseInt(c.slice(4, 6), 16), a };
    }
    return { r: 0, g: 0, b: 0, a: 1 };
}

const toCss = ({ r, g, b, a }: Rgba) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${+a.toFixed(3)})`;

/** Lluminositat HSL (0–1). */
const lightness = ({ r, g, b }: Rgba) => (Math.max(r, g, b) + Math.min(r, g, b)) / 510;

/**
 * Inverteix la lluminositat mantenint el to i la saturació: el blau marí passa a blau cel, el negre a blanc.
 * Equival a invertir el color i girar-ne el to 180°, que és el que fa el full invertit amb la tinta.
 */
function invertLightness(c: Rgba): Rgba {
    const max = Math.max(c.r, c.g, c.b);
    const min = Math.min(c.r, c.g, c.b);
    const shift = 255 - max - min; // L' = 1 − L sense tocar l'amplitud (max − min)
    return { r: c.r + shift, g: c.g + shift, b: c.b + shift, a: c.a };
}

/** Contrast mínim de la tinta sobre el full (WCAG AA per a text). */
const MIN_CONTRAST = 4.5;
const PAGE_DARK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

/**
 * Color de tinta (traç, text) tal com es pinta a la pantalla. En fosc, un color que no arriba a contrast 4,5
 * sobre el full negre s'inverteix de lluminositat (negre → blanc, blau marí → blau cel) i, si encara no hi
 * arriba, s'aclareix cap al blanc fins que hi arriba. El to es manté.
 */
export function displayInk(color: string, isDark: boolean): string {
    if (!isDark) return color;
    const c = parseColor(color);
    if (contrastRatio(c, PAGE_DARK) >= MIN_CONTRAST) return color;
    const base = lightness(c) < 0.5 ? invertLightness(c) : c;
    const towardWhite = (t: number): Rgba => ({ r: base.r + (255 - base.r) * t, g: base.g + (255 - base.g) * t, b: base.b + (255 - base.b) * t, a: c.a });
    let t = 0;
    while (t < 1 && contrastRatio(towardWhite(t), PAGE_DARK) < MIN_CONTRAST) t += 0.05;
    return toCss(towardWhite(Math.min(t, 1)));
}

/** Color de fons (requadre d'un comentari) a la pantalla. En fosc, s'inverteix la lluminositat (blanc → negre). */
export function displayFill(color: string, isDark: boolean): string {
    return isDark ? toCss(invertLightness(parseColor(color))) : color;
}

/** Contrast WCAG entre dos colors opacs (1–21). */
export function contrastRatio(a: Rgba, b: Rgba): number {
    const lum = ({ r, g, b: bl }: Rgba) => {
        const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}
