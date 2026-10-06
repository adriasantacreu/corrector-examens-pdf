import { expect, test, type Page } from '@playwright/test';
import { openDemo, openSession, SESSIONS } from './helpers';

/**
 * Plantilla còmoda (B008): teclat (R2), imant (R3) i avís de zones en blanc (R4).
 * A la demo «Estadística», la pàgina 1 té l'àrea del nom (zona 0) i el retall de l'exercici 1 (zona 1).
 */

type Box = { x: number; y: number; width: number; height: number };

/** Rectangles (px de pantalla, relatius al canvas) del paper i de les zones. */
const layout = (page: Page) => page.evaluate(() => {
    type N = { getClientRect: () => Box };
    const st = (window as unknown as { Konva?: { stages: { find: (s: string) => N[] }[] } }).Konva?.stages[0];
    const img = st?.find('Image')[0];
    return { paper: img?.getClientRect() ?? { x: 0, y: 0, width: 0, height: 0 }, regions: img ? st!.find('.regionRect').map(n => n.getClientRect()) : [] };
});

const canvasBox = async (page: Page) => (await page.locator('.konvajs-content').first().boundingBox())!;

async function selectCrop(page: Page) {
    await page.keyboard.press('v');
    const c = await canvasBox(page);
    const r = (await layout(page)).regions[1];
    await page.mouse.click(c.x + r.x + r.width / 2, c.y + r.y + r.height / 2);
}

const cropX = async (page: Page) => (await layout(page)).regions[1].x;

test.beforeEach(async ({ page }) => {
    await openDemo(page);
    await openSession(page, SESSIONS.template);
    await expect(page.getByText('Definir plantilla')).toBeVisible();
    await expect.poll(async () => (await layout(page)).regions.length).toBe(2);
});

test('R2: les fletxes mouen la zona (Maj = pas gran) i Ctrl+Z / Ctrl+Maj+Z ho desfan i refan', async ({ page }) => {
    await selectCrop(page);
    const x0 = await cropX(page);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => cropX(page)).toBeGreaterThan(x0);
    const x1 = await cropX(page);
    await page.waitForTimeout(800); // un altre pas de l'historial
    await page.keyboard.press('Shift+ArrowLeft');
    await expect.poll(() => cropX(page)).toBeLessThan(x0);
    const x2 = await cropX(page);
    expect(x1 - x2).toBeGreaterThan((x1 - x0) * 5); // el pas gran és molt més gran

    await page.keyboard.press('Control+z');
    await expect.poll(() => cropX(page)).toBeCloseTo(x1, 1);
    await page.keyboard.press('Control+z');
    await expect.poll(() => cropX(page)).toBeCloseTo(x0, 1);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => cropX(page)).toBeCloseTo(x1, 1);
});

test('R2: Ctrl+D duplica el retall (amb la seva nota) i es pot desfer', async ({ page }) => {
    await selectCrop(page);
    await page.keyboard.press('Control+d');
    await expect.poll(async () => (await layout(page)).regions.length).toBe(3);
    await expect(page.locator('input[value$="(còpia)"]')).toHaveCount(1);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await layout(page)).regions.length).toBe(2);
});

test('R3: en moure una zona a prop de la vora del full s\'hi enganxa; amb Alt, no', async ({ page }) => {
    const c = await canvasBox(page);
    const moveTo = async (gap: number, alt: boolean) => {
        await page.keyboard.press('v');
        const { paper, regions } = await layout(page);
        const r = regions[1];
        const from = { x: c.x + r.x + r.width / 2, y: c.y + r.y + r.height / 2 };
        const dx = paper.x + gap - r.x;
        if (alt) await page.keyboard.down('Alt');
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(from.x + dx / 2, from.y, { steps: 4 });
        await page.mouse.move(from.x + dx, from.y, { steps: 4 });
        await page.mouse.up();
        if (alt) await page.keyboard.up('Alt');
        return (await layout(page)).paper.x;
    };
    const paperX = await moveTo(5, false);
    // (la caixa de Konva inclou mig píxel de vora)
    await expect.poll(async () => Math.abs((await cropX(page)) - paperX)).toBeLessThan(1);
    await moveTo(20, false); // lluny de la vora: no s'enganxa
    await moveTo(5, true);
    await expect.poll(async () => (await cropX(page)) - paperX).toBeGreaterThan(3);
});

test('R4: un retall en blanc avisa i l\'enllaç obre aquell alumne a la correcció', async ({ page }) => {
    await expect(page.getByTestId('blank-zones')).toHaveCount(0);
    // Zona nova a la part buida de sota del retall de l'exercici 2
    await page.keyboard.press('r');
    const c = await canvasBox(page);
    const { paper } = await layout(page);
    const from = { x: c.x + paper.x + paper.width * 0.62, y: c.y + paper.y + paper.height * 0.83 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + paper.width * 0.25, from.y + paper.height * 0.08, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.press('Escape');

    const links = page.getByTestId('blank-zone');
    await expect(links.first()).toBeVisible({ timeout: 10000 });
    const label = (await links.first().textContent())!;
    const name = label.split(' · ')[1];
    await links.first().click();
    // En sortir de la plantilla pot passar l'OCR dels noms
    await expect(page.getByText('NOTA FINAL', { exact: false })).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.student-section select option:checked')).toContainText(name);
});
