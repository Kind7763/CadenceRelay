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
