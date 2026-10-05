import { expect, test, type Page } from '@playwright/test';
import { openDemo, openSession, SESSIONS } from './helpers';

/**
 * Captures de referència de cada pantalla, en mode clar i fosc. Si una pantalla canvia sense voler, falla.
 * Canvi volgut → regenerar-les: `npm run e2e:update` i revisar les imatges noves abans del commit.
 */

const SCREENS: { name: string; open: (page: Page) => Promise<void>; ready: string }[] = [
    { name: 'inici', open: async () => {}, ready: 'Nou PDF' },
    { name: 'configuracio', open: p => openSession(p, SESSIONS.setup), ready: "Configuració de l'examen" },
    { name: 'organitzador', open: p => openSession(p, SESSIONS.organizer), ready: 'Organitzador de pàgines' },
    { name: 'plantilla', open: p => openSession(p, SESSIONS.template), ready: 'Definir plantilla' },
    { name: 'correccio', open: p => openSession(p, SESSIONS.correction), ready: 'NOTA FINAL' },
    { name: 'resultats', open: p => openSession(p, SESSIONS.results), ready: 'Resultats i Exportació' },
];

for (const theme of ['light', 'dark'] as const) {
    for (const screen of SCREENS) {
        test(`${screen.name} (${theme === 'light' ? 'clar' : 'fosc'})`, async ({ page }) => {
            await page.addInitScript(t => {
                const key = 'flowgrading_global';
                try { localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) || '{}'), theme: t })); } catch { /* sense storage */ }
            }, theme);
            await openDemo(page);
            await screen.open(page);
            await expect(page.getByText(screen.ready).first()).toBeVisible();
            await page.evaluate(() => document.fonts.ready);
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(800); // miniatures i canvas de Konva
            await expect(page).toHaveScreenshot(`${screen.name}-${theme}.png`, { animations: 'disabled', caret: 'hide' });
        });
    }
}
