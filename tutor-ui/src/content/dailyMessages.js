const reflections = [
  'Enseñar es sembrar posibilidades que pueden florecer mucho tiempo después.',
  'Una buena maestra inspira, motiva y puede cambiar una vida con una sola lección.',
  'Sos un faro que ayuda a encontrar el camino cuando aprender parece difícil.',
  'Tu amor por enseñar crea un ambiente cálido donde aprender se vuelve una experiencia hermosa.',
  'Enseñar es dejar una marca imborrable en el alma de quienes pasan por una clase.',
  'Una maestra dedicada deja huellas en los corazones de sus alumnos con cada enseñanza.',
  'Ser un buen ejemplo cultiva el amor por aprender e inspira a crecer como persona.',
  'Cada explicación paciente puede convertirse en la confianza que alguien necesitaba.',
  'El trabajo de una maestra llega mucho más lejos que el tiempo que dura una clase.',
  'Una gran maestra no solo comparte conocimientos: también despierta curiosidad y entusiasmo.',
  'Cada alumno que vuelve a intentarlo lleva una parte del acompañamiento que recibió.',
  'La paciencia con la que enseñás también es una forma profunda de cuidado.',
  'Hay contenidos que pueden olvidarse, pero los gestos de una buena maestra permanecen.',
  'Tu manera de enseñar puede transformar la forma en que un alumno se mira a sí mismo.',
  'Cada pequeña mejora de un alumno también habla del gran trabajo de quien lo acompaña.',
  'En cada clase construís un lugar donde equivocarse, preguntar y aprender es posible.',
  'Acompañar un proceso con paciencia vale tanto como celebrar el resultado final.',
  'Las huellas más profundas de la enseñanza suelen nacer de los gestos más sencillos.',
  'La dedicación de una maestra puede convertirse en un recuerdo luminoso para toda la vida.',
  'Enseñar también es prestar confianza hasta que el alumno logra encontrar la propia.',
  'Cada pregunta es una puerta nueva, y una buena maestra ayuda a abrirla.',
  'Una palabra de aliento en el momento justo puede cambiar por completo una historia.',
  'La vocación transforma el esfuerzo cotidiano en nuevas oportunidades para aprender.',
  'Detrás de cada avance hay tiempo, mirada, paciencia y una maestra que decidió creer.',
  'Lo que se enseña con amor deja marcas que ningún examen alcanza a medir.',
  'Cada clase es una oportunidad diferente para inspirar, acompañar y descubrir talentos.',
  'La enseñanza más valiosa muchas veces comienza con un simple “vos podés”.',
  'La constancia de una maestra ayuda a que sus alumnos descubran de qué son capaces.',
  'El conocimiento crece mejor cuando se comparte con generosidad, paciencia y alegría.',
  'Una maestra que sabe escuchar también enseña confianza, respeto y empatía.',
  'Cada día de enseñanza suma una página importante en la historia de muchos alumnos.',
  'Una mirada atenta puede descubrir talentos que todavía esperan una oportunidad.',
  'Enseñar es acompañar a una persona mientras aprende a encontrar su propio camino.',
  'Los grandes cambios suelen comenzar con una clase y una maestra que confía.',
  'Tu presencia puede hacer que aprender se sienta más cercano, amable y posible.',
  'Quien enseña con el corazón deja una huella capaz de atravesar los años.',
  'Una maestra paciente convierte la frustración en un nuevo intento y el miedo en confianza.',
  'Cada logro de un alumno guarda detrás muchas horas de dedicación que también merecen celebrarse.',
  'Enseñar con calidez permite que el aula se convierta en un espacio de encuentro y crecimiento.',
  'La mejor enseñanza no busca respuestas perfectas: ayuda a formar personas seguras y curiosas.',
]

const encouragements = [
  'Que hoy puedas reconocer todo lo bueno que sembrás.',
  'Tu esfuerzo importa, incluso cuando sus frutos no se ven enseguida.',
  'Seguí confiando en el enorme valor de lo que hacés.',
  'Hoy puede ser un gran día para enseñar y también para aprender algo nuevo.',
  'Recordá celebrar los avances pequeños, porque también construyen grandes cambios.',
  'Tu calidez es una parte esencial de todo lo que tus alumnos aprenden con vos.',
  'Que nunca te falte orgullo por el camino que construís cada día.',
  'Cada jornada trae una nueva oportunidad para dejar una huella bonita.',
  'Tu trabajo cotidiano merece ser reconocido, valorado y celebrado.',
  'La forma en que acompañás hace que cada enseñanza tenga un valor especial.',
  'Aun en un día difícil, tu presencia puede hacer una diferencia enorme.',
  'Todo el cariño que ponés en enseñar también forma parte del aprendizaje.',
  'Tu paciencia abre caminos que a veces parecían cerrados.',
  'Que hoy también encuentres motivos para disfrutar de tu vocación.',
  'Cada clase que preparás es una muestra concreta de compromiso y generosidad.',
  'Tu capacidad para volver a explicar puede devolverle la esperanza a un alumno.',
  'Lo que hacés tiene sentido, alcance y un valor que crece con el tiempo.',
  'Seguí enseñando con esa mezcla tan valiosa de firmeza, ternura y confianza.',
  'Que cada progreso de tus alumnos también te recuerde todo lo que sos capaz de lograr.',
  'Tu vocación convierte los días comunes en oportunidades que pueden cambiar historias.',
]

// 40 reflexiones × 20 mensajes de aliento = 800 combinaciones únicas.
export const DAILY_MESSAGES = reflections.flatMap((reflection) => (
  encouragements.map((encouragement) => `${reflection} ${encouragement}`)
))

const dayNumber = (date) => Math.floor(Date.UTC(
  date.getFullYear(),
  date.getMonth(),
  date.getDate(),
) / 86_400_000)

export const getDailyMessage = (date) => (
  DAILY_MESSAGES[(dayNumber(date) * 137) % DAILY_MESSAGES.length]
)
