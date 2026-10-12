"""Tutorial "Colocar a vitrine (site) no ar" (vídeo + capturas). Uso: python scripts/tutoriais/ligar-vitrine.py

Não muda a configuração da vitrine. Publica um rascunho ("Impressão A4 colorida") para mostrar o interruptor e,
no fim, volta ele para rascunho. No site, só põe um item na lista de orçamento (não envia).
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

LOJA = 'http://pontovisual.localhost:5173'
RASCUNHO = 'Impressão A4 colorida'


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

    def imagens(self):
        """Espera as imagens visíveis do site carregarem (fora do vídeo)."""
        try:
            with self.esperando():
                self.pg.wait_for_function(
                    """() => [...document.images].filter(i => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0 })
                              .every(i => i.complete && i.naturalWidth > 0)""",
                    timeout=90_000,
                )
        except Exception:
            pass
        self.pausa(0.8)


try:
    with GravadorPaciente('ligar-vitrine', rota_inicial='/vitrine') as g:
        pg = g.pg
        interruptor = pg.get_by_role('switch', name='Site no ar')
        g.garantir(interruptor, '/vitrine')
        caixa_no_ar = interruptor.locator('xpath=ancestor::div[contains(@class,"rounded")][1]')

        g.legenda('Menu Vitrine → Configurar vitrine', 1)
        g.legenda('"Site ligado": qualquer pessoa com o endereço vê seus produtos', 1, segundos=2.2)
        g.destacar(caixa_no_ar)
        g.pausa(1)
        g.foto(1, caixa_no_ar)

        endereco = pg.get_by_text('QR code do site', exact=True).locator('xpath=ancestor::div[contains(@class,"overflow-hidden")][1]')
        g.legenda('Aqui está o endereço do site e o QR code para imprimir', 2, segundos=2.2)
        g.destacar(endereco)
        g.pausa(1.2)
        g.foto(2, endereco)

        apresentacao = pg.get_by_text('Apresentação', exact=True).locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
        g.legenda('Escreva o título, o slogan e o "Quem somos"', 3, segundos=1)
        g.destacar(apresentacao)
        g.pausa(1.6)
        g.foto(3, apresentacao)
        contato = pg.get_by_text('Contato exibido', exact=True).locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
        g.legenda('Escolha o contato que aparece: WhatsApp, telefone, endereço', 3, segundos=1)
        g.destacar(contato)
        g.pausa(1.8)
        banners = pg.get_by_text('Banners do topo', exact=True).locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
        g.legenda('Ponha até 3 banners no topo do site', 3, segundos=1)
        g.destacar(banners)
        g.pausa(1.8)
        salvar = pg.get_by_role('button', name='Salvar vitrine')
        g.legenda('Mudou alguma coisa? Toque em "Salvar vitrine"', 3, segundos=1)
        g.destacar(salvar)
        g.mover(salvar)
        g.pausa(1.5)
        g.limpar()

        menu = pg.locator('aside').get_by_role('link', name='Produtos na vitrine', exact=True).first
        g.clicar(menu, 'Agora escolha os produtos: Vitrine → Produtos na vitrine', 4)
        publicar = pg.get_by_role('switch', name=f'Publicar {RASCUNHO}')
        g.garantir(publicar, '/vitrine/produtos')
        g.aguardar()
        g.pausa(0.6)
        linha = pg.locator('tbody tr', has_text=RASCUNHO)
        if publicar.get_attribute('aria-checked') == 'true':  # sobrou publicado de uma gravação anterior: volta (fora do vídeo)
            with g.esperando():
                publicar.click()
                pg.wait_for_function(f"() => document.querySelector('[role=switch][aria-label=\"Publicar {RASCUNHO}\"]')?.getAttribute('aria-checked') === 'false'", timeout=120_000)
                g.aguardar()
        g.clicar(publicar, 'Ligue "Publicado" e o produto aparece no site', 4)
        g.pausa(1)
        g.imagens()  # miniaturas dos produtos
        g.foto(4, linha)

        g.legenda('Toque no produto para ajustar o preço exibido e o destaque', 5, segundos=1)
        banner = pg.get_by_text('PRD-0007', exact=False).filter(visible=True).first
        with g.esperando():
            g.aguardar()
            banner.wait_for(timeout=120_000)
        g.clicar(banner)
        painel = pg.get_by_role('dialog')
        preco = painel.locator('select[id$="-preco"]')
        with g.esperando():
            preco.wait_for()
        g.pausa(0.8)
        destaque = painel.get_by_text('Destaque', exact=True).locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
        g.legenda('"Destaque" coloca o produto no início do site', 5, segundos=1)
        g.destacar(destaque)
        g.pausa(1.6)
        bloco_preco = preco.locator('xpath=ancestor::div[contains(@class,"grid")][1]')
        g.legenda('Preço fixo, "a partir de" ou sob consulta: você escolhe', 5, segundos=1)
        g.destacar(bloco_preco)
        g.pausa(1.8)
        g.foto(5, bloco_preco)
        pg.keyboard.press('Escape')
        g.pausa(0.8)

        g.legenda('Pronto! Veja como o cliente vê o seu site', 6, segundos=1)
        g.ir(LOJA + '/')
        with g.esperando():  # o site mostra esqueletos até os produtos chegarem
            pg.get_by_text('Os mais procurados').wait_for(state='attached', timeout=180_000)
        g.imagens()
        g.legenda('Pronto! Veja como o cliente vê o seu site', 6, segundos=2)
        g.foto(6)
        pg.mouse.move(640, 500)
        pg.mouse.wheel(0, 900)
        g.pausa(1.2)
        g.imagens()
        g.pausa(1)

        g.legenda('O cliente abre o produto, informa medidas e quantidade', 7, segundos=1)
        g.ir(LOJA + '/produto/banner-em-lona')
        with g.esperando():
            pg.locator('#largura').wait_for(timeout=180_000)
        g.imagens()
        g.legenda('O cliente abre o produto, informa medidas e quantidade', 7, segundos=1)
        g.digitar(pg.locator('#largura'), '3')
        g.digitar(pg.locator('#altura'), '1')
        adicionar = pg.get_by_role('button', name='Adicionar à lista de orçamento')
        g.clicar(adicionar, 'E põe na "Lista de orçamento". Ela chega para você', 7)
        with g.esperando():
            pg.get_by_text('Adicionado à sua lista de orçamento!').wait_for()
        g.pausa(1)
        g.foto(7, pg.get_by_text('Adicionado à sua lista de orçamento!').locator('xpath=..'))
        g.pausa(1)
        g.legenda(None)
        g.pausa(0.3)
finally:
    # Volta o produto para rascunho (fora do vídeo)
    with GravadorPaciente('ligar-vitrine', video=False, rota_inicial='/vitrine/produtos') as g:
        sw = g.pg.get_by_role('switch', name=f'Publicar {RASCUNHO}')
        for tentativa in range(4):  # confere recarregando a tela: o clique só vale se o servidor gravou
            g.garantir(sw, '/vitrine/produtos')
            g.aguardar()
            if sw.get_attribute('aria-checked') != 'true':
                break
            sw.click()
            g.pausa(5)
            g.ir('/vitrine/produtos', espera=0)
        print('  rascunho restaurado:', sw.get_attribute('aria-checked'))
