import * as cheerio from 'cheerio';

/**
 * Extract clean text from HTML, removing scripts, styles, and navigation.
 */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html);

  // Remove non-content elements
  $('script, style, nav, header, footer, aside, .sidebar, .navigation, .menu').remove();

  // Get text content
  let text = $('body').text() || $.text();

  // Normalize whitespace
  text = text
    .replace(/\t/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();

  return text;
}

/**
 * Extract text from specific CSS selectors in HTML.
 */
export function htmlToTextFromSelector(html: string, selector: string): string {
  const $ = cheerio.load(html);
  const elements = $(selector);

  const parts: string[] = [];
  elements.each((_, el) => {
    const text = $(el).text().trim();
    if (text) parts.push(text);
  });

  return parts.join('\n\n');
}

/**
 * Extract text from XML (e.g., legislation.gov.uk).
 */
export function xmlToText(xml: string): string {
  const $ = cheerio.load(xml, { xml: true });

  // Remove processing instructions and metadata
  $('Metadata, Meta, RevisionHistory').remove();

  let text = $.text();

  // Normalize whitespace
  text = text
    .replace(/\t/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();

  return text;
}
