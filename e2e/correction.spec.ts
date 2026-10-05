import { expect, test, type Page } from '@playwright/test';
import { openCorrectionAt, openDemo, openSession, SESSIONS } from './helpers';

/**
 * Correcció: dibuixar, comentar, fluorescent amb punts, desfer/refer, canviar d'alumne i d'exercici,
 * i la nota que es veu a pantalla. Comença a l'alumne 4 (Pol), que a la demo no té cap anotació.
 */

const finalScore = (page: Page) => page.getByTestId('nota-final');
const exerciseScore = (page: Page) => page.getByTestId('nota-exercici');
const canvas = (page: Page) => page.locator('.konvajs-content').first();
const undoButton = (page: Page) => page.getByTitle('Undo (Ctrl+Z)');

/** Arrossega el ratolí sobre el canvas, en coordenades relatives a la seva cantonada (px de pantalla). */
async function drag(page: Page, from: [number, number], to: [number, number]) {
    const box = (await canvas(page).boundingBox())!;
    await page.mouse.move(box.x + from[0], box.y + from[1]);
    await page.mouse.down();
    await page.mouse.move(box.x + (from[0] + to[0]) / 2, box.y + (from[1] + to[1]) / 2, { steps: 4 });
    await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 4 });
    await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
    await openDemo(page);
    await openCorrectionAt(page, 4);
});

test('un alumne sense anotacions té la nota màxima', async ({ page }) => {
    await expect(exerciseScore(page)).toHaveText(/^3\s*\/ 3$/);
    await expect(finalScore(page)).toHaveText('10');
    await expect(undoButton(page)).toBeDisabled();
});

test('dibuixar amb el boli es pot desfer i refer', async ({ page }) => {
    await page.keyboard.press('p');
    await drag(page, [200, 200], [320, 260]);
    await expect(undoButton(page)).toBeEnabled();
    await expect(exerciseScore(page)).toHaveText(/^3\s*\/ 3$/);

    await page.keyboard.press('Control+z');
    await expect(undoButton(page)).toBeDisabled();
    await page.keyboard.press('Control+Shift+z');
    await expect(undoButton(page)).toBeEnabled();
});

test('el fluorescent amb criteri resta punts i desfer els torna', async ({ page }) => {
    await page.keyboard.press('2'); // preset h2: Error Càlcul (-0.25)
    await drag(page, [150, 150], [400, 190]);
    await expect(exerciseScore(page)).toHaveText(/^2\.75\s*\/ 3$/);
    await expect(finalScore(page)).toHaveText('9.75');

    await page.keyboard.press('Control+z');
    await expect(exerciseScore(page)).toHaveText(/^3\s*\/ 3$/);
    await page.keyboard.press('Control+Shift+z');
    await expect(exerciseScore(page)).toHaveText(/^2\.75\s*\/ 3$/);
});

test('un comentari del banc arrossegat al full compta a la nota', async ({ page }) => {
    const chip = page.getByText('Revisa aquest concepte', { exact: true }).first();
    await chip.dragTo(canvas(page), { targetPosition: { x: 300, y: 300 } });
    await expect(exerciseScore(page)).toHaveText(/^2\.5\s*\/ 3$/);
    await expect(finalScore(page)).toHaveText('9.5');
});

test('les anotacions són de cada alumne i de cada exercici', async ({ page }) => {
    await page.keyboard.press('3'); // preset h3: Concepte Erroni (-1)
    await drag(page, [150, 150], [400, 190]);
    await expect(exerciseScore(page)).toHaveText(/^2\s*\/ 3$/);
    await expect(finalScore(page)).toHaveText('9');

    // Exercici següent: nota sencera i historial propi.
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByText('Exercici 2 — Discussió de sistemes')).toBeVisible();
    await expect(exerciseScore(page)).toHaveText(/^3\s*\/ 3$/);
    await expect(undoButton(page)).toBeDisabled();

    // Alumne següent: no hereta res.
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('Alumne 5 de 6')).toBeVisible();
    await expect(finalScore(page)).toHaveText('10');

    // Tornar enrere: l'anotació hi és.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    await expect(page.getByText('Exercici 1 — Producte i determinant')).toBeVisible();
    await expect(exerciseScore(page)).toHaveText(/^2\s*\/ 3$/);
    await expect(finalScore(page)).toHaveText('9');
});

test('la nota sobreviu a recarregar la pàgina', async ({ page }) => {
    await page.keyboard.press('2');
    await drag(page, [150, 150], [400, 190]);
    await expect(finalScore(page)).toHaveText('9.75');
    await page.waitForTimeout(1500); // desat amb debounce
    await page.goto('/');
    await openSession(page, SESSIONS.correction);
    await expect(page.getByText('Alumne 4 de 6')).toBeVisible();
    await expect(finalScore(page)).toHaveText('9.75');
});
