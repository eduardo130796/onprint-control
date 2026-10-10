import { TEMAS, temaOuPadrao } from '@onprint/shared'
import type { EmailMensagem } from './index'

type Modelo = Omit<EmailMensagem, 'para'>

const COR = { grafite: '#2B3036', marinho: '#021A40', marca: '#0265DC', celeste: '#02BAF8', laranja: '#F97316', texto: '#3A4048', secundario: '#5F6670', fundo: '#F4F5F7' }

/** Escapa texto vindo do usuário (nome, empresa) antes de entrar no HTML. */
export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

interface Corpo {
  titulo: string
  paragrafos: string[]
  botao?: { texto: string; link: string }
  rodape: string
  /** E-mail da empresa (convite, senha): cabeçalho e botão com o nome e a cor do tema dela, e a GrafyGo só no rodapé */
  empresa?: { nome: string; tema?: string | null }
}

/** Assinatura discreta da GrafyGo no rodapé dos e-mails enviados em nome da empresa */
const ASSINATURA = `<p style="margin:14px 0 0;font-size:11px;line-height:16px;color:#8A9099">Enviado com <strong style="color:${COR.marinho}">Grafy</strong><strong style="color:${COR.marca}">go</strong> · Gestão inteligente para quem transforma ideias.</p>`

