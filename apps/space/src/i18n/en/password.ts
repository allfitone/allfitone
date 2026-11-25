import type { Dictionary } from '../es'

export const password: Dictionary['password'] = {
  title: 'Password',
  subtitle: 'To change it we need your current one, so no one else can do it from your phone.',
  submit: 'Change password',
  current: 'Current password',
  next: 'New password',
  note: "Changing it signs you out on other phones. You stay signed in on this one, and we'll let you know by email.",
  show: 'Show',
  hide: 'Hide',
  toggleLabel: (shown, field) => `${shown ? 'Hide' : 'Show'} ${field.toLowerCase()}`,
  changed: 'YOUR PASSWORD CHANGED',
  changedBody:
    'Use the new one next time you sign in. We signed you out on other phones and let you know by email.',
  done: 'Done',
  rules: {
    length: 'At least 8 characters',
    cases: 'An uppercase and a lowercase letter',
    digit: 'A number',
    different: 'Different from your current one',
  },
  failure: {
    generic: "We couldn't change your password. Please try again.",
    wrongPassword: 'Your current password is incorrect.',
    weakPassword: 'That password is too easy to guess. Change a few letters or make it longer.',
    rateLimited: 'Too many attempts. Wait a while and try again.',
    unavailable: "We couldn't connect. Check your connection and try again.",
  },
}
