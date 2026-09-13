export interface MindfulVideo {
  id: string; // YouTube 11-character video ID
  title: string;
  channel: string;
  category: string;
  durationApprox: string;
  summary: string;
  tags: string[];
}

export interface MindfulTopic {
  id: string;
  name: string;
  description: string;
  badge: string;
  videos: MindfulVideo[];
}

export const MINDFUL_YOUTUBE_TOPICS: MindfulTopic[] = [
  {
    id: 'science-savoirs',
    name: 'Science & Savoirs',
    description: 'Comprendre le monde sans sensationnalisme',
    badge: '🔬 Science',
    videos: [
      {
        id: 'XF37h4jF29o',
        title: 'Pourquoi le temps semble passer plus vite avec l’âge ?',
        channel: 'Kurzgesagt',
        category: 'Science & Cerveau',
        durationApprox: '10 min',
        summary: 'Une exploration fascinante de la perception temporelle par notre cerveau.',
        tags: ['temps', 'cerveau', 'âge', 'science', 'kurzgesagt', 'psychologie', 'physique'],
      },
      {
        id: 'U6P_V_3Vp30',
        title: 'L’illusion de la certitude et de la mémoire',
        channel: 'Veritasium',
        category: 'Science & Cerveau',
        durationApprox: '15 min',
        summary: 'Pourquoi nos souvenirs et nos certitudes ne sont pas infaillibles.',
        tags: ['mémoire', 'veritasium', 'cerveau', 'neurosciences', 'illusion', 'psychologie'],
      },
      {
        id: 'b6vWzMeq7oE',
        title: 'Comment fonctionne notre attention visuelle',
        channel: 'Science Étonnante',
        category: 'Neurosciences',
        durationApprox: '14 min',
        summary: 'Ce qui capture notre regard et comment nous pouvons nous recentrer.',
        tags: ['attention', 'science', 'neurosciences', 'focus', 'regard', 'concentration'],
      },
      {
        id: 'wZkv_yN8G5o',
        title: 'L’Univers et le système solaire expliqués simplement',
        channel: 'C’est Pas Sorcier',
        category: 'Astronomie',
        durationApprox: '26 min',
        summary: 'Un classique pédagogique et apaisant pour découvrir les étoiles et planètes.',
        tags: ['espace', 'univers', 'étoiles', 'astronomie', 'sorcier', 'planetes', 'cosmos'],
      },
      {
        id: '01Q52FqNqNk',
        title: 'Voyage aux confins de la galaxie et des trous noirs',
        channel: 'Balade Mentale',
        category: 'Astronomie',
        durationApprox: '19 min',
        summary: 'Une contemplation poétique et scientifique de l’infiniment grand.',
        tags: ['espace', 'galaxie', 'balade mentale', 'trous noirs', 'cosmos', 'astrophysique'],
      },
    ],
  },
  {
    id: 'calme-focus',
    name: 'Calme & Bruits Blancs',
    description: 'Atmosphères sonores pour travailler ou s’endormir',
    badge: '🎧 Calme & Sommeil',
    videos: [
      {
        id: 'jfKfPfyJRdk',
        title: 'Lofi Hip Hop Radio – Rythmes doux pour étudier & se détendre',
        channel: 'Lofi Girl',
        category: 'Ambiance',
        durationApprox: 'En direct',
        summary: 'Musique d’ambiance sans paroles pour favoriser une concentration continue.',
        tags: ['lofi', 'musique', 'focus', 'travail', 'étude', 'détente', 'beats', 'chill'],
      },
      {
        id: 'mPZkdNFkNps',
        title: 'Sons de pluie douce & tonnerre lointain pour dormir',
        channel: 'Calm Sounds',
        category: 'Nature',
        durationApprox: '60 min',
        summary: 'Bruits blancs naturels apaisants pour couper des bruits extérieurs.',
        tags: ['pluie', 'sommeil', 'dormir', 'bruit blanc', 'nature', 'tonnerre', 'relaxation', 'calme'],
      },
      {
        id: '4tr_1O2sW_Q',
        title: 'Piano classique apaisant pour la clarté d’esprit',
        channel: 'Peaceful Piano',
        category: 'Classique',
        durationApprox: '45 min',
        summary: 'Mélodies minimalistes au piano pour calmer le flot de pensées.',
        tags: ['piano', 'musique', 'classique', 'calme', 'esprit', 'concentration', 'chopin', 'satie'],
      },
      {
        id: 'WPni755-Krg',
        title: 'Vagues de l’océan & fréquence 432 Hz de sérénité',
        channel: 'Oasis Méditation',
        category: 'Méditation',
        durationApprox: '30 min',
        summary: 'Ressac naturel et fréquences calmes pour ralentir le rythme cardiaque.',
        tags: ['vagues', 'mer', 'ocean', 'méditation', 'frequence', 'respiration', 'zen', 'eau'],
      },
      {
        id: '1ZYbU8JGB46',
        title: 'Crépitement de feu de cheminée dans un chalet sous la neige',
        channel: 'Cozy Atmosphere',
        category: 'Ambiance',
        durationApprox: '60 min',
        summary: 'Son de braises et crépitement de bois réconfortant pour la lecture du soir.',
        tags: ['feu', 'cheminee', 'neige', 'cozy', 'ambiance', 'dormir', 'hiver'],
      },
    ],
  },
  {
    id: 'philosophie-esprit',
    name: 'Philosophie & Sérénité',
    description: 'Prendre de la hauteur sur nos vies quotidiennes',
    badge: '🌿 Philosophie',
    videos: [
      {
        id: 'gQjG_0x_qgM',
        title: 'Le stoïcisme : maîtriser ce qui dépend de soi',
        channel: 'Philosophie Pratique',
        category: 'Philosophie',
        durationApprox: '12 min',
        summary: 'Les principes de Marc Aurèle et Épictète pour une vie moins anxieuse.',
        tags: ['stoicisme', 'philosophie', 'marc aurele', 'epictete', 'sagesse', 'serenite', 'anxiete'],
      },
      {
        id: 'Vz_h3C7c6-U',
        title: 'Le mystère du sommeil et de la régénération',
        channel: 'Arte Documentaire',
        category: 'Santé & Documentaire',
        durationApprox: '28 min',
        summary: 'Pourquoi le repos nocturne est indispensable à l’équilibre psychique.',
        tags: ['sommeil', 'nuit', 'arte', 'santé', 'cerveau', 'rêves', 'repos', 'sieste'],
      },
      {
        id: 'd0Y4sTqjUqQ',
        title: 'L’art du désencombrement numérique et de la sobriété',
        channel: 'Minimalisme & Conscience',
        category: 'Vie sobre',
        durationApprox: '16 min',
        summary: 'Reprendre le contrôle sur ses outils numériques plutôt que les subir.',
        tags: ['minimalisme', 'digital detox', 'écrans', 'téléphone', 'sobriété', 'attention', 'dopamine'],
      },
      {
        id: 'inpok4MKVLM',
        title: 'La philosophie du Wabi-Sabi : la beauté de l’imperfection',
        channel: 'Sagesse & Pensée',
        category: 'Philosophie',
        durationApprox: '11 min',
        summary: 'Apprendre à apprécier les choses simples, humbles et imparfaites.',
        tags: ['japon', 'wabi sabi', 'zen', 'beauté', 'imperfection', 'philosophie', 'lenteur'],
      },
    ],
  },
  {
    id: 'histoire-culture',
    name: 'Histoire & Découvertes',
    description: 'Des histoires réelles racontées avec passion et sans artifice',
    badge: '🏛️ Histoire',
    videos: [
      {
        id: 'k1BneeJTDcU',
        title: 'Les grands mythes et légendes antiques expliqués',
        channel: 'Nota Bene',
        category: 'Histoire',
        durationApprox: '18 min',
        summary: 'Comprendre les racines de nos civilisations à travers les mythes fondateurs.',
        tags: ['histoire', 'nota bene', 'antiquité', 'mythes', 'culture', 'récit', 'grece', 'rome'],
      },
      {
        id: 'VjN4B8g8Wrg',
        title: 'Les profondeurs inexplorées des abysses océaniques',
        channel: 'Arte Documentaire',
        category: 'Nature',
        durationApprox: '35 min',
        summary: 'Un voyage contemplatif dans le noir complet des grands fonds marins.',
        tags: ['océan', 'abysses', 'nature', 'animaux', 'mer', 'arte', 'planète', 'faune'],
      },
      {
        id: 'x84m3YyOtn4',
        title: 'L’architecture secrète des bâtisseurs de cathédrales',
        channel: 'Secrets d’Histoire & Architecture',
        category: 'Histoire & Art',
        durationApprox: '22 min',
        summary: 'L’ingéniosité médiévale, de la géométrie sacrée aux voûtes d’ogives.',
        tags: ['moyen age', 'cathedrale', 'histoire', 'art', 'architecture', 'patrimoine'],
      },
      {
        id: '4b4bXk3Wn8Y',
        title: 'Fabrication traditionnelle d’un meuble japonais en bois (Sans clous)',
        channel: 'Artisanat & Matière',
        category: 'Artisanat',
        durationApprox: '20 min',
        summary: 'L’art apaisant de l’assemblage Sashimono, sans clou ni colle.',
        tags: ['bois', 'artisanat', 'japon', 'menuiserie', 'sashimono', 'calme', 'silence'],
      },
    ],
  },
];

