import type { Dictionary } from '../es'

export const fitness: Dictionary['fitness'] = {
  title: 'Fitness profile',
  unreadable: "We couldn't load your profile. Check your connection and try again.",
  provenance: {
    person_declared: 'Declared by you',
    professional_observation: 'Observed by your coach',
    device_observed: 'Measured by a device',
    system_inferred: 'Calculated by Allfit',
    authority_verified: 'Verified',
  },
  otherVersions: (count) => (count === 1 ? '+1 version' : `+${String(count)} versions`),
  days: (count) => (count === 1 ? '1 day' : `${String(count)} days`),
  list: (head, last) => `${head.join(', ')} and ${last}`,
  sections: {
    goal: "What you're after",
    start: 'Your starting point',
    routine: 'How you train',
    body: 'Your body',
  },
  rows: {
    primary_training_goal: 'Goal',
    focus_areas: 'Focus areas',
    training_experience: 'Experience',
    training_days_per_week: 'Days per week',
    session_duration: 'Time per session',
    training_place: 'Where you train',
    available_equipment: 'Equipment you have',
    biologicalSex: 'Biological sex',
    weight: 'Weight',
    height: 'Height',
  },
  sexOrigin: 'Declared by you · only for calculations',
  goals: {
    lose_weight: { name: 'Lose weight', why: 'Reduce body fat and improve your composition.' },
    build_muscle: { name: 'Build muscle', why: 'Increase your muscle mass and your strength.' },
    get_fit: { name: 'Get fit', why: 'Improve your fitness and your daily energy.' },
    run_a_race: { name: 'Run a race', why: 'Get ready to finish your next race.' },
    maintain: { name: 'Stay where I am', why: 'Keep your current shape and healthy habits.' },
  },
  goalStageWaiting: "Pick one below and you'll see here where it takes you.",
  experience: {
    levels: {
      starting: {
        name: "I'm just starting",
        description: "I've never trained consistently, or it's been less than six months.",
        outcome: { before: 'Start with ', emphasis: 'low volume', after: '.' },
      },
      some_practice: {
        name: 'I have some practice',
        description: "I've trained for over six months and know the basic exercises.",
        outcome: { before: 'Start with ', emphasis: 'medium volume', after: '.' },
      },
      experienced: {
        name: "I'm experienced",
        description: 'Years of training. I know about sets, loads and progressions.',
        outcome: { before: 'Start with ', emphasis: 'high volume', after: '.' },
      },
    },
    pickALevel:
      "Mark your starting point, so we don't treat you as a beginner if you're not, or the other way around.",
    notALabelTitle: "It's not a fixed label.",
    notALabelBody:
      ' Your own sessions adjust the loads from the first week. This only sets the starting point.',
  },
  focus: {
    zones: {
      chest: 'Chest',
      back: 'Back',
      shoulders: 'Shoulders',
      arms: 'Arms',
      abs: 'Abs',
      glutes: 'Glutes',
      legs: 'Legs',
    },
    wholeBody: 'Whole body',
    none: 'None',
    count: (chosen, total) => `${String(chosen)} of ${String(total)}`,
    hintWhole: 'No emphasis: your main goal spreads the work.',
    hintZones: "We'll add more volume there, without leaving the rest out.",
    front: 'FRONT',
    back: 'BACK',
    frontAndBack: 'FRONT AND BACK',
  },
  sex: {
    male: 'Male',
    female: 'Female',
    decline: "I'd rather not say",
  },
  durations: {
    up_to_30_min: { caption: 'Up to 30 min', line: 'Up to 30 min' },
    '30_to_45_min': { caption: '30 to 45 min', line: 'Between 30 and 45 min' },
    '45_to_60_min': { caption: '45 to 60 min', line: 'Between 45 and 60 min' },
    over_60_min: { caption: 'Over 60', line: 'Over 60 min' },
  },
  places: {
    gym: 'At the gym',
    home: 'At home',
    outdoors: 'Outdoors',
    multiple: 'In several places',
  },
  equipment: {
    bodyweight: 'Bodyweight',
    dumbbell: 'Dumbbells',
    kettlebell: 'Kettlebell',
    barbell: 'Olympic barbell',
    bench: 'Bench',
    pull_up_bar: 'Pull-up bar',
    cable: 'Cable',
    machine: 'Machine',
    cardio_machine: 'Cardio',
  },
  routine: {
    daysPerWeek: 'Days per week',
    dayUnit: (count) => (count === 1 ? 'day' : 'days'),
    timePerSession: 'Time per session',
  },
  place: {
    title: 'Where and with what',
    subtitle: "So we don't suggest exercises you can't do.",
    where: 'Where you train',
    equipmentHead: 'THE EQUIPMENT YOU HAVE',
    chosen: (count) => (count === 1 ? '1 selected' : `${String(count)} selected`),
    fewAtHome:
      'You train at home with little equipment: your plan relies on your bodyweight and what you selected.',
  },
  edit: {
    goal: {
      title: 'Your goal',
      subtitle: 'It sets the direction of your training. You can change it whenever you want.',
    },
    focus: {
      title: 'Focus areas',
      subtitle:
        'What you want to work on most. It is an emphasis: the rest of your body still counts.',
    },
    experience: { title: 'Your experience' },
    routine: { title: 'How you train', subtitle: 'So your plan fits your week.' },
    sex: {
      title: 'Biological sex',
      subtitle:
        "To calculate loads and estimates on a body like yours. It doesn't change how we address you.",
      declineNote: 'Everything works the same, with less precise estimates.',
      note: "Changing it doesn't rewrite what you've already logged.",
    },
  },
  versions: {
    title: 'Versions',
    shown: 'Shown',
    declared: (value) => `We show “${value}” because you declared it.`,
    latest: (value) => `We show “${value}” because it's the most recent version.`,
    note: "What your coach observed never appears as if you had said it. The other versions aren't hidden or deleted.",
  },
}
