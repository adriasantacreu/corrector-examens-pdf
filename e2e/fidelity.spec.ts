import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { openCorrectionAt, openDemo } from './helpers';

/**
 * Fidelitat pantalla ↔ PDF exportat: la nota impresa és la de la pantalla, i les anotacions surten
 * al mateix lloc i amb la mateixa mida. L'exportació pinta les pàgines en un canvas i les desa com a JPG
 * (sense capa de text), així que es registren les crides de dibuix del canvas durant l'exportació.
 */

/** Retall de l'exercici 1 de la demo (box(36, 140, 523, 300) en punts × escala 2,5). */
const EX1 = { x: 90, y: 350, width: 1307.5, height: 750 };
const TOL = 3; // px de pàgina (escala 2,5): menys d'1,5 punts PDF

interface PaintCall { op: 'rect' | 'text'; x: number; y: number; w?: number; h?: number; text?: string; font?: string; style: string; cw: number; ch: number }

/** Registra fillRect/fillText mentre `window.__logPaint` és cert. */
async function recordPainting(page: Page) {
    await page.addInitScript(() => {
        const w = window as unknown as { __paint: unknown[]; __logPaint: boolean };
        w.__paint = [];
        w.__logPaint = false;
        const proto = CanvasRenderingContext2D.prototype;
        const fillRect = proto.fillRect;
        const fillText = proto.fillText;
        proto.fillRect = function (x, y, width, height) {
            if (w.__logPaint) w.__paint.push({ op: 'rect', x, y, w: width, h: height, style: String(this.fillStyle), cw: this.canvas.width, ch: this.canvas.height });
            return fillRect.call(this, x, y, width, height);
        };
        proto.fillText = function (text, x, y, maxWidth) {
            if (w.__logPaint) w.__paint.push({ op: 'text', x, y, text, font: this.font, style: String(this.fillStyle), cw: this.canvas.width, ch: this.canvas.height });
            return maxWidth === undefined ? fillText.call(this, text, x, y) : fillText.call(this, text, x, y, maxWidth);
        };
    });
}

/** Rectangle d'un node de Konva en fracció de la imatge del retall que es veu a pantalla. */
async function screenGeometry(page: Page, id: string) {
    return page.evaluate(nodeId => {
        type Rect = { x: number; y: number; width: number; height: number };
        type KNode = { getClientRect: (o?: object) => Rect; getClassName: () => string; findOne: (s: string) => KNode | undefined; fontSize?: () => number };
        const K = (window as unknown as { Konva: { stages: { findOne: (s: string) => KNode | undefined; find: (s: string) => KNode[] }[] } }).Konva;
        const stage = K.stages.find(s => s.findOne(`#${nodeId}`))!;
        const node = stage.findOne(`#${nodeId}`)!;
        const shape = node.getClassName() === 'Group' ? (node.findOne('Rect') ?? node.findOne('Text') ?? node) : node;
        const image = stage.find('Image').map(i => i.getClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0];
        const r = shape.getClientRect({ skipShadow: true, skipStroke: true });
        const text = node.findOne('Text');
        return {
            fx: (r.x - image.x) / image.width, fy: (r.y - image.y) / image.height,
            fw: r.width / image.width, fh: r.height / image.height,
            // fontSize del node Konva ja és en píxels del document (l'escala és a l'Stage)
            fontDoc: text?.fontSize ? text.fontSize() : undefined,
        };
    }, id);
}

test('el PDF exportat reprodueix la nota i les anotacions de la pantalla', async ({ page }) => {
    await recordPainting(page);
    await openDemo(page);
    await openCorrectionAt(page, 1); // Laia, exercici 1: marcador, comentari i tic
    await expect(page.getByText('Exercici 1 — Producte i determinant')).toBeVisible();

    const exerciseText = (await page.getByTestId('nota-exercici').innerText()).replace(/\s+/g, ' ').trim();
    const [shownScore, shownMax] = exerciseText.split(' / ');
    const hl = await screenGeometry(page, 'h_1');
    const comment = await screenGeometry(page, 't_1');

    await page.getByRole('button', { name: 'Finalitzar' }).click();
    await expect(page.getByText('Resultats i Exportació')).toBeVisible();
    await page.evaluate(() => { (window as unknown as { __logPaint: boolean }).__logPaint = true; });
    const downloadPromise = page.waitForEvent('download');
    await page.getByTitle('Baixar PDF').first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('correccio_Laia_Puig_Serra.pdf');

    const calls = await page.evaluate(() => (window as unknown as { __paint: PaintCall[] }).__paint);
    const pageCalls = calls.filter(c => c.cw > 1400); // canvas de pàgina sencera (A4 × 2,5), no els de Konva

    // 1. Nota impresa = nota de pantalla
    const stamp = pageCalls.find(c => c.op === 'text' && c.text?.startsWith('Nota: ') && c.y < EX1.y + EX1.height && c.y > EX1.y);
    expect(stamp?.text).toBe(`Nota: ${shownScore} / ${shownMax}`);

    // 2. Marcador: mateixa posició i mida
    const orange = pageCalls.find(c => c.op === 'rect' && /249,\s*115,\s*22|#f97316/i.test(c.style))!;
    expect(orange, 'el marcador taronja s\'ha pintat').toBeTruthy();
    expect(Math.abs(orange.x - (EX1.x + hl.fx * EX1.width))).toBeLessThanOrEqual(TOL);
    expect(Math.abs(orange.y - (EX1.y + hl.fy * EX1.height))).toBeLessThanOrEqual(TOL);
    expect(Math.abs(orange.w! - hl.fw * EX1.width)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(orange.h! - hl.fh * EX1.height)).toBeLessThanOrEqual(TOL);

    // 3. Comentari: mateixa posició i mateixa mida de lletra
    const text = pageCalls.find(c => c.op === 'text' && c.text === 'Excel·lent!')!;
    expect(text, 'el comentari s\'ha pintat').toBeTruthy();
    expect(Math.abs(text.x - (EX1.x + comment.fx * EX1.width))).toBeLessThanOrEqual(TOL);
    expect(Math.abs(text.y - (EX1.y + comment.fy * EX1.height))).toBeLessThanOrEqual(TOL);
    const fontPx = Number(/(\d+(?:\.\d+)?)px/.exec(text.font!)![1]);
    expect(Math.abs(fontPx - comment.fontDoc!)).toBeLessThanOrEqual(0.5);

    // 4. El fitxer: 2 pàgines (les de l'alumne) amb la mida del canvas pintat
    const pdf = await PDFDocument.load(await readFile((await download.path())!));
    expect(pdf.getPageCount()).toBe(2);
    const { width, height } = pdf.getPage(0).getSize();
    expect(Math.round(width)).toBe(Math.round(orange.cw));
    expect(Math.round(height)).toBe(Math.round(orange.ch));
});
