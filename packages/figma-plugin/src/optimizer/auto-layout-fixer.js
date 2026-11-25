/** Auto-Layout Fixer & Virtual Auto-Layout Inference for Figma frames and groups. */

import { visibleChildren, isVectorGraphic, isDividerNode, detectCompositeBackgroundChildren } from '../tagging/widget-resolver.js';

/**
 * Infers Flexbox or Grid layout parameters from child coordinates (x, y, width, height)
 * when `node.layoutMode === 'NONE'` or `node.type === 'GROUP'`.
 */
export function inferVirtualLayout(node, overrideChildren = null) {
  const nodeW = Math.round(Number(node.width) || 0);
  const nodeH = Math.round(Number(node.height) || 0);
  const kids = Array.isArray(overrideChildren) ? overrideChildren : visibleChildren(node);

  if (kids.length === 0) {
    return {
      width: nodeW,
      height: nodeH,
      mode: 'flex',
      direction: 'column',
      gap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      justify: 'MIN',
      align: 'MIN',
      inferred: true,
    };
  }

  // In Figma Plugin API, a GROUP's children have coordinates relative to the group's parent,
  // whereas a FRAME's children have coordinates relative to the frame itself.
  const baseX = node.type === 'GROUP' ? (Number(node.x) || 0) : 0;
  const baseY = node.type === 'GROUP' ? (Number(node.y) || 0) : 0;

  const boxes = kids.map((child) => {
    const x = Math.round((Number(child.x) || 0) - baseX);
    const y = Math.round((Number(child.y) || 0) - baseY);
    const w = Math.round(Number(child.width) || 0);
    const h = Math.round(Number(child.height) || 0);
    return {
      id: child.id,
      node: child,
      x,
      y,
      w,
      h,
      right: x + w,
      bottom: y + h,
      cx: x + w / 2,
      cy: y + h / 2,
    };
  });

  // Compute outer bounding box of children to infer padding
  const minX = Math.max(0, Math.min(...boxes.map((b) => b.x)));
  const minY = Math.max(0, Math.min(...boxes.map((b) => b.y)));
  const maxRight = Math.max(...boxes.map((b) => b.right));
  const maxBottom = Math.max(...boxes.map((b) => b.bottom));

  const padding = {
    top: Math.max(0, Math.round(minY)),
    left: Math.max(0, Math.round(minX)),
    right: Math.max(0, Math.round(nodeW - maxRight)),
    bottom: Math.max(0, Math.round(nodeH - maxBottom)),
  };

  if (boxes.length === 1) {
    return {
      width: nodeW,
      height: nodeH,
      mode: 'flex',
      direction: 'column',
      gap: 0,
      padding,
      justify: 'MIN',
      align: Math.abs(padding.left - padding.right) <= 12 && padding.left > 16 ? 'CENTER' : 'MIN',
      inferred: true,
    };
  }

  // Group children into horizontal rows by vertical overlap
  const sortedByY = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const box of sortedByY) {
    const existingRow = rows.find((row) => {
      const overlapTop = Math.max(row.top, box.y);
      const overlapBottom = Math.min(row.bottom, box.bottom);
      const minH = Math.min(row.bottom - row.top, box.h);
      return minH > 0 && (overlapBottom - overlapTop) / minH >= 0.45;
    });
    if (existingRow) {
      existingRow.items.push(box);
      existingRow.top = Math.min(existingRow.top, box.y);
      existingRow.bottom = Math.max(existingRow.bottom, box.bottom);
    } else {
      rows.push({ top: box.y, bottom: box.bottom, items: [box] });
    }
  }

  // Case 1: All items sit on a single horizontal row
  if (rows.length === 1) {
    const sortedX = [...rows[0].items].sort((a, b) => a.x - b.x);
    const gaps = [];
    for (let i = 1; i < sortedX.length; i += 1) {
      gaps.push(Math.max(0, sortedX[i].x - sortedX[i - 1].right));
    }
    const avgGap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
    return {
      width: nodeW,
      height: nodeH,
      mode: 'flex',
      direction: 'row',
      gap: avgGap,
      padding,
      justify: inferJustify(sortedX, nodeW, padding.left, padding.right, avgGap),
      align: inferCrossAlign(sortedX, 'y', 'cy', 'h'),
      orderedIds: sortedX.map((b) => b.id),
      inferred: true,
    };
  }

  // Case 2: Multi-row grid (e.g., 2x2, 3x2 cards where rows have equal >1 column counts)
  const colCounts = rows.map((r) => r.items.length);
  const firstColCount = colCounts[0];
  if (rows.length >= 2 && firstColCount >= 2 && colCounts.every((c) => c === firstColCount)) {
    const row0 = [...rows[0].items].sort((a, b) => a.x - b.x);
    const colGap = row0.length > 1 ? Math.max(0, row0[1].x - row0[0].right) : 16;
    const rowGap = Math.max(0, rows[1].top - rows[0].bottom);
    const orderedIds = [];
    for (const r of rows) {
      const sortedRow = [...r.items].sort((a, b) => a.x - b.x);
      orderedIds.push(...sortedRow.map((b) => b.id));
    }
    return {
      width: nodeW,
      height: nodeH,
      mode: 'grid',
      direction: 'row',
      columns: firstColCount,
      rows: rows.length,
      gap: Math.round(colGap),
      rowGap: Math.round(rowGap),
      padding,
      justify: 'MIN',
      align: 'MIN',
      orderedIds,
      inferred: true,
    };
  }

  // Case 3: Vertical stack (column)
  const rowGaps = [];
  for (let i = 1; i < rows.length; i += 1) {
    rowGaps.push(Math.max(0, rows[i].top - rows[i - 1].bottom));
  }
  const avgRowGap = rowGaps.length ? Math.round(rowGaps.reduce((a, b) => a + b, 0) / rowGaps.length) : 0;
  const orderedIds = [];
  for (const r of rows) {
    const sortedRow = [...r.items].sort((a, b) => a.x - b.x);
    orderedIds.push(...sortedRow.map((b) => b.id));
  }

  return {
    width: nodeW,
    height: nodeH,
    mode: 'flex',
    direction: 'column',
    gap: avgRowGap,
    padding,
    justify: 'MIN',
    align: inferCrossAlign(sortedByY, 'x', 'cx', 'w'),
    orderedIds,
    inferred: true,
  };
}

