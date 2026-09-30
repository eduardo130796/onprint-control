import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// No Docker a API é o serviço "api"; rodando fora do Docker, localhost.
const apiAlvo = process.env.API_PROXY_TARGET ?? 'http://localhost:3333'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
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
