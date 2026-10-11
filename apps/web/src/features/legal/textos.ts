import { MARCA } from '@/app/marca'

/**
 * Termos de uso e política de privacidade da GrafyGo (contratação do sistema pela internet, LGPD).
 * Texto-base: revisar com um advogado e preencher razão social e CNPJ em `MARCA` antes de divulgar.
 */
export interface SecaoLegal {
  titulo: string
  paragrafos: string[]
  itens?: string[]
}

export interface DocumentoLegal {
  titulo: string
  atualizadoEm: string
  resumo: string
  secoes: SecaoLegal[]
}

const TITULAR = MARCA.razaoSocial ? `${MARCA.razaoSocial}${MARCA.cnpj ? `, CNPJ ${MARCA.cnpj}` : ''}` : MARCA.empresa

export const TERMOS_DE_USO: DocumentoLegal = {
  titulo: 'Termos de uso',
  atualizadoEm: '2026-10-10',
  resumo: `Regras para usar o ${MARCA.produto}: teste grátis, assinatura, pagamento, cancelamento e as responsabilidades de cada parte.`,
  secoes: [
    {
      titulo: '1. Quem somos e o que é o serviço',
      paragrafos: [
        `O ${MARCA.produto} é um sistema de gestão on-line (software como serviço) para gráficas, comunicação visual e empresas de personalizados, oferecido por ${TITULAR} ("${MARCA.empresa}", "nós").`,
        'Ao criar uma conta ou usar o sistema, a empresa contratante ("cliente", "você") concorda com estes termos. Quem cria a conta declara ter poderes para representar a empresa.',
      ],
    },
    {
      titulo: '2. Conta e acesso',
      paragrafos: ['Você é responsável pelos dados informados no cadastro, por manter a senha em sigilo e por tudo o que for feito com os acessos da sua empresa.'],
      itens: [
        'Cada usuário deve ter o próprio acesso; o número de usuários ativos depende do plano.',
        'O administrador da empresa define quem acessa e o que cada um pode ver e fazer (papéis e permissões).',
        'Avise-nos imediatamente se suspeitar de uso indevido da sua conta.',
      ],
    },
    {
      titulo: '3. Teste grátis',
      paragrafos: [
        'Toda conta nova começa com um período de teste grátis, sem cartão de crédito, com todos os recursos liberados. Ao fim do teste, para continuar usando, é preciso assinar um plano. Se não assinar, o acesso é limitado e os seus dados continuam guardados por pelo menos 90 dias, caso queira voltar.',
      ],
    },
    {
      titulo: '4. Planos, preços e pagamento',
      paragrafos: [
        'Os planos, os recursos de cada um e os preços estão na página de planos. A cobrança é recorrente, mensal ou anual, conforme a escolha no momento da assinatura, e é processada pelo Asaas (instituição de pagamento autorizada pelo Banco Central). Os dados de cartão são digitados no ambiente do Asaas e não passam pelos nossos servidores.',
        'Emitimos nota fiscal de serviço para cada pagamento. Cupons de desconto valem conforme as condições informadas e somente no pagamento mensal, salvo indicação em contrário.',
        'Podemos reajustar os preços com aviso prévio de pelo menos 30 dias. O novo valor vale a partir da renovação seguinte ao aviso; quem paga o ano mantém o valor até o fim do período pago.',
      ],
    },
    {
      titulo: '5. Atraso e suspensão',
      paragrafos: ['Se uma cobrança não for paga, avisamos dentro do sistema e por e-mail. Depois do vencimento:'],
      itens: [
        'nos primeiros dias, o sistema funciona normalmente com um aviso;',
        'depois, passa a funcionar só para consulta (sem criar ou alterar registros);',
        'persistindo o atraso, o acesso é bloqueado até a regularização. A tela "Minha assinatura" continua disponível para pagar.',
      ],
    },
    {
      titulo: '6. Troca de plano e cancelamento',
      paragrafos: [
        'Você pode trocar de plano a qualquer momento em "Minha assinatura". Ao subir de plano, os novos recursos são liberados na hora e é cobrada apenas a diferença proporcional aos dias restantes do período. Ao descer de plano, a mudança vale na renovação seguinte.',
        'O cancelamento é feito pelo próprio sistema, sem multa e sem fidelidade. O acesso continua até o fim do período já pago; não há devolução proporcional de período em uso, exceto quando exigido por lei.',
        'Contratações feitas pela internet podem ser desistidas em até 7 dias da primeira cobrança paga (direito de arrependimento), com devolução integral do valor pago.',
      ],
    },
    {
      titulo: '7. Seus dados e a portabilidade',
      paragrafos: [
        'Os dados cadastrados no sistema (clientes, produtos, orçamentos, pedidos, financeiro etc.) pertencem à sua empresa. Nós os tratamos apenas para prestar o serviço, conforme a Política de Privacidade.',
        'Você pode exportar relatórios e documentos a qualquer momento. Após o cancelamento, os dados ficam guardados por 90 dias e depois podem ser excluídos definitivamente, salvo o que a lei obrigar a manter.',
      ],
    },
    {
      titulo: '8. Uso adequado',
      paragrafos: ['Não é permitido usar o sistema para:'],
      itens: [
        'atividades ilegais, fraude, envio de spam ou conteúdo que viole direitos de terceiros;',
        'tentar acessar dados de outras empresas, burlar limites do plano ou comprometer a segurança e o funcionamento do serviço;',
        'copiar, revender ou fazer engenharia reversa do sistema.',
      ],
    },
    {
      titulo: '9. Vitrine online',
      paragrafos: [
        'Nos planos com a Vitrine online, você é responsável pelo conteúdo publicado no seu site (textos, imagens, preços e informações de contato) e por ter o direito de usá-lo. Pedidos de orçamento feitos pela vitrine são enviados à sua empresa; a negociação, a venda e a entrega são de sua responsabilidade.',
        'Ao usar um domínio próprio, a manutenção do domínio e do apontamento no DNS cabe a você.',
      ],
    },
    {
      titulo: '10. Disponibilidade, suporte e responsabilidades',
      paragrafos: [
        'Trabalhamos para manter o sistema disponível e seguro, com cópias de segurança diárias. Podem ocorrer interrupções para manutenção (de preferência fora do horário comercial) ou por falhas de terceiros (internet, provedores, bancos).',
        'O sistema é uma ferramenta de apoio à gestão. Cálculos de preço, impostos e decisões do negócio devem ser conferidos pelo cliente. Nossa responsabilidade, em qualquer caso, fica limitada ao valor pago nos últimos 12 meses, exceto nos casos em que a lei não permita essa limitação.',
      ],
    },
    {
      titulo: '11. Mudanças nestes termos',
      paragrafos: ['Podemos atualizar estes termos. Mudanças relevantes são avisadas no sistema ou por e-mail com antecedência. Continuar usando o serviço depois da data de vigência significa concordar com a nova versão.'],
    },
    {
      titulo: '12. Contato e foro',
      paragrafos: [
        `Dúvidas sobre estes termos: ${MARCA.contato}.`,
        'Fica eleito o foro do domicílio do cliente para resolver qualquer questão relacionada a estes termos.',
      ],
    },
  ],
}

