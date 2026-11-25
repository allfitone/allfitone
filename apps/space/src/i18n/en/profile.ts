import type { Dictionary } from '../es'

export const profile: Dictionary['profile'] = {
  title: 'Profile',
  fitnessIdActive: 'Fitness ID active',
  signedOutLocally:
    "We signed you out on this phone. We couldn't reach the server, so sign out again once you're online.",
  badge: { soon: 'Soon', active: 'Active' },
  groups: {
    you: 'You',
    account: 'Account',
    gyms: 'Your gyms',
    privacy: 'Privacy',
    plan: 'Plan and payments',
  },
  rows: {
    progress: { title: 'Progress', caption: 'Your training, week by week' },
    body: { title: 'Body', caption: 'Weight, measurements and photos' },
    fitness: { title: 'Fitness profile', caption: 'Your goal, how you train and with what' },
    health: { title: 'Pain and limitations', caption: 'Only visible to those with permission' },
    identity: { title: 'Identity and access', caption: 'Fitness ID, email, phone and password' },
    notifications: { title: 'Notifications', caption: 'What we tell you about and where' },
    preferences: { title: 'Preferences', caption: 'Kilos, kilometers and language' },
    appleHealth: { title: 'Apple Health', caption: 'Publish your workouts' },
    gym: { caption: 'Includes Allfit Pro for you' },
    noGym: { title: 'No gym', caption: 'If a gym invites you, it shows up here' },
    pastRelationships: { title: 'Past relationships', caption: 'The ones that have ended' },
    sharing: { title: 'What you share', caption: 'By gym and category' },
    hiddenSessions: { title: 'Hidden sessions', caption: "Workouts you don't share" },
    deleteData: { title: 'Delete my data', caption: 'By category or the whole account' },
    plan: { title: 'Your plan' },
    payments: { title: 'Your payments' },
    gymPlans: {
      title: 'Gym plans',
      caption: 'What your gym offers and what you pay for',
    },
  },
  planCaption: {
    paidWith: (store) => `Pro · paid through ${store}`,
    byGym: 'Pro · included by your gym',
    free: 'Free · no cost',
  },
  paymentsCaption: {
    fromGym: 'No payments: your plan comes from your gym',
    withStore: (store) => `Your Allfit Pro charges through ${store}`,
    plain: 'Your Allfit Pro charges',
  },
  planCard: { free: 'Free plan' },
  teaser: {
    label: 'Allfit Pro. Your full history, your progress and AI. Compare Free and Pro',
    title: 'Take your progress further',
    body: 'All your history, your measurements and AI',
    go: 'See Pro',
  },
  signOut: 'Sign out',
  version: (version) => `Version ${version} · Allfit Space`,
  unsynced: {
    title: 'You have an unfinished workout',
    body: "You left a session open and it hasn't reached the server yet. If you sign out now, what you logged in it is lost.",
    back: 'Back to the workout',
    signOutAnyway: 'Sign out anyway',
  },
}
