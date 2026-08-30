// Affiliate monetization config.
//
// When someone posts a recommendation with a product link, this rewrites
// the link to include your affiliate tracking ID (if that domain is
// configured below) before it's saved. From then on, every click on that
// link earns you a commission if the person buys something — invisible
// to the user, no extra step for them.
//
// HOW TO SET THIS UP:
// 1. Sign up for an affiliate program for a store, e.g.:
//    - Amazon Associates: https://affiliate-program.amazon.com
//    - Awin (many UK/EU retailers): https://www.awin.com
//    - Rakuten Advertising (many US retailers): https://rakutenadvertising.com
// 2. They'll give you a tracking ID/tag.
// 3. Paste it in below, replacing the "YOUR-..." placeholder.
// 4. Leave any store blank/untouched if you're not signed up for it yet —
//    links to that domain just won't be rewritten, nothing breaks.

const AFFILIATE_TAGS = {
  "amazon.com":    { param: "tag",     value: "YOUR-AMAZON-TAG-20" },
  "amazon.co.uk":  { param: "tag",     value: "YOUR-AMAZON-UK-TAG-21" },
  // Add more stores here as you sign up, same shape:
  // "somestore.com": { param: "affid", value: "YOUR-TAG" },
};

// Rewrites a URL to include the affiliate tag for its domain, if configured.
// Returns the original URL unchanged if the domain isn't set up yet,
// or if the URL isn't valid.
function applyAffiliateTag(rawUrl) {
  if (!rawUrl) return rawUrl;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "");
    const matchedDomain = Object.keys(AFFILIATE_TAGS).find(domain => host.endsWith(domain));
    if (!matchedDomain) return rawUrl;

    const { param, value } = AFFILIATE_TAGS[matchedDomain];
    if (!value || value.startsWith("YOUR-")) return rawUrl; // not configured yet

    url.searchParams.set(param, value);
    return url.toString();
  } catch {
    return rawUrl; // not a valid URL — leave it exactly as typed
  }
}
