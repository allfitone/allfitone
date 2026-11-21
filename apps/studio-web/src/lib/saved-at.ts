/**
 * The hour a save landed, as the editors of the library say it.
 *
 * It closes a sentence («Borrador guardado a las 10:11 a. m.»), and in Spanish
 * the hour already ends in a period, so the sentence used to end in two.
 */
export function savedAtTime(value: string | Date): string {
  const time = new Intl.DateTimeFormat('es-CO', { timeStyle: 'short' }).format(new Date(value))
  return time.replace(/\.$/, '')
}
