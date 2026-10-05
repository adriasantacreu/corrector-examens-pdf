/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  // Els tests de navegador (e2e/) són de Playwright: vitest només fa els unitaris de src/
  test: { include: ['src/**/*.test.{ts,tsx}'] },
  server: {
    proxy: {
      '/api/groq': {
        target: 'https://api.groq.com',
        changeOrigin: true,
        rewrite: () => '/openai/v1/chat/completions',
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            const key = process.env.GROQ_API_KEY;
            if (key) proxyReq.setHeader('Authorization', `Bearer ${key}`);
          });
        },
      },
    },
  },
})
