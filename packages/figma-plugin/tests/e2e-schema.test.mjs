/**
 * Full-Page E2E Elementor v3 & v4 Live-Schema Contract Test Suite
 *
 * Compiles a realistic multi-section Landing Page (Hero, Gradient Counter,
 * FAQ Nested Accordion, Styled Contact Band + Icon List + Multi-Field Form)
 * and audits every compiled element against official Elementor Engine contracts.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { extractDesignSelection } from '../src/extraction/extractor.js';
import {
  compileElementorV3,
  compileElementorClipboard,
  compileElementorV4,
} from '../src/exporters/elementor-compiler.js';
import {
  validateElementorV3Tree,
  validateElementorV4Tree,
} from '../src/exporters/schema-validator.js';

function buildFullLandingPageFixture() {
  return [
    // Section 1: Hero with Heading, Body, Gradient CTA Button & Gradient Counter "08"
    {
      id: 'e2e:hero',
      name: 'Hero Section',
      type: 'FRAME',
      visible: true,
      width: 1440,
      height: 680,
      layoutMode: 'VERTICAL',
      paddingTop: 80,
      paddingRight: 100,
      paddingBottom: 80,
      paddingLeft: 100,
      itemSpacing: 32,
      getCSSAsync: async () => ({
        display: 'flex',
        padding: '80px 100px',
        'flex-direction': 'column',
        gap: '32px',
        background: '#FFFFFF',
      }),
      children: [
        {
          id: 'e2e:h1',
          name: 'Hero Heading',
          type: 'TEXT',
          visible: true,
          characters: 'Giám sát hành trình thông minh',
          getCSSAsync: async () => ({
            color: '#0F172A',
            'font-family': '"Bricolage Grotesque"',
            'font-size': '48px',
            'font-weight': '700',
            'line-height': '56px',
          }),
        },
        {
          id: 'e2e:counter',
          name: '08',
          type: 'TEXT',
          visible: true,
          characters: '08',
          getPluginData: (k) => (k === 'f2e-widget' ? 'counter' : ''),
          getCSSAsync: async () => ({
            'font-family': 'Inter',
            'font-size': '48px',
            'font-weight': '900',
            background: 'linear-gradient(129deg, #A9C35E 0%, #038132 100%)',
            'background-clip': 'text',
            '-webkit-text-fill-color': 'transparent',
          }),
        },
        {
          id: 'e2e:cta',
          name: 'CTA Button',
          type: 'FRAME',
          visible: true,
          width: 220,
          height: 52,
          layoutMode: 'HORIZONTAL',
          getPluginData: (k) => (k === 'f2e-widget' ? 'button' : ''),
          getCSSAsync: async () => ({
            background: '#16A34A',
            'border-radius': '12px',
            padding: '14px 24px',
          }),
          children: [
            {
              id: 'e2e:cta-txt',
              name: 'Đăng ký dùng thử',
              type: 'TEXT',
              visible: true,
              characters: 'Đăng ký dùng thử',
              getCSSAsync: async () => ({ color: '#FFFFFF', 'font-size': '16px', 'font-weight': '600' }),
            },
          ],
        },
      ],
    },
    // Section 2: FAQ Card Nested Accordion
    {
      id: 'e2e:faq-sec',
      name: 'FAQ Section',
      type: 'FRAME',
      visible: true,
      width: 1440,
      height: 300,
      layoutMode: 'VERTICAL',
      paddingTop: 40,
      paddingRight: 100,
      paddingBottom: 40,
      paddingLeft: 100,
      getCSSAsync: async () => ({ display: 'flex', padding: '40px 100px', background: '#F8FAFC' }),
      children: [
        {
          id: 'e2e:faq1',
          name: 'FAQ 1',
          type: 'FRAME',
          visible: true,
          width: 600,
          height: 64,
          layoutMode: 'HORIZONTAL',
          getPluginData: (k) => (k === 'f2e-widget' ? 'nested-accordion' : ''),
          getCSSAsync: async () => ({
            display: 'flex',
            padding: '20px',
            'border-radius': '14px',
            border: '1px solid #E2E8F0',
            background: '#FFF',
          }),
          children: [
            {
              id: 'e2e:faq1-q',
              name: 'Question',
              type: 'TEXT',
              visible: true,
              characters: 'Thiết bị có bảo hành chính hãng không?',
              getCSSAsync: async () => ({ color: '#000', 'font-size': '16px', 'font-weight': '500' }),
            },
            {
              id: 'e2e:faq1-plus',
              name: 'Plus wrap',
              type: 'FRAME',
              visible: true,
              width: 32,
              height: 32,
              getCSSAsync: async () => ({ width: '32px', height: '32px', 'border-radius': '16px', background: '#ECF6EE' }),
              children: [
                {
                  id: 'e2e:faq1-v',
                  name: 'Plus',
                  type: 'VECTOR',
                  visible: true,
                  width: 14,
                  height: 14,
                  getCSSAsync: async () => ({ stroke: '#16A34A', 'stroke-width': '1.75px' }),
                },
              ],
            },
          ],
        },
      ],
    },
    // Section 3: Contact Section -> Styled Contact Band -> Icon List + 2-Col Pro Form
    {
      id: 'e2e:contact-sec',
      name: 'Contact Section',
      type: 'FRAME',
      visible: true,
      width: 1440,
      height: 580,
      layoutMode: 'HORIZONTAL',
      paddingTop: 0,
      paddingRight: 100,
      paddingBottom: 80,
      paddingLeft: 100,
      getCSSAsync: async () => ({ display: 'flex', padding: '0 100px 80px 100px', background: '#FFF' }),
      children: [
        {
          id: 'e2e:band',
          name: 'Contact band',
          type: 'FRAME',
          visible: true,
          width: 1240,
          height: 500,
          layoutMode: 'HORIZONTAL',
          layoutGrow: 1,
          paddingTop: 32,
          paddingRight: 32,
          paddingBottom: 32,
          paddingLeft: 32,
          itemSpacing: 48,
          getCSSAsync: async () => ({
            display: 'flex',
            padding: '32px',
            gap: '48px',
            'border-radius': '20px',
            border: '1.5px solid #64A14F',
            background: 'linear-gradient(97deg, #F6F5F1 0%, #ECF6EE 100%)',
          }),
          children: [
            {
              id: 'e2e:icon-list',
              name: 'Contact Info',
              type: 'FRAME',
              visible: true,
              width: 420,
              height: 160,
              layoutMode: 'VERTICAL',
              getPluginData: (k) => (k === 'f2e-widget' ? 'icon-list' : ''),
              children: [
                {
                  id: 'e2e:il1',
                  name: 'Phone',
                  type: 'FRAME',
                  visible: true,
                  children: [
                    {
                      id: 'e2e:il1-v',
                      name: 'Vector',
                      type: 'VECTOR',
                      visible: true,
                      width: 18,
                      height: 18,
                      getCSSAsync: async () => ({ stroke: '#16A34A' }),
                    },
                    {
                      id: 'e2e:il1-t',
                      name: 'Text',
                      type: 'TEXT',
                      visible: true,
                      characters: 'Hotline: 0912 345 678',
                      getCSSAsync: async () => ({ color: '#000', 'font-size': '14px' }),
                    },
                  ],
                },
              ],
            },
            {
              id: 'e2e:form',
              name: 'Lead Form',
              type: 'FRAME',
              visible: true,
              width: 680,
              height: 400,
              layoutMode: 'VERTICAL',
              layoutGrow: 1,
              getPluginData: (k) => (k === 'f2e-widget' ? 'form' : ''),
              children: [
                {
                  id: 'e2e:f-row',
                  name: 'Row',
                  type: 'FRAME',
                  visible: true,
                  layoutMode: 'HORIZONTAL',
                  children: [
                    {
                      id: 'e2e:f1',
                      name: 'Name Field',
                      type: 'FRAME',
                      visible: true,
                      layoutMode: 'VERTICAL',
                      children: [
                        { id: 'e2e:f1-l', name: 'Label', type: 'TEXT', visible: true, characters: 'Họ và tên *', getCSSAsync: async () => ({ color: '#1E293B', 'font-size': '14px' }) },
                        { id: 'e2e:f1-i', name: 'Input', type: 'FRAME', visible: true, width: 320, height: 44, getCSSAsync: async () => ({ background: '#FFF', border: '1px solid #CBD5E1', 'border-radius': '10px' }), children: [{ id: 'e2e:f1-p', name: 'PH', type: 'TEXT', visible: true, characters: 'Nhập tên', getCSSAsync: async () => ({ color: '#64748B', 'font-size': '14px' }) }] },
                      ],
                    },
                    {
                      id: 'e2e:f2',
                      name: 'Email Field',
                      type: 'FRAME',
                      visible: true,
                      layoutMode: 'VERTICAL',
                      children: [
                        { id: 'e2e:f2-l', name: 'Label', type: 'TEXT', visible: true, characters: 'Email *', getCSSAsync: async () => ({ color: '#1E293B', 'font-size': '14px' }) },
                        { id: 'e2e:f2-i', name: 'Input', type: 'FRAME', visible: true, width: 320, height: 44, getCSSAsync: async () => ({ background: '#FFF', border: '1px solid #CBD5E1', 'border-radius': '10px' }), children: [{ id: 'e2e:f2-p', name: 'PH', type: 'TEXT', visible: true, characters: 'email@domain.vn', getCSSAsync: async () => ({ color: '#64748B', 'font-size': '14px' }) }] },
                      ],
                    },
                  ],
                },
                {
                  id: 'e2e:f-btn',
                  name: 'Submit Button',
                  type: 'FRAME',
                  visible: true,
                  width: 680,
                  height: 48,
                  getPluginData: (k) => (k === 'f2e-widget' ? 'button' : ''),
                  getCSSAsync: async () => ({ background: '#16A34A', 'border-radius': '10px' }),
                  children: [{ id: 'e2e:f-bt', name: 'Gửi ngay', type: 'TEXT', visible: true, characters: 'Gửi ngay', getCSSAsync: async () => ({ color: '#FFF', 'font-size': '15px' }) }],
                },
              ],
            },
          ],
        },
      ],
    },
  ];
}

test('E2E Full-Page Live-Schema Contract: Elementor v3, Clipboard, and v4 Atomic pass with 0 violations', async () => {
  const selection = buildFullLandingPageFixture();
  const { document } = await extractDesignSelection(selection, { fileKey: 'e2e-full-page' });

  // 1. Validate Elementor v3
  const v3 = compileElementorV3(document);
  assert.equal(v3.content.length, 3, 'Should compile all 3 root sections');
  const v3Check = validateElementorV3Tree(v3.content);
  assert.equal(v3Check.valid, true, `Elementor v3 schema violations: ${JSON.stringify(v3Check.errors, null, 2)}`);
  assert.ok(v3Check.checkedCount >= 10, `Expected >= 10 checked elements, got ${v3Check.checkedCount}`);

  // 2. Validate Elementor Clipboard envelope
  const clip = compileElementorClipboard(document);
  assert.equal(clip.type, 'elementor');
  const clipCheck = validateElementorV3Tree(clip.elements);
  assert.equal(clipCheck.valid, true, `Clipboard schema violations: ${JSON.stringify(clipCheck.errors, null, 2)}`);

  // 3. Validate Elementor v4 Atomic
  const v4 = compileElementorV4(document);
  const v4Check = validateElementorV4Tree(v4.content);
  assert.equal(v4Check.valid, true, `Elementor v4 schema violations: ${JSON.stringify(v4Check.errors, null, 2)}`);
});

test('Schema Validator Negative Tests: Catches broken colors, unverified __globals__, raw SVG in icon-box, and mismatched accordion panels', () => {
  const brokenTree = [
    {
      id: 'bad0001',
      elType: 'widget',
      widgetType: 'icon-box',
      settings: {
        title_color: 'var(--broken-token)',
        selected_icon: { library: 'svg', value: '<svg><path d="M0 0"/></svg>' },
        __globals__: { title_color: 'globals/colors?id=primary' },
        custom_css: 'selector { color: red;',
      },
      elements: [],
    },
    {
      id: 'bad0002',
      elType: 'widget',
      widgetType: 'nested-accordion',
      settings: {
        items: [{ _id: 'a1', item_title: 'Q1' }, { _id: 'a2', item_title: 'Q2' }],
      },
      elements: [],
    },
  ];

  const res = validateElementorV3Tree(brokenTree);
  assert.equal(res.valid, false);
  const codes = new Set(res.errors.map((e) => e.code));
  assert.ok(codes.has('invalid-color'));
  assert.ok(codes.has('raw-svg-in-icon-box'));
  assert.ok(codes.has('unverified-global'));
  assert.ok(codes.has('unbalanced-css'));
  assert.ok(codes.has('accordion-panel-mismatch'));
});
