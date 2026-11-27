/**
 * Elementor Pro Widget Builders (`form`, `nav-menu`, `call-to-action`, `price-table`, `flip-box`, `slides`, `loop-grid`).
 */
import { shortId } from '../utils/crypto.js';
import { boxValue, appendCustomCss, applyTypographySettings, applyTextShadowAndEffects, getTextGradientCss, buildTextClipRule, collectSubtreeTexts, collectSubtreeImages, svgMarkupToDataUri } from './compiler-helpers.js';

export function buildProForm(node, nodes, allocId) {
  const formFields = [];
  const content = node.content || {};
  let submitLabel = content.submitLabel || 'Send Message';

  if (Array.isArray(content.formFields) && content.formFields.length > 0) {
    for (const [idx, f] of content.formFields.entries()) {
      const fieldEntry = {
        _id: shortId(`${node.id}-fld-${idx}`),
        custom_id: `field_${idx + 1}`,
        field_type: f.type || 'text',
        field_label: f.label,
        placeholder: f.placeholder || f.label,
        required: f.required ? 'true' : '',
        width: f.width || '100',
      };
      if (f.type === 'select') {
        fieldEntry.field_options = f.options || `${f.placeholder || f.label}\nOption 1\nOption 2\nOption 3`;
      }
      formFields.push(fieldEntry);
    }
  } else {
    let idx = 1;
    for (const cid of node.children || []) {
      const child = nodes[cid];
      if (!child) continue;
      if (child.widget === 'button') {
        submitLabel = (child.content && (child.content.characters || child.content.name)) || submitLabel;
        continue;
      }
      const texts = collectSubtreeTexts(child, nodes).map((t) => t.text.characters);
      const label = texts[0] || (child.content && child.content.name) || `Field ${idx}`;
      const lower = label.toLowerCase();
      let fieldType = 'text';
      if (lower.includes('email') || lower.includes('mail')) fieldType = 'email';
      else if (lower.includes('phone') || lower.includes('tel') || lower.includes('số điện thoại')) fieldType = 'tel';
      else if (lower.includes('message') || lower.includes('comment') || lower.includes('nội dung') || (Number(child.layout && child.layout.height) || 0) >= 90) fieldType = 'textarea';

      formFields.push({
        _id: shortId(cid),
        custom_id: `field_${idx}`,
        field_type: fieldType,
        field_label: label,
        placeholder: texts[1] || label,
        required: lower.includes('email') || lower.includes('name') ? 'true' : '',
        width: '100',
      });
      idx += 1;
    }
  }

  if (formFields.length === 0) {
    formFields.push(
      { _id: shortId('f1'), custom_id: 'name', field_type: 'text', field_label: 'Name', placeholder: 'Your Name', width: '100' },
      { _id: shortId('f2'), custom_id: 'email', field_type: 'email', field_label: 'Email', placeholder: 'your@email.com', required: 'true', width: '100' }
    );
  }

  const hasRequired = formFields.some((f) => f.required === 'true');
  const settings = {
    form_name: content.name || 'Figma Form',
    form_fields: formFields,
    button_text: submitLabel,
    button_size: 'md',
    show_labels: content.hasExternalLabels ? 'yes' : '',
    ...(hasRequired ? { mark_required: 'yes' } : {}),
  };

  if (node.layout && typeof node.layout.gap === 'number') {
    settings.row_gap = { unit: 'px', size: Math.max(0, Math.round(node.layout.gap)), sizes: [] };
    settings.column_gap = { unit: 'px', size: Math.max(0, Math.round(node.layout.gap)), sizes: [] };
  }
  const isAsteriskRed = (hex) => {
    const c = String(hex || '').toUpperCase();
    return c === '#FF0000' || c === '#EF4444' || c === '#DC2626';
  };
  if (content.labelTypography) {
    if (content.labelTypography.color && !isAsteriskRed(content.labelTypography.color)) {
      settings.label_color = content.labelTypography.color;
    }
    applyTypographySettings(settings, 'label_typography', content.labelTypography, node.responsive);
  }
  const fieldTypo = content.fieldTypography || node.text || null;
  if (fieldTypo) {
    if (fieldTypo.color && !isAsteriskRed(fieldTypo.color)) {
      settings.field_text_color = fieldTypo.color;
    }
    applyTypographySettings(settings, 'field_typography', fieldTypo, node.responsive);
  }
  if (content.fieldStyle) {
    const rawBg = content.fieldStyle.background;
    const textHex = fieldTypo && fieldTypo.color ? String(fieldTypo.color).toUpperCase() : '';
    const sameAsText = Boolean(rawBg && textHex && String(rawBg).toUpperCase() === textHex);
    if (rawBg && !sameAsText) {
      settings.field_background_color = rawBg;
    } else if (content.fieldStyle.borderColor || content.fieldStyle.borderWidth) {
      settings.field_background_color = 'rgba(0,0,0,0)';
    } else {
      settings.field_background_color = '#FFFFFF';
    }
    if (content.fieldStyle.borderColor) settings.field_border_color = content.fieldStyle.borderColor;
    if (content.fieldStyle.borderWidth) settings.field_border_width = boxValue(content.fieldStyle.borderWidth);
    if (content.fieldStyle.radius) settings.field_border_radius = boxValue(content.fieldStyle.radius);
    if (content.fieldStyle.boxShadow) {
      const s = content.fieldStyle.boxShadow;
      appendCustomCss(settings, `selector .elementor-field { box-shadow: ${s.position === 'inset' ? 'inset ' : ''}${s.horizontal || 0}px ${s.vertical || 0}px ${s.blur || 0}px ${s.spread || 0}px ${s.color || 'rgba(0,0,0,0.1)'}; }`);
    }
  }
  if (content.fieldPadding && (content.fieldPadding.top || content.fieldPadding.right || content.fieldPadding.bottom || content.fieldPadding.left)) {
    const fp = content.fieldPadding;
    appendCustomCss(settings, `selector .elementor-field { padding: ${Math.round(fp.top || 0)}px ${Math.round(fp.right || 0)}px ${Math.round(fp.bottom || 0)}px ${Math.round(fp.left || 0)}px; }`);
  }
  if (content.buttonTypography) {
    if (content.buttonTypography.color) settings.button_text_color = content.buttonTypography.color;
    applyTypographySettings(settings, 'button_typography', content.buttonTypography, node.responsive);
  }
  if (content.buttonStyle) {
    if (content.buttonStyle.background) {
      settings.button_background_color = content.buttonStyle.background;
    } else if (content.buttonStyle.gradient) {
      const g = content.buttonStyle.gradient;
      settings.button_background_color = g.color1;
      appendCustomCss(settings, `selector .elementor-button {\n  background: linear-gradient(${g.angle ?? 180}deg, ${g.color1} ${g.stop1 ?? 0}%, ${g.color2} ${g.stop2 ?? 100}%);\n}`);
    }
    if (content.buttonStyle.borderWidth && content.buttonStyle.borderColor) {
      settings.button_border_border = content.buttonStyle.borderStyle || 'solid';
      settings.button_border_width = boxValue(content.buttonStyle.borderWidth);
      settings.button_border_color = content.buttonStyle.borderColor;
    }
    if (content.buttonStyle.radius) settings.button_border_radius = boxValue(content.buttonStyle.radius);
    if (content.buttonStyle.boxShadow) {
      const bs = content.buttonStyle.boxShadow;
      appendCustomCss(settings, `selector .elementor-button { box-shadow: ${bs.position === 'inset' ? 'inset ' : ''}${bs.horizontal || 0}px ${bs.vertical || 0}px ${bs.blur || 0}px ${bs.spread || 0}px ${bs.color || 'rgba(0,0,0,0.2)'}; }`);
    }
  }
  if (content.buttonPadding) {
    settings.button_text_padding = boxValue(content.buttonPadding);
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'form',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProNavMenu(node, nodes, allocId) {
  const menuItems = (node.content && node.content.menuItems) || [];
  const textItems = collectSubtreeTexts(node, nodes);
  let items = menuItems.map((m) => (typeof m === 'string' ? m : m.name));
  if (items.length === 0) {
    items = textItems.map((t) => t.text.characters);
  }
  if (items.length === 0) {
    items = ['Trang chủ', 'Dịch vụ', 'Giới thiệu', 'Liên hệ'];
  }

  const justifyAlignMap = { CENTER: 'center', MAX: 'flex-end', SPACE_BETWEEN: 'space-between', MIN: 'flex-start' };
  const settings = {
    layout: (node.layout && node.layout.direction === 'column') ? 'vertical' : 'horizontal',
    align_items: (node.layout && node.layout.justify && justifyAlignMap[node.layout.justify]) || 'center',
    pointer: 'underline',
    _f2e_menu_items: items,
  };

  if (node.layout && typeof node.layout.gap === 'number' && node.layout.gap > 0) {
    const padKey = settings.layout === 'vertical' ? 'padding_vertical_menu_item' : 'padding_horizontal_menu_item';
    settings[padKey] = { unit: 'px', size: Math.round(node.layout.gap / 2), sizes: [] };
  }

  const navTypo = node.text || (textItems[0] && textItems[0].text) || null;
  if (navTypo) {
    applyTypographySettings(settings, 'typography', navTypo, node.responsive);
    if (navTypo.color) {
      settings.color_menu_item = navTypo.color;
    }
  }
  const distinctActive = textItems.find((t) => t.text && t.text.color && navTypo && t.text.color !== navTypo.color);
  if (distinctActive && distinctActive.text) {
    settings.color_menu_item_active = distinctActive.text.color;
    settings.color_menu_item_hover = distinctActive.text.color;
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'nav-menu',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProCta(node, nodes, allocId, resolveMedia) {
  const textItems = collectSubtreeTexts(node, nodes);
  const texts = textItems.map((t) => t.text.characters);
  const imgs = collectSubtreeImages(node, nodes);
  const settings = {
    skin: 'classic',
    title: texts[0] || (node.content && node.content.name) || 'Call to Action',
    description: texts[1] || '',
    button: (node.content && node.content.ctaButtonText) || texts[2] || 'Learn More',
    bg_image: imgs[0] ? resolveMedia(imgs[0].sha256, imgs[0].dataUri) : { id: '', url: '' },
  };

  if (textItems[0] && textItems[0].text) {
    if (textItems[0].text.align) settings.alignment = textItems[0].text.align;
    if (textItems[0].text.color) settings.title_color = textItems[0].text.color;
    applyTypographySettings(settings, 'title_typography', textItems[0].text, node.responsive);
    applyTextShadowAndEffects(settings, textItems[0].text, 'selector .elementor-cta__title');
    const ctaTitleGrad = getTextGradientCss(textItems[0].text);
    if (ctaTitleGrad) appendCustomCss(settings, buildTextClipRule('selector .elementor-cta__title', ctaTitleGrad));
  }
  if (textItems[1] && textItems[1].text) {
    if (textItems[1].text.color) settings.description_color = textItems[1].text.color;
    applyTypographySettings(settings, 'description_typography', textItems[1].text, node.responsive);
    applyTextShadowAndEffects(settings, textItems[1].text, 'selector .elementor-cta__description');
  }
  if (textItems[2] && textItems[2].text) {
    if (textItems[2].text.color) settings.button_text_color = textItems[2].text.color;
    applyTypographySettings(settings, 'button_typography', textItems[2].text, node.responsive);
  }
  if (node.style && node.style.background) {
    settings.content_bg_color = node.style.background;
  }
  if (node.layout && node.layout.padding && (node.layout.padding.top || node.layout.padding.right || node.layout.padding.bottom || node.layout.padding.left)) {
    settings.padding_content = boxValue(node.layout.padding);
  }
  const ctaBtnNode = (node.children || []).map((cid) => nodes[cid]).find((c) => c && (c.widget === 'button' || /btn|button/i.test((c.content && c.content.name) || '')));
  if (ctaBtnNode && ctaBtnNode.style) {
    if (ctaBtnNode.style.background) settings.button_background_color = ctaBtnNode.style.background;
    if (ctaBtnNode.style.radius) settings.button_border_radius = boxValue(ctaBtnNode.style.radius);
    if (ctaBtnNode.style.borderColor) settings.button_border_color = ctaBtnNode.style.borderColor;
    if (ctaBtnNode.style.borderWidth) {
      const bw = Math.max(Number(ctaBtnNode.style.borderWidth.top) || 0, Number(ctaBtnNode.style.borderWidth.right) || 0, Number(ctaBtnNode.style.borderWidth.bottom) || 0, Number(ctaBtnNode.style.borderWidth.left) || 0);
      if (bw > 0) settings.button_border_width = { unit: 'px', size: bw, sizes: [] };
    }
    if (ctaBtnNode.layout && ctaBtnNode.layout.padding && (ctaBtnNode.layout.padding.top || ctaBtnNode.layout.padding.right || ctaBtnNode.layout.padding.bottom || ctaBtnNode.layout.padding.left)) {
      const bp = ctaBtnNode.layout.padding;
      appendCustomCss(settings, `selector .elementor-cta__button { padding: ${Math.round(bp.top || 0)}px ${Math.round(bp.right || 0)}px ${Math.round(bp.bottom || 0)}px ${Math.round(bp.left || 0)}px; }`);
    }
  }
  if (node.layout && node.layout.height && Number(node.layout.height) >= 160) {
    settings.min_height = { unit: 'px', size: Math.round(Number(node.layout.height)), sizes: [] };
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'call-to-action',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProPriceTable(node, nodes, allocId) {
  const textItems = collectSubtreeTexts(node, nodes);
  const texts = textItems.map((t) => t.text.characters);
  const priceNode = textItems.find((t) => /[$€£₫¥]|\d+\s*\/\s*(mo|yr|tháng|năm)/i.test(t.text.characters) || /^\$?\d+$/.test(t.text.characters.trim()));
  const priceText = (priceNode && priceNode.text.characters) || '49';
  const numericPrice = priceText.replace(/[^0-9.]/g, '') || '49';
  const headingNode = textItems[0] || null;
  const heading = (headingNode && headingNode.text.characters) || (node.content && node.content.name) || 'Pro Plan';
  const subHeadingNode = (textItems[1] && textItems[1] !== priceNode) ? textItems[1] : null;
  const btnNode = textItems.length > 2 ? textItems[textItems.length - 1] : null;
  const excludeSet = new Set([headingNode, subHeadingNode, priceNode, btnNode].filter(Boolean));
  const featureTexts = textItems
    .filter((t) => !excludeSet.has(t))
    .map((t) => t.text.characters)
    .filter(Boolean);
  const features = featureTexts.map((ft, idx) => ({
    _id: shortId(`feat-${idx}`),
    item_text: ft,
    selected_icon: { value: 'fas fa-check', library: 'fa-solid' },
  }));

  let currencySymbol = 'dollar';
  if (priceText.includes('€')) currencySymbol = 'euro';
  else if (priceText.includes('£')) currencySymbol = 'pound';
  else if (priceText.includes('¥')) currencySymbol = 'yen';
  else if (priceText.includes('₫') || /vnd|đ/i.test(priceText)) currencySymbol = 'custom';

  const settings = {
    heading,
    sub_heading: (subHeadingNode && subHeadingNode.text.characters) || 'Monthly Plan',
    price: numericPrice,
    currency_symbol: currencySymbol,
    ...(currencySymbol === 'custom' ? { currency_symbol_custom: '₫' } : {}),
    period: 'Monthly',
    features_list: features,
    button_text: (btnNode && btnNode.text.characters) || 'Get Started',
  };

  if (headingNode && headingNode.text) {
    if (headingNode.text.color) settings.heading_color = headingNode.text.color;
    applyTypographySettings(settings, 'heading_typography', headingNode.text, node.responsive);
    applyTextShadowAndEffects(settings, headingNode.text, 'selector .elementor-price-table__heading');
  }
  if (subHeadingNode && subHeadingNode.text) {
    if (subHeadingNode.text.color) settings.sub_heading_color = subHeadingNode.text.color;
    applyTypographySettings(settings, 'sub_heading_typography', subHeadingNode.text, node.responsive);
  }
  if (priceNode && priceNode.text) {
    if (priceNode.text.color) settings.price_color = priceNode.text.color;
    applyTypographySettings(settings, 'price_typography', priceNode.text, node.responsive);
    const priceGrad = getTextGradientCss(priceNode.text);
    if (priceGrad) appendCustomCss(settings, buildTextClipRule('selector .elementor-price-table__price', priceGrad));
  }
  if (textItems[2] && textItems[2].text) {
    if (textItems[2].text.color) settings.features_color = textItems[2].text.color;
    applyTypographySettings(settings, 'features_typography', textItems[2].text, node.responsive);
  }
  if (btnNode && btnNode.text) {
    if (btnNode.text.color) settings.button_text_color = btnNode.text.color;
    applyTypographySettings(settings, 'button_typography', btnNode.text, node.responsive);
  }
  const priceBtnChild = (node.children || []).map((cid) => nodes[cid]).find((c) => c && (c.widget === 'button' || /btn|button/i.test((c.content && c.content.name) || '')));
  if (priceBtnChild && priceBtnChild.style) {
    if (priceBtnChild.style.background) settings.button_background_color = priceBtnChild.style.background;
    if (priceBtnChild.style.radius) settings.button_border_radius = boxValue(priceBtnChild.style.radius);
    if (priceBtnChild.style.borderColor) settings.button_border_color = priceBtnChild.style.borderColor;
    if (priceBtnChild.style.borderWidth) settings.button_border_width = boxValue(priceBtnChild.style.borderWidth);
    if (priceBtnChild.layout && priceBtnChild.layout.padding && (priceBtnChild.layout.padding.top || priceBtnChild.layout.padding.right || priceBtnChild.layout.padding.bottom || priceBtnChild.layout.padding.left)) {
      const pbp = priceBtnChild.layout.padding;
      appendCustomCss(settings, `selector .elementor-price-table__button { padding: ${Math.round(pbp.top || 0)}px ${Math.round(pbp.right || 0)}px ${Math.round(pbp.bottom || 0)}px ${Math.round(pbp.left || 0)}px; }`);
    }
  }
  if (node.style && node.style.background) {
    settings.pricing_element_bg_color = node.style.background;
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'price-table',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProFlipBox(node, nodes, allocId, resolveMedia) {
  const fb = (node.content && node.content.flipBox) ? node.content.flipBox : null;
  const textItems = collectSubtreeTexts(node, nodes);
  const texts = textItems.map((t) => t.text.characters);
  const imgs = collectSubtreeImages(node, nodes);

  const front = (fb && fb.front) ? fb.front : null;
  const back = (fb && fb.back) ? fb.back : null;
  const fTexts = (front && Array.isArray(front.texts)) ? front.texts : [];
  const bTexts = (back && Array.isArray(back.texts)) ? back.texts : [];

  const frontImgRef = (front && front.image) || imgs[0] || null;
  const backImgRef = (back && back.image) || (!fb ? imgs[1] : null) || null;
  const hasFrontImg = Boolean(frontImgRef);

  const titleTypoA = fb ? (fTexts[0] || null) : ((textItems[0] && textItems[0].text) || null);
  const descTypoA = fb ? (fTexts[1] || null) : ((textItems[1] && textItems[1].text) || null);
  const titleTypoB = fb ? (bTexts[0] || null) : ((textItems[2] && textItems[2].text) || (textItems[0] && textItems[0].text) || null);
  const descTypoB = fb ? (bTexts[1] || null) : ((textItems[3] && textItems[3].text) || (textItems[1] && textItems[1].text) || null);

  const settings = {
    title_text_a: fb ? ((titleTypoA && titleTypoA.characters) || '') : (texts[0] || (hasFrontImg ? '' : ((node.content && node.content.name) || 'Front Title'))),
    description_text_a: fb ? ((descTypoA && descTypoA.characters) || '') : (texts[1] || ''),
    title_text_b: fb ? ((titleTypoB && titleTypoB.characters) || '') : (texts[2] || texts[0] || (hasFrontImg ? '' : 'Back Title')),
    description_text_b: fb ? ((descTypoB && descTypoB.characters) || '') : (texts[3] || texts[1] || ''),
    button_text: fb ? ((bTexts[2] && bTexts[2].characters) || '') : (texts[4] || ''),
  };

  if (titleTypoA) {
    if (titleTypoA.align) settings.alignment = titleTypoA.align;
    if (titleTypoA.color) settings.title_color_a = titleTypoA.color;
    applyTypographySettings(settings, 'title_typography_a', titleTypoA, node.responsive);
    applyTextShadowAndEffects(settings, titleTypoA, 'selector .elementor-flip-box__front .elementor-flip-box__layer__title');
  } else if (titleTypoB && titleTypoB.align) {
    settings.alignment = titleTypoB.align;
  }

  const padA = (front && front.padding) || (node.layout && node.layout.padding);
  if (padA && (padA.top || padA.right || padA.bottom || padA.left)) {
    settings.padding_a = boxValue(padA);
  }
  const padB = (back && back.padding) || (node.layout && node.layout.padding);
  if (padB && (padB.top || padB.right || padB.bottom || padB.left)) {
    settings.padding_b = boxValue(padB);
  }

  if (descTypoA) {
    if (descTypoA.color) settings.description_color_a = descTypoA.color;
    applyTypographySettings(settings, 'description_typography_a', descTypoA, node.responsive);
  }
  if (titleTypoB) {
    if (titleTypoB.color) settings.title_color_b = titleTypoB.color;
    applyTypographySettings(settings, 'title_typography_b', titleTypoB, node.responsive);
    applyTextShadowAndEffects(settings, titleTypoB, 'selector .elementor-flip-box__back .elementor-flip-box__layer__title');
  }
  if (descTypoB) {
    if (descTypoB.color) settings.description_color_b = descTypoB.color;
    applyTypographySettings(settings, 'description_typography_b', descTypoB, node.responsive);
  }

  const bgA = (front && front.background) || (node.style && node.style.background);
  const gradA = (front && front.gradient) || (node.style && node.style.gradient);
  if (gradA) {
    settings.background_a_background = 'gradient';
    settings.background_a_gradient_type = gradA.type || 'linear';
    settings.background_a_color = gradA.color1;
    settings.background_a_color_b = gradA.color2;
    settings.background_a_gradient_angle = { unit: 'deg', size: gradA.angle ?? 180, sizes: [] };
  } else if (bgA) {
    settings.background_a_background = 'classic';
    settings.background_a_color = bgA;
  }

  const bgB = (back && back.background) || (node.style && node.style.background);
  const gradB = (back && back.gradient) || (node.style && node.style.gradient);
  if (gradB) {
    settings.background_b_background = 'gradient';
    settings.background_b_gradient_type = gradB.type || 'linear';
    settings.background_b_color = gradB.color1;
    settings.background_b_color_b = gradB.color2;
    settings.background_b_gradient_angle = { unit: 'deg', size: gradB.angle ?? 180, sizes: [] };
  } else if (bgB) {
    settings.background_b_background = 'classic';
    settings.background_b_color = bgB;
  }

  if (node.style && node.style.radius) {
    settings.border_radius = boxValue(node.style.radius);
  }
  if (node.layout && node.layout.height) {
    settings.height = { unit: 'px', size: Math.max(200, Math.round(Number(node.layout.height))), sizes: [] };
  }
  if (frontImgRef && resolveMedia) {
    const mediaA = resolveMedia(frontImgRef.sha256, frontImgRef.dataUri);
    if (mediaA && mediaA.url) {
      settings.background_a_background = 'classic';
      settings.background_a_image = mediaA;
      settings.background_a_size = 'cover';
      settings.background_a_position = 'center center';
      settings.background_a_repeat = 'no-repeat';
    }
  }
  if (backImgRef && resolveMedia) {
    const mediaB = resolveMedia(backImgRef.sha256, backImgRef.dataUri);
    if (mediaB && mediaB.url) {
      settings.background_b_background = 'classic';
      settings.background_b_image = mediaB;
      settings.background_b_size = 'cover';
      settings.background_b_position = 'center center';
      settings.background_b_repeat = 'no-repeat';
    }
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'flip-box',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProSlides(node, nodes, allocId, resolveMedia) {
  const slides = [];
  const extractedSlides = (node.content && Array.isArray(node.content.slides)) ? node.content.slides : [];
  if (extractedSlides.length > 0) {
    for (let i = 0; i < extractedSlides.length; i += 1) {
      const sl = extractedSlides[i];
      const texts = (sl.texts || []).map((t) => (typeof t === 'string' ? t : t.characters)).filter(Boolean);
      const media = sl.image && resolveMedia ? resolveMedia(sl.image.sha256, sl.image.dataUri) : { id: '', url: '' };
      slides.push({
        _id: shortId(sl.id || `${node.id}-slide-${i}`),
        heading: texts[0] || sl.name || `Slide ${i + 1}`,
        description: texts[1] || '',
        button_text: texts[2] || 'Click Here',
        background_color: sl.background || '#1E293B',
        background_image: media,
      });
    }
  } else {
    for (const cid of node.children || []) {
      const child = nodes[cid];
      if (!child) continue;
      const texts = collectSubtreeTexts(child, nodes).map((t) => t.text.characters);
      const imgs = collectSubtreeImages(child, nodes);
      const media = imgs[0] ? resolveMedia(imgs[0].sha256, imgs[0].dataUri) : { id: '', url: '' };
      slides.push({
        _id: shortId(cid),
        heading: texts[0] || (child.content && child.content.name) || 'Slide Heading',
        description: texts[1] || '',
        button_text: texts[2] || 'Click Here',
        background_color: (child.style && child.style.background) || '#1E293B',
        background_image: media,
      });
    }
  }
  const sliderNav = node.content && node.content.sliderNav;
  let navigation = 'both';
  if (sliderNav) {
    if (sliderNav.hasDots && sliderNav.hasArrows) navigation = 'both';
    else if (sliderNav.hasDots) navigation = 'dots';
    else if (sliderNav.hasArrows) navigation = 'arrows';
  }
  const slidesSettings = {
    slides,
    slides_height: { unit: 'px', size: Math.max(360, Number(node.layout && node.layout.height) || 500), sizes: [] },
    navigation,
  };
  if (sliderNav && sliderNav.dotsColor) slidesSettings.dots_color = sliderNav.dotsColor;
  if (sliderNav && sliderNav.arrowsColor) slidesSettings.arrows_color = sliderNav.arrowsColor;
  const firstSlideTexts = (extractedSlides[0] && Array.isArray(extractedSlides[0].texts))
    ? extractedSlides[0].texts.filter((t) => t && typeof t === 'object')
    : collectSubtreeTexts(node, nodes).map((t) => t.text).filter(Boolean);
  if (firstSlideTexts[0]) {
    if (firstSlideTexts[0].align) slidesSettings.text_align = firstSlideTexts[0].align;
    if (firstSlideTexts[0].color) slidesSettings.heading_color = firstSlideTexts[0].color;
    applyTypographySettings(slidesSettings, 'heading_typography', firstSlideTexts[0], node.responsive);
    applyTextShadowAndEffects(slidesSettings, firstSlideTexts[0], 'selector .elementor-slide-heading');
  }
  if (firstSlideTexts[1]) {
    if (firstSlideTexts[1].color) slidesSettings.description_color = firstSlideTexts[1].color;
    applyTypographySettings(slidesSettings, 'description_typography', firstSlideTexts[1], node.responsive);
    applyTextShadowAndEffects(slidesSettings, firstSlideTexts[1], 'selector .elementor-slide-description');
  }
  if (firstSlideTexts[2]) {
    if (firstSlideTexts[2].color) slidesSettings.button_color = firstSlideTexts[2].color;
    applyTypographySettings(slidesSettings, 'button_typography', firstSlideTexts[2], node.responsive);
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'slides',
    isInner: false,
    settings: slidesSettings,
    elements: [],
  };
}

function mapLoopCardDynamicWidgets(el, state = { img: false, title: false, excerpt: false }) {
  if (!el || typeof el !== 'object') return el;
  if (el.elType === 'widget') {
    if (!state.img && el.widgetType === 'image') {
      state.img = true;
      el.widgetType = 'theme-post-featured-image';
    } else if (!state.title && el.widgetType === 'heading') {
      state.title = true;
      el.widgetType = 'theme-post-title';
    } else if (!state.excerpt && el.widgetType === 'text-editor') {
      state.excerpt = true;
      el.widgetType = 'theme-post-excerpt';
    }
  }
  if (Array.isArray(el.elements)) {
    for (const child of el.elements) {
      mapLoopCardDynamicWidgets(child, state);
    }
  }
  return el;
}

export function buildProLoopGrid(node, nodes, allocId, wType = 'loop-grid', buildElement = null) {
  const childIds = Array.isArray(node.children) ? node.children : [];
  const cols = Number(node.layout && node.layout.columns) || (childIds.length > 0 && childIds.length <= 4 ? childIds.length : 3);
  const gapVal = Number(node.layout && node.layout.gap) || 24;
  const isCarousel = wType === 'loop-carousel';
  const isWoo = wType === 'woocommerce-products';
  const settings = isCarousel
    ? {
        skin: isWoo ? 'product' : 'post',
        template_id: '',
        posts_per_page: Math.max(6, childIds.length || 6),
        slides_to_show: String(Math.max(1, Math.min(4, cols))),
        image_spacing_custom: { unit: 'px', size: gapVal, sizes: [] },
      }
    : {
        skin: isWoo ? 'product' : 'post',
        template_id: '',
        posts_per_page: Math.max(6, childIds.length || 6),
        columns: String(cols),
        row_gap: { unit: 'px', size: gapVal, sizes: [] },
        column_gap: { unit: 'px', size: gapVal, sizes: [] },
      };

  if ((wType === 'loop-grid' || wType === 'loop-carousel') && typeof buildElement === 'function' && childIds.length > 0) {
    const firstCardId = childIds.find((cid) => {
      const cn = nodes && nodes[cid];
      if (!cn) return false;
      const nm = String((cn.content && cn.content.name) || '').toLowerCase();
      return !/\b(arrow|prev|next|dot|dots|pagination|indicator)\b/.test(nm);
    }) || childIds[0];

    const cardEl = firstCardId ? buildElement(firstCardId, true, null) : null;
    if (cardEl) {
      if (cardEl.elType === 'container' && cardEl.settings) {
        cardEl.isInner = false;
        cardEl.settings.content_width = 'full';
        delete cardEl.settings.boxed_width;
        delete cardEl.settings.boxed_width_tablet;
        delete cardEl.settings.boxed_width_mobile;
      }
      mapLoopCardDynamicWidgets(cardEl);
      settings._f2e_loop_template = {
        title: `${(node.content && node.content.name) || 'Loop'} — Item Template`,
        source: isWoo ? 'product' : 'post',
        sourceNodeId: node.sourceNodeId || node.id,
        elements: [cardEl],
      };
    }
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: wType,
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProSearchForm(node, nodes, allocId) {
  const textItems = collectSubtreeTexts(node, nodes);
  const phNode = textItems.find((t) => !/^(search|tìm|go)$/i.test((t.text.characters || '').trim())) || textItems[0] || null;
  const btnNode = textItems.find((t) => t !== phNode) || null;
  const st = node.style || {};
  const settings = {
    skin: 'classic',
    placeholder: (phNode && phNode.text && phNode.text.characters) || 'Search...',
    button_text: (btnNode && btnNode.text && btnNode.text.characters) || 'Search',
  };
  if (phNode && phNode.text) {
    if (phNode.text.color) settings.input_text_color = phNode.text.color;
    applyTypographySettings(settings, 'input_typography', phNode.text, node.responsive);
  }
  if (st.background) settings.input_background_color = st.background;
  if (st.borderColor) settings.input_border_color = st.borderColor;
  if (st.radius) settings.border_radius = boxValue(st.radius);
  if (node.layout && node.layout.height) {
    settings.size = { unit: 'px', size: Math.max(36, Math.round(Number(node.layout.height))), sizes: [] };
  }
  const btnChild = (node.children || []).map((cid) => nodes[cid]).find((c) => c && (c.widget === 'button' || /btn|button/i.test((c.content && c.content.name) || '')));
  if (btnChild && btnChild.style && btnChild.style.background) {
    settings.button_background_color = btnChild.style.background;
  }
  if (btnNode && btnNode.text && btnNode.text.color) {
    settings.button_text_color = btnNode.text.color;
  }
  return { id: allocId(node.id), elType: 'widget', widgetType: 'search-form', isInner: false, settings, elements: [] };
}

export function buildProLogin(node, nodes, allocId) {
  const textItems = collectSubtreeTexts(node, nodes);
  const content = node.content || {};
  const fields = Array.isArray(content.formFields) ? content.formFields : [];
  const userField = fields[0] || null;
  const passField = fields[1] || null;
  const btnChild = (node.children || []).map((cid) => nodes[cid]).find((c) => c && c.widget === 'button');
  const settings = {
    show_labels: 'yes',
    custom_labels: 'yes',
    user_label: (userField && userField.label) || (textItems[0] && textItems[0].text.characters) || 'Username or Email Address',
    user_placeholder: (userField && userField.placeholder) || 'Username or Email Address',
    password_label: (passField && passField.label) || (textItems[1] && textItems[1].text.characters) || 'Password',
    password_placeholder: (passField && passField.placeholder) || 'Password',
    button_text: content.submitLabel || (btnChild && btnChild.content && btnChild.content.characters) || 'Log In',
    show_lost_password: 'yes',
    show_remember_me: 'yes',
  };
  if (node.layout && typeof node.layout.gap === 'number') {
    settings.row_gap = { unit: 'px', size: Math.max(0, Math.round(node.layout.gap)), sizes: [] };
  }
  if (content.labelTypography) {
    if (content.labelTypography.color) settings.label_color = content.labelTypography.color;
    applyTypographySettings(settings, 'label_typography', content.labelTypography, node.responsive);
  }
  const fieldTypo = content.fieldTypography || node.text || null;
  if (fieldTypo) {
    if (fieldTypo.color) settings.field_text_color = fieldTypo.color;
    applyTypographySettings(settings, 'field_typography', fieldTypo, node.responsive);
  }
  if (content.fieldStyle) {
    if (content.fieldStyle.background) settings.field_background_color = content.fieldStyle.background;
    if (content.fieldStyle.borderColor) settings.field_border_color = content.fieldStyle.borderColor;
    if (content.fieldStyle.borderWidth) settings.field_border_width = boxValue(content.fieldStyle.borderWidth);
    if (content.fieldStyle.radius) settings.field_border_radius = boxValue(content.fieldStyle.radius);
  }
  if (content.buttonTypography) {
    if (content.buttonTypography.color) settings.button_text_color = content.buttonTypography.color;
    applyTypographySettings(settings, 'button_typography', content.buttonTypography, node.responsive);
  }
  if (content.buttonStyle && content.buttonStyle.background) {
    settings.button_background_color = content.buttonStyle.background;
  }
  if (content.buttonStyle && content.buttonStyle.radius) settings.button_border_radius = boxValue(content.buttonStyle.radius);
  if (content.buttonPadding) settings.button_text_padding = boxValue(content.buttonPadding);
  return { id: allocId(node.id), elType: 'widget', widgetType: 'login', isInner: false, settings, elements: [] };
}

export function buildProTestimonialCarousel(node, nodes, allocId, resolveMedia) {
  const extracted = (node.content && Array.isArray(node.content.slides)) ? node.content.slides : [];
  const slides = [];
  if (extracted.length > 0) {
    for (let i = 0; i < extracted.length; i += 1) {
      const sl = extracted[i];
      const texts = (sl.texts || []).map((t) => (typeof t === 'string' ? t : t.characters)).filter(Boolean);
      const sorted = [...texts].sort((a, b) => b.length - a.length);
      const media = sl.image && resolveMedia ? resolveMedia(sl.image.sha256, sl.image.dataUri) : { id: '', url: '' };
      slides.push({
        _id: shortId(sl.id || `${node.id}-tc-${i}`),
        content: sorted[0] || 'Great experience working with this team.',
        name: sorted[1] || sl.name || `Client ${i + 1}`,
        title: sorted[2] || 'Customer',
        image: media,
      });
    }
  } else {
    for (const cid of node.children || []) {
      const child = nodes[cid];
      if (!child) continue;
      const texts = collectSubtreeTexts(child, nodes).map((t) => t.text.characters).filter(Boolean);
      const sorted = [...texts].sort((a, b) => b.length - a.length);
      const imgs = collectSubtreeImages(child, nodes);
      slides.push({
        _id: shortId(cid),
        content: sorted[0] || 'Great experience.',
        name: sorted[1] || (child.content && child.content.name) || 'Client',
        title: sorted[2] || 'Customer',
        image: imgs[0] && resolveMedia ? resolveMedia(imgs[0].sha256, imgs[0].dataUri) : { id: '', url: '' },
      });
    }
  }
  const settings = {
    slides,
    slides_per_view: String(Math.max(1, Math.min(4, Number(node.layout && node.layout.columns) || Math.min(3, slides.length || 1)))),
  };
  const firstTexts = (extracted[0] && Array.isArray(extracted[0].texts)) ? extracted[0].texts : collectSubtreeTexts(node, nodes).map((t) => t.text);
  const longest = [...firstTexts].filter((t) => t && t.characters).sort((a, b) => b.characters.length - a.characters.length);
  if (longest[0]) {
    if (longest[0].color) settings.content_color = longest[0].color;
    applyTypographySettings(settings, 'content_typography', longest[0], node.responsive);
  }
  if (longest[1]) {
    if (longest[1].color) settings.name_color = longest[1].color;
    applyTypographySettings(settings, 'name_typography', longest[1], node.responsive);
  }
  if (longest[2]) {
    if (longest[2].color) settings.title_color = longest[2].color;
    applyTypographySettings(settings, 'title_typography', longest[2], node.responsive);
  }
  if (node.style && node.style.background) settings.slide_background_color = node.style.background;
  if (node.style && node.style.radius) settings.slide_border_radius = boxValue(node.style.radius);
  return { id: allocId(node.id), elType: 'widget', widgetType: 'testimonial-carousel', isInner: false, settings, elements: [] };
}

export function buildProReviews(node, nodes, allocId, resolveMedia) {
  const base = buildProTestimonialCarousel(node, nodes, allocId, resolveMedia);
  base.widgetType = 'reviews';
  base.settings.slides = (base.settings.slides || []).map((s) => ({
    ...s,
    rating: 5,
    selected_social_icon: { value: 'fab fa-google', library: 'fa-brands' },
  }));
  base.settings.stars_color = '#F59E0B';
  return base;
}

export function buildProNestedCarousel(node, nodes, allocId, buildElement) {
  const carouselItems = [];
  const elements = [];
  for (const [idx, cid] of (node.children || []).entries()) {
    const child = nodes[cid];
    if (!child) continue;
    const title = (child.content && child.content.name) || `Slide #${idx + 1}`;
    carouselItems.push({ _id: shortId(cid), slide_title: title });
    const panel = buildElement ? buildElement(cid, false, node) : null;
    if (panel) {
      panel.elType = 'container';
      panel.isInner = true;
      elements.push(panel);
    }
  }
  const settings = { carousel_items: carouselItems };
  if (node.layout && typeof node.layout.gap === 'number' && node.layout.gap > 0) {
    settings.image_spacing_custom = { unit: 'px', size: Math.round(node.layout.gap), sizes: [] };
  }
  if (node.style && node.style.radius) settings.border_radius = boxValue(node.style.radius);
  if (node.layout && node.layout.padding && (node.layout.padding.top || node.layout.padding.right || node.layout.padding.bottom || node.layout.padding.left)) {
    settings.content_padding = boxValue(node.layout.padding);
  }
  return { id: allocId(node.id), elType: 'widget', widgetType: 'nested-carousel', isInner: false, settings, elements };
}

export function buildProMediaCarousel(node, nodes, allocId, resolveMedia) {
  const imgs = collectSubtreeImages(node, nodes)
    .map((img) => resolveMedia(img.sha256, img.dataUri))
    .filter((m) => m && (m.url || m.id));
  const slides = imgs.map((media, idx) => ({
    _id: shortId(`${node.id}-mc-${idx}`),
    type: 'image',
    image: media,
  }));
  const settings = {
    slides,
    skin: 'carousel',
    slides_per_view: String(Math.max(1, Math.min(5, Number(node.layout && node.layout.columns) || Math.min(3, slides.length || 3)))),
  };
  if (node.layout && typeof node.layout.gap === 'number' && node.layout.gap > 0) {
    settings.space_between = { unit: 'px', size: Math.round(node.layout.gap), sizes: [] };
  }
  return { id: allocId(node.id), elType: 'widget', widgetType: 'media-carousel', isInner: false, settings, elements: [] };
}

export function buildProGallery(node, nodes, allocId, resolveMedia) {
  const imgs = collectSubtreeImages(node, nodes)
    .map((img) => resolveMedia(img.sha256, img.dataUri))
    .filter((m) => m && (m.url || m.id));
  const settings = {
    gallery: imgs,
    gallery_layout: 'grid',
    columns: Math.max(1, Math.min(6, Number(node.layout && node.layout.columns) || Math.min(3, imgs.length || 3))),
  };
  if (node.layout && typeof node.layout.gap === 'number') {
    settings.gap = { unit: 'px', size: Math.round(node.layout.gap), sizes: [] };
  }
  if (node.style && node.style.radius) {
    settings.image_border_radius = boxValue(node.style.radius);
  }
  return { id: allocId(node.id), elType: 'widget', widgetType: 'gallery', isInner: false, settings, elements: [] };
}

export function buildProMegaMenu(node, nodes, allocId) {
  const rawItems = (node.content && Array.isArray(node.content.menuItems) && node.content.menuItems.length > 0)
    ? node.content.menuItems
    : collectSubtreeTexts(node, nodes).map((t) => ({ name: t.text.characters, link: '#' }));
  const menuItems = (rawItems.length > 0 ? rawItems : [{ name: 'Home', link: '#' }]).map((it, idx) => ({
    _id: shortId(`${node.id}-mm-${idx}`),
    item_title: typeof it === 'string' ? it : (it.name || `Item ${idx + 1}`),
    item_link: { url: (typeof it === 'object' && it.link) ? it.link : '#' },
    item_dropdown_content: 'no',
  }));
  const settings = { menu_items: menuItems };
  const textItems = collectSubtreeTexts(node, nodes);
  const navTypo = node.text || (textItems[0] && textItems[0].text) || null;
  if (navTypo) {
    if (navTypo.color) settings.menu_item_color_normal = navTypo.color;
    applyTypographySettings(settings, 'menu_item_typography', navTypo, node.responsive);
  }
  return { id: allocId(node.id), elType: 'widget', widgetType: 'mega-menu', isInner: false, settings, elements: [] };
}

export function buildProHotspot(node, nodes, allocId, resolveMedia) {
  const sha = (node.image && node.image.sha256) || (node.raster && node.raster.sha256) || '';
  const fallback = (node.image && node.image.dataUri) || (node.raster && node.raster.dataUri) || '';
  let media = resolveMedia ? resolveMedia(sha, fallback) : { id: '', url: fallback };
  if (!media || !media.url) {
    const imgs = collectSubtreeImages(node, nodes);
    if (imgs[0] && resolveMedia) media = resolveMedia(imgs[0].sha256, imgs[0].dataUri);
  }
  const rawHotspots = (node.content && Array.isArray(node.content.hotspots)) ? node.content.hotspots : [];
  const hotspots = (rawHotspots.length > 0 ? rawHotspots : [{ label: 'Hotspot 1', xPct: 50, yPct: 50, tooltip: '' }]).map((hp, idx) => ({
    _id: shortId(hp.id || `${node.id}-hp-${idx}`),
    hotspot_label: hp.label || `Hotspot ${idx + 1}`,
    hotspot_offset_x: { unit: '%', size: typeof hp.xPct === 'number' ? hp.xPct : 50, sizes: [] },
    hotspot_offset_y: { unit: '%', size: typeof hp.yPct === 'number' ? hp.yPct : 50, sizes: [] },
    hotspot_tooltip_content: hp.tooltip ? `<p>${hp.tooltip}</p>` : '',
  }));
  const settings = {
    image: media || { id: '', url: '' },
    hotspot: hotspots,
  };
  const pinWithColor = rawHotspots.find((h) => h.color);
  if (pinWithColor && pinWithColor.color) {
    settings.style_hotspot_color = pinWithColor.color;
  }
  return { id: allocId(node.id), elType: 'widget', widgetType: 'hotspot', isInner: false, settings, elements: [] };
}

export function buildGenericProWidget(node, nodes, wType, allocId, resolveMedia) {
  const textItems = collectSubtreeTexts(node, nodes);
  const texts = textItems.map((t) => t.text.characters);
  const firstTypo = node.text || (textItems[0] && textItems[0].text) || null;
  const settings = {};
  if (wType === 'theme-post-featured-image') {
    const sha = (node.image && node.image.sha256) || (node.raster && node.raster.sha256) || (node.svg && node.svg.sha256) || '';
    const fallback = (node.image && node.image.dataUri) || (node.raster && node.raster.dataUri) || (node.svg && node.svg.markup ? svgMarkupToDataUri(node.svg.markup) : '');
    const media = resolveMedia ? resolveMedia(sha, fallback) : { id: '', url: fallback };
    settings.image = media;
    settings.image_size = 'full';
    if (node.layout && node.layout.width) {
      settings.width = { unit: 'px', size: Math.round(Number(node.layout.width)), sizes: [] };
    }
    if (node.style && node.style.radius) {
      settings.image_border_radius = boxValue(node.style.radius);
    }
    if (node.style && node.style.borderWidth && node.style.borderColor) {
      settings.image_border_border = node.style.borderStyle || 'solid';
      settings.image_border_width = boxValue(node.style.borderWidth);
      settings.image_border_color = node.style.borderColor;
    }
    if (node.style && node.style.boxShadow) {
      settings.image_box_shadow_box_shadow_type = 'yes';
      settings.image_box_shadow_box_shadow = node.style.boxShadow;
    }
  } else if (wType === 'author-box') {
    const sha = (node.image && node.image.sha256) || (node.raster && node.raster.sha256) || '';
    const fallback = (node.image && node.image.dataUri) || (node.raster && node.raster.dataUri) || '';
    const avatar = (sha || fallback) && resolveMedia ? resolveMedia(sha, fallback) : (collectSubtreeImages(node, nodes)[0] && resolveMedia ? resolveMedia(collectSubtreeImages(node, nodes)[0].sha256, collectSubtreeImages(node, nodes)[0].dataUri) : { id: '', url: '' });
    settings.source = 'custom';
    settings.author_avatar = avatar;
    settings.author_name = texts[0] || (node.content && node.content.name) || 'Author Name';
    settings.author_bio = texts[1] || '';
    if (firstTypo) {
      if (firstTypo.color) settings.name_color = firstTypo.color;
      applyTypographySettings(settings, 'name_typography', firstTypo, node.responsive);
    }
    if (textItems[1] && textItems[1].text) {
      if (textItems[1].text.color) settings.bio_color = textItems[1].text.color;
      applyTypographySettings(settings, 'bio_typography', textItems[1].text, node.responsive);
    }
    if (node.layout && node.layout.direction === 'row') settings.layout = 'left';
  } else if (wType === 'table-of-contents') {
    settings.title = texts[0] || (node.content && node.content.name) || 'Table of Contents';
    if (node.style && node.style.background) {
      settings.background_color = node.style.background;
      settings.header_background_color = node.style.background;
    }
    if (node.style && node.style.borderColor) settings.border_color = node.style.borderColor;
    if (node.style && node.style.radius) settings.border_radius = boxValue(node.style.radius);
    if (firstTypo) {
      if (firstTypo.color) settings.header_text_color = firstTypo.color;
      applyTypographySettings(settings, 'header_typography', firstTypo, node.responsive);
    }
    if (textItems[1] && textItems[1].text && textItems[1].text.color) {
      settings.item_text_color_normal = textItems[1].text.color;
    }
  } else if (wType === 'lottie') {
    settings.source = 'external_url';
    settings.source_external_url = { url: node.link || 'https://assets3.lottiefiles.com/packages/lf20_UJNc2t.json' };
    if (texts[0]) {
      settings.caption_source = 'custom';
      settings.caption = texts[0];
    }
  } else if (wType === 'breadcrumbs' || wType === 'post-info') {
    if (firstTypo) {
      if (firstTypo.color) settings.text_color = firstTypo.color;
      applyTypographySettings(settings, 'text_typography', firstTypo, node.responsive);
    }
    if (textItems[1] && textItems[1].text && textItems[1].text.color) {
      settings.link_color = textItems[1].text.color;
    }
  } else if (wType === 'woocommerce-menu-cart') {
    if (node.style && node.style.background) settings.background_color = node.style.background;
    if (node.style && node.style.borderColor) settings.border_color = node.style.borderColor;
    if (firstTypo && firstTypo.color) settings.toggle_button_text_color = firstTypo.color;
  } else if (wType === 'woocommerce-product-add-to-cart') {
    if (firstTypo) {
      if (firstTypo.color) settings.button_text_color = firstTypo.color;
      applyTypographySettings(settings, 'button_typography', firstTypo, node.responsive);
    }
  } else if (wType === 'blockquote') {
    settings.blockquote_content = texts[0] || (node.content && node.content.name) || '';
    settings.author_name = texts[1] || '';
    settings.tweet_button_Label = 'Tweet';
    if (firstTypo) {
      if (firstTypo.color) settings.content_text_color = firstTypo.color;
      applyTypographySettings(settings, 'content_typography', firstTypo, node.responsive);
    }
    if (textItems[1] && textItems[1].text) {
      if (textItems[1].text.color) settings.author_text_color = textItems[1].text.color;
      applyTypographySettings(settings, 'author_typography', textItems[1].text, node.responsive);
    }
    if (node.style && node.style.borderColor) {
      settings.border_color = node.style.borderColor;
    }
  } else if (wType === 'animated-headline') {
    settings.before_text = texts[0] || '';
    settings.highlighted_text = texts[1] || (node.content && node.content.name) || '';
    if (firstTypo) {
      if (firstTypo.color) settings.title_color = firstTypo.color;
      applyTypographySettings(settings, 'title_typography', firstTypo, node.responsive);
    }
  } else if (wType === 'taxonomy-filter') {
    if (firstTypo) {
      if (firstTypo.color) settings.normal_item_color = firstTypo.color;
      applyTypographySettings(settings, 'typography', firstTypo, node.responsive);
    }
    if (node.style && node.style.background) {
      settings.normal_item_background_color = node.style.background;
    }
  } else if (firstTypo) {
    if (firstTypo.color) settings.title_color = firstTypo.color;
    applyTypographySettings(settings, 'typography', firstTypo, node.responsive);
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: wType,
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProPaymentButton(node, wType, allocId) {
  const text = node.text || {};
  const style = node.style || {};
  const layout = node.layout || {};
  const settings = {
    text: (node.content && node.content.characters) || text.characters || (node.content && node.content.name) || (wType === 'stripe-button' ? 'Pay with Stripe' : 'Buy Now'),
    align: text.align || 'center',
  };
  if (style.gradient) {
    settings.background_background = 'gradient';
    settings.background_gradient_type = style.gradient.type || 'linear';
    settings.background_color = style.gradient.color1;
    settings.background_color_b = style.gradient.color2;
  } else if (style.background) {
    settings.background_background = 'classic';
    settings.background_color = style.background;
  }
  if (text.color) settings.button_text_color = text.color;
  applyTypographySettings(settings, 'typography', text, node.responsive);
  if (style.radius) settings.border_radius = boxValue(style.radius);
  if (style.borderWidth && style.borderColor) {
    settings.border_border = style.borderStyle || 'solid';
    settings.border_width = boxValue(style.borderWidth);
    settings.border_color = style.borderColor;
  }
  if (style.boxShadow) {
    settings.button_box_shadow_box_shadow_type = 'yes';
    settings.button_box_shadow_box_shadow = style.boxShadow;
  }
  if (layout.padding && (layout.padding.top || layout.padding.right || layout.padding.bottom || layout.padding.left)) {
    settings.text_padding = boxValue(layout.padding);
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: wType,
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProProgressTracker(node, allocId) {
  const st = node.style || {};
  const settings = {
    type: 'horizontal',
    relative_to: 'entire_page',
  };
  if (st.background) settings.progress_color = st.background;
  if (st.borderColor) settings.progress_bg_color = st.borderColor;
  if (node.layout && node.layout.height && Number(node.layout.height) <= 40) {
    settings.tracker_height = { unit: 'px', size: Math.max(2, Math.round(Number(node.layout.height))), sizes: [] };
  }
  if (st.radius) settings.border_radius = boxValue(st.radius);
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'progress-tracker',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProVideoPlaylist(node, nodes, allocId) {
  const textItems = collectSubtreeTexts(node, nodes);
  const firstTypo = textItems[0] && textItems[0].text ? textItems[0].text : node.text;
  const tabs = [];
  for (const cid of node.children || []) {
    const child = nodes[cid];
    if (!child) continue;
    const cTexts = collectSubtreeTexts(child, nodes);
    tabs.push({
      _id: shortId(cid),
      title: (cTexts[0] && cTexts[0].text && cTexts[0].text.characters) || (child.content && child.content.name) || `Video ${tabs.length + 1}`,
      youtube_url: child.link || 'https://www.youtube.com/watch?v=XHOmBV4js_E',
    });
  }
  const settings = {
    playlist_title: (node.content && node.content.name) || 'Video Playlist',
    tabs,
  };
  if (firstTypo) {
    if (firstTypo.color) settings.normal_color = firstTypo.color;
    applyTypographySettings(settings, 'normal_typography', firstTypo, node.responsive);
  }
  if (node.style && node.style.background) {
    settings.normal_background = node.style.background;
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'video-playlist',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProOffCanvas(node, nodes, allocId, buildElement) {
  const children = [];
  for (const cid of node.children || []) {
    const el = buildElement ? buildElement(cid, false, node) : null;
    if (el) children.push(el);
  }
  const st = node.style || {};
  const settings = {
    off_canvas_name: (node.content && node.content.name) || 'Off-Canvas',
  };
  if (node.layout && node.layout.width) {
    settings.width = { unit: 'px', size: Math.round(Number(node.layout.width)), sizes: [] };
  }
  if (st.background) {
    settings.background_background = 'classic';
    settings.background_color = st.background;
  }
  if (st.radius) settings.border_radius = boxValue(st.radius);
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'off-canvas',
    isInner: false,
    settings,
    elements: children,
  };
}

export function buildProCountdown(node, nodes, allocId) {
  const textItems = collectSubtreeTexts(node, nodes);
  const numNode = textItems.find((t) => /\d/.test((t.text && t.text.characters) || '')) || textItems[0] || null;
  const lblNode = textItems.find((t) => t !== numNode) || null;
  const settings = {
    countdown_type: 'due_date',
    due_date: '2027-12-31 23:59',
    show_days: 'yes',
    show_hours: 'yes',
    show_minutes: 'yes',
    show_seconds: 'yes',
  };
  if (numNode && numNode.text) {
    if (numNode.text.color) settings.digits_color = numNode.text.color;
    applyTypographySettings(settings, 'digits_typography', numNode.text, node.responsive);
  }
  if (lblNode && lblNode.text) {
    if (lblNode.text.color) settings.label_color = lblNode.text.color;
    applyTypographySettings(settings, 'label_typography', lblNode.text, node.responsive);
  }
  if (node.style && node.style.background) settings.box_background_color = node.style.background;
  if (node.style && node.style.radius) settings.box_border_radius = boxValue(node.style.radius);
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'countdown',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProShareButtons(node, nodes, allocId) {
  const platforms = ['facebook', 'twitter', 'linkedin', 'pinterest', 'reddit', 'whatsapp', 'telegram', 'email'];
  const shareButtons = [];
  const extracted = (node.content && Array.isArray(node.content.socialItems)) ? node.content.socialItems : [];
  const sourceList = extracted.length > 0
    ? extracted
    : (node.children || []).map((cid) => nodes[cid]).filter(Boolean).map((c) => ({ id: c.id, name: (c.content && c.content.name) || 'facebook' }));
  for (const item of sourceList) {
    const nm = String(item.name || '').toLowerCase();
    const matched = platforms.find((p) => nm.includes(p)) || 'facebook';
    shareButtons.push({ _id: shortId(item.id || matched), button: matched });
  }
  const settings = {
    share_buttons: shareButtons.length > 0 ? shareButtons : [{ _id: shortId('sb1'), button: 'facebook' }],
    view: 'icon-text',
  };
  const styled = extracted.find((s) => s.background);
  if (styled && styled.background) {
    settings.color_source = 'custom';
    settings.primary_color = styled.background;
    settings.secondary_color = '#FFFFFF';
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'share-buttons',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProPriceList(node, nodes, allocId) {
  const priceList = [];
  for (const cid of node.children || []) {
    const child = nodes[cid];
    if (!child) continue;
    const cTexts = collectSubtreeTexts(child, nodes).map((t) => t.text).filter(Boolean);
    const priceT = cTexts.find((t) => /[$€£₫¥]|\d/.test(t.characters || '')) || null;
    const titleT = cTexts.find((t) => t !== priceT) || cTexts[0] || null;
    const descT = cTexts.find((t) => t !== priceT && t !== titleT) || null;
    priceList.push({
      _id: shortId(cid),
      title: (titleT && titleT.characters) || (child.content && child.content.name) || 'Item',
      price: (priceT && priceT.characters) || '$19',
      item_description: (descT && descT.characters) || '',
    });
  }
  const allTexts = collectSubtreeTexts(node, nodes).map((t) => t.text).filter(Boolean);
  const priceTextSample = allTexts.find((t) => /[$€£₫¥]|\d/.test(t.characters || '')) || null;
  const settings = { price_list: priceList };
  if (node.layout && typeof node.layout.gap === 'number' && node.layout.gap > 0) {
    settings.row_space = { unit: 'px', size: Math.round(node.layout.gap), sizes: [] };
  }
  if (allTexts[0]) {
    if (allTexts[0].color) settings.heading_color = allTexts[0].color;
    applyTypographySettings(settings, 'heading_typography', allTexts[0], node.responsive);
  }
  if (priceTextSample) {
    if (priceTextSample.color) settings.price_color = priceTextSample.color;
    applyTypographySettings(settings, 'price_typography', priceTextSample, node.responsive);
  }
  if (allTexts[1]) {
    if (allTexts[1].color) settings.description_color = allTexts[1].color;
    applyTypographySettings(settings, 'description_typography', allTexts[1], node.responsive);
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'price-list',
    isInner: false,
    settings,
    elements: [],
  };
}

