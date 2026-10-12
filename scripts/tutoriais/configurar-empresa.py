"""Tutorial "Colocar a logo e os dados da sua gráfica" (vídeo + capturas).
Uso: python scripts/tutoriais/configurar-empresa.py

Na gravação o complemento do endereço muda de "Loja 2" para "Loja 2 - Térreo" (para mostrar o "Salvar"); no fim o
script volta o valor original. A cor do sistema só é mostrada em prévia (volta para o Azul GrafyGo sem salvar).
"""
import subprocess
import os
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from gravador import EMAIL, RAIZ, SENHA, URL, Gravador  # noqa: E402
from PIL import Image  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402


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

ORIGINAL = 'Loja 2'
TEMPORARIO = 'Loja 2 - Térreo'


def restaurar_complemento():
    """Volta o complemento da empresa de demonstração ao valor original (fora da gravação)."""
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        p = b.new_page(viewport={'width': 1280, 'height': 800})
        p.set_default_timeout(300_000)
        p.goto(URL + '/login')
        p.fill('input[type=email]', EMAIL)
        p.fill('input[type=password]', SENHA)
        p.click('button[type=submit]')
        p.wait_for_url(lambda u: '/login' not in u)
        p.goto(URL + '/configuracoes/empresa')
        campo = p.locator('#emp-complemento')
        campo.wait_for()
        p.wait_for_function("() => document.querySelector('#emp-razao')?.value")
        if campo.input_value() != ORIGINAL:
            campo.fill(ORIGINAL)
            p.get_by_role('button', name='Salvar', exact=True).click()
            p.get_by_text('Dados da empresa salvos.').wait_for()
            print('  complemento restaurado')
        b.close()


if '--restaurar' in sys.argv:
    restaurar_complemento()
    sys.exit(0)

try:
    with GravadorPronto('configurar-empresa', rota_inicial='/configuracoes/empresa') as g:
        pg = g.pg
        pg.wait_for_function("() => document.querySelector('#emp-razao')?.value")
        g.legenda('Em Ajustes, abra "Dados da empresa"', 1)
        link = pg.get_by_role('link', name='Dados da empresa')
        g.destacar(link)
        g.mover(link)
        g.pausa(1.2)
        g.foto(1, link)
        g.limpar()

        logo = pg.get_by_role('heading', name='Logo').locator('xpath=ancestor::div[.//button[normalize-space()="Escolher arquivo"]][1]')
        g.legenda('Coloque a logo: arraste a imagem ou toque em "Escolher arquivo"', 2)
        g.destacar(logo)
        g.mover(pg.get_by_role('button', name='Escolher arquivo'))
        g.pausa(1.6)
        g.foto(2, logo)

        cadastrais = pg.get_by_role('heading', name='Dados cadastrais').locator('xpath=ancestor::div[.//input[@id="emp-site"]][1]')
        g.legenda('Confira o nome, o CNPJ, o WhatsApp e o telefone', 3)
        g.destacar(cadastrais)
        for campo in ('#emp-fantasia', '#emp-cnpj', '#emp-whatsapp', '#emp-telefone'):
            g.mover(pg.locator(campo))
            g.pausa(0.5)
        g.pausa(0.6)
        g.foto(3, cadastrais)

        endereco = pg.get_by_role('heading', name='Endereço').locator('xpath=ancestor::div[.//select[@id="emp-uf"]][1]')
        g.legenda('Preencha o endereço: com o CEP, a rua e a cidade vêm sozinhas', 4)
        g.destacar(endereco)
        g.digitar(pg.locator('#emp-complemento'), TEMPORARIO)
        g.foto(4, endereco)

        g.legenda('Toque em "Salvar": a logo e os dados vão para os orçamentos', 5)
        salvar = pg.get_by_role('button', name='Salvar', exact=True)
        salvar.evaluate("e => e.scrollIntoView({block: 'center', behavior: 'smooth'})")
        g.pausa(0.8)
        g.clicar(salvar)
        aviso = pg.get_by_text('Dados da empresa salvos.')
        g.aguardar(aviso.wait_for)
        g.pausa(0.8)
        g.foto(5, aviso.locator('xpath=ancestor::li[1]'))

        g.legenda('Agora a cor: abra "Aparência"', 6)
        g.clicar(pg.get_by_role('link', name='Aparência'))
        cores = pg.get_by_role('radiogroup', name='Cores')
        g.aguardar(cores.wait_for)
        g.pausa(0.8)
        g.legenda('Toque numa cor: o sistema todo mostra a prévia', 6)
        g.clicar(pg.get_by_role('radio', name='Verde'))
        g.pausa(1.2)
        g.foto(6, cores)

        g.legenda('Gostou? Toque em "Salvar cor": vale para toda a equipe', 7)
        salvar_cor = pg.get_by_role('button', name='Salvar cor')
        g.destacar(salvar_cor)
        g.mover(salvar_cor)
        g.pausa(1.8)
        g.foto(7, salvar_cor)
        g.limpar()

        g.legenda('Aqui vamos manter o Azul GrafyGo, a cor padrão', 7)
        g.clicar(pg.get_by_role('button', name='Voltar para Azul GrafyGo'))
        g.pausa(1.5)
        g.legenda(None)
        g.pausa(0.4)
finally:
    # Em outro processo: se a gravação falhar no meio, o Playwright dela ainda está aberto neste
    subprocess.run([sys.executable, __file__, '--restaurar'], check=False)
