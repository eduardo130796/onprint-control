"""
Gravador dos tutoriais da central de ajuda (vídeo + capturas de cada passo), na empresa de demonstração.

Uso (no computador, com Python + Playwright e o Docker rodando o sistema em http://localhost:5173):
    python scripts/tutoriais/fazer-orcamento.py

Cada script de tutorial usa o Gravador:
    with Gravador('fazer-orcamento') as g:
        g.ir('/orcamentos/novo')
        g.legenda('Escolha o cliente', passo=1)
        g.clicar(g.pg.get_by_label('Cliente'))
        g.foto(1)

Saída em apps/web/public/ajuda/{slug}/: 1.webp, 2.webp… (capturas), video.mp4 e capa.webp.
O vídeo é convertido para MP4 (H.264) pela imagem Docker linuxserver/ffmpeg.
"""
from __future__ import annotations

import datetime
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from PIL import Image
from playwright.sync_api import Locator, Page, sync_playwright

RAIZ = Path(__file__).resolve().parents[2]
PUBLICO = RAIZ / 'apps' / 'web' / 'public' / 'ajuda'
URL = os.environ.get('TUTORIAL_URL', 'http://localhost:5173')
EMAIL = os.environ.get('TUTORIAL_EMAIL', 'demo@pontovisual.local')
SENHA = os.environ.get('TUTORIAL_SENHA', 'Demo12345')
LARGURA, ALTURA = 1280, 800

# Legenda, cursor e destaque desenhados por cima da página (só na gravação)
SOBREPOSICAO = """
(() => {
  if (window.__tut) return
  let pronto = null
  // Cria a camada no primeiro uso (o script roda antes de a página existir)
  function montar() {
    if (pronto) return pronto
    const raiz = document.body || document.documentElement
    const css = document.createElement('style')
    css.textContent = `
      #tut-legenda{position:fixed;pointer-events:none;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483646;display:none;align-items:center;gap:14px;
        max-width:min(980px,90vw);padding:14px 22px 14px 14px;border-radius:999px;background:rgba(2,26,64,.94);color:#fff;
        font:600 19px/1.3 'Inter Variable',system-ui,sans-serif;box-shadow:0 16px 40px -12px rgba(2,26,64,.55)}
      #tut-legenda b{display:flex;align-items:center;justify-content:center;min-width:34px;height:34px;border-radius:999px;background:#0265DC;font-size:16px}
      #tut-cursor{position:fixed;z-index:2147483647;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:999px;pointer-events:none;
        background:rgba(2,101,220,.35);border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.35);transition:transform .12s;left:-50px;top:-50px}
      #tut-cursor.clique{transform:scale(.7);background:rgba(249,115,22,.6)}
      #tut-destaque{position:fixed;z-index:2147483645;pointer-events:none;border:3px solid #F97316;border-radius:12px;display:none;
        box-shadow:0 0 0 6px rgba(249,115,22,.22);transition:all .25s ease}
    `
    raiz.appendChild(css)
    const el = (id) => { const d = document.createElement('div'); d.id = id; raiz.appendChild(d); return d }
    pronto = { legenda: el('tut-legenda'), cursor: el('tut-cursor'), destaque: el('tut-destaque') }
    return pronto
  }
  addEventListener('mousemove', (e) => { const c = montar().cursor; c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px' }, true)
  addEventListener('mousedown', () => montar().cursor.classList.add('clique'), true)
  addEventListener('mouseup', () => montar().cursor.classList.remove('clique'), true)
  window.__tut = {
    legenda(texto, passo) {
      const { legenda } = montar()
      if (!texto) { legenda.style.display = 'none'; return }
      legenda.innerHTML = (passo ? '<b>' + passo + '</b>' : '') + '<span></span>'
      legenda.querySelector('span').textContent = texto
      legenda.style.display = 'flex'
    },
    destacar(x, y, w, h) { Object.assign(montar().destaque.style, { display: 'block', left: (x - 6) + 'px', top: (y - 6) + 'px', width: (w + 12) + 'px', height: (h + 12) + 'px' }) },
    limpar() { montar().destaque.style.display = 'none' },
    esconder(sim) { const m = montar(); for (const d of [m.legenda, m.cursor]) d.style.visibility = sim ? 'hidden' : 'visible' },
  }
})()
"""


