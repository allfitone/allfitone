/**
 * The landing's words in Spanish.
 *
 * This is the shape every other language must match: `Dictionary` is derived
 * from it, and `dictionaries.test.ts` holds English to the same leaves. Only
 * text lives here. What does not change with the language — the illustrative
 * names, the sets and reps, the icons — stays in the component, which reaches
 * each text by a stable key rather than by position.
 *
 * The workspace is Spanish only and keeps its copy beside each screen.
 */
export const es = {
  meta: {
    title: 'Allfit Studio · Software para entrenadores y gimnasios',
    description:
      'Reúne a tus clientes, sus programas de entrenamiento y cada sesión que registran en un solo panel. Para entrenadores personales, estudios y gimnasios.',
    shareImageAlt:
      'Portada de Allfit Studio: «Tu plan. Su sesión. Un solo panel.», junto a la ficha de una persona que compara lo planeado con lo que registró.',
  },
  nav: {
    label: 'Principal',
    how: 'Cómo funciona',
    privacy: 'Privacidad',
    modules: 'Módulos',
    language: 'Idioma',
    enter: 'Entrar',
  },
  links: {
    newTab: '(se abre en una pestaña nueva)',
  },
  partialLogout: {
    title: 'La sesión se cerró en este equipo',
    description:
      'No pudimos confirmar todo el cierre remoto. Si vuelves a entrar, completa de nuevo el acceso con el proveedor de identidad.',
  },
  expiredAccess: {
    title: 'El acceso tardó demasiado',
    description:
      'Por seguridad, cada intento de entrar vence a los 10 minutos. Si ya creaste tu cuenta, sigue creada: entra de nuevo para continuar.',
    action: 'Entrar de nuevo',
  },
  hero: {
    title: ['Tu plan.', 'Su sesión.', 'Un solo panel.'],
    lead: 'Allfit Studio reúne a tus clientes, sus programas y lo que registran en cada sesión. Comparas el plan con lo que pasó y ajustas sin perder el hilo.',
    cta: 'Crear mi espacio',
    note: '¿Ya tienes cuenta? El mismo botón te lleva a tu espacio.',
  },
  people: {
    title: 'Personas',
    laura: 'Sesión registrada',
    camilo: 'Aceptó tu invitación',
    valentina: 'Programa asignado',
  },
  sheet: {
    program: 'Fuerza · Programa v3 · Semana 4',
    shared: 'Comparte contigo su entrenamiento y su progreso',
    columns: { exercise: 'Ejercicio', planned: 'Plan', logged: 'Registró' },
    exercises: {
      squat: 'Sentadilla trasera',
      bench: 'Press de banca',
      row: 'Remo con barra',
      deadlift: 'Peso muerto rumano',
    },
    changes: { bench: 'Una serie menos', row: 'Dos repeticiones más' },
    footer: 'Registrada hoy, 07:42',
  },
  sharing: {
    yours: 'Lo que te comparte',
    shared: 'Compartido',
    notShared: 'No compartido',
    categories: {
      training: 'Entrenamiento',
      progress: 'Progreso',
      nutrition: 'Nutrición',
      health: 'Contexto de salud',
    },
  },
  how: {
    title: ['Del plan', 'a lo que pasó.'],
    steps: {
      invite: {
        title: 'Invita a tus clientes',
        text: 'La relación empieza cuando la persona acepta tu invitación con su Fitness ID. Ella elige qué te comparte.',
      },
      versions: {
        title: 'Asigna su programa',
        text: 'Arma plantillas, asígnalas y ajústalas sin perder lo anterior: cada versión queda guardada.',
      },
      week: {
        title: 'Compara y ajusta',
        text: 'Cada sesión registrada aparece junto a lo que planeaste. Ves la semana completa y dónde ajustar.',
      },
    },
    versions: {
      template: 'Torso y pierna',
      current: 'Actual',
      notes: {
        v3: 'Asignada el 14 de octubre',
        v2: 'Más volumen en tirón',
        v1: 'Punto de partida',
      },
    },
    week: {
      title: 'Esta semana',
      count: '12 de 16 bloques',
      days: { mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb' },
      note: 'Sábado sin registrar · revisa la carga de la próxima semana',
    },
  },
  privacy: {
    title: ['Solo ves lo que', 'te comparten.'],
    lead: 'Cada persona decide qué categorías ve tu organización y puede retirarlas cuando quiera. Studio lo respeta en cada pantalla.',
    pillars: {
      consent: {
        title: 'Cada persona decide',
        text: 'Aceptar tu invitación no comparte nada por sí solo. La persona elige qué ves, categoría por categoría.',
      },
      purpose: {
        title: 'Tu equipo ve solo lo necesario',
        text: 'Cada miembro de tu equipo ve a las personas que tiene asignadas, y solo lo que ellas comparten. Ser dueño o administrador no da acceso por sí solo.',
      },
      history: {
        title: 'Su historial es suyo',
        text: 'Si la relación termina, tu organización deja de verlo y la persona se lleva todo lo que entrenó.',
      },
    },
  },
  modules: {
    title: ['Lo que gestionas', 'desde Studio.'],
    lead: 'Lo que hoy llevas en hojas de cálculo y chats, en un solo lugar.',
    items: {
      people: {
        name: 'Personas',
        description: 'Invitaciones, relaciones y seguimiento de clientes',
      },
      training: {
        name: 'Entrenamiento',
        description: 'Plantillas, programas, asignaciones e historial de versiones',
      },
      progress: {
        name: 'Progreso',
        description: 'Sesiones registradas, adherencia y resultados compartidos',
      },
      team: { name: 'Equipo', description: 'Miembros, roles y permisos' },
      plans: {
        name: 'Planes',
        description:
          'Planes que vendes y suscripciones activas. Cada pago pasa por tu propia pasarela.',
      },
    },
    upcoming: {
      label: 'Más adelante',
      text: 'Agenda y reservas, clases y cupos, página pública y marketplace.',
    },
    space: {
      title: 'Tus clientes entrenan en Allfit Space',
      text: 'Ahí siguen el programa que les asignas, registran cada serie y deciden qué te comparten.',
      cta: 'Conocer Allfit Space',
    },
  },
  closing: {
    title: ['Tu próximo cliente', 'empieza con una invitación.'],
    cta: 'Crear mi espacio',
    note: 'Tu cuenta de Allfit One sirve para Studio y para Space.',
  },
  footer: {
    nvidia: 'Allfit One es miembro de NVIDIA Inception.',
    privacy: 'Privacidad',
    rights: '© 2026 Allfit One',
  },
}

export type Dictionary = typeof es
