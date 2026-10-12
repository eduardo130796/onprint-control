"""Tutorial "Cadastrar um produto com o preço certo" (vídeo + capturas). Uso: python scripts/tutoriais/cadastrar-produto.py

Cadastra o produto "Faixa em lona 440 g" na empresa de demonstração (fica no catálogo). Se ele já existir de uma
gravação anterior, o antigo é renomeado e desativado antes de gravar (o sistema não apaga produtos).
"""
import re
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from gravador import EMAIL, RAIZ, SENHA, URL, Gravador  # noqa: E402
from PIL import Image  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

NOME = 'Faixa em lona 440 g'


class GravadorPronto(Gravador):
    """Espera o sistema terminar de abrir (com o servidor de desenvolvimento lento, o networkidle chega antes)."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.cortes: list[tuple[float, float]] = []

    def __enter__(self):
        # Com o servidor ocupado, o login do gravador (30 s) pode falhar: fecha o navegador e sai com código 3,
        # para rodar de novo (ex.: until python …; do sleep 30; done)
        try:
            return super().__enter__()
        except Exception as e:
            print(f'  não abriu o sistema: {str(e).splitlines()[0]}')
            for fechar in (lambda: self._browser.close(), lambda: self._pw.stop()):
                try:
                    fechar()
                except Exception:
                    pass
            raise SystemExit(3)

    def aguardar(self, espera):
        """Espera o servidor (ex.: o aviso de salvo). Se demorar, o trecho parado é cortado do vídeo."""
        inicio = time.monotonic() - self._t0
        espera()
        fim = time.monotonic() - self._t0
        if fim - inicio > 2.5:
            self.cortes.append((inicio + 0.6, fim - 0.4))

    def _filtro_cortes(self):
        """Tira do vídeo os trechos em que só se esperava o servidor (tempos relativos ao início do vídeo)."""
        trechos = [(a - self._corte, b - self._corte) for a, b in getattr(self, 'cortes', []) if b - self._corte > 0]
        if not trechos:
            return []
        fora = '+'.join(f'between(t,{max(a, 0):.2f},{b:.2f})' for a, b in trechos)
        print(f'  cortes no vídeo: {sum(b - max(a, 0) for a, b in trechos):.0f}s de espera')
        return ['-vf', f"select='not({fora})',setpts=N/25/TB", '-r', '25']

    def _converter(self, webm):
        """Como o do gravador, mas gera o MP4 na pasta temporária, confere se decodifica sem erro e só então copia
        para public/ajuda (com a máquina carregada, o MP4 escrito direto na pasta do OneDrive saiu corrompido)."""
        amb = {**os.environ, 'MSYS_NO_PATHCONV': '1'}
        temp = webm.parent / 'video.mp4'
        for tentativa in range(3):
            subprocess.run([
                'docker', 'run', '--rm', '-v', f'{webm.parent}:/entrada', 'linuxserver/ffmpeg:latest', '-y', '-loglevel', 'error',
                '-ss', f'{self._corte:.2f}', '-i', f'/entrada/{webm.name}', *self._filtro_cortes(), '-c:v', 'libx264', '-preset', 'slow', '-crf', '28',
                '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', '/entrada/video.mp4',
            ], check=True, env=amb)
            erros = subprocess.run(['docker', 'run', '--rm', '-v', f'{webm.parent}:/entrada', 'linuxserver/ffmpeg:latest', '-v', 'error',
                                    '-i', '/entrada/video.mp4', '-f', 'null', '-'], capture_output=True, text=True, env=amb)
            if not (erros.stdout + erros.stderr).strip():
                break
            print(f'  vídeo com erro na conversão (tentativa {tentativa + 1}), convertendo de novo')
        else:
            raise RuntimeError('o vídeo saiu corrompido 3 vezes')
        mp4 = self.saida / 'video.mp4'
        shutil.copyfile(temp, mp4)
        capa = self.saida / 'capa.webp'
        if self.fotos:
            im = Image.open(self.fotos[0])
            im.thumbnail((960, 600), Image.LANCZOS)
            im.save(capa, 'WEBP', quality=78, method=6)
        segundos = self._duracao(mp4)
        print(f'  vídeo: {mp4.relative_to(RAIZ)} ({mp4.stat().st_size // 1024} KB, {segundos}s)')

    def ir(self, rota: str, espera: float = 1.2):
        self.pg.set_default_timeout(180_000)
        self.pg.goto(URL + rota)
        try:
            self.pg.wait_for_load_state('networkidle', timeout=60_000)
        except Exception:
            pass
        self.pg.locator('main h1').first.wait_for()
        # A legenda fica por cima dos botões do rodapé: não deve bloquear o clique
        self.pg.add_style_tag(content='#tut-legenda, #tut-destaque { pointer-events: none !important }')
        for seletor in ('text=Carregando...', '[class*="animate-pulse"]'):
            try:
                self.pg.locator(seletor).first.wait_for(state='detached', timeout=240_000)
            except Exception:
                pass
        try:  # logo do topo e demais imagens carregadas
            self.pg.wait_for_function('() => [...document.images].every((i) => i.complete && i.naturalWidth > 0)', timeout=60_000)
        except Exception:
            pass
        self.pausa(espera)

    def __exit__(self, tipo, erro, tb):
        if erro is not None:  # captura da tela no erro, para entender o que houve
            try:
                self.pg.screenshot(path=str(self.tmp.parent / f'erro-{self.slug}.png'))
                print('  erro: captura em', self.tmp.parent / f'erro-{self.slug}.png')
            except Exception:
                pass
        return super().__exit__(tipo, erro, tb)


def aposentar_antigo():
    """Produto de uma gravação anterior: renomeia e desativa (fora da gravação)."""
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        p = b.new_page(viewport={'width': 1280, 'height': 800})
        p.set_default_timeout(300_000)
        p.goto(URL + '/login')
        p.fill('input[type=email]', EMAIL)
        p.fill('input[type=password]', SENHA)
        p.click('button[type=submit]')
        p.wait_for_url(lambda u: '/login' not in u)
        while True:
            p.goto(URL + '/produtos')
            p.get_by_text('PRD-0001').or_(p.get_by_text('Placa em PVC 3 mm')).first.wait_for()
            linha = p.locator('tr', has=p.get_by_text(NOME, exact=True))
            if linha.count() == 0:
                break
            linha.first.get_by_text(NOME, exact=True).click()
            nome = p.locator('#pd-nome')
            p.wait_for_function("() => document.querySelector('#pd-nome')?.value")
            nome.fill(NOME + ' (gravação antiga)')
            p.get_by_role('button', name='Salvar alterações').click()
            p.get_by_text('Produto atualizado.').wait_for()
            p.goto(URL + '/produtos')
            antiga = p.locator('tr', has=p.get_by_text(NOME + ' (gravação antiga)', exact=True)).first
            antiga.get_by_role('button', name='Desativar').click()
            confirmar = p.get_by_role('alertdialog').or_(p.get_by_role('dialog')).first
            confirmar.get_by_role('button', name=re.compile('Desativar|Confirmar')).click()
            p.wait_for_timeout(1500)
            print('  produto antigo desativado')
        b.close()


try:
    aposentar_antigo()
except Exception as e:  # servidor ocupado: tente de novo
    print('  não abriu o sistema:', str(e).splitlines()[0])
    raise SystemExit(3)

with GravadorPronto('cadastrar-produto', rota_inicial='/produtos') as g:
    pg = g.pg
    pg.get_by_text('Placa em PVC 3 mm').first.wait_for()
    g.legenda('Em Catálogo, abra "Produtos e serviços"', 1)
    link = pg.get_by_role('link', name='Produtos e serviços')
    g.destacar(link)
    g.mover(link)
    g.pausa(1)
    g.limpar()
    novo = pg.get_by_role('button', name='Novo produto').first
    g.legenda('Toque em "Novo produto"', 1)
    g.foto(1, novo)
    g.clicar(novo)

    nome = pg.locator('#pd-nome')
    g.aguardar(nome.wait_for)
    g.pausa(0.6)
    g.legenda('Dê um nome e escolha a categoria e a unidade', 2)
    g.digitar(nome, NOME)
    categoria = pg.locator('#pd-categoria')
    rotulo = next(t for t in categoria.locator('option').all_inner_texts() if 'Banners e lonas' in t)
    g.mover(categoria)
    categoria.select_option(label=rotulo)
    g.pausa(0.6)
    unidade = pg.locator('#pd-unidade')
    g.mover(unidade)
    unidade.select_option(label='Metro quadrado (m²)')
    g.pausa(0.6)
    g.digitar(pg.locator('#pd-prazo'), '2')
    g.digitar(pg.locator('#pd-descricao'), 'Faixa em lona 440 g com impressão digital. Ideal para fachadas e eventos.', atraso=25)
    g.foto(2, nome.locator('xpath=ancestor::div[.//textarea[@id="pd-descricao"]][1]'))

    g.legenda('Em "Como é vendido", escolha cobrar por m²', 3)
    modo = pg.locator('#pd-modo')
    secao = pg.get_by_role('heading', name='Como é vendido').locator('xpath=ancestor::div[.//select[@id="pd-modo"]][1]')
    g.destacar(secao)
    g.mover(modo)
    modo.select_option(label='Por m²')
    g.pausa(1.2)
    g.foto(3, secao)

    g.legenda('Toque em "Cadastrar produto"', 3)
    g.clicar(pg.get_by_role('button', name='Cadastrar produto'))
    g.aguardar(lambda: (pg.wait_for_url(re.compile(r'/produtos/[0-9a-f-]{36}')), pg.get_by_role('heading', name=NOME).wait_for()))
    g.pausa(1.2)

    g.legenda('Agora o preço: abra a aba "Custo e preço"', 4)
    g.clicar(pg.get_by_role('tab', name='Custo e preço'))
    composicao = pg.get_by_role('radio', name=re.compile('Montar a composição'))
    g.aguardar(composicao.wait_for)
    g.pausa(0.8)
    if composicao.get_attribute('aria-checked') != 'true':
        g.clicar(composicao)
    g.legenda('Coloque o material que vai no produto e a perda', 4)
    # Sem material ainda, o botão é "Adicionar material"; com material, "+ Material"
    g.clicar(pg.get_by_role('button', name=re.compile(r'^\s*(Adicionar material|Material)$')).first)
    g.clicar(pg.get_by_text(re.compile(r'^Buscar insumo')).first)
    pg.keyboard.type('Lona', delay=90)
    g.pausa(1)
    opcao = pg.locator('[role=option]', has_text='Lona 440 g').first
    g.aguardar(opcao.wait_for)  # a busca de insumos pode demorar
    g.clicar(opcao)
    g.digitar(pg.locator('[id$="-perda"]').first, '10')
    g.pausa(0.8)
    g.foto(4, pg.get_by_role('heading', name='Materiais').locator('xpath=ancestor::div[.//input[contains(@id,"-perda")]][1]'))

    g.legenda('Diga quanto quer de lucro: o sistema sugere o preço', 5)
    g.digitar(pg.locator('#cp-lucro'), '60')
    g.pausa(1.2)
    g.clicar(pg.get_by_role('button', name='Usar este preço'))
    g.pausa(0.8)
    painel = pg.locator('#cp-lucro').locator('xpath=ancestor::div[.//input[@id="cp-preco"]][1]')
    g.foto(5, painel)
    g.legenda('Salve o custo e o preço', 5)
    g.clicar(pg.get_by_role('button', name='Salvar custo e preço'))
    g.aguardar(lambda: pg.get_by_text('Custo e preço salvos.').wait_for(timeout=420_000))
    g.pausa(1)

    g.legenda('Na aba "Acabamentos", marque os que este produto aceita', 6)
    g.clicar(pg.get_by_role('tab', name='Acabamentos'))
    g.aguardar(pg.get_by_role('button', name='Salvar acabamentos').wait_for)
    g.pausa(0.6)
    for nome_acab in ('Ilhós a cada 50 cm', 'Bainha', 'Bastão e cordão'):
        caixa = pg.get_by_role('checkbox', name=f'{nome_acab}: permitido', exact=True)
        if not caixa.is_checked():
            g.clicar(caixa)
    g.clicar(pg.get_by_role('checkbox', name='Bainha: padrao', exact=True))
    tabela = pg.locator('main table').first
    g.foto(6, tabela)
    g.clicar(pg.get_by_role('button', name='Salvar acabamentos'))
    g.aguardar(lambda: pg.get_by_text('Acabamentos salvos.').wait_for(timeout=420_000))
    g.legenda('Pronto! O produto já aparece no orçamento com o preço certo', 7, segundos=2.6)
    g.legenda(None)
    g.pausa(0.4)
