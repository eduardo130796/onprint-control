"""Tutorial "Enviar o orçamento e receber a aprovação" (vídeo + capturas). Uso:
    python scripts/tutoriais/enviar-orcamento.py [id do orçamento em rascunho]

Sem id, duplica o ORC-2026-0067 da empresa de demonstração (a cópia fica em rascunho). O ideal é usar o
orçamento criado por fazer-orcamento.py (ele mostra o id no fim).

O WhatsApp aparece conectado com um número fictício e o envio NÃO sai (gravador.whatsapp_demo). A aprovação no
fim é real ("Cliente aprovou pelo WhatsApp"): com "criar o pedido automaticamente" ligado em Configurações →
Empresa → Pedidos, o orçamento vira pedido. Rode com a API no modo de teste do WhatsApp (WHATSAPP_PROVEDOR=log),
para os avisos automáticos do pedido também não saírem.
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from gravador import EMAIL, SENHA, URL, Gravador  # noqa: E402

BASE = 'ORC-2026-0067'


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
    print(f"  orçamento do tutorial: {copia['numero']}")
    return copia['id']


orcamento = sys.argv[1] if len(sys.argv) > 1 else preparar()

with Gravador('enviar-orcamento', rota_inicial=f'/orcamentos/{orcamento}') as g:
    pg = g.pg
    g.whatsapp_demo(formato='enquete')
    g.ir(f'/orcamentos/{orcamento}')
    g._corte = max(0.0, time.monotonic() - g._t0 - 0.4)  # o vídeo começa aqui
    g._ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=URL)
    cabecalho = pg.locator('h1').first.locator('xpath=..')
    cabecalho.get_by_text('Rascunho', exact=True).wait_for()

    # 1. Botão "Enviar orçamento"
    enviar = pg.get_by_role('button', name='Enviar orçamento')
    g.legenda('Com o orçamento salvo, toque em "Enviar orçamento"', 1, segundos=2)
    g.foto(1, enviar)
    g.clicar(enviar)

    # 2. Diálogo: para quem, a mensagem como o cliente vê e o PDF
    dialogo = pg.get_by_role('dialog')
    botao_envio = dialogo.get_by_role('button', name='Enviar para', exact=False)
    botao_envio.wait_for()
    g.pausa(1)
    g.legenda('Confira a mensagem: o PDF vai junto e, logo depois, a enquete de aprovação', 2, segundos=2.6)
    g.foto(2)
    previa = dialogo.get_by_text('Aprovado', exact=False).last
    g.destacar(previa.locator('xpath=ancestor::div[contains(@class,"rounded")][1]'))
    g.pausa(1.6)
    g.limpar()

    # 3. Enviar pelo WhatsApp da gráfica: o orçamento fica "Enviado"
    g.legenda('Toque em "Enviar": sai pelo WhatsApp da própria gráfica', 3)
    g.clicar(botao_envio)
    cabecalho.get_by_text('Enviado', exact=True).wait_for()
    g.pausa(1.2)
    g.legenda('O orçamento passa de Rascunho para Enviado', 3, segundos=1.6)
    g.foto(3, cabecalho)

    # 4. Como o cliente aprova: enquete ou responder 1 ou 2 (tela WhatsApp)
    g.legenda('O cliente aprova pela enquete ou respondendo 1 ou 2', 4, segundos=0.2)
    g.ir('/whatsapp')
    formato = pg.get_by_text('Como o cliente aprova o orçamento').locator('xpath=..')
    formato.scroll_into_view_if_needed()
    g.pausa(0.6)
    g.legenda('O cliente aprova pela enquete ou respondendo 1 ou 2', 4, segundos=2.6)
    g.foto(4, formato)
    g.limpar()

    # 5. Pelo link, o cliente vê o orçamento completo e também pode aprovar
    g.legenda('O link no fim da mensagem abre o orçamento completo', 5, segundos=0.2)
    g.ir(f'/orcamentos/{orcamento}')
    g.clicar(pg.get_by_role('button', name='Mais'), destacar=False)
    pg.get_by_role('menuitem', name='Copiar link de aprovação').click()
    link = pg.evaluate('navigator.clipboard.readText()')
    g.ir(link.replace(URL, ''))
    pg.locator('#ap-nome').wait_for(state='attached')
    g.legenda('Pelo link, o cliente vê os itens, o pagamento e também pode aprovar', 5, segundos=2.4)
    g.foto(5)

    # 6. Aprovou de outro jeito? Um clique
    g.legenda('Respondeu "aprovado" de outro jeito? Um clique registra', 6, segundos=0.2)
    g.ir(f'/orcamentos/{orcamento}')
    aprovou = pg.get_by_role('button', name='Cliente aprovou pelo WhatsApp')
    g.legenda('Respondeu "aprovado" de outro jeito? Um clique registra', 6, segundos=1.6)
    g.foto(6, aprovou)
    g.clicar(aprovou)

    # 7. Aprovado e já virou pedido
    pedido = pg.get_by_text('Abrir pedido')
    pedido.wait_for()
    g.pausa(1.2)
    g.legenda('Aprovado: o pedido já nasce com o pagamento combinado', 7, segundos=2.6)
    g.foto(7, pedido.locator('xpath=ancestor::div[contains(@class,"rounded")][1]'))
    g.limpar()
    g.legenda(None)
    g.pausa(0.5)
