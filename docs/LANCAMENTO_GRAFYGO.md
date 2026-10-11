# Lançamento da GrafyGo: roteiro do deploy

Roteiro em ordem para colocar a GrafyGo no ar em **grafygo.com.br**. Cada etapa diz o que fazer, onde e como conferir.
Os comandos detalhados (firewall, Docker, backup, restauração) estão em [DEPLOY_VPS.md](DEPLOY_VPS.md); aqui fica a
sequência com os valores da GrafyGo já preenchidos.

> **Para pedir ajuda ao Claude (claude.ai):** copie o bloco "Contexto" abaixo, cole no começo da conversa e diga em
> que etapa você está. Se der erro, cole também a mensagem e a saída de `onprint ps` e `onprint logs --tail=80 api`
> (ou `web`). **Nunca cole o conteúdo do `.env.prod`, chaves do Asaas ou senhas.**

<details>
<summary><strong>Contexto (copiar e colar no Claude)</strong></summary>

```
Estou fazendo o deploy do meu SaaS "GrafyGo" (ERP para gráficas) numa VPS Ubuntu 24.04 com Docker.
Repositório: github.com/eduardo130796/onprint-control (monorepo: apps/api Fastify + Prisma + PostgreSQL 16,
apps/web React/Vite servido pelo Caddy, packages/shared).
Produção: docker-compose.prod.yml com 3 containers: db (postgres:16, sem porta), api (Node, porta 3333 só interna;
aplica migrations e seed ao subir) e web (Caddy: portas 80/443, HTTPS automático, repassa /api e /socket.io para a api).
Variáveis em .env.prod (modelo: .env.prod.example). Atalho na VPS:
alias onprint='docker compose -f ~/onprint/docker-compose.prod.yml --env-file ~/onprint/.env.prod'
Endereços:
- grafygo.com.br e www.grafygo.com.br = página de venda (o mesmo build do front detecta o host)
- app.grafygo.com.br = sistema (DOMINIO e APP_URL)
- {slug}.grafygo.com.br = vitrine de cada gráfica (DNS curinga *, HTTPS sob demanda: o Caddy pergunta à API
  /api/v1/publico/vitrine-permitida antes de emitir o certificado)
- domínios próprios das gráficas: bloco "https://" do Caddyfile, também sob demanda
Pagamento: Asaas (assinaturas mensais/anuais, webhook em https://app.grafygo.com.br/api/v1/plataforma/webhooks/asaas).
E-mail: SMTP do provedor do domínio (contato@grafygo.com.br). Ainda sem CNPJ: nota fiscal desligada (ASAAS_NF_ATIVA=false).
Guias no repositório: docs/LANCAMENTO_GRAFYGO.md (este roteiro) e docs/DEPLOY_VPS.md (comandos detalhados).
```

</details>

---

## Visão geral

| Endereço | O que é | DNS |
|---|---|---|
| `grafygo.com.br` e `www.grafygo.com.br` | Página de venda | `A @` e `A www` → IP da VPS |
| `app.grafygo.com.br` | O sistema (login, cadastro, painel da plataforma em `/plataforma`) | `A app` → IP da VPS |
| `{gráfica}.grafygo.com.br` | Vitrine online de cada gráfica | `A *` → IP da VPS |
| `contato@grafygo.com.br` | Seu e-mail (atendimento, privacidade e envio do sistema) | registros do seu provedor de e-mail (MX, SPF, DKIM) |

Ordem: **0** código pronto → **1** VPS → **2** DNS → **3** e-mail → **4** Asaas → **5** servidor → **6** `.env.prod` →
**7** subir → **8** conferir → **9** backup → **10** primeiro cliente de teste → **11** divulgar.

---

## 0. Antes de tudo: o código (no seu computador)

