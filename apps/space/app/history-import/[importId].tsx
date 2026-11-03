/**
 * One import (ADR-044): the review while it waits, and what came of it afterwards.
 *
 * **Waiting**, it is a review of names, not of sessions: each exercise name in the file,
 * the ones without a sure movement first, each saying what will happen to its sets.
 * Tapping one opens the exercise picker in its substitute mode — one tap is the whole
 * answer — and the answer comes back through the picker's mailbox, as it does for a
 * routine. Nothing is written until «Importar».
 *
 * **Imported**, it can be undone. Undoing annuls its sessions as any annulment does;
 * the same file can then be imported again.
 */

import { Button } from '@allfitone/react-native/button'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Sheet } from '@allfitone/react-native/sheet'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ApiError } from '../../src/client'
import {
  declareAlreadyIn,
  declareReplacing,
  takeExercisePick,
} from '../../src/client/exercise-pick'
import {
  choicesToSend,
  choose,
  countsLine,
  duplicatesLine,
  entryCaption,
  entryState,
  importButton,
  importStatusLine,
  issueLines,
  rangeLine,
  reviewEntries,
  sourceName,
  type HistoryImport,
  type ReviewEntry,
} from '../../src/client/history-import'
import { historyImports } from '../../src/client/history-import-transport'
import { GlyphRow, RowCard } from '../../src/components/gym-ui'

