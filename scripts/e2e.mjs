// Testes ponta a ponta num banco DESCARTÁVEL (onprint_e2e), sem tocar nos dados de desenvolvimento.
// Para cada fase: recria o banco, aplica migrations + seed, sobe uma API temporária (porta 3334)
// dentro do container da API, roda o script de verificação e encerra a API temporária.
// Uso: npm run e2e              (todas as fases: apps/api/scripts/e2e-fase*.mjs)
//      npm run e2e -- fase2     (só uma fase)
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'

const URL_BANCO = 'postgresql://onprint:onprint@db:5432/onprint_e2e'
const fases = process.argv[2]
  ? [process.argv[2]]
  : readdirSync('apps/api/scripts')
      .filter((f) => /^e2e-fase\d+\.mjs$/.test(f))
      .map((f) => f.replace(/^e2e-|\.mjs$/g, ''))
      .sort()

/** Executa "docker compose exec" sem shell do Windows no meio (argumentos em lista). */
function exec(servico, comando, env = {}) {
  const envArgs = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`])
  const r = spawnSync('docker', ['compose', 'exec', '-T', ...envArgs, servico, 'sh', '-c', comando], { stdio: 'inherit' })
  return r.status ?? 1
}

function obrigatorio(status, etapa) {
  if (status !== 0) {
    console.error(`✘ Falhou: ${etapa}`)
    process.exit(1)
  }
}

function rodarFase(fase) {
  console.log(`\n══════════ ${fase} ══════════\n› Recriando o banco onprint_e2e…`)
  obrigatorio(
    exec('db', 'psql -q -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS onprint_e2e WITH (FORCE)" -c "CREATE DATABASE onprint_e2e"'),
    'criar banco',
  )
  obrigatorio(
    exec('api', 'cd apps/api && npx tsx prisma/migrar.ts > /dev/null && npx tsx prisma/seed.ts > /dev/null', { DATABASE_URL: URL_BANCO }),
    'migrations + seed',
  )
  // O argumento --e2e-temporario marca os processos para encerrar só eles (a API de dev tem a mesma linha de comando)
  obrigatorio(
    exec(
      'api',
      // E-mails da API temporária vão para /tmp/e2e-emails (a Fase 10 lê os links de senha dali)
      'rm -rf /tmp/e2e-emails ; (cd apps/api && PORT=3334 LOG_LEVEL=warn EMAIL_PASTA=/tmp/e2e-emails CACHE_EMPRESAS_SEGUNDOS=0 ASAAS_API_KEY=chave-teste ASAAS_API_URL=http://127.0.0.1:3399/v3 ASAAS_WEBHOOK_TOKEN=token-de-webhook-de-teste-com-32-caracteres-ok ASAAS_NF_ATIVA=true ASAAS_NF_SERVICO_CODIGO=01.07 ASAAS_NF_ISS=2 npx tsx src/server.ts --e2e-temporario > /tmp/e2e-api.log 2>&1 &) ; ' +
        'for i in $(seq 1 30); do wget -qO- http://127.0.0.1:3334/health > /dev/null 2>&1 && exit 0; sleep 1; done; cat /tmp/e2e-api.log; exit 1',
      { DATABASE_URL: URL_BANCO },
    ),
    'subir API temporária',
  )
  // O script recebe o banco descartável (a Fase 7 confere os números com SQL direto)
  const status = exec('api', `node apps/api/scripts/e2e-${fase}.mjs http://127.0.0.1:3334/api/v1`, { DATABASE_URL: URL_BANCO })
  exec('api', "pkill -f -- '--e2e-temporario' ; true")
  return status
}

const falharam = fases.filter((f) => rodarFase(f) !== 0)
console.log(falharam.length ? `\n✘ Fases com falha: ${falharam.join(', ')}` : `\n✔ Todas as fases passaram (${fases.join(', ')}).`)
process.exit(falharam.length ? 1 : 0)
