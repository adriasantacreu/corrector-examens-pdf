import { expect, test } from '@playwright/test';
import { openCorrectionAt, openDemo, openSession, SESSIONS } from './helpers';

/**
 * Cap clic mut i cap error amagat (auditoria B004 → arranjaments B005): els botons que no poden fer res
 * es veuen desactivats, el que esborra feina demana confirmació i, si no es pot desar, es diu.
 */

test.beforeEach(async ({ page }) => {
    await openDemo(page);
});

test('correcció: SCROLL desactivat en un retall i «+» desactivat sense text', async ({ page }) => {
    await openCorrectionAt(page, 4);
    await expect(page.getByRole('button', { name: /SCROLL|COMPLET/ })).toBeDisabled();

    const show = page.getByText('MOSTRA COMENTARIS');
    if (await show.isVisible()) await show.click();
    const add = page.getByTestId('comment-add');
    await expect(add).toBeDisabled();
    await expect(add).toHaveAttribute('title', 'Escriu el text del comentari');
    await page.getByPlaceholder('Text...').last().fill('Molt bé');
    await expect(add).toBeEnabled();
});

test('esborrar un fluorescent predefinit que ja té marques demana confirmació', async ({ page }) => {
    await openCorrectionAt(page, 4);
    await page.keyboard.press('2'); // Error Càlcul
    const box = (await page.locator('.konvajs-content').first().boundingBox())!;
    await page.mouse.move(box.x + 150, box.y + 150);
    await page.mouse.down();
    await page.mouse.move(box.x + 400, box.y + 190, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.press('Escape');

    const preset = page.getByTitle(/^Error Càlcul ·/);
    await preset.locator('xpath=..').getByTitle('Delete').click();
    await expect(page.getByText('Eliminar fluorescent')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel·lar' }).click();
    await expect(preset).toBeVisible();
});

test('organitzador: fletxes desactivades als extrems i paperera amb confirmació', async ({ page }) => {
    await openSession(page, SESSIONS.organizer);
    await expect(page.getByText('Organitzador de pàgines')).toBeVisible();
    const trash = page.getByTitle('Eliminar alumne');
    const before = await trash.count();

    await trash.first().click();
    await expect(page.getByText(/Vols treure .* de la distribució\?/)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel·lar' }).click();
    await expect(trash).toHaveCount(before);

    const firstCard = trash.first().locator('xpath=..');
    await expect(firstCard.locator('button').nth(0)).toBeDisabled(); // ↑ del primer
    const lastCard = trash.last().locator('xpath=..');
    await expect(lastCard.locator('button').nth(1)).toBeDisabled(); // ↓ del darrer
});

test('si no es pot desar la sessió, ho diu i no ho amaga', async ({ page }) => {
    await openCorrectionAt(page, 4);
    await page.evaluate(() => {
        IDBObjectStore.prototype.put = () => { throw new DOMException('Sense espai', 'QuotaExceededError'); };
    });
    await page.keyboard.press('p');
    const box = (await page.locator('.konvajs-content').first().boundingBox())!;
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 260, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByTestId('save-error')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('save-error')).toContainText('No es desa');
});
