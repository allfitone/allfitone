/** Words more than one screen says: the back button, saving, the edit hint. */
export const common = {
  back: 'Volver',
  save: 'Guardar',
  change: 'Cambiar',
  cancel: 'Cancelar',
  saveFailed: 'No pudimos guardarlo. Inténtalo otra vez.',
  months: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  /** «3 jul 2026»; `month` is the short name from `months`. */
  date: (day: number, month: string, year: number) => `${String(day)} ${month} ${String(year)}`,
}
