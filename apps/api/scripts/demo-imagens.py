# Gera as imagens da empresa de demonstração (produtos da vitrine, banners, logo e provas de arte).
# Roda no computador (fora do Docker), com Python + Playwright: o container da API não tem fontes para escrever texto.
# Uso: python apps/api/scripts/demo-imagens.py <pasta-de-saída>
# Depois copie a pasta para o container e passe-a ao demo-dados.mjs (veja o cabeçalho de lá).
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

SAIDA = Path(sys.argv[1] if len(sys.argv) > 1 else 'demo-imagens')
SAIDA.mkdir(parents=True, exist_ok=True)
FONTE = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"


def fundo(c1, c2, w, h):
    return f'''<defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient>
      <filter id="sombra" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#0f172a" flood-opacity=".28"/></filter>
      <filter id="sombra2" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#0f172a" flood-opacity=".25"/></filter>
      <pattern id="pontos" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="4" fill="#0f172a" opacity=".55"/></pattern>
    </defs>
    <rect width="{w}" height="{h}" fill="url(#bg)"/>
    <circle cx="{w*0.85}" cy="{h*0.12}" r="{min(w,h)*0.32}" fill="#fff" opacity=".10"/>
    <circle cx="{w*0.08}" cy="{h*0.92}" r="{min(w,h)*0.25}" fill="#fff" opacity=".08"/>'''


S = 1000  # produtos: quadrados