- [x] **Titular do serviço** em `apps/web/src/app/marca.ts`: Eduardo Roquête Cabral Júnior, CPF 030.154.681-97 (a lei
      do comércio eletrônico exige mostrar quem vende; aparece nos termos, na privacidade e no rodapé). Quando tiver
      CNPJ, troque pela razão social e pelo CNPJ.
- [x] `contato: 'contato@grafygo.com.br'` no mesmo arquivo.
- [ ] Revise os textos de `apps/web/src/features/legal/textos.ts` (de preferência com um advogado).
- [x] Já está no GitHub.

> Dica: abrir um **MEI** resolve duas coisas de uma vez: o site deixa de mostrar o seu CPF e você passa a poder emitir
> nota fiscal (aí é só ligar `ASAAS_NF_ATIVA=true`, ver etapa 4).

## 1. Contratar a VPS

- [ ] **Hostinger KVM 2** (2 vCPU, 8 GB) ou equivalente; o mínimo confortável é 2 vCPU e 4 GB.
- [ ] Sistema: **Ubuntu 24.04 LTS**.
- [ ] Anote o **IP** e a senha de root.
- [ ] Se o painel tiver, ligue os **snapshots/backup automáticos** da VPS.

## 2. DNS do domínio

No painel onde o domínio `grafygo.com.br` está (Registro.br, Hostinger…), em **DNS / Zona DNS**:

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| A | `@` | IP da VPS | 3600 |
| A | `www` | IP da VPS | 3600 |
| A | `app` | IP da VPS | 3600 |
| A | `*` | IP da VPS | 3600 |

- [ ] **Não apague** os registros do e-mail (`MX`, `TXT` de SPF/DKIM, `CNAME` como `autodiscover`). O curinga `*` não
      atrapalha o e-mail: registros com nome próprio têm prioridade.
- [ ] Se o domínio estiver no Registro.br com DNS da própria Registro.br, os registros ficam em "Editar zona".
- [ ] Se houver um registro `A @` antigo (página de "domínio estacionado"), troque pelo IP da VPS.

**Conferir** (no PowerShell do seu computador, alguns minutos depois):

```powershell
nslookup grafygo.com.br
nslookup app.grafygo.com.br
nslookup teste123.grafygo.com.br
```

Os três devem responder com o IP da VPS. **Não suba o sistema (etapa 7) antes disso**, porque o HTTPS precisa do DNS.

## 3. E-mail que o sistema envia

O sistema manda: boas-vindas no cadastro, convite de usuário, "esqueci a senha" e a confirmação de pedido da vitrine.
Os e-mails das gráficas saem com o **nome da gráfica** e "Responder para" o e-mail dela; o endereço que envia é o seu.

O e-mail `contato@grafygo.com.br` está na **Hostinger**: `SMTP_HOST=smtp.hostinger.com`, porta `465`, `SMTP_SEGURO=true`,
usuário `contato@grafygo.com.br` e a senha da caixa (definida no hPanel → **E-mails**). Tabela de outros provedores, se
um dia mudar:

  | Provedor | SMTP_HOST | SMTP_PORTA | SMTP_SEGURO |
  |---|---|---|---|
  | Hostinger | `smtp.hostinger.com` | `465` | `true` |
  | Zoho Mail | `smtp.zoho.com` | `465` | `true` |
  | Google Workspace | `smtp.gmail.com` (com "senha de app") | `465` | `true` |
  | Locaweb / outros | veja a página de "configurar cliente de e-mail" do provedor | | |

- [ ] Use o próprio `contato@grafygo.com.br` como usuário e remetente (a maioria dos provedores exige que o remetente
      seja a conta autenticada). Se quiser separar, crie a caixa `nao-responda@grafygo.com.br` e use ela.
