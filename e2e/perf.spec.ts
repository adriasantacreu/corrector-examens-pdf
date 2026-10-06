import { expect, test, type Page } from '@playwright/test';
import { openCorrectionAt, openDemo } from './helpers';

/**
 * C1: canviar d'alumne a la correcció ha de ser instantani (< 150 ms fins que el retall nou és a la pantalla),
 * perquè el següent ja està pre-carregat mentre es corregeix l'actual.
 */

/** Prem una tecla i mesura els ms fins que el canvas pinta una imatge de pàgina diferent. */
async function timeToNewImage(page: Page, key: string): Promise<number> {
    const waiting = page.evaluate(() => new Promise<number>((resolve, reject) => {
        type KImage = { image: () => unknown; getClientRect: () => { width: number; height: number } };
        type KStage = { find: (s: string) => KImage[] };
        const K = (window as unknown as { Konva: { stages: KStage[] } }).Konva;
        const current = () => {
            const imgs = K.stages.flatMap(s => s.find('Image'));
            return imgs.sort((a, b) => b.getClientRect().width * b.getClientRect().height - a.getClientRect().width * a.getClientRect().height)[0]?.image();
        };
        const before = current();
        let t0 = 0;
        window.addEventListener('keydown', () => { t0 = performance.now(); }, { once: true, capture: true });
        const started = performance.now();
        const tick = () => {
            const img = current();
            if (t0 && img && img !== before) {
                // El frame següent és quan ja es veu a la pantalla
                requestAnimationFrame(() => resolve(performance.now() - t0));
            } else if (performance.now() - started > 5000) reject(new Error('el retall no ha canviat'));
            else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }));
    await page.waitForTimeout(50);
    await page.keyboard.press(key);
    return waiting;
}

test.beforeEach(async ({ page }) => {
    await openDemo(page);
});

test('canviar a l\'alumne següent triga < 150 ms', async ({ page }) => {
    await openCorrectionAt(page, 1);
    const times: number[] = [];
    for (let n = 2; n <= 6; n++) {
        await page.waitForTimeout(400); // temps de mirar l'alumne: la pre-càrrega fa la seva feina
        times.push(await timeToNewImage(page, 'ArrowRight'));
        await expect(page.getByText(`Alumne ${n} de 6`)).toBeVisible();
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];
    console.log(`[perf] canvi d'alumne (ms): ${times.map(t => t.toFixed(0)).join(', ')} · mediana ${median.toFixed(0)}`);
    expect(median).toBeLessThan(150);
    expect(times[times.length - 1], 'cap canvi lent').toBeLessThan(300);
});

test('navegar amb pre-càrrega no fa parpellejar «Carregant exercici»', async ({ page }) => {
    await openCorrectionAt(page, 1);
    await page.evaluate(() => {
        const w = window as unknown as { __flash: number };
        w.__flash = 0;
        new MutationObserver(() => { if (document.body.innerText.includes('Carregant exercici')) w.__flash++; })
            .observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft']) {
        await page.waitForTimeout(400);
        await page.keyboard.press(key);
    }
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as unknown as { __flash: number }).__flash)).toBe(0);
});
