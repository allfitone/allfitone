/**
 * The frame of every screen that edits one thing of the person's own (`PF-E7` onwards):
 * back and title fixed on top, a line saying what the datum is for, the editor, and
 * «Guardar» fixed at the bottom.
 *
 * **A pushed screen, not a sheet.** A sheet rides up with the keyboard and covers what it
 * edits, and it leaves the editor the height of a drawer; a screen keeps its header still
 * and gives the editor the whole window. Identity and «Perfil fitness» share it so that
 * editing a name and editing a goal feel like the same act.
 */

import { Button } from '@allfitone/react-native/button'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'

export function EditHeader({ title }: { readonly title: string }) {
  const router = useRouter()
  return (
    <View style={styles.header}>
      <IconButton icon="back" accessibilityLabel="Volver" onPress={() => router.back()} />
      <Text role="control" size="xl" accessibilityRole="header">
        {title}
      </Text>
    </View>
  )
}

export function EditScreen({
  title,
  subtitle,
  failure,
  saving,
  onSave,
  canSave = true,
  saveLabel = 'Guardar',
  children,
}: {
  readonly title: string
  readonly subtitle: string
  readonly failure: string | undefined
  readonly saving: boolean
  /** Absent draws no button, for a screen that only shows. */
  readonly onSave: (() => void) | undefined
  readonly canSave?: boolean
  readonly saveLabel?: string
  readonly children: ReactNode
}) {
  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.grow}
      >
        <EditHeader title={title} />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text role="body" size="sm" color="secondary">
            {subtitle}
          </Text>
          {children}
          {failure ? <InlineAlert message={failure} /> : null}
        </ScrollView>
        {onSave ? (
          <View style={styles.footer}>
            <Button label={saveLabel} loading={saving} disabled={!canSave} onPress={onSave} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 6, paddingBottom: 12 },
  content: { gap: 18, paddingTop: 4, paddingBottom: 32 },
  footer: { paddingTop: 12, paddingBottom: 8 },
})
