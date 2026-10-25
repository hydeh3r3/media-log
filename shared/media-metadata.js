/* Media metadata for Nightly. No page code is evaluated. */
(function (root) {
  "use strict";
  const text = (value) => typeof value === "string" ? value.slice(0, 5000).replace(/\s+/g, " ").trim() : "";
  const list = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
  const object = (value) => value && typeof value === "object" && !Array.isArray(value);
  const key = (value) => text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const schemaTypes = (node) => list(node?.["@type"]).map((value) => text(value).toLowerCase().replace(/^https?:\/\/(www\.)?schema\.org\//, ""));
  const schemaMap = {
    movie: "film", tvseries: "tv", tvseason: "tv", tvepisode: "tv",
    book: "book", audiobook: "book", musicrecording: "music", musicalbum: "music", musicplaylist: "music",
    videogame: "game", podcastepisode: "podcast", podcastseries: "podcast",
    article: "article", newsarticle: "article", blogposting: "article", scholarlyarticle: "article",
    report: "article", review: "article", comicseries: "manga", comicstory: "manga",
  };
  const ogMap = {
    article: "article", "video.movie": "film", "video.tv_show": "tv", "video.episode": "tv",
    "music.song": "music", "music.album": "music", "music.playlist": "music", book: "book", "books.book": "book",
  };
  const youtubeDomains = ["youtube.com", "youtu.be", "youtube-nocookie.com"];
  const animeDomains = ["anikoto.cz", "anikoto.com", "anikototv.to", "crunchyroll.com", "hidive.com", "animepahe.com", "animepahe.pw", "funimation.com"];
  const mangaDomains = ["mangadex.org", "mangaplus.shueisha.co.jp", "mangafire.to", "mangafreak.me", "manga4life.com", "manganato.com", "comick.io", "comick.dev", "webtoons.com"];
  // Absolute HTTP(S) URLs only.
  function parseURL(raw) {
    const match = text(raw).match(/^(https?):\/\/([^/?#\s]+)([^?#\s]*)(?:\?([^#]*))?/i);
    if (!match || match[2].includes("@")) return null;
    const host = match[2].toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
    return { host, path: match[3] || "/", query: match[4] || "", origin: `${match[1].toLowerCase()}://${match[2].toLowerCase()}` };
  }
  const onDomain = (host, domain) => host === domain || host.endsWith(`.${domain}`);
  const onAny = (host, domains) => domains.some((domain) => onDomain(host, domain));
  function pageIdentity(value, pageURL) {
    const raw = typeof value === "string" ? value : value?.["@id"] || value?.url;
    if (!text(raw)) return "";
    const absolute = raw.startsWith("#") ? pageURL + raw : raw.startsWith("/") ? (parseURL(pageURL)?.origin || "") + raw : raw;
    const parsed = parseURL(absolute);
    return parsed ? `${parsed.host}${parsed.path.replace(/\/$/, "")}${parsed.query ? `?${parsed.query}` : ""}` : "";
  }

  function selectEntity(signals, url) {
    const nodes = [];
    const visit = (value, main = false, depth = 0) => {
      if (depth > 8 || nodes.length >= 120) return;
      if (Array.isArray(value)) { value.slice(0, 120).forEach((item) => visit(item, main, depth + 1)); return; }
      if (!object(value)) return;
      nodes.push({ node: value, main });
      visit(value["@graph"], main, depth + 1);
      // Do not walk itemListElement, recommendations, about, or itemReviewed.
      visit(value.mainEntity, true, depth + 1);
    };
    visit(list(signals.jsonLd).slice(0, 32));
    const mainIDs = new Set(nodes.flatMap(({ node }) => list(node.mainEntity).map((item) => typeof item === "string" ? item : item?.["@id"]).filter(Boolean)));
    const identities = [url, signals.meta?.["og:url"], signals.canonical].map((item) => pageIdentity(item, url)).filter(Boolean);
    const pageTitles = [signals.meta?.["og:title"], ...list(signals.headings), signals.title].map(key).filter(Boolean);
    const candidates = nodes.map(({ node, main }) => {
      const types = schemaTypes(node);
      const type = types.map((item) => schemaMap[item]).find(Boolean) || (types.includes("videoobject") ? "video" : null);
      if (!type) return null;
      const identity = pageIdentity(node.url || node.mainEntityOfPage || node["@id"], url);
      let score = main || mainIDs.has(node["@id"]) ? 90 : 0;
      if (identity && identities.includes(identity)) score += 100;
      else if (identity) score -= 100;
      const name = key(node.headline || node.name);
      if (name && pageTitles.some((title) => title === name || title.startsWith(name))) score += 25;
      if (type === "article" && signals.meta?.["og:type"] === "article") score += 35;
      if (types.includes("tvepisode")) score += 5;
      return { node, type, score };
    }).filter(Boolean).filter((item) => item.score >= 0).sort((a, b) => b.score - a.score);
    // Tied, unrelated entities are ambiguous; don't choose a recommendation by source order.
    if (candidates.length > 1 && candidates[0].score === candidates[1].score && key(candidates[0].node.name) !== key(candidates[1].node.name)) return { node: {}, type: null };
    return candidates[0] || { node: {}, type: null };
  }

  function typeForPage(page, signals, entity, rawTitle) {
    // User preference: every YouTube URL defaults to Podcast, ahead of page metadata.
    if (onAny(page.host, youtubeDomains)) return { type: "podcast", reason: "YouTube default" };
    const path = page.path.toLowerCase();
    const editorial = /\/(?:news|article|articles|blog|blogs|essay|essays|post|posts|reviews?|features)(?:\/|$)/.test(path);
    const animeSite = onAny(page.host, animeDomains) || (onAny(page.host, ["myanimelist.net", "anilist.co"]) && /^\/anime\//.test(path));
    const og = ogMap[text(signals.meta?.["og:type"]).toLowerCase()];
    const mapped = entity.type === "video" ? null : entity.type;
    if (editorial || mapped === "article" || (og === "article" && !mapped && !animeSite)) return { type: "article", reason: "Article page metadata" };
    if (animeSite && path !== "/" && !/^\/(?:home|search|genre|type|login|register)(?:\/|$)/.test(path)) return { type: "anime", reason: "Anime content site" };
    const genre = list(entity.node.genre).map((item) => text(item)).join(" ");
    const japaneseAnimation = /\banime\b/i.test(genre) || (/\banimation\b/i.test(genre) && /\bjapan\b/i.test(list(entity.node.countryOfOrigin).map((item) => typeof item === "string" ? item : item?.name).join(" ")));
    if (japaneseAnimation && ["film", "tv", "video"].includes(entity.type)) return { type: "anime", reason: "Anime metadata" };
    if (mapped) return { type: mapped, reason: "Main content metadata" };
    if (og) return { type: og, reason: "Page media metadata" };
    if (onAny(page.host, mangaDomains) || (onAny(page.host, ["myanimelist.net", "anilist.co"]) && /^\/manga\//.test(path))) return { type: "manga", reason: "Manga content site" };
    if (onDomain(page.host, "letterboxd.com") && /\/film\//.test(path)) return { type: "film", reason: "Film page" };
    if (onAny(page.host, ["themoviedb.org", "trakt.tv"])) {
      if (/\/(?:movie|movies)\//.test(path)) return { type: "film", reason: "Film page" };
      if (/\/(?:tv|shows)\//.test(path)) return { type: "tv", reason: "TV page" };
    }
    if (onDomain(page.host, "imdb.com") && /^\/title\//.test(path)) {
      if (/\bTV (?:Series|Mini Series|Episode|Special)\b/i.test(rawTitle)) return { type: "tv", reason: "TV title metadata" };
      if (/\(\d{4}\)/.test(rawTitle)) return { type: "film", reason: "Film title metadata" };
    }
    if (onAny(page.host, ["podcasts.apple.com", "overcast.fm"]) || (onDomain(page.host, "open.spotify.com") && /\/(?:episode|show)\//.test(path))) return { type: "podcast", reason: "Podcast page" };
    if (onDomain(page.host, "open.spotify.com") && /\/(?:track|album|playlist)\//.test(path)) return { type: "music", reason: "Music page" };
    if (onAny(page.host, ["goodreads.com", "thestorygraph.com", "storygraph.com"]) && /\/(?:book|books)\//.test(path)) return { type: "book", reason: "Book page" };
    if ((onDomain(page.host, "steampowered.com") && /^\/app\//.test(path)) || onDomain(page.host, "backloggd.com") || (page.host.endsWith(".itch.io") && path !== "/")) return { type: "game", reason: "Game page" };
    if (onAny(page.host, ["substack.com", "medium.com", "lesswrong.com", "arxiv.org", "gwern.net"]) && path !== "/") return { type: "article", reason: "Reading page" };
    if (signals.hasArticle && !signals.hasVideo) return { type: "article", reason: "Article content" };
    return { type: null, reason: "Type uncertain — check the selection" };
  }

  function detect(input = {}) {
    const signals = object(input.signals) ? input.signals : {};
    const page = parseURL(input.url || signals.url);
    // Preserve the supplied title except for the requested site-specific labels.
    const rawTitle = typeof input.title === "string" ? input.title
      : typeof signals.title === "string" ? signals.title : "";
    if (!page) return { title: rawTitle, type: null, reason: "Use an HTTP or HTTPS content page" };
    if (onAny(page.host, ["animepahe.com", "animepahe.pw"])) {
      return { title: rawTitle.replace(/\s*::\s*animepahe\s*$/i, ""), type: "anime", reason: "AnimePahe" };
    }
    let title = rawTitle;
    if (onDomain(page.host, "imdb.com")) title = rawTitle.replace(/\s+-\s+IMDb\s*$/i, "");
    // Match mangafreak.<TLD> and its subdomains, including alternate mirror domains.
    else if (/(?:^|\.)mangafreak\.[a-z]{2,}$/.test(page.host)) {
      title = rawTitle.replace(/^\s*Read\s+/i, "").replace(/\s+-\s+MangaFreak\s*$/i, "");
    }
    else if (onDomain(page.host, "anikototv.to")) {
      title = rawTitle.replace(/^\s*Watch\s+/i, "")
        .replace(/\s+Anime\s+English\s+SUB\/DUB\s+-\s+Anikoto\s*$/i, "");
    }
    else if (onAny(page.host, youtubeDomains)) title = rawTitle.replace(/\s+-\s+YouTube\s*$/i, "");
    else if (onDomain(page.host, "mangaplus.shueisha.co.jp")) title = rawTitle.replace(/\s+[|-]\s+MANGA\s+Plus\s*$/i, "");
    const entity = selectEntity(signals, input.url || signals.url);
    return { title, ...typeForPage(page, signals, entity, rawTitle) };
  }

  // Serialized by scripting.executeScript. Must only use page globals and local helpers.
  function collectPageSignals() {
    const clip = (value, size = 5000) => String(value || "").slice(0, size).replace(/\s+/g, " ").trim();
    const meta = {};
    for (const element of Array.from(document.querySelectorAll("meta[property], meta[name]")).slice(0, 200)) {
      const name = clip(element.getAttribute("property") || element.getAttribute("name"), 100).toLowerCase();
      if (/^(?:og:|twitter:|article:|book:|music:)/.test(name)) meta[name] = clip(element.getAttribute("content"));
    }
    const jsonLd = [];
    let bytes = 0;
    for (const element of Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 32)) {
      const source = element.textContent || "";
      bytes += source.length;
      if (source.length > 200000 || bytes > 500000) continue;
      try { jsonLd.push(JSON.parse(source)); } catch { /* Malformed metadata is optional. */ }
    }
    const headings = Array.from(document.querySelectorAll("main h1, article h1, h1")).slice(0, 4).map((element) => clip(element.textContent));
    return {
      url: location.href, title: clip(document.title), meta, jsonLd, headings,
      canonical: clip(document.querySelector('link[rel="canonical"]')?.getAttribute("href")),
      hasArticle: Boolean(document.querySelector("article")), hasVideo: Boolean(document.querySelector("video")),
    };
  }

  root.MediaLogMetadata = Object.freeze({ detect, collectPageSignals });
})(globalThis);