- [ ] No hPanel da Hostinger → **E-mails** → `grafygo.com.br` → **Configurar/Registros DNS**, confira que **MX**,
      **SPF** e **DKIM** aparecem como ativos (se o DNS do domínio também está na Hostinger, ela cria sozinha; se o DNS
      estiver em outro lugar, copie os registros que o hPanel mostra). Acrescente também um **DMARC** simples:

  | Tipo | Nome | Valor |
  |---|---|---|
  | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:contato@grafygo.com.br` |

  Sem SPF/DKIM, os e-mails tendem a cair no spam.

## 4. Asaas (cobrança das assinaturas)

- [ ] Crie a conta de **produção** em <https://www.asaas.com> (aceita pessoa física, com o seu CPF) e conclua a
      verificação de documentos. Cadastre a conta bancária para receber.
- [ ] **Integrações → Chaves de API**: gere a chave de produção. Ela é mostrada uma vez só; guarde no cofre de senhas.
      **Não use a chave do sandbox** que está no `.env` do seu computador.
- [ ] Gere o token do webhook (na VPS, na etapa 6): `openssl rand -hex 32`.
- [ ] **Integrações → Webhooks → Adicionar**. Faça isso depois da etapa 7, com o sistema no ar:
  - URL: `https://app.grafygo.com.br/api/v1/plataforma/webhooks/asaas`
  - Token de autenticação: o mesmo `ASAAS_WEBHOOK_TOKEN` do `.env.prod`
  - Versão da API: v3 · Tipo de envio: sequencial · Ativo: sim
  - Eventos: **todos de Cobranças** (`PAYMENT_*`) e **todos de Notas fiscais** (`INVOICE_*`)
- [ ] **Nota fiscal:** fica **desligada** (`ASAAS_NF_ATIVA=false`) até ter CNPJ. Enquanto isso, o site e o sistema
      falam em "comprovante de pagamento" e não prometem nota.
- [ ] **PIX Automático:** só depois que o Asaas liberar na sua conta (peça ao gerente); até lá, `ASAAS_PIX_AUTOMATICO=false`.
      Cartão e PIX/boleto funcionam normalmente.

## 5. Preparar a VPS

Siga as seções 3 a 5 do [DEPLOY_VPS.md](DEPLOY_VPS.md):
- [ ] primeiro acesso, atualizar o Ubuntu, usuário `onprint`, swap de 2 GB e fuso `America/Sao_Paulo`;
- [ ] firewall (`ufw`) só com 22, 80 e 443 (e o firewall do painel da Hostinger, se houver);
- [ ] SSH por chave e login por senha desligado;
- [ ] Docker instalado.

**Baixar o código** (o repositório é privado, então a VPS precisa de uma chave de acesso de leitura):

```bash
ssh-keygen -t ed25519 -C "vps-grafygo" -f ~/.ssh/github -N ""
cat ~/.ssh/github.pub
```

- [ ] No GitHub: repositório **onprint-control → Settings → Deploy keys → Add deploy key**. Cole a chave, título
      "VPS GrafyGo", **sem** marcar "Allow write access".

```bash
printf 'Host github.com\n  IdentityFile ~/.ssh/github\n' >> ~/.ssh/config
git clone git@github.com:eduardo130796/onprint-control.git ~/onprint
cd ~/onprint && chmod +x scripts/vps/*.sh
```

## 6. O arquivo `.env.prod`

```bash
cd ~/onprint
cp .env.prod.example .env.prod
openssl rand -hex 32   # rode 5 vezes: senha do banco, JWT_ACCESS, JWT_REFRESH, ASAAS_WEBHOOK_TOKEN e uma reserva
nano .env.prod
```

Os valores da GrafyGo (troque o que está entre `<>`; o resto pode ficar como está no modelo):

