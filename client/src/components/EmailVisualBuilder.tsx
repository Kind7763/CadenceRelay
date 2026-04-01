import { useState, useCallback, useEffect } from 'react';

// ── Block types & data ──

export interface EmailBlock {
  id: string;
  type: 'header' | 'text' | 'image' | 'button' | 'divider' | 'spacer' | 'two-column' | 'footer';
  props: Record<string, string>;
}

const BLOCK_DEFAULTS: Record<EmailBlock['type'], Record<string, string>> = {
  header:       { text: 'Your Header', bgColor: '#2563eb', textColor: '#ffffff', fontSize: '24' },
  text:         { content: 'Your text here...', fontSize: '16', color: '#333333' },
  image:        { src: '', alt: 'Image', width: '100' },
  button:       { text: 'Click Here', url: '#', bgColor: '#2563eb', textColor: '#ffffff', align: 'center' },
  divider:      { color: '#e5e7eb', thickness: '1' },
  spacer:       { height: '20' },
  'two-column': { leftContent: 'Left column', rightContent: 'Right column' },
  footer:       { content: 'Footer text \u00b7 {{email}} \u00b7 Unsubscribe', fontSize: '12', color: '#999999' },
};

const BLOCK_LABELS: Record<EmailBlock['type'], string> = {
  header: 'Header',
  text: 'Text',
  image: 'Image',
  button: 'Button',
  divider: 'Divider',
  spacer: 'Spacer',
  'two-column': 'Two Column',
  footer: 'Footer',
};

const BLOCK_ICONS: Record<EmailBlock['type'], string> = {
  header: 'H',
  text: 'T',
  image: '\u{1F5BC}',
  button: '\u25A3',
  divider: '\u2500',
  spacer: '\u2195',
  'two-column': '\u2016',
  footer: 'F',
};

// ── Property field definitions per block type ──

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'color' | 'number' | 'select' | 'url';
  options?: { value: string; label: string }[];
}

const BLOCK_FIELDS: Record<EmailBlock['type'], FieldDef[]> = {
  header: [
    { key: 'text', label: 'Title', type: 'text' },
    { key: 'bgColor', label: 'Background', type: 'color' },
    { key: 'textColor', label: 'Text Color', type: 'color' },
    { key: 'fontSize', label: 'Font Size (px)', type: 'number' },
  ],
  text: [
    { key: 'content', label: 'Content', type: 'textarea' },
    { key: 'fontSize', label: 'Font Size (px)', type: 'number' },
    { key: 'color', label: 'Text Color', type: 'color' },
  ],
  image: [
    { key: 'src', label: 'Image URL', type: 'url' },
    { key: 'alt', label: 'Alt Text', type: 'text' },
    { key: 'width', label: 'Width (%)', type: 'number' },
  ],
  button: [
    { key: 'text', label: 'Button Text', type: 'text' },
    { key: 'url', label: 'Link URL', type: 'url' },
    { key: 'bgColor', label: 'Background', type: 'color' },
    { key: 'textColor', label: 'Text Color', type: 'color' },
    { key: 'align', label: 'Alignment', type: 'select', options: [
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Center' },
      { value: 'right', label: 'Right' },
    ]},
  ],
  divider: [
    { key: 'color', label: 'Color', type: 'color' },
    { key: 'thickness', label: 'Thickness (px)', type: 'number' },
  ],
  spacer: [
    { key: 'height', label: 'Height (px)', type: 'number' },
  ],
  'two-column': [
    { key: 'leftContent', label: 'Left Column', type: 'textarea' },
    { key: 'rightContent', label: 'Right Column', type: 'textarea' },
  ],
  footer: [
    { key: 'content', label: 'Content', type: 'textarea' },
    { key: 'fontSize', label: 'Font Size (px)', type: 'number' },
    { key: 'color', label: 'Text Color', type: 'color' },
  ],
};

// ── HTML generation ──

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(str: string): string {
  return str.replace(/\n/g, '<br>');
}

