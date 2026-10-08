import { defineConfig } from 'tsup'

// Build de produção: bundles ESM da API e dos scripts (migrar, seed, criar empresa) (a imagem de produção não tem tsx); o pacote compartilhado é embutido.
export default defineConfig({
  entry: { server: 'src/server.ts', seed: 'prisma/seed.ts', migrar: 'prisma/migrar.ts', 'criar-empresa': 'prisma/criar-empresa.ts', assinatura: 'prisma/assinatura.ts', 'admin-plataforma': 'prisma/admin-plataforma.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@onprint/shared'],
})
