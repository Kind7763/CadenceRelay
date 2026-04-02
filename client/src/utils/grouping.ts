export type GroupBy = 'none' | 'date' | 'project';

export function groupByDate<T>(items: T[], getDate: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  for (const item of items) {
    const d = new Date(getDate(item));
    const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    let label: string;
    if (itemDate >= today) {
      label = 'Today';
    } else if (itemDate >= yesterday) {
      label = 'Yesterday';
    } else if (itemDate >= thisWeekStart) {
      label = 'This Week';
    } else if (itemDate >= thisMonthStart) {
      label = 'This Month';
    } else {
      label = 'Older';
    }
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }

  // Ensure consistent ordering
  const orderedLabels = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];
  const ordered = new Map<string, T[]>();
  for (const label of orderedLabels) {
    if (groups.has(label)) ordered.set(label, groups.get(label)!);
  }
  return ordered;
}

export function groupByProject<T>(
  items: T[],
  getProjectId: (item: T) => string | undefined | null,
  projects: Array<{ id: string; name: string; color?: string | null }>,
): Map<string, { color?: string | null; items: T[] }> {
  const groups = new Map<string, { color?: string | null; items: T[] }>();

  for (const item of items) {
    const pid = getProjectId(item);
    const project = pid ? projects.find((p) => p.id === pid) : null;
    const key = project ? project.name : 'No Project';
    if (!groups.has(key)) groups.set(key, { color: project?.color || null, items: [] });
    groups.get(key)!.items.push(item);
  }

  // Put "No Project" at the end
  const noProject = groups.get('No Project');
  groups.delete('No Project');
  const ordered = new Map(groups);
  if (noProject) ordered.set('No Project', noProject);
  return ordered;
}
