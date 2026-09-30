import { CODIGOS_ERRO, type CodigoErro } from '@onprint/shared'

/** Erro de aplicação: vira { error: { code, message, details? } } com o status HTTP correto. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: CodigoErro,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }

  static naoAutenticado(message = 'Sessão expirada. Faça login novamente.') {
    return new AppError(401, CODIGOS_ERRO.NAO_AUTENTICADO, message)
  }

  static semPermissao(message = 'Você não tem permissão para esta ação.') {
    return new AppError(403, CODIGOS_ERRO.SEM_PERMISSAO, message)
  }

  static naoEncontrado(message = 'Registro não encontrado.') {
    return new AppError(404, CODIGOS_ERRO.NAO_ENCONTRADO, message)
  }

  static conflito(message: string, details?: unknown) {
    return new AppError(409, CODIGOS_ERRO.CONFLITO, message, details)
  }

  static regraNegocio(message: string, details?: unknown) {
    return new AppError(422, CODIGOS_ERRO.REGRA_NEGOCIO, message, details)
  }
}
