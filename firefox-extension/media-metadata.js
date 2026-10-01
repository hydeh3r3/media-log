/* Shared by the three extensions and iOS JavaScriptCore. No page code is evaluated. */
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
  // Absolute HTTP(S) URLs only. This also runs in JavaScriptCore, which has no DOM URL class.
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
    // Preserve the supplied page title exactly. Metadata is used only for type detection.
    const rawTitle = typeof input.title === "string" ? input.title
      : typeof signals.title === "string" ? signals.title : "";
    if (!page) return { title: rawTitle, type: null, reason: "Use an HTTP or HTTPS content page" };
    if (onAny(page.host, ["animepahe.com", "animepahe.pw"])) {
      return { title: rawTitle, type: "anime", reason: "AnimePahe" };
    }
    const entity = selectEntity(signals, input.url || signals.url);
    return { title: rawTitle, ...typeForPage(page, signals, entity, rawTitle) };
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

  // Static HTML reader for iOS. It extracts data only; scripts and resources never run.
  // One forward pass keeps hostile markup from slowing it down: as in a browser, an
  // unclosed comment, tag, quoted value, script, style, or title runs to the end.
  function signalsFromHTML(html, url = "") {
    const source = typeof html === "string" ? html.slice(0, 2000000) : "";
    const entities = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", hellip: "…", colon: ":", copy: "©" };
    const decode = (value) => value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
      if (!entity.startsWith("#")) return entities[entity.toLowerCase()] ?? whole;
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
    });
    const isSpace = (char) => char === " " || char === "\n" || char === "\t" || char === "\r" || char === "\f";
    const skipSpaces = (index) => { while (isSpace(source[index])) index++; return index; };
    // Reads attributes up to the tag's ">"; a repeated name keeps its first value. Null if the tag never ends.
    const readTag = (index) => {
      const attrs = Object.create(null);
      while (index < source.length) {
        if (source[index] === ">") return { attrs, end: index + 1 };
        if (isSpace(source[index]) || source[index] === "/") { index++; continue; }
        const nameStart = index++;
        while (index < source.length && !isSpace(source[index]) && !"/>=".includes(source[index])) index++;
        const name = source.slice(nameStart, index).toLowerCase();
        let value = "";
        index = skipSpaces(index);
        if (source[index] === "=") {
          index = skipSpaces(index + 1);
          const quote = source[index];
          if (quote === '"' || quote === "'") {
            const close = source.indexOf(quote, index + 1);
            if (close < 0) return null;
            value = source.slice(index + 1, close);
            index = close + 1;
          } else {
            const valueStart = index;
            while (index < source.length && !isSpace(source[index]) && source[index] !== ">") index++;
            value = source.slice(valueStart, index);
          }
        }
        if (!(name in attrs)) attrs[name] = decode(value);
      }
      return null;
    };
    const wanted = new Set(["script", "style", "title", "h1", "meta", "link", "article", "video"]);
    // Script, style, and title text, and an h1's inner markup as before, are read up to the close tag.
    const closers = { script: /<\/script[\t\n\f\r />]/gi, style: /<\/style[\t\n\f\r />]/gi, title: /<\/title[\t\n\f\r />]/gi, h1: /<\/h1[\t\n\f\r />]/gi };
    const result = { url, title: "", meta: {}, jsonLd: [], headings: [], hasArticle: false, hasVideo: false };
    let index = 0;
    let count = 0;
    let jsonBytes = 0;
    let h1Closes = true;
    while (index < source.length) {
      const open = source.indexOf("<", index);
      if (open < 0) break;
      if (source.startsWith("<!--", open)) {
        if (++count > 2000) break;
        const close = source.indexOf("-->", open + 4);
        if (close < 0) break;
        index = close + 3;
        continue;
      }
      const endTag = source[open + 1] === "/";
      const nameStart = open + (endTag ? 2 : 1);
      if (!/[a-z]/i.test(source[nameStart] || "")) {
        // A bare "<" is text. Doctypes, "<?", and other "<!" or "</" markup end at the next ">".
        if (!endTag && source[open + 1] !== "!" && source[open + 1] !== "?") { index = open + 1; continue; }
        const close = source.indexOf(">", open + 2);
        if (close < 0) break;
        index = close + 1;
        continue;
      }
      let nameEnd = nameStart;
      while (nameEnd < source.length && !isSpace(source[nameEnd]) && source[nameEnd] !== "/" && source[nameEnd] !== ">") nameEnd++;
      const tag = source.slice(nameStart, nameEnd).toLowerCase();
      const parsed = readTag(nameEnd);
      if (!parsed) break;
      index = parsed.end;
      if (endTag || !wanted.has(tag)) continue;
      if (++count > 2000) break;
      const attrs = parsed.attrs;
      let content = null;
      if (closers[tag] && (tag !== "h1" || h1Closes)) {
        closers[tag].lastIndex = index;
        const close = closers[tag].exec(source);
        const closeTag = close && readTag(close.index + tag.length + 2);
        if (closeTag) {
          content = source.slice(index, close.index);
          index = closeTag.end;
        } else if (tag === "h1" && !close) h1Closes = false; // Later h1 tags cannot close either.
        else break;
      }
      if (tag === "script" && attrs.type?.toLowerCase() === "application/ld+json") {
        jsonBytes += content.length;
        if (content.length <= 200000 && jsonBytes <= 500000 && result.jsonLd.length < 32) {
          try { result.jsonLd.push(JSON.parse(content)); } catch { /* Ignore malformed JSON. */ }
        }
      } else if (tag === "title" && !result.title) result.title = text(decode(content));
      else if (tag === "h1" && content !== null && result.headings.length < 4) result.headings.push(text(decode(content.replace(/<[^<>]*>/g, ""))));
      else if (tag === "meta") {
        const name = text(attrs.property || attrs.name).toLowerCase();
        if (/^(?:og:|twitter:|article:|book:|music:)/.test(name)) result.meta[name] = text(attrs.content);
      } else if (tag === "link" && attrs.rel === "canonical") result.canonical = attrs.href;
      else if (tag === "article") result.hasArticle = true;
      else if (tag === "video") result.hasVideo = true;
    }
    return result;
  }

  root.MediaLogMetadata = Object.freeze({ detect, collectPageSignals, signalsFromHTML });
})(globalThis);
