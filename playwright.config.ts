/**
 * Banc de proves de punta a punta (headless). Parteix sempre de les dades fictícies de `?demo=reset`.
 * `npm run e2e` compila i serveix l'app amb `vite preview` només mentre duren els tests.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4179;

export default defineConfig({
    testDir: './e2e',
    snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 60_000,
    reporter: [['list']],
    expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled' } },
    use: {
        baseURL: `http://127.0.0.1:${PORT}/`,
        viewport: { width: 1440, height: 900 },
        locale: 'ca-ES',
        timezoneId: 'Europe/Madrid',
        trace: 'retain-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
    webServer: {
        command: `node node_modules/vite/bin/vite.js build --logLevel error && node node_modules/vite/bin/vite.js preview --port ${PORT} --strictPort`,
        url: `http://127.0.0.1:${PORT}/`,
        reuseExistingServer: false,
        timeout: 120_000,
    },
});