export const POLITICA_PRIVACIDADE: DocumentoLegal = {
  titulo: 'Política de privacidade',
  atualizadoEm: '2026-10-10',
  resumo: `Como o ${MARCA.produto} trata dados pessoais, de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018).`,
  secoes: [
    {
      titulo: '1. Papéis de cada um',
      paragrafos: [
        `Sobre os dados de quem contrata e usa o sistema (nome, e-mail, telefone dos usuários e dados de cobrança da empresa), ${TITULAR} é a controladora.`,
        'Sobre os dados que a sua empresa cadastra no sistema (por exemplo, clientes, fornecedores e pedidos), a sua empresa é a controladora e nós somos operadores: tratamos esses dados apenas para prestar o serviço, conforme as suas instruções.',
      ],
    },
    {
      titulo: '2. Que dados tratamos',
      paragrafos: [''],
      itens: [
        'Cadastro: nome da empresa, nome, e-mail, telefone e senha (guardada de forma criptografada, que nem nós conseguimos ler).',
        'Cobrança: CNPJ ou CPF, endereço e histórico de pagamentos (os dados do cartão ficam com o Asaas).',
        'Uso: registros de acesso (data, hora, endereço IP e navegador) e registros de alterações feitas no sistema, para segurança e auditoria.',
        'Dados inseridos pela sua empresa: os que você cadastrar para gerir o negócio.',
        'Vitrine online: nome, WhatsApp e, se informado, e-mail de quem pede orçamento pelo site da gráfica.',
      ],
    },
    {
      titulo: '3. Para que usamos',
      paragrafos: [''],
      itens: [
        'prestar o serviço contratado (execução de contrato);',
        'cobrar, emitir nota fiscal e cumprir obrigações legais e fiscais;',
        'garantir a segurança, prevenir fraudes e investigar incidentes (legítimo interesse);',
        'enviar avisos sobre a conta, cobranças e mudanças no serviço;',
        'melhorar o sistema com base em estatísticas de uso, sem identificar pessoas.',
      ],
    },
    {
      titulo: '4. Com quem compartilhamos',
      paragrafos: ['Não vendemos dados pessoais. Compartilhamos apenas o necessário com:'],
      itens: [
        'Asaas, para processar pagamentos e emitir notas fiscais;',
        'provedores de servidor, cópia de segurança e envio de e-mails, contratados com obrigações de sigilo e segurança;',
        'autoridades públicas, quando exigido por lei ou ordem judicial.',
      ],
    },
    {
      titulo: '5. Segurança',
      paragrafos: [
        'Usamos conexão criptografada (HTTPS), senhas com criptografia forte, separação dos dados de cada empresa, controle de acesso por permissões, registro de alterações e cópias de segurança diárias guardadas fora do servidor principal.',
        'Se ocorrer um incidente de segurança que possa causar risco ou dano relevante, avisaremos os afetados e a Autoridade Nacional de Proteção de Dados (ANPD), como determina a lei.',
      ],
    },
    {
      titulo: '6. Por quanto tempo guardamos',
      paragrafos: [
        'Enquanto a conta estiver ativa. Após o cancelamento, os dados ficam guardados por 90 dias (para o caso de voltar) e depois são excluídos ou anonimizados, exceto os que a lei obriga a manter (por exemplo, dados fiscais e registros de acesso, pelo prazo legal).',
      ],
    },
    {
      titulo: '7. Seus direitos',
      paragrafos: ['Você pode, a qualquer momento:'],
      itens: [
        'confirmar se tratamos seus dados e acessá-los;',
        'corrigir dados incompletos ou desatualizados;',
        'pedir a anonimização, o bloqueio ou a exclusão de dados desnecessários;',
        'pedir a portabilidade dos dados;',
        'revogar consentimentos e saber com quem compartilhamos.',
      ],
    },
    {
      titulo: '8. Cookies',
      paragrafos: ['Usamos apenas o armazenamento necessário para manter você conectado e lembrar preferências (como o tema claro ou escuro). Não usamos cookies de publicidade de terceiros.'],
    },
    {
      titulo: '9. Contato do encarregado (DPO)',
      paragrafos: [`Para exercer seus direitos ou tirar dúvidas sobre privacidade: ${MARCA.contato}. Respondemos em até 15 dias.`],
    },
    {
      titulo: '10. Mudanças nesta política',
      paragrafos: ['Esta política pode ser atualizada. A data da última atualização fica no topo da página; mudanças relevantes são avisadas no sistema ou por e-mail.'],
    },
  ],
}
