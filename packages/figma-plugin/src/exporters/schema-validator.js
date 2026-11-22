/**
 * Elementor v3 & v4 Live-Schema Contract Validator
 *
 * Audits compiled Elementor JSON trees against official Elementor Engine control contracts
 * (Container, Flexbox/Grid, Nested Accordion, Pro Form, Icon List, Counter, Box/Dimension/Color controls)
 * to catch schema regressions before a single JSON payload reaches a live WordPress site.
 */

const VALID_UNITS = new Set(['px', '%', 'em', 'rem', 'vw', 'vh', 'deg', 'custom', '']);
const VALID_FORM_FIELD_TYPES = new Set([
  'text', 'email', 'textarea', 'url', 'tel', 'radio', 'select', 'checkbox',
  'acceptance', 'number', 'date', 'time', 'upload', 'password', 'html', 'hidden', 'step',
]);
const VALID_FORM_WIDTHS = new Set(['20', '25', '33', '40', '50', '60', '66', '75', '80', '100', '']);
const UNVERIFIED_GLOBAL_IDS = new Set([
  'globals/colors?id=primary',
  'globals/colors?id=secondary',
  'globals/colors?id=text',
  'globals/colors?id=accent',
  'globals/colors?id=848461d',
  'globals/colors?id=31b945e',
  'globals/typography?id=primary',
  'globals/typography?id=secondary',
  'globals/typography?id=text',
  'globals/typography?id=accent',
]);

const BOX_SETTING_KEYS = new Set([
  'padding', 'padding_tablet', 'padding_mobile',
  'margin', 'margin_tablet', 'margin_mobile',
  'border_width', 'border_width_tablet', 'border_width_mobile',
  'border_radius', 'border_radius_tablet', 'border_radius_mobile',
  '_padding', '_margin', '_border_width', '_border_radius',
  'accordion_padding', 'accordion_border_normal_width', 'accordion_border_hover_width', 'accordion_border_active_width', 'accordion_border_radius',
  'text_padding', 'button_text_padding', 'button_border_radius', 'field_border_width', 'field_border_radius',
  'image_border_radius',
]);

const COLOR_SETTING_KEYS = new Set([
  'background_color', 'background_color_b', 'border_color',
  'title_color', 'text_color', 'description_color', 'button_text_color', 'button_background_color',
  'icon_color', 'primary_color', 'secondary_color', 'bar_color',
  'label_color', 'field_text_color', 'field_background_color', 'field_border_color',
  'number_color', 'normal_title_color', 'active_title_color', 'normal_icon_color', 'active_icon_color',
  'content_content_color', 'name_text_color', 'job_text_color', 'color_menu_item',
  'accordion_background_normal_color', 'accordion_background_hover_color', 'accordion_background_active_color',
  'accordion_border_normal_color', 'accordion_border_hover_color', 'accordion_border_active_color',
  '_background_color', '_background_color_b', '_border_color',
]);

function isValidCssColor(val) {
  if (typeof val !== 'string' || val.trim() === '') return false;
  const s = val.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return true;
  if (/^rgba?\(\s*\d+(\.\d+)?\s*,\s*\d+(\.\d+)?\s*,\s*\d+(\.\d+)?(\s*,\s*\d*\.?\d+)?\s*\)$/i.test(s)) return true;
  if (s === 'transparent') return true;
  return false;
}

