"""Tutorial "Acompanhar a produção no kanban" (vídeo + capturas). Uso: python scripts/tutoriais/acompanhar-producao.py

Antes de gravar, cria pela API um pedido novo (cópia do ORC-2026-0067 da empresa de demonstração, aprovada e
convertida) com as artes já enviadas e aprovadas: as duas OPs ficam na Fila, prontas para andar.
Os arquivos das artes são desenhados aqui mesmo (Pillow).
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


BASE = 'ORC-2026-0067'  # Alicerce Engenharia: placas em PVC + banner


def fonte(nome: str, tamanho: int):
    return ImageFont.truetype(f'C:/Windows/Fonts/{nome}', tamanho)


def desenhar(destino: Path, largura: int, altura: int, titulo: str, sub: str, rodape: str):
    im = Image.new('RGB', (largura, altura), '#1F3A5F')
    d = ImageDraw.Draw(im)
    d.rectangle([0, altura - altura // 5, largura, altura], fill='#F2A900')
    d.ellipse([largura - altura * 0.55, -altura * 0.2, largura + altura * 0.2, altura * 0.55], fill='#F2A900')
    d.text((largura * 0.05, altura * 0.17), titulo, font=fonte('arialbd.ttf', int(altura * 0.16)), fill='white')
    d.text((largura * 0.053, altura * 0.39), sub, font=fonte('arial.ttf', int(altura * 0.085)), fill='white')
    d.text((largura * 0.05, altura - altura * 0.15), rodape, font=fonte('arialbd.ttf', int(altura * 0.08)), fill='#1F3A5F')
    im.save(destino)


def preparar() -> str:
    """Pedido novo com as artes aprovadas. Devolve o número da OP do banner."""
    pasta = Path(tempfile.mkdtemp(prefix='tut-producao-'))
    placa, banner = pasta / 'placa-obra-alicerce.png', pasta / 'banner-alicerce.png'
    desenhar(placa, 1500, 1000, 'Alicerce', 'Uso obrigatório de EPI', 'Área de obra · acesso restrito')
    desenhar(banner, 2000, 1000, 'Alicerce', 'Engenharia e Construções', 'Obra em andamento · (11) 4002-8922')
    with sync_playwright() as pw:
        api = api_sessao(pw)
        base = next(o for o in api('get', f'orcamentos?page=1&pageSize=20&busca={BASE}')['data'] if o['numero'] == BASE)
        copia = api('post', f"orcamentos/{base['id']}/duplicar")
        api('post', f"orcamentos/{copia['id']}/aprovar", data={'nome': 'Roberto Almeida, por telefone'})
        condicoes = {'sinalPercentual': '50', 'parcelas': '1', 'intervaloDias': '30', 'primeiroVencimento': '', 'tipoEntrega': 'retirada', 'prioridade': 'alta'}
        r = api('post', f"orcamentos/{copia['id']}/converter", data=condicoes)
        pedido = api('get', f"pedidos/{r['pedido']['id']}")
        op_banner = ''
        for item in pedido['itens']:
            arquivo = placa if item['descricao'].startswith('Placa') else banner
            versao = api('post', f"pedidos/itens/{item['id']}/artes", multipart={'arquivo': {'name': arquivo.name, 'mimeType': 'image/png', 'buffer': arquivo.read_bytes()}})
            api('post', f"artes/{versao['id']}/aprovar", data={'nome': 'Roberto Almeida'})
            if item['descricao'].startswith('Banner'):
                op_banner = item['ordensProducao'][0]['numero']
        print(f"  pedido do tutorial: {pedido['numero']} (OP do banner: {op_banner})")
        return op_banner


# Para repetir a gravação com uma OP já pronta na Fila: python acompanhar-producao.py <número da OP>
op = sys.argv[1] if len(sys.argv) > 1 else preparar()

with Gravador('acompanhar-producao', rota_inicial='/producao') as g:
    pg = g.pg
    preparar_pagina(g)
    cartao = pg.locator('article').filter(has_text=op).first
    pronto(g, cartao)
    cartao.scroll_into_view_if_needed()
    pronto(g, cartao.get_by_role('img'))
    comecar_aqui(g)

    g.legenda('Cada coluna é uma etapa: Fila, Pré-impressão, Impressão…', 1, segundos=1)
    quadro = pg.get_by_text('Fila', exact=True).first.locator('xpath=ancestor::section[1]')
    g.destacar(quadro)
    g.pausa(1.8)
    g.foto(1, quadro)

    g.legenda('Cada cartão é uma OP: cliente, item, prazo e a arte na capa', 2)
    g.destacar(cartao)
    g.pausa(1.6)
    g.legenda('Toque em "Abrir" no cartão para ver os detalhes', 2)
    g.clicar(cartao.get_by_role('button', name='Abrir'))
    painel = pg.get_by_role('dialog')
    pronto(g, painel.get_by_text('Etapas', exact=True))
    g.pausa(1)
    g.foto(2, painel)

    g.legenda('Em "Abrir OP" fica a ordem de produção completa', 3)
    g.clicar(painel.get_by_role('button', name='Abrir OP'))
    etapa = pg.get_by_label('Mover para a etapa')
    pronto(g, etapa)
    historico = pg.get_by_text('Histórico de etapas', exact=True).locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
    pronto(g, historico)
    g.pausa(1)
    g.legenda('Terminou uma etapa? Escolha a próxima em "Mover para"', 3)
    g.destacar(etapa)
    g.mover(etapa)
    g.pausa(0.6)
    tentar(g, lambda: etapa.select_option(label='Pré-impressão'), historico.get_by_text('Pré-impressão').first)
    g.limpar()
    g.pausa(1)
    g.legenda('A mudança fica no histórico, com hora e quem moveu', 3, segundos=1.8)
    g.foto(3, etapa.locator('xpath=ancestor::div[contains(@class,"rounded")][1]'))

    g.legenda('A ficha da OP vai impressa para a máquina, com a arte e as etapas', 4, segundos=0.3)
    url_op = pg.url.replace(URL, '')
    g.ir(url_op + '/ficha')
    pronto(g, pg.get_by_role('img').first)
    g.legenda('A ficha da OP vai impressa para a máquina, com a arte e as etapas', 4, segundos=2.4)
    g.foto(4)

    g.legenda('De volta ao kanban: a OP já está em Pré-impressão', 5, segundos=0.3)
    g.ir('/producao')
    cartao = pg.locator('article').filter(has_text=op).first
    pronto(g, cartao)
    cartao.scroll_into_view_if_needed()
    pronto(g, cartao.get_by_role('img'))
    g.destacar(cartao)
    g.legenda('De volta ao kanban: a OP já está em Pré-impressão', 5, segundos=1.6)
    g.legenda('Dica: também dá para arrastar o cartão de uma coluna para outra', 5, segundos=2)
    g.legenda('Em "Etiqueta", imprima a etiqueta do volume para a entrega', 5)
    g.clicar(cartao.get_by_role('button', name='Etiqueta'))
    dialogo = pg.get_by_role('dialog')
    pronto(g, dialogo.get_by_text('Imprimir etiquetas', exact=True))
    g.pausa(1.2)
    g.foto(5, dialogo)
    g.clicar(dialogo.get_by_role('button', name='Fechar').last)

    g.legenda('No PCP, veja a carga de cada máquina e as OPs atrasadas', 6, segundos=0.3)
    g.ir('/pcp')
    capacidade = pg.get_by_text('OPs atrasadas', exact=True).first.locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]')
    pronto(g, capacidade)
    g.destacar(capacidade)
    g.legenda('No PCP, veja a carga de cada máquina e as OPs atrasadas', 6, segundos=2.5)
    g.foto(6, capacidade)
    g.legenda(None)
    g.pausa(0.5)

cortar_esperas(g)
