/**
 * Las dos caras del menú de un programa: lo que se puede hacer, y la pregunta antes de
 * lo irreversible.
 *
 * **Viven aquí y no dentro de la pantalla**: son
 * cuerpos y no `Sheet`s. Cada pantalla tiene una sola hoja —dos `Modal` en iOS dejan la
 * segunda sin presentar, con una capa invisible comiéndose los toques—, así que quien la
 * abre decide, y esto sólo dibuja.
 *
 * **Eliminar pregunta; editar y duplicar no.** Duplicar no quita nada y editar se
 * deshace saliendo; eliminar se lleva el programa de la agenda y, con él, las rutinas que
 * sólo él usaba. Lo que se lleva se dice antes, con nombre, y no después.
 */

import { Badge } from '@allfitone/react-native/badge'
import { Button } from '@allfitone/react-native/button'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { Note } from '@allfitone/react-native/note'
import { Text } from '@allfitone/react-native/text'
import { TextField } from '@allfitone/react-native/text-field'
import { useTheme } from '@allfitone/react-native/theme'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import type { MyRoutine } from '../client/content'
import type { MyProgram } from '../client/programs'
import { removalWarning, routinesNamed } from '../client/library'
import { useText } from '../i18n/use-text'
import { OfferRow } from './offer-row'

/**
 * El día y la pregunta, en una línea.
 *
 * **Vive aquí porque los dos cuerpos la llevan.** La hoja se abre sobre un día concreto
 * y lo primero que hace falta saber es cuál; que el encabezado cambiara según cuántas
 * rutinas hay era la misma pantalla contándose de dos maneras.
 *
 * **Y el día se dice una vez.** El chip lo nombra, así que la pregunta no lo repite: con
 * «Qué toca el martes» debajo de un chip que pone «MARTES» y una frase que empezaba «se
 * repetirá todos los martes», la palabra salía cuatro veces en cinco centímetros.
 */
function DayHeading({
  day,
  line,
}: {
  readonly day: string | undefined
  /** Sólo cuando dice algo que el chip y la pregunta no dicen ya. */
  readonly line?: string
}) {
  const words = useText().training.sheets
  return (
    <View style={styles.heading}>
      <View style={styles.context}>
        <Badge label={(day ?? words.thatDay).toUpperCase()} tone="accent" variant="quiet" />
        {/* La pregunta es el encabezado de la hoja, así que se anuncia como tal: la
            hoja no dibuja el suyo cuando este cuerpo está arriba. */}
        <Text role="control" size="lg" accessibilityRole="header">
          {words.question}
        </Text>
      </View>

      {line === undefined ? null : (
        <Text role="body" size="sm" color="secondary">
          {line}
        </Text>
      )}
    </View>
  )
}

export function ProgramMenuBody({
  program,
  onEdit,
  onDuplicate,
  onRemove,
}: {
  readonly program: MyProgram
  readonly onEdit: () => void
  readonly onDuplicate: () => void
  readonly onRemove: () => void
}) {
  const words = useText().training.train
  return (
    <View style={styles.actions}>
      {program.editable ? (
        <Button label={words.edit} variant="secondary" icon="edit" onPress={onEdit} />
      ) : null}
      {/* Duplicar también el que no se puede editar: uno tomado de Allfit llega sin
          borrador, y la copia es la única manera de tener uno propio. */}
      <Button label={words.duplicate} variant="secondary" icon="duplicate" onPress={onDuplicate} />
      <Button label={words.remove} variant="ghost" icon="remove" onPress={onRemove} />
    </View>
  )
}

export function ProgramRemovalBody({
  program,
  routines,
  removing,
  onConfirm,
  onCancel,
}: {
  readonly program: MyProgram
  /** Las de la persona, para poder decir cuáles se van y cuáles se quedan. */
  readonly routines: readonly MyRoutine[]
  readonly removing: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
}) {
  const text = useText()
  return (
    <View style={styles.actions}>
      <Text role="body" size="md" color="muted">
        {removalWarning(program, routines, text.training.library)}
      </Text>
      {/* Rojo, y es la primera vez que esta app lo usa en un botón: hasta ahora lo
          destructivo se dibujaba como un fantasma y se leía igual que «cancelar». */}
      <Button
        label={text.training.train.remove}
        variant="danger"
        icon="remove"
        loading={removing}
        onPress={onConfirm}
      />
      <Button label={text.common.cancel} variant="secondary" onPress={onCancel} />
    </View>
  )
}

/**
 * `FIN-9` — el día está libre y la persona no tiene ni una rutina.
 *
 * **No es un selector vacío, es la primera vez.** Enseñar una lista sin elementos y un
 * par de botones debajo convierte el primer programa en un formulario con un hueco; aquí
 * se dice dónde estás, qué es una rutina y cuál es el único paso.
 *
 * **Y una sola salida.** Antes había dos —crear la tuya o mirar el catálogo de Allfit—, y
 * la segunda se llevaba a la persona a otra pestaña con el lunes a medio decidir.
 */