export default function HistoryImportDetail() {
  const router = useRouter()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { importId } = useLocalSearchParams<{ importId: string }>()
  const [document, setDocument] = useState<HistoryImport | undefined>(undefined)
  const [entries, setEntries] = useState<readonly ReviewEntry[]>([])
  const [working, setWorking] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  // Which name the picker was opened for; the answer arrives when this screen is back.
  const picking = useRef<string | undefined>(undefined)
  const loaded = useRef(false)

  const show = useCallback((next: HistoryImport) => {
    setDocument(next)
    setEntries(reviewEntries(next.preview?.exercises ?? []))
  }, [])

  useFocusEffect(
    useCallback(() => {
      const pickedFor = picking.current
      picking.current = undefined
      declareReplacing(undefined)
      const [picked] = takeExercisePick()
      if (pickedFor !== undefined && picked) {
        setEntries((current) => choose(current, pickedFor, picked))
      }
      // The review lives in this screen: reading again after the picker would undo it.
      if (loaded.current) return
      loaded.current = true
      historyImports
        .read(importId)
        .then(show)
        .catch(() => setFailure('No pudimos cargar esta importación. Revisa tu conexión.'))
    }, [importId, show]),
  )

  const pick = (entry: ReviewEntry) => {
    picking.current = entry.external_name
    declareAlreadyIn([])
    declareReplacing(0)
    router.push('/routines/exercises')
  }

  const commit = async () => {
    if (!document) return
    setWorking(true)
    setFailure(undefined)
    try {
      show(await historyImports.commit(document.id, document.timezone, choicesToSend(entries)))
    } catch (error) {
      setFailure(
        error instanceof ApiError && error.failure === 'conflict'
          ? 'Esta importación ya no está pendiente, o aún se está guardando. Vuelve a abrirla en un momento.'
          : 'No pudimos terminar la importación. Inténtalo de nuevo: nada se duplicará.',
      )
    } finally {
      setWorking(false)
    }
  }

  const undo = async () => {
    if (!document) return
    setWorking(true)
    setFailure(undefined)
    try {
      show(await historyImports.undo(document.id))
      setUndoing(false)
    } catch {
      setUndoing(false)
      setFailure('No pudimos deshacer la importación. Inténtalo de nuevo.')
    } finally {
      setWorking(false)
    }
  }

  const source = sourceName(document?.source) ?? 'la otra app'
  const preview = document?.status === 'staged' ? document.preview : null
  const toReview = entries.filter((entry) => entry.toReview)
  const known = entries.filter((entry) => !entry.toReview)
  const confirm = preview ? importButton(preview) : null

  return (
    <Screen edges={['top']} padded={false}>
      <View style={styles.header}>
        <IconButton icon="back" accessibilityLabel="Volver" onPress={() => router.back()} />
        <Text role="control" size="xl" accessibilityRole="header" style={styles.grow}>
          {preview ? 'Revisa tu historial' : `Importado de ${source}`}
        </Text>
      </View>

      {document === undefined && !failure ? (
        <ActivityIndicator color={theme.color.icon.accent} style={styles.loading} />
      ) : null}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {failure ? <InlineAlert message={failure} /> : null}

        {document ? (
          <View style={styles.summary}>
            <Text role="control" size="lg">
              {countsLine(document)}
            </Text>
            {preview ? (
              <>
                {rangeLine(preview) ? (
                  <Text role="body" size="sm" color="secondary">
                    {rangeLine(preview)}
                  </Text>
                ) : null}
                {duplicatesLine(preview) ? (
                  <Text role="body" size="sm" color="secondary">
                    {duplicatesLine(preview)}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text role="body" size="sm" color="secondary">
                {importStatusLine(document)}
              </Text>
            )}
            {issueLines(document.issues).map((line) => (
              <Text key={line} role="body" size="xs" color="muted">
                {line}
              </Text>
            ))}
            {preview ? (
              <Text role="body" size="xs" color="muted">
                Las horas se leen en tu zona horaria actual ({document.timezone}).
              </Text>
            ) : null}
          </View>
        ) : null}

        {preview && toReview.length > 0 ? (
          <Section
            title={`Por revisar · ${String(toReview.length)}`}
            note={`Toca uno para decir qué ejercicio es. Si no está, sus series se guardan con su nombre de ${source}.`}
            entries={toReview}
            onPick={pick}
            onClear={(entry) => setEntries((current) => choose(current, entry.external_name, null))}
          />
        ) : null}

        {preview && known.length > 0 ? (
          <Section
            title={`Reconocidos · ${String(known.length)}`}
            entries={known}
            onPick={pick}
            onClear={(entry) => setEntries((current) => choose(current, entry.external_name, null))}
          />
        ) : null}

        {preview && confirm ? (
          <Button label={confirm} loading={working} onPress={() => void commit()} />
        ) : null}

        {document?.status === 'committed' ? (
          <View style={styles.actions}>
            <Button label="Ver mi historial" onPress={() => router.push('/history')} />
            <Button
              label="Deshacer importación"
              variant="secondary"
              onPress={() => setUndoing(true)}
            />
          </View>
        ) : null}
      </ScrollView>

      <Sheet
        visible={undoing}
        onDismiss={() => setUndoing(false)}
        title="¿Deshacer la importación?"
      >
        <View style={styles.sheet}>
          <Text role="body" size="sm" color="secondary">
            Sus {document?.imported_count ?? 0} sesiones salen de tu historial, y tus récords y tu
            racha dejan de contarlas. Lo que entrenaste en Allfit no cambia. Puedes volver a
            importar el mismo archivo cuando quieras.
          </Text>
          <Button
            label="Deshacer importación"
            variant="danger"
            loading={working}
            onPress={() => void undo()}
          />
          <Button label="Mantenerla" variant="secondary" onPress={() => setUndoing(false)} />
        </View>
      </Sheet>
    </Screen>
  )
}

function Section({
  title,
  note,
  entries,
  onPick,
  onClear,
}: {
  readonly title: string
  readonly note?: string
  readonly entries: readonly ReviewEntry[]
  readonly onPick: (entry: ReviewEntry) => void
  readonly onClear: (entry: ReviewEntry) => void
}) {
  const theme = useTheme()
  return (
    <View style={styles.section}>
      <Text role="control" size="xs" color="muted">
        {title}
      </Text>
      {note ? (
        <Text role="body" size="xs" color="muted">
          {note}
        </Text>
      ) : null}
      <RowCard>
        {entries.map((entry) => (
          <Pressable
            key={entry.external_name}
            accessibilityRole="button"
            accessibilityLabel={`${entry.source_name}: ${entryState(entry)}. Cambiar`}
            onPress={() => onPick(entry)}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <GlyphRow
              icon={entry.movement ? 'check' : 'warning'}
              title={entry.source_name}
              caption={`${entryState(entry)}\n${entryCaption(entry)}`}
              accent={entry.movement !== null}
            >
              {entry.movement ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Dejar ${entry.source_name} sin ejercicio`}
                  hitSlop={8}
                  onPress={() => onClear(entry)}
                  style={({ pressed }) => [
                    styles.clear,
                    { borderColor: theme.color.border.subtle },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text role="control" size="xs" color="muted">
                    Ninguno
                  </Text>
                </Pressable>
              ) : null}
            </GlyphRow>
          </Pressable>
        ))}
      </RowCard>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 18,
  },
  grow: { flex: 1 },
  loading: { marginTop: 48 },
  content: { paddingHorizontal: 24, gap: 22 },
  summary: { gap: 6 },
  section: { gap: 10 },
  actions: { gap: 12 },
  sheet: { gap: 14 },
  clear: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pressed: { opacity: 0.6 },
})