function blockToHtmlRow(block: EmailBlock): string {
  const p = block.props;
  switch (block.type) {
    case 'header':
      return `<tr><td style="background-color:${escapeHtml(p.bgColor)};color:${escapeHtml(p.textColor)};padding:30px;text-align:center;font-size:${escapeHtml(p.fontSize)}px;font-family:Arial,sans-serif;font-weight:bold;">${escapeHtml(p.text)}</td></tr>`;
    case 'text':
      return `<tr><td style="padding:20px 30px;font-size:${escapeHtml(p.fontSize)}px;color:${escapeHtml(p.color)};font-family:Arial,sans-serif;line-height:1.6;">${nl2br(escapeHtml(p.content))}</td></tr>`;
    case 'image': {
      const w = Math.min(Math.max(parseInt(p.width) || 100, 10), 100);
      const src = p.src || 'https://placehold.co/600x200/e2e8f0/64748b?text=Your+Image';
      return `<tr><td style="padding:20px 30px;text-align:center;"><img src="${escapeHtml(src)}" alt="${escapeHtml(p.alt)}" width="${w}%" style="max-width:${w}%;height:auto;display:inline-block;border:0;" /></td></tr>`;
    }
    case 'button':
      return `<tr><td style="padding:20px 30px;text-align:${escapeHtml(p.align)};"><table cellpadding="0" cellspacing="0" border="0" style="${p.align === 'center' ? 'margin:0 auto;' : p.align === 'right' ? 'margin-left:auto;' : ''}"><tr><td style="background-color:${escapeHtml(p.bgColor)};border-radius:6px;padding:12px 28px;"><a href="${escapeHtml(p.url)}" style="color:${escapeHtml(p.textColor)};text-decoration:none;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;display:inline-block;">${escapeHtml(p.text)}</a></td></tr></table></td></tr>`;
    case 'divider':
      return `<tr><td style="padding:10px 30px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:${escapeHtml(p.thickness)}px solid ${escapeHtml(p.color)};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>`;
    case 'spacer':
      return `<tr><td style="padding:0;height:${escapeHtml(p.height)}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
    case 'two-column':
      return `<tr><td style="padding:20px 30px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="50%" valign="top"><![endif]--><div style="display:inline-block;width:49%;vertical-align:top;font-family:Arial,sans-serif;font-size:14px;color:#333333;line-height:1.6;">${nl2br(escapeHtml(p.leftContent))}</div><!--[if mso]></td><td width="50%" valign="top"><![endif]--><div style="display:inline-block;width:49%;vertical-align:top;font-family:Arial,sans-serif;font-size:14px;color:#333333;line-height:1.6;">${nl2br(escapeHtml(p.rightContent))}</div><!--[if mso]></td></tr></table><![endif]--></td></tr>`;
    case 'footer':
      return `<tr><td style="padding:20px 30px;text-align:center;font-size:${escapeHtml(p.fontSize)}px;color:${escapeHtml(p.color)};font-family:Arial,sans-serif;line-height:1.5;">${nl2br(escapeHtml(p.content))}</td></tr>`;
    default:
      return '';
  }
}

