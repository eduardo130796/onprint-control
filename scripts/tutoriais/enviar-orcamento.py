"""Tutorial "Enviar o orçamento e receber a aprovação" (vídeo + capturas). Uso: python scripts/tutoriais/enviar-orcamento.py

Antes de gravar, cria um orçamento em rascunho (cópia do ORC-2026-0067 da empresa de demonstração) pela API,
para o tutorial sempre começar do mesmo jeito sem mexer nos orçamentos que já existem.
"""
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from playwright.sync_api import Browser, Page, sync_playwright  # noqa: E402

from gravador import EMAIL, SENHA, URL, Gravador  # noqa: E402

# ─── sistema lento: espera paciente, sem tempo morto no vídeo ─────────────
# Com muitos acessos ao mesmo tempo, as telas podem demorar minutos e a API pode falhar de vez em quando.
# As esperas são marcadas e cortadas do vídeo no final (quem assiste vê só as telas prontas), as ações que
# gravam algo são repetidas se o resultado não aparecer e os avisos de erro não aparecem na gravação.
ESPERA_MAX = 600_000
_goto, _wait_for_url, _novo_contexto = Page.goto, Page.wait_for_url, Browser.new_context


def _goto_paciente(self, url, **kw):
    kw.setdefault('timeout', ESPERA_MAX)
    return _goto(self, url, **kw)


def _url_paciente(self, url, **kw):
    kw['timeout'] = max(kw.get('timeout') or 0, ESPERA_MAX)
    return _wait_for_url(self, url, **kw)


# Opcional: TUTORIAL_API=http://localhost:3333 manda as chamadas da API direto ao container, sem o proxy do Vite
# (que engasga com muitos acessos). Não serve para envio de arquivo (upload); aí use um front servido à parte.
API_DIRETA = os.environ.get('TUTORIAL_API', '')


def _api_direta(route):
    try:
        route.fulfill(response=route.fetch(url=route.request.url.replace(URL, API_DIRETA, 1), timeout=ESPERA_MAX))
    except Exception:
        route.continue_()


def _contexto_paciente(self, **kw):
    ctx = _novo_contexto(self, **kw)
    ctx.set_default_timeout(ESPERA_MAX)
    if API_DIRETA:
        ctx.route(URL + '/api/**', _api_direta)
    return ctx


Page.goto, Page.wait_for_url, Browser.new_context = _goto_paciente, _url_paciente, _contexto_paciente
CORTES: list[tuple[float, float]] = []
ESQUELETO = '[class*="animate-pulse"][class*="bg-slate-200"]'
SEM_ERROS = '[data-sonner-toast][data-type="error"]{display:none!important}'


def _marcar(g: Gravador, inicio: float):
    fim = time.monotonic()
    if fim - inicio > 0.8:
        CORTES.append((inicio + 0.15 - g._t0, fim - 0.15 - g._t0))


def pronto(g: Gravador, alvo=None, limite: int = 600):
    """Espera o alvo aparecer e a tela terminar de carregar; a espera sai do vídeo."""
    inicio = time.monotonic()
    if alvo is not None:
        try:
            alvo.wait_for(timeout=limite * 1000)
        except Exception:
            _marcar(g, inicio)  # a espera sai do vídeo mesmo quando o alvo não aparece
            raise
    for passo in [
        lambda: g.pg.wait_for_load_state('networkidle', timeout=60_000),
        lambda: g.pg.wait_for_function("Array.from(document.images).filter((i) => i.loading !== 'lazy').every((i) => i.complete)", timeout=60_000),
        lambda: g.pg.locator('text=Carregando…').first.wait_for(state='detached', timeout=limite * 1000),
        lambda: g.pg.locator(ESQUELETO).first.wait_for(state='detached', timeout=limite * 1000),
    ]:
        try:
            passo()
        except Exception:
            pass
    _marcar(g, inicio)