function hasBalancedBraces(css) {
  let depth = 0;
  for (let i = 0; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

/**
 * Validates an Elementor v3 element tree (array of root containers/widgets).
 * @param {Array<object>} elements
 * @returns {{ valid: boolean, errors: Array<{ path: string, code: string, message: string }>, checkedCount: number }}
 */
export function validateElementorV3Tree(elements) {
  const errors = [];
  const seenIds = new Set();
  let checkedCount = 0;

  const pushErr = (path, code, message) => {
    errors.push({ path, code, message });
  };

  const checkForInvalidPrimitives = (obj, path) => {
    if (obj === null || obj === undefined) return;
    if (typeof obj === 'number') {
      if (!Number.isFinite(obj)) {
        pushErr(path, 'invalid-number', `Non-finite number (${obj}) is invalid in Elementor JSON`);
      }
      return;
    }
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i += 1) {
        if (obj[i] === undefined) {
          pushErr(`${path}[${i}]`, 'undefined-array-item', 'Array contains undefined item');
        } else {
          checkForInvalidPrimitives(obj[i], `${path}[${i}]`);
        }
      }
      return;
    }
    if (typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        if (v === undefined) {
          pushErr(`${path}.${k}`, 'undefined-value', `Setting "${k}" has undefined value`);
        } else {
          checkForInvalidPrimitives(v, `${path}.${k}`);
        }
      }
    }
  };

  const validateElement = (el, path) => {
    if (!el || typeof el !== 'object') {
      pushErr(path, 'invalid-element', 'Element must be a non-null object');
      return;
    }
    checkedCount += 1;

    // 1. Element ID uniqueness & format
    if (typeof el.id !== 'string' || el.id.trim().length < 4) {
      pushErr(path, 'invalid-id', `Element id "${el.id}" must be a non-empty string`);
    } else if (seenIds.has(el.id)) {
      pushErr(path, 'duplicate-id', `Duplicate Elementor element id "${el.id}"`);
    } else {
      seenIds.add(el.id);
    }

    // 2. elType & widgetType
    if (el.elType !== 'container' && el.elType !== 'widget' && el.elType !== 'section' && el.elType !== 'column') {
      pushErr(path, 'invalid-eltype', `Unsupported elType "${el.elType}"`);
    }
    if (el.elType === 'widget' && (typeof el.widgetType !== 'string' || el.widgetType.trim() === '')) {
      pushErr(path, 'missing-widget-type', 'Widget element must declare a non-empty widgetType');
    }
    if (!Array.isArray(el.elements)) {
      pushErr(path, 'invalid-elements-array', 'Element must have an elements array');
    }

    const s = el.settings || {};
    checkForInvalidPrimitives(s, `${path}.settings`);

    // 3. Validate 4-side box controls
    for (const key of Object.keys(s)) {
      const val = s[key];
      if (BOX_SETTING_KEYS.has(key) && val && typeof val === 'object') {
        if (!VALID_UNITS.has(String(val.unit ?? ''))) {
          pushErr(`${path}.settings.${key}`, 'invalid-box-unit', `Invalid box unit "${val.unit}"`);
        }
        for (const side of ['top', 'right', 'bottom', 'left']) {
          if (val[side] === undefined || val[side] === null || Number.isNaN(Number(val[side]))) {
            pushErr(`${path}.settings.${key}.${side}`, 'invalid-box-side', `Invalid box side "${side}": ${val[side]}`);
          }
        }
      }

      // 4. Validate color controls
      if (COLOR_SETTING_KEYS.has(key) && typeof val === 'string' && val.trim() !== '') {
        if (!isValidCssColor(val)) {
          pushErr(`${path}.settings.${key}`, 'invalid-color', `Invalid CSS color "${val}" on "${key}"`);
        }
      }

      // 5. Validate dimension objects ({ unit, size })
      if (
        val &&
        typeof val === 'object' &&
        !Array.isArray(val) &&
        'unit' in val &&
        'size' in val &&
        !BOX_SETTING_KEYS.has(key)
      ) {
        if (!VALID_UNITS.has(String(val.unit ?? ''))) {
          pushErr(`${path}.settings.${key}`, 'invalid-dim-unit', `Invalid dimension unit "${val.unit}"`);
        }
        if (val.size !== '' && (typeof val.size !== 'number' || !Number.isFinite(val.size))) {
          pushErr(`${path}.settings.${key}`, 'invalid-dim-size', `Invalid dimension size "${val.size}"`);
        }
      }
    }

    // 6. Reject unverified default __globals__ overrides
    if (s.__globals__ && typeof s.__globals__ === 'object') {
      for (const [gk, gv] of Object.entries(s.__globals__)) {
        if (UNVERIFIED_GLOBAL_IDS.has(String(gv || ''))) {
          pushErr(`${path}.settings.__globals__.${gk}`, 'unverified-global', `Unverified Elementor global "${gv}" leaked into output`);
        }
      }
    }

    // 7. Validate custom_css balanced braces
    if (typeof s.custom_css === 'string' && s.custom_css.trim() !== '') {
      if (!hasBalancedBraces(s.custom_css)) {
        pushErr(`${path}.settings.custom_css`, 'unbalanced-css', 'custom_css has unbalanced curly braces');
      }
    }

    // 8. Widget-specific real Elementor engine contracts
    if (el.elType === 'widget') {
      if (el.widgetType === 'nested-accordion') {
        const items = Array.isArray(s.items) ? s.items : [];
        const panels = Array.isArray(el.elements) ? el.elements : [];
        if (items.length === 0) {
          pushErr(path, 'empty-nested-accordion', 'nested-accordion must contain at least 1 item');
        }
        if (items.length !== panels.length) {
          pushErr(path, 'accordion-panel-mismatch', `nested-accordion items (${items.length}) !== child panels (${panels.length})`);
        }
        const itemIds = new Set();
        for (let i = 0; i < items.length; i += 1) {
          const it = items[i];
          if (!it || !it._id || itemIds.has(it._id)) {
            pushErr(`${path}.settings.items[${i}]`, 'invalid-repeater-id', 'Duplicate or missing repeater _id');
          } else {
            itemIds.add(it._id);
          }
        }
        for (let i = 0; i < panels.length; i += 1) {
          if (panels[i]?.elType !== 'container' || panels[i]?.isInner !== true || panels[i]?.isLocked !== true) {
            pushErr(`${path}.elements[${i}]`, 'invalid-accordion-panel', 'nested-accordion panel must be a locked inner container');
          }
        }
      }

      if (el.widgetType === 'form') {
        const fields = Array.isArray(s.form_fields) ? s.form_fields : [];
        if (fields.length === 0) {
          pushErr(path, 'empty-form', 'Elementor Pro form must have at least 1 field');
        }
        const fieldIds = new Set();
        for (let i = 0; i < fields.length; i += 1) {
          const f = fields[i];
          if (!f || !f._id || fieldIds.has(f._id)) {
            pushErr(`${path}.settings.form_fields[${i}]`, 'invalid-field-id', 'Duplicate or missing form field _id');
          } else {
            fieldIds.add(f._id);
          }
          if (!VALID_FORM_FIELD_TYPES.has(String(f?.field_type || ''))) {
            pushErr(`${path}.settings.form_fields[${i}]`, 'invalid-field-type', `Invalid Elementor form field_type "${f?.field_type}"`);
          }
          if (!VALID_FORM_WIDTHS.has(String(f?.width ?? '100'))) {
            pushErr(`${path}.settings.form_fields[${i}]`, 'invalid-field-width', `Invalid Elementor form field width "${f?.width}"`);
          }
        }
      }

      if (el.widgetType === 'icon-list') {
        const list = Array.isArray(s.icon_list) ? s.icon_list : [];
        if (list.length === 0) {
          pushErr(path, 'empty-icon-list', 'icon-list must contain at least 1 item');
        }
        for (let i = 0; i < list.length; i += 1) {
          const it = list[i];
          if (!it || !it._id || !it.selected_icon || !it.selected_icon.value) {
            pushErr(`${path}.settings.icon_list[${i}]`, 'invalid-icon-list-item', 'icon-list item missing _id or selected_icon');
          }
        }
      }

      if (el.widgetType === 'icon-box') {
        const sel = s.selected_icon;
        if (sel && sel.library === 'svg') {
          if (typeof sel.value === 'string') {
            if (sel.value.includes('<svg')) {
              pushErr(path, 'raw-svg-in-icon-box', 'Elementor Icons_Manager rejects raw <svg> markup inside icon-box selected_icon.value');
            } else {
              pushErr(path, 'string-svg-in-icon-box', 'Elementor Icons_Manager requires { id, url } object for library: "svg", not a string URL/data URI');
            }
          } else if (sel.value && typeof sel.value === 'object') {
            const url = String(sel.value.url || '');
            if (!url || /^data:image\/(png|jpeg|jpg|webp|gif)|(\.(png|jpe?g|webp|gif)(\?|$))/i.test(url)) {
              pushErr(path, 'raster-in-icon-box-svg', 'icon-box selected_icon with library: "svg" cannot point to a raster image');
            }
          }
        }
      }

      if (el.widgetType === 'counter') {
        if (typeof s.ending_number !== 'number' || !Number.isFinite(s.ending_number)) {
          pushErr(path, 'invalid-counter-number', `counter ending_number must be finite number, got "${s.ending_number}"`);
        }
      }
    }

    // Recurse children
    if (Array.isArray(el.elements)) {
      for (let i = 0; i < el.elements.length; i += 1) {
        validateElement(el.elements[i], `${path}.elements[${i}]`);
      }
    }
  };

  if (!Array.isArray(elements)) {
    pushErr('root', 'invalid-root', 'Compiled Elementor tree must be an array');
  } else {
    for (let i = 0; i < elements.length; i += 1) {
      validateElement(elements[i], `elements[${i}]`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    checkedCount,
  };
}

/**
 * Validates an Elementor v4 Atomic tree.
 * @param {Array<object>} elements
 * @returns {{ valid: boolean, errors: Array<{ path: string, code: string, message: string }>, checkedCount: number }}
 */
export function validateElementorV4Tree(elements) {
  const errors = [];
  let checkedCount = 0;

  const walk = (el, path) => {
    if (!el || typeof el !== 'object') {
      errors.push({ path, code: 'invalid-v4-node', message: 'Elementor v4 node must be an object' });
      return;
    }
    checkedCount += 1;
    if (!el.id || typeof el.id !== 'string') {
      errors.push({ path, code: 'missing-v4-id', message: 'Missing v4 element id' });
    }
    if (!el.settings || !el.settings.classes || el.settings.classes.$$type !== 'classes') {
      errors.push({ path, code: 'missing-v4-classes', message: 'Elementor v4 node must declare $$type: "classes" prop' });
    }
    if (!el.styles || typeof el.styles !== 'object') {
      errors.push({ path, code: 'missing-v4-styles', message: 'Elementor v4 node must declare styles map' });
    } else {
      for (const [clsKey, clsObj] of Object.entries(el.styles)) {
        const variants = Array.isArray(clsObj && clsObj.variants) ? clsObj.variants : [];
        for (let vi = 0; vi < variants.length; vi += 1) {
          const props = (variants[vi] && variants[vi].props) || {};
          for (const badKey of ['backgroundColor', 'fontSize', 'fontFamily']) {
            if (badKey in props) {
              errors.push({
                path: `${path}.styles.${clsKey}.variants[${vi}].props.${badKey}`,
                code: 'deprecated-v4-style-key',
                message: `Legacy camelCase v4 style prop "${badKey}" is invalid in Elementor 4.4.1 Style_Schema`,
              });
            }
          }
        }
      }
    }
    if (el.widgetType === 'e-image') {
      const imgProp = el.settings && el.settings.image;
      const src = imgProp && imgProp.value && imgProp.value.src;
      if (!imgProp || imgProp.$$type !== 'image' || !src || src.$$type !== 'image-src' || !src.value) {
        errors.push({ path: `${path}.settings.image`, code: 'invalid-v4-image', message: 'e-image must declare image.$$type="image" with value.src.$$type="image-src"' });
      } else {
        const hasId = Boolean(src.value.id && src.value.id.$$type === 'image-attachment-id' && Number(src.value.id.value) > 0);
        const hasUrl = Boolean(src.value.url && src.value.url.$$type === 'url');
        if (hasId === hasUrl) {
          errors.push({ path: `${path}.settings.image.value.src`, code: 'invalid-v4-image-src-xor', message: 'e-image image-src must set either id XOR url' });
        }
      }
    }
    if (el.widgetType === 'e-svg') {
      const svgProp = el.settings && el.settings.svg;
      if (!svgProp || svgProp.$$type !== 'svg-src' || !svgProp.value) {
        errors.push({ path: `${path}.settings.svg`, code: 'invalid-v4-svg', message: 'e-svg must declare svg.$$type="svg-src"' });
      }
    }
    if (Array.isArray(el.elements)) {
      for (let i = 0; i < el.elements.length; i += 1) {
        walk(el.elements[i], `${path}.elements[${i}]`);
      }
    }
  };

  if (!Array.isArray(elements)) {
    errors.push({ path: 'root', code: 'invalid-v4-root', message: 'v4 content must be an array' });
  } else {
    for (let i = 0; i < elements.length; i += 1) {
      walk(elements[i], `content[${i}]`);
    }
  }

  return { valid: errors.length === 0, errors, checkedCount };
}
