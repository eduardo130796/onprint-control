# Colocar a GrafyGo no ar (VPS Linux)

> **Lançamento da GrafyGo:** siga primeiro o roteiro [LANCAMENTO_GRAFYGO.md](LANCAMENTO_GRAFYGO.md), que traz a ordem das etapas e os valores de grafygo.com.br já preenchidos. Este guia tem os comandos detalhados de cada etapa.

Passo a passo para instalar o sistema numa VPS (ex.: Hostinger KVM) com domínio próprio, HTTPS automático e backup diário. Os comandos são para **Ubuntu 24.04**; copie e cole um bloco por vez.

**Como fica no servidor:** 3 containers Docker.

| Container | Função | Porta aberta para a internet |
|---|---|---|
| `web` (Caddy) | Entrega as telas, gera e renova o HTTPS sozinho, repassa `/api` e `/socket.io` para a API | 80 e 443 |
| `api` | Regras do sistema; aplica as migrations e o seed ao iniciar | nenhuma |
| `db` (PostgreSQL 16) | Banco de dados | nenhuma |

Arquivos usados: `docker-compose.prod.yml`, `Caddyfile`, `.env.prod` (criado por você a partir de `.env.prod.example`) e `scripts/vps/` (backup, restauração e atualização).

---

## 1. Antes de começar

- **VPS:** 2 vCPU e 4 GB de RAM recomendados (ex.: Hostinger KVM 2). Funciona com 1 vCPU / 2 GB se você criar o swap do passo 3.
- **Sistema:** Ubuntu 24.04 LTS (escolha no painel da Hostinger ao criar a VPS).
- **Domínio ou subdomínio** para o sistema, por exemplo `erp.suaempresa.com.br`, com acesso ao painel de DNS.
- **No seu computador:** um terminal com SSH (Windows: PowerShell ou Windows Terminal).

Anote o **IP da VPS** e a **senha de root** que o painel mostra.

## 2. Apontar o domínio

No painel de DNS do domínio, crie um registro:

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| `A` | `erp` (ou `@` para o domínio principal) | IP da VPS | 3600 |

A propagação costuma levar alguns minutos. Para conferir no seu computador: `nslookup erp.suaempresa.com.br` deve responder com o IP da VPS. **Só avance para o passo 8 depois disso**, porque o HTTPS precisa do domínio apontado.

**Vitrine online** (site de produtos de cada gráfica em `https://{slug}.suaempresa.com.br`): crie também o registro curinga.

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| `A` | `*` | IP da VPS | 3600 |

Conferir: `nslookup qualquer-coisa.suaempresa.com.br` deve responder com o IP da VPS. O certificado de cada subdomínio é emitido na primeira visita (HTTPS sob demanda), e só para vitrines que estão no ar: antes de emitir, o Caddy pergunta à API (`/api/v1/publico/vitrine-permitida`). Subdomínios como `www`, `app`, `api`, `admin`, `mail`… são reservados e nunca viram vitrine.

**Página de venda** (`https://suaempresa.com.br` e `www`): crie também os registros `A` com nome `@` e `www` apontando para o IP da VPS. Ela mostra os planos e preços do painel da plataforma, e o "Testar grátis" leva para o cadastro no `APP_URL`. Use um subdomínio para o sistema (ex.: `DOMINIO=app.suaempresa.com.br`): o domínio principal fica com a página de venda. Antes de divulgar, preencha `titular` e `documento` em `apps/web/src/app/marca.ts` (seu nome e CPF enquanto for pessoa física; razão social e CNPJ depois — aparecem nos termos de uso e no rodapé). Sem CNPJ, deixe `ASAAS_NF_ATIVA=false`: o site e o sistema não prometem nota fiscal e revise os textos de `apps/web/src/features/legal/textos.ts` com um advogado.

**Domínio próprio da gráfica** (opcional, ex.: `www.graficadocliente.com.br`): nada a fazer no servidor. A gráfica cadastra o domínio em Vitrine → Configurar e cria no DNS dela um `CNAME www → {slug}.suaempresa.com.br` (a tela mostra os valores para copiar). O bloco `https://` do `Caddyfile` atende qualquer outro nome e emite o certificado na primeira visita, só para domínios cadastrados de vitrines no ar.