/**
 * All videos flattened for rapid in-app search
 */
export const ALL_MINDFUL_VIDEOS: MindfulVideo[] = MINDFUL_YOUTUBE_TOPICS.flatMap(
  (topic) => topic.videos
);

/**
 * Popular keyword themes suggested for instant exploration without thumbnails
 */
export const POPULAR_THEMATIC_SUGGESTIONS = [
  'Stoïcisme',
  'Pluie & Sommeil',
  'Kurzgesagt',
  'Lofi Girl',
  'Astronomie & Espace',
  'Neurosciences',
  'Piano calme',
  'Arte Documentaire',
  'Désencombrement numérique',
  'Histoire antique',
  'Bruit blanc & Nature',
  'Artisanat bois',
];

/**
 * Autocomplete / suggested search terms matching user input
 */
export function getMindfulQuerySuggestions(query: string): string[] {
  const q = query.toLowerCase().trim();
  if (!q) return POPULAR_THEMATIC_SUGGESTIONS.slice(0, 6);

  const matchedSuggestions = new Set<string>();

  // 1. Match against popular suggestion themes
  POPULAR_THEMATIC_SUGGESTIONS.forEach((theme) => {
    if (theme.toLowerCase().includes(q)) {
      matchedSuggestions.add(theme);
    }
  });

  // 2. Match against channel names
  ALL_MINDFUL_VIDEOS.forEach((v) => {
    if (v.channel.toLowerCase().includes(q)) {
      matchedSuggestions.add(v.channel);
    }
    v.tags.forEach((tag) => {
      if (tag.toLowerCase().includes(q)) {
        matchedSuggestions.add(tag.charAt(0).toUpperCase() + tag.slice(1));
      }
    });
  });

  return Array.from(matchedSuggestions).slice(0, 8);
}

