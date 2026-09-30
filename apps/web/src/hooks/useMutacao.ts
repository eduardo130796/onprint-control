import { useMutation, useQueryClient } from '@tanstack/react-query'

/** Mutação que invalida as queries das chaves informadas ao terminar. */
export function useMutacao<A, R>(chaves: string[], fn: (args: A) => Promise<R>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(chaves.map((c) => queryClient.invalidateQueries({ queryKey: [c] }))),
  })
}