/** Layout único dos e-mails: tabelas e estilos inline (Gmail, Outlook e celular). Textos já escapados. */
function layout({ titulo, paragrafos, botao, rodape, empresa }: Corpo): string {
  const tema = empresa ? TEMAS[temaOuPadrao(empresa.tema)] : null
  const corBotao = tema?.cor ?? COR.marca
  const textoBotao = tema?.contraste ?? '#ffffff'
  const cabecalho = empresa
    ? `<tr><td style="background:${tema?.cor};padding:18px 28px;font-size:19px;font-weight:bold;color:${tema?.contraste}">${empresa.nome}</td></tr>`
    : `<tr><td style="background:${COR.marinho};padding:18px 28px;font-size:20px;font-weight:bold;letter-spacing:-0.3px;color:#ffffff">Grafy<span style="color:${COR.celeste}">go</span><span style="display:block;margin-top:2px;font-size:11px;font-weight:normal;letter-spacing:0;color:#9DB4D6">Gestão inteligente para quem transforma ideias.</span></td></tr>
<tr><td style="height:4px;background:${COR.marca};font-size:0;line-height:0"><span style="display:inline-block;width:56px;height:4px;background:${COR.laranja}"></span></td></tr>`
  const p = (t: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:22px;color:${COR.texto}">${t}</p>`
  const btn = botao
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px"><tr><td style="border-radius:8px;background:${corBotao}">
<a href="${botao.link}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:bold;color:${textoBotao};text-decoration:none;border-radius:8px">${botao.texto}</a></td></tr></table>
<p style="margin:0 0 14px;font-size:12px;line-height:18px;color:${COR.secundario}">Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all">${botao.link}</span></p>`
    : ''
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${titulo}</title></head>
<body style="margin:0;padding:0;background:${COR.fundo};font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR.fundo};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
${cabecalho}
<tr><td style="padding:28px">
<h1 style="margin:0 0 18px;font-size:21px;line-height:28px;color:${COR.grafite}">${titulo}</h1>
${paragrafos.map(p).join('\n')}
${btn}
<p style="margin:18px 0 0;padding-top:16px;border-top:1px solid #E3E5E8;font-size:12px;line-height:18px;color:${COR.secundario}">${rodape}</p>
${empresa ? ASSINATURA : ''}
</td></tr></table></td></tr></table></body></html>`
}

const horas = (n: number) => (n === 1 ? '1 hora' : `${n} horas`)

/** Identidade da gráfica no e-mail: nome, cor do tema e o e-mail de atendimento (para onde vai a resposta) */
export interface MarcaEmail {
  empresa: string
  tema?: string | null
  responderPara?: string | null
}

/** Sai com o nome da gráfica e a resposta vai para o e-mail de atendimento dela */
const remetenteDa = (d: MarcaEmail): Modelo['remetente'] => ({ nome: d.empresa, responderPara: d.responderPara ?? null })

export function emailRedefinirSenha(d: MarcaEmail & { nome: string; link: string; validadeHoras: number }): Modelo {
  const nome = escaparHtml(d.nome.split(' ')[0] ?? d.nome)
  const empresa = escaparHtml(d.empresa)
  return {
    remetente: remetenteDa(d),
    assunto: `Redefinição de senha — ${d.empresa}`,
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
      empresa: { nome: empresa, tema: d.tema },
    }),
  }
}

export function emailConviteUsuario(d: MarcaEmail & { nome: string; email: string; link: string; validadeHoras: number }): Modelo {
  const nome = escaparHtml(d.nome.split(' ')[0] ?? d.nome)
  const empresa = escaparHtml(d.empresa)
  return {
    remetente: remetenteDa(d),
    assunto: `Seu acesso a ${d.empresa}`,
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
      empresa: { nome: empresa, tema: d.tema },
    }),
  }
}

export function emailSenhaAlterada(d: MarcaEmail & { nome: string; quando: string }): Modelo {
  return {
    remetente: remetenteDa(d),
    assunto: `Sua senha foi alterada — ${d.empresa}`,
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
      empresa: { nome: escaparHtml(d.empresa), tema: d.tema },
    }),
  }
}

export function emailBoasVindas(d: { nome: string; empresa: string; email: string; link: string; testeAte: string | null }): Modelo {
  const primeiro = d.nome.split(' ')[0] ?? d.nome
  const teste = d.testeAte ? `O teste grátis vai até ${d.testeAte}. Até lá, use à vontade: nenhum cartão foi pedido.` : ''
  return {
    assunto: `Bem-vindo(a) à GrafyGo, ${primeiro}!`,
    texto: [
      `Olá, ${primeiro}!`,
      `A conta de ${d.empresa} está pronta. Entre com o e-mail ${d.email} e a senha que você criou:`,
      d.link,
      teste,
      'Primeiros passos: complete os dados da empresa (Configurações → Dados da empresa), cadastre seus produtos e convide a equipe (Configurações → Usuários).',
    ]
      .filter(Boolean)
      .join('\n\n'),
    html: layout({
      titulo: `A conta de ${escaparHtml(d.empresa)} está pronta`,
      paragrafos: [
        `Olá, ${escaparHtml(primeiro)}!`,
        `Entre com o e-mail <strong>${escaparHtml(d.email)}</strong> e a senha que você criou.`,
        ...(teste ? [escaparHtml(teste)] : []),
        'Primeiros passos: complete os dados da empresa, cadastre seus produtos e convide a equipe em Configurações → Usuários.',
      ],
      botao: { texto: 'Entrar no sistema', link: d.link },
      rodape: 'Você recebeu este e-mail porque criou uma conta na GrafyGo.',
    }),
  }
}

/** Item da lista de orçamento como o cliente montou no site */
export interface ItemPedidoEmail {
  descricao: string
  quantidade: number
  /** Ex.: "2 × 1 m" */
  medidas?: string | null
  acabamentos?: string[]
}

/** Confirmação para o cliente que enviou a lista de orçamento pelo site (em nome da gráfica) */
export function emailPedidoRecebido(d: MarcaEmail & { nome: string; numero: string; itens: ItemPedidoEmail[]; mensagem: string; whatsapp?: string | null; site?: string | null }): Modelo {
  const primeiro = d.nome.trim().split(' ')[0] || d.nome
  const linha = (i: ItemPedidoEmail) =>
    [`${i.quantidade}× ${i.descricao}`, i.medidas, i.acabamentos?.length ? i.acabamentos.join(', ') : null].filter(Boolean).join(' · ')
  const contato = d.whatsapp ? 'Se quiser adiantar, é só responder este e-mail ou chamar no WhatsApp.' : 'Se quiser adiantar, é só responder este e-mail.'
  return {
    remetente: remetenteDa(d),
    assunto: `Recebemos seu pedido de orçamento ${d.numero} — ${d.empresa}`,
    texto: [
      `Olá, ${primeiro}!`,
      d.mensagem,
      `Pedido ${d.numero}:`,
      d.itens.map((i) => `- ${linha(i)}`).join('\n'),
      contato,
      d.whatsapp ?? '',
      d.site ? `Veja mais produtos: ${d.site}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    html: layout({
      titulo: 'Recebemos seu pedido de orçamento',
      paragrafos: [
        `Olá, ${escaparHtml(primeiro)}!`,
        escaparHtml(d.mensagem),
        `<strong>Pedido ${escaparHtml(d.numero)}</strong><br>${d.itens.map((i) => `• ${escaparHtml(linha(i))}`).join('<br>')}`,
        escaparHtml(contato),
      ],
      botao: d.whatsapp ? { texto: 'Chamar no WhatsApp', link: d.whatsapp } : undefined,
      rodape: d.site
        ? `Veja mais produtos em <a href="${escaparHtml(d.site)}" style="color:inherit">${escaparHtml(d.site.replace(/^https?:\/\//, ''))}</a>. Você recebeu este e-mail porque enviou uma lista de orçamento pelo site de ${escaparHtml(d.empresa)}.`
        : `Você recebeu este e-mail porque enviou uma lista de orçamento pelo site de ${escaparHtml(d.empresa)}.`,
      empresa: { nome: escaparHtml(d.empresa), tema: d.tema },
    }),
  }
}
