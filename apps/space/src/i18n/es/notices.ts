/**
 * «Avisos» (`NT-1`, `NT-2`) and the push permission (`NT-4`). ADR-054, HU-SP-091.
 *
 * A notice arrives with no words: its kind and, at most, the gym's, the professional's
 * and the program's names. Each kind's sentence is written here, with a fallback for a
 * name the API could not give, so a notice always reads whole. A notice never carries
 * her data, so no sentence here takes a weight, a measure or a meal.
 */
export const notices = {
  title: 'Avisos',
  channels: 'Elegir por dónde te avisamos',
  filter: {
    all: 'Todos',
    awaiting: (count: number) =>
      count > 0 ? `Esperan tu decisión · ${String(count)}` : 'Esperan tu decisión',
    label: 'Qué avisos ver',
  },
  groups: { awaiting: 'Esperan tu decisión', informational: 'Para que sepas' },
  empty: {
    title: 'Estás al día',
    body: 'Aquí llegan las invitaciones de tu gimnasio, lo que te propone tu coach y lo que necesite tu decisión.',
    awaiting: 'Nada espera tu decisión.',
  },
  privacy: 'Un aviso nunca lleva tus datos: te dice qué pasó y te trae aquí.',
  more: 'Ver más avisos',
  unreadable: 'No pudimos cargar tus avisos. Revisa tu conexión e inténtalo otra vez.',
  unread: 'Sin leer',
  bell: (awaiting: number) =>
    awaiting > 0 ? `Tus avisos, ${String(awaiting)} esperan tu decisión` : 'Tus avisos',
  fallback: { gym: 'Tu gimnasio', professional: 'Tu coach', aGym: 'Un gimnasio' },
  actions: { see: 'Ver', decide: 'Decidir', review: 'Revisar' },
  /** What every awaiting kind says once it no longer waits on her. */
  closed: 'Ya no espera tu respuesta.',
  kinds: {
    client_invitation: {
      title: (gym: string) => `${gym} te invita`,
      line: 'Decide si aceptas y qué pueden ver.',
    },
    cover_proposed: {
      title: 'Un coach propone cubrirte',
      line: (professional: string, gym: string) =>
        `${professional}, en ${gym}. Sin tu respuesta no ve nada.`,
    },
    correction_proposed: {
      title: (professional: string) => `${professional} propone corregir un entreno`,
      line: 'Revisa el cambio antes de que valga.',
    },
    goal_proposed: {
      title: 'Tienes una propuesta de meta',
      line: (professional: string) => `${professional} te propuso una meta nueva.`,
    },
    professional_changed: {
      title: 'Cambió quien te entrena',
      line: (professional: string, gym: string) => `Ahora te acompaña ${professional} en ${gym}.`,
    },
    relationship_ended: {
      title: (gym: string) => `${gym} terminó tu relación`,
      line: 'Desde hoy no ven nada nuevo de ti.',
    },
    plan_paused: {
      title: (gym: string) => `Tu plan con ${gym} está en pausa`,
      line: 'El pago no pasó. Al pagar, todo sigue como estaba.',
    },
    plan_resumed: {
      title: (gym: string) => `Tu plan con ${gym} sigue activo`,
      line: 'Recibimos el pago. Todo sigue como estaba.',
    },
    plan_ended: {
      title: (gym: string) => `Terminó tu plan con ${gym}`,
      line: 'Puedes ver sus planes cuando quieras.',
    },
    program_assigned: {
      title: 'Te asignaron un programa',
      line: (program: string | null) =>
        program ? `«${program}» ya está en tu agenda.` : 'Ya está en tu agenda.',
    },
    password_changed: {
      title: 'Se cambió tu contraseña',
      line: 'Si no fuiste tú, protege tu cuenta.',
    },
    email_changed: {
      title: 'Se cambió tu correo',
      line: 'Si no fuiste tú, protege tu cuenta.',
    },
  },
  time: {
    now: 'Ahora',
    minutes: (count: number) => `Hace ${String(count)} min`,
    hours: (count: number) => `Hace ${String(count)} h`,
    yesterday: 'Ayer',
    weekdays: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    /** «Lun 28»; `weekday` is the short name from `weekdays`. */
    weekday: (weekday: string, day: number) => `${weekday} ${String(day)}`,
    /** «20 sep», and «20 sep 2025» for another year. */
    date: (day: number, month: string, year: number | null) =>
      year === null ? `${String(day)} ${month}` : `${String(day)} ${month} ${String(year)}`,
  },
  expires: {
    today: 'Vence hoy',
    tomorrow: 'Vence mañana',
    days: (count: number) => `Vence en ${String(count)} días`,
  },
  push: {
    close: 'Cerrar',
    title: '¿Te avisamos en el teléfono?',
    subtitle: 'Así no te pierdes lo que necesita tu decisión.',
    reasons: {
      rest: 'Cuando termine tu descanso, aunque bloquees el teléfono.',
      gym: 'Cuando tu gimnasio te invite o tu coach te proponga algo.',
      security: 'Si pasa algo con la seguridad de tu cuenta.',
    },
    footnote: 'Nunca mandamos tus datos en un aviso, y eliges qué avisos recibes en Perfil.',
    activate: 'Activar avisos',
    notNow: 'Ahora no',
    denied:
      'El teléfono no deja que te avisemos. Puedes permitirlo en los ajustes del teléfono, en Allfit Space.',
    unavailable:
      'Esta versión de la app todavía no puede recibir avisos en el teléfono. Te seguimos avisando aquí y por correo.',
    failed: 'No pudimos activar los avisos en este teléfono. Inténtalo otra vez.',
  },
}
