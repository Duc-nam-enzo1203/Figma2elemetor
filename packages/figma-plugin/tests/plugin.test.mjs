import test from 'node:test';
import assert from 'node:assert/strict';

import { sha256, utf8Bytes, utf8Decode, bytesToBase64 } from '../src/utils/crypto.js';
import { resolveWidget, isAtomicLeafWidget } from '../src/tagging/widget-resolver.js';
import { inferVirtualLayout, fixAndOptimizeCanvasSelection } from '../src/optimizer/auto-layout-fixer.js';
import { extractDesignSelection } from '../src/extraction/extractor.js';
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

  // Canvas Fixer mutates the frame into a real Figma HORIZONTAL Auto-Layout frame
  const fixStats = fixAndOptimizeCanvasSelection([rowFrame]);
  assert.equal(fixStats.convertedFrames, 1);
  assert.equal(rowFrame.layoutMode, 'HORIZONTAL');
  assert.equal(rowFrame.itemSpacing, 40);
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



