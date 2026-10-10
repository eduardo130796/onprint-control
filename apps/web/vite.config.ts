import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'

// No Docker a API é o serviço "api"; rodando fora do Docker, localhost.
const apiAlvo = process.env.API_PROXY_TARGET ?? 'http://localhost:3333'

/** Leitores de link (mesma lista do Caddyfile e da API: apps/api/src/modules/vitrine/og.ts) */
const ROBOS_PREVIA = /WhatsApp|facebookexternalhit|Facebot|Twitterbot|TelegramBot|Slackbot|LinkedInBot|Discordbot|Pinterest|SkypeUriPreview/i
/** Caminhos que nunca são página: API, tempo real, internos do Vite e arquivos (têm extensão) */
const NAO_PAGINA = /^\/(?:api|socket\.io|assets|src|node_modules|@[a-z-]+|__[a-z-]+)(?:\/|$)|\.[a-z0-9]+$/i

/**
 * Prévia do link da vitrine em desenvolvimento (no servidor de produção quem faz isso é o Caddy): o leitor de
 * link (WhatsApp, Facebook…) que abre http://{slug}.localhost:5173/... recebe o HTML com as tags Open Graph da API.
 */
function previaDoLinkDaVitrine(): Plugin {
  return {
    name: 'onprint-vitrine-previa-link',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const host = req.headers.host ?? ''
        const caminho = req.url ?? '/'
        const ehVitrine = /^[a-z0-9-]+\.localhost(?::\d+)?$/i.test(host)
        if (req.method !== 'GET' || !ehVitrine || !ROBOS_PREVIA.test(req.headers['user-agent'] ?? '') || NAO_PAGINA.test(caminho.split('?')[0] ?? '')) return next()
        const url = `${apiAlvo}/api/v1/publico/vitrine-og?host=${encodeURIComponent(host)}&caminho=${encodeURIComponent(caminho)}`
        fetch(url, { headers: { 'X-Forwarded-Proto': 'http' } })
          .then(async (resposta) => {
            res.statusCode = resposta.status
            res.setHeader('Content-Type', resposta.headers.get('content-type') ?? 'text/html; charset=utf-8')
            res.setHeader('Cache-Control', 'no-cache')
            res.end(await resposta.text())
          })
          .catch(() => next())
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), previaDoLinkDaVitrine()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    // Vitrine online em desenvolvimento: http://{slug}.localhost:5173 (o navegador resolve *.localhost)
    allowedHosts: ['.localhost'],
    proxy: {
      '/api': { target: apiAlvo, changeOrigin: true },
      // Tempo real (Socket.IO) passa pelo mesmo endereço do front
      '/socket.io': { target: apiAlvo, ws: true, changeOrigin: true },
    },
    // Volume do Windows/macOS não propaga eventos de arquivo para o container: usa polling (1 s)
    watch:
      process.env.CHOKIDAR_USEPOLLING === 'true' ? { usePolling: true, interval: 1000 } : undefined,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tooltip', 'lucide-react'],
          forms: ['react-hook-form', '@hookform/resolvers', 'zod'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
