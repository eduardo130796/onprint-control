"""Tutorial "Aprovar a arte (com a equipe ou com o cliente)" (vídeo + capturas). Uso:
    python scripts/tutoriais/aprovacao-arte.py [id do pedido com a arte ainda sem arquivo]

Sem id, duplica o ORC-2026-0066, marca como enviado e aprova pela API (com "criar o pedido automaticamente"
ligado, vira pedido). O ideal é usar o pedido criado em enviar-orcamento.py (Padaria Pão Dourado, banner).
O WhatsApp aparece conectado com número fictício e o envio NÃO sai (gravador.whatsapp_demo); a aprovação do cliente
na página "Acompanhe seu pedido" é real. Rode com a API no modo de teste do WhatsApp (WHATSAPP_PROVEDOR=log).
"""
import json
import sys
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).parent))
from gravador import EMAIL, SENHA, URL, Gravador  # noqa: E402

BASE = 'ORC-2026-0066'


def api(metodo: str, caminho: str, corpo=None, token: str | None = None):
    req = urllib.request.Request(f'{URL}/api/v1/{caminho}', method=metodo, data=json.dumps(corpo).encode() if corpo is not None else None)
    req.add_header('content-type', 'application/json')
    if token:
        req.add_header('authorization', f'Bearer {token}')
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b'null')


def preparar() -> str:
    token = api('POST', 'auth/login', {'email': EMAIL, 'senha': SENHA})['accessToken']
    base = next(o for o in api('GET', f'orcamentos?busca={BASE}', token=token)['data'] if o['numero'] == BASE)
    copia = api('POST', f"orcamentos/{base['id']}/duplicar", {}, token=token)
    api('POST', f"orcamentos/{copia['id']}/enviar", {}, token=token)
    r = api('POST', f"orcamentos/{copia['id']}/aprovar", {'nome': 'Cliente', 'canal': 'whatsapp'}, token=token)
    if not r.get('pedido'):
        raise SystemExit('Ligue "criar o pedido automaticamente" em Configurações → Empresa → Pedidos.')
    print(f"  pedido do tutorial: {r['pedido']['numero']} ({copia['numero']})")
    return r['pedido']['id']


def desenhar_arte(destino: Path):
    """Banner simples da padaria, só para ilustrar a aprovação."""
    fonte = lambda nome, t: ImageFont.truetype(f'C:/Windows/Fonts/{nome}', t)  # noqa: E731
    im = Image.new('RGB', (1800, 600), '#7A3E12')
    d = ImageDraw.Draw(im)
    d.rectangle([30, 30, 1770, 570], outline='#F5C26B', width=8)
    d.ellipse([90, 150, 390, 450], fill='#F5C26B')
    d.ellipse([140, 200, 340, 400], fill='#C8781E')
    for texto, y, f, cor in [
        ('PADARIA PÃO DOURADO', 120, fonte('arialbd.ttf', 110), '#FFF4DC'),
        ('Pão quentinho toda hora', 270, fonte('arial.ttf', 80), '#F5C26B'),
        ('(11) 98112-3301 · Rua das Flores, 120', 420, fonte('arialbd.ttf', 56), '#FFF4DC'),
    ]:
        w = d.textlength(texto, font=f)
        d.text((1080 - w / 2, y), texto, font=f, fill=cor)
    im.save(destino)


pedido = sys.argv[1] if len(sys.argv) > 1 else preparar()
arquivo = Path(tempfile.mkdtemp(prefix='tut-arte-')) / 'banner-padaria-pao-dourado.png'
desenhar_arte(arquivo)

