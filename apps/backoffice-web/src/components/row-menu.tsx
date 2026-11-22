'use client'

/**
 * A row's own actions, behind one quiet button that names the row.
 *
 * Equipo put a filled red «Retirar» or «Revocar» on every row, so the command
 * that cuts someone's access was the loudest thing on the screen. Here each
 * row offers one ghost button; its menu says what the row allows, with the
 * destructive item last and in red text, and the filled red is kept for the
 * answer inside the confirmation that item opens.
 *
 * The label names the row because a screen reader lists every trigger on the
 * page by name: twenty «Acciones» say nothing about whose they are.
 *
 * Duplicated deliberately from Studio's `ContentMenu` (AGENTS.md §5): the same
 * Design System pieces, but each product says what its own rows do.
 */

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@allfitone/react/components/dropdown-menu'
import { IconButton } from '@allfitone/react/components/icon-button'
import { FoundationIcon } from '@allfitone/react/icons'
import type { ReactNode, Ref } from 'react'

export function RowMenu({
  label,
  disabled,
  triggerRef,
  children,
}: {
  label: string
  disabled: boolean
  /** For a confirmation the menu opens: focus comes back here when it closes. */
  triggerRef?: Ref<HTMLButtonElement>
  children: ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        render={
          <IconButton
            ref={triggerRef}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            data-row-menu
          />
        }
      >
        <FoundationIcon name="more" decorative />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-row-menu-content>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
