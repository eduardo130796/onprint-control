/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Domínio base da vitrine online (ex.: grafygo.com.br): o site de cada gráfica fica em {slug}.{domínio}. Padrão: localhost */
  readonly VITE_DOMINIO_VITRINE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
