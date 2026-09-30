// Restaura um backup do banco gerado por scripts/backup.mjs.
// Uso: node scripts/restore.mjs backups/onprint_AAAA-MM-DD_hh-mm-ss.dump
import { createReadStream, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'

const arquivo = process.argv[2]
if (!arquivo || !existsSync(arquivo)) {
  console.error('Informe o arquivo: make restore ARQ=backups/onprint_....dump')
  process.exit(1)
}

await new Promise((resolve, reject) => {
  const restore = spawn(
    'docker',
    [
      'compose', 'exec', '-T', 'db', 'sh', '-c',
      'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner',
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  )
  createReadStream(arquivo).pipe(restore.stdin)
  restore.on('close', (codigo) => (codigo === 0 ? resolve() : reject(new Error(`pg_restore saiu com código ${codigo}`))))
})
console.log(`Banco restaurado de ${arquivo}.`)
console.log('Uploads: copie a pasta correspondente com  docker compose cp backups/uploads_<data>/. api:/app/uploads')
