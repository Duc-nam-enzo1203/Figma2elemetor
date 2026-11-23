import test from 'node:test';
import assert from 'node:assert/strict';

import { sha256, utf8Bytes, utf8Decode, bytesToBase64 } from '../src/utils/crypto.js';
import { resolveWidget, isAtomicLeafWidget } from '../src/tagging/widget-resolver.js';
import { inferVirtualLayout, fixAndOptimizeCanvasSelection } from '../src/optimizer/auto-layout-fixer.js';
import { extractDesignSelection, inspectNodeDevMode } from '../src/extraction/extractor.js';
import { compileElementorV3, compileElementorV4, compileElementorClipboard } from '../src/exporters/elementor-compiler.js';

test('Crypto: SHA-256, UTF-8, and Base64 match standard vectors', async () => {
  const hash = await sha256('abc');
  assert.equal(hash, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

  const raw = 'Xin chào Figma → Elementor!';
  const encoded = utf8Bytes(raw);
  assert.equal(utf8Decode(encoded), raw);

  const b64 = bytesToBase64(utf8Bytes('Hello F2E'));
  assert.equal(b64, 'SGVsbG8gRjJF');
});

test('3-Layer Widget Resolver: Override > Bracket Tag > Naming > Heuristics', () => {
  // Layer 1: Override
  const overriddenNode = {
    id: '1:1',
    name: 'Random Frame',
    type: 'FRAME',
    getPluginData: (key) => (key === 'f2e-widget' ? 'price-table' : ''),
  };
  assert.deepEqual(resolveWidget(overriddenNode), { widget: 'price-table', source: 'override' });

  // Layer 2A: Bracket Tag [form], [accordion], [loop-grid]
  const formNode = {
    id: '1:2',
    name: '[form] Contact Us Section',
    type: 'FRAME',
    children: [{ id: '1:3', type: 'FRAME', visible: true }],
  };
  assert.deepEqual(resolveWidget(formNode), { widget: 'form', source: 'name-tag' });

  // Layer 3: Heuristics for Heading vs Text Editor
  const h1Node = { id: '1:4', name: 'Hero Text', type: 'TEXT', fontSize: 48, characters: 'Build Websites Faster' };
  assert.equal(resolveWidget(h1Node).widget, 'heading');

  const pNode = { id: '1:5', name: 'Body', type: 'TEXT', fontSize: 16, characters: 'Short paragraph text.' };
  assert.equal(resolveWidget(pNode).widget, 'text-editor');

  // Layer 3: Heuristics for Vector Icon
  const iconNode = {
    id: '1:6',
    name: 'IconWrapper',
    type: 'FRAME',
    width: 24,
    height: 24,
    children: [{ id: '1:7', type: 'VECTOR', visible: true }],
  };
  assert.equal(resolveWidget(iconNode).widget, 'icon');

  // Layer 3: Heuristics for Button
  const btnNode = {
    id: '1:8',
    name: 'Primary CTA',
    type: 'FRAME',
    width: 160,
    height: 48,
    cornerRadius: 8,
    fills: [{ type: 'SOLID', visible: true, color: { r: 0.1, g: 0.4, b: 0.9 } }],
    children: [{ id: '1:9', type: 'TEXT', visible: true, characters: 'Get Started' }],
  };
  assert.equal(resolveWidget(btnNode).widget, 'button');
});

test('Auto-Layout Fixer & Virtual Layout Inference for non-Auto-Layout frames', () => {
  // Horizontal row of 3 cards without Auto Layout
  const rowFrame = {
    id: '2:0',
    name: 'Features Row',
    type: 'FRAME',
    layoutMode: 'NONE',
    width: 1000,
    height: 300,
    children: [
      { id: '2:1', name: 'Card 1', type: 'FRAME', visible: true, x: 40, y: 30, width: 280, height: 240 },
      { id: '2:2', name: 'Card 2', type: 'FRAME', visible: true, x: 360, y: 30, width: 280, height: 240 },
      { id: '2:3', name: 'Card 3', type: 'FRAME', visible: true, x: 680, y: 30, width: 280, height: 240 },
    ],
  };

  const inferred = inferVirtualLayout(rowFrame);
  assert.equal(inferred.mode, 'flex');
  assert.equal(inferred.direction, 'row');
  assert.equal(inferred.gap, 40);
  assert.equal(inferred.padding.left, 40);
  assert.equal(inferred.padding.top, 30);

  // Non-destructive Canvas Analyzer must NOT mutate Figma layoutMode or shift the design
  const fixStats = fixAndOptimizeCanvasSelection([rowFrame]);
  assert.equal(fixStats.convertedFrames, 0);
  assert.equal(fixStats.virtualLayoutFrames, 1);
  assert.equal(rowFrame.layoutMode, 'NONE');
});

test('End-to-End Extraction & Compilation to Elementor v3, v4 Atomic, and Clipboard Ctrl+V', async () => {
  const mockFrame = {
    id: '10:1',
    name: 'Hero Section',
    type: 'FRAME',
    layoutMode: 'VERTICAL',
    width: 1280,
    height: 600,
    itemSpacing: 24,
    paddingTop: 80,
    paddingBottom: 80,
    paddingLeft: 60,
    paddingRight: 60,
    fills: [{ type: 'SOLID', visible: true, color: { r: 0.06, g: 0.09, b: 0.16 } }],
    children: [
      {
        id: '10:2',
        name: 'Main Heading',
        type: 'TEXT',
        visible: true,
        fontSize: 52,
        fontName: { family: 'Plus Jakarta Sans', style: 'Bold' },
        characters: 'Figma to Elementor Unlimited',
        fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }],
      },
      {
        id: '10:3',
        name: '[form] Lead Capture',
        type: 'FRAME',
        visible: true,
        layoutMode: 'VERTICAL',
        width: 480,
        height: 200,
        children: [
          {
            id: '10:4',
            name: 'Email Input',
            type: 'FRAME',
            visible: true,
            width: 480,
            height: 48,
            children: [{ id: '10:5', type: 'TEXT', visible: true, characters: 'Email Address' }],
          },
          {
            id: '10:6',
            name: '[btn] Submit',
            type: 'FRAME',
            visible: true,
            width: 180,
            height: 48,
            fills: [{ type: 'SOLID', visible: true, color: { r: 0.23, g: 0.51, b: 0.96 } }],
            children: [{ id: '10:7', type: 'TEXT', visible: true, characters: 'Subscribe Now' }],
          },
        ],
      },
    ],
  };

  const { document } = await extractDesignSelection([mockFrame], { fileKey: 'test-key' });
  assert.equal(document.kind, 'f2e.document');
  assert.equal(document.roots.length, 1);

  // Compile Elementor v3
  const v3 = compileElementorV3(document);
  assert.equal(v3.version, '0.4');
  assert.equal(v3.content.length, 1);
  const rootContainer = v3.content[0];
  assert.equal(rootContainer.elType, 'container');
  assert.equal(rootContainer.settings._f2e_node_id, '10:1');
  assert.equal(rootContainer.elements[0].widgetType, 'heading');
  assert.equal(rootContainer.elements[0].settings.header_size, 'h1');
  assert.equal(rootContainer.elements[1].widgetType, 'form');
  assert.equal(rootContainer.elements[1].settings.button_text, 'Subscribe Now');
  assert.equal(rootContainer.elements[1].settings.form_fields[0].field_type, 'email');

  // Compile Elementor Clipboard Ctrl+V
  const clip = compileElementorClipboard(document, { siteUrl: 'https://demo.local' });
  assert.equal(clip.type, 'elementor');
  assert.equal(clip.elements.length, 1);

  // Compile Elementor v4 Atomic
  const v4 = compileElementorV4(document);
  assert.equal(v4.type, 'e-flexbox');
  assert.equal(v4.content[0].widgetType, 'e-flexbox');
  assert.equal(v4.content[0].elements[0].widgetType, 'e-heading');
});

test('Atomic Leaf Widget: Logo frame with nested vector sub-paths exports as single atomic Site Logo widget', async () => {
  const mockLogoFrame = {
    id: '20:1',
    name: 'Logo',
    type: 'FRAME',
    layoutMode: 'HORIZONTAL',
    width: 82,
    height: 36,
    exportAsync: async ({ format }) => {
      assert.equal(format, 'SVG');
      return new TextEncoder().encode('<svg viewBox="0 0 82 36"><path id="ribbon"/><path id="bands"/><path id="dots"/><path id="text"/></svg>');
    },
    getPluginData: (key) => (key === 'f2e-widget' ? 'theme-site-logo' : ''),
    children: [
      {
        id: '20:2',
        name: 'svg16',
        type: 'FRAME',
        visible: true,
        children: [
          { id: '20:3', name: 'ribbon', type: 'VECTOR', visible: true },
          { id: '20:4', name: 'bands', type: 'VECTOR', visible: true },
          { id: '20:5', name: 'dots', type: 'VECTOR', visible: true },
          { id: '20:6', name: 'text', type: 'VECTOR', visible: true },
        ],
      },
    ],
  };

  const { document, assetPayloads } = await extractDesignSelection([mockLogoFrame], { fileKey: 'logo-test' });
  assert.equal(document.roots.length, 1);
  const logoNode = document.nodes[document.roots[0]];
  assert.equal(logoNode.widget, 'theme-site-logo');
  // Crucial: Children must NOT be extracted into document.nodes!
  assert.equal(logoNode.children.length, 0);
  assert.ok(logoNode.svg);
  assert.ok(logoNode.svg.markup.includes('<path id="ribbon"/>'));
  assert.equal(assetPayloads.length, 1);
  assert.equal(assetPayloads[0].kind, 'svg');

  // Verify V3 compilation
  const v3 = compileElementorV3(document);
  assert.equal(v3.content.length, 1);
  assert.equal(v3.content[0].widgetType, 'theme-site-logo');
  assert.equal(v3.content[0].settings.use_custom_image, 'yes');
  assert.ok(v3.content[0].settings.custom_image.url.includes('data:image/svg+xml'));
});

test('Atomic Leaf Widget: Nav frame with text links extracts as single Nav Menu widget with menuItems', async () => {
  const mockNavFrame = {
    id: '30:1',
    name: 'Nav',
    type: 'FRAME',
    layoutMode: 'HORIZONTAL',
    width: 494,
    height: 18,
    itemSpacing: 24,
    getPluginData: (key) => (key === 'f2e-widget' ? 'nav-menu' : ''),
    children: [
      { id: '30:2', name: 'Trang chủ', type: 'TEXT', visible: true, characters: 'Trang chủ' },
      { id: '30:3', name: 'Giải pháp', type: 'TEXT', visible: true, characters: 'Giải pháp' },
      { id: '30:4', name: 'Thiết bị', type: 'TEXT', visible: true, characters: 'Thiết bị' },
      { id: '30:5', name: 'Ứng dụng', type: 'TEXT', visible: true, characters: 'Ứng dụng' },
      { id: '30:6', name: 'Hỏi đáp', type: 'TEXT', visible: true, characters: 'Hỏi đáp' },
      { id: '30:7', name: 'Liên hệ', type: 'TEXT', visible: true, characters: 'Liên hệ' },
    ],
  };

  const { document } = await extractDesignSelection([mockNavFrame], { fileKey: 'nav-test' });
  assert.equal(document.roots.length, 1);
  const navNode = document.nodes[document.roots[0]];
  assert.equal(navNode.widget, 'nav-menu');
  // Children must NOT be extracted into document.nodes!
  assert.equal(navNode.children.length, 0);
  assert.equal(navNode.content.menuItems.length, 6);
  assert.equal(navNode.content.menuItems[0].name, 'Trang chủ');
  assert.equal(navNode.content.menuItems[5].name, 'Liên hệ');

  // Verify V3 compilation
  const v3 = compileElementorV3(document);
  assert.equal(v3.content.length, 1);
  assert.equal(v3.content[0].widgetType, 'nav-menu');
  assert.equal(v3.content[0].settings._f2e_menu_items.length, 6);
  assert.equal(v3.content[0].settings._f2e_menu_items[0], 'Trang chủ');
});

test('Atomic Composite Widget: Strip section with dot+text items resolves and compiles to inline Icon List', async () => {
  const mockStripFrame = {
    id: '40:1',
    name: 'Section',
    type: 'FRAME',
    layoutMode: 'HORIZONTAL',
    width: 1440,
    height: 55,
    itemSpacing: 32,
    children: [
      {
        id: '40:2',
        name: 'Strip item',
        type: 'FRAME',
        visible: true,
        children: [
          { id: '40:3', name: 'dot', type: 'ELLIPSE', width: 6, height: 6, visible: true },
          { id: '40:4', name: 'Bản đồ thời gian thực', type: 'TEXT', visible: true, characters: 'Bản đồ thời gian thực' },
        ],
      },
      {
        id: '40:5',
        name: 'Strip item',
        type: 'FRAME',
        visible: true,
        children: [
          { id: '40:6', name: 'dot', type: 'ELLIPSE', width: 6, height: 6, visible: true },
          { id: '40:7', name: 'Lịch sử hành trình', type: 'TEXT', visible: true, characters: 'Lịch sử hành trình' },
        ],
      },
      {
        id: '40:8',
        name: 'Strip item',
        type: 'FRAME',
        visible: true,
        children: [
          { id: '40:9', name: 'dot', type: 'ELLIPSE', width: 6, height: 6, visible: true },
          { id: '40:10', name: 'Cảnh báo tức thời', type: 'TEXT', visible: true, characters: 'Cảnh báo tức thời' },
        ],
      },
    ],
  };

  const { document } = await extractDesignSelection([mockStripFrame], { fileKey: 'strip-test' });
  assert.equal(document.roots.length, 1);
  const stripNode = document.nodes[document.roots[0]];
  assert.equal(stripNode.widget, 'icon-list');
  // Crucial: Children must NOT be extracted into separate elements in document.nodes!
  assert.equal(stripNode.children.length, 0);
  assert.equal(stripNode.content.iconList.length, 3);
  assert.equal(stripNode.content.iconList[0].text, 'Bản đồ thời gian thực');
  assert.equal(stripNode.content.iconList[1].text, 'Lịch sử hành trình');

  // Verify V3 compilation
  const v3 = compileElementorV3(document);
  assert.equal(v3.content.length, 1);
  assert.equal(v3.content[0].widgetType, 'icon-list');
  assert.equal(v3.content[0].settings.view, 'inline');
  assert.equal(v3.content[0].settings.icon_list.length, 3);
  assert.equal(v3.content[0].settings.icon_list[0].text, 'Bản đồ thời gian thực');
});