def tentar(g: Gravador, acao, resultado, vezes: int = 25, limite: int = 40, repetir=None):
    """Faz a ação e espera o resultado; se a API falhar (sistema sobrecarregado), repete sem animação (fora do vídeo)."""
    for n in range(vezes):
        if n and resultado.is_visible():
            return
        g.pg.set_default_timeout(60_000)
        inicio = time.monotonic()
        try:
            (acao if n == 0 or repetir is None else repetir)()
        except Exception:
            pass  # o botão sumiu: a ação anterior deu certo agora há pouco
        finally:
            g.pg.set_default_timeout(ESPERA_MAX)
        try:
            pronto(g, resultado, limite=limite)
            if n:
                _marcar(g, inicio - 0.5)
            return
        except Exception:
            if n:
                _marcar(g, inicio - 0.5)
            if resultado.is_visible():
                return
            if n == vezes - 1:
                raise
            print('  o resultado não apareceu; repetindo a ação')


def _ir(self: Gravador, rota: str, espera: float = 1.2):
    inicio = time.monotonic()
    self.pg.goto(URL + rota)
    pronto(self)
    _marcar(self, inicio)
    self.pausa(espera)


Gravador.ir = _ir


def preparar_pagina(g: Gravador):
    """Tempo maior, área de transferência liberada e avisos de erro escondidos na gravação."""
    g.pg.set_default_timeout(ESPERA_MAX)
    g._ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=URL)
    g._ctx.add_init_script(f"addEventListener('DOMContentLoaded', () => {{ const s = document.createElement('style'); s.textContent = '{SEM_ERROS}'; document.head.appendChild(s) }})")
    g.pg.add_style_tag(content=SEM_ERROS)


def comecar_aqui(g: Gravador):
    """O vídeo começa agora (com a primeira tela pronta)."""
    g._corte = max(0.0, time.monotonic() - g._t0 - 0.4)


def cortar_esperas(g: Gravador):
    """Tira do video.mp4 os trechos de espera marcados."""
    mp4 = g.saida / 'video.mp4'
    trechos = [(a - g._corte, b - g._corte) for a, b in CORTES if b - g._corte > 0.5]
    if not trechos or not mp4.exists():
        return
    expr = '+'.join(f'between(t,{max(0.0, a):.2f},{b:.2f})' for a, b in trechos)
    subprocess.run(
        ['docker', 'run', '--rm', '-v', f'{g.saida}:/v', 'linuxserver/ffmpeg:latest', '-y', '-loglevel', 'error', '-i', '/v/video.mp4',
         '-vf', f"select='not({expr})',setpts=N/FRAME_RATE/TB", '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p',
         '-movflags', '+faststart', '-an', '/v/video-cortado.mp4'],
        check=True, env={**os.environ, 'MSYS_NO_PATHCONV': '1'},
    )
    (g.saida / 'video-cortado.mp4').replace(mp4)
    print(f'  vídeo sem esperas: {mp4.stat().st_size // 1024} KB, {g._duracao(mp4)}s ({len(trechos)} corte(s))')


def api_sessao(pw):
    """Contexto da API já logado na empresa de demonstração, com nova tentativa quando a API falha."""
    api = pw.request.new_context(base_url=(API_DIRETA or URL) + '/api/v1/', timeout=ESPERA_MAX)
    token = api.post('auth/login', data={'email': EMAIL, 'senha': SENHA}).json()['accessToken']
    h = {'Authorization': f'Bearer {token}'}

    def chamar(metodo: str, caminho: str, **kw):
        for _ in range(6):
            r = getattr(api, metodo)(caminho, headers=h, **kw)
            if r.ok:
                return r.json()
            print(f'  API {r.status} em {caminho}; tentando de novo')
            time.sleep(5)
        raise RuntimeError(f'A API não respondeu: {caminho}')

    return chamar


BASE = 'ORC-2026-0067'  # Alicerce Engenharia: placas em PVC + banner


def preparar() -> str:
    """Duplica o orçamento base (fica em rascunho) e devolve o id da cópia."""
    with sync_playwright() as pw:
        api = api_sessao(pw)
        base = next(o for o in api('get', f'orcamentos?page=1&pageSize=20&busca={BASE}')['data'] if o['numero'] == BASE)
        copia = api('post', f"orcamentos/{base['id']}/duplicar")
        print(f"  orçamento do tutorial: {copia['numero']}")
        return copia['id']


