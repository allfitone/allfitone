/**
 * Spanish copy for the Space landing.
 *
 * This is the shape every other language must match: `Dictionary` is derived
 * from it, so a missing or extra key in English is a type error, and the unit
 * test also rejects empty strings.
 */

export const es = {
  meta: {
    title: 'Allfit Space | App de entrenamiento y nutrición',
    description:
      'App de entrenamiento y nutrición: sigue un programa para tu objetivo, supera tus series de la vez anterior y lleva tus comidas frente a tu meta. Gratis.',
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
    join: 'Únete a la lista',
  },
  stores: {
    soon: 'Próximamente en',
    appStore: 'App Store',
    googlePlay: 'Google Play',
    download: 'Descárgala en',
  },
  hero: {
    lines: ['SUPERA', 'TU ÚLTIMA', 'SESIÓN.'],
    lead: 'Un programa para tu objetivo, cada serie anotada y lo que comes frente a tu meta. Todo en una app, para que tu próxima sesión le gane a esta.',
    join: 'Únete a la lista de espera',
    todayAlt: 'Pantalla Hoy de Allfit Space: la sesión de Tirón del día y el resumen de la semana.',
    programAlt:
      'Detalle del programa Torso y pierna: 10 semanas, 4 días por semana y sus sesiones.',
  },
  features: {
    title: ['DE LA PRIMERA SERIE', 'AL ÚLTIMO BOCADO.'],
    cards: [
      {
        title: 'TU SEMANA, A LA VISTA',
        text: 'Qué toca hoy y cuánto llevas esta semana.',
        alt: 'Pantalla Hoy con el resumen de la semana y las sesiones que ya hiciste.',
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
        text: 'Aceptar a un gimnasio no le muestra nada. Tú decides si ve tu entrenamiento con ellos, tus medidas y fotos o tus comidas.',
      },
      {
        title: 'Lo cortas cuando quieras',
        text: 'Tocas «Quitar» y dejan de verlo al instante. Si terminas con un gimnasio, conserva solo lo que le compartiste hasta ese día, y también se lo puedes quitar.',
      },
      {
        title: 'Te vas con todo',
        text: 'Si dejas un gimnasio, tus programas, tus series y tus récords siguen en tu cuenta, y sigues desde donde ibas.',
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
  },
  pro: {
    title: ['¿TU GIMNASIO PAGA', 'ALLFIT STUDIO?', 'PRO VA INCLUIDO.'],
    text: 'La app es gratis. Allfit Pro te da programas ilimitados y todo tu progreso en detalle. Si tu gimnasio o tu entrenador tiene un plan pago de Allfit Studio, Pro va incluido mientras sigas con ellos.',
    alt: 'Atleta haciendo curl de bíceps con una mancuerna en cada mano.',
  },
  studio: {
    title: '¿Tienes un gimnasio o entrenas a otros?',
    text: 'Invita a tus clientes, asígnales su programa y acompáñalos desde Allfit Studio.',
    cta: 'Conocer Allfit Studio',
  },
  closing: {
    title: ['CADA SEMANA,', 'UN POCO MÁS.'],
  },
  // The waitlist follows the owner's launch strategy (November 2026). The landing's
  // section is only the title, the lead and the form; the offer lives on `/waitlist`.
  waitlist: {
    title: ['SÉ DE LOS', 'PRIMEROS 100.'],
    lead: 'Únete a la lista de espera y te avisamos cuando abra Allfit Space. Las primeras 100 personas que confirmen su correo serán sus Founding Members.',
  },
  form: {
    nameLabel: 'Tu nombre',
    emailLabel: 'Tu correo',
    // Ley 1581 de 2012: joining needs the person's authorization. The brackets mark the link.
    consent: 'Autorizo a Allfit One a tratar mis datos según su [política de privacidad].',
    referredBy: 'Te unes con el código {code}.',
    submit: 'Unirme a la lista',
    pending: 'Un momento…',
    errorNameEmpty: 'Escribe tu nombre para unirte.',
    errorEmailEmpty: 'Escribe tu correo para unirte.',
    errorEmailInvalid: 'Revisa el correo: necesita la forma nombre@correo.com.',
    errorConsent: 'Para unirte necesitamos tu autorización.',
    failed: 'No pudimos apuntarte. Inténtalo de nuevo o escríbenos a {email}.',
    joinedTitle: 'Ya estás en la lista, {name}.',
    joinedBody:
      'Confirma tu correo con el enlace que te enviamos a {email}. Tu lugar cuenta desde ese momento.',
    codeLabel: 'Tu código',
    linkLabel: 'Tu link',
    copy: 'Copiar',
    copied: 'Copiado',
    copiedAnnouncement: 'Link copiado.',
    whatsapp: 'Compartir por WhatsApp',
    share: 'Compartir',
    shareMessage:
      'Me uní a la lista de espera de Allfit Space, la app de entrenamiento y nutrición de Allfit One. Únete con mi link: {link}',
    registered: 'Registrados con tu link: {count}.',
    rewardRule:
      'Para los premios de Allfit Pro cuentan los activos: desde el lanzamiento crean su cuenta y registran 3 entrenamientos o comidas en sus primeros 14 días.',
    reset: 'Usar otro correo',
    errorEmailDisposable:
      'Ese correo es desechable. Usa uno que revises: ahí te llega la confirmación.',
    rateLimited: 'Hubo demasiados intentos desde esta conexión. Inténtalo de nuevo en una hora.',
    listedTitle: 'Ya estabas en la lista, {name}.',
    listedBody:
      'Te escribimos de nuevo a {email}: ese correo trae tu link, o el enlace para confirmar si te falta.',
  },
  founding: {
    title: 'Founding Members',
    rows: [
      {
        term: 'Tu número',
        value:
          'Del #001 al #100, en el orden en que confirmas tu correo. Queda en tu perfil de Allfit Space.',
      },
      {
        term: 'Acceso anticipado',
        value: 'Entras a Allfit Space antes del lanzamiento, en una beta cerrada.',
      },
      {
        term: 'Allfit Pro',
        value:
          'Precio de fundador en el plan mensual, de por vida mientras no canceles. Es tuyo si te suscribes en los 6 meses siguientes al lanzamiento.',
      },
      {
        term: 'El equipo',
        value:
          'Un canal directo con quienes construyen Allfit Space, para proponer mejoras y conocer primero lo que viene.',
      },
    ],
  },
  referrals: {
    title: 'Invita y gana Allfit Pro',
    text: 'Al unirte recibes tu propio link. Cada persona que se une con él suma a tu nivel cuando está activa: crea su cuenta en Allfit Space después del lanzamiento y registra 3 entrenamientos o comidas en sus primeros 14 días.',
    people: '{count} referidos activos',
    // Keyed by the level (`REFERRAL_LEVELS`), never by position.
    rewards: {
      5: '1 mes de Allfit Pro',
      15: '2 meses de Allfit Pro',
      30: '3 meses de Allfit Pro',
      100: '1 año de Allfit Pro y merch de Allfit One',
    },
    note: 'Cada nivel que alcanzas suma su premio: con 30 referidos activos recibes 6 meses de Allfit Pro.',
  },
  waitlistPage: {
    meta: {
      title: 'Lista de espera | Allfit Space',
      description:
        'Únete a la lista de espera de Allfit Space: las primeras 100 personas que confirmen su correo serán Founding Members, y cada persona que invites te acerca a meses de Allfit Pro.',
    },
    title: ['LOS PRIMEROS 100', 'SON FOUNDING', 'MEMBERS.'],
    lead: 'Únete a la lista de espera y te avisamos cuando abra Allfit Space. Si estás entre las primeras 100 personas que confirman su correo, entras como Founding Member. Y cada persona que se une con tu link te acerca a meses de Allfit Pro.',
    joinTitle: 'Únete a la lista de espera',
    pro: {
      title: 'Qué es Allfit Pro',
      text: 'Allfit Space es gratis. Allfit Pro es su suscripción opcional: programas ilimitados y todo tu progreso en detalle.',
      rows: [
        {
          term: 'Si tu gimnasio paga Allfit Studio',
          value:
            'Si tu gimnasio o tu entrenador tiene un plan pago de Allfit Studio, Allfit Pro va incluido mientras sigas con ellos. El plan gratis de Studio no lo incluye.',
        },
        {
          term: 'Tus datos',
          value:
            'Controlarlos nunca se paga. Decidir qué compartes y con quién es gratis en cualquier plan.',
        },
        {
          term: 'Si vuelves al plan gratuito',
          value:
            'No se borra nada. En el plan gratis ves tu último mes; con Allfit Pro vuelves a verlo todo.',
        },
      ],
    },
    terms: {
      title: 'Condiciones',
      items: [
        'Founding Members son las primeras 100 personas que se unen a la lista de espera y confirman su correo. Su número, del #001 al #100, sigue el orden en que lo confirman.',
        'Para conservarlo, crea tu cuenta en Allfit Space con el mismo correo durante la beta cerrada o en los 7 días siguientes al lanzamiento. Si no, tu lugar pasa a la siguiente persona de la lista.',
        'El precio de fundador aplica al plan mensual de Allfit Pro si te suscribes en los 6 meses siguientes al lanzamiento, y se mantiene mientras no canceles, aunque el precio suba. Si cancelas, lo pierdes; un pago fallido mientras la tienda lo reintenta no cuenta como cancelación.',
        'El estatus es personal y no se transfiere. Solo se pierde si borras tu cuenta o por fraude comprobado.',
        'Una persona que invitas suma a tu contador cuando se une con tu link o tu código y confirma su correo. Para los premios cuenta cuando está activa: crea su cuenta en Allfit Space después del lanzamiento, con el mismo correo, y registra al menos 3 entrenamientos o comidas en sus primeros 14 días. Cuenta una sola vez.',
        'Los niveles se suman: recibes el premio de cada nivel que alcances. Con 30 referidos activos son 1 + 2 + 3 = 6 meses de Allfit Pro. Ser Founding Member no impide ganarlos.',
        'Los meses de Allfit Pro llegan como un código de oferta de App Store o Google Play. Al terminar, la suscripción se renueva sola, salvo que la canceles antes en la tienda.',
        'No cuentan los correos desechables, los registros repetidos desde un mismo dispositivo ni las invitaciones a ti mismo.',
        'Nada se sortea: los lugares se asignan por orden y los premios por el número de referidos activos.',
      ],
    },
  },
  // The pages the waitlist emails link to. Private: none of them is indexed.
  linkPages: {
    checking: 'Revisando tu enlace…',
    failedTitle: 'No pudimos revisar tu enlace.',
    failedBody: 'Inténtalo de nuevo en un momento. Si sigue igual, escríbenos a {email}.',
    rateLimited: 'Hubo demasiados intentos desde esta conexión. Inténtalo de nuevo en una hora.',
    retry: 'Intentar de nuevo',
    home: 'Ir a Allfit Space',
    confirm: {
      meta: {
        title: 'Confirma tu correo | Allfit Space',
        description:
          'Confirma tu correo para que tu lugar en la lista de espera de Allfit Space cuente.',
      },
      pending: 'Confirmando tu correo…',
      confirmedTitle: 'Correo confirmado.',
      confirmedBody:
        'Tu lugar en la lista cuenta desde ahora. Te escribimos a este correo cuando abra Allfit Space.',
      alreadyTitle: 'Tu correo ya estaba confirmado.',
      alreadyBody: 'Tu lugar en la lista sigue contando. Te escribimos cuando abra Allfit Space.',
    },
    referrals: {
      meta: {
        title: 'Tu link | Allfit Space',
        description: 'Tu código, tu link y cuántas personas se unieron con él.',
      },
      title: 'Tu link de Allfit Space',
      body: 'Cada persona que se une con tu link y confirma su correo suma a tu contador.',
      unconfirmedTitle: 'Te falta confirmar tu correo.',
      unconfirmedBody:
        'Busca el correo de Allfit Space en tu bandeja y abre el enlace: tu lugar en la lista cuenta desde ese momento.',
      leave: 'Salir de la lista',
    },
    leave: {
      meta: {
        title: 'Salir de la lista | Allfit Space',
        description: 'Sal de la lista de espera de Allfit Space y borra tus datos.',
      },
      title: '¿Seguro que quieres salir de la lista?',
      body: 'Borramos tu nombre, tu correo y tu código. Pierdes tu lugar, y las personas que invitaste siguen en la lista pero dejan de contar para ti. No se puede deshacer.',
      submit: 'Sí, salir de la lista',
      pending: 'Saliendo…',
      stay: 'Quedarme en la lista',
      leftTitle: 'Saliste de la lista.',
      leftBody:
        'Borramos tus datos y todos tus enlaces dejaron de funcionar. Si cambias de opinión, puedes unirte de nuevo.',
      join: 'Unirme de nuevo',
    },
    invalid: {
      title: 'Este enlace ya no sirve.',
      body: 'Puede estar incompleto, haber vencido o ser de alguien que salió de la lista. Escribe tu correo y, si está en la lista, te enviamos uno nuevo.',
      emailEmpty: 'Escribe tu correo para recibir el enlace.',
      submit: 'Enviarme un enlace nuevo',
      sentTitle: 'Revisa tu correo.',
      sentBody:
        'Si {email} está en la lista, te llega un correo con un enlace nuevo en unos minutos.',
    },
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
    analytics: 'Analítica',
    studio: 'Allfit Studio',
    rights: '© 2026 Allfit One',
    newWindow: 'Se abre en una pestaña nueva.',
  },
}

export type Dictionary = typeof es