PRODUTOS = {
    'banner-lona': fundo('#e0f2fe', '#bae6fd', S, S) + f'''
      <line x1="230" y1="120" x2="300" y2="215" stroke="#475569" stroke-width="4"/><line x1="770" y1="120" x2="700" y2="215" stroke="#475569" stroke-width="4"/>
      <g filter="url(#sombra)"><rect x="170" y="200" width="660" height="560" rx="6" fill="#fff"/></g>
      <rect x="170" y="200" width="660" height="560" rx="6" fill="#f97316"/>
      <rect x="170" y="560" width="660" height="200" fill="#c2410c"/>
      <circle cx="660" cy="380" r="120" fill="#fdba74" opacity=".55"/>
      <text x="215" y="320" font-family="{FONTE}" font-weight="800" font-size="64" fill="#fff">PROMOÇÃO</text>
      <text x="215" y="400" font-family="{FONTE}" font-weight="800" font-size="64" fill="#fff">DE PRIMAVERA</text>
      <text x="215" y="470" font-family="{FONTE}" font-weight="600" font-size="34" fill="#ffedd5">Tudo com até 30% off</text>
      <text x="215" y="650" font-family="{FONTE}" font-weight="800" font-size="46" fill="#fff">SÓ ESTE MÊS!</text>
      <text x="215" y="705" font-family="{FONTE}" font-size="26" fill="#fed7aa">Rua das Palmeiras, 210 · (11) 4002-3344</text>
      ''' + ''.join(f'<circle cx="{x}" cy="{y}" r="11" fill="#cbd5e1" stroke="#64748b" stroke-width="4"/>' for x in (195, 500, 805) for y in (225, 735)),
    'adesivo-vinil': fundo('#fce7f3', '#fbcfe8', S, S) + f'''
      <g filter="url(#sombra)"><rect x="150" y="170" width="700" height="660" rx="36" fill="#fff"/></g>
      <g filter="url(#sombra2)">
        <circle cx="340" cy="360" r="140" fill="#db2777"/><circle cx="340" cy="360" r="112" fill="none" stroke="#fff" stroke-width="6" stroke-dasharray="14 10"/>
        <text x="340" y="350" text-anchor="middle" font-family="{FONTE}" font-weight="800" font-size="46" fill="#fff">Doce</text>
        <text x="340" y="400" text-anchor="middle" font-family="{FONTE}" font-weight="800" font-size="46" fill="#fff">Mel</text>
        <rect x="520" y="230" width="260" height="260" rx="40" fill="#0ea5e9"/>
        <text x="650" y="345" text-anchor="middle" font-family="{FONTE}" font-weight="800" font-size="40" fill="#fff">FEITO</text>
        <text x="650" y="395" text-anchor="middle" font-family="{FONTE}" font-weight="800" font-size="40" fill="#fff">COM AMOR</text>
        <path d="M230 560 h300 a40 40 0 0 1 40 40 v120 a40 40 0 0 1 -40 40 h-300 a40 40 0 0 1 -40 -40 v-120 a40 40 0 0 1 40 -40z" fill="#facc15"/>
        <text x="380" y="680" text-anchor="middle" font-family="{FONTE}" font-weight="800" font-size="52" fill="#713f12">OBRIGADO!</text>
        <path d="M640 560 l130 0 l0 130 z" fill="#22c55e"/><path d="M640 560 l130 130 l-130 0 z" fill="#16a34a"/>
      </g>
      <path d="M770 760 q40 -10 60 -70 l0 100 q0 10 -10 10z" fill="#e2e8f0"/>''',
    'fachada-acm': fundo('#dbeafe', '#93c5fd', S, S) + f'''
      <rect x="100" y="780" width="800" height="120" fill="#94a3b8"/>
      <g filter="url(#sombra)"><rect x="120" y="230" width="760" height="560" fill="#f8fafc"/></g>
      <rect x="120" y="230" width="760" height="190" fill="#1e293b"/>
      <rect x="120" y="410" width="760" height="14" fill="#f59e0b"/>
      <text x="500" y="345" text-anchor="middle" font-family="{FONTE}" font-weight="800" font-size="92" fill="#fbbf24" letter-spacing="4">CAFÉ AROMA</text>
      <text x="500" y="395" text-anchor="middle" font-family="{FONTE}" font-weight="500" font-size="30" fill="#e2e8f0" letter-spacing="10">CAFETERIA · BISTRÔ</text>
      <rect x="170" y="470" width="300" height="320" fill="#bfdbfe" stroke="#334155" stroke-width="10"/>
      <rect x="530" y="470" width="300" height="230" fill="#bfdbfe" stroke="#334155" stroke-width="10"/>
      <line x1="320" y1="470" x2="320" y2="790" stroke="#334155" stroke-width="8"/>
      <path d="M190 490 l60 0 l-60 90z" fill="#fff" opacity=".55"/><path d="M550 490 l70 0 l-70 90z" fill="#fff" opacity=".55"/>
      <rect x="530" y="720" width="300" height="70" fill="#334155"/>''',
    'cartao-visita': fundo('#ede9fe', '#c4b5fd', S, S) + f'''
      <g transform="rotate(-12 500 500)" filter="url(#sombra)"><rect x="200" y="330" width="560" height="320" rx="14" fill="#1e1b4b"/>
        <circle cx="300" cy="430" r="48" fill="#a78bfa"/><text x="300" y="447" text-anchor="middle" font-family="{FONTE}" font-weight="800" font-size="46" fill="#1e1b4b">RC</text>
        <text x="380" y="560" font-family="{FONTE}" font-weight="700" font-size="30" fill="#ede9fe">RC ARQUITETURA</text></g>
      <g transform="rotate(6 500 500)" filter="url(#sombra)"><rect x="240" y="400" width="560" height="320" rx="14" fill="#fff"/>
        <rect x="240" y="400" width="18" height="320" fill="#7c3aed"/>
        <text x="300" y="490" font-family="{FONTE}" font-weight="800" font-size="40" fill="#1e1b4b">Rafael Costa</text>
        <text x="300" y="530" font-family="{FONTE}" font-size="26" fill="#6d28d9">Arquiteto e urbanista</text>
        <text x="300" y="610" font-family="{FONTE}" font-size="23" fill="#475569">(11) 99123-4567</text>
        <text x="300" y="645" font-family="{FONTE}" font-size="23" fill="#475569">rafael@rcarquitetura.com.br</text>
        <text x="300" y="680" font-family="{FONTE}" font-size="23" fill="#475569">@rcarquitetura</text></g>''',
    'panfleto': fundo('#fef3c7', '#fde68a', S, S) + f'''
      <g transform="rotate(-9 500 520)" filter="url(#sombra2)"><rect x="250" y="190" width="440" height="620" rx="6" fill="#fff"/><rect x="250" y="190" width="440" height="620" rx="6" fill="#16a34a" opacity=".9"/></g>
      <g transform="rotate(5 500 520)" filter="url(#sombra)"><rect x="290" y="170" width="440" height="640" rx="6" fill="#b91c1c"/>
        <circle cx="510" cy="420" r="150" fill="#fbbf24"/><circle cx="510" cy="420" r="128" fill="#ef4444"/>
        <circle cx="460" cy="380" r="20" fill="#fef3c7"/><circle cx="560" cy="400" r="20" fill="#fef3c7"/><circle cx="500" cy="470" r="20" fill="#fef3c7"/><circle cx="555" cy="335" r="12" fill="#14532d"/><circle cx="450" cy="455" r="12" fill="#14532d"/>
        <text x="510" y="245" text-anchor="middle" font-family="{FONTE}" font-weight="800" font-size="46" fill="#fff">BELLA MASSA</text>
        <text x="510" y="640" text-anchor="middle" font-family="{FONTE}" font-weight="800" font-size="50" fill="#fde047">PIZZA GRANDE</text>
        <text x="510" y="705" text-anchor="middle" font-family="{FONTE}" font-weight="800" font-size="60" fill="#fff">R$ 39,90</text>
        <text x="510" y="770" text-anchor="middle" font-family="{FONTE}" font-size="26" fill="#fecaca">Delivery (11) 3456-7788</text></g>''',
    'wind-banner': fundo('#dcfce7', '#86efac', S, S) + f'''
      <ellipse cx="500" cy="905" rx="150" ry="28" fill="#0f172a" opacity=".18"/>
      <rect x="425" y="860" width="150" height="45" rx="16" fill="#1f2937"/>
      <line x1="500" y1="110" x2="500" y2="870" stroke="#475569" stroke-width="10"/>
      <g filter="url(#sombra)"><path d="M505 115 C 690 120, 760 240, 735 420 C 715 560, 640 700, 505 800 Z" fill="#2563eb"/></g>
      <path d="M505 115 C 690 120, 760 240, 735 420 C 730 450, 725 470, 718 500 L505 500 Z" fill="#1d4ed8"/>
      <text transform="translate(625 640) rotate(-90)" font-family="{FONTE}" font-weight="800" font-size="74" fill="#fff" letter-spacing="6">ABERTO</text>
      <text transform="translate(690 610) rotate(-90)" font-family="{FONTE}" font-weight="600" font-size="30" fill="#bfdbfe">ENTRE E CONFIRA</text>''',
    'caneca': fundo('#ffedd5', '#fed7aa', S, S) + f'''
      <ellipse cx="480" cy="800" rx="230" ry="34" fill="#0f172a" opacity=".16"/>
      <path d="M680 380 q150 0 150 130 q0 130 -150 130" fill="none" stroke="#e2e8f0" stroke-width="48" filter="url(#sombra2)"/>
      <g filter="url(#sombra)"><path d="M270 290 h420 v460 q0 50 -50 50 h-320 q-50 0 -50 -50z" fill="#fff"/></g>
      <ellipse cx="480" cy="290" rx="210" ry="34" fill="#f1f5f9" stroke="#e2e8f0" stroke-width="4"/><ellipse cx="480" cy="292" rx="185" ry="24" fill="#7c2d12"/>
      <rect x="300" y="390" width="360" height="300" rx="20" fill="#ea580c"/>
      <text x="480" y="500" text-anchor="middle" font-family="{FONTE}" font-weight="800" font-size="62" fill="#fff">Bom dia,</text>
      <text x="480" y="570" text-anchor="middle" font-family="{FONTE}" font-weight="800" font-size="62" fill="#fff">equipe!</text>
      <text x="480" y="640" text-anchor="middle" font-family="{FONTE}" font-size="28" fill="#ffedd5">☕ primeiro o café</text>''',
    'camiseta': fundo('#e0e7ff', '#a5b4fc', S, S) + f'''
      <g filter="url(#sombra)"><path d="M370 170 q130 70 260 0 l190 90 l-70 170 l-80 -35 v430 h-380 v-430 l-80 35 l-70 -170z" fill="#f8fafc"/></g>
      <path d="M370 170 q130 70 260 0" fill="none" stroke="#cbd5e1" stroke-width="8"/>
      <circle cx="500" cy="440" r="105" fill="#4f46e5"/>
      <text x="500" y="430" text-anchor="middle" font-family="{FONTE}" font-weight="800" font-size="62" fill="#fff">10K</text>
      <text x="500" y="475" text-anchor="middle" font-family="{FONTE}" font-weight="700" font-size="24" fill="#c7d2fe">CORRIDA</text>
      <text x="500" y="600" text-anchor="middle" font-family="{FONTE}" font-weight="800" font-size="40" fill="#312e81">SOLIDÁRIA 2026</text>
      <text x="500" y="645" text-anchor="middle" font-family="{FONTE}" font-size="26" fill="#6366f1">Equipe Vila Mariana</text>''',
    'placa-pvc': fundo('#f1f5f9', '#cbd5e1', S, S) + f'''
      <g filter="url(#sombra)"><rect x="160" y="280" width="680" height="440" rx="22" fill="#fff"/></g>
      <rect x="185" y="305" width="630" height="390" rx="14" fill="#0f766e"/>
      <circle cx="210" cy="330" r="9" fill="#cbd5e1"/><circle cx="790" cy="330" r="9" fill="#cbd5e1"/><circle cx="210" cy="670" r="9" fill="#cbd5e1"/><circle cx="790" cy="670" r="9" fill="#cbd5e1"/>
      <text x="500" y="455" text-anchor="middle" font-family="{FONTE}" font-weight="800" font-size="86" fill="#fff">RECEPÇÃO</text>
      <path d="M380 540 h200 v-40 l80 70 l-80 70 v-40 h-200z" fill="#5eead4"/>
      <text x="500" y="250" text-anchor="middle" font-family="{FONTE}" font-weight="600" font-size="30" fill="#334155">PVC 3 mm · impressão UV</text>''',
    'adesivo-perfurado': fundo('#cffafe', '#67e8f9', S, S) + f'''
      <g filter="url(#sombra)"><rect x="130" y="210" width="740" height="580" rx="14" fill="#0e7490"/></g>
      <rect x="160" y="240" width="680" height="520" fill="#06b6d4"/>
      <rect x="160" y="240" width="680" height="520" fill="url(#pontos)" opacity=".35"/>
      <text x="500" y="420" text-anchor="middle" font-family="{FONTE}" font-weight="800" font-size="76" fill="#fff">ÓTICA VISTA</text>
      <text x="500" y="500" text-anchor="middle" font-family="{FONTE}" font-weight="600" font-size="40" fill="#ecfeff">Exame de vista grátis</text>
      <text x="500" y="610" text-anchor="middle" font-family="{FONTE}" font-weight="800" font-size="54" fill="#fde047">ARMAÇÕES -40%</text>
      <rect x="160" y="240" width="340" height="520" fill="#fff" opacity=".08"/>''',
}

