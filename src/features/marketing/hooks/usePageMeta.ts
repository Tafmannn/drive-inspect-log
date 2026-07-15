import { useEffect } from "react";
import { SITE } from "../content/marketingContent";
import type { PageMeta } from "../content/pageMetadata";

const OG_IMAGE = `${SITE.origin}/og/axentra-home.png`;

function upsertMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  return el;
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  return el;
}

/**
 * Applies per-page SEO metadata (title, description, canonical, Open Graph and
 * Twitter tags) and optional JSON-LD structured data blocks. Restores the
 * document title on unmount and removes any JSON-LD it injected so the
 * authenticated app is never left with stale marketing metadata.
 */
export function usePageMeta(meta: PageMeta, jsonLd: Record<string, unknown>[] = []) {
  useEffect(() => {
    const previousTitle = document.title;
    const canonicalUrl = `${SITE.origin}${meta.path}`;

    document.title = meta.title;

    upsertMeta('meta[name="description"]', "name", "description", meta.description);
    upsertCanonical(canonicalUrl);

    upsertMeta('meta[property="og:title"]', "property", "og:title", meta.title);
    upsertMeta('meta[property="og:description"]', "property", "og:description", meta.description);
    upsertMeta('meta[property="og:type"]', "property", "og:type", "website");
    upsertMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    upsertMeta('meta[property="og:image"]', "property", "og:image", OG_IMAGE);
    upsertMeta('meta[property="og:site_name"]', "property", "og:site_name", SITE.name);

    upsertMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", meta.title);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", meta.description);
    upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", OG_IMAGE);

    const scripts: HTMLScriptElement[] = jsonLd.map((block) => {
      const s = document.createElement("script");
      s.type = "application/ld+json";
      s.setAttribute("data-axentra-jsonld", "true");
      s.text = JSON.stringify(block);
      document.head.appendChild(s);
      return s;
    });

    return () => {
      document.title = previousTitle;
      scripts.forEach((s) => s.remove());
    };
    // meta object is stable per-page; stringify guards against inline literals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.title, meta.description, meta.path, JSON.stringify(jsonLd)]);
}
