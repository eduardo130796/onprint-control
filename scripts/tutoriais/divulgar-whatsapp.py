"""Tutorial "Divulgar no WhatsApp (imagem, mensagem e catálogo em PDF)" (vídeo + capturas).
Uso: python scripts/tutoriais/divulgar-whatsapp.py

Não abre o WhatsApp: para na mensagem pronta. Gera um catálogo em PDF (fica guardado para o link do catálogo).
"""
import datetime
import os
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from gravador import ALTURA, EMAIL, LARGURA, SENHA, SOBREPOSICAO, URL, Gravador  # noqa: E402
from playwright import sync_api  # noqa: E402


class GravadorPaciente(Gravador):
    """Gravador com mais paciência: o servidor de desenvolvimento às vezes demora para abrir as telas.
    As esperas de carregamento são marcadas e cortadas do vídeo no fim (fica só o começo de cada uma)."""

    PRONTO = "() => document.querySelector('main h1') && !document.querySelector('[class*=\"animate-spin\"], [class*=\"animate-pulse\"]')"
    IMAGENS = "() => [...document.images].filter(i => i.getBoundingClientRect().top < innerHeight && i.loading !== 'lazy').every(i => i.complete)"

    def __enter__(self):
        # Igual ao Gravador, mas com login e primeira tela tolerantes à demora do servidor
        self.cortes: list[tuple[float, float]] = []
        self.saida.mkdir(parents=True, exist_ok=True)
        self._pw = sync_api.sync_playwright().start()
        self._browser = self._pw.chromium.launch()
        hoje = datetime.date.today()
        relogio = datetime.datetime(hoje.year, hoje.month, hoje.day, 13, 0, tzinfo=datetime.timezone.utc)  # 10h em Brasília
        base = dict(viewport={'width': LARGURA, 'height': ALTURA}, timezone_id='America/Sao_Paulo', locale='pt-BR')
        estado = self._entrar(base)
        extra = {'record_video_dir': str(self.tmp), 'record_video_size': {'width': LARGURA, 'height': ALTURA}} if self.video else {}
        self._ctx = self._browser.new_context(**base, device_scale_factor=1.5, storage_state=estado, **extra)
        self._t0 = time.monotonic()
        self._ctx.add_init_script(SOBREPOSICAO)
        self.pg = self._ctx.new_page()
        self.pg.set_default_timeout(120_000)
        self.pg.clock.set_fixed_time(relogio)
        self.ir(self.rota_inicial)
        self._corte = max(0.0, time.monotonic() - self._t0 - 0.4)
        return self

    def _entrar(self, base: dict):
        for tentativa in range(3):
            login = self._browser.new_context(**base)
            try:
                p = login.new_page()
                p.set_default_timeout(300_000)
                p.goto(URL + '/login', wait_until='commit')
                p.fill('input[type=email]', EMAIL)
                p.fill('input[type=password]', SENHA)
                p.click('button[type=submit]')
                p.wait_for_url(lambda u: '/login' not in u)
                return login.storage_state()
            except Exception:
                if tentativa == 2:
                    raise
            finally:
                login.close()

    def _na_tela_de_login(self) -> bool:
        """Se a sessão caiu (o servidor encerra as sessões do usuário quando um refresh chega atrasado), entra de novo."""
        self.pg.wait_for_function("() => document.querySelector('main h1, input[type=password]')", timeout=240_000)
        if '/login' not in self.pg.url:
            return False
        self.pg.fill('input[type=email]', EMAIL)
        self.pg.fill('input[type=password]', SENHA)
        self.pg.click('button[type=submit]')
        self.pg.wait_for_url(lambda u: '/login' not in u, timeout=240_000)
        return True

    def agora(self) -> float:
        return time.monotonic() - self._t0 - getattr(self, '_corte', 0.0)

    @contextmanager
    def esperando(self, manter: float = 0.3):
        """Trecho de espera (carregamento): sai do vídeo, menos os primeiros `manter` segundos."""
        inicio = self.agora()
        yield
        fim = self.agora()
        if hasattr(self, '_corte') and fim - inicio > manter + 0.2:
            self.cortes.append((inicio + manter, fim))

    def logo(self):
        """Espera (sem travar) as imagens visíveis, como a logo do topo."""
        try:
            self.pg.wait_for_function(self.IMAGENS, timeout=30_000)
        except Exception:
            pass

    def aguardar(self, condicao: str = PRONTO, timeout: int = 240_000):
        with self.esperando():
            self.pg.wait_for_function(condicao, timeout=timeout)
            self.logo()

    def garantir(self, alvo, rota: str, tentativas: int = 4):
        """Espera `alvo` aparecer; se os dados não chegam (servidor lento), recarrega a tela. Tudo fora do vídeo."""
        with self.esperando():
            for tentativa in range(tentativas):
                try:
                    alvo.wait_for(timeout=120_000)
                    return
                except Exception:
                    if tentativa == tentativas - 1:
                        raise
                    self.ir(rota, espera=0)

    def ir(self, rota: str, espera: float = 1.2):
        site = rota.startswith('http')
        # o site da vitrine usa esqueletos nas fotos: lá, espera só o conteúdo
        carregou = "() => !!document.querySelector('main, h1')" if site else self.PRONTO
        with self.esperando():
            for tentativa in range(5):
                try:
                    self.pg.goto(rota if site else URL + rota, timeout=240_000, wait_until='commit')
                    if not site and self._na_tela_de_login():
                        continue
                    self.pg.wait_for_function(carregou, timeout=240_000)
                    self.logo()
                    break
                except Exception:
                    if tentativa == 4:
                        raise
        self.pausa(espera)

    def __exit__(self, tipo, erro, tb):
        if erro is not None:  # captura da tela no momento do erro, para investigar
            try:
                self.pg.screenshot(path=str(Path(tempfile.gettempdir()) / f'erro-{self.slug}.png'))
            except Exception:
                pass
        r = super().__exit__(tipo, erro, tb)
        mp4 = self.saida / 'video.mp4'
        if erro is None and self.video and self.cortes and mp4.exists():
            fora = '+'.join(f'between(t,{a:.2f},{b:.2f})' for a, b in self.cortes)
            cmd = [
                'docker', 'run', '--rm', '-v', f'{self.saida}:/v', 'linuxserver/ffmpeg:latest', '-y', '-loglevel', 'error',
                '-i', '/v/video.mp4', '-vf', f"select='not({fora})',setpts=N/FRAME_RATE/TB",
                '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', '/v/video-cortado.mp4',
            ]
            subprocess.run(cmd, check=True, env={**os.environ, 'MSYS_NO_PATHCONV': '1'})
            (self.saida / 'video-cortado.mp4').replace(mp4)
            total = sum(b - a for a, b in self.cortes)
            print(f'  cortes: {len(self.cortes)} esperas ({total:.0f}s) → vídeo final {mp4.stat().st_size // 1024} KB, {self._duracao(mp4)}s')
        return r


