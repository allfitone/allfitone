'use client'

import { Card, CardContent, CardTitle } from '@allfitone/react/components/card'
import { Text } from '@allfitone/react/components/text'
import { ToggleGroup, ToggleGroupItem } from '@allfitone/react/components/toggle-group'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useStudioSessionMutation } from './studio-query-provider'
import { createCommandIntentManager } from '@/lib/command-intent'
import {
  newCommand,
  studioApi,
  type CommandHeaders,
  type StudioPreferences,
  type StudioPreferencesPut,
} from '@/lib/studio-api'
import { isStudioQuerySessionCancelled, studioQueryKeys } from '@/lib/studio-query'
import { followAccountTheme, isStudioTheme, showStudioTheme, type StudioTheme } from '@/lib/theme'
import { useAccountTheme, useShownStudioTheme } from '@/lib/use-studio-theme'

const THEMES: readonly { value: StudioTheme; label: string }[] = [
  { value: 'dark', label: 'Oscuro' },
  { value: 'light', label: 'Claro' },
]

const TITLE_ID = 'account-theme-title'

/**
 * The theme, chosen in the person's account and kept there.
 *
 * It sits with her account because it is hers and not the organization's: the
 * menu belongs to the space she is working in, and it had this before.
 *
 * The screen changes on the press and the account is told after it. If the
 * account does not take the change the screen goes back, because a theme that
 * holds here and not on her other browser is the surprise this exists to avoid.
 */
export function AccountTheme() {
  const queryClient = useQueryClient()
  const shown = useShownStudioTheme()
  const [failed, setFailed] = useState(false)
  const [commandIntent] = useState(() => createCommandIntentManager(newCommand))
  useAccountTheme()
  const saveMutation = useStudioSessionMutation({
    mutationFn: (
      { payload, command }: { payload: StudioPreferencesPut; command: CommandHeaders },
      signal,
    ) => studioApi.updatePreferences(payload, command, signal),
  })

  async function choose(theme: StudioTheme) {
    const previous = shown
    setFailed(false)
    showStudioTheme(theme)
    // An answer already on its way back would put the old theme on screen again.
    await queryClient.cancelQueries({ queryKey: studioQueryKeys.preferences() })
    const payload = { theme }
    const command = commandIntent.commandFor({
      operation: 'preferences:update',
      resourceId: null,
      payload,
    })
    try {
      const saved = await saveMutation.mutateAsync({ payload, command })
      queryClient.setQueryData<StudioPreferences>(studioQueryKeys.preferences(), saved)
      followAccountTheme(saved.theme)
      commandIntent.reset()
    } catch (error) {
      showStudioTheme(previous)
      if (isStudioQuerySessionCancelled(error)) {
        commandIntent.reset()
        return
      }
      setFailed(true)
    }
  }

  return (
    <Card data-account-theme>
      <CardContent>
        {/* One row, not a header with an action: the card's header pins its
            action to the top, and the name would sit above the control's middle. */}
        <div data-account-theme-row>
          <CardTitle role="heading" aria-level={2} id={TITLE_ID}>
            Tema
          </CardTitle>
          <ToggleGroup
            value={[shown]}
            onValueChange={([next]) => {
              // Pressing the theme in force clears the group: nothing to save. A press
              // during a save is ignored, since disabling would drop the keyboard's focus.
              if (saveMutation.isPending || !isStudioTheme(next) || next === shown) return
              void choose(next)
            }}
            aria-busy={saveMutation.isPending || undefined}
            aria-labelledby={TITLE_ID}
          >
            {THEMES.map((theme) => (
              <ToggleGroupItem key={theme.value} value={theme.value}>
                {theme.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {failed ? (
          <div role="alert" data-account-theme-status>
            <Text size="sm" color="danger">
              No se pudo guardar el tema. Inténtalo de nuevo.
            </Text>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
