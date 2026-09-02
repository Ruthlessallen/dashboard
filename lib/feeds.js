/**
 * Fuentes del feed de noticias.
 *
 * Cada entrada se consulta de forma independiente y tolerante a fallos: si un
 * feed cambia de URL o cae, el resto sigue funcionando y el error aparece en el
 * panel "Fuentes" del dashboard en vez de romper la pagina.
 *
 * Para anadir una fuente: copia una linea y pon su URL de RSS/Atom.
 * Para silenciarla temporalmente: enabled: false.
 */
export const FEEDS = [
  // --- IA / LLMs -----------------------------------------------------------
  { id: 'simonwillison',  name: 'Simon Willison',      cat: 'ia',   url: 'https://simonwillison.net/atom/everything/',       enabled: true },
  { id: 'latentspace',    name: 'Latent Space',        cat: 'ia',   url: 'https://www.latent.space/feed',                    enabled: true },
  { id: 'eugeneyan',      name: 'Eugene Yan',          cat: 'ia',   url: 'https://eugeneyan.com/rss/',                       enabled: true },
  { id: 'hf-blog',        name: 'Hugging Face',        cat: 'ia',   url: 'https://huggingface.co/blog/feed.xml',             enabled: true },
  { id: 'anthropic',      name: 'Anthropic (GNews)',   cat: 'ia',   url: 'https://news.google.com/rss/search?q=Anthropic+Claude+when:7d&hl=es&gl=ES&ceid=ES:es', enabled: true }, // Anthropic no publica RSS oficial
  { id: 'openai',         name: 'OpenAI',              cat: 'ia',   url: 'https://openai.com/news/rss.xml',                  enabled: true },
  { id: 'google-ai',      name: 'Google AI',           cat: 'ia',   url: 'https://blog.google/technology/ai/rss/',           enabled: true },
  { id: 'deepmind',       name: 'Google DeepMind',     cat: 'ia',   url: 'https://deepmind.google/blog/rss.xml',             enabled: true },
  { id: 'ms-ai',          name: 'Microsoft AI',        cat: 'ia',   url: 'https://news.microsoft.com/source/topics/ai/feed/', enabled: true },
  { id: 'apple-news',     name: 'Apple Newsroom',      cat: 'ia',   url: 'https://www.apple.com/newsroom/rss-feed.rss',      enabled: true },
  { id: 'dotcsv',         name: 'DotCSV',              cat: 'ia',   url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCy5znSnfMsDwaLlROnZ7Qbg', enabled: true },
  { id: 'ia-espanol',     name: 'IA en Español',       cat: 'ia',   url: 'https://aplicacionesai.substack.com/feed',        enabled: true }, // newsletter ~40k suscriptores
  { id: 'somosnlp',       name: 'NLP en español',      cat: 'ia',   url: 'https://news.google.com/rss/search?q=%22procesamiento+de+lenguaje+natural%22+OR+SomosNLP+when:14d&hl=es&gl=ES&ceid=ES:es', enabled: true },
  { id: 'spainai',        name: 'Spain AI',            cat: 'ia',   url: 'https://spain-ai.com/feed',                        enabled: true },

  // --- Data ----------------------------------------------------------------
  { id: 'dataeng-weekly', name: 'Data Eng. Weekly',    cat: 'data', url: 'https://www.dataengineeringweekly.com/feed',       enabled: true },
  { id: 'seattledataguy', name: 'Seattle Data Guy',    cat: 'data', url: 'https://seattledataguy.substack.com/feed',         enabled: true },
  { id: 'realpython',     name: 'Real Python',         cat: 'data', url: 'https://realpython.com/atom.xml',                  enabled: true },
  { id: 'datademia',      name: 'Datademia',           cat: 'data', url: 'https://datademia.es/feed',                        enabled: true },
  { id: 'datapeaker',     name: 'Datapeaker',          cat: 'data', url: 'https://datapeaker.com/feed',                      enabled: true },

  // --- Web / ingenieria ----------------------------------------------------
  { id: 'pragmatic',      name: 'Pragmatic Engineer',  cat: 'web',  url: 'https://blog.pragmaticengineer.com/rss/',          enabled: true },
  { id: 'lobsters',       name: 'Lobste.rs',           cat: 'web',  url: 'https://lobste.rs/rss',                            enabled: true },
  { id: 'gh-trending',    name: 'GitHub Trending',     cat: 'web',  url: 'https://mshibanami.github.io/GitHubTrendingRSS/daily/all.xml', enabled: true },
  { id: 'midudev',        name: 'midudev',             cat: 'web',  url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC8LeXCWOalN8SxlrPcG-PaQ', enabled: true },
  { id: 'mouredev',       name: 'MoureDev',            cat: 'web',  url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCxPD7bsocoAMq8Dj18kmGyQ', enabled: true },
  { id: 'asiermarques',   name: 'Asier Marques',       cat: 'web',  url: 'https://asiermarques.com/feed/',                   enabled: false }, // sin RSS publico ahora mismo
  { id: 'bonilista',      name: 'La Bonilista',        cat: 'web',  url: 'https://labonilista.com/feed',                     enabled: false }, // dominio caido
  { id: 'sumapositiva',   name: 'Suma Positiva',       cat: 'web',  url: 'https://www.sumapositiva.com/feed',           enabled: true },
];

export const CATEGORIES = {
  ia:   { label: 'IA',   color: '#7c3aed' },
  data: { label: 'Data', color: '#059669' },
  web:  { label: 'Web',  color: '#2563eb' },
  hn:   { label: 'HN',   color: '#ea580c' },
};

/**
 * Hacker News via la API de Algolia: solo hilos con traccion real
 * (points > HN_MIN_POINTS) que mencionen alguno de estos terminos.
 */
export const HN_MIN_POINTS = 150;
export const HN_KEYWORDS = [
  'LLM', 'AI', 'Python', 'PostgreSQL', 'architecture',
  'data engineering', 'SQL', 'RAG', 'agents',
];