export function blocksToHtml(blocks: EmailBlock[]): string {
  const rows = blocks.map(blockToHtmlRow).join('\n');
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--[if !mso]><!--><meta http-equiv="X-UA-Compatible" content="IE=edge"><!--<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;">
<tr><td align="center" style="padding:20px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;max-width:600px;width:100%;">
${rows}
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Parse HTML back to blocks (best-effort) ──

export function htmlToBlocks(html: string): EmailBlock[] | null {
  // Very basic parser: if HTML has our table structure, try to extract blocks
  // Otherwise return null to signal that we can't parse it
  if (!html || !html.includes('role="presentation"')) return null;

  // Fall back: wrap entire body in a single text block
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const innerTable = doc.querySelectorAll('table[role="presentation"] table[role="presentation"] tr');
    if (innerTable.length === 0) return null;

    const blocks: EmailBlock[] = [];
    innerTable.forEach((tr) => {
      const td = tr.querySelector('td');
      if (!td) return;
      const style = td.getAttribute('style') || '';
      const text = td.textContent?.trim() || '';

      // Detect block type from styles
      if (style.includes('font-weight:bold') && style.includes('text-align:center') && style.includes('background-color')) {
        const bgMatch = style.match(/background-color:\s*([^;]+)/);
        const colorMatch = style.match(/(?:^|;)\s*color:\s*([^;]+)/);
        const fontSizeMatch = style.match(/font-size:\s*(\d+)/);
        blocks.push({
          id: crypto.randomUUID(),
          type: 'header',
          props: {
            text,
            bgColor: bgMatch?.[1]?.trim() || '#2563eb',
            textColor: colorMatch?.[1]?.trim() || '#ffffff',
            fontSize: fontSizeMatch?.[1] || '24',
          },
        });
      } else if (td.querySelector('img')) {
        const img = td.querySelector('img')!;
        blocks.push({
          id: crypto.randomUUID(),
          type: 'image',
          props: {
            src: img.getAttribute('src') || '',
            alt: img.getAttribute('alt') || 'Image',
            width: img.getAttribute('width')?.replace('%', '') || '100',
          },
        });
      } else if (td.querySelector('a') && style.includes('text-align')) {
        const a = td.querySelector('a');
        const innerTd = td.querySelector('table td');
        const bgMatch = (innerTd?.getAttribute('style') || '').match(/background-color:\s*([^;]+)/);
        const colorMatch = (a?.getAttribute('style') || '').match(/color:\s*([^;]+)/);
        blocks.push({
          id: crypto.randomUUID(),
          type: 'button',
          props: {
            text: a?.textContent?.trim() || 'Click Here',
            url: a?.getAttribute('href') || '#',
            bgColor: bgMatch?.[1]?.trim() || '#2563eb',
            textColor: colorMatch?.[1]?.trim() || '#ffffff',
            align: style.includes('center') ? 'center' : style.includes('right') ? 'right' : 'left',
          },
        });
      } else if (style.includes('border-top') && text === '\u00a0') {
        const colorMatch = style.match(/border-top:[^;]*solid\s+([^;]+)/);
        const thicknessMatch = style.match(/border-top:\s*(\d+)/);
        blocks.push({
          id: crypto.randomUUID(),
          type: 'divider',
          props: {
            color: colorMatch?.[1]?.trim() || '#e5e7eb',
            thickness: thicknessMatch?.[1] || '1',
          },
        });
      } else if (style.includes('height:') && text === '\u00a0' && !style.includes('border-top')) {
        const heightMatch = style.match(/height:\s*(\d+)/);
        blocks.push({
          id: crypto.randomUUID(),
          type: 'spacer',
          props: { height: heightMatch?.[1] || '20' },
        });
      } else if (td.querySelectorAll('div[style*="inline-block"]').length === 2) {
        const divs = td.querySelectorAll('div[style*="inline-block"]');
        blocks.push({
          id: crypto.randomUUID(),
          type: 'two-column',
          props: {
            leftContent: divs[0]?.textContent?.trim() || '',
            rightContent: divs[1]?.textContent?.trim() || '',
          },
        });
      } else if (style.includes('text-align:center') && parseInt(style.match(/font-size:\s*(\d+)/)?.[1] || '16') <= 13) {
        const colorMatch = style.match(/(?:^|;)\s*color:\s*([^;]+)/);
        const fontSizeMatch = style.match(/font-size:\s*(\d+)/);
        blocks.push({
          id: crypto.randomUUID(),
          type: 'footer',
          props: {
            content: text,
            fontSize: fontSizeMatch?.[1] || '12',
            color: colorMatch?.[1]?.trim() || '#999999',
          },
        });
      } else if (text) {
        const colorMatch = style.match(/(?:^|;)\s*color:\s*([^;]+)/);
        const fontSizeMatch = style.match(/font-size:\s*(\d+)/);
        blocks.push({
          id: crypto.randomUUID(),
          type: 'text',
          props: {
            content: text,
            fontSize: fontSizeMatch?.[1] || '16',
            color: colorMatch?.[1]?.trim() || '#333333',
          },
        });
      }
    });

    return blocks.length > 0 ? blocks : null;
  } catch {
    return null;
  }
}

// ── Component ──

export interface EmailVisualBuilderProps {
  blocks: EmailBlock[];
  onChange: (blocks: EmailBlock[]) => void;
  onHtmlChange: (html: string) => void;
}

