'use client'

/**
 * A command that cannot be taken back, or that stops someone's service, asks
 * first and says what it costs.
 *
 * Suspending a gym was one click on the same cyan button as fixing its quota,
 * with the reason already picked. Here the button that opens the question is
 * not red; the red is the answer inside, beside a way out that keeps things
 * as they are. The dialog stays open while the command runs, so it cannot
 * hide a request that is still going to land.
 *
 * `ConfirmAction` brings its own button. `ConfirmDialog` is the same question
 * opened by something else — a row's menu, which closes as the item is
 * chosen, so the question cannot live inside it (Base UI, «Open from a menu»).
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@allfitone/react/components/alert-dialog'
import { useState, type ReactElement, type ReactNode, type RefObject } from 'react'

interface Question {
  title: string
  /** What it costs, in this record's numbers. */
  children: ReactNode
  confirmLabel: string
  busyLabel: string
  keepLabel: string
  busy: boolean
  onConfirm: () => Promise<void>
}

export function ConfirmAction({
  trigger,
  label,
  canOpen = () => true,
  ...question
}: Question & {
  /** The button that asks, without its label: the dialog gives it its click. */
  trigger: ReactElement
  label: ReactNode
  /** False keeps the question closed: the screen has just said what is missing. */
  canOpen?: () => boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <ConfirmDialog
      {...question}
      open={open}
      onOpenChange={(next) => {
        if (next && !canOpen()) return
        setOpen(next)
      }}
      trigger={<AlertDialogTrigger render={trigger}>{label}</AlertDialogTrigger>}
    />
  )
}

export function ConfirmDialog({
  open,
  onOpenChange,
  trigger,
  returnFocus,
  title,
  children,
  confirmLabel,
  busyLabel,
  keepLabel,
  busy,
  onConfirm,
}: Question & {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger?: ReactNode
  /** Where focus lands on closing, when what opened it is gone, like a menu item. */
  returnFocus?: RefObject<HTMLElement | null>
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        onOpenChange(next)
      }}
    >
      {trigger}
      <AlertDialogContent finalFocus={returnFocus ?? true}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{children}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter data-confirm-footer>
          <AlertDialogCancel disabled={busy}>{keepLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={() => void onConfirm().then(() => onOpenChange(false))}
          >
            {busy ? busyLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
