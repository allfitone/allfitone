import type { Dictionary } from '../es'

export const common: Dictionary['common'] = {
  back: 'Back',
  save: 'Save',
  change: 'Change',
  cancel: 'Cancel',
  saveFailed: "We couldn't save it. Please try again.",
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  date: (day, month, year) => `${month} ${String(day)}, ${String(year)}`,
}