# Banners da vitrine (3:1)
BW, BH = 1800, 600
BANNERS = {
    'banner-1': fundo('#1e3a8a', '#2563eb', BW, BH) + f'''
      <text x="110" y="220" font-family="{FONTE}" font-weight="800" font-size="84" fill="#fff">Sua marca vista</text>
      <text x="110" y="315" font-family="{FONTE}" font-weight="800" font-size="84" fill="#fbbf24">de longe.</text>
      <text x="110" y="395" font-family="{FONTE}" font-size="36" fill="#dbeafe">Banners, fachadas em ACM, adesivos e placas com instalação.</text>
      <rect x="110" y="440" width="330" height="76" rx="38" fill="#f97316"/><text x="275" y="490" text-anchor="middle" font-family="{FONTE}" font-weight="700" font-size="32" fill="#fff">Peça seu orçamento</text>
      <g filter="url(#sombra)"><rect x="1150" y="120" width="520" height="300" rx="8" fill="#f97316"/></g>
      <text x="1190" y="230" font-family="{FONTE}" font-weight="800" font-size="56" fill="#fff">INAUGURAÇÃO</text>
      <text x="1190" y="300" font-family="{FONTE}" font-weight="600" font-size="34" fill="#ffedd5">Sábado, 9h · Entrada livre</text>
      <line x1="1410" y1="420" x2="1410" y2="520" stroke="#cbd5e1" stroke-width="10"/>''',
    'banner-2': fundo('#7c2d12', '#ea580c', BW, BH) + f'''
      <text x="110" y="210" font-family="{FONTE}" font-weight="800" font-size="78" fill="#fff">Cartão de visita</text>
      <text x="110" y="300" font-family="{FONTE}" font-weight="800" font-size="78" fill="#fde68a">em 3 dias úteis</text>
      <text x="110" y="380" font-family="{FONTE}" font-size="36" fill="#ffedd5">1.000 cartões 4×4 em couché 300 g por R$ 120,00.</text>
      <g transform="rotate(-10 1400 300)" filter="url(#sombra)"><rect x="1150" y="170" width="460" height="260" rx="12" fill="#1c1917"/><text x="1200" y="320" font-family="{FONTE}" font-weight="800" font-size="44" fill="#fdba74">STUDIO LUMA</text></g>
      <g transform="rotate(5 1400 300)" filter="url(#sombra)"><rect x="1190" y="240" width="460" height="260" rx="12" fill="#fff"/><rect x="1190" y="240" width="14" height="260" fill="#ea580c"/>
      <text x="1235" y="330" font-family="{FONTE}" font-weight="800" font-size="36" fill="#1c1917">Luana Martins</text><text x="1235" y="370" font-family="{FONTE}" font-size="24" fill="#9a3412">Fotógrafa</text>
      <text x="1235" y="450" font-family="{FONTE}" font-size="22" fill="#57534e">(11) 98877-6655 · @studioluma</text></g>''',
    'banner-3': fundo('#064e3b', '#059669', BW, BH) + f'''
      <text x="110" y="210" font-family="{FONTE}" font-weight="800" font-size="78" fill="#fff">Brindes que ficam</text>
      <text x="110" y="300" font-family="{FONTE}" font-weight="800" font-size="78" fill="#a7f3d0">na mesa do cliente</text>
      <text x="110" y="380" font-family="{FONTE}" font-size="36" fill="#d1fae5">Canecas, camisetas e adesivos personalizados para sua empresa.</text>
      <g filter="url(#sombra)"><path d="M1180 190 h260 v290 q0 30 -30 30 h-200 q-30 0 -30 -30z" fill="#fff"/></g>
      <path d="M1440 260 q90 0 90 85 q0 85 -90 85" fill="none" stroke="#e2e8f0" stroke-width="30"/>
      <rect x="1205" y="270" width="210" height="170" rx="14" fill="#059669"/><text x="1310" y="370" text-anchor="middle" font-family="{FONTE}" font-weight="800" font-size="40" fill="#fff">SUA LOGO</text>''',
}

