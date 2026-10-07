import { Suspense, type ReactElement } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import type { Modulo } from '@onprint/shared'
import { AppLayout } from '@/components/layout/AppLayout'
import { NaoEncontradoPage } from '@/components/shared/NaoEncontradoPage'
import { PlaceholderPage } from '@/components/shared/PlaceholderPage'
import { TelaCarregando } from '@/components/shared/TelaCarregando'
import { ExigePermissao } from '@/features/auth/components/ExigePermissao'
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { InicioPage } from '@/features/dashboard/pages/InicioPage'
import { paginas } from './navigation'
import {
  RelatorioComissoesPage,
  RelatorioEstoquePage,
  RelatorioFinanceiroPage,
  RelatorioOrcamentosPage,
  RelatorioProducaoPage,
  RelatorioVendasPage,
  CadastrosFinanceirosPage,
  CalendarioPage,
  ComissoesPage,
  ContasPagarPage,
  ContasReceberPage,
  FluxoPage,
  MovimentosCaixaPage,
  PdvPage,
  RecebimentosPage,
  SessoesPage,
  AcabamentosPage,
  AlertasEstoquePage,
  EntradasPage,
  EstoquePage,
  MovimentacoesPage,
  NovaEntradaPage,
  AprovarArtePage,
  AprovarOrcamentoPage,
  CategoriasPage,
  ClienteFichaPage,
  ClientesPage,
  EmpresaPage,
  EntregasPage,
  FichaOpPage,
  FornecedorPage,
  FornecedoresPage,
  MaquinasProcessosPage,
  OpPage,
  OpsPage,
  OrcamentoEditorPage,
  OrcamentosKanbanPage,
  OrcamentosPage,
  PcpPage,
  PedidoPage,
  PedidosKanbanPage,
  PedidosPage,
  PermissoesPage,
  ProducaoKanbanPage,
  ProdutoPage,
  ProdutosPage,
  SolicitacoesPage,
  StatusPage,
  TemplatesPage,
  TrocarSenhaPage,
  MinhaAssinaturaPage,
  EsqueciSenhaPage,
  RedefinirSenhaPage,
  UsuariosPage,
  WhatsAppPage,
} from './paginas'

/** Telas já implementadas; as demais usam o PlaceholderPage até a fase correspondente. */
const telas: Record<string, ReactElement> = {
  '/orcamentos': <OrcamentosPage />,
  '/orcamentos/novo': <OrcamentoEditorPage />,
  '/orcamentos/kanban': <OrcamentosKanbanPage />,
  '/orcamentos/solicitacoes': <SolicitacoesPage />,
  '/orcamentos/solicitacoes/novo': <SolicitacoesPage />,
  '/pedidos': <PedidosPage />,
  '/pedidos/kanban': <PedidosKanbanPage />,
  '/pedidos/entregas': <EntregasPage />,
  '/producao': <ProducaoKanbanPage />,
  '/producao/ordens': <OpsPage />,
  '/pcp': <PcpPage />,
  '/estoque': <EstoquePage />,
  '/estoque/entradas': <EntradasPage />,
  '/estoque/entradas/novo': <NovaEntradaPage />,
  '/estoque/movimentacoes': <MovimentacoesPage />,
  '/estoque/movimentacoes/novo': <MovimentacoesPage />,
  '/estoque/alertas': <AlertasEstoquePage />,
  '/financeiro/receber': <ContasReceberPage />,
  '/financeiro/receber/novo': <ContasReceberPage />,
  '/financeiro/pagar': <ContasPagarPage />,
  '/financeiro/pagar/novo': <ContasPagarPage />,
  '/financeiro/fluxo-caixa': <FluxoPage />,
  '/financeiro/calendario': <CalendarioPage />,
  '/financeiro/formas-pagamento': <CadastrosFinanceirosPage />,
  '/financeiro/formas-pagamento/novo': <CadastrosFinanceirosPage />,
  '/financeiro/comissoes': <ComissoesPage />,
  '/caixa': <PdvPage />,
  '/caixa/recebimentos': <RecebimentosPage />,
  '/caixa/movimentos': <MovimentosCaixaPage />,
  '/caixa/sessoes': <SessoesPage />,
  '/relatorios/vendas': <RelatorioVendasPage />,
  '/relatorios/orcamentos': <RelatorioOrcamentosPage />,
  '/relatorios/producao': <RelatorioProducaoPage />,
  '/relatorios/estoque': <RelatorioEstoquePage />,
  '/relatorios/financeiro': <RelatorioFinanceiroPage />,
  '/relatorios/comissoes': <RelatorioComissoesPage />,
  '/clientes': <ClientesPage />,
  '/clientes/novo': <ClienteFichaPage />,
  '/fornecedores': <FornecedoresPage />,
  '/fornecedores/novo': <FornecedorPage />,
  '/produtos': <ProdutosPage />,
  '/produtos/novo': <ProdutoPage />,
  '/produtos/categorias': <CategoriasPage />,
  '/produtos/categorias/novo': <CategoriasPage />,
  '/produtos/acabamentos': <AcabamentosPage />,
  '/produtos/acabamentos/novo': <AcabamentosPage />,
  '/produtos/maquinas': <MaquinasProcessosPage />,
  '/produtos/maquinas/novo': <MaquinasProcessosPage />,
  '/configuracoes/maquinas': <MaquinasProcessosPage />,
  '/configuracoes/maquinas/novo': <MaquinasProcessosPage />,
  '/configuracoes/processos': <MaquinasProcessosPage />,
  '/configuracoes/processos/novo': <MaquinasProcessosPage />,
  '/whatsapp': <WhatsAppPage />,
  '/configuracoes/empresa': <EmpresaPage />,
  '/configuracoes/usuarios': <UsuariosPage />,
  '/configuracoes/usuarios/novo': <UsuariosPage />,
  '/configuracoes/permissoes': <PermissoesPage />,
  '/configuracoes/status': <StatusPage />,
  '/configuracoes/templates': <TemplatesPage />,
  '/configuracoes/templates/novo': <TemplatesPage />,
  '/configuracoes/whatsapp': <WhatsAppPage titulo="Configurações do WhatsApp" />,
}

