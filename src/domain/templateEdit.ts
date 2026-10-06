/**
 * Edició còmoda de la plantilla (bloc B, R2–R4): moure amb el teclat, duplicar, imant a vores i zones,
 * i detectar zones que en algun alumne surten en blanc.
 */
import type { ExerciseDef, Rect, RegionExercise } from '../types';
import type { Point, Size } from './geometry';
import { clampPositionToBounds } from './geometry';

// --- R2: teclat ---

/** Pas de les fletxes en unitats del document (1 px de pàgina a escala de render); Maj = pas gran. */
export const NUDGE_STEP = 2;
export const NUDGE_STEP_BIG = 20;

export function nudge(r: Rect, dx: number, dy: number, page: Size): Point {
    return clampPositionToBounds({ x: r.x + dx, y: r.y + dy }, r, page);
}

/** Desplaçament de la còpia (Ctrl+D) respecte de l'original. */
export const DUPLICATE_OFFSET = 40;

/**
 * Còpia d'un retall (mateixa nota, rúbrica i mida), una mica desplaçada i dins la pàgina.
 * El nom i la nota final són únics: no es dupliquen (`null`).
 */
export function duplicateRegion(ex: RegionExercise, page: Size, newId: string): RegionExercise | null {
    if (ex.type !== 'crop') return null;
    const pos = clampPositionToBounds({ x: ex.x + DUPLICATE_OFFSET, y: ex.y + DUPLICATE_OFFSET }, ex, page);
    return {
        ...ex, ...pos, id: newId,
        name: `${ex.name} (còpia)`,
        rubric: ex.rubric?.map((item, i) => ({ ...item, id: `${newId}_r${i}` })),
    };
}

// --- R3: imant ---

export interface SnapTargets {
    xs: number[];
    ys: number[];
}

/** Línies on s'enganxa una zona: les vores del full i les vores de les altres zones de la mateixa pàgina. */
export function snapTargets(regions: (Rect & { id: string })[], exceptId: string, page: Size): SnapTargets {
    const others = regions.filter(r => r.id !== exceptId);
    return {
        xs: [0, page.width, ...others.flatMap(r => [r.x, r.x + r.width])],
        ys: [0, page.height, ...others.flatMap(r => [r.y, r.y + r.height])],
    };
}

/** La correcció (amb signe) més petita perquè alguna de les vores `edges` toqui una línia, si és a menys de `threshold`. */
function bestDelta(edges: number[], lines: number[], threshold: number): number {
    let best = 0, bestAbs = threshold;
    for (const e of edges) for (const l of lines) {
        const d = l - e;
        if (Math.abs(d) <= bestAbs) { best = d; bestAbs = Math.abs(d); }
    }
    return best;
}

/** Moure: la zona sencera es desplaça perquè una vora toqui la línia més propera. */
export function snapMove(r: Rect, t: SnapTargets, threshold: number): Point {
    return {
        x: r.x + bestDelta([r.x, r.x + r.width], t.xs, threshold),
        y: r.y + bestDelta([r.y, r.y + r.height], t.ys, threshold),
    };
}

/** Redimensionar: només s'enganxen les vores que s'estan movent (les altres es queden on són). */
export function snapResize(next: Rect, prev: Rect, t: SnapTargets, threshold: number): Rect {
    let left = next.x, right = next.x + next.width, top = next.y, bottom = next.y + next.height;
    const moved = (a: number, b: number) => Math.abs(a - b) > 1e-6;
    if (moved(left, prev.x)) left += bestDelta([left], t.xs, threshold);
    if (moved(right, prev.x + prev.width)) right += bestDelta([right], t.xs, threshold);
    if (moved(top, prev.y)) top += bestDelta([top], t.ys, threshold);
    if (moved(bottom, prev.y + prev.height)) bottom += bestDelta([bottom], t.ys, threshold);
    return { x: left, y: top, width: right - left, height: bottom - top };
}

// --- R4: zones en blanc ---

/** Lluminositat (0–255) d'una pàgina en petit; `scale` = píxels d'aquesta imatge per unitat del document. */
export interface Luma {
    width: number;
    height: number;
    scale: number;
    data: Uint8Array;
}

/** Per sota d'aquesta proporció de píxels amb tinta, la zona es considera en blanc. */
export const BLANK_INK = 0.002;
const INK_DISTANCE = 64;

/** Proporció de píxels amb tinta dins la zona (fons = el valor més freqüent, igual que la zona lliure del segell). */
export function inkRatio(img: Luma, r: Rect): number {
    const x0 = Math.max(0, Math.floor(r.x * img.scale)), y0 = Math.max(0, Math.floor(r.y * img.scale));
    const x1 = Math.min(img.width, Math.ceil((r.x + r.width) * img.scale)), y1 = Math.min(img.height, Math.ceil((r.y + r.height) * img.scale));
    if (x1 <= x0 || y1 <= y0) return 0;
    const hist = new Uint32Array(32);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) hist[img.data[y * img.width + x] >> 3]++;
    const background = hist.indexOf(Math.max(...hist)) * 8 + 4;
    let ink = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (Math.abs(img.data[y * img.width + x] - background) > INK_DISTANCE) ink++;
    return ink / ((x1 - x0) * (y1 - y0));
}

export interface BlankZone {
    studentIdx: number;
    exerciseId: string;
}

/**
 * Parelles alumne-retall on el retall és en blanc (pàgina mal assignada o que falta).
 * `pageOf(alumne, pàgina lògica)` dona la imatge de la pàgina, o `undefined` si l'alumne no en té (també compta).
 */
export function findBlankZones(studentCount: number, exercises: ExerciseDef[], pageOf: (studentIdx: number, logicalPage: number) => Luma | undefined | null): BlankZone[] {
    const out: BlankZone[] = [];
    const crops = exercises.filter((e): e is RegionExercise => e.type === 'crop');
    for (let s = 0; s < studentCount; s++) {
        for (const ex of crops) {
            const img = pageOf(s, ex.pageIndex);
            if (img === null) continue; // encara no carregada: no es pot dir
            if (!img || inkRatio(img, ex) < BLANK_INK) out.push({ studentIdx: s, exerciseId: ex.id });
        }
    }
    return out;
}