class Gravador:
    def __init__(self, slug: str, *, video: bool = True, rota_inicial: str = '/'):
        self.slug = slug
        self.video = video
        self.rota_inicial = rota_inicial
        self.saida = PUBLICO / slug
        self.tmp = Path(tempfile.mkdtemp(prefix=f'tut-{slug}-'))
        self.fotos: list[Path] = []
        self.pg: Page

    # ─── ciclo de vida ──────────────────────────────────────────────────────
    def __enter__(self) -> 'Gravador':
        self.saida.mkdir(parents=True, exist_ok=True)
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch()
        hoje = datetime.date.today()
        relogio = datetime.datetime(hoje.year, hoje.month, hoje.day, 13, 0, tzinfo=datetime.timezone.utc)  # 10h em Brasília
        base = dict(viewport={'width': LARGURA, 'height': ALTURA}, timezone_id='America/Sao_Paulo', locale='pt-BR')
        # Login fora da gravação; a sessão vai para o contexto gravado
        login = self._browser.new_context(**base)
        p = login.new_page()
        p.goto(URL + '/login')
        p.fill('input[type=email]', EMAIL)
        p.fill('input[type=password]', SENHA)
        p.click('button[type=submit]')
        p.wait_for_url(lambda u: '/login' not in u, timeout=120_000)
        estado = login.storage_state()
        login.close()
        extra = {'record_video_dir': str(self.tmp), 'record_video_size': {'width': LARGURA, 'height': ALTURA}} if self.video else {}
        self._ctx = self._browser.new_context(**base, device_scale_factor=1.5, storage_state=estado, **extra)
        self._t0 = time.monotonic()  # a gravação começa junto com o contexto
        self._ctx.add_init_script(SOBREPOSICAO)
        self.pg = self._ctx.new_page()
        self.pg.set_default_timeout(60_000)
        self.pg.clock.set_fixed_time(relogio)
        self.ir(self.rota_inicial)
        # Tudo antes daqui (abrir e carregar a primeira tela) é cortado do vídeo
        self._corte = max(0.0, time.monotonic() - self._t0 - 0.4)
        return self

    def __exit__(self, tipo, erro, tb):
        caminho_video = None
        if self.video and self.pg.video:
            caminho_video = self.pg.video.path()
        self._ctx.close()
        self._browser.close()
        self._pw.stop()
        if erro is None and caminho_video:
            self._converter(Path(caminho_video))
        shutil.rmtree(self.tmp, ignore_errors=True)
        return False

    # ─── ações ──────────────────────────────────────────────────────────────
    def pausa(self, segundos: float = 0.8):
        self.pg.wait_for_timeout(int(segundos * 1000))

    def ir(self, rota: str, espera: float = 1.2):
        self.pg.goto(URL + rota)
        self.pg.wait_for_load_state('networkidle')
        # Telas com esqueleto de carregamento: espera os dados aparecerem
        try:
            self.pg.locator('[class*="animate-pulse"]').first.wait_for(state='detached', timeout=45_000)
        except Exception:
            pass
        self.pausa(espera)

    def legenda(self, texto: str | None, passo: int | None = None, segundos: float = 1.4):
        self.pg.evaluate('([t, p]) => window.__tut && window.__tut.legenda(t, p)', [texto, passo])
        if texto:
            self.pausa(segundos)

    def destacar(self, alvo: Locator):
        alvo.scroll_into_view_if_needed()
        caixa = alvo.bounding_box()
        if caixa:
            self.pg.evaluate('([x,y,w,h]) => window.__tut.destacar(x,y,w,h)', [caixa['x'], caixa['y'], caixa['width'], caixa['height']])

    def limpar(self):
        self.pg.evaluate('() => window.__tut && window.__tut.limpar()')

    def mover(self, alvo: Locator):
        alvo.scroll_into_view_if_needed()
        caixa = alvo.bounding_box()
        if caixa:
            self.pg.mouse.move(caixa['x'] + caixa['width'] / 2, caixa['y'] + caixa['height'] / 2, steps=22)

    def clicar(self, alvo: Locator, legenda: str | None = None, passo: int | None = None, destacar: bool = True):
        if legenda:
            self.legenda(legenda, passo)
        if destacar:
            self.destacar(alvo)
        self.mover(alvo)
        self.pausa(0.5)
        alvo.click()
        self.limpar()
        self.pausa(0.9)

    def digitar(self, alvo: Locator, texto: str, atraso: int = 70):
        self.mover(alvo)
        alvo.click()
        alvo.fill('')
        alvo.press_sequentially(texto, delay=atraso)
        self.pausa(0.5)

    def foto(self, n: int, alvo: Locator | None = None):
        """Captura do passo n (sem legenda e sem cursor; com o destaque, se houver alvo)."""
        if alvo is not None:
            self.destacar(alvo)
        self.pg.evaluate('() => window.__tut && window.__tut.esconder(true)')
        png = self.tmp / f'{n}.png'
        self.pg.screenshot(path=str(png))
        self.pg.evaluate('() => window.__tut && window.__tut.esconder(false)')
        if alvo is not None:
            self.limpar()
        destino = self.saida / f'{n}.webp'
        im = Image.open(png).convert('RGB')
        im.thumbnail((1600, 1000), Image.LANCZOS)
        im.save(destino, 'WEBP', quality=80, method=6)
        self.fotos.append(destino)
        print(f'  foto {n}: {destino.relative_to(RAIZ)} ({destino.stat().st_size // 1024} KB)')

    # ─── vídeo ──────────────────────────────────────────────────────────────
    def _converter(self, webm: Path):
        mp4 = self.saida / 'video.mp4'
        # Volume com o tmp (onde está o .webm) e a saída; caminhos no formato do Docker Desktop
        cmd = [
            'docker', 'run', '--rm', '-v', f'{webm.parent}:/entrada', '-v', f'{self.saida}:/saida',
            'linuxserver/ffmpeg:latest', '-y', '-loglevel', 'error', '-ss', f'{self._corte:.2f}', '-i', f'/entrada/{webm.name}',
            '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', '/saida/video.mp4',
        ]
        subprocess.run(cmd, check=True, env={**os.environ, 'MSYS_NO_PATHCONV': '1'})
        # Capa: a primeira captura do tutorial (ou um quadro do vídeo)
        capa = self.saida / 'capa.webp'
        if self.fotos:
            im = Image.open(self.fotos[0])
            im.thumbnail((960, 600), Image.LANCZOS)
            im.save(capa, 'WEBP', quality=78, method=6)
        segundos = self._duracao(mp4)
        print(f'  vídeo: {mp4.relative_to(RAIZ)} ({mp4.stat().st_size // 1024} KB, {segundos}s)')

    def _duracao(self, mp4: Path) -> int:
        r = subprocess.run(
            ['docker', 'run', '--rm', '-v', f'{mp4.parent}:/v', '--entrypoint', 'ffprobe', 'linuxserver/ffmpeg:latest', '-v', 'error',
             '-show_entries', 'format=duration', '-of', 'csv=p=0', f'/v/{mp4.name}'],
            capture_output=True, text=True, env={**os.environ, 'MSYS_NO_PATHCONV': '1'},
        )
        try:
            return round(float(r.stdout.strip()))
        except ValueError:
            return 0


def esperar(segundos: float):
    time.sleep(segundos)
