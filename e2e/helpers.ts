import { expect, type Page } from '@playwright/test';

/** Data fixa perquè les dates relatives ("fa 5 min") i les captures no canviïn d'un dia a l'altre. */
export const FIXED_NOW = new Date('2026-10-05T10:00:00+02:00');

export const SESSIONS = {
    setup: 'demo_nou_examen',
    organizer: 'Geometria',
    template: 'Estadística',
    correction: 'Matrius',
    results: 'Funcions',
} as const;

/** Obre l'app amb les dades de demostració acabades de crear. */
export async function openDemo(page: Page) {
    await page.clock.setFixedTime(FIXED_NOW);
    await page.goto('/?demo=reset');
    await expect(page.getByText('Nou PDF')).toBeVisible();
}

/** Obre una de les sessions de demostració des de l'Inici (directament o des de "Darreres sessions"). */
export async function openSession(page: Page, name: string) {
    let card = page.getByText(name).first();
    if (!(await card.isVisible())) {
        await page.getByText('Darreres sessions').click();
        card = page.getByText(name).first();
    }
    await card.click();
}
