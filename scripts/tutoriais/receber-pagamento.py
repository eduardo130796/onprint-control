"""Tutorial "Receber um pagamento (dar baixa)" (vídeo + capturas). Uso: python scripts/tutoriais/receber-pagamento.py

Dá baixa de verdade na primeira conta a receber em aberto (a mais antiga) da empresa de demonstração.
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


def cartao(pg, rotulo: str):
    return pg.get_by_text(rotulo, exact=True).locator('xpath=ancestor::div[contains(@class,"rounded")][1]')


with GravadorPaciente('receber-pagamento', rota_inicial='/financeiro/receber') as g:
    pg = g.pg
    linhas = pg.locator('tbody tr')
    # A situação aparece com o nome certo ("Em aberto", "Vencido") quando os status terminam de carregar;
    # se a consulta falhar (servidor lento), recarrega a tela
    for tentativa in range(4):
        try:
            with g.esperando():
                linhas.first.wait_for(timeout=180_000)
                pg.locator('tbody').get_by_text(re.compile('^(Em aberto|Vencido)$')).first.wait_for(timeout=90_000)
            break
        except Exception:
            if tentativa == 3:
                raise
            g.ir('/financeiro/receber')
    indicadores = cartao(pg, 'A receber').locator('xpath=..')

    g.legenda('Financeiro → Contas a receber: tudo o que os clientes devem', 1, segundos=1)
    g.destacar(indicadores)
    g.pausa(1.6)
    g.foto(1, indicadores)

    # A conta mais antiga em aberto; busca pelo número do pedido (ou pela descrição)
    descricao = linhas.first.locator('td').nth(1).locator('p').first.inner_text()
    termo = descricao.split(' · ')[0]
    g.legenda('Procure pelo cliente, pedido ou descrição', 2)
    g.digitar(pg.get_by_placeholder('Descrição, cliente ou pedido…'), termo)
    with g.esperando():
        pg.wait_for_function('(n) => document.querySelectorAll("tbody tr").length === n', arg=1, timeout=60_000)
    g.pausa(1)
    g.clicar(linhas.first, 'Toque na conta para abrir', 2)
    receber = pg.get_by_role('button', name='Receber', exact=True)
    with g.esperando():
        receber.wait_for()
    g.pausa(0.8)
    g.foto(2, receber)

    g.clicar(receber, 'Toque em "Receber"', 3)
    with g.esperando():
        pg.locator('#bx-forma option', has_text='PIX').wait_for(state='attached')
    g.pausa(0.6)
    g.legenda('O valor já vem preenchido. Recebeu só uma parte? É só mudar', 3, segundos=1.2)
    g.destacar(pg.locator('#bx-valor'))
    g.pausa(1.6)
    g.legenda('Escolha a forma de pagamento', 4)
    forma = pg.locator('#bx-forma')
    g.destacar(forma)
    g.mover(forma)
    g.pausa(0.6)
    pg.select_option('#bx-forma', label='PIX')
    g.pausa(1)
    g.foto(3, forma.locator('xpath=ancestor::div[contains(@class,"grid")][1]'))

    g.legenda('Confira o resumo e toque em "Confirmar baixa"', 5)
    g.destacar(pg.get_by_text('do título e quita a conta', exact=False))
    g.pausa(1.5)
    confirmar = pg.get_by_role('button', name='Confirmar baixa')
    g.clicar(confirmar)
    with g.esperando():
        # Com o servidor lento, a baixa às vezes estoura o tempo e volta erro: tenta de novo (fora do vídeo)
        for tentativa in range(4):
            pg.wait_for_function(
                "() => !document.querySelector('#bx-valor') || document.querySelector('[data-sonner-toast][data-type=error]')", timeout=240_000
            )
            if pg.locator('#bx-valor').count() == 0:
                break
            pg.evaluate("() => document.querySelectorAll('[data-sonner-toast][data-type=error]').forEach((t) => t.remove())")
            if tentativa == 3:
                raise RuntimeError('A baixa não foi registrada (erro do servidor).')
            g.pausa(2)
            confirmar.click()
        pg.get_by_text('Nenhum pagamento registrado.').wait_for(state='detached', timeout=180_000)
        pg.evaluate("() => document.querySelectorAll('[data-sonner-toast][data-type=error]').forEach((t) => t.remove())")
    g.pausa(1)
    g.legenda('Pronto! A conta fica paga e o recebimento aparece aqui', 5, segundos=1.8)
    pagamentos = pg.get_by_role('dialog').get_by_text('Pagamentos', exact=True).locator('xpath=..')
    g.foto(4, pagamentos)
    pg.keyboard.press('Escape')
    g.pausa(0.8)

    menu = pg.locator('aside, nav').get_by_role('link', name='Fluxo de caixa', exact=True).first
    g.clicar(menu, 'No Fluxo de caixa você vê o que entrou e o que vai entrar', 6)
    g.aguardar()
    fluxo = cartao(pg, 'Saldo inicial').locator('xpath=..')
    g.pausa(0.6)
    g.destacar(fluxo)
    g.pausa(1.6)
    g.foto(5, fluxo)
    pg.mouse.move(900, 600, steps=10)
    pg.mouse.wheel(0, 380)
    g.pausa(1.8)

    menu = pg.locator('aside, nav').get_by_role('link', name='Contas a pagar', exact=True).first
    g.clicar(menu, 'As despesas ficam em Contas a pagar: o pagamento é igual', 7)
    g.aguardar()
    with g.esperando():
        pg.locator('tbody tr').first.wait_for(timeout=180_000)
    g.pausa(1.5)
    g.foto(6, pg.locator('tbody tr').first)
    g.pausa(1)
    g.legenda(None)
    g.pausa(0.5)
