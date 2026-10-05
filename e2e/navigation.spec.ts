/** Recorregut de les 6 pantalles: cada botó porta on toca, endavant i enrere. */
import { expect, test } from '@playwright/test';
import { openDemo, openSession, SESSIONS } from './helpers';

const TITLES = {
    setup: "Configuració de l'examen",
    organizer: 'Organitzador de pàgines',
    template: 'Definir plantilla',
    results: 'Resultats i Exportació',
};

test('cada sessió s\'obre a la pantalla on es va deixar', async ({ page }) => {
    await openDemo(page);
    await openSession(page, SESSIONS.setup);
    await expect(page.getByText(TITLES.setup)).toBeVisible();
    for (const [key, title] of [['organizer', TITLES.organizer], ['template', TITLES.template], ['results', TITLES.results]] as const) {
        await page.goto('/');
        await openSession(page, SESSIONS[key]);
        await expect(page.getByText(title)).toBeVisible();
    }
    await page.goto('/');
    await openSession(page, SESSIONS.correction);
    await expect(page.getByText('NOTA FINAL', { exact: false })).toBeVisible();
});

test('endavant: Configuració → Organitzador → Plantilla', async ({ page }) => {
    await openDemo(page);
    await openSession(page, SESSIONS.setup);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText(TITLES.organizer)).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText(TITLES.template)).toBeVisible();
});

test('endavant: Plantilla → Correcció → Resultats', async ({ page }) => {
    await openDemo(page);
    await openSession(page, SESSIONS.correction);
    await page.getByRole('button', { name: 'Finalitzar' }).click();
    await expect(page.getByText(TITLES.results)).toBeVisible();
});

test('enrere: Resultats → Correcció → Plantilla → Organitzador → Configuració → Inici', async ({ page }) => {
    await openDemo(page);
    await openSession(page, SESSIONS.results);
    const back = page.locator('header button, .header button, button').first();
    const steps = ['NOTA FINAL', TITLES.template, TITLES.organizer, TITLES.setup];
    for (const title of steps) {
        await back.click();
        await expect(page.getByText(title, { exact: false }).first()).toBeVisible();
    }
    await back.click();
    await expect(page.getByText('Nou PDF')).toBeVisible();
});

test('a Resultats cap nota passa del màxim (10) i la mitjana hi quadra', async ({ page }) => {
    await openDemo(page);
    await openSession(page, SESSIONS.results);
    await expect(page.getByTestId('nota-alumne')).toHaveText(['10.00', '9.00', '9.25', '7.75', '10.00', '9.00']);
    await expect(page.getByText('9.17', { exact: true })).toBeVisible();
});
