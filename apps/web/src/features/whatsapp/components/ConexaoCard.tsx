import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, LogOut, QrCode, Smartphone, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { formatarDataHora, formatarTelefone, type WhatsappConfig } from '@onprint/shared'
import { CHAVE_WHATSAPP, whatsappApi } from '@/api/whatsapp'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Número 55DDDNNNNNNNNN → (DD) NNNNN-NNNN */
const numeroLegivel = (numero: string | null) => (numero ? formatarTelefone(numero.replace(/^55/, '')) : null)

/** Tempo até pedir um QR novo (o do WhatsApp expira em cerca de 40 s) */
const RENOVAR_QR_MS = 30_000

/**
 * Conexão do WhatsApp da gráfica: "Conectar" mostra o QR code e consulta a conexão a cada 3 s até o celular ler.
 */
export function ConexaoCard({ config, podeEditar }: { config: WhatsappConfig; podeEditar: boolean }) {
  const queryClient = useQueryClient()
  const [qr, setQr] = useState<string | null>(null)
  const [desconectando, setDesconectando] = useState(false)
  const simulado = config.provedor === 'log'

  const conectar = useMutation({
    mutationFn: whatsappApi.conectar,
    onSuccess: (r) => {
      if (r.estado === 'conectado') {
        setQr(null)
        void queryClient.invalidateQueries({ queryKey: CHAVE_WHATSAPP })
        toast.success('WhatsApp conectado.')
      } else setQr(r.qrBase64)
    },
    onError: (e) => toast.error((e as Error).message),
  })

  // Enquanto o QR está na tela: consulta a conexão; quando o celular ler, fecha o QR
  const estado = useQuery({ queryKey: [...CHAVE_WHATSAPP, 'estado'], queryFn: whatsappApi.estado, enabled: Boolean(qr), refetchInterval: 3_000 })
  useEffect(() => {
    if (qr && estado.data?.estado === 'conectado') {
      setQr(null)
      queryClient.setQueryData(CHAVE_WHATSAPP, estado.data)
      toast.success('WhatsApp conectado. Os avisos já podem sair.')
    }
  }, [estado.data, qr, queryClient])

  // O QR do WhatsApp vence: pede outro de tempos em tempos
  const renovar = conectar.mutate
  useEffect(() => {
    if (!qr) return
    const t = setInterval(() => renovar(), RENOVAR_QR_MS)
    return () => clearInterval(t)
  }, [qr, renovar])

  const conectado = config.estado === 'conectado'
  const caiu = !conectado && Boolean(config.conectadoEm)

  return (
    <Card className={cn('border-2', conectado ? 'border-marca/40' : caiu ? 'border-amber-300' : 'border-transparent')}>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
              conectado ? 'bg-marca-suave text-marca-escuro' : caiu ? 'bg-amber-100 text-amber-700' : 'bg-fundo text-texto-secundario',
            )}
          >
            {conectado ? <CheckCircle2 className="h-5 w-5" /> : caiu ? <WifiOff className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-tinta">
              {simulado ? 'Modo de teste' : conectado ? 'WhatsApp conectado' : caiu ? 'WhatsApp desconectado' : qr ? 'Aguardando a leitura do QR code' : 'WhatsApp não conectado'}
            </p>
            <p className="text-sm text-texto-secundario">
              {simulado
                ? 'Os avisos vão só para o registro do servidor (nenhuma mensagem sai de verdade).'
                : conectado
                  ? `${numeroLegivel(config.numero) ?? 'Número da gráfica'}${config.nomePerfil ? ` · ${config.nomePerfil}` : ''}${config.conectadoEm ? ` · desde ${formatarDataHora(config.conectadoEm)}` : ''}`
                  : caiu
                    ? `A conexão caiu${config.desconectadoEm ? ` em ${formatarDataHora(config.desconectadoEm)}` : ''}. Os avisos estão esperando na fila: conecte de novo pelo QR code.`
                    : 'Conecte o WhatsApp da gráfica para os clientes receberem os avisos dos pedidos.'}
            </p>
          </div>
          {podeEditar && !simulado && config.liberadoNoPlano && (
            <div className="flex shrink-0 gap-2">
              {conectado ? (
                <Button variant="outline" onClick={() => setDesconectando(true)}>
                  <LogOut /> Desconectar
                </Button>
              ) : (
                !qr && (
                  <Button onClick={() => conectar.mutate()} disabled={conectar.isPending}>
                    {conectar.isPending ? <Loader2 className="animate-spin" /> : <QrCode />} Conectar
                  </Button>
                )
              )}
            </div>
          )}
        </div>

        {qr && (
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-tinta/10 bg-fundo p-4 sm:flex-row sm:items-start">
            <img src={qr} alt="QR code para conectar o WhatsApp" className="h-60 w-60 shrink-0 rounded-xl bg-white p-2 shadow-sm" />
            <div className="space-y-3 text-sm text-tinta">
              <p className="font-semibold">Leia com o celular da gráfica</p>
              <ol className="list-decimal space-y-1 pl-5 text-texto-secundario">
                <li>Abra o WhatsApp no celular da gráfica.</li>
                <li>Toque em ⋮ (Android) ou em Configurações (iPhone) e depois em <strong>Aparelhos conectados</strong>.</li>
                <li>Toque em <strong>Conectar aparelho</strong> e aponte a câmera para este QR code.</li>
              </ol>
              <p className="flex items-center gap-2 text-xs text-texto-secundario">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Esperando a leitura… o QR é renovado sozinho.
              </p>
              <Button variant="ghost" size="sm" onClick={() => setQr(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        <p className="rounded-xl bg-sky-50 p-3 text-xs text-sky-900">
          Funciona como o WhatsApp Web: usa o número da própria gráfica, que continua funcionando no celular. O sistema manda só os avisos de pedido
          escolhidos abaixo, para os seus clientes. Não use para propaganda ou mensagens em massa: o WhatsApp pode bloquear o número.
        </p>
      </CardContent>

      <ConfirmDialog
        aberto={desconectando}
        onAbertoChange={setDesconectando}
        titulo="Desconectar o WhatsApp?"
        descricao="Os avisos automáticos param e o sistema sai do WhatsApp da gráfica (o celular continua normal). Para voltar, é só ler o QR code de novo."
        textoConfirmar="Desconectar"
        perigoso
        onConfirmar={async () => {
          const c = await whatsappApi.desconectar()
          queryClient.setQueryData(CHAVE_WHATSAPP, c)
          toast.success('WhatsApp desconectado.')
        }}
      />
    </Card>
  )
}
