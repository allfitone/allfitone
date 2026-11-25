/**
 * «Perfil fitness» (`PF-3b`) and the screens that edit it, with the answers the onboarding
 * shares with them: goal, zones, level, biological sex, days, time, place and equipment.
 *
 * The names are the onboarding's, so somebody reads the same words in both places.
 */

export const fitness = {
  title: 'Perfil fitness',
  unreadable: 'No pudimos leer tu perfil. Revisa tu conexión e inténtalo otra vez.',
  provenance: {
    person_declared: 'Declarado por ti',
    professional_observation: 'Observado por tu coach',
    device_observed: 'Medido por un dispositivo',
    system_inferred: 'Calculado por Allfit',
    authority_verified: 'Verificado',
  },
  /** «+1 versión»: how many others the profile holds besides the one shown. */
  otherVersions: (count: number) => (count === 1 ? '+1 versión' : `+${String(count)} versiones`),
  days: (count: number) => (count === 1 ? '1 día' : `${String(count)} días`),
  /** «A, b y c»; the caller lowers every name but the first. */
  list: (head: readonly string[], last: string) => `${head.join(', ')} y ${last}`,
  sections: {
    goal: 'Lo que buscas',
    start: 'Tu punto de partida',
    routine: 'Cómo entrenas',
    body: 'Tu cuerpo',
  },
  rows: {
    primary_training_goal: 'Objetivo',
    focus_areas: 'Zonas de foco',
    training_experience: 'Experiencia',
    training_days_per_week: 'Días por semana',
    session_duration: 'Tiempo por sesión',
    training_place: 'Dónde entrenas',
    available_equipment: 'Equipo con el que cuentas',
    biologicalSex: 'Sexo biológico',
    weight: 'Peso',
    height: 'Estatura',
  },
  sexOrigin: 'Declarado por ti · solo para cálculos',
  goals: {
    lose_weight: { name: 'Bajar de peso', why: 'Reduce grasa corporal y mejora tu composición.' },
    build_muscle: { name: 'Construir músculo', why: 'Aumenta tu masa muscular y tu fuerza.' },
    get_fit: { name: 'Ponerme en forma', why: 'Mejora tu condición física y energía diaria.' },
    run_a_race: { name: 'Correr una carrera', why: 'Prepárate para completar tu próxima carrera.' },
    maintain: { name: 'Mantenerme', why: 'Mantén tu estado actual y hábitos saludables.' },
  },
  goalStageWaiting: 'Elige uno abajo y verás aquí a dónde te lleva.',
  experience: {
    levels: {
      starting: {
        name: 'Estoy empezando',
        description: 'Nunca he entrenado con constancia, o llevo menos de seis meses.',
        outcome: { before: 'Empezar con ', emphasis: 'poco volumen', after: '.' },
      },
      some_practice: {
        name: 'Tengo algo de práctica',
        description: 'Entreno hace más de seis meses y conozco los ejercicios básicos.',
        outcome: { before: 'Empezar con ', emphasis: 'volumen medio', after: '.' },
      },
      experienced: {
        name: 'Tengo experiencia',
        description: 'Años entrenando. Sé de series, cargas y progresiones.',
        outcome: { before: 'Empezar con ', emphasis: 'volumen alto', after: '.' },
      },
    },
    pickALevel:
      'Marca tu punto de partida, para no tratarte como principiante si no lo eres, ni al revés.',
    notALabelTitle: 'No es una etiqueta fija.',
    notALabelBody:
      ' Tus propias sesiones ajustan las cargas desde la primera semana. Esto solo define el punto de partida.',
  },
  focus: {
    zones: {
      chest: 'Pecho',
      back: 'Espalda',
      shoulders: 'Hombros',
      arms: 'Brazos',
      abs: 'Abdomen',
      glutes: 'Glúteos',
      legs: 'Piernas',
    },
    wholeBody: 'Todo el cuerpo',
    none: 'Ninguna',
    /** «2 de 7». */
    count: (chosen: number, total: number) => `${String(chosen)} de ${String(total)}`,
    hintWhole: 'Sin énfasis: lo reparte tu objetivo principal.',
    hintZones: 'Ahí cargaremos más volumen, sin dejar el resto fuera.',
    front: 'FRENTE',
    back: 'ESPALDA',
    frontAndBack: 'FRENTE Y ESPALDA',
  },
  sex: {
    male: 'Masculino',
    female: 'Femenino',
    decline: 'Prefiero no decirlo',
  },
  durations: {
    up_to_30_min: { caption: 'Hasta 30 min', line: 'Hasta 30 min' },
    '30_to_45_min': { caption: '30 a 45 min', line: 'Entre 30 y 45 min' },
    '45_to_60_min': { caption: '45 a 60 min', line: 'Entre 45 y 60 min' },
    over_60_min: { caption: 'Más de 60', line: 'Más de 60 min' },
  },
  places: {
    gym: 'En el gimnasio',
    home: 'En casa',
    outdoors: 'Al aire libre',
    multiple: 'En varios sitios',
  },
  equipment: {
    bodyweight: 'Peso corporal',
    dumbbell: 'Mancuernas',
    kettlebell: 'Kettlebell',
    barbell: 'Barra olímpica',
    bench: 'Banco',
    pull_up_bar: 'Barra fija',
    cable: 'Polea',
    machine: 'Máquina',
    cardio_machine: 'Cardio',
  },
  routine: {
    daysPerWeek: 'Días por semana',
    dayUnit: (count: number): string => (count === 1 ? 'día' : 'días'),
    timePerSession: 'Tiempo por sesión',
  },
  place: {
    title: 'Dónde y con qué',
    subtitle: 'Para no proponerte ejercicios que no puedes hacer.',
    where: 'Dónde entrenas',
    equipmentHead: 'EL EQUIPO QUE TIENES',
    chosen: (count: number) => (count === 1 ? '1 elegido' : `${String(count)} elegidos`),
    fewAtHome:
      'Entrenas en casa con poco equipo: tu plan se apoya en tu peso y en lo que marcaste.',
  },
  edit: {
    goal: {
      title: 'Tu objetivo',
      subtitle: 'Es la dirección que toma tu entrenamiento. Puedes cambiarlo cuando quieras.',
    },
    focus: {
      title: 'Zonas de foco',
      subtitle: 'Lo que quieres trabajar más. Es un énfasis: el resto del cuerpo sigue entrando.',
    },
    experience: { title: 'Tu experiencia' },
    routine: { title: 'Cómo entrenas', subtitle: 'Para que tu plan quepa en tu semana.' },
    sex: {
      title: 'Sexo biológico',
      subtitle:
        'Para calcular cargas y estimaciones sobre un cuerpo parecido al tuyo. No cambia cómo te nombramos.',
      declineNote: 'Todo funciona igual, con estimaciones menos ajustadas.',
      note: 'Cambiarlo no reescribe lo que ya registraste.',
    },
  },
  versions: {
    title: 'Versiones',
    shown: 'Mostramos',
    declared: (value: string) => `Mostramos «${value}» porque lo declaraste tú.`,
    latest: (value: string) => `Mostramos «${value}» porque es la versión más reciente.`,
    note: 'Lo que observó tu coach nunca aparece como si lo hubieras dicho tú. Las demás versiones no se ocultan ni se borran.',
  },
}
