import globals from 'globals'
import tseslint from 'typescript-eslint'
import { baseTs, ignoresPadrao } from '../../eslint.config.base.mjs'

export default tseslint.config(ignoresPadrao, {
  extends: baseTs,
  files: ['**/*.ts'],
  languageOptions: { globals: globals.node },
})