```ini
DOMINIO=app.grafygo.com.br
APP_URL=https://app.grafygo.com.br
DOMINIO_VITRINE=grafygo.com.br

POSTGRES_USER=onprint
POSTGRES_PASSWORD=<senha-gerada-1>
POSTGRES_DB=onprint
DATABASE_URL=postgresql://onprint:<senha-gerada-1>@db:5432/onprint

JWT_ACCESS_SECRET=<gerado-2>
JWT_REFRESH_SECRET=<gerado-3>

# Empresa "principal" criada no 1º start (sua conta para demonstrar o sistema); troca de senha no 1º login
ADMIN_EMAIL=contato@grafygo.com.br
ADMIN_SENHA_INICIAL=<senha provisória com 12+ caracteres>
SEED_EXEMPLOS=true

# Seu acesso ao painel da plataforma (app.grafygo.com.br/plataforma): use outro e-mail ou um apelido
PLATAFORMA_ADMIN_EMAIL=<seu e-mail pessoal>
PLATAFORMA_ADMIN_SENHA=<senha forte, 12+ caracteres, diferente das outras>

SMTP_HOST=smtp.hostinger.com
SMTP_PORTA=465
SMTP_SEGURO=true
SMTP_USUARIO=contato@grafygo.com.br
SMTP_SENHA=<senha da caixa de e-mail>
EMAIL_REMETENTE=GrafyGo <contato@grafygo.com.br>

PLANO_PADRAO=profissional
# Aparece no botão "Falar com a gente" da página de venda e em "Minha assinatura" (WhatsApp com DDD)
SUPORTE_CONTATO=(61) 99352-6884
CADASTRO_PUBLICO=true

ASAAS_API_KEY=<chave de PRODUÇÃO>
ASAAS_AMBIENTE=producao
ASAAS_WEBHOOK_TOKEN=<gerado-4>
ASAAS_PIX_AUTOMATICO=false
ASAAS_NF_ATIVA=false
```

```bash
chmod 600 .env.prod
grep -n TROQUE .env.prod   # não pode aparecer nada
```

- [ ] Guarde uma cópia do `.env.prod` num **cofre de senhas** (Bitwarden, 1Password…), fora da VPS.

## 7. Subir

```bash
cd ~/onprint
docker compose -f docker-compose.prod.yml --env-file .env.prod build api
docker compose -f docker-compose.prod.yml --env-file .env.prod build web
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
echo "alias onprint='docker compose -f ~/onprint/docker-compose.prod.yml --env-file ~/onprint/.env.prod'" >> ~/.bashrc && source ~/.bashrc
onprint ps
```

Os três containers devem estar `Up` e a API `(healthy)`. O primeiro start aplica as migrations, cria os planos de
lançamento (R$ 69 / 129 / 199, anual com 2 meses grátis), a empresa principal e o seu acesso à plataforma.

Se algo não subir: `onprint logs --tail=100 api` (ou `web`). Os problemas comuns estão na seção 14 do DEPLOY_VPS.md.

## 8. Conferir no ar

- [ ] `https://grafygo.com.br` abre a **página de venda** (cadeado no navegador); `www.grafygo.com.br` também.
- [ ] Os **preços** aparecem nos planos (vêm da API); a chave mensal/anual funciona.
- [ ] `https://grafygo.com.br/termos` e `/privacidade` mostram o seu nome e CPF.
- [ ] "Testar grátis" leva para `https://app.grafygo.com.br/criar-conta?plano=...`.
- [ ] `https://app.grafygo.com.br` abre o login. Entre com `ADMIN_EMAIL` e troque a senha.
- [ ] `https://app.grafygo.com.br/plataforma` abre o painel da plataforma com `PLATAFORMA_ADMIN_*`.
      Confira em **Planos** os 3 planos e os valores anuais.
- [ ] Saúde: `curl -s https://app.grafygo.com.br/api/v1/health` responde ok.
- [ ] **E-mail:** no login, "Esqueci minha senha" com o seu e-mail; ele precisa chegar (veja também o spam).
- [ ] **Webhook do Asaas** cadastrado (etapa 4). No Asaas, a fila de webhooks deve ficar sem erros.

## 9. Backup

