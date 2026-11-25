import type { Dictionary } from '../es'

export const preferences: Dictionary['preferences'] = {
  channels: {
    title: 'Notices',
    intro:
      "Choose how we notify you about each thing. You always see them in the app, under Notices; turning a channel off doesn't stop anything.",
    columns: { push: 'Push', email: 'Email' },
    categories: {
      relationship: 'Your gyms',
      assignment: 'Assigned programs',
      consent: 'Permissions',
      correction: 'Corrections',
      nutrition: 'Nutrition',
      security: 'Security',
    },
    alwaysOn: 'Always on',
    note: 'Email turns on once you verify it, and push once you allow it on your phone. No gym sees or changes these preferences.',
    enablePush: {
      title: 'Turn on push on this phone',
      caption: 'We ask for permission only once.',
    },
    unreadable: "We couldn't read your notices settings. Check your connection and try again.",
  },
  title: 'Preferences',
  units: {
    label: 'Units',
    mass: 'Weight',
    kilograms: 'Kilograms',
    pounds: 'Pounds',
    distance: 'Distance',
    kilometres: 'Kilometers',
    miles: 'Miles',
    note: "Changing units doesn't change what you logged: it's converted when shown and the original is kept.",
  },
  language: {
    label: 'Language',
    title: 'Language',
    names: { es: 'Español', en: 'English' },
    followsPhone: 'Same as your phone',
    note: 'It is also the language of your emails and notifications.',
  },
  health: {
    label: 'Health apps · coming soon',
    appleHealth: 'Publish to Apple Health',
    caption: 'Your workouts go out to Apple Health. Nothing comes in.',
  },
  elsewhere: {
    label: 'Also in your profile',
    contact: 'Email and phone',
    sharing: 'What you share',
    deleteData: 'Delete my data',
  },
  unreadable: "We couldn't read your preferences. Check your connection and try again.",
  failures: {
    offline: "We couldn't save it. Check your connection; we kept what you had.",
    expired: 'Your session expired. Sign in again to continue.',
    refused: "That change couldn't be saved; we kept what you had.",
    stale: 'It changed somewhere else. Open this screen again.',
  },
}