function inferJustify(sortedItems, containerSize, padStart, padEnd, avgGap) {
  if (sortedItems.length >= 2 && avgGap > 48 && padStart < 40 && padEnd < 40) {
    return 'SPACE_BETWEEN';
  }
  if (Math.abs(padStart - padEnd) <= 12 && padStart > 20) {
    return 'CENTER';
  }
  return 'MIN';
}

function inferCrossAlign(items, posKey, centerKey, sizeKey) {
  if (items.length < 2) return 'MIN';
  const starts = items.map((i) => i[posKey]);
  const centers = items.map((i) => i[centerKey]);
  const startSpread = Math.max(...starts) - Math.min(...starts);
  const centerSpread = Math.max(...centers) - Math.min(...centers);
  if (centerSpread <= 8 && startSpread > 8) return 'CENTER';
  return 'MIN';
}

/** Non-destructively tags composite backgrounds and vector icon groups via `f2e-widget` pluginData without mutating the canvas. */
export function fixAndOptimizeCanvasSelection(selection) {
  let virtualLayoutFrames = 0;
  let taggedIcons = 0;
  let taggedBackgrounds = 0;

  const processNode = (node) => {
    if (!node || node.visible === false) return;

    const kids = visibleChildren(node);

    // 0. Never tag 1px divider lines as SVG icons
    if (node.type !== 'TEXT' && isDividerNode(node, kids)) {
      return;
    }

    // 1. If node is a pure vector group/frame <= 128x128, mark it as an Icon so children aren't split
    if (isVectorGraphic(node)) {
      const w = Number(node.width) || 0;
      const h = Number(node.height) || 0;
      if (w <= 128 && h <= 128 && typeof node.setPluginData === 'function' && !node.getPluginData('f2e-widget')) {
        node.setPluginData('f2e-widget', 'icon');
        taggedIcons += 1;
      }
      return;
    }

    if (kids.length === 0) return;

    // 2. Detect composite background layers behind foreground content (non-destructive tagging)
    const { bgChildren, fgChildren } = detectCompositeBackgroundChildren(node);
    for (const bgNode of bgChildren) {
      if (typeof bgNode.setPluginData === 'function' && !bgNode.getPluginData('f2e-widget')) {
        bgNode.setPluginData('f2e-widget', 'background');
        taggedBackgrounds += 1;
      }
    }

    // 3. Track freeform frames that will safely use read-only Virtual Auto-Layout at export time
    if ((node.type === 'FRAME' || node.type === 'GROUP') && (!node.layoutMode || node.layoutMode === 'NONE')) {
      virtualLayoutFrames += 1;
    }

    // Recurse only into foreground children (background layers will be baked into 1 composite image)
    for (const child of fgChildren) {
      processNode(child);
    }
  };

  for (const root of selection) {
    processNode(root);
  }

  return { convertedFrames: 0, virtualLayoutFrames, taggedIcons, taggedBackgrounds };
}
