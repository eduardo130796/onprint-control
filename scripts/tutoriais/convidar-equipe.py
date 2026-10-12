"""Tutorial "Colocar a sua equipe no sistema" (vídeo + capturas). Uso: python scripts/tutoriais/convidar-equipe.py

Cria a usuária Juliana Rocha (vendedora) na empresa de demonstração. O e-mail não pode repetir: se
juliana@pontovisual.local já existir (gravação anterior), usa o próximo livre (juliana.rocha@…, juliana.rocha2@…).
"""
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

NOME = 'Juliana Rocha'
CANDIDATOS = ['juliana@pontovisual.local', 'juliana.rocha@pontovisual.local'] + [f'juliana.rocha{n}@pontovisual.local' for n in range(2, 10)]


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


def email_livre() -> str:
    """Primeiro e-mail da lista que ainda não é usuário da empresa (fora da gravação)."""
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        p = b.new_page(viewport={'width': 1280, 'height': 800})
        p.set_default_timeout(300_000)
        p.goto(URL + '/login')
        p.fill('input[type=email]', EMAIL)
        p.fill('input[type=password]', SENHA)
        p.click('button[type=submit]')
        p.wait_for_url(lambda u: '/login' not in u)
        p.goto(URL + '/configuracoes/usuarios')
        p.get_by_text('demo@pontovisual.local').first.wait_for()
        texto = p.locator('main').inner_text()
        b.close()
    for e in CANDIDATOS:
        if e not in texto:
            return e
    raise SystemExit('Nenhum e-mail livre para a Juliana')


# --so-permissoes: refaz só a captura das permissões (sem criar outra usuária)
if '--so-permissoes' not in sys.argv:
    try:
        NOVO_EMAIL = email_livre()
    except Exception as e:  # servidor ocupado: tente de novo
        print('  não abriu o sistema:', str(e).splitlines()[0])
        raise SystemExit(3)
    print('  e-mail da nova usuária:', NOVO_EMAIL)

    with GravadorPronto('convidar-equipe', rota_inicial='/configuracoes/usuarios') as g:
        pg = g.pg
        pg.get_by_text('demo@pontovisual.local').first.wait_for()
        g.legenda('Em Ajustes, abra "Usuários"', 1)
        link = pg.get_by_role('link', name='Usuários', exact=True)
        g.destacar(link)
        g.mover(link)
        g.pausa(1)
        g.limpar()
        novo = pg.get_by_role('button', name='Novo usuário')
        g.foto(1, novo)

        g.legenda('Toque em "Novo usuário" e preencha o nome e o e-mail', 2)
        g.clicar(novo)
        dialogo = pg.get_by_role('dialog')
        g.aguardar(dialogo.locator('#us-nome').wait_for)
        g.pausa(0.5)
        g.digitar(dialogo.locator('#us-nome'), NOME)
        g.digitar(dialogo.locator('#us-email'), NOVO_EMAIL, atraso=45)
        g.foto(2, dialogo.locator('#us-nome').locator('xpath=ancestor::div[.//input[@id="us-email"]][1]'))

        g.legenda('Escolha o papel: ele define o que a pessoa pode ver e fazer', 3)
        papel = dialogo.locator('#us-papel')
        g.destacar(papel)
        g.mover(papel)
        g.pausa(0.5)
        papel.select_option(label='Vendedor')
        g.pausa(0.8)
        g.digitar(dialogo.locator('#us-telefone'), '11987001122', atraso=50)
        g.digitar(dialogo.locator('#us-comissao'), '3')
        g.limpar()
        g.foto(3, papel.locator('xpath=ancestor::div[contains(@class,"grid")][1]'))

        g.legenda('Toque em "Gerar" para criar uma senha provisória', 4)
        g.clicar(dialogo.get_by_role('button', name='Gerar'))
        g.pausa(0.6)
        g.foto(4, dialogo.locator('#us-senha').locator('xpath=ancestor::div[2]'))

        g.legenda('Salve. Passe o e-mail e a senha para ela', 5)
        g.clicar(dialogo.get_by_role('button', name='Salvar'))
        g.aguardar(lambda: (pg.get_by_text('Usuário criado.', exact=False).first.wait_for(), pg.get_by_text(NOVO_EMAIL).first.wait_for()))
        g.pausa(1.5)
        linha = pg.locator('tr', has_text=NOVO_EMAIL)
        g.foto(5, linha)
        g.legenda('No 1º acesso, ela cria a própria senha', 5, segundos=2)

        g.legenda('Quer ajustar o que cada papel faz? Veja Ajustes → Permissões', 6, segundos=2.4)
        g.destacar(pg.get_by_role('link', name='Permissões', exact=True))
        g.pausa(1.2)
        g.limpar()
        g.legenda(None)
        g.pausa(0.4)

# Permissões: só a captura (fora do vídeo; a tela demora a abrir com o servidor de desenvolvimento ocupado)
with GravadorPronto('convidar-equipe', video=False, rota_inicial='/configuracoes/permissoes') as g:
    pg = g.pg
    aba = pg.get_by_role('tab', name='Vendedor')
    aba.click()
    pg.locator('main table').first.wait_for()
    g.pausa(1)
    g.foto(6, aba)