with GravadorPaciente('divulgar-whatsapp', rota_inicial='/vitrine/produtos') as g:
    pg = g.pg
    compartilhar = pg.get_by_role('button', name='Compartilhar Banner em lona')
    g.garantir(compartilhar, '/vitrine/produtos')

    g.legenda('Vitrine → Produtos na vitrine: toque no ícone de compartilhar', 1, segundos=1.6)
    g.clicar(compartilhar)
    dialogo = pg.get_by_role('dialog')
    abas = dialogo.get_by_role('tablist', name='Formato da imagem')
    previa = abas.locator('xpath=..')
    criando = dialogo.get_by_text('Criando a imagem', exact=False)
    with g.esperando():
        abas.wait_for()
        criando.wait_for(state='detached', timeout=240_000)
        try:  # espera a arte do produto ficar pronta
            pg.wait_for_function("() => [...document.querySelectorAll('[role=dialog] img')].every(i => i.complete && i.naturalWidth > 0)", timeout=60_000)
        except Exception:
            pass
    g.pausa(1)
    g.legenda('A arte do produto sai pronta, com preço e o seu contato', 1, segundos=2)
    g.foto(1, previa)

    g.clicar(dialogo.get_by_role('tab', name='Post'), 'Escolha Status (em pé) ou Post (quadrado)', 2)
    with g.esperando():
        criando.wait_for(state='detached', timeout=240_000)
        try:
            pg.wait_for_function("() => [...document.querySelectorAll('[role=dialog] img')].every(i => i.complete && i.naturalWidth > 0)", timeout=60_000)
        except Exception:
            pass
    g.pausa(1)
    botoes = dialogo.get_by_role('button', name='Baixar PNG').locator('xpath=..')
    g.legenda('Baixe a imagem ou toque em "Compartilhar" para postar', 2, segundos=1.2)
    g.destacar(botoes)
    g.pausa(1.4)
    g.foto(2, previa)

    mensagem = dialogo.locator('#comp-msg')
    g.legenda('A mensagem já vem pronta, com o link do produto', 3, segundos=1)
    g.destacar(mensagem.locator('xpath=ancestor::div[2]'))
    g.pausa(2)
    envio = dialogo.get_by_text('Enviar no WhatsApp', exact=True).locator('xpath=..')
    g.clicar(dialogo.get_by_role('radio', name='Qualquer contato'), 'Escolha um cliente ou qualquer contato', 3)
    g.destacar(envio)
    g.legenda('"Abrir o WhatsApp" abre a conversa com o texto pronto', 3, segundos=2)
    g.foto(3, envio)
    pg.keyboard.press('Escape')
    g.pausa(0.8)

    abrir_catalogo = pg.get_by_role('button', name='Catálogo em PDF')
    g.clicar(abrir_catalogo, 'Quer mandar vários? Use o "Catálogo em PDF"', 4)
    gerar = pg.get_by_role('button', name='Gerar catálogo')
    with g.esperando():
        for tentativa in range(4):  # se os dados não chegam (servidor lento), fecha e abre de novo (fora do vídeo)
            try:
                gerar.wait_for(timeout=90_000)
                break
            except Exception:
                if tentativa == 3:
                    raise
                pg.keyboard.press('Escape')
                g.pausa(1.5)
                abrir_catalogo.click()
    g.pausa(1)
    g.clicar(pg.get_by_role('button', name='Só destaques'), 'Escolha os produtos (ou só os destaques)', 4)
    g.legenda('Dê um título para a capa', 4, segundos=0.8)
    g.digitar(pg.locator('#cat-rotulo'), 'Os mais pedidos')
    g.foto(4, pg.get_by_role('dialog'))

    g.clicar(gerar, 'Toque em "Gerar catálogo" e espere uns segundos', 5)
    baixar = pg.get_by_role('button', name='Baixar PDF')
    with g.esperando(manter=1.5):
        baixar.wait_for(timeout=180_000)
    g.pausa(1)
    lado = baixar.locator('xpath=..')
    g.legenda('Pronto! Baixe o PDF ou copie o link do catálogo', 5, segundos=1.2)
    g.destacar(lado)
    g.pausa(1.6)
    g.foto(5, lado)
    msg = pg.locator('#catalogo-msg')
    g.legenda('Ou mande pelo WhatsApp: o cliente abre o catálogo no celular', 5, segundos=1)
    g.destacar(msg.locator('xpath=ancestor::div[2]'))
    g.pausa(2)
    g.limpar()
    pg.keyboard.press('Escape')
    g.pausa(0.8)

    menu = pg.locator('aside').get_by_role('link', name='Pedidos do site', exact=True).first
    g.clicar(menu, 'Os pedidos que chegam do site ficam em Vitrine → Pedidos do site', 6)
    with g.esperando():
        pg.wait_for_url('**/orcamentos/solicitacoes**', timeout=120_000)
    g.garantir(pg.locator('tbody tr').first, '/orcamentos/solicitacoes?origem=site')
    g.aguardar()
    g.pausa(1.2)
    primeiro = pg.locator('tbody tr').first
    g.destacar(primeiro)
    g.pausa(1)
    criar = primeiro.get_by_role('button', name='Criar orçamento')
    g.legenda('Daqui você cria o orçamento com um toque', 6, segundos=1)
    g.destacar(criar)
    g.mover(criar)
    g.pausa(1.5)
    g.foto(6, primeiro)
    g.legenda(None)
    g.pausa(0.5)
