import type { EmailMensagem } from './index'

type Modelo = Omit<EmailMensagem, 'para'>

const COR = { grafite: '#2B3036', marca: '#25D366', laranja: '#F97316', texto: '#3A4048', secundario: '#5F6670', fundo: '#F4F5F7' }

/** Escapa texto vindo do usuário (nome, empresa) antes de entrar no HTML. */
export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

interface Corpo {
  titulo: string
  paragrafos: string[]
  botao?: { texto: string; link: string }
  rodape: string
}

/** Layout único dos e-mails: tabelas e estilos inline (Gmail, Outlook e celular). Textos já escapados. */
function layout({ titulo, paragrafos, botao, rodape }: Corpo): string {
  const p = (t: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:22px;color:${COR.texto}">${t}</p>`
  const btn = botao
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px"><tr><td style="border-radius:8px;background:${COR.marca}">
<a href="${botao.link}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:bold;color:${COR.grafite};text-decoration:none;border-radius:8px">${botao.texto}</a></td></tr></table>
<p style="margin:0 0 14px;font-size:12px;line-height:18px;color:${COR.secundario}">Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all">${botao.link}</span></p>`
    : ''
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${titulo}</title></head>
<body style="margin:0;padding:0;background:${COR.fundo};font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR.fundo};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:${COR.grafite};padding:18px 28px;font-size:18px;font-weight:bold;color:#ffffff">ONPrint <span style="color:${COR.marca}">Control</span></td></tr>
<tr><td style="height:4px;background:${COR.marca};font-size:0;line-height:0"><span style="display:inline-block;width:56px;height:4px;background:${COR.laranja}"></span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 18px;font-size:21px;line-height:28px;color:${COR.grafite}">${titulo}</h1>
${paragrafos.map(p).join('\n')}
${btn}
<p style="margin:18px 0 0;padding-top:16px;border-top:1px solid #E3E5E8;font-size:12px;line-height:18px;color:${COR.secundario}">${rodape}</p>
</td></tr></table></td></tr></table></body></html>`
}

const horas = (n: number) => (n === 1 ? '1 hora' : `${n} horas`)

export function emailRedefinirSenha(d: { nome: string; empresa: string; link: string; validadeHoras: number }): Modelo {
  const nome = escaparHtml(d.nome.split(' ')[0] ?? d.nome)
  const empresa = escaparHtml(d.empresa)
  return {
    assunto: 'Redefinição de senha — ONPrint Control',
    texto: [
      `Olá, ${d.nome.split(' ')[0]}!`,
      `Recebemos um pedido para redefinir a sua senha de acesso a ${d.empresa}.`,
      `Para criar uma senha nova, abra o link abaixo (vale por ${horas(d.validadeHoras)} e só pode ser usado uma vez):`,
      d.link,
      'Se não foi você, ignore este e-mail: a sua senha atual continua valendo.',
    ].join('\n\n'),
    html: layout({
      titulo: 'Redefinir sua senha',
      paragrafos: [`Olá, ${nome}!`, `Recebemos um pedido para redefinir a sua senha de acesso a <strong>${empresa}</strong>.`],
      botao: { texto: 'Criar nova senha', link: d.link },
      rodape: `O link vale por ${horas(d.validadeHoras)} e só pode ser usado uma vez. Se não foi você, ignore este e-mail: a sua senha atual continua valendo.`,
    }),
  }
}

export function emailConviteUsuario(d: { nome: string; empresa: string; email: string; link: string; validadeHoras: number }): Modelo {
  const nome = escaparHtml(d.nome.split(' ')[0] ?? d.nome)
  const empresa = escaparHtml(d.empresa)
  return {
    assunto: `Seu acesso a ${d.empresa} — ONPrint Control`,
    texto: [
      `Olá, ${d.nome.split(' ')[0]}!`,
      `Você recebeu acesso ao sistema de ${d.empresa}. Seu login é ${d.email}.`,
      `Crie sua senha pelo link abaixo (vale por ${horas(d.validadeHoras)}):`,
      d.link,
      'Se o administrador já passou uma senha provisória, você também pode entrar com ela; o sistema vai pedir uma senha nova no primeiro acesso.',
    ].join('\n\n'),
    html: layout({
      titulo: `Bem-vindo(a) a ${empresa}`,
      paragrafos: [`Olá, ${nome}!`, `Você recebeu acesso ao sistema de <strong>${empresa}</strong>. Seu login é <strong>${escaparHtml(d.email)}</strong>.`, 'Para começar, crie a sua senha:'],
      botao: { texto: 'Criar minha senha', link: d.link },
      rodape: `O link vale por ${horas(d.validadeHoras)}. Se o administrador já passou uma senha provisória, você também pode entrar com ela; o sistema vai pedir uma senha nova no primeiro acesso.`,
    }),
  }
}

export function emailSenhaAlterada(d: { nome: string; empresa: string; quando: string }): Modelo {
  return {
    assunto: 'Sua senha foi alterada — ONPrint Control',
    texto: [
      `Olá, ${d.nome.split(' ')[0]}!`,
      `A senha do seu acesso a ${d.empresa} foi alterada em ${d.quando}. As sessões abertas em outros aparelhos foram encerradas.`,
      'Se não foi você, fale agora com o administrador da sua empresa.',
    ].join('\n\n'),
    html: layout({
      titulo: 'Sua senha foi alterada',
      paragrafos: [
        `Olá, ${escaparHtml(d.nome.split(' ')[0] ?? d.nome)}!`,
        `A senha do seu acesso a <strong>${escaparHtml(d.empresa)}</strong> foi alterada em ${escaparHtml(d.quando)}. As sessões abertas em outros aparelhos foram encerradas.`,
      ],
      rodape: 'Se não foi você, fale agora com o administrador da sua empresa.',
    }),
  }
}
