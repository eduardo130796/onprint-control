"""Tutorial "O orçamento aprovado vira pedido" (vídeo + capturas). Uso:
    python scripts/tutoriais/orcamento-em-pedido.py [id do orçamento já aprovado e convertido]

Sem id, duplica o ORC-2026-0066, marca como enviado e registra a aprovação pela API: com "criar o pedido
automaticamente" ligado (Configurações → Empresa → Pedidos), ele vira pedido na hora. O ideal é usar o orçamento
aprovado em enviar-orcamento.py. O passo "Converter em pedido" (criação automática desligada) abre o diálogo num
orçamento aprovado que ainda não virou pedido (ORC-2026-0082) e fecha sem criar nada.
Rode com a API no modo de teste do WhatsApp (WHATSAPP_PROVEDOR=log): o pedido gera aviso automático.
"""
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from gravador import EMAIL, SENHA, URL, Gravador  # noqa: E402

BASE = 'ORC-2026-0066'  # Pet Feliz Banho e Tosa
APROVADO_SEM_PEDIDO = 'ORC-2026-0082'


def api(metodo: str, caminho: str, corpo=None, token: str | None = None):
    req = urllib.request.Request(f'{URL}/api/v1/{caminho}', method=metodo, data=json.dumps(corpo).encode() if corpo is not None else None)
    req.add_header('content-type', 'application/json')
    if token:
        req.add_header('authorization', f'Bearer {token}')
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b'null')


TOKEN = api('POST', 'auth/login', {'email': EMAIL, 'senha': SENHA})['accessToken']


def buscar(numero: str) -> str:
    return next(o for o in api('GET', f'orcamentos?busca={numero}', token=TOKEN)['data'] if o['numero'] == numero)['id']


def preparar() -> str:
    copia = api('POST', f'orcamentos/{buscar(BASE)}/duplicar', {}, token=TOKEN)
    api('POST', f"orcamentos/{copia['id']}/enviar", {}, token=TOKEN)
    api('POST', f"orcamentos/{copia['id']}/aprovar", {'nome': 'Patrícia Gomes', 'canal': 'whatsapp'}, token=TOKEN)
    print(f"  orçamento do tutorial: {copia['numero']}")
    return copia['id']


orcamento = sys.argv[1] if len(sys.argv) > 1 else preparar()
aprovado = buscar(APROVADO_SEM_PEDIDO)

with Gravador('orcamento-em-pedido', rota_inicial='/configuracoes/empresa') as g:
    pg = g.pg
    # 1. A criação automática fica em Configurações → Empresa → Pedidos
    auto = pg.get_by_text('Quando o cliente aprovar o orçamento, criar o pedido automaticamente')
    cartao_pedidos = auto.locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
    cartao_pedidos.scroll_into_view_if_needed()
    g.pausa(0.6)
    g.legenda('Em Ajustes → Dados da empresa, no quadro "Pedidos"…', 1, segundos=1.2)
    g.destacar(auto)
    g.legenda('…deixe marcado: o pedido é criado sozinho quando o cliente aprova', 1, segundos=2.4)
    g.foto(1, cartao_pedidos)
    g.limpar()

    # 2. O cliente aprovou: o orçamento já virou pedido, com o pagamento combinado
    g.legenda('Cliente aprovou? O pedido já nasce com o pagamento do orçamento', 2, segundos=0.2)
    g.ir(f'/orcamentos/{orcamento}')
    abrir = pg.get_by_role('link', name='Abrir pedido')
    cartao = abrir.locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
    cartao.scroll_into_view_if_needed()
    g.pausa(0.6)
    g.legenda('Cliente aprovou? O pedido já nasce com o pagamento do orçamento', 2, segundos=2.4)
    g.foto(2, cartao)
    g.limpar()

    # 3. O pedido
    g.legenda('Toque em "Abrir pedido"', 3)
    g.clicar(abrir)
    resumo = pg.get_by_text('Entrega prevista', exact=True).locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
    resumo.wait_for()
    g.pausa(1)
    numero = pg.locator('h1').first.inner_text().strip()
    g.legenda('Aqui você vê o status, a entrega, as artes aprovadas e o total', 3, segundos=2.2)
    g.foto(3, resumo)
    g.limpar()

    # 4. Financeiro: entrada e parcelas
    g.legenda('Na aba "Financeiro" ficam a entrada e as parcelas', 4)
    g.clicar(pg.get_by_role('tab', name='Financeiro'))
    contas = pg.get_by_text('Contas a receber', exact=True).locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
    contas.wait_for()
    g.pausa(0.6)
    g.destacar(contas)
    g.legenda('Quando o cliente pagar, toque em "Receber" e dê a baixa', 4, segundos=2.2)
    g.foto(4, contas)
    g.limpar()

    # 5. Kanban
    g.legenda('No Kanban, acompanhe todos os pedidos por status', 5, segundos=0.6)
    g.ir('/pedidos/kanban')
    card = pg.locator('article').filter(has_text=numero).first
    card.wait_for()
    card.scroll_into_view_if_needed()
    g.pausa(0.8)
    g.destacar(card)
    g.legenda('O cartão mostra quanto falta pagar, as artes e as OPs', 5, segundos=2.5)
    g.foto(5, card)
    g.limpar()

    # 6. Criação automática desligada: "Converter em pedido" (o diálogo fecha sem criar o pedido)
    g.legenda('Desligou a criação automática? Use "Converter em pedido"', 6, segundos=0.2)
    g.ir(f'/orcamentos/{aprovado}')
    converter = pg.get_by_role('button', name='Converter em pedido')
    g.legenda('Desligou a criação automática? Use "Converter em pedido"', 6, segundos=1.2)
    g.clicar(converter)
    dialogo = pg.get_by_role('dialog')
    dialogo.wait_for()
    g.pausa(1)
    g.legenda('Confira o pagamento, a entrega e a prioridade e toque em "Criar pedido"', 6, segundos=2.6)
    g.foto(6, dialogo)
    pg.keyboard.press('Escape')
    g.pausa(0.6)
    g.legenda(None)
    g.pausa(0.4)
