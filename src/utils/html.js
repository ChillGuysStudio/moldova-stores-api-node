import * as cheerio from "cheerio";

export function soupFromHtml(html) {
  return cheerio.load(html);
}

export function absoluteUrl(baseUrl, href) {
  if (!href) {
    return null;
  }
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }
  return `${baseUrl.replace(/\/+$/, "")}/${href.replace(/^\/+/, "")}`;
}
