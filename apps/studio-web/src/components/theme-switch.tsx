'use client'

import { SidebarGroupLabel } from '@allfitone/react/components/sidebar'
import { Text } from '@allfitone/react/components/text'
import { ToggleGroup, ToggleGroupItem } from '@allfitone/react/components/toggle-group'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import {
  isStudioQuerySessionCancelled,
  studioPreferencesQueryOptions,
  studioQueryKeys,
} from '@/lib/studio-query'
import { followAccountTheme, isStudioTheme, showStudioTheme, type StudioTheme } from '@/lib/theme'
import { useShownStudioTheme } from '@/lib/use-studio-theme'

const THEMES: readonly { value: StudioTheme; label: string }[] = [
  { value: 'dark', label: 'Oscuro' },
  { value: 'light', label: 'Claro' },
]

const LABEL_ID = 'workspace-theme-label'

/**
 * The theme, chosen at the foot of the menu and kept in the person's account.
 *
 * The screen changes on the press and the account is told after it. If the
 * account does not take the change the screen goes back, because a theme that
 * holds here and not on her other browser is the surprise this exists to avoid.
 *
 * Mounting it is also what asks the account, so a browser that never saw her
 * before follows her choice as soon as her menu is on screen.
 */
export function ThemeSwitch() {
  const queryClient = useQueryClient()
  const shown = useShownStudioTheme()
  const [failed, setFailed] = useState(false)
  const [commandIntent] = useState(() => createCommandIntentManager(newCommand))
  useQuery(studioPreferencesQueryOptions())
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
    <div data-theme-switch>
      <div data-theme-switch-row>
        <SidebarGroupLabel id={LABEL_ID} data-theme-switch-label>
          Tema
        </SidebarGroupLabel>
        <ToggleGroup
          value={[shown]}
          onValueChange={([next]) => {
            // Pressing the theme in force clears the group: nothing to save. A press
            // during a save is ignored, since disabling would drop the keyboard's focus.
            if (saveMutation.isPending || !isStudioTheme(next) || next === shown) return
            void choose(next)
          }}
          aria-busy={saveMutation.isPending || undefined}
          aria-labelledby={LABEL_ID}
        >
          {THEMES.map((theme) => (
            <ToggleGroupItem key={theme.value} value={theme.value}>
              {theme.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {failed ? (
        <div role="alert" data-theme-switch-status>
          <Text size="xs" color="danger">
            No se pudo guardar el tema. Inténtalo de nuevo.
          </Text>
        </div>
      ) : null}
    </div>
  )
}
