"""Tutorial "Fazer um orçamento em segundos" (vídeo + capturas). Uso: python scripts/tutoriais/fazer-orcamento.py

Cria um orçamento em rascunho (Padaria Pão Dourado, banner) na empresa de demonstração. O id sai no fim
("orçamento do tutorial: …") e serve para gravar "enviar-orcamento" com o mesmo orçamento.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from gravador import Gravador  # noqa: E402

with Gravador('fazer-orcamento') as g:
    pg = g.pg
    g.legenda('Do painel, toque em "Novo orçamento"', 1)
    novo = pg.get_by_role('link', name='Novo orçamento').first
    g.foto(1, novo)
    g.clicar(novo)
    pg.get_by_text('Buscar cliente…').wait_for()
    g.pausa(0.8)

    g.legenda('Escolha o cliente: digite parte do nome', 2)
    g.clicar(pg.get_by_text('Buscar cliente…'))
    pg.keyboard.type('Padaria', delay=90)
    g.pausa(1)
    g.clicar(pg.get_by_role('option').first)
    g.foto(2, pg.get_by_text('Padaria Pão Dourado').first)

    g.legenda('Escolha o produto ou serviço', 3)
    g.clicar(pg.get_by_text('Buscar produto ou serviço…'))
    pg.keyboard.type('Banner', delay=90)
    g.pausa(1)
    g.clicar(pg.get_by_role('option').first)
    g.foto(3)

    g.legenda('Informe a quantidade e as medidas: o preço é calculado na hora', 4)
    g.digitar(pg.locator('[id$="-qtd"]').first, '2')
    g.digitar(pg.locator('[id$="-larg"]').first, '3')
    g.digitar(pg.locator('[id$="-alt"]').first, '1')
    g.pausa(1.2)
    g.foto(4, pg.locator('[id$="-larg"]').first.locator('xpath=ancestor::*[.//input[contains(@id,"-preco")]][1]'))

    g.legenda('Marque os acabamentos e se o item precisa de arte', 5)
    acabamento = pg.locator('main label:has(input[type=checkbox])').first
    g.clicar(acabamento)
    arte = pg.locator('main label:has-text("Precisa de arte")').first
    g.destacar(arte)
    g.mover(arte)
    g.pausa(1.2)
    g.foto(5, arte)
    g.limpar()

    g.legenda('Em "Pagamento", combine a entrada e as parcelas do saldo', 6)
    bloco = pg.locator('#orc-sinal').locator('xpath=ancestor::*[.//textarea][1]')
    g.destacar(bloco)
    g.digitar(pg.locator('#orc-sinal'), '50')
    g.digitar(pg.locator('#orc-parcelas'), '2')
    g.digitar(pg.locator('#orc-intervalo'), '30')
    g.pausa(1.2)
    g.foto(6, bloco)
    g.limpar()

    g.legenda('Confira o total (com desconto ou frete, se quiser) e salve', 7)
    g.destacar(pg.get_by_text('Total', exact=True).locator('xpath=ancestor::div[2]'))
    g.pausa(1.5)
    g.clicar(pg.get_by_role('button', name='Criar orçamento'))
    pg.wait_for_url(lambda u: '/orcamentos/' in u and not u.endswith('/novo'), timeout=60_000)
    pg.wait_for_load_state('networkidle')
    g.pausa(4)  # o aviso "Orçamento criado" some antes da foto
    g.legenda('Pronto! Agora é só tocar em "Enviar orçamento"', 8, segundos=2.5)
    g.destacar(pg.get_by_role('button', name='Enviar orçamento'))
    g.foto(7)
    g.limpar()
    g.legenda(None)
    g.pausa(0.5)
    print('  orçamento do tutorial:', pg.url.rsplit('/', 1)[-1])