test('Card vs Atomic: Stat card resolves to Container with Heading, Text, Absolute Icon, and Divider line', async () => {
  const mockStatCard = {
    id: '50:1',
    name: 'Stat card',
    type: 'FRAME',
    layoutMode: 'VERTICAL',
    width: 292,
    height: 164,
    itemSpacing: 12,
    paddingTop: 24,
    paddingBottom: 24,
    paddingLeft: 24,
    paddingRight: 24,
    children: [
      {
        id: '50:2',
        name: '08',
        type: 'TEXT',
        fontSize: 36,
        characters: '08',
        visible: true,
      },
      {
        id: '50:3',
        name: 'Dự án đã triển khai',
        type: 'TEXT',
        fontSize: 14,
        characters: 'Dự án đã triển khai',
        visible: true,
      },
      {
        id: '50:4',
        name: 'vuesax/linear/document-text',
        type: 'FRAME',
        layoutPositioning: 'ABSOLUTE',
        x: 220,
        y: 20,
        width: 56,
        height: 56,
        visible: true,
        exportAsync: async () => new TextEncoder().encode('<svg viewBox="0 0 56 56"><path/></svg>'),
        children: [{ id: '50:5', type: 'VECTOR', visible: true }],
      },
      {
        id: '50:6',
        name: 'Frame 2121452969',
        type: 'FRAME',
        width: 65,
        height: 4,
        visible: true,
        fills: [{ type: 'SOLID', visible: true, color: { r: 0.06, g: 0.72, b: 0.5 } }],
        children: [],
      },
    ],
  };

  const { document } = await extractDesignSelection([mockStatCard], { fileKey: 'card-test' });
  assert.equal(document.roots.length, 1);
  const cardNode = document.nodes[document.roots[0]];

  // 1. Stat card MUST be Container, NOT Counter!
  assert.equal(cardNode.widget, 'container');
  assert.equal(cardNode.children.length, 4);

  // 2. Child 1: 08 is Heading
  const numNode = document.nodes[cardNode.children[0]];
  assert.equal(numNode.widget, 'heading');

  // 3. Child 2: Dự án đã triển khai is Text Editor
  const labelNode = document.nodes[cardNode.children[1]];
  assert.equal(labelNode.widget, 'text-editor');

  // 4. Child 3: vuesax icon is Icon with absolute position
  const iconNode = document.nodes[cardNode.children[2]];
  assert.equal(iconNode.widget, 'icon');
  assert.equal(iconNode.layout.position, 'absolute');

  // 5. Child 4: Frame 2121452969 (65x4) is Divider
  const dividerNode = document.nodes[cardNode.children[3]];
  assert.equal(dividerNode.widget, 'divider');

  // 6. Elementor V3 Compilation
  const v3 = compileElementorV3(document);
  assert.equal(v3.content.length, 1);
  const container = v3.content[0];
  assert.equal(container.elType, 'container');
  assert.equal(container.elements.length, 4);

  // Absolute icon settings in Elementor
  const iconEl = container.elements[2];
  assert.equal(iconEl.settings.position, 'absolute');
  assert.equal(iconEl.settings._offset_orientation_h, 'end'); // Closer to right edge!

  // Divider settings in Elementor
  const dividerEl = container.elements[3];
  assert.equal(dividerEl.widgetType, 'divider');
  assert.equal(dividerEl.settings.weight.size, 4);
  assert.equal(dividerEl.settings.width.size, 65);
});