**Prévia do link no WhatsApp** (foto, nome e preço ao colar o link de um produto): já vem pronta no `Caddyfile`. Nas vitrines, os leitores de link (WhatsApp, Facebook, Telegram, LinkedIn…, reconhecidos pelo User-Agent) recebem da API um HTML com as tags Open Graph (`/api/v1/publico/vitrine-og`); visitantes e buscadores veem o site normal. Nunca vale para o endereço do sistema.

## 3. Primeiro acesso e preparo do servidor

```bash
ssh root@IP_DA_VPS
```

Atualize o sistema e crie um usuário para o dia a dia (troque `onprint` se quiser):

```bash
apt update && apt upgrade -y
adduser onprint
usermod -aG sudo onprint
```

**Swap** (memória extra em disco; evita travar a VPS durante o build):

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

**Fuso horário:**

```bash
timedatectl set-timezone America/Sao_Paulo
```

## 4. Firewall: liberar só 22, 80 e 443

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw enable
ufw status
```

> Se a Hostinger tiver firewall no painel da VPS, libere as mesmas portas lá. O banco e a API **não** publicam portas no `docker-compose.prod.yml`, então não ficam acessíveis de fora, mesmo com o Docker.

**Recomendado:** entrar por chave SSH em vez de senha. No seu computador, rode `ssh-keygen` (se ainda não tiver uma chave) e depois `ssh-copy-id onprint@IP_DA_VPS`. Confirme que consegue entrar sem senha. Depois, na VPS, desligue o login por senha:

```bash
sudo sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/; s/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