export default function EmailVisualBuilder({ blocks, onChange, onHtmlChange }: EmailVisualBuilderProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const selectedBlock = blocks.find((b) => b.id === selectedId) || null;

  // Regenerate HTML whenever blocks change
  useEffect(() => {
    onHtmlChange(blocksToHtml(blocks));
  }, [blocks, onHtmlChange]);

  const addBlock = useCallback((type: EmailBlock['type']) => {
    const newBlock: EmailBlock = {
      id: crypto.randomUUID(),
      type,
      props: { ...BLOCK_DEFAULTS[type] },
    };
    const updated = [...blocks, newBlock];
    onChange(updated);
    setSelectedId(newBlock.id);
  }, [blocks, onChange]);

  const updateBlockProp = useCallback((blockId: string, key: string, value: string) => {
    onChange(blocks.map((b) => b.id === blockId ? { ...b, props: { ...b.props, [key]: value } } : b));
  }, [blocks, onChange]);

  const moveBlock = useCallback((blockId: string, direction: 'up' | 'down') => {
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx < 0) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === blocks.length - 1) return;
    const newBlocks = [...blocks];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newBlocks[idx], newBlocks[swapIdx]] = [newBlocks[swapIdx], newBlocks[idx]];
    onChange(newBlocks);
  }, [blocks, onChange]);

  const duplicateBlock = useCallback((blockId: string) => {
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx < 0) return;
    const clone: EmailBlock = {
      id: crypto.randomUUID(),
      type: blocks[idx].type,
      props: { ...blocks[idx].props },
    };
    const newBlocks = [...blocks];
    newBlocks.splice(idx + 1, 0, clone);
    onChange(newBlocks);
    setSelectedId(clone.id);
  }, [blocks, onChange]);

  const deleteBlock = useCallback((blockId: string) => {
    onChange(blocks.filter((b) => b.id !== blockId));
    if (selectedId === blockId) setSelectedId(null);
  }, [blocks, onChange, selectedId]);

  // Drag-and-drop between existing blocks for reordering
  const handleDragStart = useCallback((blockId: string) => {
    setDragSourceId(blockId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, blockId: string) => {
    e.preventDefault();
    if (dragSourceId && dragSourceId !== blockId) {
      setDragOverId(blockId);
    }
  }, [dragSourceId]);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragSourceId || dragSourceId === targetId) {
      setDragSourceId(null);
      setDragOverId(null);
      return;
    }
    const sourceIdx = blocks.findIndex(b => b.id === dragSourceId);
    const targetIdx = blocks.findIndex(b => b.id === targetId);
    if (sourceIdx < 0 || targetIdx < 0) return;
    const newBlocks = [...blocks];
    const [moved] = newBlocks.splice(sourceIdx, 1);
    newBlocks.splice(targetIdx, 0, moved);
    onChange(newBlocks);
    setDragSourceId(null);
    setDragOverId(null);
  }, [blocks, dragSourceId, onChange]);

  const handleDragEnd = useCallback(() => {
    setDragSourceId(null);
    setDragOverId(null);
  }, []);

  // Drag from palette to add new block
  const handlePaletteDragStart = useCallback((e: React.DragEvent, type: EmailBlock['type']) => {
    e.dataTransfer.setData('text/plain', `new:${type}`);
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');
    if (data.startsWith('new:')) {
      const type = data.replace('new:', '') as EmailBlock['type'];
      if (BLOCK_DEFAULTS[type]) {
        addBlock(type);
      }
    }
  }, [addBlock]);

  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Block Palette */}
      <div className="w-48 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-3">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Blocks</h3>
        <p className="mb-3 text-[10px] text-gray-400">Click or drag to add</p>
        <div className="space-y-1.5">
          {(Object.keys(BLOCK_DEFAULTS) as EmailBlock['type'][]).map((type) => (
            <button
              key={type}
              draggable
              onDragStart={(e) => handlePaletteDragStart(e, type)}
              onClick={() => addBlock(type)}
              className="flex w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:border-primary-300 hover:bg-primary-50 active:bg-primary-100"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded bg-gray-100 text-xs font-bold text-gray-500">
                {BLOCK_ICONS[type]}
              </span>
              <span>{BLOCK_LABELS[type]}</span>
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
          <h4 className="mb-1 text-[10px] font-semibold uppercase text-gray-400">Personalization</h4>
          <p className="text-[10px] text-gray-400 leading-relaxed">
            Use {'{{name}}'}, {'{{email}}'}, etc. in any text field for mail-merge variables.
          </p>
        </div>
      </div>

      {/* Center: Canvas */}
      <div
        className="flex-1 overflow-y-auto bg-gray-100 p-6"
        onDrop={handleCanvasDrop}
        onDragOver={handleCanvasDragOver}
      >
        <div className="mx-auto" style={{ maxWidth: 640 }}>
          {blocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white py-20 text-center">
              <div className="mb-3 text-4xl text-gray-300">{'\u2B50'}</div>
              <p className="text-sm font-medium text-gray-500">Start building your email</p>
              <p className="mt-1 text-xs text-gray-400">Click a block from the left panel or drag it here</p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm" style={{ maxWidth: 600, margin: '0 auto' }}>
              {blocks.map((block, idx) => (
                <div
                  key={block.id}
                  draggable
                  onDragStart={() => handleDragStart(block.id)}
                  onDragOver={(e) => handleDragOver(e, block.id)}
                  onDrop={(e) => handleDrop(e, block.id)}
                  onDragEnd={handleDragEnd}
                  onClick={() => setSelectedId(block.id)}
                  className={`group relative cursor-pointer transition-all ${
                    selectedId === block.id
                      ? 'ring-2 ring-primary-500 ring-offset-1'
                      : 'hover:ring-1 hover:ring-gray-300'
                  } ${dragOverId === block.id ? 'ring-2 ring-blue-400 ring-offset-2' : ''} ${
                    dragSourceId === block.id ? 'opacity-50' : ''
                  }`}
                >
                  {/* Block controls overlay */}
                  <div className="absolute -right-1 -top-1 z-10 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {idx > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'up'); }}
                        className="flex h-6 w-6 items-center justify-center rounded bg-white text-xs text-gray-500 shadow-md hover:bg-gray-50 hover:text-gray-700"
                        title="Move up"
                      >{'\u2191'}</button>
                    )}
                    {idx < blocks.length - 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'down'); }}
                        className="flex h-6 w-6 items-center justify-center rounded bg-white text-xs text-gray-500 shadow-md hover:bg-gray-50 hover:text-gray-700"
                        title="Move down"
                      >{'\u2193'}</button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); duplicateBlock(block.id); }}
                      className="flex h-6 w-6 items-center justify-center rounded bg-white text-xs text-gray-500 shadow-md hover:bg-gray-50 hover:text-gray-700"
                      title="Duplicate"
                    >{'\u2398'}</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteBlock(block.id); }}
                      className="flex h-6 w-6 items-center justify-center rounded bg-white text-xs text-red-400 shadow-md hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                    >{'\u2715'}</button>
                  </div>

                  {/* Block type label */}
                  <div className="absolute -left-1 -top-1 z-10 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium text-white shadow">
                      {BLOCK_LABELS[block.type]}
                    </span>
                  </div>

                  {/* Block visual preview */}
                  <BlockPreview block={block} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Properties Panel */}
      <div className="w-64 flex-shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-3">
        {selectedBlock ? (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {BLOCK_LABELS[selectedBlock.type]} Properties
              </h3>
              <button
                onClick={() => setSelectedId(null)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >{'\u2715'}</button>
            </div>
            <div className="space-y-3">
              {BLOCK_FIELDS[selectedBlock.type].map((field) => (
                <div key={field.key}>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{field.label}</label>
                  {field.type === 'textarea' ? (
                    <textarea
                      value={selectedBlock.props[field.key] || ''}
                      onChange={(e) => updateBlockProp(selectedBlock.id, field.key, e.target.value)}
                      rows={4}
                      className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  ) : field.type === 'color' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedBlock.props[field.key] || '#000000'}
                        onChange={(e) => updateBlockProp(selectedBlock.id, field.key, e.target.value)}
                        className="h-8 w-8 cursor-pointer rounded border border-gray-300"
                      />
                      <input
                        type="text"
                        value={selectedBlock.props[field.key] || ''}
                        onChange={(e) => updateBlockProp(selectedBlock.id, field.key, e.target.value)}
                        className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm font-mono focus:border-primary-500 focus:outline-none"
                      />
                    </div>
                  ) : field.type === 'select' ? (
                    <select
                      value={selectedBlock.props[field.key] || ''}
                      onChange={(e) => updateBlockProp(selectedBlock.id, field.key, e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none"
                    >
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={selectedBlock.props[field.key] || ''}
                      onChange={(e) => updateBlockProp(selectedBlock.id, field.key, e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 border-t border-gray-100 pt-3">
              <div className="flex gap-2">
                <button
                  onClick={() => duplicateBlock(selectedBlock.id)}
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                >Duplicate</button>
                <button
                  onClick={() => deleteBlock(selectedBlock.id)}
                  className="flex-1 rounded-md border border-red-200 px-2 py-1.5 text-xs text-red-500 hover:bg-red-50"
                >Delete</button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm text-gray-400">Select a block to edit its properties</p>
            <p className="mt-1 text-xs text-gray-300">Click any block in the canvas</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Block preview renderers ──

function BlockPreview({ block }: { block: EmailBlock }) {
  const p = block.props;

  switch (block.type) {
    case 'header':
      return (
        <div
          style={{
            backgroundColor: p.bgColor,
            color: p.textColor,
            padding: '30px',
            textAlign: 'center',
            fontSize: `${p.fontSize}px`,
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
          }}
        >
          {p.text}
        </div>
      );

    case 'text':
      return (
        <div
          style={{
            padding: '20px 30px',
            fontSize: `${p.fontSize}px`,
            color: p.color,
            fontFamily: 'Arial, sans-serif',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {p.content}
        </div>
      );

    case 'image':
      return (
        <div style={{ padding: '20px 30px', textAlign: 'center' }}>
          {p.src ? (
            <img
              src={p.src}
              alt={p.alt}
              style={{ maxWidth: `${p.width}%`, height: 'auto' }}
            />
          ) : (
            <div className="mx-auto flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50" style={{ width: `${p.width}%`, minHeight: 120 }}>
              <span className="text-sm text-gray-400">Set image URL in properties</span>
            </div>
          )}
        </div>
      );

    case 'button':
      return (
        <div style={{ padding: '20px 30px', textAlign: p.align as 'left' | 'center' | 'right' }}>
          <span
            style={{
              display: 'inline-block',
              backgroundColor: p.bgColor,
              color: p.textColor,
              padding: '12px 28px',
              borderRadius: '6px',
              fontFamily: 'Arial, sans-serif',
              fontSize: '16px',
              fontWeight: 'bold',
              textDecoration: 'none',
            }}
          >
            {p.text}
          </span>
        </div>
      );

    case 'divider':
      return (
        <div style={{ padding: '10px 30px' }}>
          <hr style={{ border: 'none', borderTop: `${p.thickness}px solid ${p.color}` }} />
        </div>
      );

    case 'spacer':
      return (
        <div style={{ height: `${p.height}px`, position: 'relative' }}>
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-gray-200" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-gray-100 px-1.5 text-[10px] text-gray-400">{p.height}px</span>
        </div>
      );

    case 'two-column':
      return (
        <div style={{ padding: '20px 30px', display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1, border: '1px dashed #d1d5db', borderRadius: '4px', padding: '12px', fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#333', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {p.leftContent}
          </div>
          <div style={{ flex: 1, border: '1px dashed #d1d5db', borderRadius: '4px', padding: '12px', fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#333', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {p.rightContent}
          </div>
        </div>
      );

    case 'footer':
      return (
        <div
          style={{
            padding: '20px 30px',
            textAlign: 'center',
            fontSize: `${p.fontSize}px`,
            color: p.color,
            fontFamily: 'Arial, sans-serif',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
          }}
        >
          {p.content}
        </div>
      );

    default:
      return <div className="p-4 text-sm text-gray-400">Unknown block</div>;
  }
}
