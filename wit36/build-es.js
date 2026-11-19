const fs = require('fs');
let s = fs.readFileSync('wit36/index.html', 'utf8');

// 1) drop all nbsp (EN typographic binds); the Spanish pass re-adds them per español rules
s = s.split('&nbsp;').join(' ');

// 2) exact string swaps EN -> ES (clean, de-nbsp'd)
const R = [
  // ---- head ----
  ['<html lang="en">', '<html lang="es">'],
  ['<title>WITHOUT WITNESS — open call · MONOMO</title>', '<title>WITHOUT WITNESS — convocatoria · MONOMO</title>'],
  ['content="WITHOUT WITNESS — an open call from MONOMO, Gràcia, Barcelona. A room, three hours, alone; a machine takes exactly 36 frames you cannot choose. The finished work is yours.">',
   'content="WITHOUT WITNESS — convocatoria de MONOMO, Gràcia, Barcelona. Una sala, tres horas, a solas; una máquina capta 36 fotogramas que no puedes elegir. La obra final es tuya.">'],
  ['<meta property="og:title" content="WITHOUT WITNESS — open call · MONOMO">', '<meta property="og:title" content="WITHOUT WITNESS — convocatoria · MONOMO">'],
  ['content="A room. Three hours. You, alone. The machine takes 36 frames — you cannot choose. Cycle I, MONOMO, Barcelona.">',
   'content="Una sala. Tres horas. Tú, a solas. La máquina capta 36 fotogramas — no puedes elegir. Ciclo I, MONOMO, Barcelona.">'],
  ['content="A room. Three hours. You, alone. A machine takes 36 frames you cannot choose. Total control of the action — zero control of the output.">',
   'content="Una sala. Tres horas. Tú, a solas. Una máquina capta 36 fotogramas que no puedes elegir. Control total de la acción — control cero del resultado.">'],
  ['<meta property="og:url" content="https://nikolaigrigoriev.com/wit36">', '<meta property="og:url" content="https://nikolaigrigoriev.com/wit36/es">'],

  // ---- frames toggle (attrs) ----
  ['title="Hide photographs" aria-label="Hide photographs — show only the frames"', 'title="Ocultar fotografías" aria-label="Ocultar fotografías — mostrar solo los marcos"'],

  // ---- hero ----
  ['<div class="bmeta">You move. The machine chooses &mdash; which frame, and when.</div>',
   '<div class="bmeta">Tú te mueves. La máquina elige &mdash; qué capta, y cuándo.</div>'],
  ['>Register <span>&rarr;</span></a>', '>Inscríbete <span>&rarr;</span></a>'],
  ['>Register <span>&rarr;</span></button>', '>Inscríbete <span>&rarr;</span></button>'],
  ['<div class="hint" id="hint">Move to draw</div>', '<div class="hint" id="hint">Mueve para dibujar</div>'],
  ['<span class="odl">Screening</span><span class="odv">Sunday 29 November 2026, 18:00</span>',
   '<span class="odl">Proyección</span><span class="odv">Domingo 29 de noviembre de 2026, 18:00</span>'],
  ['>Read the call <span class="ch">&darr;</span></a>', '>Lee la convocatoria <span class="ch">&darr;</span></a>'],

  // ---- masthead ----
  ['<span class="o">Cycle I</span>', '<span class="o">Ciclo I</span>'],

  // ---- § 01 ----
  ['<span class="lab">The invitation</span>', '<span class="lab">La invitación</span>'],
  ['<p class="lead">A room. Three hours. You, alone.</p>', '<p class="lead">Una sala. Tres horas. Tú, a solas.</p>'],
  ['<p>No photographer, no witness. You bring what you want and do what you want. Whatever happens in that room is your doing, and it is the work.</p>',
   '<p>Sin fotógrafo, sin testigo. Traes lo que quieras y haces lo que quieras. Todo lo que ocurra en esa sala es cosa tuya, y es la obra.</p>'],
  ['<p>A machine takes 36 frames at moments none of us &mdash; you included &mdash; can predict. You can&rsquo;t choose them, reshoot them, or edit them.</p>',
   '<p>Una máquina capta 36 fotogramas en momentos que nadie &mdash; ni siquiera tú &mdash; puede prever. No puedes elegirlos, repetirlos ni editarlos.</p>'],
  ['<p>The finished piece, all 36 frames, is your work, under your name. You&rsquo;ll see it for the first time at the opening, at the same moment as everyone else. You answer for the whole three hours, not the best of them.</p>',
   '<p>La pieza final, las 36 fotografías, es tu obra, con tu nombre. La verás por primera vez en la inauguración, en el mismo instante que tod@s l@s demás. Respondes por las tres horas enteras, no por lo mejor de ellas.</p>'],
  ['<p>Our part is only the frame: the room, the time, the ban on choosing, the number 36.</p>',
   '<p>Nuestra parte es solo el marco: la sala, el tiempo, el veto a elegir, el número 36.</p>'],

  // ---- dark band ----
  ['<div class="top">Total control of the action.</div>', '<div class="top">Control total de&nbsp;la&nbsp;acción.</div>'],
  ['<div class="bot">Zero control of the output.</div>', '<div class="bot">Control cero del&nbsp;resultado.</div>'],
  ['<p class="cap">For three hours you direct everything and edit nothing. The work sits in that gap: your grip on the room against the machine&rsquo;s indifference to what it catches.</p>',
   '<p class="cap">Durante tres horas lo diriges todo y no editas nada. La obra vive en ese hueco: tu dominio de la sala frente a la indiferencia de la máquina ante lo que capta.</p>'],

  // ---- § 02 ----
  ['<span class="lab">The protocol</span>', '<span class="lab">El protocolo</span>'],
  ['<p class="st">You enter alone for 180 minutes. Watches and phones stay at the door; bring anything else you like &mdash; even another person. What happens inside is yours to answer for, all of it. The door closes.</p>',
   '<p class="st">Entras a solas por 180 minutos. Reloj y teléfono se quedan en la puerta; trae lo demás que quieras &mdash; incluso a otra persona. De todo lo que ocurra dentro respondes tú, de todo. La puerta se cierra.</p>'],
  ['<p class="st">36 exposures across the three hours. The count is announced; the moments aren&rsquo;t. They are drawn, before you enter, by the quantum random number generator of Humboldt University in Berlin &mdash; physical chance the laws of nature forbid anyone to predict. No one sees the schedule; after the session, anyone can verify it was never touched.</p>',
   '<p class="st">36 disparos a lo largo de las tres horas. La cantidad se anuncia; los momentos, no. Los extrae, antes de que entres, el generador cuántico de números aleatorios de la Universidad Humboldt de Berlín &mdash; un azar físico que las leyes de la naturaleza prohíben predecir. Nadie ve la secuencia; después de la sesión, cualquiera puede verificar que nadie la tocó.</p>'],
  ['<p class="st">No choosing. No reshooting. No editing, by you or the studio. All 36 are printed and shown in full, in the order taken, at one size.</p>',
   '<p class="st">Sin elegir. Sin repetir. Sin edición, ni tuya ni del estudio. Las 36 se imprimen y se muestran íntegras, en el orden de la toma, a un mismo tamaño.</p>'],
  ['<p class="st">You may leave at any moment. Walking out is a gesture like any other &mdash; the machine keeps firing, and an empty room is a frame too.</p>',
   '<p class="st">Puedes irte en cualquier momento. Salir es un gesto como cualquier otro &mdash; la máquina sigue disparando, y una sala vacía también es un fotograma.</p>'],
  ['<p class="st">The camera works alone. No one selects or edits a frame: the files run untouched, straight to the press &mdash; no human eyes on the way &mdash; and nothing is shown before the opening at MONOMO.</p>',
   '<p class="st">La cámara funciona sola. Nadie selecciona ni edita las fotografías: los archivos viajan intactos, directamente a la impresión &mdash; sin ojos humanos en el camino &mdash; y nada se muestra antes de la inauguración en MONOMO.</p>'],
  ['<p class="st">The door opens; you step out. The frames stay behind. Once every artist&rsquo;s session is done, the works are shown at the opening &mdash; and you meet yours there, with the public, for the first time.</p>',
   '<p class="st">La puerta se abre; sales. Los fotogramas se quedan. Cuando terminan las sesiones de cada artista, las obras se muestran en la inauguración &mdash; y allí conoces la tuya, con el público, por primera vez.</p>'],

  // ---- § 03 ----
  ['<span class="lab">Who</span><span>Roles</span>', '<span class="lab">Quién</span><span>Papeles</span>'],
  ['<dt>The artist</dt><dd>Authors and directs the work: three hours of action. The finished 36 are theirs alone, under their name &mdash; the studio claims no part of the work.</dd>',
   '<dt>Artista</dt><dd>Es autor@ y dirige la obra: tres horas de acción. Las 36 finales son solo suyas, con su nombre &mdash; el estudio no reclama ninguna parte de la obra.</dd>'],
  ['<dt>MONOMO</dt><dd>The autonomous self-portrait studio in Gr&agrave;cia. Organiser, production, place.</dd>',
   '<dt>MONOMO</dt><dd>El estudio autónomo de autorretrato en Gràcia. Organización, producción, lugar.</dd>'],
  ['<dt>Nikolai Grigoriev</dt><dd>He sets the frame &mdash; the room, the hours, the ban, the number. He goes through the protocol on the same terms as everyone else.</dd>',
   '<dt>Nikolai Grigoriev</dt><dd>Él pone el marco &mdash; la sala, las horas, el veto, el número. Pasa por el protocolo en las mismas condiciones que tod@s.</dd>'],
  ['<dt>The machine &middot; chance</dt><dd>An indifferent eye. It fires 36 times; chance alone decides when. No one &mdash; the artist included &mdash; knows the moments. You can&rsquo;t predict it, and you can&rsquo;t sway it.</dd>',
   '<dt>La máquina &middot; el azar</dt><dd>Un ojo indiferente. Dispara 36 veces; solo el azar decide cuándo. Nadie &mdash; ni siquiera l@ artista &mdash; conoce los momentos. No puedes preverlo y no puedes influir en ello.</dd>'],

  // ---- § 04 ----
  ['<span class="lab">Apply</span><span>Closed</span>', '<span class="lab">Solicitud</span><span>Cerrada</span>'],
  ['<p class="closed">Applications for Cycle I are closed.</p>', '<p class="closed">La convocatoria del Ciclo I está cerrada.</p>'],
  ['<h2>Take part</h2>', '<h2>Participa</h2>'],
  ['<p>We invite artists. The studio decides who takes part, privately. Reasons are not given.</p>',
   '<p>Invitamos a artistas. El estudio decide quién participa, en privado. No se dan razones.</p>'],
  ['<span class="fl">01 &middot; Your name</span>', '<span class="fl">01 &middot; Tu nombre</span>'],
  ['<span class="fl">02 &middot; An email we can reach you at</span>', '<span class="fl">02 &middot; Un email donde localizarte</span>'],

  // ---- screening evening 29.11 ----
  ['<span class="lab">The screening</span>', '<span class="lab">La proyección</span>'],
  ['<h2>Sunday 29 November. Six works, seen for the first time.</h2>', '<h2>Domingo 29 de noviembre. Seis obras, vistas por primera vez.</h2>'],
  ['<p>The six works of Cycle I are screened in one evening at MONOMO, Gr&agrave;cia. The artists have not seen their frames: they see them with you, in the same room, at the same moment.</p>',
   '<p>Las seis obras del Ciclo I se proyectan en una sola noche en MONOMO, Gr&agrave;cia. Los artistas no han visto sus fotogramas: los verán contigo, en la misma sala y en el mismo momento.</p>'],
  ['<p>During the screening the same camera works again, under the same rules: 36 frames at moments drawn by the quantum generator, no choosing, no editing. Everyone in the room becomes an author of the seventh work of the cycle. By registering, you accept this.</p>',
   '<p>Durante la proyección, la misma cámara vuelve a funcionar con las mismas reglas: 36 fotogramas en momentos que extrae el generador cuántico, sin elegir ni editar. Todas las personas presentes firman la séptima obra del ciclo. Al inscribirte, lo aceptas.</p>'],
  ['<p class="q">Doors 17:00 &middot; Screening 18:00&ndash;21:06</p>', '<p class="q">Puertas 17:00 &middot; Proyección 18:00&ndash;21:06</p>'],
  ['<p class="q">Free entry, registration required</p>', '<p class="q">Entrada libre, con inscripción</p>'],
  ['<div class="fl ordh">Order of the screening</div>', '<div class="fl ordh">Orden de la proyección</div>'],
  ['<p class="q">Eugeni Pulido Mart&iacute;n &amp; Jaime D&iacute;az Otero N&uacute;&ntilde;ez</p>', '<p class="q">Eugeni Pulido Mart&iacute;n y Jaime D&iacute;az Otero N&uacute;&ntilde;ez</p>'],
  ['<p class="q">Txemy Basualto &amp; Ane Basualto</p>', '<p class="q">Txemy Basualto y Ane Basualto</p>'],
  ['<p class="q">End</p>', '<p class="q">Final</p>'],
  ['<span class="cl">I understand that the room&rsquo;s camera may photograph me during the screening and that these images form the seventh, collective work of Cycle I. I accept the <a href="/wit36/terms" target="_blank" rel="noopener">Terms &amp; Privacy</a>.</span>',
   '<span class="cl">Entiendo que la cámara de la sala puede fotografiarme durante la proyección y que esas imágenes forman la séptima obra, colectiva, del Ciclo I. Acepto los <a href="/wit36/es/terms" target="_blank" rel="noopener">Términos y la Privacidad</a>.</span>'],
  ["msg.textContent='Please fill in your name and email.'", "msg.textContent='Escribe tu nombre y tu email, por favor.'"],
  ["msg.textContent='That email does not look right.'", "msg.textContent='Ese email no parece correcto.'"],
  ["msg.textContent='Please accept the camera and the Terms & Privacy.'", "msg.textContent='Acepta la cámara y los Términos y la Privacidad, por favor.'"],
  ["f.innerHTML='<p class=\"thanks\">You&rsquo;re registered. Sunday 29 November, doors at 17:00 &mdash; MONOMO, Carrer del Torrent de les Flors, 61, Gr&agrave;cia. See you there.</p>'",
   "f.innerHTML='<p class=\"thanks\">Inscripción hecha. Domingo 29 de noviembre, puertas a las 17:00 &mdash; MONOMO, Carrer del Torrent de les Flors, 61, Gr&agrave;cia. Nos vemos.</p>'"],
  ["consent:true,lang:'en',website", "consent:true,lang:'es',website"],

  // ---- footer ----
  ['<span class="top">WITHOUT WITNESS &middot; Sense testimoni</span><br>MONOMO &mdash; self-portrait studio &middot; Gr&agrave;cia, Barcelona',
   '<span class="top">WITHOUT WITNESS &middot; Sense testimoni</span><br>MONOMO &mdash; estudio de autorretrato &middot; Gr&agrave;cia, Barcelona'],
  ['Cycle I &middot; Screening 29 November 2026<div class="langs">',
   'Ciclo I &middot; Proyección el 29 de noviembre de 2026<div class="langs">'],

  // ---- language switch: ES active, EN -> /wit36 (base markup already anchors) ----
  ['<nav class="langsw" aria-label="Language"><a href="/wit36" class="on">EN</a><a href="/wit36/es">ES</a><span class="off">CA</span></nav>',
   '<nav class="langsw" aria-label="Idioma"><a href="/wit36">EN</a><a href="/wit36/es" class="on">ES</a><span class="off">CA</span></nav>'],
  ['<div class="langs"><a href="/wit36" class="on">EN</a><a href="/wit36/es">ES</a><span class="off">CA</span></div>',
   '<div class="langs"><a href="/wit36">EN</a><a href="/wit36/es" class="on">ES</a><span class="off">CA</span></div>'],

  // ---- JS strings ----
  ["hintEl.textContent='Drag to draw'", "hintEl.textContent='Arrastra para dibujar'"],
  ["framesBtn.title = framesOnly ? 'Show photographs' : 'Hide photographs';", "framesBtn.title = framesOnly ? 'Mostrar fotografías' : 'Ocultar fotografías';"],
  ["msg.textContent='Sending…'", "msg.textContent='Enviando…'"],
  ["msg.textContent=(d&&d.error)||'Something went wrong. Please try again.'", "msg.textContent=(d&&d.error)||'Algo ha fallado. Inténtalo de nuevo.'"],
  ["msg.textContent='Network error. Please try again.'", "msg.textContent='Error de red. Inténtalo de nuevo.'"],
    // (switcher CSS already lives in the shared index.html; es.html inherits it)
];

