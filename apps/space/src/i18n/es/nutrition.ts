/**
 * Nutrition (`N-*`, `R-*`): the food tab, a meal and its capture, the goal, the history.
 *
 * Grams, kilocalories and millilitres are the same in every language and stay in code.
 * Food and catalogue names are data and never come through here.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

import type { FormMode } from '../../client/nutrition'

type NutrientCode = AllfitV1Schemas['NutrientCode']
type MealType = AllfitV1Schemas['MealType']
type HoldReason = NonNullable<AllfitV1Schemas['MealDeletionHeld']['hold']>['reason_code']
type Macro = 'protein' | 'carbohydrates' | 'fat'

const nutrients: Readonly<Record<NutrientCode, string>> = {
  energy: 'Energía',
  protein: 'Proteína',
  carbohydrates: 'Carbohidratos',
  fat: 'Grasa',
  fiber: 'Fibra',
  water: 'Agua',
  saturated_fat: 'Grasas saturadas',
  trans_fat: 'Grasas trans',
  cholesterol: 'Colesterol',
  sodium: 'Sodio',
  sugars: 'Azúcares',
  vitamin_a: 'Vitamina A',
  vitamin_c: 'Vitamina C',
  vitamin_d: 'Vitamina D',
  vitamin_e: 'Vitamina E',
  vitamin_k: 'Vitamina K',
  thiamin: 'Vitamina B1',
  riboflavin: 'Vitamina B2',
  niacin: 'Vitamina B3',
  pantothenic_acid: 'Vitamina B5',
  vitamin_b6: 'Vitamina B6',
  vitamin_b12: 'Vitamina B12',
  folate: 'Folato',
  calcium: 'Calcio',
  iron: 'Hierro',
  magnesium: 'Magnesio',
  phosphorus: 'Fósforo',
  potassium: 'Potasio',
  zinc: 'Zinc',
  selenium: 'Selenio',
  copper: 'Cobre',
}

const meals: Readonly<Record<MealType, string>> = {
  breakfast: 'Desayuno',
  lunch: 'Almuerzo',
  dinner: 'Cena',
  snack: 'Snack',
  other: 'Otra',
}

// Spanish gives each meal its own article, and «Otra» has none.
const articled: Readonly<Record<MealType, string>> = {
  breakfast: 'el desayuno',
  lunch: 'el almuerzo',
  dinner: 'la cena',
  snack: 'el snack',
  other: 'esta comida',
}
const feminine: ReadonlySet<MealType> = new Set(['dinner', 'other'])

const holdGrounds: Readonly<Record<HoldReason, string>> = {
  judicial_order: 'una orden judicial',
  regulatory_request: 'un requerimiento de una autoridad',
  service_dispute: 'una disputa sobre el servicio',
  tax_or_accounting_obligation: 'una obligación contable o tributaria',
}

const modeNames: Readonly<Record<FormMode, string>> = {
  exact: 'Exacta',
  minimum: 'Mínimo',
  maximum: 'Máximo',
  range: 'Rango',
  none: 'Sin meta',
}

const macroLegend: Readonly<Record<Macro, string>> = {
  protein: 'proteína',
  carbohydrates: 'carbos',
  fat: 'grasa',
}

const items = (count: number) => `${String(count)} ${count === 1 ? 'ítem' : 'ítems'}`

export const nutrition = {
  nutrients,
  /** Where a card is narrow, as the macro cards are: «Carbohidratos» would wrap. */
  nutrientsShort: { ...nutrients, carbohydrates: 'Carbos' } as Readonly<
    Record<NutrientCode, string>
  >,
  /** The macros as the per-item line abbreviates them: «12P · 30C · 8G». */
  macroLetters: { protein: 'P', carbohydrates: 'C', fat: 'G' } as Readonly<Record<Macro, string>>,
  macroLegend,
  meals,
  /** «Snack guardado», «Cena guardada»: agrees with the meal; «Otra» reads «Comida». */
  mealSaved: (type: MealType) =>
    `${type === 'other' ? 'Comida' : meals[type]} ${feminine.has(type) ? 'guardada' : 'guardado'}`,
  /** «Añadir al snack», «Añadir a la cena»: «a» + «el» contracts to «al». */
  addToMeal: (type: MealType) =>
    `Añadir ${articled[type].replace(/^el /, 'al ').replace(/^(la|esta) /, 'a $1 ')}`,
  deleteMeal: (type: MealType) => `¿Eliminar ${articled[type]}?`,
  undoMeal: (type: MealType) => `Deshacer: borrar ${articled[type]}`,
  saveMeal: (type: MealType) => `Guardar ${meals[type].toLowerCase()}`,
  /** Sunday first, as `Date.getUTCDay()` counts. */
  weekdays: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  weekdayLetters: ['D', 'L', 'M', 'X', 'J', 'V', 'S'],
  today: 'Hoy',
  yesterday: 'Ayer',
  /** «Domingo 27». */
  dayTitle: (weekday: string, day: number) => `${weekday} ${String(day)}`,
  emptyDays: (count: number) => `${String(count)} días sin registro: no cuentan como cero.`,
  emptyDay: (weekday: string) =>
    `El ${weekday.toLowerCase()} no registraste nada: no cuenta como cero.`,
  held: {
    pending: 'Ya la estamos eliminando; desaparecerá en un momento.',
    grounds: holdGrounds,
    kept: (ground: string, until: string) =>
      `No la eliminamos todavía: la conservamos por ${ground} hasta el ${until}. Se eliminará sola cuando termine.`,
  },
  minimum: (figure: string) => `mín. ${figure}`,
  maximum: (figure: string) => `máx. ${figure}`,
  /** «Meta 2.300»: a goal said in passing, beside what was eaten. */
  goal: (figure: string) => `Meta ${figure}`,
  /** Under a macro's eaten figure, on its own line: «De mín. 120 g». */
  goalLine: (figure: string, unit: string) => `De ${figure} ${unit}`,
  noGoal: 'Sin meta',
  range: {
    belowLine: 'Te faltan para tu mínimo',
    belowCenter: 'Del mínimo',
    withinLine: 'Margen hasta tu máximo',
    withinCenter: 'En meta',
    eaten: (figure: string) => `Consumido ${figure}`,
    aboveLine: 'Por encima de tu máximo',
    aboveCenter: 'De más',
  },
  prompt: {
    more: '¿Comiste algo más?',
    breakfast: '¿Qué desayunaste?',
    lunch: '¿Qué almorzaste?',
    snack: '¿Qué comiste?',
    dinner: '¿Qué cenaste?',
    protein: (figure: string) => `${figure} g de proteína`,
    left: (parts: string) => `Restante: ${parts}`,
  },
  compare: {
    added: (target: string) => `Nueva · ${target}`,
    dropped: (target: string) => `${target} → Sin meta`,
    unchanged: (target: string) => `${target} · sin cambio`,
  },
  /** What the field holding one end of a target is called. */
  captions: {
    from: 'Desde',
    to: 'Hasta',
    minimum: 'Al menos',
    maximum: 'Como máximo',
    exact: 'Exactamente',
  },
  modeNames,
  done: 'Listo',
  percent: (share: number) => `${String(share)} %`,
  whatYouAte: 'Qué comiste',
  /** What the person or a coach wrote, quoted as each language quotes. */
  quoted: (words: string) => `«${words}»`,
  items,
  mealReadFailed: 'No pudimos abrir esta comida. Inténtalo otra vez.',
  mealSaveFailed: 'No pudimos guardar la comida. Inténtalo otra vez.',
  closeUnsaved: 'Cerrar sin guardar',
  photoNotUploaded: 'La foto no se pudo subir',
  food: {
    readFailed: 'No pudimos cargar tu día. Inténtalo otra vez.',
    streak: (days: number) => `Racha de ${String(days)} días`,
    history: 'Historial de comidas',
    myGoal: 'Mi meta',
    proposes: (name: string) => `${name} te propone una meta`,
    yourProfessional: 'Tu profesional',
    foods: (count: number) => `${String(count)} ${count === 1 ? 'Alimento' : 'Alimentos'}`,
    freeWorkout: 'Entreno libre',
    workoutLine: (trained: string, sets: number) => `${trained} · ${String(sets)} series`,
    workout: 'Entreno',
    add: 'Añadir',
    logMeal: 'Registrar una comida',
    undo: 'Deshacer',
    leftToday: 'Restante para hoy',
    eatenToday: 'Consumido hoy',
    eatenAndGoal: (eaten: string, goal: string) => `Consumido ${eaten} · Meta ${goal}`,
    setGoal: 'Fija tu meta',
    eaten: 'Consumido',
    photoRetryLabel: 'La foto no se subió. Reintentar',
    photoRetry: 'La foto no se subió · Reintentar',
    page: (page: number, of: number) => `Página ${String(page)} de ${String(of)}`,
  },
  meal: {
    photoFailed: 'No pudimos guardar la foto. Inténtalo otra vez.',
    deleteFailed: 'No pudimos eliminarla. Inténtalo otra vez.',
    more: 'Más opciones',
    withPhoto: ' · con foto',
    shareOfYourDay: (percent: number) => `${String(percent)} % de tu día`,
    shareOfDay: (percent: number) => `${String(percent)} % del día`,
    noMacros: 'Sin macros registrados',
    whole: (grams: number) => `Toda la comida (${String(grams)} g)`,
    changePhoto: 'Cambiar foto',
    correct: 'Corregir',
    deleted: 'Comida eliminada',
    deletedBody: 'Tu día ya no la cuenta.',
    deleteBody: 'Se borran la comida, sus ítems, sus nutrientes y la foto. No queda ninguna copia.',
    dayAfter: 'Tu día queda así',
    proteinAfter: (before: number, after: number) =>
      `Proteína ${String(before)} → ${String(after)} g`,
    delete: 'Eliminar',
    correctDetail: 'Cambia los alimentos, sus valores o la nota',
    changePhotoDetail: 'Elige otra de tu galería',
    deleteMeal: 'Eliminar comida',
    deleteMealDetail: 'Se borra de tu día y no se puede recuperar',
  },
  history: {
    readFailed: 'No pudimos cargar tu historial. Inténtalo otra vez.',
    title: 'Historial',
    span: 'Cuántos días',
    days: (count: number) => `${String(count)} días`,
    average: 'Promedio diario',
    loggedDays: (count: number) =>
      `En ${String(count)} ${count === 1 ? 'día' : 'días'} con registro`,
    dayByDay: 'Día a día',
    hidden: 'Guardado: lo vuelves a ver con Pro',
    nothing: 'Sin registro',
    meals: (count: number) => `${String(count)} ${count === 1 ? 'comida' : 'comidas'}`,
  },
  item: {
    backToMeal: 'Volver a la comida',
    closeWithoutAdding: 'Cerrar sin añadir',
    changeFood: 'Cambiar alimento',
    chooseFood: 'Elegir alimento',
    openFoodFacts: 'Datos de Open Food Facts (ODbL)',
    remove: 'Quitar de la comida',
  },
  proposal: {
    readFailed: 'No pudimos abrir la propuesta. Inténtalo otra vez.',
    decideFailed: 'No pudimos guardar tu decisión. Inténtalo otra vez.',
    title: 'Tu meta de nutrición',
    from: (organization: string) => `Desde ${organization}`,
    now: 'Ahora',
    proposed: 'Propuesta',
    accepted: 'La aceptaste: es tu meta actual.',
    decided: 'Ya decidiste sobre esta propuesta.',
    reject: 'Rechazar',
    accept: 'Aceptar esta meta',
    note: 'Si la aceptas, reemplaza tu meta actual. Si la rechazas, no cambia nada.',
    ownGoal: 'Tu meta actual es propia',
    acceptedGoal: 'Tu meta actual es una propuesta aceptada',
    /** `month` is the short name from `common.months`. */
    since: (day: number, month: string, version: number) =>
      `Vigente desde el ${String(day)} ${month} · versión ${String(version)}`,
  },
  goalForm: {
    publishFailed: 'No pudimos publicar tu meta. Inténtalo otra vez.',
    close: 'Cerrar sin publicar',
    title: 'Mi meta',
    dailyEnergy: 'Energía diaria',
    energyKind: 'Energía exacta o en rango',
    energyFromTitle: 'Energía · desde',
    energyExactTitle: 'Energía · exacta',
    energyToTitle: 'Energía · hasta',
    energyFromLabel: 'Energía, desde',
    energyToLabel: 'Energía, hasta',
    /** Read aloud for the energy figure: «Energía, desde». */
    energyField: (label: string) => `Energía, ${label.toLowerCase()}`,
    macros: 'Macronutrientes',
    ofKcal: 'De kcal',
    noGoal: 'sin meta',
    /** A tile read aloud: «Proteína: Mínimo, 120 g. Editar». */
    edit: (name: string, detail: string) => `${name}: ${detail}. Editar`,
    kind: (name: string) => `Tipo de meta para ${name}`,
    leftOut: (name: string) => `${name} queda fuera de tu meta.`,
    replaces: 'Reemplaza tu meta actual, que queda en el historial.',
    publish: 'Publicar mi meta',
    less: (label: string) => `Menos, ${label}`,
    more: (label: string) => `Más, ${label}`,
  },
  log: {
    photoFailed:
      'La comida quedó guardada, pero la foto no subió. Puedes añadirla desde su detalle.',
    cells: {
      energy: 'KCAL',
      protein: 'PROT.',
      carbohydrates: 'CARBOS',
      fat: 'GRASA',
      fiber: 'FIBRA',
      water: 'AGUA',
    },
    /** «27/09»: a day that is not today, in the pill. */
    shortDate: (day: string, month: string) => `${day}/${month}`,
    timeLocked: 'La hora y el día no cambian al corregir',
    addingUp: 'se suman a medida que escribes',
    foodName: 'Nombre del alimento',
    foodExample: 'Pechuga de pollo',
    grams: 'Gramos',
    removeFood: 'Quitar el alimento',
    blankStaysBlank: 'lo que no escribas queda vacío, no en cero',
    unnamed: 'Alimento sin nombre',
    addFood: 'Añadir alimento',
    note: 'Nota · opcional',
    noteLabel: 'Nota',
    noteExample: 'Después del entreno, con más arroz',
    saveCorrection: 'Guardar corrección',
    timeLockedLabel: (day: string, time: string) => `${day} ${time}, no cambia al corregir`,
    timeLabel: (day: string, time: string) => `Hora: ${day} ${time}. Cambiar`,
    photo: 'Foto de la comida',
    takePhoto: 'Tomar foto',
    fromLibrary: 'Elegir de la galería',
    removePhoto: 'Quitar la foto',
    time: 'Hora de la comida',
    wheels: { hour: 'Hora', minute: 'Minutos', period: 'Mañana o tarde' },
    conflictTitle: 'Esta comida cambió en otro dispositivo',
    conflictBody:
      'Mientras corregías, se guardó otra versión. No la sobrescribimos: revísala y vuelve a aplicar tu corrección si sigue haciendo falta.',
    seeSaved: 'Ver la versión guardada',
    discard: 'Descartar mi corrección',
  },
  capture: {
    recognitionFailed:
      'No pudimos reconocer la foto. Búscalos en «Alimentos»; la foto se queda con la comida.',
    consentMissing:
      'Actualiza la app para reconocer tu comida con una foto. Mientras tanto, búscala en «Alimentos».',
    cameraNeeded: 'Para fotografiar tu comida, Allfit necesita la cámara.',
    allowCamera: 'Permitir la cámara',
    backToCamera: 'Volver a la cámara',
    changeMeal: (meal: string, time: string) => `${meal}, ${time}. Cambiar la comida`,
    frame: 'Encuadra todo el plato',
    fromLibrary: 'Elegir una foto de la galería',
    shoot: 'Tomar la foto',
    photo: 'Foto',
    foods: 'Alimentos',
    pro: (label: string) => `${label} · Pro`,
    discardTitle: '¿Descartar lo escaneado?',
    discard: 'Descartar y volver a la cámara',
    keepReviewing: 'Seguir revisando',
    recognising: 'Reconociendo alimentos…',
    adjust: (name: string, toReview: boolean) =>
      `${name}${toReview ? ', por revisar' : ''}. Ajustar`,
    adjustItem: (name: string, portion: string, estimated: boolean) =>
      `${name}, ${portion}${estimated ? ', estimado con IA' : ''}. Ajustar`,
    calculatedWithAi: 'Calculado por Allfit con IA',
    addMissing: 'Agregar ingrediente',
    ai: 'IA',
    isThisIt: '¿Es esto?',
    chooseFood: 'Elige el alimento',
    search: 'Buscar un alimento',
    searchCorrect: 'Busca el alimento correcto',
    searchAnother: 'Añade otro alimento',
    searchExample: 'Busca: arroz, huevo, banano…',
    notFound: 'No encontramos ese alimento.',
    yourMeal: (type: MealType, count: number) =>
      `Tu ${meals[type].toLowerCase()} · ${String(count)} ${count === 1 ? 'alimento' : 'alimentos'}`,
    frequent: 'Lo que más registras',
    openFoodFacts: 'Productos empacados con datos de Open Food Facts (ODbL)',
    calculatedLine: (protein: number, carbohydrates: number, fat: number) =>
      `Calculado por Allfit · ${String(protein)} g P · ${String(carbohydrates)} g C · ${String(fat)} g G`,
    addAndWeCount: 'Añade alimentos y calculamos todo',
    quickAdd: (name: string, detail: string) => `Añadir ${name}, ${detail}`,
  },
  editor: {
    howMuch: '¿Cuánto comiste?',
    values: 'Valores',
    valuesHint: 'Toca un valor para corregirlo',
    restore: 'Volver a lo calculado',
    estimated: 'Estimado con IA',
    calculated: 'Calculado por Allfit',
  },
  consent: {
    title: 'Reconocer tu comida',
    accept: 'Aceptar y reconocer',
    decline: 'Ahora no',
    /** Each consent version is a text: the one that names where the photo goes (ADR-045). */
    texts: {
      '2026-10-04':
        'Para reconocer los alimentos, la foto se envía a Google (Gemini) a través de Vercel, sin su ubicación ni sus datos de cámara. No se guarda allá ni se usa para entrenar modelos. Las calorías salen del catálogo de Allfit, y tú revisas todo antes de guardar.',
      '2026-11-15':
        'Para reconocer los alimentos, la foto se envía a Claude, un modelo de Anthropic que funciona en Amazon Web Services, en Estados Unidos, sin su ubicación ni sus datos de cámara. No se guarda allá ni se usa para entrenar modelos. Las calorías salen del catálogo de Allfit One, y tú revisas todo antes de guardar.',
    } as Readonly<Record<string, string>>,
  },
  menu: {
    close: 'Cerrar el menú',
    hint: (meal: string) => `Allfit eligió «${meal}» por la hora. Si no es, eliges otra aquí.`,
  },
  facts: {
    number: 'Número',
    fraction: 'Fracción',
    amount: 'Cantidad',
    unit: 'Unidad',
    unitLabel: (unit: string) => `Unidad: ${unit}. Cambiar`,
    format: 'Formato',
    writeAs: 'Escribir la cantidad como',
    plus: (glyph: string) => `Sumar ${glyph}`,
    cells: {
      energy: 'Kcal',
      protein: 'Proteínas (g)',
      carbohydrates: 'Carbs (g)',
      fat: 'Grasas (g)',
    },
    cellLabel: (name: string, mine: boolean, estimated: boolean) =>
      `${name}${mine ? ', editado por ti' : estimated ? ', estimado con IA' : ''}`,
    mine: 'Tuyo',
    ai: 'IA',
    names: {
      energy: 'Calorías',
      fat: 'Grasas totales',
      carbohydrates: 'Carbohidratos totales',
      protein: 'Proteínas',
    },
    estimated: 'Valores estimados con IA',
    title: 'Información nutricional',
    portion: 'Porción',
    micros: 'Micronutrientes',
    noMicros: 'Este alimento no trae vitaminas ni minerales.',
    vitamins: 'Vitaminas',
    minerals: 'Minerales',
  },
}
