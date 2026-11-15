/*
  EXPLICA · textos en lenguaje sencillo para cada cultivo.
  Revisar con agricultores antes de publicar.
*/
const Explica = (() => {
  const TEXTOS = {
    'Cebada': {
      icono: '🌾',
      despues: 'Luego siembra haba o arveja en el mismo terreno. Así la tierra recupera fuerza.',
      consejo: 'Aguanta el frío y la poca lluvia. Es una buena opción para zonas altas.'
    },
    'Papa nativa': {
      icono: '🥔',
      despues: 'Luego siembra cebada o haba. Y no vuelvas a sembrar papa en ese mismo lugar el próximo año.',
      consejo: 'Se da bien en zonas frías y altas. Las variedades nativas aguantan mejor el clima.'
    },
    'Papa': {
      icono: '🥔',
      despues: 'Luego siembra haba o frejol. No siembres papa en el mismo lugar seguido.',
      consejo: 'Necesita agua y abono. Cuida que no se junte agua en la tierra.'
    },
    'Quinua': {
      icono: '🌱',
      despues: 'Luego siembra papa o haba. Así la tierra no se cansa.',
      consejo: 'Aguanta el frío, las heladas y la poca agua. Es buena opción para zonas altas.'
    },
    'Maíz amarillo': {
      icono: '🌽',
      despues: 'Luego siembra haba o frejol en el mismo terreno. Esas plantas devuelven fuerza a la tierra.',
      consejo: 'Necesita sol y agua seguida. No lo siembres si todavía puede helar.'
    },
    'Arroz': {
      icono: '🍚',
      despues: 'Luego siembra frejol o hortalizas. Ayudan a cortar las plagas.',
      consejo: 'Le gusta el agua y el calor. Necesita un terreno que pueda estar mojado.'
    },
    'Palta Hass': {
      icono: '🥑',
      despues: 'Es un árbol que dura muchos años. Entre los árboles puedes sembrar abono verde, como la vicia.',
      consejo: 'Necesita riego constante. No la dejes sin agua en época de calor.'
    },
    'Mango': {
      icono: '🥭',
      despues: 'Es un árbol que dura muchos años. Mantén el suelo cubierto con hierba o paja.',
      consejo: 'Le gusta el calor. Necesita riego, pero no lo dejes encharcado.'
    },
    'Espárrago': {
      icono: '🌿',
      despues: 'Cuando renueves el campo, deja descansar el terreno y échale abono.',
      consejo: 'Dura muchos años. Necesita riego seguido y tierra suelta.'
    },
    'Tomate': {
      icono: '🍅',
      despues: 'Luego siembra cereales o frejol. Evita sembrar tomate o papa en el mismo lugar.',
      consejo: 'Necesita sol, agua seguida y abono. Quítale las hojas secas.'
    },
    'Cebolla': {
      icono: '🧅',
      despues: 'Luego siembra frejol o hortalizas. No repitas cebolla ni ajo en el mismo lugar.',
      consejo: 'Le gusta el clima templado. Necesita riego moderado.'
    }
  };

  const GENERICO = {
    icono: '🌱',
    despues: 'Pregunta a tu vecino qué sembrar después, para que la tierra no se canse.',
    consejo: 'Revisa tu tierra antes de sembrar.'
  };

  function de(nombre) {
    return TEXTOS[nombre] || GENERICO;
  }

  return { de };
})();
