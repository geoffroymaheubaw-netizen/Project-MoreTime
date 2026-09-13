import { AppLauncherItem } from '../types';

export const LAUNCHER_APPS: AppLauncherItem[] = [
  {
    id: 'google-notebook',
    name: 'Google NotebookLM',
    category: 'Recherche & Synthèse',
    url: 'https://notebooklm.google.com/',
    iconName: 'notebook',
    description: 'Carnet de notes intelligent & analyse de documents',
    intentPrompt: 'Quel document ou sujet souhaitez-vous étudier ?',
  },
  {
    id: 'claude-ai',
    name: 'Claude AI',
    category: 'Intelligence Artificielle',
    url: 'https://claude.ai/',
    deepLink: 'claude://claude.ai/new',
    iconName: 'claude',
    description: 'Assistant de réflexion, rédaction et analyse',
    intentPrompt: 'Avez-vous une question précise à formuler ?',
  },
  {
    id: 'chat-gpt',
    name: 'ChatGPT',
    category: 'Intelligence Artificielle',
    url: 'https://chatgpt.com/',
    deepLink: 'chatgpt://',
    iconName: 'chatgpt',
    description: 'Modèle de conversation OpenAI',
    intentPrompt: 'Quel problème concret souhaitez-vous résoudre ?',
  },
  {
    id: 'calendar',
    name: 'Calendrier',
    category: 'Organisation',
    url: 'https://calendar.google.com/',
    deepLink: 'calshow:',
    iconName: 'calendar',
    description: 'Google Calendar / Agenda du téléphone',
    intentPrompt: 'Consultez votre journée puis reposez l\'écran.',
  },
  {
    id: 'apple-notes',
    name: 'Notes Apple',
    category: 'Prise de notes',
    url: 'https://www.icloud.com/notes',
    deepLink: 'mobilenotes://',
    iconName: 'apple-notes',
    description: 'Application Notes iOS (ou version iCloud)',
    intentPrompt: 'Notez votre pensée puis revenez au monde réel.',
  },
];

export const MINDFUL_QUOTES = [
  "Moins d'écran, plus de présence.",
  "La clarté mentale commence quand les notifications s'arrêtent.",
  "Chaque minute loin de l'écran est une minute offerte à votre vie.",
  "L'attention est la ressource la plus précieuse que vous possédez.",
  "Regardez autour de vous. Le monde réel vous attend.",
  "L'ennui n'est pas un problème à combler, c'est l'étincelle de la créativité.",
  "Soyez l'utilisateur de votre téléphone, pas son produit.",
];