Siga a seção 9 do [DEPLOY_VPS.md](DEPLOY_VPS.md):
- [ ] teste manual do `scripts/vps/backup.sh`;
- [ ] `rclone` com o Google Drive (ou OneDrive);
- [ ] agendamento diário às 02:30 no `crontab`;
- [ ] no dia seguinte, confira o arquivo no Drive.

## 10. Teste de ponta a ponta com dinheiro de verdade

Antes de divulgar, faça uma compra real pequena:

- [ ] Em uma janela anônima: `grafygo.com.br` → **Testar grátis** no Essencial → crie uma gráfica de teste com outro e-mail.
- [ ] Confira o e-mail de boas-vindas.
- [ ] No sistema da gráfica de teste: **Configurações → Minha assinatura → Assinar agora**, Essencial **mensal**,
      **PIX/boleto**, com o seu CPF.
- [ ] Pague o PIX (R$ 69). Em segundos, "Minha assinatura" deve mostrar **Ativa / em dia**. É o webhook funcionando.
- [ ] No painel da plataforma, a empresa aparece como ativa e o "recebido no mês" mostra o valor.
- [ ] **Vitrine:** no painel da plataforma, mude a gráfica de teste para o **Completo** (ou use o teste grátis, que já
      libera tudo), ative a vitrine e publique um produto. Abra `https://{slug}.grafygo.com.br` (o primeiro acesso
      pode levar alguns segundos, enquanto o certificado é emitido). Mande o link para você mesmo no WhatsApp e veja
      a prévia com foto.
- [ ] Depois: cancele a assinatura de teste em "Minha assinatura" e, se quiser, estorne o PIX pelo painel do Asaas.

## 11. Divulgar

- [ ] Links com cupom de lançamento: crie o cupom no painel da plataforma (**Cupons**, ex.: `LANCAMENTO`, 20% por 3
      meses) e divulgue `https://grafygo.com.br/?cupom=LANCAMENTO`. O cupom vai sozinho para o cadastro.
- [ ] Bio do Instagram e WhatsApp Business com `grafygo.com.br`.
- [ ] Para apresentar o sistema ao vivo, use a empresa principal (com `SEED_EXEMPLOS=true` ela já vem com catálogo
      de exemplo) ou crie uma gráfica de demonstração pelo próprio cadastro.

---

## Depois do lançamento

| Para | Como |
|---|---|
| Atualizar o sistema com o que subir no GitHub | `cd ~/onprint && scripts/vps/atualizar.sh` (faz backup, `git pull`, rebuild e sobe; as migrations rodam sozinhas) |
| Ver o que está acontecendo | `onprint ps`, `onprint logs -f --tail=100 api`, `onprint logs --tail=100 web` |
| Mudar preços e planos | Painel da plataforma → **Planos** (vale para quem assinar depois; quem já paga mantém o valor) |
| Liberar módulo, dar cortesia ou desconto a uma gráfica | Painel da plataforma → **Empresas** → a empresa |
| Quando tiver CNPJ | troque `titular`/`documento` em `marca.ts` (e suba), configure as notas no Asaas e ligue `ASAAS_NF_ATIVA=true` (com `ASAAS_NF_SERVICO_CODIGO` e alíquotas) no `.env.prod`; depois `onprint up -d --force-recreate api` |
| Mudou algo no `.env.prod` | `onprint up -d --force-recreate api` (se mudou `DOMINIO`/`DOMINIO_VITRINE`, rode o `atualizar.sh` para refazer o web) |

**Ponto de atenção no crescimento:** cada vitrine (`{gráfica}.grafygo.com.br`) ganha um certificado próprio do Let's
Encrypt, que limita a cerca de **50 certificados novos por semana** por domínio. Isso basta para começar. Se um dia
passar disso, o caminho é um certificado curinga (`*.grafygo.com.br`) emitido por DNS (Cloudflare); peça ajuda ao
Claude com este roteiro.