/** Rotas de detalhe que não aparecem no menu. */
const detalhes: { path: string; modulo: Modulo; elemento: ReactElement }[] = [
  { path: '/clientes/:id', modulo: 'clientes', elemento: <ClienteFichaPage /> },
  { path: '/fornecedores/:id', modulo: 'fornecedores', elemento: <FornecedorPage /> },
  { path: '/produtos/:id', modulo: 'produtos', elemento: <ProdutoPage /> },
  { path: '/orcamentos/:id', modulo: 'orcamentos', elemento: <OrcamentoEditorPage /> },
  { path: '/pedidos/:id', modulo: 'pedidos', elemento: <PedidoPage /> },
  { path: '/producao/ordens/:id', modulo: 'producao', elemento: <OpPage /> },
  { path: '/produtos/maquinas/processos', modulo: 'produtos', elemento: <MaquinasProcessosPage /> },
  { path: '/produtos/maquinas/processos/novo', modulo: 'produtos', elemento: <MaquinasProcessosPage /> },
]

/** Rotas fora do AppLayout precisam do próprio Suspense (o layout tem o dele). */
const comCarregamento = (elemento: ReactElement) => <Suspense fallback={<TelaCarregando />}>{elemento}</Suspense>

function protegida(path: string, modulo: Modulo, elemento: ReactElement, acao: 'visualizar' | 'criar' = 'visualizar'): RouteObject {
  return {
    path,
    element: (
      <ExigePermissao key={path} modulo={modulo} acao={acao}>
        {elemento}
      </ExigePermissao>
    ),
  }
}

const rotasInternas: RouteObject[] = paginas.flatMap((p) => {
  if (p.path === '/') return [{ path: '/', element: <InicioPage /> }]
  // Sem exigir permissão: com a assinatura bloqueada, é a única tela que funciona
  if (p.path === '/assinatura') return [{ path: '/assinatura', element: <MinhaAssinaturaPage /> }]
  const rotas = [protegida(p.path, p.modulo, telas[p.path] ?? <PlaceholderPage />)]
  if (p.novo) rotas.push(protegida(`${p.path}/novo`, p.modulo, telas[`${p.path}/novo`] ?? <PlaceholderPage />, 'criar'))
  return rotas
})

export const router = createBrowserRouter(
  [
  // Rotas públicas
  { path: '/login', element: <LoginPage /> },
  { path: '/esqueci-senha', element: comCarregamento(<EsqueciSenhaPage />) },
  { path: '/redefinir-senha', element: comCarregamento(<RedefinirSenhaPage />) },
  { path: '/aprovar/:empresa/:token', element: comCarregamento(<AprovarOrcamentoPage />) },
  { path: '/arte/:empresa/:token', element: comCarregamento(<AprovarArtePage />) },
  // Rotas protegidas
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/trocar-senha', element: comCarregamento(<TrocarSenhaPage />) },
      // Impressão: fora do layout (sem menu e cabeçalho)
      protegida('/producao/ordens/:id/ficha', 'producao', comCarregamento(<FichaOpPage />)),
      {
        element: <AppLayout />,
        children: [
          ...rotasInternas,
          ...detalhes.map((d) => protegida(d.path, d.modulo, d.elemento)),
          { path: '*', element: <NaoEncontradoPage /> },
        ],
      },
    ],
  },
  ],
  { future: { v7_relativeSplatPath: true, v7_fetcherPersist: true, v7_normalizeFormMethod: true, v7_partialHydration: true, v7_skipActionErrorRevalidation: true } },
)
