"""Tutorial "Conectar o WhatsApp e os avisos automáticos" (vídeo + capturas). Uso:
    python scripts/tutoriais/conectar-whatsapp.py

Não conecta nada de verdade e não muda a configuração: a tela começa "não conectada", o QR code é de exemplo
(aponta para a central de ajuda) e, depois, a conexão aparece com um número fictício (gravador.whatsapp_demo).
Nada é salvo (o botão "Salvar" não é tocado).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from gravador import Gravador  # noqa: E402

with Gravador('conectar-whatsapp', rota_inicial='/orcamentos') as g:
    pg = g.pg
    g.whatsapp_demo(estado='desconectado', formato='enquete')

    # 1. Tela WhatsApp
    g.legenda('No menu Comercial, abra "WhatsApp"', 1)
    g.clicar(pg.get_by_role('link', name='WhatsApp', exact=True).first)
    conectar = pg.get_by_role('button', name='Conectar')
    conectar.wait_for()
    g.pausa(0.8)
    cartao = conectar.locator('xpath=ancestor::div[contains(@class,"rounded")][last()]')
    g.legenda('Toque em "Conectar" para ligar o WhatsApp da sua gráfica', 1, segundos=2)
    g.foto(1, conectar)

    # 2. QR code
    g.clicar(conectar)
    qr = pg.get_by_role('img', name='QR code para conectar o WhatsApp')
    qr.wait_for()
    g.pausa(1)
    g.legenda('No celular da gráfica: Aparelhos conectados → Conectar aparelho', 2, segundos=2.6)
    g.foto(2, qr.locator('xpath=..'))
    g.limpar()

    # 3. Conectado (a tela confere sozinha a cada 3 segundos)
    g.whatsapp_demo(estado='conectado', formato='enquete')
    pg.get_by_text('WhatsApp conectado', exact=True).wait_for(timeout=20_000)
    g.pausa(1.4)
    titulo = pg.get_by_text('WhatsApp conectado', exact=True)
    g.legenda('Pronto: os avisos saem do número da própria gráfica', 3, segundos=2.2)
    g.foto(3, titulo.locator('xpath=ancestor::div[contains(@class,"rounded")][1]'))
    g.limpar()

    # 4. Avisos automáticos
    avisos = pg.get_by_text('Avisos automáticos', exact=True).locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
    lista = pg.get_by_text('Pedido confirmado', exact=True).first.locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
    lista.scroll_into_view_if_needed()
    g.pausa(0.6)
    g.legenda('Ligue os avisos que o cliente recebe quando o pedido anda', 4, segundos=1.2)
    g.destacar(lista)
    g.pausa(0.6)
    g.clicar(pg.get_by_role('button', name='Ver mensagem').first, destacar=False)
    g.pausa(1)
    g.legenda('Toque em "Ver mensagem" para ver o texto que vai', 4, segundos=1.8)
    g.foto(4, lista)
    g.limpar()

    # 5. Horário e pausa
    horario = pg.get_by_text('Horário de envio', exact=True).locator('xpath=../..')
    horario.scroll_into_view_if_needed()
    g.destacar(horario)
    g.legenda('Escolha o horário dos avisos. Precisa parar? "Pausar os avisos"', 5, segundos=2.4)
    g.foto(5, horario)
    g.limpar()

    # 6. Como o cliente aprova o orçamento
    formato = pg.get_by_text('Como o cliente aprova o orçamento').locator('xpath=..')
    formato.scroll_into_view_if_needed()
    g.destacar(formato)
    g.legenda('Orçamento: o cliente aprova pela enquete ou respondendo 1 ou 2', 6, segundos=2.6)
    g.foto(6, formato)
    sozinho = pg.get_by_text('Aprovar sozinho quando o cliente responder Aprovado', exact=True).locator('xpath=../..')
    sozinho.scroll_into_view_if_needed()
    g.destacar(sozinho)
    g.legenda('Com "Aprovar sozinho" ligado, o voto já aprova o orçamento', 6, segundos=2.2)
    g.limpar()

    # 7. Mensagens enviadas e na fila
    titulo = pg.get_by_text('Mensagens enviadas e na fila', exact=True)
    titulo.scroll_into_view_if_needed()
    filtros = pg.get_by_text('Na fila', exact=True).first.locator('xpath=..')
    g.pausa(0.6)
    g.legenda('Aqui fica tudo o que saiu e o que está na fila, com o pedido', 7, segundos=2.4)
    g.foto(7, filtros)
    g.limpar()
    g.legenda(None)
    g.pausa(0.4)
