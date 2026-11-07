/**
 * Spanish copy for the Space landing.
 *
 * This is the shape every other language must match: `Dictionary` is derived
 * from it, so a missing or extra key in English is a type error, and the unit
 * test also rejects empty strings.
 */

export const es = {
  meta: {
    title: 'Allfit Space · La app para entrenar con plan, no con suerte',
    description:
      'App de entrenamiento y nutrición: tu programa, cada serie y lo que comes en un solo lugar. Tu historial viaja contigo y tus datos son tuyos.',
    shareImageAlt:
      'Una atleta prepara un peso muerto con la barra cargada en un gimnasio en penumbra.',
  },
  nav: {
    skip: 'Saltar al contenido',
    label: 'Principal',
    features: 'La app',
    programs: 'Programas',
    privacy: 'Privacidad',
    gyms: 'Gimnasios',
    language: 'Idioma',
    home: 'Allfit Space, inicio',
  },
  stores: {
    soon: 'Próximamente en',
    appStore: 'App Store',
    googlePlay: 'Google Play',
    download: 'Descárgala en',
  },
  hero: {
    lines: ['ENTRENA', 'CON PLAN.', 'NO CON SUERTE.'],
    lead: 'Tu programa, cada serie y lo que comes, en una sola app. Si cambias de gimnasio, tu historial se va contigo.',
    todayAlt: 'Pantalla Hoy de Allfit Space: la sesión de Tirón del día y el resumen de la semana.',
    programAlt:
      'Detalle del programa Torso y pierna: 10 semanas, 4 días por semana y sus sesiones.',
    scroll: 'Desliza',
  },
  ticker: ['Fuerza', 'Hipertrofia', 'Carrera', 'Nutrición', 'Récords', 'Constancia'],
  features: {
    title: ['DEL PRIMER SET', 'AL ÚLTIMO BOCADO.'],
    cards: [
      {
        title: 'TU SEMANA, A LA VISTA',
        text: 'Qué toca hoy, cuánto llevas esta semana y todo lo que ya entrenaste.',
        alt: 'Pantalla Hoy con el resumen semanal y el historial de sesiones.',
      },
      {
        title: 'CADA SERIE CUENTA',
        text: 'Ves lo que levantaste la vez anterior y le ganas, serie por serie.',
        alt: 'Sesión en curso con las series de dominadas y el peso anterior.',
      },
      {
        title: 'LO QUE COMES, CONTRA TU META',
        text: 'Calorías y macros del día frente a la meta que va con tu programa.',
        alt: 'Registro de comidas del día con calorías y macros frente a la meta.',
      },
    ],
  },
  programs: {
    title: ['UN PROGRAMA', 'PARA TU OBJETIVO.'],
    lead: 'Le cuentas qué quieres lograr y cuánto has entrenado, y la app te propone por dónde empezar. Fuerza, hipertrofia, carrera o volver a moverte.',
    suggested: 'Sugerido para ti',
    items: [
      { name: 'TORSO Y PIERNA', meta: '4 días · 10 semanas' },
      { name: 'FUERZA BÁSICA', meta: '3 días · 8 semanas' },
      { name: 'MEDIA MARATÓN', meta: '4 días · 12 semanas' },
      { name: 'EMPUJE · TIRÓN · PIERNA', meta: '5 días · 12 semanas' },
    ],
  },
  privacy: {
    title: ['TUS DATOS', 'SON TUYOS.'],
    lead: 'Tu gimnasio y tu entrenador ven solo lo que tú aceptes, categoría por categoría. Y se lo quitas cuando quieras, sin perder nada tuyo.',
    alt: 'Pantalla Lo que compartes: cada gimnasio con las categorías que puede ver.',
    pillars: [
      {
        title: 'Nada se comparte solo',
        text: 'Aceptar a un gimnasio no comparte ningún dato. Eliges qué ve, categoría por categoría.',
      },
      {
        title: 'Lo cortas cuando quieras',
        text: 'Quitas un permiso y dejan de verlo al instante. Tus datos se quedan contigo.',
      },
      {
        title: 'Te vas con todo',
        text: 'Si dejas un gimnasio, tu historial se queda contigo y sigues entrenando sin perder nada.',
      },
    ],
  },
  records: {
    title: ['CADA', 'RÉCORD', 'SE CUENTA.'],
    lead: 'Terminas el entreno y la app ya tiene tu tarjeta lista: tu récord, los músculos que trabajaste o tu propia foto. A un toque de tus historias.',
    steps: [
      { verb: 'TERMINAS', text: 'La tarjeta se arma con tus datos reales.' },
      { verb: 'ELIGES', text: 'Músculos, récord o tu foto de fondo.' },
      { verb: 'PUBLICAS', text: 'Directo a tus historias, sin capturas.' },
    ],
    cards: [
      'Tarjeta de músculos: dorsales y espalda superior, trabajados en la sesión de Tirón.',
      'Tarjeta de récord personal: 35 kg en dominadas, 2,5 kg más que la vez anterior.',
      'Tarjeta de entreno completado con foto: sesión de Tirón, 26:05 y 1.920 kg en total.',
    ],
    editor: {
      label: 'Vista previa de una historia lista para publicar',
      caption: 'Añade un pie de foto…',
      story: 'Tu historia',
      friends: 'Amigos',
      published: 'Compartida en tu historia',
    },
    background: 'Atleta revisando su celular en el gimnasio después de entrenar.',
  },
  pro: {
    title: ['ALLFIT PRO,', 'INCLUIDO CON', 'TU GIMNASIO.'],
    text: 'La app es gratis. Allfit Pro te da programas ilimitados y todo tu progreso en detalle. Si tu gimnasio usa Allfit Studio, Pro te sale incluido mientras sigas con ellos.',
    alt: 'Atleta con audífonos concentrado antes de entrenar en el gimnasio.',
  },
  studio: {
    title: '¿Tienes un gimnasio o entrenas a otros?',
    text: 'Invita a tus clientes, asígnales su programa y acompáñalos desde Allfit Studio.',
    cta: 'Conocer Allfit Studio',
  },
  closing: {
    title: ['TU PRÓXIMO RÉCORD', 'YA TIENE PLAN.'],
  },
  nvidia: {
    member: 'Allfit One es miembro de NVIDIA Inception.',
    trademark:
      '© 2026 NVIDIA, the NVIDIA logo, and NVIDIA Inception are trademarks and/or registered trademarks of NVIDIA Corporation in the U.S. and other countries.',
    alt: 'NVIDIA Inception Program',
  },
  footer: {
    terms: 'Términos',
    privacy: 'Privacidad',
    studio: 'Allfit Studio',
    rights: '© 2026 Allfit One',
    newWindow: 'Se abre en una pestaña nueva.',
  },
}

export type Dictionary = typeof es