let missing = [];
for (const [from, to] of R) {
  if (!s.includes(from)) missing.push(from.slice(0, 60));
  s = s.split(from).join(to);
}

// 3) Spanish typography — bind short function words / numbers / em-dashes inside prose
const cut = s.indexOf('<script>window.PHOTOS');
let head = s.slice(0, cut), tail = s.slice(cut);
const WORDS = ['a','e','o','u','y','la','el','lo','le','un','se','tu','es','si','ni','ya','de','en','mi','su','al',
               'del','las','los','una','uno','con','por','sin','que','sus','tus','son','fue','muy'];
const wordRe = new RegExp('\\b(' + WORDS.join('|') + ')\\u0020(?=[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9])', 'gi');
function typo(x){
  x = x.replace(/ &mdash; /g, '&nbsp;&mdash; ');
  x = x.replace(/\b(\d+) (?=[A-Za-zÁÉÍÓÚÜÑáéíóúüñ])/g, '$1&nbsp;');
  x = x.replace(wordRe, (m, w) => w + '&nbsp;');
  return x;
}
head = head.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/g, (m, a, inner) => '<p' + a + '>' + typo(inner) + '</p>');
head = head.replace(/<dd>([\s\S]*?)<\/dd>/g, (m, inner) => '<dd>' + typo(inner) + '</dd>');
s = head + tail;

fs.writeFileSync('wit36/es.html', s);
console.log('es.html written · size kb:', Math.round(fs.statSync('wit36/es.html').size/1024));
console.log('unmatched EN strings (should be empty):', missing.length ? missing : 'none');
