import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { SENHA_MIN, type UsuarioResumo } from '@onprint/shared'
import { usuariosApi } from '@/api/configuracoes'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { sugerirSenha } from '@/lib/senha'

/** O admin manda um link por e-mail (o usuário cria a própria senha) ou define uma senha provisória. */
export function RedefinirSenhaDialog({ usuario, onFechar }: { usuario: UsuarioResumo; onFechar: () => void }) {
  const queryClient = useQueryClient()
  const [senha, setSenha] = useState(sugerirSenha)
  const [erro, setErro] = useState<string>()
  const redefinir = useMutation({
    mutationFn: () => usuariosApi.redefinirSenha(usuario.id, senha),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['usuarios'] }),
  })
  const config = useQuery({ queryKey: ['usuarios', 'configuracao'], queryFn: usuariosApi.configuracao })
  const enviarLink = useMutation({ mutationFn: () => usuariosApi.enviarLinkSenha(usuario.id) })

  return (
    <FormDialog
      aberto
      onAbertoChange={(v) => !v && onFechar()}
      titulo="Redefinir senha"
      descricao={`${usuario.nome} precisará criar uma nova senha no próximo login. As sessões abertas serão encerradas.`}
      salvando={redefinir.isPending}
      textoSalvar="Redefinir"
      onSubmit={async (e) => {
        e.preventDefault()
        if (senha.length < SENHA_MIN) return setErro(`Mínimo de ${SENHA_MIN} caracteres.`)
        try {
          await redefinir.mutateAsync()
          toast.success(`Senha redefinida. Senha provisória: ${senha}`, { duration: 15000 })
          onFechar()
        } catch (err) {
          toast.error((err as Error).message)
        }
      }}
    >
      {config.data?.emailConfigurado && (
        <div className="rounded-xl border border-border p-3">
          <p className="text-sm">O jeito mais seguro: {usuario.nome.split(' ')[0]} recebe um link por e-mail e cria a própria senha (vale 1 hora).</p>
          <Button
            type="button"
            variant="outline"
            className="mt-2"
            disabled={enviarLink.isPending}
            onClick={async () => {
              try {
                await enviarLink.mutateAsync()
                toast.success(`Link enviado para ${usuario.email}.`)
                onFechar()
              } catch (err) {
                toast.error((err as Error).message)
              }
            }}
          >
            {enviarLink.isPending ? <Loader2 className="animate-spin" /> : <Mail />} Enviar link por e-mail
          </Button>
          <p className="mt-3 text-xs text-texto-secundario">Ou defina uma senha provisória para passar a ele:</p>
        </div>
      )}
      <CampoFormulario id="rs-senha" rotulo="Senha provisória" erro={erro}>
        <Input
          id="rs-senha"
          autoComplete="off"
          value={senha}
          onChange={(e) => {
            setSenha(e.target.value)
            setErro(undefined)
          }}
        />
      </CampoFormulario>
    </FormDialog>
  )
}
