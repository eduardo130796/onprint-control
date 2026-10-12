"""Tutorial "Assinar a GrafyGo" (vídeo + capturas). Uso: python scripts/tutoriais/assinar-plano.py

Usa uma conta em teste grátis (não a de demonstração, que já é assinante):
    TUTORIAL_EMAIL=nova.grafica1791748754@exemplo.com TUTORIAL_SENHA=Bruno123456 python scripts/tutoriais/assinar-plano.py
Antes de gravar, deixa o nome da empresa como "Gráfica Nova Era" (fora da gravação). Para ANTES do botão
"Assinar e ir para o pagamento": nenhuma assinatura é criada.
"""
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

os.environ.setdefault('TUTORIAL_EMAIL', 'nova.grafica1791748754@exemplo.com')
os.environ.setdefault('TUTORIAL_SENHA', 'Bruno123456')

sys.path.insert(0, str(Path(__file__).parent))
from gravador import EMAIL, RAIZ, SENHA, URL, Gravador  # noqa: E402
from PIL import Image  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

RAZAO = 'Gráfica Nova Era Ltda'
FANTASIA = 'Gráfica Nova Era'
DOCUMENTO = '11222333000181'


TROCAR_NOME = """(novo) => {
  const trocar = () => {
    const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = andar.nextNode(); n; n = andar.nextNode()) {
      if (/TESTE-ONBOARDING/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/TESTE-ONBOARDING Gráfica Nova/g, novo)
    }
  }
  trocar()
  new MutationObserver(trocar).observe(document.documentElement, { subtree: true, childList: true, characterData: true })
}"""


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
        # O subtítulo de "Minha assinatura" mostra o nome do cadastro da conta (não muda com os dados da empresa):
        # na conta de teste ele é "TESTE-ONBOARDING…"; troca só na tela gravada
        self.pg.evaluate(TROCAR_NOME, FANTASIA)
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


def nomear_empresa():
    """Deixa a conta de teste com um nome de gráfica (o topo do sistema mostra o nome fantasia ou a razão social)."""
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        p = b.new_page(viewport={'width': 1280, 'height': 800})
        p.set_default_timeout(300_000)
        p.goto(URL + '/login')
        p.fill('input[type=email]', EMAIL)
        p.fill('input[type=password]', SENHA)
        p.click('button[type=submit]')
        p.wait_for_url(lambda u: '/login' not in u)
        print('  conferindo o nome da empresa…')
        p.goto(URL + '/configuracoes/empresa')
        p.wait_for_function("() => document.querySelector('#emp-razao')?.value")
        if p.locator('#emp-razao').input_value() != RAZAO or p.locator('#emp-fantasia').input_value() != FANTASIA:
            p.locator('#emp-razao').fill(RAZAO)
            p.locator('#emp-fantasia').fill(FANTASIA)
            p.get_by_role('button', name='Salvar', exact=True).click()
            p.get_by_text('Dados da empresa salvos.').wait_for()
            print('  empresa renomeada para', FANTASIA)
        b.close()


try:
    nomear_empresa()
except Exception as e:  # servidor ocupado: tente de novo
    print('  não abriu o sistema:', str(e).splitlines()[0])
    raise SystemExit(3)

with GravadorPronto('assinar-plano', rota_inicial='/assinatura') as g:
    pg = g.pg
    g.legenda('Em Ajustes, abra "Minha assinatura"', 1)
    link = pg.get_by_role('link', name='Minha assinatura')
    g.destacar(link)
    g.mover(link)
    g.pausa(1)
    g.limpar()
    heroi = pg.get_by_role('region', name='Sua assinatura')
    heroi.wait_for()
    g.pausa(0.8)
    g.legenda('Aqui você vê o plano e quantos dias de teste ainda tem', 1)
    g.foto(1, heroi)

    g.legenda('Toque em "Assinar agora"', 2)
    g.clicar(heroi.get_by_role('button', name='Assinar agora'))
    g.pausa(1)
    secao = pg.get_by_role('region', name='Assinar')
    g.legenda('Escolha o plano que combina com a sua gráfica', 2)
    g.clicar(secao.get_by_role('heading', name='Completo', exact=True))
    g.pausa(0.6)
    g.foto(2, secao.get_by_role('heading', name='Completo', exact=True).locator('xpath=ancestor::*[.//*[normalize-space()="Selecionado"]][1]'))

    g.legenda('Mensal ou anual? No anual você ganha 2 meses grátis', 3)
    ciclo = secao.get_by_role('radiogroup', name='Como pagar')
    g.clicar(ciclo.get_by_role('radio', name='Anual'))
    g.pausa(1.2)
    g.foto(3, ciclo.locator('xpath=ancestor::div[.//h3[normalize-space()="Completo"]][1]'))
    g.clicar(ciclo.get_by_role('radio', name='Mensal'))
    g.pausa(0.6)

    g.legenda('Escolha a forma de pagamento: cartão ou PIX/boleto', 4)
    cartao = secao.get_by_role('button', name='Cartão de crédito')
    formas = cartao.locator('xpath=..')
    g.destacar(formas)
    g.mover(secao.get_by_role('button', name='PIX ou boleto'))
    g.pausa(0.8)
    g.clicar(cartao, destacar=False)
    g.foto(4, formas)

    g.legenda('Informe o CNPJ (ou o CPF) que vai na cobrança', 5)
    doc = secao.locator('#as-doc')
    g.destacar(doc)
    g.digitar(doc, DOCUMENTO, atraso=60)
    g.foto(5, doc)

    g.legenda('Confira o resumo: plano, pagamento e valor', 6)
    resumo = secao.locator('aside')
    g.destacar(resumo)
    g.mover(resumo.get_by_role('button', name='Assinar e ir para o pagamento'))
    g.pausa(1.8)
    g.foto(6, resumo)
    g.legenda('Ao tocar em "Assinar", você paga na página segura do Asaas', 7, segundos=2.6)
    g.limpar()
    g.legenda(None)
    g.pausa(0.4)
