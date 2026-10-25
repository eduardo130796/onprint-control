import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'

// Drawer lateral (usado pela sidebar no celular; à direita, nas gavetas "Testar" e "ver detalhes")
export const Sheet = SheetPrimitive.Root
export const SheetTitle = SheetPrimitive.Title
export const SheetClose = SheetPrimitive.Close

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & { lado?: 'esquerda' | 'direita' }
>(({ className, children, lado = 'esquerda', ...props }, ref) => (
  <SheetPrimitive.Portal>
    <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <SheetPrimitive.Content
      ref={ref}
      aria-describedby={undefined}
      className={cn(
        'fixed inset-y-0 z-50 flex h-full w-72 max-w-[85vw] flex-col bg-card shadow-suave data-[state=open]:animate-in data-[state=closed]:animate-out',
        lado === 'esquerda' ? 'left-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left' : 'right-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
        className,
      )}
      {...props}
    >
      {children}
    </SheetPrimitive.Content>
  </SheetPrimitive.Portal>
))
SheetContent.displayName = SheetPrimitive.Content.displayName
