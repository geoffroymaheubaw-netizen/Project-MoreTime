import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Search,
  Clock,
  ShieldCheck,
  Eye,
  EyeOff,
  X,
  Play,
  AlertCircle,
  RefreshCw,
  Sliders,
  ImageOff,
  Tag,
  Sparkles,
  Info,
} from 'lucide-react';
import { ThemeMode } from '../types';
import {
  MINDFUL_YOUTUBE_TOPICS,
  MindfulVideo,
  extractYouTubeVideoId,
  searchMindfulVideosInApp,
  getMindfulQuerySuggestions,
  POPULAR_THEMATIC_SUGGESTIONS,
  ALL_MINDFUL_VIDEOS,
} from '../data/mindfulYoutube';
import { playMinimalClick } from '../utils/audio';

interface MindfulYouTubeScreenProps {
  onBack: () => void;
  theme: ThemeMode;
  soundEnabled: boolean;
}

interface ActivePlayerState {
  id: string;
  title: string;
  channel: string;
}

export const MindfulYouTubeScreen: React.FC<MindfulYouTubeScreenProps> = ({
  onBack,
  theme,
  soundEnabled,
}) => {
  const isLight = theme === 'light';
  const isEink = theme === 'eink';

  // Active in-app video
  const [activeVideo, setActiveVideo] = useState<ActivePlayerState>({
    id: 'XF37h4jF29o',
    title: 'Pourquoi le temps semble passer plus vite avec l’âge ?',
    channel: 'Kurzgesagt',
  });

  // Search input & suggestions state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Focus & visual comfort
  const [grayscaleMode, setGrayscaleMode] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('science-savoirs');
  const [useStandardDomain, setUseStandardDomain] = useState(false);
  const [showTroubleshooter, setShowTroubleshooter] = useState(false);

  // Watch session timer
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [showMindfulAlert, setShowMindfulAlert] = useState(false);

  const timerRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    timerRef.current = window.setInterval(() => {
      setSessionSeconds((prev) => {
        const next = prev + 1;
        // Trigger mindful break reminder at 15m (900s) and 30m (1800s)
        if (next === 900 || next === 1800) {
          setShowMindfulAlert(true);
        }
        return next;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handlePlayVideo = (video: MindfulVideo) => {
    playMinimalClick(soundEnabled);
    setActiveVideo({
      id: video.id,
      title: video.title,
      channel: video.channel,
    });
    setSearchFeedback(`Lecture lancée : ${video.title}`);
    setIsSearchFocused(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearchOrUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    playMinimalClick(soundEnabled);
    setSearchFeedback(null);

    // 1. Check if user pasted a direct YouTube link or 11-char ID
    const detectedId = extractYouTubeVideoId(query);
    if (detectedId) {
      setActiveVideo({
        id: detectedId,
        title: 'Vidéo YouTube personnalisée',
        channel: 'Visionnage sobre sans miniature',
      });
      setSearchFeedback('Lien YouTube direct détecté : lecture immédiate sans publicité ni miniature.');
      setIsSearchFocused(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // 2. Search in our curated in-app video catalog
    const matches = searchMindfulVideosInApp(query);
    if (matches.length > 0) {
      const bestMatch = matches[0];
      setActiveVideo({
        id: bestMatch.id,
        title: bestMatch.title,
        channel: bestMatch.channel,
      });
      setSearchFeedback(`Chargé : ${bestMatch.title} (${bestMatch.channel})`);
      setIsSearchFocused(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // 3. If no direct match, inform user
    setSearchFeedback(
      `Aucune vidéo ne correspond exactement à « ${query} ». Consultez les propositions ci-dessous ou collez une URL.`
    );
  };

  const handleSelectSuggestion = (suggestion: string) => {
    playMinimalClick(soundEnabled);
    setSearchQuery(suggestion);
    const matches = searchMindfulVideosInApp(suggestion);
    if (matches.length > 0) {
      const pick = matches[0];
      setActiveVideo({
        id: pick.id,
        title: pick.title,
        channel: pick.channel,
      });
      setSearchFeedback(`Proposition chargée : ${pick.title}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Instant query suggestions based on user input
  const querySuggestions = getMindfulQuerySuggestions(searchQuery);

  // Live video proposals matching user search (without thumbnails)
  const liveVideoProposals = searchQuery.trim()
    ? searchMindfulVideosInApp(searchQuery)
    : [];

  const activeTopic =
    MINDFUL_YOUTUBE_TOPICS.find((t) => t.id === selectedTopicId) ||
    MINDFUL_YOUTUBE_TOPICS[0];

  const embedDomain = useStandardDomain ? 'www.youtube.com' : 'www.youtube-nocookie.com';
  const embedUrl = `https://${embedDomain}/embed/${activeVideo.id}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1`;

  return (
    <div
      className={`min-h-full w-full flex flex-col justify-between py-2 px-1 animate-in fade-in duration-200 ${
        isLight
          ? 'text-neutral-900'
          : isEink
          ? 'text-neutral-950'
          : 'text-neutral-100'
      }`}
      id="screen-mindful-youtube"
    >
      <div className="w-full flex flex-col gap-3">
        {/* Top bar with back button, session timer, grayscale & domain controls */}
        <div className="flex items-center justify-between pb-1 border-b border-neutral-800/40">
          <button
            onClick={() => {
              playMinimalClick(soundEnabled);
              onBack();
            }}
            id="btn-mindful-youtube-back"
            className="flex items-center gap-1.5 text-xs font-semibold py-1.5 px-2.5 rounded-xl hover:bg-neutral-800/20 transition cursor-pointer text-neutral-400 hover:text-neutral-200"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quitter</span>
          </button>

          <div className="flex items-center gap-2">
            {/* Mindful session watch timer */}
            <div
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono border ${
                sessionSeconds >= 900
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                  : isLight
                  ? 'bg-neutral-100 border-neutral-300 text-neutral-700'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400'
              }`}
              title="Temps passé sur cette session de visionnage"
            >
              <Clock className="w-3 h-3 text-amber-500" />
              <span>{formatTimer(sessionSeconds)}</span>
            </div>

            {/* Grayscale filter toggle button */}
            <button
              onClick={() => {
                playMinimalClick(soundEnabled);
                setGrayscaleMode(!grayscaleMode);
              }}
              id="btn-toggle-grayscale"
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border transition cursor-pointer ${
                grayscaleMode
                  ? 'bg-neutral-800 border-neutral-600 text-neutral-200 font-medium'
                  : isLight
                  ? 'border-neutral-200 text-neutral-500 hover:text-neutral-800'
                  : 'border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
              title="Activer le mode noir & blanc pour réduire la stimulation visuelle"
            >
              {grayscaleMode ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              <span>{grayscaleMode ? 'N&B actif' : 'Couleurs'}</span>
            </button>
          </div>
        </div>

        {/* Mindful alert banner after 15 minutes */}
        {showMindfulAlert && (
          <div
            className={`p-3 rounded-2xl border flex items-center justify-between text-xs animate-in slide-in-from-top duration-300 ${
              isLight
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-amber-500/15 border-amber-500/30 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <strong className="block text-[11px]">Pause de pleine conscience (15 min)</strong>
                <span className="text-[10px] opacity-80">
                  Avez-vous trouvé ce que vous cherchiez ? Reposez vos yeux quelques instants.
                </span>
              </div>
            </div>
            <button
              onClick={() => setShowMindfulAlert(false)}
              className="text-[10px] opacity-70 hover:opacity-100 p-1 underline cursor-pointer shrink-0 ml-2"
            >
              Continuer
            </button>
          </div>
        )}

        {/* Status banner with anti-clickbait guarantee */}
        <div
          className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
            isLight
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              : 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
              <ImageOff className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <p className="text-[11px] leading-tight">
              <strong>Zéro miniature (Anti-clickbait) :</strong> les propositions s’affichent sous
              forme de texte pur, sans visuels aguicheurs pour protéger votre attention.
            </p>
          </div>
          <button
            onClick={() => setShowTroubleshooter(!showTroubleshooter)}
            className="text-[10px] underline opacity-75 hover:opacity-100 shrink-0 ml-2 cursor-pointer"
          >
            {showTroubleshooter ? 'Fermer' : 'Aide'}
          </button>
        </div>

        {/* Troubleshooter drawer */}
        {showTroubleshooter && (
          <div
            className={`p-3 rounded-xl border text-xs flex flex-col gap-2 ${
              isLight ? 'bg-neutral-100 border-neutral-300 text-neutral-800' : 'bg-neutral-900 border-neutral-700 text-neutral-200'
            }`}
          >
            <div className="flex items-center justify-between font-semibold text-[11px]">
              <span className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                Résolution des erreurs de lecture (ex: Erreur 153)
              </span>
              <button
                onClick={() => setShowTroubleshooter(false)}
                className="text-neutral-400 hover:text-neutral-200 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-neutral-400 leading-relaxed">
              L’erreur 153 survient quand YouTube bloque un lecteur qui ne transmet pas l’origine requise. Nous utilisons désormais une directive stricte autorisée. En cas de blocage par un filtre réseau ou extension, vous pouvez alterner le serveur ci-dessous :
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => {
                  playMinimalClick(soundEnabled);
                  setUseStandardDomain(!useStandardDomain);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-[11px] flex items-center gap-1.5 cursor-pointer transition"
              >
                <RefreshCw className="w-3 h-3" />
                <span>
                  Basculer vers {useStandardDomain ? 'youtube-nocookie.com' : 'youtube.com standard'}
                </span>
              </button>
              <span className="text-[10px] text-neutral-400">
                Actuel : <code className="text-amber-400">{embedDomain}</code>
              </span>
            </div>
          </div>
        )}

        {/* In-App Clean Player */}
        <div
          className={`w-full rounded-2xl border overflow-hidden transition-all shadow-xl ${
            isLight ? 'bg-neutral-900 border-neutral-300' : 'bg-black border-neutral-800'
          }`}
        >
          <div className="relative aspect-video w-full bg-black">
            <iframe
              key={`${activeVideo.id}-${embedDomain}`}
              src={embedUrl}
              title={activeVideo.title}
              className={`w-full h-full border-0 ${
                grayscaleMode ? 'grayscale contrast-105' : ''
              }`}
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>

          {/* Video metadata bar */}
          <div className="p-3 bg-neutral-950 text-neutral-200 flex items-center justify-between border-t border-neutral-800">
            <div className="pr-2 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <h4 className="text-xs font-semibold truncate">{activeVideo.title}</h4>
              </div>
              <span className="text-[10px] text-neutral-400 block truncate pl-3">
                {activeVideo.channel} • Lecture in-app directe sans redirection
              </span>
            </div>
            <button
              onClick={() => {
                playMinimalClick(soundEnabled);
                setUseStandardDomain(!useStandardDomain);
              }}
              className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] flex items-center gap-1 shrink-0 cursor-pointer transition"
              title="Changer de serveur vidéo en cas de blocage"
            >
              <Sliders className="w-3 h-3" />
              <span>Serveur</span>
            </button>
          </div>
        </div>

        {/* Search Bar with Autocomplete Proposals and ZERO Thumbnails */}
        <div
          className={`p-3.5 rounded-2xl border transition-all ${
            isLight
              ? 'bg-white border-neutral-200 shadow-sm'
              : isEink
              ? 'bg-neutral-200 border-neutral-400'
              : 'bg-[#141414] border-neutral-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                Recherche de vidéos
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
                Sans miniature
              </span>
            </div>
            <span className="text-[10px] text-neutral-500 font-medium">
              Mode texte sobre
            </span>
          </div>

          <form onSubmit={handleSearchOrUrlSubmit} className="flex flex-col gap-2">
            <div className="relative flex items-center">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onFocus={() => setIsSearchFocused(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchFeedback(null);
                }}
                placeholder="Tapez un sujet (stoïcisme, sommeil, piano...) ou collez une URL"
                className={`w-full py-2.5 pl-9 pr-8 rounded-xl text-xs border outline-none transition ${
                  isLight
                    ? 'bg-neutral-50 border-neutral-300 text-neutral-900 focus:border-amber-500'
                    : isEink
                    ? 'bg-white border-neutral-500 text-neutral-950'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-100 focus:border-amber-500'
                }`}
              />
              <Search className="w-4 h-4 text-neutral-500 absolute left-3 pointer-events-none" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchFeedback(null);
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-2.5 text-neutral-500 hover:text-neutral-300 p-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="submit"
              id="btn-search-mindful-youtube"
              className="w-full py-2.5 px-3 rounded-xl bg-amber-500 text-black font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-amber-400 active:scale-[0.99] transition cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Rechercher & proposer sans miniatures</span>
            </button>

            {searchFeedback && (
              <div className="text-[11px] text-amber-500 italic flex items-center gap-1 pt-0.5">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>{searchFeedback}</span>
              </div>
            )}
          </form>

          {/* Dynamic Search / Topic Suggestion Chips (Pure text) */}
          <div className="flex flex-col gap-1.5 pt-3 border-t border-neutral-800/40 mt-2">
            <div className="flex items-center justify-between text-[10px] text-neutral-400">
              <span className="flex items-center gap-1 font-medium">
                <Tag className="w-3 h-3 text-amber-400" />
                Propositions de sujets ({querySuggestions.length}) :
              </span>
              <span className="text-[9px] text-neutral-500">Cliquez pour appliquer</span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
              {querySuggestions.map((suggestion) => {
                const isSelected = searchQuery.toLowerCase() === suggestion.toLowerCase();
                return (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleSelectSuggestion(suggestion)}
                    className={`px-2.5 py-1 rounded-lg border transition cursor-pointer text-left flex items-center gap-1 ${
                      isSelected
                        ? 'bg-amber-500 text-black font-semibold border-amber-500'
                        : isLight
                        ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-200 text-neutral-700'
                        : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
                    }`}
                  >
                    <span>{suggestion}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Video Proposals List Matching Search Query (STRICTLY NO THUMBNAILS) */}
        {searchQuery.trim() && (
          <div className="flex flex-col gap-2 animate-in fade-in duration-150">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-neutral-300">
                  Vidéos proposées ({liveVideoProposals.length})
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                  Sans miniature
                </span>
              </div>
              <span className="text-[10px] text-neutral-500">
                Choix basé sur le contenu
              </span>
            </div>

            {liveVideoProposals.length > 0 ? (
              <div className="flex flex-col gap-2">
                {liveVideoProposals.map((vid) => (
                  <div
                    key={vid.id}
                    onClick={() => handlePlayVideo(vid)}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-left transition-all active:scale-[0.99] cursor-pointer ${
                      activeVideo.id === vid.id
                        ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500'
                        : isLight
                        ? 'bg-white border-neutral-200 hover:bg-neutral-50'
                        : 'bg-[#141414] border-neutral-800 hover:bg-[#1a1a1a]'
                    }`}
                  >
                    {/* Pure typographic proposal: NO thumbnail image! */}
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300 border border-neutral-700 font-mono">
                            {vid.category}
                          </span>
                          <span className="text-[10px] text-neutral-400 font-medium">
                            {vid.durationApprox}
                          </span>
                        </div>
                        <h5 className="text-xs font-semibold leading-snug">
                          {vid.title}
                        </h5>
                        <div className="text-[10px] text-amber-500 font-medium mt-0.5">
                          {vid.channel}
                        </div>
                        <p className="text-[10px] text-neutral-400 line-clamp-2 mt-1 leading-relaxed">
                          {vid.summary}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-1 pl-2">
                      <span className="text-[10px] text-amber-500 font-semibold px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 whitespace-nowrap">
                        Lire ici →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className={`p-4 rounded-xl border text-center text-xs flex flex-col items-center gap-2 ${
                  isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-900/50 border-neutral-800'
                }`}
              >
                <p className="text-neutral-400">
                  Aucun résultat direct pour « {searchQuery} ».
                </p>
                <p className="text-[10px] text-neutral-500 max-w-md">
                  Vous pouvez coller l'URL d'une vidéo YouTube quelconque pour la visionner en mode sobre sans miniature, ou sélectionner une proposition thématique ci-dessus.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Curated Mindful Categories (Always in Text-Only mode without thumbnails) */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Explorer par thème
            </span>
            <span className="text-[10px] text-neutral-500 flex items-center gap-1">
              <ImageOff className="w-3 h-3 text-neutral-400" />
              100% sans miniature
            </span>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {MINDFUL_YOUTUBE_TOPICS.map((topic) => (
              <button
                key={topic.id}
                onClick={() => {
                  playMinimalClick(soundEnabled);
                  setSelectedTopicId(topic.id);
                }}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all cursor-pointer border ${
                  selectedTopicId === topic.id
                    ? 'bg-amber-500 text-black font-semibold border-amber-500 shadow-sm'
                    : isLight
                    ? 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <span>{topic.badge}</span>
              </button>
            ))}
          </div>

          {/* Video Cards for the Active Topic - STRICTLY TEXT & ICON ONLY */}
          <div className="flex flex-col gap-2">
            {activeTopic.videos.map((vid) => (
              <div
                key={vid.id}
                onClick={() => handlePlayVideo(vid)}
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-left transition-all active:scale-[0.99] cursor-pointer ${
                  activeVideo.id === vid.id
                    ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500'
                    : isLight
                    ? 'bg-white border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                    : isEink
                    ? 'bg-neutral-200 border-neutral-400'
                    : 'bg-[#141414] border-neutral-800/80 hover:border-neutral-700 hover:bg-[#191919]'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      activeVideo.id === vid.id
                        ? 'bg-amber-500 text-black'
                        : isLight
                        ? 'bg-neutral-100 text-neutral-800'
                        : 'bg-neutral-900 text-neutral-300'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300 border border-neutral-700 font-mono">
                        {vid.category}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-medium">
                        {vid.durationApprox}
                      </span>
                    </div>
                    <h5 className="text-xs font-semibold leading-snug">
                      {vid.title}
                    </h5>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-neutral-400">
                      <span className="font-medium text-amber-500">{vid.channel}</span>
                    </div>
                    <p className="text-[10px] text-neutral-400 line-clamp-2 mt-1 leading-relaxed">
                      {vid.summary}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex flex-col items-end gap-1 pl-2">
                  <span className="text-[10px] text-amber-500 font-semibold px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 whitespace-nowrap">
                    Lire ici →
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom return bar */}
      <div className="pt-4 pb-1">
        <button
          onClick={() => {
            playMinimalClick(soundEnabled);
            onBack();
          }}
          className={`w-full py-2.5 px-4 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
            isLight
              ? 'bg-neutral-100 border-neutral-300 text-neutral-700 hover:bg-neutral-200'
              : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
          }`}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Retour au lanceur d'applications</span>
        </button>
      </div>
    </div>
  );
};