/**
 * In-app search helper that filters videos without opening YouTube
 */
export function searchMindfulVideosInApp(query: string): MindfulVideo[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  return ALL_MINDFUL_VIDEOS.filter((video) => {
    return (
      video.title.toLowerCase().includes(q) ||
      video.channel.toLowerCase().includes(q) ||
      video.category.toLowerCase().includes(q) ||
      video.summary.toLowerCase().includes(q) ||
      video.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  });
}

/**
 * Extracts a valid 11-character YouTube video ID from various user inputs:
 * - Direct ID (e.g. "XF37h4jF29o")
 * - Full URL (e.g. "https://www.youtube.com/watch?v=XF37h4jF29o")
 * - Short URL (e.g. "https://youtu.be/XF37h4jF29o")
 * - Shorts URL (e.g. "https://www.youtube.com/shorts/XF37h4jF29o")
 * - Embed URL (e.g. "https://www.youtube.com/embed/XF37h4jF29o")
 */
export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 11 characters alphanumeric + _ or -
  const directIdRegex = /^[a-zA-Z0-9_-]{11}$/;
  if (directIdRegex.test(trimmed)) {
    return trimmed;
  }

  // Regex covering standard watch, youtu.be, shorts, embed
  const urlPatterns = [
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/,
  ];

  for (const pattern of urlPatterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}
