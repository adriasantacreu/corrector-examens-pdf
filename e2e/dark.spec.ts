import { expect, test, type Page } from '@playwright/test';
import { openCorrectionAt, openDemo } from './helpers';

/**
 * Mode fosc: el full es veu invertit. El que s'hi pinta a sobre s'ha de llegir (contrast ≥ 4,5:1) i el PDF
 * exportat ha de sortir amb els colors de paper, com si s'hagués corregit en mode clar.
 */

const EX1_WIDTH = 1307.5; // amplada del retall de l'exercici 1 en px de document

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        try { localStorage.setItem('flowgrading_global', JSON.stringify({ theme: 'dark' })); } catch { /* sense storage */ }
    });
    await openDemo(page);
});

/** Contrast entre la tinta (píxels més clars) i el fons (mediana) d'una zona del canvas de la correcció. */
async function inkContrast(page: Page, doc: { x: number; y: number; width: number; height: number }) {
    return page.evaluate(([d, exWidth]) => {
        type Rect = { x: number; y: number; width: number; height: number };
        type KLayer = { getCanvas: () => { _canvas: HTMLCanvasElement; getPixelRatio: () => number } };
        type KStage = { find: (s: string) => { getClientRect: () => Rect }[]; getLayers: () => KLayer[] };
        const K = (window as unknown as { Konva: { stages: KStage[] } }).Konva;
        const stage = K.stages.find(s => s.find('Image').length)!;
        const img = stage.find('Image').map(i => i.getClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0];
        const k = img.width / exWidth;
        const canvas = stage.getLayers()[0].getCanvas();
        const pr = canvas.getPixelRatio();
        const ctx = canvas._canvas.getContext('2d')!;
        const data = ctx.getImageData((img.x + d.x * k) * pr, (img.y + d.y * k) * pr, d.width * k * pr, d.height * k * pr).data;
        const lum = (r: number, g: number, b: number) => {
            const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const values: number[] = [];
        for (let i = 0; i < data.length; i += 4) values.push(lum(data[i], data[i + 1], data[i + 2]));
        values.sort((a, b) => a - b);
        const background = values[Math.floor(values.length / 2)];
        const ink = values[Math.floor(values.length * 0.995)];
        return (ink + 0.05) / (background + 0.05);
    }, [doc, EX1_WIDTH] as const);
}

/** Arrossega en coordenades de document (px del retall de l'exercici 1). */
async function dragDoc(page: Page, from: [number, number], to: [number, number]) {
    const img = await page.evaluate(() => {
        type Rect = { x: number; y: number; width: number; height: number };
        const K = (window as unknown as { Konva: { stages: { find: (s: string) => { getClientRect: () => Rect }[] }[] } }).Konva;
        const stage = K.stages.find(s => s.find('Image').length)!;
        return stage.find('Image').map(i => i.getClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0];
    });
    const box = (await page.locator('.konvajs-content').first().boundingBox())!;
    const k = img.width / EX1_WIDTH;
    const at = ([x, y]: [number, number]) => [box.x + img.x + x * k, box.y + img.y + y * k] as const;
    await page.mouse.move(...at(from));
    await page.mouse.down();
    await page.mouse.move(...at(to), { steps: 6 });
    await page.mouse.up();
}

test('el text sota un fluorescent es continua llegint', async ({ page }) => {
    await openCorrectionAt(page, 4); // Pol: sense anotacions
    const line = { x: 140, y: 100, width: 560, height: 50 }; // 1a línia manuscrita de l'exercici 1
    const before = await inkContrast(page, line);
    await page.keyboard.press('2');
    await dragDoc(page, [line.x - 20, line.y - 10], [line.x + line.width + 20, line.y + line.height + 10]);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('nota-exercici')).toHaveText(/^2\.75/);
    const after = await inkContrast(page, line);
    expect(before, 'la línia triada té tinta').toBeGreaterThan(7);
    // Pintat normal (alfa sobre la tinta): 4,7. Amb `screen`: 6,4. El llindar separa els dos casos.
    expect(after).toBeGreaterThanOrEqual(5.5);
});

test('un comentari fosc es veu clar a la pantalla però surt fosc al PDF', async ({ page }) => {
    await page.addInitScript(() => {
        const w = window as unknown as { __texts: { text: string; style: string }[] };
        w.__texts = [];
        const fillText = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
            if (this.canvas.width > 1400) w.__texts.push({ text: String(text), style: String(this.fillStyle) });
            return maxWidth === undefined ? fillText.call(this, text, x, y) : fillText.call(this, text, x, y, maxWidth);
        };
    });
    await page.reload();
    await openCorrectionAt(page, 1); // Laia: comentari «Excel·lent!» desat amb #111827
    const screen = await page.evaluate(() => {
        type KNode = { findOne: (s: string) => KNode | undefined; fill: () => string };
        const K = (window as unknown as { Konva: { stages: { findOne: (s: string) => KNode | undefined }[] } }).Konva;
        const node = K.stages.map(s => s.findOne('#t_1')).find(Boolean)!;
        return node.findOne('Text')!.fill();
    });
    const rgb = screen.startsWith('#')
        ? [1, 3, 5].map(i => parseInt(screen.slice(i, i + 2), 16))
        : screen.match(/\d+/g)!.slice(0, 3).map(Number);
    expect(Math.min(...rgb), `color de pantalla ${screen}`).toBeGreaterThan(150);

    await page.getByRole('button', { name: 'Finalitzar' }).click();
    await expect(page.getByText('Resultats i Exportació')).toBeVisible();
    await page.evaluate(() => { (window as unknown as { __texts: unknown[] }).__texts = []; });
    const download = page.waitForEvent('download');
    await page.getByTitle('Baixar PDF').first().click();
    await download;
    const texts = await page.evaluate(() => (window as unknown as { __texts: { text: string; style: string }[] }).__texts);
    const printed = texts.find(t => t.text === 'Excel·lent!');
    expect(printed?.style.replace(/\s/g, '')).toMatch(/^(rgba?\(17,24,39(,1)?\)|#111827)$/);
});