test('Vector Background Graphic: Pure vector frame (389x589) resolves to Image (SVG), and setting Skip ignores entire subtree', async () => {
  const mockBgFrame = {
    id: '60:1',
    name: 'bg',
    type: 'FRAME',
    width: 389,
    height: 589,
    visible: true,
    children: [
      {
        id: '60:2',
        name: 'Group',
        type: 'GROUP',
        visible: true,
        children: [
          {
            id: '60:3',
            name: 'Layer_2',
            type: 'GROUP',
            visible: true,
            children: [
              {
                id: '60:4',
                name: 'PRINT',
                type: 'GROUP',
                visible: true,
                children: [
                  {
                    id: '60:5',
                    name: 'Vector',
                    type: 'VECTOR',
                    visible: true,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  // 1. Auto-recognition: It MUST resolve to 'image' (SVG illustration), NOT 'container'!
  const resolved = resolveWidget(mockBgFrame);
  assert.equal(resolved.widget, 'image');

  // 2. When the user pins 'skip' on bg:
  mockBgFrame.getPluginData = (k) => (k === 'f2e-widget' ? 'skip' : '');
  const overrideResolved = resolveWidget(mockBgFrame);
  assert.equal(overrideResolved.widget, 'skip');

  // 3. Extraction when skipped inside a section:
  const mockSection = {
    id: '60:10',
    name: 'Section',
    type: 'FRAME',
    layoutMode: 'VERTICAL',
    width: 1440,
    height: 600,
    children: [
      mockBgFrame,
      { id: '60:20', name: 'Title', type: 'TEXT', characters: 'Content', fontSize: 24, visible: true },
    ],
  };

  const { document } = await extractDesignSelection([mockSection], { fileKey: 'bg-skip-test' });
  const sectionNode = document.nodes[document.roots[0]];
  // Crucial: bg and all of its 5 nested groups must NOT exist in document.nodes!
  assert.equal(sectionNode.children.length, 1);
  assert.equal(document.nodes[sectionNode.children[0]].widget, 'heading');
  assert.equal(document.nodes['f2e:bg-skip-test:60:1'], undefined);
  assert.equal(document.nodes['f2e:bg-skip-test:60:2'], undefined);
  assert.equal(document.nodes['f2e:bg-skip-test:60:5'], undefined);
});

test('Atomic Leaf Widget: Frame 1 pinned as Icon Box absorbs Icon, Title, and Description into single Icon Box widget and halts child recursion', async () => {
  const mockFrame1 = {
    id: '70:1',
    name: 'Frame 1',
    type: 'FRAME',
    visible: true,
    layoutMode: 'HORIZONTAL',
    width: 304,
    height: 51,
    getPluginData: (k) => (k === 'f2e-widget' ? 'icon-box' : ''),
    children: [
      {
        id: '70:2',
        name: 'Icon',
        type: 'FRAME',
        visible: true,
        width: 32,
        height: 32,
        exportAsync: async () => Buffer.from('<svg></svg>', 'utf8'),
        children: [{ id: '70:3', name: 'Vector', type: 'VECTOR', visible: true }],
      },
      {
        id: '70:4',
        name: 'Text',
        type: 'FRAME',
        visible: true,
        layoutMode: 'VERTICAL',
        width: 250,
        height: 40,
        children: [
          { id: '70:5', name: 'Title', type: 'TEXT', visible: true, characters: 'Thiết bị Pina TR90', fontSize: 16 },
          { id: '70:6', name: 'Desc', type: 'TEXT', visible: true, characters: '79 mm - 30 g - 4G - pin dự phòng', fontSize: 12 },
        ],
      },
    ],
  };

  // 1. isAtomicLeafWidget check
  const resolved = resolveWidget(mockFrame1);
  assert.equal(resolved.widget, 'icon-box');
  assert.equal(isAtomicLeafWidget(resolved.widget), true);

  // 2. Extraction check
  const { document } = await extractDesignSelection([mockFrame1], { fileKey: 'box-test' });
  assert.equal(document.roots.length, 1);
  const boxNode = document.nodes[document.roots[0]];
  assert.equal(boxNode.widget, 'icon-box');
  assert.equal(boxNode.content.title_text, 'Thiết bị Pina TR90');
  assert.equal(boxNode.content.description_text, '79 mm - 30 g - 4G - pin dự phòng');
  assert.equal(boxNode.content.position, 'left');
  assert.equal(boxNode.children.length, 0); // No child elements emitted!

  // 3. Compilation to Elementor v3
  const v3 = compileElementorV3(document);
  assert.equal(v3.content.length, 1);
  const widget = v3.content[0];
  assert.equal(widget.elType, 'widget');
  assert.equal(widget.widgetType, 'icon-box');
  assert.equal(widget.settings.title_text, 'Thiết bị Pina TR90');
  assert.equal(widget.settings.description_text, '79 mm - 30 g - 4G - pin dự phòng');
  assert.equal(widget.settings.position, 'left');
  assert.equal(widget.elements.length, 0);
});

test('Redundant Inner Container Unwrapping: Header (1440px) -> Container (1200px) -> [Logo, Nav, Button] unwraps to 1 Container', async () => {
  const mockHeaderFrame = {
    id: '80:1',
    name: 'Header',
    type: 'FRAME',
    visible: true,
    width: 1440,
    height: 80,
    layoutMode: 'HORIZONTAL',
    fills: [{ type: 'SOLID', visible: true, color: { r: 0.11, g: 0.25, b: 0.18 } }],
    children: [
      {
        id: '80:2',
        name: 'Container',
        type: 'FRAME',
        visible: true,
        width: 1200,
        height: 60,
        layoutMode: 'HORIZONTAL',
        itemSpacing: 32,
        primaryAxisAlignItems: 'SPACE_BETWEEN',
        counterAxisAlignItems: 'CENTER',
        children: [
          {
            id: '80:3',
            name: 'Logo',
            type: 'FRAME',
            visible: true,
            width: 120,
            height: 40,
            getPluginData: (k) => (k === 'f2e-widget' ? 'theme-site-logo' : ''),
          },
          {
            id: '80:4',
            name: 'Nav',
            type: 'FRAME',
            visible: true,
            width: 500,
            height: 24,
            getPluginData: (k) => (k === 'f2e-widget' ? 'nav-menu' : ''),
          },
          {
            id: '80:5',
            name: 'Button',
            type: 'FRAME',
            visible: true,
            width: 140,
            height: 44,
            getPluginData: (k) => (k === 'f2e-widget' ? 'button' : ''),
          },
        ],
      },
    ],
  };

  const { document } = await extractDesignSelection([mockHeaderFrame], { fileKey: 'header-test' });
  assert.equal(document.roots.length, 1);

  // Compile Elementor v3
  const v3 = compileElementorV3(document);
  assert.equal(v3.content.length, 1);
  const rootSec = v3.content[0];

  // The Header root must be the single top container with boxed_width = 1200
  assert.equal(rootSec.elType, 'container');
  assert.equal(rootSec.isInner, false);
  assert.equal(rootSec.settings.content_width, 'boxed');
  assert.equal(rootSec.settings.boxed_width.size, 1200);
  assert.equal(rootSec.settings.flex_direction, 'row');

  // Crucial: It must contain [Logo, Nav, Button] directly - NO intermediate container!
  assert.equal(rootSec.elements.length, 3);
  assert.equal(rootSec.elements[0].widgetType, 'theme-site-logo');
  assert.equal(rootSec.elements[1].widgetType, 'nav-menu');
  assert.equal(rootSec.elements[2].widgetType, 'button');
});

test('Explicit Container Unwrapping: Frame tagged as unwrap is eliminated and its children are promoted to parent', async () => {
  const mockCardFrame = {
    id: '90:1',
    name: 'Section',
    type: 'FRAME',
    visible: true,
    width: 1440,
    height: 600,
    layoutMode: 'VERTICAL',
    children: [
      {
        id: '90:2',
        name: 'Container',
        type: 'FRAME',
        visible: true,
        width: 1200,
        height: 500,
        layoutMode: 'VERTICAL',
        getPluginData: (k) => (k === 'f2e-widget' ? 'unwrap' : ''),
        children: [
          {
            id: '90:3',
            name: 'Section Header',
            type: 'FRAME',
            visible: true,
            width: 1200,
            height: 100,
            getPluginData: (k) => (k === 'f2e-widget' ? 'heading' : ''),
            children: [{ id: '90:31', name: 'Title', type: 'TEXT', characters: 'Section Title', visible: true }],
          },
          {
            id: '90:4',
            name: 'Row',
            type: 'FRAME',
            visible: true,
            width: 1200,
            height: 380,
            getPluginData: (k) => (k === 'f2e-widget' ? 'container' : ''),
            children: [
              {
                id: '90:41',
                name: 'Card Text',
                type: 'TEXT',
                characters: 'Card Description',
                visible: true,
              },
            ],
          },
        ],
      },
    ],
  };

  const { document } = await extractDesignSelection([mockCardFrame], { fileKey: 'unwrap-test' });
  const v3 = compileElementorV3(document);
  assert.equal(v3.content.length, 1);
  const rootSec = v3.content[0];

  // The intermediate 'Container' frame tagged as 'unwrap' must NOT exist in the output!
  // Instead, rootSec directly contains Section Header and Row
  assert.equal(rootSec.elements.length, 2);
  assert.equal(rootSec.elements[0].widgetType, 'heading');
  assert.equal(rootSec.elements[1].elType, 'container');
});

test('Multi-Container vs Single-Container Unwrapping Rule: Container 1 -> (Container 2 + Container 3) retains Container 1, while Container 1 -> Container 2 -> elements eliminates Container 2', async () => {
  // Case A: Container 1 -> Container 2 + Container 3 (Must KEEP Container 1!)
  const multiChildRoot = {
    id: '100:1',
    name: 'Container 1',
    type: 'FRAME',
    visible: true,
    width: 1440,
    height: 800,
    layoutMode: 'VERTICAL',
    children: [
      {
        id: '100:2',
        name: 'Container 2 (Left Col)',
        type: 'FRAME',
        visible: true,
        width: 600,
        height: 400,
        getPluginData: () => '',
        children: [{ id: '100:21', name: 'Text 1', type: 'TEXT', characters: 'Col 1 Content', visible: true }],
      },
      {
        id: '100:3',
        name: 'Container 3 (Right Col)',
        type: 'FRAME',
        visible: true,
        width: 600,
        height: 400,
        getPluginData: () => '',
        children: [{ id: '100:31', name: 'Text 2', type: 'TEXT', characters: 'Col 2 Content', visible: true }],
      },
    ],
  };

  const { document: docA } = await extractDesignSelection([multiChildRoot], { fileKey: 'multi-test' });
  const v3A = compileElementorV3(docA);
  // Container 1 MUST be preserved as the root section
  assert.equal(v3A.content.length, 1);
  const rootA = v3A.content[0];
  assert.equal(rootA.elType, 'container');
  assert.equal(rootA.settings._title, 'Container 1');
  // Inside Container 1 are Container 2 and Container 3
  assert.equal(rootA.elements.length, 2);
  assert.equal(rootA.elements[0].elType, 'container');
  assert.equal(rootA.elements[1].elType, 'container');

  // Case B: Container 1 -> Container 2 -> [Element 1, Element 2] (Must ELIMINATE Container 2 in the middle!)
  const singleChildWrapperRoot = {
    id: '200:1',
    name: 'Container 1 (Section)',
    type: 'FRAME',
    visible: true,
    width: 1440,
    height: 600,
    layoutMode: 'VERTICAL',
    children: [
      {
        id: '200:2',
        name: 'Container 2 (Middle Wrapper)',
        type: 'FRAME',
        visible: true,
        width: 1200,
        height: 500,
        layoutMode: 'VERTICAL',
        getPluginData: () => '',
        children: [
          {
            id: '200:3',
            name: 'Heading Element',
            type: 'FRAME',
            visible: true,
            width: 1200,
            height: 60,
            getPluginData: (k) => (k === 'f2e-widget' ? 'heading' : ''),
            children: [{ id: '200:31', name: 'T', type: 'TEXT', characters: 'Title', visible: true }],
          },
          {
            id: '200:4',
            name: 'Button Element',
            type: 'FRAME',
            visible: true,
            width: 160,
            height: 44,
            getPluginData: (k) => (k === 'f2e-widget' ? 'button' : ''),
            children: [{ id: '200:41', name: 'B', type: 'TEXT', characters: 'Click', visible: true }],
          },
        ],
      },
    ],
  };

  const { document: docB } = await extractDesignSelection([singleChildWrapperRoot], { fileKey: 'single-wrapper-test' });
  const v3B = compileElementorV3(docB);
  // Container 1 MUST be preserved
  assert.equal(v3B.content.length, 1);
  const rootB = v3B.content[0];
  assert.equal(rootB.elType, 'container');
  assert.equal(rootB.settings._title, 'Container 1 (Section)');
  // Container 2 in the middle is eliminated!
  // The 2 elements (Heading, Button) are placed directly in Container 1
  assert.equal(rootB.elements.length, 2);
  assert.equal(rootB.elements[0].widgetType, 'heading');
  assert.equal(rootB.elements[1].widgetType, 'button');
});

test('Button Icon & Background Style: Button with vector arrow extracts icon and background_background', async () => {
  const buttonFrame = {
    id: '300:1',
    name: 'CTA Button',
    type: 'FRAME',
    visible: true,
    width: 200,
    height: 48,
    layoutMode: 'HORIZONTAL',
    getPluginData: (k) => (k === 'f2e-widget' ? 'button' : ''),
    fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.7, b: 0.3 }, visible: true, opacity: 1 }],
    cornerRadius: 8,
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 12,
    paddingBottom: 12,
    getCSSAsync: async () => ({
      background: '#1AB24D',
      'border-radius': '8px',
      padding: '12px 20px',
      display: 'flex',
      'align-items': 'center',
      gap: '8px',
    }),
    children: [
      {
        id: '300:2',
        name: 'Xem giải pháp doanh nghiệp',
        type: 'TEXT',
        visible: true,
        characters: 'Xem giải pháp doanh nghiệp',
        x: 20,
        fontSize: 15,
        fontName: { family: 'Inter', style: 'SemiBold' },
        fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, visible: true, opacity: 1 }],
        getCSSAsync: async () => ({
          'font-family': 'Inter',
          'font-size': '15px',
          'font-weight': '600',
          color: '#FFFFFF',
        }),
      },
      {
        id: '300:3',
        name: 'arrow-right-icon',
        type: 'VECTOR',
        visible: true,
        x: 170,
        width: 16,
        height: 16,
      },
    ],
  };

  const { document: doc } = await extractDesignSelection([buttonFrame], { fileKey: 'btn-icon-test' });
  const v3 = compileElementorV3(doc);

  assert.equal(v3.content.length, 1);
  const btnWidget = v3.content[0];
  assert.equal(btnWidget.widgetType, 'button');
  assert.equal(btnWidget.settings.text, 'Xem giải pháp doanh nghiệp');
  // Check background
  assert.equal(btnWidget.settings.background_background, 'classic');
  assert.ok(btnWidget.settings.background_color);
  // Check icon
  assert.ok(btnWidget.settings.selected_icon);
  assert.equal(btnWidget.settings.selected_icon.value, 'fas fa-arrow-right');
  assert.equal(btnWidget.settings.icon_align, 'right');
  assert.equal(btnWidget.settings.icon_indent.size, 8);
});

test('Design System & Site Settings Extraction: Colors, Typography roles, Theme Styles & Layout', async () => {
  const { extractLocalDesignSystem, detectColorRole, detectTypographyRole } = await import('../src/extraction/extractor.js');

  // 1. Role detection
  assert.equal(detectColorRole('Primary Brand Color'), 'primary');
  assert.equal(detectColorRole('Secondary-600'), 'secondary');
  assert.equal(detectColorRole('Text/Dark'), 'text');
  assert.equal(detectColorRole('Accent Coral'), 'accent');
  assert.equal(detectColorRole('Neutral Gray 100'), 'custom');

  assert.equal(detectTypographyRole('H1 / Hero Heading'), 'h1');
  assert.equal(detectTypographyRole('Heading 2'), 'h2');
  assert.equal(detectTypographyRole('Body Regular 16'), 'body');
  assert.equal(detectTypographyRole('Link / Underline'), 'link');
  assert.equal(detectTypographyRole('Caption Small'), 'custom');

  // 2. Mock Figma API with Variables, Paint Styles, and Text Styles
  const mockFigma = {
    variables: {
      getLocalVariablesAsync: async (type) => {
        if (type === 'COLOR') {
          return [
            {
              id: 'var:1',
              name: 'brand-primary',
              variableCollectionId: 'col:1',
              valuesByMode: { 'mode:1': { r: 0.145, g: 0.388, b: 0.921, a: 1 } },
            },
            {
              id: 'var:2',
              name: 'neutral-text',
              variableCollectionId: 'col:1',
              valuesByMode: { 'mode:1': { r: 0.05, g: 0.05, b: 0.06, a: 1 } },
            },
          ];
        }
        return [];
      },
      getLocalVariableCollectionsAsync: async () => [
        { id: 'col:1', defaultModeId: 'mode:1', modes: [{ modeId: 'mode:1' }] },
      ],
    },
    getLocalPaintStylesAsync: async () => [
      {
        id: 'ps:1',
        name: 'Accent Green',
        paints: [{ type: 'SOLID', color: { r: 0.06, g: 0.72, b: 0.5 }, opacity: 1, visible: true }],
      },
    ],
    getLocalTextStylesAsync: async () => [
      {
        id: 'ts:1',
        name: 'H1 Heading',
        fontSize: 48,
        fontName: { family: 'Plus Jakarta Sans', style: 'Bold' },
        lineHeight: { unit: 'PERCENT', value: 120 },
      },
      {
        id: 'ts:2',
        name: 'Body Paragraph',
        fontSize: 16,
        fontName: { family: 'Plus Jakarta Sans', style: 'Regular' },
        lineHeight: { unit: 'PIXELS', value: 24 },
      },
    ],
  };

  // Mock Active Selection containing a Root Frame and a Button Component
  const mockSelection = [
    {
      id: 'frame:root',
      name: 'Desktop Landing 1440',
      type: 'FRAME',
      width: 1440,
      height: 900,
      visible: true,
      fills: [{ type: 'SOLID', color: { r: 0.09, g: 0.09, b: 0.11 }, opacity: 1, visible: true }],
      children: [
        {
          id: 'btn:1',
          name: 'Primary Button',
          type: 'FRAME',
          visible: true,
          cornerRadius: 8,
          paddingTop: 12,
          paddingRight: 24,
          paddingBottom: 12,
          paddingLeft: 24,
          fills: [{ type: 'SOLID', color: { r: 0.145, g: 0.388, b: 0.921 }, opacity: 1, visible: true }],
          children: [
            {
              id: 'btn:txt',
              type: 'TEXT',
              characters: 'Get Started',
              fontSize: 15,
              fontName: { family: 'Plus Jakarta Sans', style: 'SemiBold' },
              fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1, visible: true }],
              visible: true,
            },
          ],
        },
      ],
    },
  ];

  const extracted = await extractLocalDesignSystem(mockFigma, mockSelection);

  // Check Colors
  assert.equal(extracted.colors.length, 3);
  assert.equal(extracted.colors[0].role, 'primary');
  assert.equal(extracted.colors[1].role, 'text');
  assert.equal(extracted.colors[2].role, 'accent');

  // Check Typography
  assert.equal(extracted.typography.length, 2);
  assert.equal(extracted.typography[0].role, 'h1');
  assert.equal(extracted.typography[0].fontSize, 48);
  assert.equal(extracted.typography[1].role, 'body');

  // Check Theme Styles (Typography H1 & Body + Button)
  assert.ok(extracted.themeStyles.typography.h1);
  assert.equal(extracted.themeStyles.typography.h1.fontSize, 48);
  assert.ok(extracted.themeStyles.buttons);
  assert.equal(extracted.themeStyles.buttons.borderRadius.top, 8);
  assert.equal(extracted.themeStyles.buttons.padding.right, 24);

  // Check General Settings (Layout width & background color)
  assert.equal(extracted.settings.layout.containerWidth, 1440);
  assert.ok(extracted.settings.background.color);
});

test('Post-Convert Fidelity Verifier & Auto-Healer: Heals Situations 4-column SVG Icon-Box & Eyebrow Section JSON', async () => {
  const { verifyAndHealElementorJson } = await import('../src/exporters/fidelity-verifier.js');

  const brokenClipboardElements = [
    {
      id: 'dab8413',
      elType: 'container',
      isInner: false,
      settings: {
        container_type: 'flex',
        flex_direction: 'column',
        background_background: 'classic',
        background_color: '#F6F5F1',
        _f2e_node_id: '47:5888',
        _title: 'Section',
      },
      elements: [
        {
          id: 'aef4cec',
          elType: 'container',
          isInner: true,
          settings: { container_type: 'flex', flex_direction: 'column', _f2e_node_id: '47:5890', _title: 'Heading + Conclusion' },
          elements: [
            {
              id: '245693a',
              elType: 'container',
              isInner: true,
              settings: { container_type: 'flex', flex_direction: 'column', _f2e_node_id: '47:5891', _title: 'Heading' },
              elements: [
                {
                  id: '746197f',
                  elType: 'container',
                  isInner: true,
                  settings: {
                    container_type: 'flex',
                    flex_direction: 'row',
                    width: { unit: 'px', size: 157, sizes: [] },
                    _f2e_node_id: '47:5892',
                    _title: 'Eyebrow',
                  },
                  elements: [
                    {
                      id: 'd314fb4',
                      elType: 'widget',
                      widgetType: 'text-editor',
                      isInner: false,
                      settings: {
                        editor: '<p style="margin:0;">TÌNH HUỐNG THỰC TẾ</p>',
                        text_color: '#16A34A',
                        __globals__: {
                          text_color: 'globals/colors?id=primary',
                          typography_typography: 'globals/typography?id=text',
                        },
                        _f2e_node_id: '47:5893',
                        _title: 'TÌNH HUỐNG THỰC TẾ',
                      },
                      elements: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: '924fab7',
          elType: 'container',
          isInner: true,
          settings: {
            container_type: 'flex',
            flex_direction: 'row',
            flex_gap: { unit: 'px', size: 24, column: '24', row: '24', isLinked: true },
            flex_wrap: 'wrap',
            background_background: 'classic',
            background_color: '#FFFFFF',
            __globals__: {
              background_color: 'globals/colors?id=848461d',
              border_color: 'globals/colors?id=31b945e',
            },
            border_border: 'solid',
            border_color: '#E2E8F0',
            _f2e_node_id: '47:5897',
            _title: 'Situations',
          },
          elements: [
            {
              id: '5eca9f6',
              elType: 'widget',
              widgetType: 'icon-box',
              isInner: false,
              settings: {
                title_text: 'Không biết xe ở đâu, chỉ biết khi khách hàng chủ động thông báo',
                description_text: '',
                position: 'top',
                title_color: '#000000',
                __globals__: { title_color: 'globals/colors?id=text', title_typography_typography: 'globals/typography?id=text' },
                selected_icon: {
                  value: '<svg width="42" height="42" viewBox="0 0 42 42" fill="none"><path d="M0 0h42v42" stroke="#16A34A"/></svg>',
                  library: 'svg',
                },
                _element_width: 'inherit',
                _flex_size: 'grow',
                _f2e_node_id: '47:5898',
                _title: 'Situation',
              },
              elements: [],
            },
            {
              id: '33486aa',
              elType: 'widget',
              widgetType: 'icon-box',
              isInner: false,
              settings: {
                title_text: 'Xe rời khỏi khu vực kiểm soát mà không ai hay',
                description_text: '',
                position: 'top',
                title_color: '#000000',
                selected_icon: {
                  value: '<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><path d="M0 0h40v40" stroke="#16A34A"/></svg>',
                  library: 'svg',
                },
                _element_width: 'inherit',
                _flex_size: 'grow',
                _f2e_node_id: '47:5906',
                _title: 'Situation',
              },
              elements: [],
            },
            {
              id: 'f7bd335',
              elType: 'widget',
              widgetType: 'icon-box',
              isInner: false,
              settings: {
                title_text: 'Thiết bị bị tháo hoặc bị ngắt nguồn giữa đường',
                description_text: '',
                position: 'top',
                title_color: '#000000',
                selected_icon: {
                  value: '<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><path d="M0 0h40v40" stroke="#16A34A"/></svg>',
                  library: 'svg',
                },
                _element_width: 'inherit',
                _flex_size: 'grow',
                _f2e_node_id: '47:5913',
                _title: 'Situation',
              },
              elements: [],
            },
            {
              id: '9bddf9a',
              elType: 'widget',
              widgetType: 'icon-box',
              isInner: false,
              settings: {
                title_text: 'Cần xem lại xe đã đi những đâu nhưng không có dữ liệu',
                description_text: '',
                position: 'top',
                title_color: '#000000',
                selected_icon: {
                  value: '<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><path d="M0 0h40v40" stroke="#16A34A"/></svg>',
                  library: 'svg',
                },
                _element_width: 'inherit',
                _flex_size: 'grow',
                _f2e_node_id: '47:5921',
                _title: 'Situation',
              },
              elements: [],
            },
          ],
        },
      ],
    },
  ];

  const { elements: healed, report } = verifyAndHealElementorJson(brokenClipboardElements);

  assert.ok(report.healedCount >= 6);
  const root = healed[0];
  const eyebrowContainer = root.elements[0].elements[0].elements[0];
  const eyebrowText = eyebrowContainer.elements[0];

  // 1. Eyebrow tight width removed & bogus __globals__ removed
  assert.equal(eyebrowContainer.settings.width, undefined);
  assert.equal(eyebrowText.settings.__globals__, undefined);
  assert.equal(eyebrowText.settings.text_color, '#16A34A');

  // 2. Situations card keeps white background (#FFFFFF), removes bogus 848461d global ID and removes phantom #E2E8F0 border
  const situationsBox = root.elements[1];
  assert.equal(situationsBox.settings.__globals__, undefined);
  assert.equal(situationsBox.settings.background_color, '#FFFFFF');
  assert.equal(situationsBox.settings.border_border, undefined);
  assert.equal(situationsBox.settings.border_color, undefined);
  assert.equal(situationsBox.settings.flex_wrap, 'nowrap');

  // 3. 4 clean Situation Containers (no fake HTML divider widgets); first 3 have border-right: 1px solid #16A34A & padding-right: 24px
  assert.equal(situationsBox.elements.length, 4);
  const firstSituation = situationsBox.elements[0];
  assert.equal(firstSituation.elType, 'container');
  assert.equal(firstSituation.settings.width.size, 22.56);
  assert.equal(firstSituation.settings.border_border, 'solid');
  assert.equal(firstSituation.settings.border_width.right, '1');
  assert.equal(firstSituation.settings.border_width.top, '0');
  assert.equal(firstSituation.settings.border_color, '#16A34A');
  assert.equal(firstSituation.settings.padding.right, '24');
  assert.equal(firstSituation.elements[0].widgetType, 'html');
  assert.ok(firstSituation.elements[0].settings.html.includes('<svg'));
  assert.equal(firstSituation.elements[1].widgetType, 'text-editor');
  assert.equal(firstSituation.elements[1].settings.align, 'left');

  const fourthSituation = situationsBox.elements[3];
  assert.equal(fourthSituation.elType, 'container');
  assert.equal(fourthSituation.settings.border_border, undefined);
});

test('Dev Mode CSS Authoritative Extraction: Unwraps var(--token, fallback), strips phantom border, and parses border-right + padding-right', async () => {
  const { applyDevModeCSSToNode, resolveCssVars, normalizeCssColor } = await import('../src/extraction/extractor.js');

  assert.equal(resolveCssVars('var(--Spacing-24, 24px)'), '24px');
  assert.equal(normalizeCssColor('var(--Surface-White, #FFF)'), '#FFFFFF');
  assert.equal(normalizeCssColor('#000'), '#000000');

  // 1. Node with phantom stroke in `style` that is NOT in Dev Mode CSS -> must be stripped
  const situationsEntry = {
    type: 'frame',
    layout: {},
    style: {
      borderColor: '#E2E8F0',
      borderWidth: { top: 1, right: 1, bottom: 1, left: 1, isLinked: true },
    },
  };
  applyDevModeCSSToNode(situationsEntry, {
    display: 'flex',
    padding: 'var(--Space-24, 24px)',
    gap: '24px',
    'border-radius': '20px',
    background: 'var(--White, #FFF)',
  });
  assert.equal(situationsEntry.style.borderColor, undefined);
  assert.equal(situationsEntry.style.borderWidth, undefined);
  assert.equal(situationsEntry.style.background, '#FFFFFF');
  assert.equal(situationsEntry.layout.direction, 'row');
  assert.equal(situationsEntry.layout.padding.top, 24);

  // 2. Column node with border-right and padding-right in Dev Mode CSS
  const colEntry = {
    type: 'frame',
    layout: {},
    style: {},
  };
  applyDevModeCSSToNode(colEntry, {
    display: 'flex',
    'flex-direction': 'column',
    'padding-right': 'var(--Space-24, 24px)',
    ' gap': '24px',
    gap: 'var(--Space-24, 24px)',
    flex: '1 0 0',
    'border-right': '1px solid var(--Green-Border, #16A34A)',
  });
  assert.equal(colEntry.layout.direction, 'column');
  assert.equal(colEntry.layout.sizingH, 'FILL');
  assert.equal(colEntry.layout.padding.right, 24);
  assert.equal(colEntry.layout.padding.left, 0);
  assert.equal(colEntry.style.borderColor, '#16A34A');
  assert.deepEqual(colEntry.style.borderWidth, { top: 0, right: 1, bottom: 0, left: 0, isLinked: false });
});

test('Accordion (Classic & Nested): Pinned "accordion" extracts all 7 child Feature items with titles, body descriptions, leading SVG icons, and Dev Mode CSS', async () => {
  const featureTitles = [
    'Bản đồ thời gian thực',
    'Lịch sử hành trình',
    'Thống kê từng chuyến',
    'Vùng an toàn',
    'Cảnh báo tự đặt ngưỡng',
    'Phân quyền theo vai trò',
    'Báo cáo & nhật ký',
  ];

  const makeFeatureRow = (idx, title, isFirst) => ({
    id: `47:593${idx + 5}`,
    name: 'Feature row',
    type: 'FRAME',
    visible: true,
    layoutMode: 'VERTICAL',
    itemSpacing: 12,
    paddingTop: 20,
    paddingBottom: 20,
    width: 587,
    height: isFirst ? 120 : 64,
    getCSSAsync: async () => ({
      display: 'flex',
      'flex-direction': 'column',
      'padding-top': '20px',
      'padding-bottom': '20px',
      'border-bottom': '1px solid #E2E8F0',
    }),
    children: [
      {
        id: `47:5940_${idx}`,
        name: 'Row head',
        type: 'FRAME',
        visible: true,
        layoutMode: 'HORIZONTAL',
        itemSpacing: 16,
        children: [
          {
            id: `47:5941_${idx}`,
            name: 'Icon tile',
            type: 'FRAME',
            visible: true,
            width: 40,
            height: 40,
            exportAsync: async () => new TextEncoder().encode(`<svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="${isFirst ? '#16A34A' : '#F1F5F9'}"/><path d="M10 10H30"/></svg>`),
            children: [{ id: `47:5942_${idx}`, type: 'VECTOR', visible: true }],
          },
          {
            id: `47:5943_${idx}`,
            name: title,
            type: 'TEXT',
            visible: true,
            characters: title,
            fontSize: 20,
            fontName: { family: 'Inter', style: 'SemiBold' },
            fills: [{ type: 'SOLID', visible: true, color: isFirst ? { r: 0.086, g: 0.639, b: 0.29 } : { r: 0, g: 0, b: 0 } }],
            getCSSAsync: async () => ({
              'font-family': 'Inter',
              'font-size': '20px',
              'font-weight': '600',
              color: isFirst ? '#16A34A' : '#000000',
            }),
          },
          {
            id: `47:5944_${idx}`,
            name: 'Icon/plus',
            type: 'FRAME',
            visible: true,
            width: 24,
            height: 24,
            exportAsync: async () => new TextEncoder().encode('<svg width="24" height="24"><path d="M5 12H19"/></svg>'),
            children: [{ id: `47:5945_${idx}`, type: 'VECTOR', visible: true }],
          },
        ],
      },
      ...(isFirst
        ? [
            {
              id: '47:5946_0',
              name: 'Body',
              type: 'FRAME',
              visible: true,
              layoutMode: 'HORIZONTAL',
              paddingLeft: 56,
              children: [
                {
                  id: '47:5947_0',
                  name: 'Toàn bộ xe hiện trên một bản đồ',
                  type: 'TEXT',
                  visible: true,
                  characters: 'Toàn bộ xe hiện trên một bản đồ, kèm đếm nhanh tổng số xe, đang di chuyển, đã dừng, chưa gắn thiết bị và số cảnh báo đang mở.',
                  fontSize: 16,
                  fontName: { family: 'Inter', style: 'Regular' },
                },
              ],
            },
          ]
        : []),
    ],
  });

  const featureListFrame = {
    id: '47:5934',
    name: 'Feature list',
    type: 'FRAME',
    visible: true,
    layoutMode: 'VERTICAL',
    width: 587,
    height: 651,
    getPluginData: (key) => (key === 'f2e-widget' ? 'accordion' : ''),
    children: featureTitles.map((t, i) => makeFeatureRow(i, t, i === 0)),
  };

  const { document } = await extractDesignSelection([featureListFrame], { fileKey: 'acc-test' });
  const rootId = document.roots[0];
  const accNode = document.nodes[rootId];

  assert.equal(accNode.widget, 'accordion');
  assert.equal(accNode.children.length, 7);
  assert.equal(accNode.content.accordionItems.length, 7);
  assert.equal(accNode.content.accordionItems[0].title, 'Bản đồ thời gian thực');
  assert.ok(accNode.content.accordionItems[0].body.includes('Toàn bộ xe hiện trên một bản đồ'));

  const clipboardJson = compileElementorClipboard(document, 'https://localhost');
  assert.equal(clipboardJson.elements.length, 1);
  const el = clipboardJson.elements[0];
  assert.equal(el.widgetType, 'nested-accordion');
  assert.equal(el.settings.items.length, 7);
  assert.equal(el.settings.items[0].item_title, 'Bản đồ thời gian thực');
  assert.equal(el.settings.items[6].item_title, 'Báo cáo & nhật ký');
  assert.equal(el.elements.length, 7);
  assert.equal(el.settings.active_title_color, '#16A34A');
  assert.equal(el.settings.normal_title_color, '#000000');
  assert.equal(el.settings.accordion_border_normal_color, '#E2E8F0');
  assert.ok(el.settings.custom_css.includes('.e-n-accordion-item:nth-child(1)'));
});

test('Live Figma Dev Mode CSS Inspector: Extracts raw getCSSAsync, resolves CSS vars, and builds subtree stylesheet', async () => {
  const mockCardNode = {
    id: '88:100',
    name: 'Hero Feature Card',
    type: 'FRAME',
    visible: true,
    width: 420,
    height: 260,
    layoutMode: 'VERTICAL',
    getCSSAsync: async () => ({
      display: 'flex',
      'flex-direction': 'column',
      padding: 'var(--Space-6, 24px)',
      gap: 'var(--Space-4, 16px)',
      'border-radius': 'var(--Radius-Lg, 12px)',
      border: '1px solid var(--Border-Subtle, #E2E8F0)',
      background: 'var(--Surface-Dark, #0F172A)',
    }),
    children: [
      {
        id: '88:101',
        name: 'Card Title',
        type: 'TEXT',
        visible: true,
        width: 372,
        height: 32,
        characters: 'Giám sát lộ trình 24/7',
        fontSize: 24,
        fontName: { family: 'Inter', style: 'Bold' },
        getCSSAsync: async () => ({
          color: 'var(--Text-White, #FFFFFF)',
          'font-family': 'Inter',
          'font-size': '24px',
          'font-weight': '700',
          'line-height': '32px /* 133.3% */',
        }),
      },
    ],
  };

  const info = await inspectNodeDevMode(mockCardNode, { includeSubtree: true });

  assert.equal(info.nodeId, '88:100');
  assert.equal(info.hasNativeApi, true);
  assert.equal(info.propertyCount, 7);
  assert.equal(info.rawCss.padding, 'var(--Space-6, 24px)');
  assert.equal(info.resolvedCss.padding, '24px');
  assert.equal(info.resolvedCss.background, '#0F172A');
  assert.ok(info.cssVariables.includes('--Space-6'));
  assert.ok(info.cssVariables.includes('--Surface-Dark'));
  assert.ok(info.cssBlock.includes('.f2e-hero-feature-card'));
  assert.ok(info.subtreeCssBlock.includes('.f2e-card-title'));
  assert.ok(info.mappingPills.some((p) => p.label === 'Gap' && p.value === '16px'));
  assert.ok(info.mappingPills.some((p) => p.label === 'BG' && p.value === '#0F172A'));
});

test('Counter & Gradient Text (background-clip: text): Layer "08" (47:5737) exports full typography, leading zero prefix, empty duplicate title, and linear-gradient text clip CSS', async () => {
  const layer08 = {
    id: '47:5737',
    name: '08',
    type: 'TEXT',
    visible: true,
    width: 64,
    height: 58,
    characters: '08',
    fontSize: 48,
    fontName: { family: 'Inter', style: 'Black' },
    getPluginData: (key) => (key === 'f2e-widget' ? 'counter' : ''),
    getCSSAsync: async () => ({
      'font-family': 'Inter',
      'font-size': '48px',
      'font-style': 'normal',
      'font-weight': '900',
      'line-height': 'normal',
      background: 'linear-gradient(129deg, #A9C35E 0%, #038132 100%)',
      'background-clip': 'text',
      '-webkit-background-clip': 'text',
      '-webkit-text-fill-color': 'transparent',
    }),
  };

  const { document } = await extractDesignSelection([layer08], { fileKey: 'counter-08-test' });
  const clipboardJson = compileElementorClipboard(document, { siteUrl: 'https://localhost/wp-json/' });

  assert.equal(clipboardJson.elements.length, 1);
  const counterEl = clipboardJson.elements[0];
  const s = counterEl.settings;

  assert.equal(counterEl.widgetType, 'counter');
  assert.equal(s.starting_number, 0);
  assert.equal(s.ending_number, 8);
  assert.equal(s.prefix, '0');
  assert.equal(s.suffix, '');
  assert.equal(s.title, '');
  assert.equal(s.typography_number_typography, 'custom');
  assert.equal(s.typography_number_font_family, 'Inter');
  assert.equal(s.typography_number_font_weight, '900');
  assert.equal(s.typography_number_font_style, 'normal');
  assert.equal(s.typography_number_font_size.size, 48);
  assert.equal(s.typography_number_line_height.unit, 'em');
  assert.equal(s.typography_number_line_height.size, 1.2);
  assert.equal(s.number_color, '#038132');
  assert.ok(s.custom_css.includes('linear-gradient(129deg, #A9C35E 0%, #038132 100%)'));
  assert.ok(s.custom_css.includes('background-clip: text'));
  assert.ok(s.custom_css.includes('-webkit-text-fill-color: transparent'));
});

test('All Composite Widgets Completeness: Icon-Box, Multi-Child Counter, Nav-Menu, Testimonial & Form preserve child Dev Mode CSS & Wrapper Box Styles', async () => {
  const iconBoxFrame = {
    id: '99:1',
    name: 'Feature Card',
    type: 'FRAME',
    visible: true,
    width: 360,
    height: 220,
    layoutMode: 'VERTICAL',
    itemSpacing: 16,
    getPluginData: (key) => (key === 'f2e-widget' ? 'icon-box' : ''),
    getCSSAsync: async () => ({
      display: 'flex',
      'flex-direction': 'column',
      gap: '16px',
      padding: '24px',
      background: '#F8FAFC',
      border: '1px solid #E2E8F0',
      'border-radius': '16px',
    }),
    children: [
      {
        id: '99:2',
        name: 'Icon',
        type: 'VECTOR',
        visible: true,
        width: 44,
        height: 44,
        fills: [{ type: 'SOLID', visible: true, color: { r: 0.086, g: 0.639, b: 0.29 } }],
      },
      {
        id: '99:3',
        name: 'Title',
        type: 'TEXT',
        visible: true,
        characters: 'Cảnh báo tức thời',
        getCSSAsync: async () => ({
          'font-family': 'Plus Jakarta Sans',
          'font-size': '22px',
          'font-weight': '700',
          color: '#0F172A',
        }),
      },
      {
        id: '99:4',
        name: 'Desc',
        type: 'TEXT',
        visible: true,
        characters: 'Nhận thông báo ngay khi xe vượt tốc độ hoặc ra khỏi vùng an toàn.',
        getCSSAsync: async () => ({
          'font-family': 'Inter',
          'font-size': '15px',
          'font-weight': '400',
          'line-height': '24px',
          color: '#475569',
        }),
      },
    ],
  };

  const navFrame = {
    id: '99:10',
    name: 'Main Nav',
    type: 'FRAME',
    visible: true,
    width: 480,
    height: 40,
    layoutMode: 'HORIZONTAL',
    itemSpacing: 32,
    getPluginData: (key) => (key === 'f2e-widget' ? 'nav-menu' : ''),
    children: [
      {
        id: '99:11',
        name: 'Link 1',
        type: 'TEXT',
        visible: true,
        characters: 'Sản phẩm',
        getCSSAsync: async () => ({
          'font-family': 'Inter',
          'font-size': '15px',
          'font-weight': '600',
          color: '#1E293B',
        }),
      },
      {
        id: '99:12',
        name: 'Link 2',
        type: 'TEXT',
        visible: true,
        characters: 'Bảng giá',
      },
    ],
  };

  const { document } = await extractDesignSelection([iconBoxFrame, navFrame], { fileKey: 'all-widgets-test' });
  const v3 = compileElementorV3(document);

  const ib = v3.content[0];
  assert.equal(ib.widgetType, 'icon-box');
  // Title typography & color from child 99:3 Dev Mode CSS
  assert.equal(ib.settings.title_typography_typography, 'custom');
  assert.equal(ib.settings.title_typography_font_family, 'Plus Jakarta Sans');
  assert.equal(ib.settings.title_typography_font_size.size, 22);
  assert.equal(ib.settings.title_color, '#0F172A');
  // Description typography & color from child 99:4 Dev Mode CSS (previously lost!)
  assert.equal(ib.settings.description_typography_typography, 'custom');
  assert.equal(ib.settings.description_typography_font_family, 'Inter');
  assert.equal(ib.settings.description_typography_font_size.size, 15);
  assert.equal(ib.settings.description_color, '#475569');
  // Icon size, space & frame wrapper box styles (_padding, _background_color, _border_color, _border_radius)
  assert.equal(ib.settings.icon_space.size, 16);
  assert.equal(ib.settings.icon_size.size, 44);
  assert.equal(ib.settings._padding.top, '24');
  assert.equal(ib.settings._background_color, '#F8FAFC');
  assert.equal(ib.settings._border_color, '#E2E8F0');
  assert.equal(ib.settings._border_radius.top, '16');

  const nav = v3.content[1];
  assert.equal(nav.widgetType, 'nav-menu');
  assert.equal(nav.settings.typography_typography, 'custom');
  assert.equal(nav.settings.typography_font_family, 'Inter');
  assert.equal(nav.settings.typography_font_weight, '600');
  assert.equal(nav.settings.color_menu_item, '#1E293B');
  assert.equal(nav.settings.padding_horizontal_menu_item.size, 16);
});

test('Situations 4-Column Right-Only Border, Proportional Tablet Padding & Zero Phantom __globals__', async () => {
  const makeSituation = (id, hasRightBorder) => ({
    id,
    name: 'Situation',
    type: 'FRAME',
    visible: true,
    width: 280,
    height: 120,
    layoutMode: 'VERTICAL',
    layoutSizingHorizontal: 'FILL',
    itemSpacing: 24,
    paddingRight: 24,
    strokes: hasRightBorder
      ? [
          {
            type: 'GRADIENT_LINEAR',
            visible: true,
            gradientStops: [
              { position: 0, color: { r: 0.392, g: 0.631, b: 0.31, a: 1 } },
              { position: 1, color: { r: 0.012, g: 0.506, b: 0.196, a: 1 } },
            ],
          },
        ]
      : [],
    strokeTopWeight: 0,
    strokeRightWeight: hasRightBorder ? 1 : 0,
    strokeBottomWeight: 0,
    strokeLeftWeight: 0,
    getCSSAsync: async () => ({
      display: 'flex',
      'padding-right': '24px',
      'flex-direction': 'column',
      'align-items': 'flex-start',
      gap: '24px',
      flex: '1 0 0',
      ...(hasRightBorder ? { 'border-right': '1px solid #64A14F' } : {}),
    }),
    children: [
      {
        id: `${id}_txt`,
        name: 'Desc',
        type: 'TEXT',
        visible: true,
        characters: 'Không biết xe đang ở đâu',
        getCSSAsync: async () => ({
          color: '#000',
          'font-family': 'Inter',
          'font-size': '16px',
          'font-weight': '400',
          'line-height': '24px',
        }),
      },
    ],
  });

  const situationsRoot = {
    id: '47:5897',
    name: 'Situations',
    type: 'FRAME',
    visible: true,
    width: 1200,
    height: 180,
    layoutMode: 'HORIZONTAL',
    itemSpacing: 24,
    paddingTop: 24,
    paddingRight: 24,
    paddingBottom: 24,
    paddingLeft: 24,
    getCSSAsync: async () => ({
      display: 'flex',
      padding: '24px',
      'align-items': 'flex-start',
      gap: '24px',
      'border-radius': '20px',
      border: '1px solid #E2E8F0',
      background: '#FFF',
    }),
    children: [
      makeSituation('47:5898', true),
      makeSituation('47:5906', true),
      makeSituation('47:5913', true),
      makeSituation('47:5921', false),
    ],
  };

  const { document } = await extractDesignSelection([situationsRoot], { fileKey: 'situations-fidelity' });
  const out = compileElementorClipboard(document);
  const root = out.elements[0];

  // 1. Root Tablet/Mobile padding must NEVER exceed Desktop padding (24px)
  assert.equal(root.settings.padding.top, '24');
  assert.ok(Number(root.settings.padding_tablet.top) <= 24);
  assert.ok(Number(root.settings.padding_mobile.top) <= 20);

  // 2. Right-only gradient border must use exact per-side width `0px 1px 0px 0px` (NEVER `border: 1px solid !important`)
  const col1 = root.elements[0];
  assert.equal(col1.settings.border_width.top, '0');
  assert.equal(col1.settings.border_width.right, '1');
  assert.equal(col1.settings.border_width.bottom, '0');
  assert.equal(col1.settings.border_width.left, '0');
  assert.equal(col1.settings.border_width_mobile.right, '0');
  assert.ok(!col1.settings.custom_css.includes('border: 1px solid'));
  assert.ok(col1.settings.custom_css.includes('border-width: 0px 1px 0px 0px !important;'));
  assert.ok(col1.settings.custom_css.includes('@media (max-width: 767px)'));

  // 3. No fake __globals__ injected & stripped
  assert.equal(out.fidelityReport.fixes.filter((f) => f.detail.includes('__globals__')).length, 0);
});

test('FAQ Card Nested Accordion: Preserves single item (no fake Plus wrap item), #FFFFFF bg, 1px #E2E8F0 border, 14px radius, 20px padding & #ECF6EE/#16A34A Plus icon circle', async () => {
  const faq1 = {
    id: '47:6642',
    name: 'FAQ 1',
    type: 'FRAME',
    visible: true,
    width: 560,
    height: 64,
    layoutMode: 'HORIZONTAL',
    paddingTop: 20,
    paddingRight: 20,
    paddingBottom: 20,
    paddingLeft: 20,
    itemSpacing: 16,
    getCSSAsync: async () => ({
      display: 'flex',
      height: '64px',
      padding: '20px',
      'align-items': 'center',
      gap: '16px',
      'border-radius': '14px',
      border: '1px solid #E2E8F0',
      background: '#FFF',
    }),
    children: [
      {
        id: '47:6643',
        name: 'Question',
        type: 'TEXT',
        visible: true,
        characters: 'Lắp thiết bị có ảnh hưởng bảo hành xe không?',
        getCSSAsync: async () => ({
          color: '#000',
          'font-family': 'Inter',
          'font-size': '16px',
          'font-weight': '500',
          'line-height': '24px /* 150% */',
        }),
      },
      {
        id: '47:6644',
        name: 'Plus wrap',
        type: 'FRAME',
        visible: true,
        width: 32,
        height: 32,
        getCSSAsync: async () => ({
          display: 'flex',
          width: '32px',
          height: '32px',
          'border-radius': '16px',
          background: '#ECF6EE',
        }),
        children: [
          {
            id: '47:6645',
            name: 'Plus',
            type: 'VECTOR',
            visible: true,
            width: 14,
            height: 14,
            getCSSAsync: async () => ({
              width: '14px',
              height: '14px',
              'stroke-width': '1.75px',
              stroke: '#16A34A',
            }),
          },
        ],
      },
    ],
  };

  const { document } = await extractDesignSelection([faq1], { fileKey: 'faq-card-test' });
  const out = compileElementorClipboard(document);
  const acc = out.elements[0];
  const s = acc.settings;

  assert.equal(acc.widgetType, 'nested-accordion');
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].item_title, 'Lắp thiết bị có ảnh hưởng bảo hành xe không?');
  assert.equal(acc.elements.length, 1);
  assert.equal(s.default_state, 'all_collapsed');
  assert.equal(s.accordion_padding.top, '20');
  assert.equal(s.accordion_padding.right, '20');
  assert.equal(s.accordion_padding.bottom, '20');
  assert.equal(s.accordion_padding.left, '20');
  assert.equal(s.accordion_background_normal_background, 'classic');
  assert.equal(s.accordion_background_normal_color, '#FFFFFF');
  assert.equal(s.accordion_border_normal_border, 'solid');
  assert.equal(s.accordion_border_normal_width.top, '1');
  assert.equal(s.accordion_border_normal_width.right, '1');
  assert.equal(s.accordion_border_normal_width.bottom, '1');
  assert.equal(s.accordion_border_normal_width.left, '1');
  assert.equal(s.accordion_border_normal_color, '#E2E8F0');
  assert.equal(s.accordion_border_radius.top, '14');
  assert.equal(s.normal_icon_color, '#16A34A');
  assert.equal(s.active_icon_color, '#16A34A');
  assert.ok(s.custom_css.includes('background: #ECF6EE'));
  assert.ok(s.custom_css.includes('border-radius: 16px'));
});

test('Contact Section preserves styled Contact band card, padding-top:0, icon-list colors/icons, and multi-field Form', async () => {
  const section = {
    id: '47:6683',
    name: 'Section',
    type: 'FRAME',
    visible: true,
    width: 1440,
    height: 600,
    layoutMode: 'HORIZONTAL',
    paddingTop: 0,
    paddingRight: 100,
    paddingBottom: 80,
    paddingLeft: 100,
    itemSpacing: 64,
    getCSSAsync: async () => ({
      display: 'flex',
      padding: '0 100px 80px 100px',
      'justify-content': 'center',
      'align-items': 'flex-start',
      gap: '64px',
      background: '#FFF',
    }),
    children: [
      {
        id: '47:6684',
        name: 'Contact band',
        type: 'FRAME',
        visible: true,
        width: 1240,
        height: 520,
        layoutMode: 'HORIZONTAL',
        layoutGrow: 1,
        paddingTop: 32,
        paddingRight: 32,
        paddingBottom: 32,
        paddingLeft: 32,
        itemSpacing: 64,
        cornerRadius: 20,
        getCSSAsync: async () => ({
          display: 'flex',
          padding: '32px',
          'align-items': 'flex-start',
          gap: '64px',
          flex: '1 0 0',
          'border-radius': '20px',
          border: '1.5px solid #64A14F',
          background: 'linear-gradient(97deg, #F6F5F1 0%, #ECF6EE 100%)',
        }),
        children: [
          {
            id: '47:6685',
            name: 'Section header',
            type: 'FRAME',
            visible: true,
            width: 433,
            height: 400,
            layoutMode: 'VERTICAL',
            itemSpacing: 32,
            children: [
              {
                id: '47:6695',
                name: 'Container',
                type: 'FRAME',
                visible: true,
                width: 433,
                height: 120,
                layoutMode: 'VERTICAL',
                itemSpacing: 12,
                getPluginData: (k) => (k === 'f2e-widget' ? 'icon-list' : ''),
                children: [
                  {
                    id: '47:6696',
                    name: 'Link',
                    type: 'FRAME',
                    visible: true,
                    layoutMode: 'HORIZONTAL',
                    children: [
                      {
                        id: '47:6697',
                        name: 'Icon',
                        type: 'FRAME',
                        visible: true,
                        width: 20,
                        height: 20,
                        children: [
                          {
                            id: '47:6698',
                            name: 'Vector',
                            type: 'VECTOR',
                            visible: true,
                            width: 16,
                            height: 16,
                            getCSSAsync: async () => ({ stroke: '#16A34A', 'stroke-width': '1.5px' }),
                          },
                        ],
                      },
                      {
                        id: '47:6699',
                        name: 'Text',
                        type: 'TEXT',
                        visible: true,
                        characters: 'Địa chỉ: 123 Nguyễn Trãi, Hà Nội',
                        getCSSAsync: async () => ({ color: '#000', 'font-size': '14px', 'font-family': 'Inter' }),
                      },
                    ],
                  },
                  {
                    id: '47:6700',
                    name: 'Link',
                    type: 'FRAME',
                    visible: true,
                    layoutMode: 'HORIZONTAL',
                    children: [
                      {
                        id: '47:6701',
                        name: 'Icon',
                        type: 'FRAME',
                        visible: true,
                        width: 20,
                        height: 20,
                        children: [
                          {
                            id: '47:6702',
                            name: 'Vector',
                            type: 'VECTOR',
                            visible: true,
                            width: 16,
                            height: 16,
                            getCSSAsync: async () => ({ stroke: '#16A34A', 'stroke-width': '1.5px' }),
                          },
                        ],
                      },
                      {
                        id: '47:6703',
                        name: 'Text',
                        type: 'TEXT',
                        visible: true,
                        characters: 'Hotline: 0912 345 678',
                        getCSSAsync: async () => ({ color: '#000', 'font-size': '14px', 'font-family': 'Inter' }),
                      },
                    ],
                  },
                  {
                    id: '47:6704',
                    name: 'Link',
                    type: 'FRAME',
                    visible: true,
                    layoutMode: 'HORIZONTAL',
                    children: [
                      {
                        id: '47:6705',
                        name: 'Icon',
                        type: 'FRAME',
                        visible: true,
                        width: 20,
                        height: 20,
                        children: [
                          {
                            id: '47:6706',
                            name: 'Vector',
                            type: 'VECTOR',
                            visible: true,
                            width: 16,
                            height: 16,
                            getCSSAsync: async () => ({ stroke: '#16A34A', 'stroke-width': '1.5px' }),
                          },
                        ],
                      },
                      {
                        id: '47:6707',
                        name: 'Text',
                        type: 'TEXT',
                        visible: true,
                        characters: 'contact@pinagroup.vn',
                        getCSSAsync: async () => ({ color: '#000', 'font-size': '14px', 'font-family': 'Inter' }),
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            id: '47:6710',
            name: 'Form',
            type: 'FRAME',
            visible: true,
            width: 679,
            height: 450,
            layoutMode: 'VERTICAL',
            layoutGrow: 1,
            itemSpacing: 16,
            getPluginData: (k) => (k === 'f2e-widget' ? 'form' : ''),
            children: [
              {
                id: '47:6711',
                name: 'Fields',
                type: 'FRAME',
                visible: true,
                width: 679,
                height: 360,
                layoutMode: 'VERTICAL',
                itemSpacing: 16,
                children: [
                  {
                    id: '47:6712',
                    name: 'Row',
                    type: 'FRAME',
                    visible: true,
                    width: 679,
                    height: 76,
                    layoutMode: 'HORIZONTAL',
                    itemSpacing: 16,
                    children: [
                      {
                        id: '47:6713',
                        name: 'Field 1',
                        type: 'FRAME',
                        visible: true,
                        width: 330,
                        height: 76,
                        layoutMode: 'VERTICAL',
                        children: [
                          {
                            id: '47:6714',
                            name: 'Label',
                            type: 'FRAME',
                            visible: true,
                            layoutMode: 'HORIZONTAL',
                            children: [
                              {
                                id: '47:6715',
                                name: 'Họ và tên',
                                type: 'TEXT',
                                visible: true,
                                characters: 'Họ và tên',
                                getCSSAsync: async () => ({ color: '#1E293B', 'font-size': '14px', 'font-weight': '500' }),
                              },
                              {
                                id: '47:6716',
                                name: '*',
                                type: 'TEXT',
                                visible: true,
                                characters: '*',
                                getCSSAsync: async () => ({ color: '#FF0000', 'font-size': '14px' }),
                              },
                            ],
                          },
                          {
                            id: '47:6717',
                            name: 'Input',
                            type: 'FRAME',
                            visible: true,
                            width: 330,
                            height: 44,
                            getCSSAsync: async () => ({
                              background: '#FFFFFF',
                              border: '1px solid #CBD5E1',
                              'border-radius': '10px',
                            }),
                            children: [
                              {
                                id: '47:6718',
                                name: 'Placeholder',
                                type: 'TEXT',
                                visible: true,
                                characters: 'Nhập họ và tên',
                                getCSSAsync: async () => ({ color: '#64748B', 'font-size': '14px' }),
                              },
                            ],
                          },
                        ],
                      },
                      {
                        id: '47:6719',
                        name: 'Field 2',
                        type: 'FRAME',
                        visible: true,
                        width: 330,
                        height: 76,
                        layoutMode: 'VERTICAL',
                        children: [
                          {
                            id: '47:6720',
                            name: 'Số điện thoại *',
                            type: 'TEXT',
                            visible: true,
                            characters: 'Số điện thoại *',
                            getCSSAsync: async () => ({ color: '#1E293B', 'font-size': '14px', 'font-weight': '500' }),
                          },
                          {
                            id: '47:6721',
                            name: 'Input',
                            type: 'FRAME',
                            visible: true,
                            width: 330,
                            height: 44,
                            getCSSAsync: async () => ({
                              background: '#FFFFFF',
                              border: '1px solid #CBD5E1',
                              'border-radius': '10px',
                            }),
                            children: [
                              {
                                id: '47:6722',
                                name: 'Placeholder',
                                type: 'TEXT',
                                visible: true,
                                characters: 'Nhập số điện thoại',
                                getCSSAsync: async () => ({ color: '#64748B', 'font-size': '14px' }),
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    id: '47:6723',
                    name: 'Field 3',
                    type: 'FRAME',
                    visible: true,
                    width: 679,
                    height: 140,
                    layoutMode: 'VERTICAL',
                    children: [
                      {
                        id: '47:6724',
                        name: 'Label',
                        type: 'FRAME',
                        visible: true,
                        layoutMode: 'HORIZONTAL',
                        children: [
                          {
                            id: '47:6724a',
                            name: 'Nội dung',
                            type: 'TEXT',
                            visible: true,
                            characters: 'Nội dung cần tư vấn',
                            getCSSAsync: async () => ({ color: '#1E293B', 'font-size': '14px', 'font-weight': '500' }),
                          },
                          {
                            id: '47:6724b',
                            name: '*',
                            type: 'TEXT',
                            visible: true,
                            characters: '*',
                            getCSSAsync: async () => ({ color: '#FF0000', 'font-size': '14px' }),
                          },
                        ],
                      },
                      {
                        id: '47:6725',
                        name: 'Textarea',
                        type: 'FRAME',
                        visible: true,
                        width: 679,
                        height: 100,
                        getCSSAsync: async () => ({
                          background: '#FFFFFF',
                          border: '1px solid #CBD5E1',
                          'border-radius': '10px',
                        }),
                        children: [
                          {
                            id: '47:6726',
                            name: 'Placeholder',
                            type: 'TEXT',
                            visible: true,
                            characters: 'Nhập nhu cầu của bạn...',
                            getCSSAsync: async () => ({ color: '#64748B', 'font-size': '14px' }),
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                id: '47:6727',
                name: 'Submit Button',
                type: 'FRAME',
                visible: true,
                width: 679,
                height: 48,
                getPluginData: (k) => (k === 'f2e-widget' ? 'button' : ''),
                getCSSAsync: async () => ({
                  background: '#16A34A',
                  'border-radius': '12px',
                  padding: '12px 24px',
                }),
                children: [
                  {
                    id: '47:6728',
                    name: 'Gửi yêu cầu tư vấn',
                    type: 'TEXT',
                    visible: true,
                    characters: 'Gửi yêu cầu tư vấn',
                    getCSSAsync: async () => ({ color: '#FFFFFF', 'font-size': '16px', 'font-weight': '600' }),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const { document } = await extractDesignSelection([section], { fileKey: 'contact-band-test' });
  const out = compileElementorClipboard(document);

  // 1. Root Section preserved with padding-top: 0 and #FFFFFF background
  assert.equal(out.elements.length, 1);
  const rootEl = out.elements[0];
  assert.equal(rootEl.elType, 'container');
  assert.equal(rootEl.settings.padding.top, '0');
  assert.equal(rootEl.settings.padding.bottom, '80');
  assert.equal(rootEl.settings.background_background, 'classic');
  assert.equal(rootEl.settings.background_color, '#FFFFFF');

  // 2. Inner Contact band NOT unwrapped: keeps gradient, border, radius, padding 32, and 100% inner width
  assert.equal(rootEl.elements.length, 1);
  const bandEl = rootEl.elements[0];
  assert.equal(bandEl.elType, 'container');
  assert.equal(bandEl.settings._title, 'Contact band');
  assert.equal(bandEl.settings.width.size, 100);
  assert.equal(bandEl.settings.background_background, 'gradient');
  assert.equal(bandEl.settings.background_color, '#F6F5F1');
  assert.equal(bandEl.settings.background_color_b, '#ECF6EE');
  assert.equal(bandEl.settings.border_border, 'solid');
  assert.equal(bandEl.settings.border_color, '#64A14F');
  assert.equal(bandEl.settings.border_radius.top, '20');
  assert.equal(bandEl.settings.padding.top, '32');

  // 3. Icon list has #16A34A icon color and semantic FA icons
  const headerEl = bandEl.elements[0];
  const iconListEl = headerEl.elements[0];
  assert.equal(iconListEl.widgetType, 'icon-list');
  assert.equal(iconListEl.settings.icon_color, '#16A34A');
  assert.equal(iconListEl.settings.icon_list[0].selected_icon.value, 'fas fa-map-marker-alt');
  assert.equal(iconListEl.settings.icon_list[1].selected_icon.value, 'fas fa-phone-alt');
  assert.equal(iconListEl.settings.icon_list[2].selected_icon.value, 'fas fa-envelope');

  // 4. Form extracts 3 fields (2 in 50% row + 1 textarea), required=true, mark_required=yes, no red #FF0000 input text
  const formEl = bandEl.elements[1];
  assert.equal(formEl.widgetType, 'form');
  assert.equal(formEl.settings._flex_size, 'grow');
  assert.equal(formEl.settings.form_fields.length, 3);
  assert.equal(formEl.settings.form_fields[0].field_label, 'Họ và tên');
  assert.equal(formEl.settings.form_fields[0].required, 'true');
  assert.equal(formEl.settings.form_fields[0].width, '50');
  assert.equal(formEl.settings.form_fields[1].field_type, 'tel');
  assert.equal(formEl.settings.form_fields[1].required, 'true');
  assert.equal(formEl.settings.form_fields[1].width, '50');
  assert.equal(formEl.settings.form_fields[2].field_type, 'textarea');
  assert.equal(formEl.settings.form_fields[2].width, '100');
  assert.equal(formEl.settings.mark_required, 'yes');
  assert.equal(formEl.settings.label_color, '#1E293B');
  assert.equal(formEl.settings.field_text_color, '#64748B');
  assert.equal(formEl.settings.field_background_color, '#FFFFFF');
  assert.equal(formEl.settings.field_border_color, '#CBD5E1');
  assert.equal(formEl.settings.button_text, 'Gửi yêu cầu tư vấn');
  assert.equal(formEl.settings.button_background_color, '#16A34A');
});

test('Dev Mode Design System Auto-Synthesis & Base64 Round-trip for WebP Compression', async () => {
  const { bytesToBase64, base64ToBytes } = await import('../src/utils/crypto.js');
  const { extractLocalDesignSystem } = await import('../src/extraction/extractor.js');

  // 1. Verify base64ToBytes round-trip used by on-the-spot WebP compressor
  const sampleBytes = new Uint8Array([82, 73, 70, 70, 0, 255, 128, 64, 17, 42]);
  const b64 = bytesToBase64(sampleBytes);
  const decoded = base64ToBytes(b64);
  assert.deepEqual([...decoded], [...sampleBytes]);

  // 2. Mock Figma with ZERO Local Variables/Styles — must auto-synthesize Design System from Dev Mode CSS & selection!
  const emptyFigma = {
    variables: {
      getLocalVariablesAsync: async () => [],
      getLocalVariableCollectionsAsync: async () => [],
    },
    getLocalPaintStylesAsync: async () => [],
    getLocalTextStylesAsync: async () => [],
  };

  const mockFrame = {
    id: '900:1',
    name: 'Hero Section',
    type: 'FRAME',
    visible: true,
    width: 1440,
    height: 600,
    getCSSAsync: async () => ({ background: '#FFFFFF' }),
    children: [
      {
        id: '900:2',
        name: 'Hero Title',
        type: 'TEXT',
        visible: true,
        characters: 'Giải pháp GPS thông minh',
        getCSSAsync: async () => ({
          color: 'var(--ink-dark, #0F172A)',
          'font-family': '"Bricolage Grotesque", sans-serif',
          'font-size': '44px',
          'font-weight': '700',
          'line-height': '52px',
        }),
      },
      {
        id: '900:3',
        name: 'Body Copy',
        type: 'TEXT',
        visible: true,
        characters: 'Theo dõi vị trí xe theo thời gian thực.',
        getCSSAsync: async () => ({
          color: '#334155',
          'font-family': 'Inter',
          'font-size': '16px',
          'font-weight': '400',
          'line-height': '24px',
        }),
      },
      {
        id: '900:4',
        name: 'CTA Button',
        type: 'FRAME',
        visible: true,
        width: 180,
        height: 48,
        cornerRadius: 12,
        getCSSAsync: async () => ({
          background: 'var(--brand-green, #16A34A)',
          'border-radius': '12px',
        }),
        children: [
          {
            id: '900:5',
            name: 'Btn Text',
            type: 'TEXT',
            visible: true,
            characters: 'Đăng ký ngay',
            getCSSAsync: async () => ({
              color: '#FFFFFF',
              'font-family': 'Inter',
              'font-size': '15px',
              'font-weight': '600',
            }),
          },
        ],
      },
    ],
  };

  const ds = await extractLocalDesignSystem(emptyFigma, [mockFrame]);
  assert.ok(ds.colors.length >= 3, 'Should synthesize colors from Dev Mode CSS');
  const primaryColor = ds.colors.find((c) => c.role === 'primary');
  assert.ok(primaryColor, 'Should auto-assign primary role');
  assert.equal(primaryColor.value, '#16A34A');
  assert.equal(primaryColor.name, 'Brand Green');
  assert.equal(primaryColor.source, 'devmode');

  const textColor = ds.colors.find((c) => c.role === 'text');
  assert.ok(textColor, 'Should auto-assign text role');
  assert.equal(textColor.value, '#0F172A');

  const h1 = ds.typography.find((t) => t.role === 'h1');
  assert.ok(h1, 'Should auto-synthesize H1 typography');
  assert.equal(h1.fontFamily, 'Bricolage Grotesque');
  assert.equal(h1.fontSize, 44);
  assert.equal(h1.fontWeight, '700');

  const body = ds.typography.find((t) => t.role === 'body');
  assert.ok(body, 'Should auto-synthesize Body typography');
  assert.equal(body.fontSize, 16);
  assert.ok(ds.themeStyles.typography.h1, 'Should populate themeStyles.typography.h1');
  assert.ok(ds.themeStyles.typography.body, 'Should populate themeStyles.typography.body');
});

test('Composite Background Baking & Non-Destructive Analysis: 16x9 Hero bakes 5 BG layers into 1 Container background without mutating Figma canvas', async () => {
  const { fixAndOptimizeCanvasSelection } = await import('../src/optimizer/auto-layout-fixer.js');

  const pluginDataStore = new Map();
  const makeNode = (base) => ({
    visible: true,
    getPluginData: (k) => pluginDataStore.get(`${base.id}:${k}`) || '',
    setPluginData: (k, v) => pluginDataStore.set(`${base.id}:${k}`, v),
    ...base,
  });

  // In Figma API: children[0] is bottom-most (lowest z-index), children[n-1] is top-most
  const bgBase = makeNode({ id: 'hero:bg1', name: 'BG', type: 'RECTANGLE', x: 0, y: 0, width: 1440, height: 810 });
  const bgPhoto = makeNode({ id: 'hero:bg2', name: 'BG', type: 'GROUP', x: 0, y: 0, width: 1440, height: 810, children: [] });
  const bgLine = makeNode({ id: 'hero:line', name: 'Line', type: 'GROUP', x: 0, y: 120, width: 1440, height: 600, children: [] });
  const bgMain = makeNode({ id: 'hero:main', name: 'Main', type: 'GROUP', x: 880, y: 120, width: 500, height: 680, children: [] });
  const bgOverlay = makeNode({ id: 'hero:rect', name: 'Rectangle 427', type: 'RECTANGLE', x: 0, y: 0, width: 1440, height: 810 });

  const fgMenu = makeNode({
    id: 'hero:menu',
    name: 'Menu',
    type: 'FRAME',
    x: 420,
    y: 36,
    width: 600,
    height: 40,
    layoutMode: 'HORIZONTAL',
    children: [
      makeNode({ id: 'hero:m1', name: 'Giới thiệu', type: 'TEXT', characters: 'Giới thiệu', fontSize: 14 }),
      makeNode({ id: 'hero:m2', name: 'Vị trí', type: 'TEXT', characters: 'Vị trí', fontSize: 14 }),
    ],
  });
  const fgText = makeNode({
    id: 'hero:text',
    name: 'Text',
    type: 'GROUP',
    x: 420,
    y: 160,
    width: 480,
    height: 220,
    children: [
      makeNode({ id: 'hero:h1', name: 'Headline', type: 'TEXT', characters: 'XANH thời thượng CHẠM tương lai', fontSize: 42 }),
    ],
  });
  const fgGroup = makeNode({
    id: 'hero:group',
    name: 'Group',
    type: 'GROUP',
    x: 520,
    y: 420,
    width: 240,
    height: 48,
    children: [
      makeNode({ id: 'hero:hotline', name: 'Hotline', type: 'TEXT', characters: 'Hotline: 1900 232389', fontSize: 15 }),
    ],
  });

  let fgHiddenDuringExport = false;
  const heroFrame = makeNode({
    id: 'hero:root',
    name: '16×9.',
    type: 'FRAME',
    x: 0,
    y: 0,
    width: 1440,
    height: 810,
    layoutMode: 'NONE',
    children: [bgBase, bgPhoto, bgLine, bgMain, bgOverlay, fgMenu, fgText, fgGroup],
    exportAsync: async () => {
      fgHiddenDuringExport = !fgMenu.visible && !fgText.visible && !fgGroup.visible;
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    },
  });

  // 1. Non-destructive Step 1 analysis must NEVER mutate heroFrame.layoutMode
  const analysis = fixAndOptimizeCanvasSelection([heroFrame]);
  assert.equal(heroFrame.layoutMode, 'NONE', 'Must NOT mutate Figma layoutMode on canvas');
  assert.equal(analysis.convertedFrames, 0);
  assert.equal(analysis.taggedBackgrounds, 5, 'Should tag all 5 background layers as background');

  // 2. Extraction bakes 5 BG layers into 1 composite Container background & restores foreground visibility
  const { document, assetPayloads } = await extractDesignSelection([heroFrame], { fileKey: 'hero-composite-bg' });
  assert.equal(fgHiddenDuringExport, true, 'Foreground nodes must be hidden during composite BG export');
  assert.equal(fgMenu.visible, true, 'Foreground visibility must be restored after export');
  assert.equal(fgText.visible, true);
  assert.equal(fgGroup.visible, true);
  assert.equal(assetPayloads.length, 1, 'Should produce 1 composite background image asset');

  // 3. Compiled Elementor container has background_image and ONLY foreground widgets (no 5 BG layers!)
  const v3 = compileElementorV3(document);
  const rootEl = v3.content[0];
  assert.equal(rootEl.elType, 'container');
  assert.equal(rootEl.settings.background_background, 'classic');
  assert.ok(rootEl.settings.background_image && rootEl.settings.background_image.url.startsWith('data:image/png;base64,'));
  assert.equal(rootEl.settings.background_size, 'cover');
  assert.equal(rootEl.settings.min_height && rootEl.settings.min_height.size, 810, 'Composite-BG Hero must preserve 810px min_height');
  const childTitles = rootEl.elements.map((e) => e.settings._title);
  assert.equal(rootEl.elements.length, 3, `Expected only 3 foreground children, got: ${childTitles.join(', ')}`);
  assert.ok(!childTitles.includes('BG'));
  assert.ok(!childTitles.includes('Rectangle 427'));
  assert.ok(!childTitles.includes('Main'));
});

test('Zero-Loss Dev Mode CSS -> Elementor Compiler: preserves min-height, dashed border, multi-stop gradient, box-shadow, text-shadow, opacity & glassmorphism backdrop-filter', async () => {
  const glassCard = {
    id: 'dm:card',
    name: 'Glass Hero Card',
    type: 'FRAME',
    visible: true,
    x: 0,
    y: 0,
    width: 1200,
    height: 620,
    layoutMode: 'VERTICAL',
    getCSSAsync: async () => ({
      display: 'flex',
      'flex-direction': 'column',
      'min-height': '620px',
      'max-width': '1200px',
      padding: '48px 32px',
      gap: '20px',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 50%, #16A34A 100%)',
      border: '2px dashed #22C55E',
      'border-radius': '20px',
      'box-shadow': '0px 10px 30px rgba(0, 0, 0, 0.25), 0px 2px 6px rgba(0, 0, 0, 0.12)',
      'backdrop-filter': 'blur(16px)',
      'mix-blend-mode': 'normal',
      opacity: '0.95',
      overflow: 'hidden',
    }),
    children: [
      {
        id: 'dm:title',
        name: 'Hero Title',
        type: 'TEXT',
        visible: true,
        x: 32,
        y: 48,
        width: 600,
        height: 60,
        characters: 'Sống xanh thời thượng',
        fontSize: 48,
        fontName: { family: 'Inter', style: 'Bold' },
        fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, visible: true, opacity: 1 }],
        getCSSAsync: async () => ({
          'font-family': 'Inter',
          'font-size': '48px',
          'font-weight': '700',
          color: '#FFFFFF',
          'text-decoration': 'underline',
          'text-shadow': '0px 4px 12px rgba(0, 0, 0, 0.4)',
          '-webkit-text-stroke': '1px #16A34A',
          'align-self': 'center',
        }),
      },
    ],
  };

  const { document } = await extractDesignSelection([glassCard], { fileKey: 'devmode-zero-loss' });
  const v3 = compileElementorV3(document);
  const root = v3.content[0];

  assert.equal(root.elType, 'container');
  assert.equal(root.settings.min_height.size, 620, 'Dev Mode min-height must map to min_height');
  assert.equal(root.settings.border_border, 'dashed', 'Dev Mode dashed border must not be hardcoded to solid');
  assert.equal(root.settings.box_shadow_box_shadow_type, 'yes');
  assert.equal(root.settings.box_shadow_box_shadow.blur, 30);
  assert.ok(root.settings.custom_css.includes('backdrop-filter: blur(16px);'), 'Glassmorphism backdrop-filter must be preserved in custom_css');
  assert.ok(root.settings.custom_css.includes('opacity: 0.95;'), 'Dev Mode opacity must be preserved');
  assert.ok(root.settings.custom_css.includes('linear-gradient(135deg, #0F172A 0%, #1E3A8A 50%, #16A34A 100%)'), '3-stop gradient must be preserved in custom_css');
  assert.ok(root.settings.custom_css.includes('0px 2px 6px rgba(0, 0, 0, 0.12)'), 'Multi-layer box-shadow must be preserved in custom_css');

  const heading = root.elements[0];
  assert.equal(heading.widgetType, 'heading');
  assert.equal(heading.settings.typography_text_decoration, 'underline');
  assert.equal(heading.settings.text_shadow_text_shadow_type, 'yes');
  assert.equal(heading.settings.text_shadow_text_shadow.blur, 12);
  assert.equal(heading.settings._flex_align_self, 'center');
  assert.ok(heading.settings.custom_css.includes('-webkit-text-stroke: 1px #16A34A;'));
});

test('Boxed vs Full Width layout detection: Child containers strictly full-width, Root detects boxed or full', async () => {
  const rootBoxedFrame = {
    id: '100:1',
    name: 'Section Root Boxed',
    type: 'FRAME',
    layoutMode: 'VERTICAL',
    width: 1440,
    height: 800,
    visible: true,
    paddingLeft: 60,
    paddingRight: 60,
    paddingTop: 80,
    paddingBottom: 80,
    children: [
      {
        id: '100:2',
        name: 'Child Container Column',
        type: 'FRAME',
        layoutMode: 'VERTICAL',
        width: 600,
        height: 400,
        visible: true,
        fills: [{ type: 'SOLID', visible: true, color: { r: 0.9, g: 0.9, b: 0.9 } }],
        paddingLeft: 40,
        paddingRight: 40,
        children: [
          {
            id: '100:3',
            name: 'Heading Text',
            type: 'TEXT',
            characters: 'Hello World',
            visible: true,
          },
        ],
      },
    ],
  };

  const { document } = await extractDesignSelection([rootBoxedFrame], { fileKey: 'boxed-test' });
  const v3 = compileElementorV3(document);
  const root = v3.content[0];
  assert.equal(root.settings.content_width, 'boxed');
  assert.equal(root.settings.boxed_width.size, 1320);

  const child = root.elements[0];
  assert.equal(child.settings.content_width, 'full');
  assert.equal(child.settings.boxed_width, undefined);

  // Non-Auto-Layout Root Frame with centered child span
  const nonAutoLayoutRoot = {
    id: '101:1',
    name: 'Non Auto-Layout Frame',
    type: 'FRAME',
    width: 1440,
    height: 900,
    visible: true,
    paddingLeft: 0,
    paddingRight: 0,
    children: [
      {
        id: '101:2',
        name: 'Centered Content',
        type: 'FRAME',
        x: 120,
        y: 50,
        width: 1200,
        height: 600,
        visible: true,
        children: [],
      },
    ],
  };

  const { document: doc2 } = await extractDesignSelection([nonAutoLayoutRoot], { fileKey: 'boxed-freeform-test' });
  const v3Freeform = compileElementorV3(doc2);
  const rootFreeform = v3Freeform.content[0];
  assert.equal(rootFreeform.settings.content_width, 'boxed');
  assert.equal(rootFreeform.settings.boxed_width.size, 1200);
});

test('Design System: VARIABLE_ALIAS chain resolves cleanly to RGBA hex values', async () => {
  const { extractLocalDesignSystem } = await import('../src/extraction/design-system.js');

  const mockAliasedFigma = {
    variables: {
      getLocalVariablesAsync: async (type) => {
        if (type === 'COLOR') {
          return [
            {
              id: 'var:semantic-primary',
              name: 'Color/Brand/Primary',
              variableCollectionId: 'col:semantic',
              valuesByMode: { 'mode:sem': { type: 'VARIABLE_ALIAS', id: 'var:primitive-blue' } },
            },
            {
              id: 'var:primitive-blue',
              name: 'blue/600',
              variableCollectionId: 'col:primitive',
              valuesByMode: { 'mode:prim': { r: 0.1, g: 0.4, b: 0.9, a: 1 } },
            },
          ];
        }
        return [];
      },
      getLocalVariableCollectionsAsync: async () => [
        { id: 'col:semantic', defaultModeId: 'mode:sem', modes: [{ modeId: 'mode:sem' }] },
        { id: 'col:primitive', defaultModeId: 'mode:prim', modes: [{ modeId: 'mode:prim' }] },
      ],
      getVariableByIdAsync: async (id) => {
        if (id === 'var:primitive-blue') {
          return {
            id: 'var:primitive-blue',
            name: 'blue/600',
            variableCollectionId: 'col:primitive',
            valuesByMode: { 'mode:prim': { r: 0.1, g: 0.4, b: 0.9, a: 1 } },
          };
        }
        return null;
      },
    },
    getLocalPaintStylesAsync: async () => [],
    getLocalTextStylesAsync: async () => [],
  };

  const ds = await extractLocalDesignSystem(mockAliasedFigma, []);
  assert.equal(ds.colors.length, 2);
  const primary = ds.colors.find((c) => c.name === 'Brand Primary');
  assert.ok(primary, 'Brand Primary alias must be resolved and formatted');
  assert.equal(primary.role, 'primary');
  assert.equal(primary.value, '#1A66E6');
});

test('Button Wrapper Guard: div.utility-nav wrapping a button instance remains container and inner button preserves full styles', async () => {
  const { resolveWidget } = await import('../src/tagging/widget-resolver.js');

  const wrapperFrame = {
    id: '12:2801',
    name: 'div.utility-nav',
    type: 'FRAME',
    width: 250,
    height: 48,
    visible: true,
    children: [
      {
        id: '12:2802',
        name: 'Component 1',
        type: 'INSTANCE',
        layoutMode: 'HORIZONTAL',
        width: 240,
        height: 48,
        visible: true,
        fills: [{ type: 'SOLID', color: { r: 220 / 255, g: 51 / 255, b: 10 / 255 }, visible: true }],
        cornerRadius: 4,
        paddingTop: 13,
        paddingRight: 28,
        paddingBottom: 12,
        paddingLeft: 28,
        strokes: [{ type: 'SOLID', color: { r: 220 / 255, g: 51 / 255, b: 10 / 255 }, visible: true }],
        strokeWeight: 1,
        children: [
          {
            id: 'I12:2802;1:80',
            name: 'Text',
            type: 'TEXT',
            characters: 'Request a Consultation',
            visible: true,
            fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, visible: true }],
          },
        ],
      },
    ],
  };

  // 1. Wrapper MUST be container, NOT button!
  const wrapperChoice = resolveWidget(wrapperFrame);
  assert.equal(wrapperChoice.widget, 'container');

  // 2. Child Component 1 MUST be button!
  const btnChoice = resolveWidget(wrapperFrame.children[0]);
  assert.equal(btnChoice.widget, 'button');

  // 3. E2E compilation: button preserves #DC330A and padding
  const { document } = await extractDesignSelection([wrapperFrame], { fileKey: 'btn-wrapper-test' });
  const v3 = compileElementorV3(document);

  const btnWidget = v3.content[0].widgetType === 'button' ? v3.content[0] : v3.content[0].elements[0];
  assert.equal(btnWidget.widgetType, 'button');
  assert.equal(btnWidget.settings.text, 'Request a Consultation');
  assert.equal(btnWidget.settings.background_color, '#DC330A');
  assert.equal(btnWidget.settings.border_radius.top, '4');
  assert.equal(btnWidget.settings.text_padding.top, '13');
  assert.equal(btnWidget.settings.text_padding.right, '28');
  assert.equal(btnWidget.settings.selected_icon, undefined, 'No fake arrow icon should be injected');
});

test('Form Extraction: Preserves all 5 input fields, distinguishes select & date, prevents input misclassification as button, and hides duplicate labels', async () => {
  const makeInputField = (id, name, textVal, vectorName, hasBackground = false) => ({
    id,
    name: 'input',
    type: 'INSTANCE',
    visible: true,
    width: 336,
    height: 44,
    cornerRadius: 12,
    fills: hasBackground ? [{ type: 'SOLID', color: { r: 0.349, g: 0.216, b: 0.878 }, visible: true }] : [],
    children: [
      {
        id: `${id}_content`,
        name: 'content',
        type: 'FRAME',
        visible: true,
        children: [
          {
            id: `${id}_txt`,
            name: 'Placeholder',
            type: 'TEXT',
            visible: true,
            characters: textVal,
            fontSize: 16,
          },
          {
            id: `${id}_adornment`,
            name: vectorName,
            type: 'INSTANCE',
            visible: true,
            children: [{ id: `${id}_vec`, name: 'Vector', type: 'VECTOR', visible: true }],
          },
        ],
      },
    ],
  });

  const formGroup = {
    id: '3003:3349',
    name: 'Group 13',
    type: 'GROUP',
    visible: true,
    width: 336,
    height: 350,
    getPluginData: (key) => (key === 'f2e-widget' ? 'form' : ''),
    children: [
      {
        id: '1:8280',
        name: 'Inputs',
        type: 'FRAME',
        visible: true,
        layoutMode: 'VERTICAL',
        itemSpacing: 20,
        children: [
          makeInputField('1:8281', 'input', 'Car type', 'selectarrow', false),
          makeInputField('1:8282', 'input', 'Place of rental', 'selectarrow', false),
          makeInputField('1:8283', 'input', 'Place of return', 'selectarrow', true),
          makeInputField('1:8284', 'input', 'Rental date', 'calendar-icon', true),
          makeInputField('1:8285', 'input', 'Return date', 'calendar-icon', true),
        ],
      },
      {
        id: '1:8286',
        name: 'Button',
        type: 'FRAME',
        visible: true,
        width: 336,
        height: 48,
        fills: [{ type: 'SOLID', color: { r: 1, g: 0.62, b: 0.047 }, visible: true }],
        children: [
          {
            id: '1:8287',
            name: 'Book now',
            type: 'TEXT',
            visible: true,
            characters: 'Book now',
            fontSize: 16,
          },
        ],
      },
    ],
  };

  // 1. None of the input instances should resolve to button!
  for (const child of formGroup.children[0].children) {
    const res = resolveWidget(child);
    assert.notEqual(res.widget, 'button', `Field "${child.children[0].children[0].characters}" should not be button`);
  }

  // 2. Button frame MUST resolve to button!
  const btnChoice = resolveWidget(formGroup.children[1]);
  assert.equal(btnChoice.widget, 'button');

  // 3. Extract and compile Form
  const { document } = await extractDesignSelection([formGroup], { fileKey: 'form-test' });
  const formNode = document.nodes[document.roots[0]];
  assert.equal(formNode.widget, 'form');
  assert.equal(formNode.content.formFields.length, 5, 'All 5 fields must be preserved');
  assert.equal(formNode.content.submitLabel, 'Book now');

  const clipboard = compileElementorClipboard(document, 'https://localhost');
  const formWidget = clipboard.elements[0];
  assert.equal(formWidget.widgetType, 'form');
  assert.equal(formWidget.settings.form_fields.length, 5);

  const fields = formWidget.settings.form_fields;
  assert.equal(fields[0].field_label, 'Car type');
  assert.equal(fields[0].field_type, 'select');
  assert.ok(fields[0].field_options.includes('Car type'));

  assert.equal(fields[1].field_label, 'Place of rental');
  assert.equal(fields[1].field_type, 'select');

  assert.equal(fields[2].field_label, 'Place of return');
  assert.equal(fields[2].field_type, 'select');

  assert.equal(fields[3].field_label, 'Rental date');
  assert.equal(fields[3].field_type, 'date');

  assert.equal(fields[4].field_label, 'Return date');
  assert.equal(fields[4].field_type, 'date');

  assert.equal(formWidget.settings.button_text, 'Book now');
  assert.equal(formWidget.settings.show_labels, '', 'show_labels must be empty to avoid duplicate labels when placeholders are used');
});



