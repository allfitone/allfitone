/** English copy. Its shape is the Spanish dictionary's, enforced by the type. */

import type { Dictionary } from './es'

export const en: Dictionary = {
  meta: {
    title: 'Allfit Space · The app to train with a plan, not with luck',
    description:
      'Training and nutrition app: your programme, every set and what you eat in one place. Your history goes with you, and your data is yours.',
    shareImageAlt: 'An athlete sets up a deadlift with a loaded barbell in a dimly lit gym.',
  },
  nav: {
    skip: 'Skip to content',
    label: 'Main',
    features: 'The app',
    programs: 'Programmes',
    privacy: 'Privacy',
    gyms: 'Gyms',
    language: 'Language',
    home: 'Allfit Space, home',
  },
  stores: {
    soon: 'Coming soon on',
    appStore: 'App Store',
    googlePlay: 'Google Play',
    download: 'Get it on',
  },
  hero: {
    lines: ['TRAIN', 'WITH A PLAN.', 'NOT WITH LUCK.'],
    lead: 'Your programme, every set and what you eat, in one app. If you change gyms, your history comes with you.',
    todayAlt: "Allfit Space Today screen: the day's Pull session and the week at a glance.",
    programAlt: 'Upper and lower programme detail: 10 weeks, 4 days a week and its sessions.',
    scroll: 'Scroll',
  },
  ticker: ['Strength', 'Hypertrophy', 'Running', 'Nutrition', 'Records', 'Consistency'],
  features: {
    title: ['FROM THE FIRST SET', 'TO THE LAST BITE.'],
    cards: [
      {
        title: 'YOUR WEEK, AT A GLANCE',
        text: "What's on today, how far into the week you are and everything you've already trained.",
        alt: 'Today screen with the weekly summary and the session history.',
      },
      {
        title: 'EVERY SET COUNTS',
        text: 'See what you lifted last time and beat it, set by set.',
        alt: 'Session in progress with pull-up sets and the previous weight.',
      },
      {
        title: 'WHAT YOU EAT, AGAINST YOUR GOAL',
        text: "The day's calories and macros against the goal that comes with your programme.",
        alt: "The day's meals with calories and macros against the goal.",
      },
    ],
  },
  programs: {
    title: ['A PROGRAMME', 'FOR YOUR GOAL.'],
    lead: "Tell it what you want to achieve and how much you've trained, and the app suggests where to start. Strength, hypertrophy, running or getting moving again.",
    suggested: 'Suggested for you',
    items: [
      { name: 'UPPER AND LOWER', meta: '4 days · 10 weeks' },
      { name: 'BASIC STRENGTH', meta: '3 days · 8 weeks' },
      { name: 'HALF MARATHON', meta: '4 days · 12 weeks' },
      { name: 'PUSH · PULL · LEGS', meta: '5 days · 12 weeks' },
    ],
  },
  privacy: {
    title: ['YOUR DATA', 'IS YOURS.'],
    lead: 'Your gym and your coach see only what you accept, category by category. And you take it back whenever you want, without losing anything of yours.',
    alt: 'What you share screen: each gym with the categories it can see.',
    pillars: [
      {
        title: 'Nothing is shared on its own',
        text: 'Accepting a gym shares no data. You choose what it sees, category by category.',
      },
      {
        title: 'Cut it off whenever you want',
        text: 'Remove a permission and they stop seeing it instantly. Your data stays with you.',
      },
      {
        title: 'You leave with everything',
        text: 'If you leave a gym, your history stays with you and you keep training without losing anything.',
      },
    ],
  },
  records: {
    title: ['EVERY', 'RECORD', 'COUNTS.'],
    lead: 'Finish your workout and the app already has your card ready: your record, the muscles you worked or your own photo. One tap from your stories.',
    steps: [
      { verb: 'FINISH', text: 'The card is built from your real data.' },
      { verb: 'CHOOSE', text: 'Muscles, a record or your photo behind it.' },
      { verb: 'POST', text: 'Straight to your stories, no screenshots.' },
    ],
    cards: [
      'Muscles card: lats and upper back, worked in the Pull session.',
      'Personal record card: 35 kg pull-ups, 2.5 kg more than last time.',
      'Workout completed card with a photo: Pull session, 26:05 and 1,920 kg in total.',
    ],
    editor: {
      label: 'Preview of a story ready to post',
      caption: 'Add a caption…',
      story: 'Your story',
      friends: 'Friends',
      published: 'Shared to your story',
    },
    background: 'Athlete checking her phone at the gym after training.',
  },
  pro: {
    title: ['ALLFIT PRO,', 'INCLUDED WITH', 'YOUR GYM.'],
    text: 'The app is free. Allfit Pro gives you unlimited programmes and all your progress in detail. If your gym uses Allfit Studio, Pro is included for as long as you stay with them.',
    alt: 'Athlete with headphones focusing before training at the gym.',
  },
  studio: {
    title: 'Do you run a gym or coach others?',
    text: 'Invite your clients, assign their programme and follow them from Allfit Studio.',
    cta: 'Discover Allfit Studio',
  },
  closing: {
    title: ['YOUR NEXT RECORD', 'HAS A PLAN.'],
  },
  nvidia: {
    member: 'Allfit One is a member of NVIDIA Inception.',
    trademark:
      '© 2026 NVIDIA, the NVIDIA logo, and NVIDIA Inception are trademarks and/or registered trademarks of NVIDIA Corporation in the U.S. and other countries.',
    alt: 'NVIDIA Inception Program',
  },
  footer: {
    terms: 'Terms',
    privacy: 'Privacy',
    studio: 'Allfit Studio',
    rights: '© 2026 Allfit One',
    newWindow: 'Opens in a new tab.',
  },
}
