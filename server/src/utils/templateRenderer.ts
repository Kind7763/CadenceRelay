import Handlebars from 'handlebars';

export function detectVariables(html: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const variables = new Set<string>();
  let match;
  while ((match = regex.exec(html)) !== null) {
    variables.add(match[1]);
  }
  return Array.from(variables);
}

export function renderTemplate(html: string, data: Record<string, string>): string {
  const template = Handlebars.compile(html);
  return template(data);
}

/**
 * Convert HTML to a readable plain text version.
 * Used to auto-generate text_body from html_body for email templates.
 */
export function htmlToPlainText(html: string): string {
  let text = html;

  // Remove <style> and <script> blocks and their content
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  // Convert <a href="url">text</a> to text (url)
  text = text.replace(/<a\s[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, url, linkText) => {
    const cleanLinkText = linkText.replace(/<[^>]+>/g, '').trim();
    if (cleanLinkText && url && url !== '#') {
      return `${cleanLinkText} (${url})`;
    }
    return cleanLinkText || url || '';
  });

  // Convert block-ending tags to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");
  text = text.replace(/&rsquo;/gi, "'");
  text = text.replace(/&lsquo;/gi, "'");
  text = text.replace(/&rdquo;/gi, '"');
  text = text.replace(/&ldquo;/gi, '"');
  text = text.replace(/&mdash;/gi, '--');
  text = text.replace(/&ndash;/gi, '-');
  text = text.replace(/&hellip;/gi, '...');

  // Collapse multiple blank lines into max 2 newlines
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n /g, '\n');
  text = text.replace(/ \n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');

  // Trim whitespace
  text = text.trim();

  return text;
}
