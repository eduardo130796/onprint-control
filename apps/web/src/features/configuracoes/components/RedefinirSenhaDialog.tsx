import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { SENHA_MIN, type UsuarioResumo } from '@onprint/shared'
import { usuariosApi } from '@/api/configuracoes'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { Input } from '@/components/ui/input'
import { sugerirSenha } from '@/lib/senha'

/** O admin define uma senha provisória (recuperação de senha sem e-mail nesta etapa). */
export function RedefinirSenhaDialog({ usuario, onFechar }: { usuario: UsuarioResumo; onFechar: () => void }) {
  const queryClient = useQueryClient()
  const [senha, setSenha] = useState(sugerirSenha)
  const [erro, setErro] = useState<string>()
  const redefinir = useMutation({
    mutationFn: () => usuariosApi.redefinirSenha(usuario.id, senha),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['usuarios'] }),
  })

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