with Gravador('aprovacao-arte', rota_inicial=f'/pedidos/{pedido}?aba=arte') as g:
    pg = g.pg
    g.whatsapp_demo()
    pg.get_by_role('button', name='Escolher arquivo').wait_for()
    cartao = pg.get_by_role('button', name='Não precisa de arte').locator('xpath=ancestor::div[contains(@class,"rounded")][1]')

    # 1. Aba Arte
    g.legenda('No pedido, abra a aba "Arte": cada item tem a sua', 1, segundos=2)
    g.foto(1, pg.get_by_role('tab', name='Arte'))

    # 2. Item que não precisa de arte
    g.legenda('Item sem arte (ou com a arte pronta do cliente)? Avise aqui', 2)
    g.clicar(pg.get_by_role('button', name='Não precisa de arte'))
    menu = pg.get_by_role('menu')
    menu.wait_for()
    g.pausa(1.2)
    g.foto(2, menu)
    pg.keyboard.press('Escape')
    g.pausa(0.6)

    # 3. Enviar o arquivo
    botao = pg.get_by_role('button', name='Escolher arquivo')
    g.legenda('Toque em "Escolher arquivo" e mande a arte (PDF, imagem, CDR…)', 3)
    g.destacar(botao)
    g.mover(botao)
    g.pausa(0.5)
    with pg.expect_file_chooser() as escolha:
        botao.click()
    escolha.value.set_files(str(arquivo))
    g.limpar()
    pg.get_by_role('img', name='Arte v1').wait_for(timeout=120_000)
    g.pausa(1.2)
    g.legenda('A miniatura aparece na hora. Corrigiu? Envie de novo: vira a versão 2', 3, segundos=2)
    g.foto(3, cartao)

    # 4. A equipe marca como aprovada (ou todas de uma vez)
    g.legenda('O cliente já aprovou com você? Toque em "Marcar como aprovada"', 4)
    g.clicar(pg.get_by_role('button', name='Marcar como aprovada'))
    menu = pg.get_by_role('menu')
    menu.wait_for()
    g.pausa(0.8)
    g.legenda('Escolha como ele aprovou. Várias artes? "Cliente aprovou todas as artes"', 4, segundos=2.2)
    g.foto(4, menu)
    pg.keyboard.press('Escape')
    g.pausa(0.6)

    # 5. Ou mande para o cliente: uma mensagem com os arquivos e um link só
    g.legenda('Quer que o cliente veja antes? Toque em "Enviar para o cliente"', 5)
    g.clicar(pg.get_by_role('button', name='Enviar para o cliente').first)
    dialogo = pg.get_by_role('dialog')
    enviar = dialogo.get_by_role('button', name='Enviar para', exact=False)
    enviar.wait_for()
    g.pausa(1)
    g.legenda('Uma mensagem só, com os arquivos e um link para aprovar tudo', 5, segundos=2.4)
    g.foto(5, dialogo)
    g.clicar(enviar)
    pagina = pg.get_by_role('link', name='Página do cliente')
    pagina.wait_for()
    g.pausa(1)

    # 6. O cliente aprova na página "Acompanhe seu pedido"
    link = pagina.get_attribute('href')
    g.legenda('Pelo link, o cliente vê a arte e aprova (ou pede ajuste)', 6, segundos=0.2)
    g.ir(link.replace(URL, ''))
    aprovar = pg.get_by_role('button', name='Aprovar a arte')
    aprovar.wait_for()
    g.legenda('Pelo link, o cliente vê a arte e aprova (ou pede ajuste)', 6, segundos=1.4)
    g.digitar(pg.locator('#artes-nome'), 'Roberto Almeida')
    g.clicar(pg.locator('label:has(input[type=checkbox])').last, destacar=False)
    g.foto(6, aprovar.locator('xpath=ancestor::section[1]'))
    g.clicar(aprovar)
    g.pausa(1.6)

    # 7. Aprovada no pedido: a produção pode seguir
    g.legenda('No pedido, a arte fica Aprovada e a produção pode seguir', 7, segundos=0.2)
    g.ir(f'/pedidos/{pedido}?aba=arte')
    resumo = pg.get_by_text('1 de 1 arte aprovada')
    resumo.wait_for()
    g.legenda('No pedido, a arte fica Aprovada e a produção pode seguir', 7, segundos=2.4)
    g.foto(7, cartao)
    g.legenda(None)
    g.pausa(0.5)
