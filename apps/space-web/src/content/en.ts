/** English copy. Its shape is the Spanish dictionary's, enforced by the type. */

import type { Dictionary } from './es'

export const en: Dictionary = {
  meta: {
    title: 'Allfit Space | Training and nutrition app',
    description:
      "Training and nutrition app: follow a programme for your goal, beat last time's sets and track your meals against your target. Free.",
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
    join: 'Join the list',
  },
  stores: {
    soon: 'Coming soon on',
    appStore: 'App Store',
    googlePlay: 'Google Play',
    download: 'Get it on',
  },
  hero: {
    lines: ['BEAT', 'YOUR LAST', 'SESSION.'],
    lead: 'A programme for your goal, every set logged and what you eat against your target. All in one app, so your next session beats this one.',
    join: 'Join the waitlist',
    todayAlt: "Allfit Space Today screen: the day's Pull session and the week at a glance.",
    programAlt: 'Upper and lower programme detail: 10 weeks, 4 days a week and its sessions.',
  },
  features: {
    title: ['FROM THE FIRST SET', 'TO THE LAST BITE.'],
    cards: [
      {
        title: 'YOUR WEEK, AT A GLANCE',
        text: "What's on today and how far into the week you are.",
        alt: "Today screen with the weekly summary and the sessions you've done.",
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
        text: 'Accepting a gym shows it nothing. You decide whether it sees your training with them, your measurements and photos, or your meals.',
      },
      {
        title: 'Cut it off whenever you want',
        text: 'Tap “Remove” and they stop seeing it at once. If you end things with a gym, it keeps only what you shared up to that day, and you can take that back too.',
      },
      {
        title: 'You leave with everything',
        text: 'If you leave a gym, your programmes, your sets and your records stay in your account, and you pick up where you left off.',
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
  },
  pro: {
    title: ['DOES YOUR GYM', 'USE ALLFIT STUDIO?', 'PRO IS INCLUDED.'],
    text: "The app is free. Allfit Pro gives you unlimited programmes and all your progress in detail, and you don't pay for it while you stay with that gym.",
    alt: 'Athlete doing a biceps curl with a dumbbell in each hand.',
  },
  studio: {
    title: 'Do you run a gym or coach others?',
    text: 'Invite your clients, assign their programme and follow them from Allfit Studio.',
    cta: 'Discover Allfit Studio',
  },
  closing: {
    title: ['EVERY WEEK,', 'A LITTLE MORE.'],
  },
  waitlist: {
    title: ['BE AMONG', 'THE FIRST 100.'],
    lead: "Join the waitlist and we'll let you know when Allfit Space opens. The first 100 people to confirm their email become its Founding Members.",
  },
  form: {
    nameLabel: 'Your name',
    emailLabel: 'Your email',
    consent: 'I authorise Allfit One to process my data under its [privacy policy].',
    referredBy: "You're joining with code {code}.",
    submit: 'Join the list',
    pending: 'One moment…',
    errorNameEmpty: 'Enter your name to join.',
    errorEmailEmpty: 'Enter your email to join.',
    errorEmailInvalid: 'Check the email: it needs the form name@email.com.',
    errorConsent: 'We need your authorisation to add you.',
    failed: "We couldn't add you. Try again or write to us at {email}.",
    joinedTitle: "You're on the list, {name}.",
    joinedBody: 'Confirm your email with the link we sent to {email}. Your place counts from then.',
    codeLabel: 'Your code',
    linkLabel: 'Your link',
    copy: 'Copy',
    copied: 'Copied',
    copiedAnnouncement: 'Link copied.',
    whatsapp: 'Share on WhatsApp',
    share: 'Share',
    shareMessage:
      "I joined the waitlist for Allfit Space, Allfit One's training and nutrition app. Join with my link: {link}",
    progress: '{count} of {goal} toward {reward}.',
    progressDone: '{count} so far: you reached the last level.',
    reset: 'Use another email',
  },
  founding: {
    title: 'Founding Members',
    rows: [
      {
        term: 'Your number',
        value:
          'From #001 to #100, in the order you confirm your email. It stays on your Allfit Space profile.',
      },
      {
        term: 'Allfit Pro',
        value: 'Always at the launch price, as long as your subscription stays active.',
      },
      {
        term: 'The team',
        value:
          "A direct channel with the people building Allfit Space, to suggest improvements and see what's next first.",
      },
    ],
  },
  referrals: {
    title: 'Invite friends, earn Allfit Pro',
    text: 'When you join you get a link of your own. Everyone who joins through it, confirms their email and creates an Allfit Space account counts toward your level.',
    people: '{count} people',
    rewards: {
      5: '1 month of Allfit Pro',
      15: '2 months of Allfit Pro',
      30: '3 months of Allfit Pro',
      100: '1 year of Allfit Pro and Allfit One merch',
    },
    note: 'Every level you reach adds its reward: with 30 people you get 6 months of Allfit Pro.',
  },
  waitlistPage: {
    meta: {
      title: 'Waitlist | Allfit Space',
      description:
        'Join the Allfit Space waitlist: the first 100 people to confirm their email become Founding Members, and everyone you invite brings you closer to months of Allfit Pro.',
    },
    title: ['THE FIRST 100', 'ARE FOUNDING', 'MEMBERS.'],
    lead: "Join the waitlist and we'll let you know when Allfit Space opens. If you're among the first 100 people to confirm their email, you join as a Founding Member. And everyone who joins through your link brings you closer to months of Allfit Pro.",
    joinTitle: 'Join the waitlist',
    pro: {
      title: 'What Allfit Pro is',
      text: 'Allfit Space is free. Allfit Pro is its optional subscription: unlimited programmes and all your progress in detail.',
      rows: [
        {
          term: 'If your gym uses Allfit Studio',
          value: "Allfit Pro is included, and you don't pay for it while you stay with that gym.",
        },
        {
          term: 'Your data',
          value:
            'Controlling it is never paid for. Deciding what you share and with whom, seeing who accessed it, taking your history with you or deleting it is free on every plan.',
        },
        {
          term: 'If you go back to the free plan',
          value: 'Nothing is deleted. You keep your whole history and can still see it.',
        },
      ],
    },
    terms: {
      title: 'Terms',
      items: [
        'Founding Members are the first 100 people who join the waitlist and confirm their email. Their number, from #001 to #100, follows the order in which they confirm it.',
        'To keep it, create your Allfit Space account with the same email within 7 days of its opening. Otherwise, your place passes to the next person on the list.',
        'The Allfit Pro launch price stays yours while your subscription is active, even if the price goes up.',
        "The status is personal and can't be transferred. You only lose it if you delete your account or for proven fraud.",
        'Someone you invite counts toward your total when they join with your link or code and confirm their email. For the Allfit Pro rewards, they must also create their Allfit Space account when it opens.',
        "Levels add up: you get the reward for every level you reach. Thirty people are 1 + 2 + 3 = 6 months of Allfit Pro. Being a Founding Member doesn't stop you from earning them.",
        'Months of Allfit Pro arrive as an App Store or Google Play offer code. When they end, the subscription renews automatically unless you cancel it in the store first.',
        "Disposable emails, repeated sign-ups from the same device or connection, and inviting yourself don't count.",
        'Nothing is drawn by lot: places go by order and rewards by the number of people you invite.',
      ],
    },
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
    analytics: 'Analytics',
    studio: 'Allfit Studio',
    rights: '© 2026 Allfit One',
    newWindow: 'Opens in a new tab.',
  },
}