## 5. Instalar o Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker onprint
```

Saia (`exit`) e entre de novo como o usuário do dia a dia:

```bash
ssh onprint@IP_DA_VPS
docker --version && docker compose version
```

## 6. Enviar o sistema para a VPS

**Opção A: com repositório git (recomendado)**

```bash
cd ~
git clone URL_DO_SEU_REPOSITORIO onprint
cd onprint
```

**Opção B: copiando a pasta do seu computador.** No Windows, compacte a pasta do projeto **sem** `node_modules`, `dist`, `uploads`, `backups` e `.env*`. Depois, no PowerShell:

```powershell
scp onprint.zip onprint@IP_DA_VPS:~
```

E na VPS:

```bash
sudo apt install -y unzip && unzip ~/onprint.zip -d ~/onprint && cd ~/onprint
chmod +x scripts/vps/*.sh
```

## 7. Configurar os segredos (`.env.prod`)

```bash
cp .env.prod.example .env.prod
openssl rand -hex 32   # rode 3 vezes: senha do banco, JWT_ACCESS_SECRET e JWT_REFRESH_SECRET
nano .env.prod
```

Troque **todos** os valores marcados com `TROQUE`:

| Variável | O que colocar |
|---|---|
| `DOMINIO` | o domínio do passo 2, sem `https://` (ex.: `app.suaempresa.com.br`). Precisa ser diferente de `DOMINIO_VITRINE`, que fica com a página de venda |
| `APP_URL` | o mesmo domínio com `https://` |
| `DOMINIO_VITRINE` | domínio das vitrines online, sem `https://` (ex.: `suaempresa.com.br` → `https://{slug}.suaempresa.com.br`). Precisa do registro curinga `*` do passo 2. Vai para a API, para o Caddy e para o build do front (`VITE_DOMINIO_VITRINE`) |
| `POSTGRES_PASSWORD` | uma senha gerada. Ela aparece **também** dentro de `DATABASE_URL`: troque nos dois lugares |
| `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` | dois valores gerados, **diferentes entre si**. A API se recusa a subir com segredos fracos ou de exemplo |
| `ADMIN_EMAIL` e `ADMIN_SENHA_INICIAL` | o primeiro acesso. A troca de senha é obrigatória no 1º login. Numa instalação nova são **obrigatórios**: senha com 12+ caracteres e sem `TROQUE`, senão o seed para e a API não sobe |
| `SEED_EXEMPLOS` | `false` para começar vazio; `true` cria um catálogo de exemplo (banners, canecas…) |
| `PLATAFORMA_ADMIN_EMAIL` e `PLATAFORMA_ADMIN_SENHA` | o seu acesso ao painel da plataforma (`https://SEU_DOMINIO/plataforma`), criado na primeira subida. Use uma senha forte (12+ caracteres, sem `TROQUE`) e diferente das outras |
| `CADASTRO_PUBLICO` | `true` deixa as gráficas criarem conta sozinhas em `/criar-conta` (teste grátis); `false` fecha |
| `CADASTROS_POR_HORA` | teto de cadastros pela internet por hora, somando todos os IPs (padrão 30). Passou disso, o cadastro responde "tente de novo em alguns minutos" |
| `ASAAS_*` | chave de **produção** do Asaas (`ASAAS_AMBIENTE=producao`), token do webhook e dados da NFS-e. Passo a passo no README (seção Pagamento online). O webhook aponta para `https://SEU_DOMINIO/api/v1/plataforma/webhooks/asaas` |
| `EVOLUTION_API_KEY` e `WHATSAPP_PROVEDOR` | chave gerada (`openssl rand -hex 32`) que a API usa para falar com o container do WhatsApp (Evolution API, só na rede interna) e `evolution` para os avisos saírem de verdade (`log` desliga). Mais no passo 8 (WhatsApp) |
| `WHATSAPP_WEBHOOK_URL` e `WHATSAPP_WEBHOOK_SEGREDO` (opcionais) | por onde a Evolution avisa a API das respostas dos clientes (voto na enquete do orçamento, "aprovado" escrito) e da conexão. Vazios = `http://api:3333/api/v1` (rede interna do compose) e segredo derivado do `JWT_ACCESS_SECRET`, um por gráfica. O webhook é ligado sozinho ao conectar o WhatsApp e, a cada subida da API, nas gráficas já conectadas; nenhuma porta nova é aberta |
| `SMTP_*` e `EMAIL_REMETENTE` | dados SMTP do seu provedor de e-mail (tabela de exemplos no README). Sem eles, convites, "esqueci a senha" e a confirmação do pedido da vitrine não chegam a ninguém. Use `EMAIL_REMETENTE="GrafyGo <nao-responda@suaempresa.com.br>"` no seu domínio (com SPF/DKIM configurados no provedor): os e-mails das gráficas saem desse endereço com o **nome da gráfica** e "Responder para" o e-mail dela (Dados da empresa) |

Salve (Ctrl+O, Enter, Ctrl+X) e proteja o arquivo:

```bash
chmod 600 .env.prod
```

> Guarde uma cópia do `.env.prod` fora da VPS (num cofre de senhas, por exemplo). Sem ele, os backups continuam válidos, mas você precisa recriar os segredos.

> O `.env.prod` só vai inteiro para o container da API. O banco recebe apenas `POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_DB`, e o Caddy (web) apenas `DOMINIO` e `DOMINIO_VITRINE` (este também no build do front), sempre pelo `--env-file .env.prod` dos comandos abaixo (sem ele o compose avisa que falta `POSTGRES_USER`).

## 8. Subir o sistema

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod build api
docker compose -f docker-compose.prod.yml --env-file .env.prod build web
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

O primeiro build leva alguns minutos. `db`, `api`, `web` e `evolution` devem aparecer como `Up`, com a API `(healthy)` (o `evolution-db` só cria o banco do WhatsApp e termina como `Exited (0)`). Ao iniciar, a API aplica as migrations e o seed sozinha (papéis, permissões, status, formas de pagamento e o admin inicial).

Para não repetir o comando longo, crie um atalho:

```bash
echo "alias onprint='docker compose -f ~/onprint/docker-compose.prod.yml --env-file ~/onprint/.env.prod'" >> ~/.bashrc && source ~/.bashrc
onprint ps
onprint logs -f --tail=100 api
```

Abra **https://SEU_DOMINIO** no navegador. O certificado HTTPS é emitido na primeira visita (pode levar alguns segundos).

**Primeiro acesso:**
1. Entre com `ADMIN_EMAIL` e `ADMIN_SENHA_INICIAL` e crie a senha definitiva.
2. **Configurações → Empresa**: dados, logo e condições padrão.
3. **Configurações → Usuários**: crie a equipe. Cada pessoa troca a senha provisória no primeiro login.
4. Financeiro: confira as contas, formas de pagamento (taxas de cartão) e saldos iniciais.

### WhatsApp das gráficas (avisos dos pedidos)

Cada gráfica conecta o próprio número em **WhatsApp → Conectar** (QR code lido no celular, como o WhatsApp Web) e escolhe quais avisos saem: pedido confirmado, arte para aprovação, pedido pronto, saiu para entrega (ligados por padrão), pagamento recebido e entregue. O envio respeita o horário configurado (padrão 08:00–20:00), espera 20–40 s entre mensagens e no máximo 30 por hora por gráfica.

- O container `evolution` ([Evolution API](https://github.com/EvolutionAPI/evolution-api) `v2.3.7`, open source) roda **sem porta publicada**: só a API fala com ele (`http://evolution:8080`, cabeçalho `apikey`). O `evolution-db` cria o banco `evolution` no mesmo Postgres na primeira subida.
- Memória: ~300 MB com poucas gráficas conectadas (teto de 1 GB no compose). Acompanhe com `docker stats --no-stream`.
- As sessões ficam no volume `evolution_instances` e no banco `evolution`, que **não** entram no backup diário (só o banco do sistema): perdê-los só obriga as gráficas a ler o QR de novo.
- A senha do Postgres vai na URL da Evolution: use uma senha gerada com `openssl rand -hex 32` (sem `@ : / ? #`).
- Para desligar o envio sem parar nada: `WHATSAPP_PROVEDOR=log` no `.env.prod` e `onprint up -d api`.
- Conexão caiu (celular sem internet por muito tempo, WhatsApp desconectou o aparelho): os avisos esperam na fila até 48 h e os administradores da gráfica recebem a notificação "WhatsApp desconectado — leia o QR de novo".

## 9. Backup diário (banco + arquivos), com cópia fora da VPS

O script `scripts/vps/backup.sh`:
- gera `backups/onprint_DATA.dump` (banco compactado) todo dia e guarda 14 dias na VPS (`DIAS_RETENCAO`);
- gera `backups/uploads_DATA.tar.gz` (artes, fotos e PDFs) e guarda **só o mais recente** na VPS (os arquivos são o que mais cresce: 14 cópias inteiras lotariam o disco);
- se `RCLONE_DESTINO` estiver definido, manda o dump para `DESTINO/banco/` (guarda 30 dias, `DIAS_RETENCAO_REMOTO`) e **espelha** os arquivos em `DESTINO/uploads/` de forma incremental: só sobe o que mudou, e o que foi apagado ou substituído fica 30 dias em `DESTINO/uploads-alterados/DATA`. O espelho roda pela imagem oficial do rclone (`rclone/rclone`), lendo o volume do Docker.

**Teste manual:**

```bash
cd ~/onprint && scripts/vps/backup.sh && ls -lh backups/
```

**Cópia fora do servidor com rclone** (Google Drive, OneDrive, Dropbox, S3, outro servidor…):

```bash
sudo apt install -y rclone
rclone config          # crie um "remote", por exemplo chamado gdrive
rclone lsd gdrive:     # confere o acesso
```

> Na VPS não há navegador: quando o `rclone config` perguntar "Use auto config?", responda `n` e siga as instruções. Elas mandam rodar um comando no seu computador para autorizar.

**Agendar todo dia às 02:30:**

```bash
crontab -e
```

Acrescente a linha (ajuste o destino):

```
30 2 * * * RCLONE_DESTINO=gdrive:grafygo-backups /home/onprint/onprint/scripts/vps/backup.sh >> /home/onprint/backup.log 2>&1
```

Confira no dia seguinte com `tail /home/onprint/backup.log` e verificando a pasta no Drive.

**Recomendações:**
- Ative também os **snapshots automáticos** da Hostinger (painel da VPS), como uma segunda camada.
- **Teste a restauração** (passo 11) de vez em quando. Backup que nunca foi restaurado não é garantia.

## 10. Atualizar o sistema

> **Atualização de segurança (D203, revisão de autenticação e implantação):** antes de atualizar uma instalação existente, confira o `.env.prod`:
> `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` com 32+ caracteres, diferentes e sem `TROQUE` (a API não sobe sem isso).
> Trocar os segredos JWT encerra as sessões abertas (todos entram de novo) e invalida links de senha já enviados.
> `ADMIN_*`/`PLATAFORMA_ADMIN_*` só são conferidos quando o administrador ainda vai ser criado: instalações existentes não são afetadas.

```bash
cd ~/onprint
scripts/vps/atualizar.sh
```

O script:
1. faz um backup;
2. baixa a versão nova com `git pull`, se houver repositório (sem git, **copie os arquivos novos antes**, como no passo 6, sem apagar `.env.prod` e `backups/`);
3. reconstrói as imagens;
4. sobe os containers: as migrations novas são aplicadas sozinhas, na plataforma e no schema de cada empresa;
5. limpa imagens antigas.

O sistema fica fora do ar por menos de um minuto durante a troca.

Se a versão nova precisar de uma variável que o seu `.env.prod` ainda não tem, o script **para antes de mexer nos containers** (o sistema antigo continua no ar), mostra o que falta e como gerar. Acrescente e rode o script de novo.

### Atualização de outubro de 2026 (WhatsApp, acompanhamento do pedido, conversão automática)

Para uma VPS que já estava no ar antes desta versão:

1. **Acrescente ao `.env.prod`** (o container novo do WhatsApp não sobe sem a chave):
   ```bash
   cd ~/onprint
   echo "EVOLUTION_API_KEY=$(openssl rand -hex 32)" >> .env.prod
   echo "WHATSAPP_PROVEDOR=evolution" >> .env.prod
   ```
   Quer subir primeiro sem enviar nada de verdade? Use `WHATSAPP_PROVEDOR=log` e troque para `evolution` depois (`onprint up -d api`).
2. **Confira a senha do banco**: ela vai na URL da Evolution, então não pode ter `@ : / ? #`. Se foi gerada com `openssl rand -hex 32` (como no passo 7), está certa.
3. **Rode** `scripts/vps/atualizar.sh`. Além do de sempre, ele cria o banco `evolution` e sobe o container `evolution` (cerca de 1 minuto até ficar saudável). As migrations desta versão (link de acompanhamento dos pedidos, avisos do WhatsApp, mensagens formatadas, conversão automática) são aplicadas sozinhas em todas as gráficas.
4. **Confira**:
   ```bash
   onprint ps                       # evolution "healthy" e api "healthy"
   docker stats --no-stream         # evolution ~300 MB
   ```
   No sistema: **WhatsApp → Conectar** mostra o QR code; um pedido mostra **Link de acompanhamento**; em **Configurações → Empresa → Pedidos** a opção "criar o pedido automaticamente" vem ligada.
5. **Avise as gráficas** do que mudou: orçamento aprovado vira pedido sozinho (dá para desligar em Configurações → Empresa → Pedidos); "Enviar pelo WhatsApp" em orçamento, arte, pedido e catálogo; avisos automáticos depois de conectar o WhatsApp (em todas as contas: o plano único inclui o WhatsApp); link "Acompanhe seu pedido" para o cliente.

### Aprovação do orçamento pelo próprio WhatsApp (enquete)

Nada a acrescentar no `.env.prod` (as variáveis `WHATSAPP_WEBHOOK_*` são opcionais). Ao subir, a API liga o webhook da Evolution nas gráficas já conectadas (e em toda conexão nova). O orçamento enviado pela conexão da gráfica sai com uma enquete "✅ Aprovado / ✏️ Quero modificações"; o voto (ou um "aprovado" escrito) aprova o orçamento sozinho (e vira pedido conforme Configurações → Empresa → Pedidos), ou volta para negociação avisando o vendedor. Cada gráfica liga/desliga em **WhatsApp → Aprovar sozinho quando o cliente responder Aprovado**. Para conferir: `onprint logs api | grep -i webhook` não deve mostrar "Webhook do WhatsApp não configurado".

### Atualização de novembro de 2026 (Assistente GrafyGo, copiloto do WhatsApp, catálogo rápido)

Nada obrigatório a acrescentar no `.env.prod` (`ANTHROPIC_API_KEY` e `IA_SEGREDO` são opcionais). Rode `scripts/vps/atualizar.sh`: as migrations desta versão (Assistente, regras comerciais, conversas e copiloto do WhatsApp, aprovação segura, notas e produtos lidos pelo WhatsApp) entram sozinhas em todas as gráficas. A imagem da API fica um pouco maior: o PDF do orçamento enviado pelo "ok" no WhatsApp agora é gerado no servidor.

Depois de atualizar:

1. **Chave da IA**: entre no painel da plataforma (`/plataforma/assistente`), escolha Anthropic, cole a chave e use **Testar**. A chave do computador de desenvolvimento não vai junto: cadastre a de produção aqui (ela fica cifrada no banco). Sem chave, as funções do Assistente ficam desligadas e o resto do sistema funciona normal.
2. **Endereço do site**: confira que o `APP_URL` do `.env.prod` é o domínio público (ex.: `https://erp.suaempresa.com.br`) (os links que o Assistente manda no WhatsApp usam esse endereço; com `localhost` eles não abrem no celular).
3. **Em cada gráfica** (ou avise para fazerem), na página **WhatsApp**:
   - **Aprovação do orçamento**: gráficas novas já começam em "Conversa natural" (sem enquete); as que já existiam continuam no formato que tinham: troque para **Conversa natural** se quiser o padrão novo.
   - **Assistente no WhatsApp (📝 e conversa "Você")** vem **desligado**: ligue para usar o copiloto (reagir com 📝 numa mensagem do cliente monta o orçamento; "ok" na conversa "Você" envia).
4. **Conferir**: `onprint logs api | grep -i "migra"` sem erro; no sistema, **Produtos → Cadastrar vários** abre, e **Peça ao Assistente** (ao lado da busca) responde "quem está devendo?".

## 11. Restaurar um backup

> **Atenção:** substitui os dados atuais pelos do backup.

```bash
cd ~/onprint
ls backups/
scripts/vps/restore.sh backups/onprint_AAAA-MM-DD_HH-MM-SS.dump backups/uploads_AAAA-MM-DD_HH-MM-SS.tar.gz
```

O script pede para digitar `RESTAURAR`, para a API, restaura o banco (e os arquivos, se informados) e sobe a API de novo. Para trazer um dump do Drive antes: `rclone copy gdrive:grafygo-backups/banco/ARQUIVO backups/`.

**Arquivos a partir do espelho no Drive** (VPS nova, ou o pacote local perdido), com a API parada:

```bash
onprint stop api
docker run --rm -v onprint-control-prod_uploads:/uploads -v ~/.config/rclone:/config/rclone rclone/rclone:1.68 sync gdrive:grafygo-backups/uploads /uploads
onprint start api
```

## 12. Comandos úteis

| Para | Comando |
|---|---|
| Ver os containers | `onprint ps` |
| Logs da API | `onprint logs -f --tail=100 api` |
| Logs do HTTPS/Caddy | `onprint logs --tail=100 web` |
| Saúde da API e do banco | `curl -s https://SEU_DOMINIO/api/v1/health` |
| Reiniciar tudo | `onprint restart` |
| Parar / subir | `onprint down` / `onprint up -d` (os dados ficam nos volumes) |
| Espaço em disco | `df -h` e `docker system df` |
| Liberar imagens antigas | `docker image prune -f` |
| Abrir o banco (psql) | `onprint exec db psql -U onprint -d onprint` |
| Criar uma empresa assinante | `onprint exec api node dist/criar-empresa.js --nome "Gráfica X" --email dono@graficax.com.br --senha SenhaProvisoria1` |
| Listar as empresas e a situação da assinatura | `onprint exec api node dist/assinatura.js --listar` |
| Operar uma assinatura (ativar, atraso, liberar, bloquear, plano…) | `onprint exec api node dist/assinatura.js --empresa SLUG --ativar` (opções no README) |

Os logs de cada container são limitados a 3 arquivos de 10 MB, para não lotar o disco.

Cada empresa assinante tem o próprio schema no mesmo banco (`plataforma` guarda a lista de empresas). O backup diário (`pg_dump` do banco inteiro) já inclui todos eles, e os arquivos ficam em `uploads/empresas/{id}`.

## 13. Checklist de segurança

- [ ] `.env.prod` sem nenhum `TROQUE`, com `chmod 600` e cópia num cofre de senhas
- [ ] Segredos JWT gerados com `openssl rand -hex 32`, diferentes entre si
- [ ] Firewall ativo com só 22, 80 e 443 (`ufw status`)
- [ ] SSH por chave, sem senha e sem login de root
- [ ] Senha do admin inicial trocada no primeiro acesso; cada pessoa com o próprio usuário
- [ ] Backup diário agendado **e** cópia fora da VPS conferida
- [ ] Restauração testada ao menos uma vez
- [ ] Atualizações do Ubuntu: `sudo apt update && sudo apt upgrade -y` uma vez por mês (ou ative `unattended-upgrades`)

Já vem pronto no sistema:
- HTTPS obrigatório, com o http redirecionado;
- cabeçalhos de segurança (HSTS, nosniff) e, nas páginas do sistema, Content-Security-Policy e anti-iframe (a API mantém os próprios cabeçalhos, para o PDF da arte abrir na página pública de aprovação);
- login limitado a 20 tentativas por minuto por IP e, por e-mail, 10 senhas erradas em 15 min travam aquele e-mail por 15 min (vale também no painel da plataforma);
- "esqueci a senha" limitado por IP + e-mail e a 5 pedidos por hora por e-mail; cadastro público limitado por IP e por hora (`CADASTROS_POR_HORA`);
- renovação de sessão com rotação única: reuso de um refresh token antigo encerra todas as sessões do usuário; troca de senha encerra as outras sessões;
- usuário desativado ou com papel trocado perde o acesso em até ~15 s (sem esperar o token vencer), também no tempo real;
- o IP real só é lido do proxy interno (Caddy); `X-Forwarded-For` vindo de fora é ignorado;
- links de senha nunca aparecem no log;
- senhas com argon2 e sessão por cookie `httpOnly` + `secure`;
- documentação da API (`/docs`) desligada em produção.

## 14. Problemas comuns

| Sintoma | Causa provável / solução |
|---|---|
| Navegador avisa "certificado inválido" / o site não abre | DNS ainda não aponta para a VPS, ou as portas 80/443 estão bloqueadas (ufw ou painel). Veja `onprint logs web` |
| Vitrine `https://{slug}.…` não abre (erro de certificado) | Falta o registro DNS `*`, `DOMINIO_VITRINE` está vazio ou diferente no `.env.prod` (mudou? refaça o build do web), ou a vitrine não está no ar: o módulo **Vitrine online** precisa estar no plano da empresa e a vitrine ativada em Vitrine → Configurar. Teste: `curl -i "https://SEU_DOMINIO/api/v1/publico/vitrine-permitida?domain=SLUG.suaempresa.com.br"` (200 = liberada) |
| Link da vitrine no WhatsApp sem foto/título | Teste como o WhatsApp: `curl -s -A "WhatsApp/2.23" https://SLUG.suaempresa.com.br/` deve trazer `og:title` e `og:image` (a imagem abre com `curl -I` como `image/jpeg`). Sem a tag, o `Caddyfile` da VPS está desatualizado: atualize o sistema (seção 10; o `Caddyfile` vai dentro da imagem do web). O WhatsApp guarda a prévia por um tempo: teste com outro produto ou acrescente `?v=2` ao link |
| API reinicia sem parar | Veja `onprint logs api`. "Variáveis de ambiente inválidas" = `.env.prod` com segredo fraco, `TROQUE` ou senha do banco diferente em `DATABASE_URL` |
| Build trava ou é morto ("Killed") | Pouca memória: confira o swap (`free -h`) e construa uma imagem por vez (`build api`, depois `build web`) |
| "Muitas tentativas" no login | 10 senhas erradas no mesmo e-mail em 15 min: aguarde 15 minutos (ou 20 tentativas por minuto do mesmo IP: aguarde 1 minuto). Reiniciar a API também zera a trava por e-mail |
| Seed parou com "o administrador inicial não foi criado" | Instalação nova sem `ADMIN_EMAIL`/`ADMIN_SENHA_INICIAL` (ou `PLATAFORMA_ADMIN_*`), com `TROQUE` ou senha com menos de 12 caracteres. Ajuste o `.env.prod` e suba de novo |
| Esqueceu a senha | Outro admin usa **Redefinir senha** em Configurações → Usuários |
| Disco cheio | `docker system df`; `docker image prune -f`; confira `DIAS_RETENCAO` e o tamanho de `backups/` |
| Orçamento reaberto com total ~1000 vezes menor (ex.: R$ 14.000 virou R$ 14) | Corrigido na versão de outubro de 2026: item com quantidade a partir de 1.000 voltava ao editor como "1.000" e era lido como 1. Veja a seção 14.1 para achar e corrigir os orçamentos afetados |

> **Teste local do compose de produção** (no Windows, com Docker Desktop): crie um `.env.prod` sem `DOMINIO` e com `APP_URL=https://localhost`, pare o ambiente de desenvolvimento (`docker compose stop`) e suba com os comandos do passo 8. Abra https://localhost e aceite o certificado local. Se a pasta do projeto tiver acentos no caminho, rode `$env:COMPOSE_BAKE="false"` antes do build (limitação do Docker no Windows).

### 14.1 Orçamento com total 1000 vezes menor (quantidade a partir de 1.000)

**O que acontecia (até a correção de outubro de 2026):** ao reabrir um orçamento salvo, item com quantidade **inteira a partir de 1.000** (ex.: 1000 canecas, 10.000 cartões) aparecia no campo como `1.000`, e o sistema lia isso como **1**. A tela já mostrava o total errado (R$ 14.000 → R$ 14). O banco só ficava errado se alguém **salvasse de novo** esse orçamento, mesmo mudando só o desconto: aí a quantidade gravada virava 1 (ou 10, 1,5…). Orçamentos que só foram reabertos, sem salvar, estão certos no banco e voltam a aparecer certos depois da atualização. Medidas a partir de 1.000 m tinham o mesmo problema.

**Como achar os afetados (só leitura, não altera nada).** A auditoria guarda o orçamento antes e depois de cada edição. Primeiro, liste as empresas e o schema de cada uma:

```bash
onprint exec db psql -U onprint -d onprint -c "SELECT nome, schema FROM plataforma.assinantes ORDER BY nome"
```

Depois abra o banco (`onprint exec db psql -U onprint -d onprint`), troque `emp_xxxxxxxxxxxx` pelo schema da empresa e cole (digite `\x` antes para ver o resultado na vertical):

```sql
SET search_path TO emp_xxxxxxxxxxxx;

-- Edições de orçamento em que a quantidade (ou medida) caiu exatamente 1000 vezes
SELECT o.numero, o.status, a.created_at AS editado_em, u.nome AS editado_por,
       (ia->>'ordem')::int AS item, ia->>'descricao' AS descricao,
       ia->>'quantidade' AS qtd_antes, idp->>'quantidade' AS qtd_depois,
       ia->>'largura' AS larg_antes, idp->>'largura' AS larg_depois,
       ia->>'altura' AS alt_antes, idp->>'altura' AS alt_depois,
       a.antes->>'total' AS total_antes, a.depois->>'total' AS total_depois,
       o.total AS total_hoje, p.numero AS pedido_gerado
FROM auditoria a
JOIN orcamentos o ON o.id::text = a.registro_id
CROSS JOIN LATERAL jsonb_array_elements(a.antes->'itens') ia
JOIN LATERAL jsonb_array_elements(a.depois->'itens') idp
  ON idp->>'ordem' = ia->>'ordem' AND idp->>'produtoId' = ia->>'produtoId'
LEFT JOIN usuarios u ON u.id = a.usuario_id
LEFT JOIN pedidos p ON p.id = o.pedido_id
WHERE a.tabela = 'orcamentos' AND a.acao = 'editar'
  AND (   ((ia->>'quantidade')::numeric >= 1000 AND (idp->>'quantidade')::numeric * 1000 = (ia->>'quantidade')::numeric)
       OR ((ia->>'largura')::numeric    >= 1000 AND (idp->>'largura')::numeric    * 1000 = (ia->>'largura')::numeric)
       OR ((ia->>'altura')::numeric     >= 1000 AND (idp->>'altura')::numeric     * 1000 = (ia->>'altura')::numeric))
ORDER BY a.created_at;
```

Cada linha é um item que perdeu três casas: `qtd_antes` é o valor certo, `total_antes` o total antes do erro e `total_hoje` o que está gravado agora. Nenhuma linha = nenhum orçamento da empresa foi gravado errado.

**Como corrigir (depois de atualizar o sistema):**

- **Orçamento ainda aberto** (rascunho, enviado, em negociação): abra no editor, digite de novo a quantidade certa (`qtd_antes`) nos itens listados, confira o total com `total_antes` e salve.
- **Já aprovado ou com pedido gerado** (`pedido_gerado` preenchido): o pedido, as contas a receber e as OPs saíram com a quantidade errada. Confira com o cliente; o mais seguro é cancelar esse pedido e gerar de novo a partir de um orçamento corrigido (duplique o orçamento e acerte as quantidades). Não há correção automática pelo banco porque o pedido pode já ter pagamentos, produção e comissões em cima do valor errado.
