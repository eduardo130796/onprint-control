import { defineConfig } from 'tsup'

// Build de produção: bundles ESM da API e do seed (a imagem de produção não tem tsx); o pacote compartilhado é embutido.
export default defineConfig({
  entry: { server: 'src/server.ts', seed: 'prisma/seed.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@onprint/shared'],
})
