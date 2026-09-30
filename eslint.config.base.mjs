// Configuração ESLint compartilhada pelos pacotes do monorepo
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export const ignoresPadrao = { ignores: ['dist', 'node_modules', 'coverage'] }

export const baseTs = [js.configs.recommended, ...tseslint.configs.recommended]
