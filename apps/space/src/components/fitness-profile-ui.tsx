/**
 * The pieces «Perfil fitness» (`PF-3b`), its edit screens and «Identidad y acceso»
 * (`PF-2c`) are built from, as approved in pen.dev for TECH-43.
 *
 * **A datum is three lines**: what it is, what it says, and where it came from. The
 * origin is a pill on purpose — it is a fact about the datum, not a caption of it — and
 * the extra versions sit beside it, in the accent, because they are the one thing on
 * the row that opens something other than the editor.
 *
 * **An unanswered datum is not empty.** It reads «Sin responder» and offers «Responder»,
 * so the four questions the onboarding never asked are found here.
 */

import { Badge } from '@allfitone/react-native/badge'
import { ContentGroup } from '@allfitone/react-native/content-row'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { type ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { SectionLabel } from './pro-ui'

/** A section: its name, then its rows on the design system's grouped card. */
export function FitnessGroup({
  label,
  children,
}: {
  readonly label: string
  readonly children: ReactNode
}) {
  return (
    <View style={styles.group}>
      <SectionLabel>{label}</SectionLabel>
      <ContentGroup>{children}</ContentGroup>
    </View>
  )
}

/** Where a datum came from, as the DS's quiet tonal badge in sentence case. */
export function OriginPill({ label }: { readonly label: string }) {
  return <Badge label={label} variant="tonal" uppercase={false} />
}

/** One datum. Pressing it edits; pressing «+1 versión» shows the others. */
export function FitnessDatum({
  title,
  value,
  provenance,
  versions,
  onPress,
  onVersions,
}: {
  readonly title: string
  readonly value: string | undefined
  readonly provenance: string | undefined
  readonly versions?: string | undefined
  readonly onPress: () => void
  readonly onVersions?: (() => void) | undefined
}) {
  const theme = useTheme()
  const answered = value !== undefined
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, value ?? 'Sin responder', provenance, versions]
        .filter(Boolean)
        .join('. ')}
      accessibilityHint={answered ? 'Cambiar' : 'Responder'}
      onPress={onPress}
      style={({ pressed }) => [styles.datum, pressed && styles.pressed]}
    >
      <View style={styles.grow}>
        <Text role="body" size="xs" color="secondary">
          {title}
        </Text>
        <Text role="control" size="sm" color={answered ? 'primary' : 'muted'}>
          {value ?? 'Sin responder'}
        </Text>
        <View style={styles.origin}>
          {answered && provenance ? (
            <OriginPill label={provenance} />
          ) : (
            <Text role="control" size="xs" color="accent">
              Responder
            </Text>
          )}
          {versions && onVersions ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${versions} de ${title}`}
              hitSlop={8}
              onPress={onVersions}
            >
              <Text role="control" size="xs" color="accent">
                {versions}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <FoundationIcon name="next" size="sm" color={theme.color.icon.secondary} decorative />
    </Pressable>
  )
}

/** A quiet note under a form: what happens, or what it is for. */
export function FormNote({ text, boxed }: { readonly text: string; readonly boxed?: boolean }) {
  const theme = useTheme()
  return (
    <View
      style={[
        styles.note,
        boxed && { backgroundColor: theme.color.background.surfaceMuted, padding: 14 },
      ]}
    >
      <FoundationIcon name="info" size="xs" color={theme.color.icon.secondary} decorative />
      <Text role="body" size="xs" color="secondary" style={styles.grow}>
        {text}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  group: { gap: 10 },
  datum: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  grow: { flex: 1, gap: 3 },
  origin: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 3 },
  pressed: { opacity: 0.7 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 14 },
})
