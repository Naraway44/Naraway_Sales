import { useEffect } from "react";

interface DocumentHeadOptions {
  title: string;
  description: string;
  path: string;
}

const SITE_URL = "https://leadstack.equidamai.com";

function upsertMeta(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/** Google indexes each SPA route on its own merits only if the <head> actually differs per
 *  route — without this, every page reports the homepage's title/description/canonical and
 *  gets treated as a duplicate. Note: this only reaches crawlers that execute JS (Googlebot
 *  does); link-unfurl bots (Slack/LinkedIn/Twitter) don't, so social previews still show the
 *  homepage's static og:* tags regardless of route. */
export function useDocumentHead({ title, description, path }: DocumentHeadOptions) {
  useEffect(() => {
    document.title = title;
    upsertMeta("description", description);
    upsertCanonical(`${SITE_URL}${path}`);

    return () => {
      document.title = "LeadStack: World's First and Leading B2B Leads AI Platform";
      upsertCanonical(`${SITE_URL}/`);
    };
  }, [title, description, path]);
}
