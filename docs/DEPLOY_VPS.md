# Colocar o ONPrint Control no ar (VPS Linux)

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
| `DOMINIO` | o domínio do passo 2, sem `https://` (ex.: `erp.suaempresa.com.br`) |
| `APP_URL` | o mesmo domínio com `https://` |
| `POSTGRES_PASSWORD` | uma senha gerada. Ela aparece **também** dentro de `DATABASE_URL`: troque nos dois lugares |
| `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` | dois valores gerados, **diferentes entre si**. A API se recusa a subir com segredos fracos ou de exemplo |
| `ADMIN_EMAIL` e `ADMIN_SENHA_INICIAL` | o primeiro acesso. A troca de senha é obrigatória no 1º login |
| `SEED_EXEMPLOS` | `false` para começar vazio; `true` cria um catálogo de exemplo (banners, canecas…) |

Salve (Ctrl+O, Enter, Ctrl+X) e proteja o arquivo:

```bash
chmod 600 .env.prod
```

> Guarde uma cópia do `.env.prod` fora da VPS (num cofre de senhas, por exemplo). Sem ele, os backups continuam válidos, mas você precisa recriar os segredos.

## 8. Subir o sistema

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod build api
docker compose -f docker-compose.prod.yml --env-file .env.prod build web
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

O primeiro build leva alguns minutos. Os três serviços devem aparecer como `Up`, com a API `(healthy)`. Ao iniciar, a API aplica as migrations e o seed sozinha (papéis, permissões, status, formas de pagamento e o admin inicial).

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

## 9. Backup diário (banco + arquivos), com cópia fora da VPS

O script `scripts/vps/backup.sh`:
- gera `backups/onprint_DATA.dump` (banco compactado) e `backups/uploads_DATA.tar.gz` (artes e anexos);
- apaga os backups com mais de 14 dias (ajuste com `DIAS_RETENCAO`);
- se `RCLONE_DESTINO` estiver definido, envia uma cópia para fora da VPS.

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
30 2 * * * RCLONE_DESTINO=gdrive:onprint-backups /home/onprint/onprint/scripts/vps/backup.sh >> /home/onprint/backup.log 2>&1
```

Confira no dia seguinte com `tail /home/onprint/backup.log` e verificando a pasta no Drive.

**Recomendações:**
- Ative também os **snapshots automáticos** da Hostinger (painel da VPS), como uma segunda camada.
- **Teste a restauração** (passo 11) de vez em quando. Backup que nunca foi restaurado não é garantia.

## 10. Atualizar o sistema

```bash
cd ~/onprint
scripts/vps/atualizar.sh
```

O script:
1. faz um backup;
2. baixa a versão nova com `git pull`, se houver repositório (sem git, **copie os arquivos novos antes**, como no passo 6, sem apagar `.env.prod` e `backups/`);
3. reconstrói as imagens;
4. sobe os containers: as migrations novas são aplicadas sozinhas;
5. limpa imagens antigas.

O sistema fica fora do ar por menos de um minuto durante a troca.

## 11. Restaurar um backup

> **Atenção:** substitui os dados atuais pelos do backup.

```bash
cd ~/onprint
ls backups/
scripts/vps/restore.sh backups/onprint_AAAA-MM-DD_HH-MM-SS.dump backups/uploads_AAAA-MM-DD_HH-MM-SS.tar.gz
```

O script pede para digitar `RESTAURAR`, para a API, restaura o banco (e os arquivos, se informados) e sobe a API de novo. Para trazer um backup do Drive antes: `rclone copy gdrive:onprint-backups/ARQUIVO backups/`.

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

Os logs de cada container são limitados a 3 arquivos de 10 MB, para não lotar o disco.

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
- cabeçalhos de segurança (HSTS, nosniff, anti-iframe);
- login limitado a 5 tentativas por minuto por conta;
- senhas com argon2 e sessão por cookie `httpOnly` + `secure`;
- documentação da API (`/docs`) desligada em produção.

## 14. Problemas comuns

| Sintoma | Causa provável / solução |
|---|---|
| Navegador avisa "certificado inválido" / o site não abre | DNS ainda não aponta para a VPS, ou as portas 80/443 estão bloqueadas (ufw ou painel). Veja `onprint logs web` |
| API reinicia sem parar | Veja `onprint logs api`. "Variáveis de ambiente inválidas" = `.env.prod` com segredo fraco, `TROQUE` ou senha do banco diferente em `DATABASE_URL` |
| Build trava ou é morto ("Killed") | Pouca memória: confira o swap (`free -h`) e construa uma imagem por vez (`build api`, depois `build web`) |
| "Muitas tentativas" no login | 5 erros seguidos na mesma conta: aguarde 1 minuto |
| Esqueceu a senha | Outro admin usa **Redefinir senha** em Configurações → Usuários |
| Disco cheio | `docker system df`; `docker image prune -f`; confira `DIAS_RETENCAO` e o tamanho de `backups/` |

> **Teste local do compose de produção** (no Windows, com Docker Desktop): crie um `.env.prod` sem `DOMINIO` e com `APP_URL=https://localhost`, pare o ambiente de desenvolvimento (`docker compose stop`) e suba com os comandos do passo 8. Abra https://localhost e aceite o certificado local. Se a pasta do projeto tiver acentos no caminho, rode `$env:COMPOSE_BAKE="false"` antes do build (limitação do Docker no Windows).
