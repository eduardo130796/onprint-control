"""Tutorial "Vender no balcão (PDV)" (vídeo + capturas). Uso: python scripts/tutoriais/venda-balcao.py

Precisa do caixa aberto na empresa de demonstração. Faz uma venda de verdade (2 canecas + 1 plastificação, em dinheiro).
"""
import datetime
import os
import re
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


with GravadorPaciente('venda-balcao', rota_inicial='/caixa') as g:
    pg = g.pg
    busca = pg.get_by_label('Buscar produto')
    with g.esperando():
        busca.wait_for(timeout=180_000)
        pg.get_by_role('button', name='Fechar caixa').wait_for()
        pg.get_by_role('button', name='Dinheiro', exact=True).wait_for()
        pg.get_by_role('button', name='Cópia A4 preto e branco').wait_for(timeout=240_000)
    cabecalho = pg.get_by_role('heading', name='Venda balcão (PDV)').locator('xpath=ancestor::div[2]')

    g.legenda('Financeiro → Venda balcão: o caixa precisa estar aberto', 1, segundos=1.8)
    g.destacar(cabecalho)
    g.pausa(1.2)
    g.foto(1, cabecalho)

    g.legenda('Busque o produto pelo nome ou código', 2)
    g.digitar(busca, 'caneca')
    caneca = pg.get_by_role('button', name='Caneca personalizada')
    with g.esperando():
        for tentativa in range(4):  # a busca às vezes não volta (servidor lento): digita de novo
            try:
                pg.get_by_role('button', name='Cópia A4 preto e branco').wait_for(state='detached', timeout=90_000)
                caneca.first.wait_for(timeout=90_000)
                break
            except Exception:
                if tentativa == 3:
                    raise
                busca.fill('')
                g.pausa(1)
                busca.fill('caneca')
    g.pausa(0.8)
    g.clicar(caneca.first, 'Toque no produto para pôr na venda', 2)
    venda = pg.get_by_role('heading', name='Venda', exact=True).locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
    g.foto(2, caneca.first)

    g.legenda('Mais de um? Use o + para mudar a quantidade', 3)
    g.clicar(pg.get_by_role('button', name='Mais', exact=True).first, destacar=True)
    g.legenda('Adicione outros produtos do mesmo jeito', 3)
    g.digitar(busca, 'plastif')
    plast = pg.get_by_role('button', name='Plastificação A4')
    with g.esperando():
        for tentativa in range(4):
            try:
                caneca.first.wait_for(state='detached', timeout=90_000)
                plast.first.wait_for(timeout=90_000)
                break
            except Exception:
                if tentativa == 3:
                    raise
                busca.fill('')
                g.pausa(1)
                busca.fill('plastif')
    g.pausa(0.6)
    g.clicar(plast.first)
    lista = venda.locator('ul').first
    g.destacar(lista)
    g.pausa(1.2)
    g.foto(3, lista)

    g.legenda('Escolha a forma de pagamento', 4)
    g.clicar(pg.get_by_role('button', name='Dinheiro', exact=True))
    g.legenda('Em dinheiro, digite quanto o cliente deu: o troco aparece', 4, segundos=1)
    valor = pg.get_by_label('Valor do pagamento').first
    g.digitar(valor, '10000')  # o campo é em centavos: 10000 = R$ 100,00
    g.pausa(1.2)
    g.foto(4, venda.get_by_text('Troco:', exact=False))

    g.legenda('Toque em "Finalizar venda"', 5)
    finalizar = pg.get_by_role('button', name='Finalizar venda')
    g.clicar(finalizar)
    with g.esperando():
        # Com o servidor lento, a venda às vezes estoura o tempo e volta erro: tenta de novo (fora do vídeo)
        for tentativa in range(4):
            pg.wait_for_function(
                "() => document.querySelector('[data-sonner-toast][data-type=success]') || document.querySelector('[data-sonner-toast][data-type=error]')",
                timeout=240_000,
            )
            if pg.locator('[data-sonner-toast][data-type=success]').count():
                break
            pg.evaluate("() => document.querySelectorAll('[data-sonner-toast][data-type=error]').forEach((t) => t.remove())")
            if tentativa == 3:
                raise RuntimeError('A venda não foi registrada (erro do servidor).')
            g.pausa(2)
            finalizar.click()
        # espera a lista "Vendas deste caixa" mostrar a venda nova (número do aviso)
        numero = re.search(r'PDV-\d{4}-\d+', pg.locator('[data-sonner-toast][data-type=success]').first.inner_text()).group(0)
        pg.get_by_text(numero, exact=True).first.wait_for(timeout=240_000)
        pg.wait_for_function("() => !document.querySelector('main [class*=\"animate-spin\"]')", timeout=240_000)
    g.pausa(1.2)
    g.legenda('Venda registrada! Ela entra no caixa e no financeiro', 5, segundos=2)
    ultimas = pg.get_by_role('heading', name='Vendas deste caixa').locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
    g.foto(5, ultimas)

    g.legenda('Tirou dinheiro da gaveta? Registre uma Sangria', 6)
    g.clicar(pg.get_by_role('button', name='Sangria'))
    with g.esperando():
        pg.locator('#sg-valor').wait_for()
    g.pausa(1)
    g.foto(6, pg.get_by_role('dialog'))
    g.pausa(0.8)
    pg.keyboard.press('Escape')
    g.pausa(0.8)

    g.legenda('No fim do dia, "Fechar caixa" confere o que entrou', 7, segundos=1)
    fechar = pg.get_by_role('button', name='Fechar caixa')
    g.destacar(fechar)
    g.mover(fechar)
    g.pausa(2.5)
    g.limpar()
    g.legenda(None)
    g.pausa(0.5)