LOGO = fundo('#ffffff', '#ffffff', 600, 600) + f'''
  <circle cx="300" cy="230" r="150" fill="#1d4ed8"/><circle cx="300" cy="230" r="58" fill="#f97316"/>
  <path d="M300 80 a150 150 0 0 1 150 150 h-60 a90 90 0 0 0 -90 -90z" fill="#3b82f6"/>
  <text x="300" y="470" text-anchor="middle" font-family="{FONTE}" font-weight="800" font-size="78" fill="#0f172a">Ponto Visual</text>
  <text x="300" y="525" text-anchor="middle" font-family="{FONTE}" font-weight="600" font-size="30" fill="#64748b" letter-spacing="8">COMUNICAÇÃO</text>'''

# Provas de arte dos pedidos (16:9)
AW, AH = 1600, 900
ARTES = {
    'arte-padaria': fundo('#78350f', '#b45309', AW, AH) + f'''
      <text x="120" y="250" font-family="{FONTE}" font-weight="800" font-size="120" fill="#fde68a">Pão Dourado</text>
      <text x="120" y="330" font-family="{FONTE}" font-weight="500" font-size="46" fill="#fef3c7" letter-spacing="10">PADARIA E CONFEITARIA</text>
      <text x="120" y="520" font-family="{FONTE}" font-weight="800" font-size="86" fill="#fff">Pão quentinho</text>
      <text x="120" y="615" font-family="{FONTE}" font-weight="800" font-size="86" fill="#fff">toda hora!</text>
      <text x="120" y="760" font-family="{FONTE}" font-size="40" fill="#fde68a">Seg a sáb 6h–21h · Dom 6h–13h · (11) 3871-2200</text>
      <ellipse cx="1260" cy="470" rx="220" ry="130" fill="#d97706"/><ellipse cx="1260" cy="450" rx="200" ry="110" fill="#f59e0b"/>
      <path d="M1130 420 q30 -40 60 0 M1210 410 q30 -40 60 0 M1290 420 q30 -40 60 0" stroke="#92400e" stroke-width="12" fill="none" stroke-linecap="round"/>''',
    'arte-academia': fundo('#0f172a', '#1e293b', AW, AH) + f'''
      <rect x="0" y="600" width="{AW}" height="300" fill="#dc2626"/>
      <text x="120" y="260" font-family="{FONTE}" font-weight="900" font-size="150" fill="#fff" font-style="italic">FORÇA</text>
      <text x="120" y="420" font-family="{FONTE}" font-weight="900" font-size="150" fill="#ef4444" font-style="italic">TOTAL</text>
      <text x="120" y="510" font-family="{FONTE}" font-weight="600" font-size="44" fill="#cbd5e1" letter-spacing="12">ACADEMIA · CROSS · FUNCIONAL</text>
      <text x="120" y="740" font-family="{FONTE}" font-weight="800" font-size="70" fill="#fff">MATRÍCULA GRÁTIS EM OUTUBRO</text>
      <text x="120" y="820" font-family="{FONTE}" font-size="38" fill="#fee2e2">Av. Jabaquara, 1580 · @forcatotal.academia</text>
      <rect x="1180" y="200" width="260" height="40" rx="10" fill="#e2e8f0"/><rect x="1140" y="160" width="50" height="120" rx="10" fill="#94a3b8"/><rect x="1430" y="160" width="50" height="120" rx="10" fill="#94a3b8"/>''',
    'arte-clinica': fundo('#ecfeff', '#cffafe', AW, AH) + f'''
      <circle cx="300" cy="420" r="170" fill="#0891b2"/><path d="M230 360 q70 -60 140 0 q-10 120 -30 150 q-20 10 -40 -50 q-20 60 -40 50 q-20 -30 -30 -150z" fill="#fff"/>
      <text x="540" y="380" font-family="{FONTE}" font-weight="800" font-size="110" fill="#164e63">Sorriso Pleno</text>
      <text x="545" y="460" font-family="{FONTE}" font-weight="500" font-size="46" fill="#0891b2" letter-spacing="8">ODONTOLOGIA INTEGRADA</text>
      <text x="545" y="600" font-family="{FONTE}" font-size="40" fill="#334155">Dra. Fernanda Alves · CRO-SP 98.765</text>
      <text x="545" y="660" font-family="{FONTE}" font-size="40" fill="#334155">Implantes · Ortodontia · Clareamento</text>''',
    'arte-escola': fundo('#fef9c3', '#fde047', AW, AH) + f'''
      <text x="120" y="220" font-family="{FONTE}" font-weight="800" font-size="70" fill="#1e40af">Escola Pequeno Saber</text>
      <text x="120" y="420" font-family="{FONTE}" font-weight="900" font-size="150" fill="#dc2626">MATRÍCULAS</text>
      <text x="120" y="560" font-family="{FONTE}" font-weight="900" font-size="150" fill="#2563eb">ABERTAS 2027</text>
      <text x="120" y="690" font-family="{FONTE}" font-size="44" fill="#1e3a8a">Educação infantil e fundamental I · Período integral</text>
      <text x="120" y="770" font-family="{FONTE}" font-weight="700" font-size="44" fill="#1e3a8a">(11) 5581-4400 · Visite a escola!</text>
      <circle cx="1380" cy="210" r="90" fill="#f97316"/><rect x="1300" y="560" width="180" height="180" rx="20" fill="#22c55e" transform="rotate(12 1390 650)"/>''',
    'arte-autocenter': fundo('#111827', '#374151', AW, AH) + f'''
      <text x="120" y="300" font-family="{FONTE}" font-weight="900" font-size="140" fill="#facc15" font-style="italic">RODÃO</text>
      <text x="120" y="390" font-family="{FONTE}" font-weight="700" font-size="56" fill="#fff" letter-spacing="10">AUTO CENTER</text>
      <text x="120" y="560" font-family="{FONTE}" font-weight="800" font-size="54" fill="#fff">Alinhamento + balanceamento</text>
      <text x="120" y="660" font-family="{FONTE}" font-weight="900" font-size="90" fill="#facc15">R$ 89,90</text>
      <circle cx="1360" cy="450" r="190" fill="#1f2937" stroke="#9ca3af" stroke-width="40"/><circle cx="1360" cy="450" r="64" fill="#9ca3af"/>''',
    'arte-mercado': fundo('#14532d', '#16a34a', AW, AH) + f'''
      <text x="120" y="240" font-family="{FONTE}" font-weight="800" font-size="110" fill="#fff">Hortifruti</text>
      <text x="120" y="350" font-family="{FONTE}" font-weight="800" font-size="110" fill="#bbf7d0">Vila Verde</text>
      <text x="120" y="500" font-family="{FONTE}" font-weight="700" font-size="54" fill="#fef08a">QUARTA VERDE: tudo 20% off</text>
      <text x="120" y="600" font-family="{FONTE}" font-size="40" fill="#dcfce7">Frutas, verduras e legumes fresquinhos todo dia</text>
      <circle cx="1250" cy="420" r="120" fill="#ef4444"/><circle cx="1400" cy="520" r="100" fill="#f97316"/><circle cx="1230" cy="600" r="90" fill="#facc15"/>''',
}


def html(svg, w, h):
    return f'<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{svg}</svg></body></html>'


with sync_playwright() as p:
    nav = p.chromium.launch()
    pagina = nav.new_page()
    grupos = [(PRODUTOS, S, S, 'produto-'), (BANNERS, BW, BH, 'vitrine-'), ({'logo': LOGO}, 600, 600, ''), (ARTES, AW, AH, '')]
    for itens, w, h, prefixo in grupos:
        pagina.set_viewport_size({'width': w, 'height': h})
        for nome, svg in itens.items():
            pagina.set_content(html(svg, w, h))
            pagina.screenshot(path=str(SAIDA / f'{prefixo}{nome}.png'), clip={'x': 0, 'y': 0, 'width': w, 'height': h})
            print('✔', f'{prefixo}{nome}.png')
    nav.close()