export function FirstRoutineBody({
  day,
  onCreate,
}: {
  /** El día en minúscula, como lo guarda la semana: «lunes». */
  readonly day: string | undefined
  readonly onCreate: () => void
}) {
  const words = useText().training.sheets
  return (
    <View style={styles.first}>
      <DayHeading day={day} line={words.first.line} />

      <OfferRow
        icon="add"
        label={words.first.create}
        caption={words.first.createCaption}
        onPress={onCreate}
      />

      <Text role="body" size="xs" color="muted">
        {words.first.later}
      </Text>
    </View>
  )
}

/**
 * `FIN-9` con biblioteca: qué rutina va en este día, entre las que ya existen.
 *
 * **El botón de crear no se desplaza.** Estaba al final de la lista, así que con nueve
 * rutinas había que recorrerlas todas para llegar a «crear una nueva» — justo lo que
 * hace quien no encuentra la que busca. Ahora la lista se desplaza y el botón se queda.
 *
 * **Y hay buscador cuando hay de sobra que buscar.** Con tres rutinas el campo es un
 * estorbo que empuja la lista hacia abajo; a partir de seis, es lo que evita el
 * desplazamiento. El umbral está aquí y no en la pantalla porque es una decisión sobre
 * esta lista, no sobre el editor.
 *
 * **El descanso no es un resultado de búsqueda.** Mientras hay algo tecleado se esconde:
 * nadie escribe «pierna» buscando un día libre, y dejarlo ahí convierte el filtro en una
 * lista que no filtra del todo.
 */
export function DayRoutinesBody({
  day,
  routines,
  chosenVersionId,
  hasDrafts,
  onChoose,
  onRest,
  onCreate,
}: {
  readonly day: string | undefined
  /** Las publicadas, que son las únicas que pueden ponerse en un día. */
  readonly routines: readonly MyRoutine[]
  readonly chosenVersionId: string | null
  readonly hasDrafts: boolean
  readonly onChoose: (templateVersionId: string) => void
  readonly onRest: () => void
  readonly onCreate: () => void
}) {
  const theme = useTheme()
  const text = useText()
  const words = text.training.sheets
  const [query, setQuery] = useState('')
  const shown = routinesNamed(routines, query)
  const searching = query.trim() !== ''

  return (
    <View style={styles.day}>
      {/* Sin frase debajo: decía «se repetirá todos los martes» con «MARTES» en el chip
          y «Qué toca el martes» encima, y que la semana base se repite lo dice el chip. */}
      <DayHeading day={day} />

      <TextField
        label={words.search}
        hideLabel
        placeholder={text.training.exercises.searchPlaceholder}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {shown.map((routine) => {
          const chosen = routine.template_version_id === chosenVersionId
          return (
            <Pressable
              key={routine.template_id}
              accessibilityRole="button"
              accessibilityLabel={routine.title}
              accessibilityState={{ selected: chosen }}
              onPress={() => routine.template_version_id && onChoose(routine.template_version_id)}
              style={[
                styles.option,
                {
                  backgroundColor: chosen
                    ? theme.color.accent.tonal
                    : theme.color.background.surfaceSubtle,
                  borderColor: chosen ? theme.color.border.accent : theme.color.border.subtle,
                  borderWidth: chosen ? 1.5 : 1,
                },
              ]}
            >
              <View style={styles.optionText}>
                <Text role="control" size="sm">
                  {routine.title}
                </Text>
                <Text role="body" size="xs" color="muted">
                  {words.figures(routine.exercise_count, routine.set_count)}
                </Text>
              </View>
              {chosen ? (
                <FoundationIcon name="check" size="sm" color={theme.color.icon.accent} decorative />
              ) : null}
            </Pressable>
          )
        })}

        {searching && shown.length === 0 ? (
          <Text role="body" size="sm" color="muted">
            {words.noMatch}
          </Text>
        ) : null}

        {searching ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={words.leaveFree(day)}
            onPress={onRest}
            style={[
              styles.option,
              {
                backgroundColor: theme.color.background.surfaceSubtle,
                borderColor: theme.color.border.subtle,
                borderWidth: 1,
              },
            ]}
          >
            <FoundationIcon name="rest" size="sm" color={theme.color.icon.secondary} decorative />
            <View style={styles.optionText}>
              <Text role="control" size="sm">
                {words.rest}
              </Text>
            </View>
          </Pressable>
        )}

        {hasDrafts ? (
          <Note icon="locked" style={styles.footnote}>
            {words.drafts}
          </Note>
        ) : null}
      </ScrollView>

      <Button label={words.createNew} variant="secondary" icon="add" onPress={onCreate} />
    </View>
  )
}

const styles = StyleSheet.create({
  actions: { gap: 12 },
  first: { gap: 12 },
  context: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // La lista se desplaza y el botón de abajo no: el tope la deja alta sin empujarlo
  // fuera de la hoja.
  day: { gap: 12 },
  heading: { gap: 8 },
  list: { maxHeight: 300 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  optionText: { flex: 1, gap: 2 },
  footnote: { paddingTop: 6 },
})
