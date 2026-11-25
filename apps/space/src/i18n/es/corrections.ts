/** «Correcciones» (`NT-6`) and «Corrección propuesta» (`NT-5`): what a professional proposes to change. */
export const corrections = {
  title: 'Correcciones',
  /** On a session's detail, for each correction still waiting on her. */
  waiting: (name: string) => `${name} te propone una corrección`,
  sections: { pending: 'Pendientes', decided: 'Decididas' },
  empty:
    'Nadie te ha propuesto correcciones. Si tu coach ve un dato por corregir, te lo propone aquí.',
  cancelledStays:
    'Una propuesta cancelada porque terminó la relación se queda aquí como cancelada: no desaparece.',
  unreadable: 'No pudimos cargar tus correcciones. Revisa tu conexión e inténtalo otra vez.',
  status: {
    pending: 'Pendiente',
    accepted: 'Aceptada',
    rejected: 'Rechazada',
    expired: 'Vencida',
    cancelled: 'Cancelada',
  },
  /** «Sentadilla · serie 3». */
  set: (exercise: string, number: number) => `${exercise} · serie ${String(number)}`,
  anExercise: 'Ejercicio',
  freeSession: 'Entreno libre',
  weekdays: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  /** «30 oct»; `month` is the short name from `common.months`. */
  day: (day: number, month: string) => `${String(day)} ${month}`,
  /** «vie 22 ago». */
  sessionDay: (weekday: string, day: number, month: string) => `${weekday} ${String(day)} ${month}`,
  expiresOn: (date: string) => `vence el ${date}`,
  today: 'hoy',
  yesterday: 'ayer',
  expiresIn: (days: number) =>
    days <= 0 ? 'Vence hoy' : days === 1 ? 'Vence mañana' : `Vence en ${String(days)} días`,
  proposal: {
    title: 'Corrección propuesta',
    proposes: (name: string) => `${name} te propone`,
    coachAt: (organization: string) => `Tu coach en ${organization}`,
    registered: 'Lo que registraste',
    proposed: 'Lo que propone',
    why: 'Por qué',
    quoted: (reason: string) => `«${reason}»`,
    reps: (count: number) => `${String(count)} ${count === 1 ? 'rep' : 'reps'}`,
    rpe: (value: string) => `RPE ${value}`,
    nothingChanges: 'Nada cambia hasta que aceptes. Si no respondes, vence y queda como estaba.',
    originalKept:
      'Si aceptas, tu registro original se guarda junto a quién lo propuso y por qué. El dato sigue siendo tuyo.',
    reject: 'Rechazar',
    accept: 'Aceptar',
    opening: 'Abriendo la propuesta…',
    gone: 'Esta propuesta ya no está disponible.',
    accepted: (date: string) =>
      `La aceptaste el ${date}. Tu registro original queda guardado junto a quién lo propuso y por qué.`,
    rejected: (date: string) => `La rechazaste el ${date}. Tu registro sigue como estaba.`,
    expired: (date: string) => `Venció el ${date} sin respuesta. Tu registro sigue como estaba.`,
    cancelled: {
      target_changed: 'Se canceló porque corregiste esa sesión antes de decidir.',
      session_annulled: 'Se canceló porque eliminaste esa sesión.',
      session_hidden: (organization: string) =>
        `Se canceló porque ocultaste esa sesión a ${organization}.`,
      relationship_terminated: (organization: string) =>
        `Se canceló porque terminó tu relación con ${organization}. Tu registro sigue como estaba.`,
      other: 'Se canceló. Tu registro sigue como estaba.',
    },
  },
  failure: {
    closed: 'Esta propuesta ya no está abierta: venció, se canceló o ya la decidiste.',
    gone: 'Esta propuesta ya no existe.',
    session: 'Tu sesión venció. Vuelve a entrar para continuar.',
    refused: 'No pudimos guardar tu decisión. Es un fallo nuestro, no tuyo.',
    offline: 'No pudimos guardar tu decisión. Revisa tu conexión e inténtalo otra vez.',
  },
}
