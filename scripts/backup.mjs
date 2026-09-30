// Backup do ambiente Docker: banco (pg_dump formato custom, compactado) + pasta de uploads.
// Funciona em Windows, Linux e macOS (não depende de pg_dump instalado na máquina).
import { execSync } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const agora = new Date()
const pad = (n) => String(n).padStart(2, '0')
const carimbo = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}_${pad(agora.getHours())}-${pad(agora.getMinutes())}-${pad(agora.getSeconds())}`

mkdirSync('backups', { recursive: true })
const arquivoBanco = join('backups', `onprint_${carimbo}.dump`)
const pastaUploads = join('backups', `uploads_${carimbo}`)

await new Promise((resolve, reject) => {
  const dump = spawn(
    'docker',
    ['compose', 'exec', '-T', 'db', 'sh', '-c', 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z 6'],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
  dump.stdout.pipe(createWriteStream(arquivoBanco))
  dump.on('close', (codigo) => (codigo === 0 ? resolve() : reject(new Error(`pg_dump saiu com código ${codigo}`))))
})
console.log(`Banco salvo em ${arquivoBanco}`)

execSync(`docker compose cp api:/app/uploads "${pastaUploads}"`, { stdio: 'inherit' })
console.log(`Uploads copiados para ${pastaUploads}`)
