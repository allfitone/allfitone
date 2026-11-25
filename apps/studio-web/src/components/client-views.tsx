'use client'

import { ToggleGroup, ToggleGroupItem } from '@allfitone/react/components/toggle-group'

import type { ClientView } from '@/lib/client-view'

/**
 * Cards or rows, for the registers that can draw both. The same control the
 * library carries, in the same corner of the same toolbar.
 *
 * The strip hides itself under the width a table needs — see
 * `[data-client-view]` in the composition stylesheet. A switch that offers a
 * view the register cannot give is a switch that does nothing when pressed.
 */
export function ClientViewToggle({
  view,
  onChange,
}: {
  view: ClientView
  onChange: (view: ClientView) => void
}) {
  function choose(values: ClientView[]) {
    const next = values[0]
    // Pressing the view already on leaves it on: a register always has one.
    if (next && next !== view) onChange(next)
  }

  return (
    <ToggleGroup value={[view]} onValueChange={choose} aria-label="Vista" data-client-view>
      <ToggleGroupItem value="cards">Tarjetas</ToggleGroupItem>
      <ToggleGroupItem value="rows">Filas</ToggleGroupItem>
    </ToggleGroup>
  )
}