# Para repetir a gravação com um orçamento em rascunho já criado: python enviar-orcamento.py <id do orçamento>
orcamento = sys.argv[1] if len(sys.argv) > 1 else preparar()

with Gravador('enviar-orcamento', rota_inicial=f'/orcamentos/{orcamento}') as g:
    pg = g.pg
    preparar_pagina(g)
    cabecalho = pg.locator('h1').first.locator('xpath=..')
    copiar = pg.get_by_role('button', name='Copiar mensagem')
    pronto(g, copiar)
    pronto(g, pg.locator('[id$="-qtd"]').nth(1))
    pronto(g, cabecalho.get_by_text('Rascunho', exact=True))
    comecar_aqui(g)
    toast = pg.locator('[data-sonner-toast][data-type="success"]').first

    g.legenda('Abra o orçamento salvo: os botões de envio ficam no topo', 1, segundos=2)
    g.legenda('Toque em "Copiar mensagem": o texto já vai com o link', 1)
    g.clicar(copiar)
    pronto(g, toast)
    g.pausa(0.6)
    g.foto(1, toast)

    g.legenda('Cole no WhatsApp do cliente e marque como enviado (em "Mais")', 2, segundos=1.6)

    def marcar_enviado():
        g.clicar(pg.get_by_role('button', name='Mais'))
        g.clicar(pg.get_by_role('menuitem', name='Marcar como enviado'))

    def marcar_de_novo():
        pg.get_by_role('button', name='Mais').click()
        pg.get_by_role('menuitem', name='Marcar como enviado').click()

    tentar(g, marcar_enviado, cabecalho.get_by_text('Enviado', exact=True), repetir=marcar_de_novo)
    g.pausa(1)
    g.foto(2, cabecalho)

    pdf = pg.get_by_role('button', name='PDF')
    g.legenda('Prefere mandar em PDF? Baixe aqui e anexe na conversa', 3)
    g.destacar(pdf)
    g.mover(pdf)
    g.pausa(1.5)
    g.foto(3, pdf)

    g.legenda('Em "Mais", copie o link de aprovação para mandar sozinho', 4)
    g.clicar(pg.get_by_role('button', name='Mais'))
    item = pg.get_by_role('menuitem', name='Copiar link de aprovação')
    pronto(g, item)
    g.foto(4, item)
    g.clicar(item)
    link = pg.evaluate('navigator.clipboard.readText()')
    g.pausa(0.6)

    g.legenda('Assim o cliente vê o orçamento, no celular ou no computador', 5, segundos=0.3)
    g.ir(link.replace(URL, ''))
    nome = pg.locator('#ap-nome')
    pronto(g, nome)
    g.legenda('Assim o cliente vê o orçamento, no celular ou no computador', 5, segundos=2.2)
    g.foto(5)

    g.legenda('O cliente digita o nome, marca o aceite e confirma', 6)
    g.digitar(nome, 'Roberto Almeida')
    g.clicar(pg.locator('label:has(input[type=checkbox])').first, destacar=False)
    g.foto(6, nome.locator('xpath=ancestor::div[contains(@class,"rounded")][1]'))
    aprovado = pg.get_by_text('Orçamento aprovado', exact=False).first
    confirmar = pg.get_by_role('button', name='Confirmar aprovação')
    tentar(g, lambda: g.clicar(confirmar), aprovado, repetir=confirmar.click)
    g.legenda('Pronto: o cliente vê a confirmação na hora', 6)
    g.destacar(aprovado.locator('xpath=ancestor::div[1]'))
    g.pausa(1.4)
    g.limpar()

    g.legenda('No sistema, o orçamento já aparece como Aprovado', 7, segundos=0.3)
    g.ir(f'/orcamentos/{orcamento}')
    faixa = pg.get_by_text('Aprovado por', exact=False).first
    pronto(g, faixa)
    g.destacar(faixa)
    g.legenda('No sistema, o orçamento já aparece como Aprovado', 7, segundos=2.5)
    g.foto(7, faixa)
    g.legenda(None)
    g.pausa(0.5)

cortar_esperas(g)
