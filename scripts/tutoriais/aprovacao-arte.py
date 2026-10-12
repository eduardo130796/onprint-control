"""Tutorial "Mandar a arte para o cliente aprovar" (vídeo + capturas). Uso: python scripts/tutoriais/aprovacao-arte.py

Antes de gravar, cria pela API um pedido novo (cópia do ORC-2026-0050 da empresa de demonstração, aprovada e
convertida), com a arte ainda sem arquivo. O arquivo da arte é desenhado aqui mesmo (Pillow).
"""
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from PIL import Image, ImageDraw, ImageFont  # noqa: E402
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


BASE = 'ORC-2026-0050'  # Marcelo Augusto Pereira: 45 camisetas personalizadas


def desenhar_arte(destino: Path):
    """Estampa de camiseta simples, só para ilustrar a aprovação."""
    fonte = lambda nome, t: ImageFont.truetype(f'C:/Windows/Fonts/{nome}', t)  # noqa: E731
    im = Image.new('RGB', (1400, 1400), '#FFF7E8')
    d = ImageDraw.Draw(im)
    d.ellipse([250, 170, 1150, 1070], fill='#0E7C66')
    d.ellipse([330, 250, 1070, 990], fill='#F2A900')
    for texto, y, f in [('FAMÍLIA', 420, fonte('arialbd.ttf', 120)), ('PEREIRA', 560, fonte('arialbd.ttf', 150)), ('Encontro 2026', 760, fonte('arial.ttf', 70))]:
        w = d.textlength(texto, font=f)
        d.text(((1400 - w) / 2, y), texto, font=f, fill='#123B33')
    rodape = fonte('arialbd.ttf', 64)
    w = d.textlength('Sítio Boa Vista · 15 de novembro', font=rodape)
    d.text(((1400 - w) / 2, 1160), 'Sítio Boa Vista · 15 de novembro', font=rodape, fill='#0E7C66')
    im.save(destino)


def preparar() -> str:
    """Duplica o orçamento base, aprova, converte em pedido e devolve o id do pedido."""
    with sync_playwright() as pw:
        api = api_sessao(pw)
        base = next(o for o in api('get', f'orcamentos?page=1&pageSize=20&busca={BASE}')['data'] if o['numero'] == BASE)
        copia = api('post', f"orcamentos/{base['id']}/duplicar")
        api('post', f"orcamentos/{copia['id']}/aprovar", data={'nome': 'Marcelo Pereira, pelo WhatsApp'})
        condicoes = {'sinalPercentual': '50', 'parcelas': '1', 'intervaloDias': '30', 'primeiroVencimento': '', 'tipoEntrega': 'retirada', 'prioridade': 'normal'}
        r = api('post', f"orcamentos/{copia['id']}/converter", data=condicoes)
        print(f"  pedido do tutorial: {r['pedido']['numero']} ({copia['numero']})")
        return r['pedido']['id']


# Para repetir a gravação com um pedido (arte ainda sem arquivo) já criado: python aprovacao-arte.py <id do pedido>
pedido = sys.argv[1] if len(sys.argv) > 1 else preparar()
arte = Path(tempfile.mkdtemp(prefix='tut-arte-')) / 'camiseta-familia-pereira.png'
desenhar_arte(arte)

with Gravador('aprovacao-arte', rota_inicial=f'/pedidos/{pedido}?aba=arte') as g:
    pg = g.pg
    preparar_pagina(g)
    botao = pg.get_by_role('button', name='Escolher arquivo')
    pronto(g, botao)
    pronto(g, pg.get_by_role('tabpanel').get_by_text('Aguardando arquivo', exact=True))
    comecar_aqui(g)

    g.legenda('No pedido, abra a aba "Arte": cada item tem a sua', 1, segundos=2)
    g.foto(1, pg.get_by_role('tab', name='Arte'))

    g.legenda('Toque em "Escolher arquivo" e mande a arte (PDF, imagem, CDR…)', 2)

    def enviar_arquivo():
        g.destacar(botao)
        g.mover(botao)
        g.pausa(0.5)
        with pg.expect_file_chooser() as escolha:
            botao.click()
        escolha.value.set_files(str(arte))
        g.limpar()

    enviar = pg.get_by_role('button', name='Enviar ao cliente')
    tentar(g, enviar_arquivo, enviar, vezes=6, limite=120)
    miniatura = pg.get_by_role('img', name='Arte v1')
    pronto(g, miniatura)
    g.pausa(1.2)
    g.foto(2, miniatura)

    g.legenda('Toque em "Enviar ao cliente"', 3)
    copiar = pg.get_by_role('button', name='Copiar mensagem com link')
    tentar(g, lambda: g.clicar(enviar), copiar, repetir=enviar.click)
    g.pausa(1)
    g.legenda('Copie a mensagem com o link e cole no WhatsApp do cliente', 3)
    g.clicar(copiar)
    g.pausa(0.8)
    g.foto(3, copiar.locator('xpath=..'))
    link = pg.get_by_role('link', name='Abrir link').get_attribute('href')

    g.legenda('O cliente abre o link e vê a arte em tamanho grande', 4, segundos=0.3)
    g.ir(link.replace(URL, ''))
    ajuste = pg.get_by_role('button', name='Pedir ajuste')
    pronto(g, ajuste)
    g.legenda('O cliente abre o link e vê a arte em tamanho grande', 4, segundos=2.2)
    g.foto(4)

    g.legenda('Se precisar mudar algo, ele toca em "Pedir ajuste" e escreve', 5)
    g.clicar(ajuste)
    g.digitar(pg.locator('#arte-ajuste'), 'Trocar a data para 16 de novembro', atraso=45)
    g.foto(5, pg.locator('#arte-ajuste').locator('xpath=ancestor::div[contains(@class,"rounded")][1]'))
    g.pausa(0.6)

    g.legenda('Se estiver tudo certo: "Aprovar arte", nome, aceite e confirmar', 6)
    g.clicar(pg.get_by_role('button', name='Aprovar arte'))
    g.digitar(pg.locator('#arte-nome'), 'Marcelo Pereira')
    g.clicar(pg.locator('label:has(input[type=checkbox])').first, destacar=False)
    feito = pg.get_by_text('Arte aprovada', exact=True).first
    confirmar = pg.get_by_role('button', name='Confirmar aprovação')
    tentar(g, lambda: g.clicar(confirmar), feito, repetir=confirmar.click)
    g.pausa(1)
    g.foto(6, feito.locator('xpath=ancestor::div[1]'))

    g.legenda('No pedido, a arte aparece como Aprovada', 7, segundos=0.3)
    g.ir(f'/pedidos/{pedido}?aba=arte')
    resumo = pg.get_by_text('Artes aprovadas', exact=True).locator('xpath=..')
    pronto(g, resumo)
    pronto(g, pg.get_by_role('tabpanel').get_by_text('Aprovada', exact=True))
    g.legenda('No pedido, a arte aparece como Aprovada', 7, segundos=1.2)
    g.destacar(resumo)
    g.pausa(1.5)
    cartao = pg.get_by_role('tabpanel').get_by_text('Aprovada', exact=True).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]')
    g.foto(7, cartao)
    g.legenda(None)
    g.pausa(0.5)

cortar_esperas(g)
