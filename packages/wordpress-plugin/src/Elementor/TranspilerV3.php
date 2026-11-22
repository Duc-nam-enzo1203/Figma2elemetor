<?php

declare(strict_types=1);

namespace F2EBridge\Elementor;

use F2EBridge\Media\AssetStore;

/**
 * Compiles an `f2e.document` Intermediate Representation into Elementor v3 elements:
 * - Flexbox & CSS Grid Containers (`elType: 'container'`)
 * - Basic Free Widgets: heading, text-editor, button, image, icon (inline SVG), divider, spacer
 * - Interactive & Layout Widgets: icon-box, image-box, nested-accordion, nested-tabs,
 *   image-carousel, image-gallery, testimonial, star-rating, social-icons, counter
 * - Elementor Pro Widgets: form, nav-menu, call-to-action, price-table, flip-box, slides, loop-grid
 * - Binds Global Colors & Global Fonts via `__globals__`
 * - Embeds `_f2e_node_id` for deterministic Incremental Re-sync
 */
final class TranspilerV3
{
    private const ALIGN_MAP = [
        'MIN' => 'flex-start',
        'CENTER' => 'center',
        'MAX' => 'flex-end',
        'SPACE_BETWEEN' => 'space-between',
        'BASELINE' => 'baseline',
    ];

    /** @var array<string,string> */
    private array $colorGlobals;

    /** @var array<string,string> */
    private array $typoGlobals;

    /** @var array<string,array{id:int,url:string}> */
    private array $attachmentMap = [];

    /** @var array<string,bool> */
    private array $usedIds = [];

    public function __construct(
        GlobalStyles $globals = new GlobalStyles(),
        private readonly AssetStore $assets = new AssetStore()
    ) {
        $this->colorGlobals = $globals->colorIndex();
        $this->typoGlobals = $globals->typographyIndex();
    }

    /**
     * @param array<string,mixed> $document
     * @param array<string,array{id:int,url:string}> $attachmentMap
     * @return list<array<string,mixed>>
     */
    public function transpile(array $document, array $attachmentMap = []): array
    {
        $this->attachmentMap = $attachmentMap;
        $this->usedIds = [];
        $nodes = is_array($document['nodes'] ?? null) ? $document['nodes'] : [];
        $elements = [];

        foreach ((array) ($document['roots'] ?? []) as $rootId) {
            // Container 1 (Root selection) is strictly preserved!
            // Never eliminate Container 1 when it contains container 2 + container 3!
            $built = $this->buildNode((string) $rootId, $nodes, true);
            if ($built !== null) {
                $elements[] = $built;
            }
        }
        return $elements;
    }

    /**
     * @param array<string,mixed> $nodes
     * @return array<string,mixed>|null
     */
    private function buildNode(string $nodeId, array $nodes, bool $isRoot = false): ?array
    {
        $node = $nodes[$nodeId] ?? null;
        if (!is_array($node)) {
            return null;
        }
        $widget = (string) ($node['widget'] ?? 'container');
        if ($widget === 'skip') {
            return null;
        }

        $element = match ($widget) {
            'heading' => $this->buildHeading($node),
            'text-editor' => $this->buildTextEditor($node),
            'button' => $this->buildButton($node),
            'image' => $this->buildImage($node),
            'icon' => $this->buildIcon($node),
            'html' => $this->buildHtml($node),
            'divider' => $this->buildDivider($node),
            'spacer' => $this->buildSpacer($node),
            'icon-box', 'image-box' => $this->buildBoxWidget($node, $nodes, $widget),
            'icon-list' => $this->buildIconList($node, $nodes),
            'nested-accordion', 'accordion', 'toggle' => $this->buildNestedAccordion($node, $nodes),
            'nested-tabs', 'tabs' => $this->buildNestedTabs($node, $nodes),
            'image-gallery', 'image-carousel', 'gallery', 'media-carousel', 'nested-carousel' => $this->buildGalleryOrCarousel($node, $nodes, $widget),
            'testimonial', 'testimonial-carousel', 'reviews' => $this->buildTestimonial($node, $nodes),
            'star-rating' => $this->buildStarRating($node),
            'social-icons', 'share-buttons' => $this->buildSocialIcons($node, $nodes),
            'counter', 'countdown' => $this->buildCounter($node, $nodes),
            // Elementor Pro
            'form', 'login', 'search-form' => $this->buildProForm($node, $nodes),
            'nav-menu', 'mega-menu' => $this->buildProNavMenu($node, $nodes),
            'call-to-action' => $this->buildProCta($node, $nodes),
            'price-table', 'price-list' => $this->buildProPriceTable($node, $nodes),
            'flip-box' => $this->buildProFlipBox($node, $nodes),
            'slides' => $this->buildProSlides($node, $nodes),
            'loop-grid', 'loop-carousel', 'posts', 'portfolio', 'woocommerce-products' => $this->buildProLoopGrid($node),
            'theme-site-logo', 'site-logo' => $this->buildSiteLogo($node),
            'theme-post-featured-image' => (defined('ELEMENTOR_PRO_VERSION') || class_exists('\\ElementorPro\\Plugin'))
                ? $this->wrapElement('widget', 'theme-post-featured-image', ['image_size' => 'full'], [], [])
                : $this->buildImage($node),
            default => $this->buildContainer($node, $nodes, $isRoot),
        };

        $element['settings']['_f2e_node_id'] = (string) ($node['sourceNodeId'] ?? $node['id'] ?? $nodeId);
        $element['settings']['_title'] = (string) ($node['content']['name'] ?? $widget);

        // Apply absolute positioning if extracted from Figma
        if (($node['layout']['position'] ?? '') === 'absolute') {
            $element['settings']['position'] = 'absolute';
            $element['settings']['_position'] = 'absolute';
            $nodeX = (int) ($node['layout']['x'] ?? 0);
            $nodeY = (int) ($node['layout']['y'] ?? 0);
            $element['settings']['_offset_orientation_h'] = 'start';
            $element['settings']['_offset_x'] = ['unit' => 'px', 'size' => max(0, $nodeX), 'sizes' => []];
            $element['settings']['_offset_orientation_v'] = 'start';
            $element['settings']['_offset_y'] = ['unit' => 'px', 'size' => max(0, $nodeY), 'sizes' => []];
            $element['settings']['z_index'] = !empty($node['layout']['isBackgroundLayer']) ? 0 : 2;
        }

        return $element;
    }

    /**
     * @param array<string,mixed> $node
     * @param array<string,mixed> $nodes
     * @return array<string,mixed>
     */
    /**
     * @param array<string|int> $ids
     * @param array<string,mixed> $nodes
     * @return array<string|int>
     */
    private function expandUnwrappedChildIds(array $ids, array $nodes): array
    {
        $result = [];
        foreach ($ids as $cid) {
            $cNode = $nodes[(string) $cid] ?? null;
            if (!is_array($cNode)) {
                continue;
            }
            $w = (string) ($cNode['widgetType'] ?? $cNode['widget'] ?? '');
            if ($w === 'unwrap') {
                $subIds = [];
                foreach ((array) ($cNode['children'] ?? []) as $subId) {
                    $sub = $nodes[(string) $subId] ?? null;
                    if (is_array($sub) && (($sub['widget'] ?? '') !== 'skip') && (($sub['widgetType'] ?? '') !== 'skip')) {
                        $subIds[] = $subId;
                    }
                }
                foreach ($this->expandUnwrappedChildIds($subIds, $nodes) as $grandId) {
                    $result[] = $grandId;
                }
            } else {
                $result[] = $cid;
            }
        }
        return $result;
    }

    private function buildContainer(array $node, array $nodes, bool $isRoot): array
    {
        $layout = is_array($node['layout'] ?? null) ? $node['layout'] : [];
        $style = is_array($node['style'] ?? null) ? $node['style'] : [];
        $responsive = is_array($node['responsive'] ?? null) ? $node['responsive'] : [];
        $settings = [];
        $globals = [];

        if (($layout['mode'] ?? 'flex') === 'grid') {
            $cols = max(1, (int) ($layout['columns'] ?? 2));
            $settings['container_type'] = 'grid';
            $settings['grid_columns_grid'] = ['unit' => 'fr', 'size' => $cols, 'sizes' => []];
            $settings['grid_columns_grid_tablet'] = ['unit' => 'fr', 'size' => (int) ($responsive['tablet']['columns'] ?? max(1, (int) ceil($cols / 2))), 'sizes' => []];
            $settings['grid_columns_grid_mobile'] = ['unit' => 'fr', 'size' => (int) ($responsive['mobile']['columns'] ?? 1), 'sizes' => []];
            $settings['grid_gaps'] = $this->gapObject($layout);
        } else {
            $dir = ($layout['direction'] ?? 'column') === 'row' ? 'row' : 'column';
            $settings['container_type'] = 'flex';
            $settings['flex_direction'] = $dir;
            $settings['flex_gap'] = $this->gapObject($layout);
            $settings['flex_justify_content'] = self::ALIGN_MAP[(string) ($layout['justify'] ?? 'MIN')] ?? 'flex-start';
            $settings['flex_align_items'] = self::ALIGN_MAP[(string) ($layout['align'] ?? 'MIN')] ?? 'flex-start';
            if (!empty($layout['wrap'])) {
                $settings['flex_wrap'] = 'wrap';
            }

            if (!empty($responsive['tablet']['direction'])) {
                $settings['flex_direction_tablet'] = (string) $responsive['tablet']['direction'];
            }
            if (!empty($responsive['mobile']['direction'])) {
                $settings['flex_direction_mobile'] = (string) $responsive['mobile']['direction'];
            } elseif ($dir === 'row' && count((array) ($node['children'] ?? [])) >= 2) {
                $settings['flex_direction_mobile'] = 'column';
            }
        }

        if (is_array($layout['padding'] ?? null)) {
            $p = $layout['padding'];
            if (!empty($p['top']) || !empty($p['right']) || !empty($p['bottom']) || !empty($p['left'])) {
                $settings['padding'] = $this->boxObject($p);
                $settings['padding_tablet'] = $this->boxObject(is_array($responsive['tablet']['padding'] ?? null) ? $responsive['tablet']['padding'] : $this->scaleBox($p, 0.72, 40));
                $settings['padding_mobile'] = $this->boxObject(is_array($responsive['mobile']['padding'] ?? null) ? $responsive['mobile']['padding'] : $this->scaleBox($p, 0.48, 24));
            } else {
                $settings['padding'] = $this->boxObject(['top' => 0, 'right' => 0, 'bottom' => 0, 'left' => 0]);
            }
        } else {
            $settings['padding'] = $this->boxObject(['top' => 0, 'right' => 0, 'bottom' => 0, 'left' => 0]);
        }

        $settings['margin'] = $this->boxObject(is_array($layout['margin'] ?? null) ? $layout['margin'] : ['top' => 0, 'right' => 0, 'bottom' => 0, 'left' => 0]);

        $settings['content_width'] = $isRoot ? 'boxed' : 'full';
        $nodeW = (int) ($layout['width'] ?? 0);
        if ($isRoot && !empty($layout['width'])) {
            $settings['boxed_width'] = ['unit' => 'px', 'size' => min(1440, $nodeW), 'sizes' => []];
        } elseif (!$isRoot && $nodeW > 0) {
            $parentW = 1240;
            if (($layout['sizingH'] ?? '') === 'FILL') {
                $settings['_flex_size'] = 'grow';
                $pct = round(($nodeW / $parentW) * 100, 1);
                $settings['width'] = ['unit' => '%', 'size' => min(100, $pct), 'sizes' => []];
                if ($pct >= 42 && $pct <= 68) {
                    $settings['width_tablet'] = ['unit' => '%', 'size' => 100, 'sizes' => []];
                    $settings['width_mobile'] = ['unit' => '%', 'size' => 100, 'sizes' => []];
                } else {
                    $settings['width_mobile'] = ['unit' => '%', 'size' => 100, 'sizes' => []];
                }
            } elseif ($nodeW < $parentW * 0.92) {
                $settings['width'] = ['unit' => 'px', 'size' => $nodeW, 'sizes' => []];
                $settings['width_mobile'] = ['unit' => '%', 'size' => 100, 'sizes' => []];
            }
        }

        $this->applyBoxStyle($settings, $globals, $style);

        // Absorb decorative background child (e.g. child named 'bg', 'background', 'overlay')
        $rawChildren = (array) ($node['children'] ?? []);
        $remainingChildIds = [];
        foreach ($rawChildren as $cid) {
            $child = $nodes[(string) $cid] ?? null;
            if (is_array($child) && (($child['layout']['position'] ?? '') === 'absolute')) {
                $cName = strtolower((string) ($child['content']['name'] ?? ''));
                $isBgName = (bool) preg_match('/^(bg|background|overlay|border|shadow|glow)$/i', $cName);
                $hasNoText = empty($child['text']) && empty($child['children']);
                if ($isBgName && $hasNoText) {
                    if (empty($settings['background_background'])) {
                        if (is_array($child['style']['gradient'] ?? null)) {
                            $g = $child['style']['gradient'];
                            $settings['background_background'] = 'gradient';
                            $settings['background_gradient_type'] = (string) ($g['type'] ?? 'linear');
                            $settings['background_color'] = (string) ($g['color1'] ?? '#64A14F');
                            $settings['background_color_stop'] = ['unit' => '%', 'size' => (int) ($g['stop1'] ?? 0), 'sizes' => []];
                            $settings['background_color_b'] = (string) ($g['color2'] ?? '#038132');
                            $settings['background_color_b_stop'] = ['unit' => '%', 'size' => (int) ($g['stop2'] ?? 100), 'sizes' => []];
                            $settings['background_gradient_angle'] = ['unit' => 'deg', 'size' => (int) ($g['angle'] ?? 180), 'sizes' => []];
                        } elseif (!empty($child['style']['background'])) {
                            $settings['background_background'] = 'classic';
                            $settings['background_color'] = $child['style']['background'];
                            $this->bindColor($settings, $globals, 'background_color', (string) $child['style']['background']);
                        } elseif (!empty($child['style']['backgroundImage']) || !empty($child['style']['backgroundImageDataUri'])) {
                            $bgMedia = $this->resolveStyleBgMedia($child['style']);
                            if ($bgMedia['url'] !== '' || $bgMedia['id'] > 0) {
                                $settings['background_background'] = 'classic';
                                $settings['background_image'] = $bgMedia;
                                $settings['background_size'] = 'cover';
                                $settings['background_position'] = 'center center';
                                $settings['background_repeat'] = 'no-repeat';
                            }
                        }
                    }
                    if (empty($settings['border_radius']) && !empty($child['style']['radius'])) {
                        $settings['border_radius'] = $this->boxObject($child['style']['radius']);
                    }
                    if (empty($settings['border_border']) && !empty($child['style']['borderColor']) && !empty($child['style']['borderWidth'])) {
                        $settings['border_border'] = 'solid';
                        $settings['border_width'] = $this->boxObject($child['style']['borderWidth']);
                        $settings['border_color'] = $child['style']['borderColor'];
                        $this->bindColor($settings, $globals, 'border_color', (string) $child['style']['borderColor']);
                    }
                    if (empty($settings['custom_css']) && is_array($child['style']['borderGradient'] ?? null) && is_array($child['style']['borderWidth'] ?? null)) {
                        $bgSolid = !empty($child['style']['background']) ? (string) $child['style']['background'] : '#ffffff';
                        $bgLayer = is_array($child['style']['gradient'] ?? null)
                            ? sprintf('linear-gradient(%ddeg, %s %d%%, %s %d%%)', (int) ($child['style']['gradient']['angle'] ?? 180), (string) ($child['style']['gradient']['color1'] ?? '#FFFFFF'), (int) ($child['style']['gradient']['stop1'] ?? 0), (string) ($child['style']['gradient']['color2'] ?? '#FFFFFF'), (int) ($child['style']['gradient']['stop2'] ?? 100))
                            : "linear-gradient({$bgSolid}, {$bgSolid})";
                        $gB = $child['style']['borderGradient'];
                        $bwB = max(1, (int) ($child['style']['borderWidth']['top'] ?? 1));
                        $gradB = (!empty($child['style']['devModeBorderImage']) && strpos((string) $child['style']['devModeBorderImage'], 'linear-gradient') === 0)
                            ? (string) $child['style']['devModeBorderImage']
                            : sprintf('linear-gradient(%ddeg, %s %d%%, %s %d%%)', (int) ($gB['angle'] ?? 135), (string) ($gB['color1'] ?? '#000000'), (int) ($gB['stop1'] ?? 0), (string) ($gB['color2'] ?? '#FFFFFF'), (int) ($gB['stop2'] ?? 100));
                        $settings['custom_css'] = "selector {\n  border: {$bwB}px solid transparent !important;\n  background-image: {$bgLayer}, {$gradB} !important;\n  background-origin: border-box !important;\n  background-clip: padding-box, border-box !important;\n}";
                    }
                    continue;
                }
            }
            $remainingChildIds[] = $cid;
        }

        // UNWRAP REDUNDANT INNER CONTAINER:
        // In Figma, a Section/Header frame (e.g. 1440px full-width) frequently contains a single inner
        // Auto-Layout Frame (e.g. 1200px boxed content wrapper: Header -> Container -> [Logo, Nav, Button]).
        // In Elementor, a single container handles both the full-width background and the boxed_width constraint!
        $activeChildIds = $this->expandUnwrappedChildIds($remainingChildIds, $nodes);
        while (count($activeChildIds) === 1) {
            $singleChildId = (string) $activeChildIds[0];
            $singleChild = $nodes[$singleChildId] ?? null;
            if (!is_array($singleChild)) {
                break;
            }
            $childWType = (string) ($singleChild['widgetType'] ?? $singleChild['widget'] ?? 'container');
            if ($childWType !== 'container' && $childWType !== 'flexbox' && $childWType !== 'unwrap') {
                break;
            }
            $childSub = (array) ($singleChild['children'] ?? []);
            if (empty($childSub)) {
                break;
            }

            // Do not unwrap if child has distinct background and parent already has a different background
            $parentHasBg = !empty($settings['background_background']) || !empty($settings['background_color']) || !empty($settings['background_image']['url']);
            $childHasBg = !empty($singleChild['style']['background'])
                || is_array($singleChild['style']['gradient'] ?? null)
                || !empty($singleChild['style']['backgroundImage'])
                || !empty($singleChild['style']['backgroundImageDataUri']);
            if ($parentHasBg && $childHasBg && ($settings['background_color'] ?? '') !== ($singleChild['style']['background'] ?? '') && $childWType !== 'unwrap') {
                break;
            }
            $parentHasBorder = !empty($settings['border_border']) || !empty($settings['border_width']);
            $childHasBorder = !empty($singleChild['style']['borderColor']) || !empty($singleChild['style']['borderWidth']);
            if ($parentHasBorder && $childHasBorder && $childWType !== 'unwrap') {
                break;
            }

            // Inherit boxed width from child
            $childLayout = is_array($singleChild['layout'] ?? null) ? $singleChild['layout'] : [];
            $childW = (int) ($childLayout['width'] ?? 0);
            if ($childW > 0 && $childW <= 1360) {
                $settings['content_width'] = 'boxed';
                $settings['boxed_width'] = ['unit' => 'px', 'size' => min(1320, max(960, $childW)), 'sizes' => []];
                $settings['boxed_width_tablet'] = ['unit' => 'px', 'size' => 768, 'sizes' => []];
                $settings['boxed_width_mobile'] = ['unit' => 'px', 'size' => 360, 'sizes' => []];
            }

            // Inherit flex direction and gaps from child
            $childDir = ($childLayout['direction'] ?? 'column') === 'row' ? 'row' : 'column';
            $settings['flex_direction'] = $childDir;
            $settings['flex_gap'] = $this->gapObject($childLayout);
            $settings['flex_justify_content'] = self::ALIGN_MAP[(string) ($childLayout['justify'] ?? 'MIN')] ?? 'flex-start';
            $settings['flex_align_items'] = self::ALIGN_MAP[(string) ($childLayout['align'] ?? 'MIN')] ?? 'flex-start';
            if (!empty($childLayout['wrap']) || ($childDir === 'row' && count($childSub) >= 3)) {
                $settings['flex_wrap'] = 'wrap';
                $settings['flex_wrap_tablet'] = 'wrap';
            }

            // If parent had no background but child does, absorb child's background (classic, gradient, or image)
            if (!$parentHasBg) {
                if (is_array($singleChild['style']['gradient'] ?? null)) {
                    $g = $singleChild['style']['gradient'];
                    $settings['background_background'] = 'gradient';
                    $settings['background_gradient_type'] = (string) ($g['type'] ?? 'linear');
                    $settings['background_color'] = (string) ($g['color1'] ?? '#64A14F');
                    $settings['background_color_stop'] = ['unit' => '%', 'size' => (int) ($g['stop1'] ?? 0), 'sizes' => []];
                    $settings['background_color_b'] = (string) ($g['color2'] ?? '#038132');
                    $settings['background_color_b_stop'] = ['unit' => '%', 'size' => (int) ($g['stop2'] ?? 100), 'sizes' => []];
                    $settings['background_gradient_angle'] = ['unit' => 'deg', 'size' => (int) ($g['angle'] ?? 180), 'sizes' => []];
                } elseif (!empty($singleChild['style']['background'])) {
                    $settings['background_background'] = 'classic';
                    $settings['background_color'] = $singleChild['style']['background'];
                    $this->bindColor($settings, $globals, 'background_color', (string) $singleChild['style']['background']);
                }
                if (!empty($singleChild['style']['backgroundImage']) || !empty($singleChild['style']['backgroundImageDataUri'])) {
                    $bgMedia = $this->resolveStyleBgMedia($singleChild['style']);
                    if ($bgMedia['url'] !== '' || $bgMedia['id'] > 0) {
                        $settings['background_background'] = 'classic';
                        $settings['background_image'] = $bgMedia;
                        $settings['background_size'] = 'cover';
                        $settings['background_position'] = 'center center';
                        $settings['background_repeat'] = 'no-repeat';
                    }
                }
            }

            // Filter decorative bg in child
            $innerRemaining = [];
            foreach ($childSub as $subId) {
                $subNode = $nodes[(string) $subId] ?? null;
                if (is_array($subNode) && (($subNode['layout']['position'] ?? '') === 'absolute')) {
                    $sName = strtolower((string) ($subNode['content']['name'] ?? ''));
                    if (preg_match('/^(bg|background|overlay|border|shadow|glow)$/i', $sName)) {
                        continue;
                    }
                }
                $innerRemaining[] = $subId;
            }
            $activeChildIds = $this->expandUnwrappedChildIds($innerRemaining, $nodes);
        }
        $activeChildIds = $this->expandUnwrappedChildIds($activeChildIds, $nodes);

        $children = [];
        foreach ($activeChildIds as $cid) {
            $childEl = $this->buildNode((string) $cid, $nodes, false);
            if ($childEl !== null) {
                if ($childEl['elType'] === 'container') {
                    $childEl['isInner'] = true;
                }
                $children[] = $childEl;
            }
        }

        return $this->wrapElement('container', null, $settings, $globals, $children, !$isRoot);
    }

    /** @param array<string,mixed> $node @return array<string,mixed> */
    private function buildHeading(array $node): array
    {
        $text = is_array($node['text'] ?? null) ? $node['text'] : [];
        $responsive = is_array($node['responsive'] ?? null) ? $node['responsive'] : [];
        $settings = [
            'title' => (string) ($text['characters'] ?? $node['content']['name'] ?? 'Heading'),
            'header_size' => $this->inferHeadingLevel($node, $text),
            'align' => $this->normalizeAlign((string) ($text['align'] ?? 'left')),
        ];
        $globals = [];
        if (!empty($text['color'])) {
            $this->bindColor($settings, $globals, 'title_color', (string) $text['color']);
        }
        $this->bindTypography($settings, $globals, 'typography', $text, $responsive);
        return $this->wrapElement('widget', 'heading', $settings, $globals, []);
    }

    /** @param array<string,mixed> $node @return array<string,mixed> */
    private function buildTextEditor(array $node): array
    {
        $text = is_array($node['text'] ?? null) ? $node['text'] : [];
        $responsive = is_array($node['responsive'] ?? null) ? $node['responsive'] : [];
        $raw = trim((string) ($text['characters'] ?? ''));
        $lines = preg_split('/\r?\n+/', $raw) ?: [$raw];
        $html = implode('', array_map(static fn (string $l): string => '<p>' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</p>', $lines));

        $settings = [
            'editor' => $html,
            'align' => $this->normalizeAlign((string) ($text['align'] ?? 'left')),
        ];
        $globals = [];
        if (!empty($text['color'])) {
            $this->bindColor($settings, $globals, 'text_color', (string) $text['color']);
        }
        $this->bindTypography($settings, $globals, 'typography', $text, $responsive);
        return $this->wrapElement('widget', 'text-editor', $settings, $globals, []);
    }

    /** @param array<string,mixed> $node @return array<string,mixed> */
    private function buildButton(array $node): array
    {
        $text = is_array($node['text'] ?? null) ? $node['text'] : [];
        $style = is_array($node['style'] ?? null) ? $node['style'] : [];
        $layout = is_array($node['layout'] ?? null) ? $node['layout'] : [];
        $responsive = is_array($node['responsive'] ?? null) ? $node['responsive'] : [];

        $settings = [
            'text' => (string) ($node['content']['characters'] ?? $text['characters'] ?? $node['content']['name'] ?? 'Button'),
            'align' => $this->normalizeAlign((string) ($text['align'] ?? 'center')),
        ];
        $globals = [];

        if (!empty($node['link'])) {
            $settings['link'] = ['url' => (string) $node['link'], 'is_external' => '', 'nofollow' => ''];
        }

        // Background (Classic or Gradient)
        if (is_array($style['gradient'] ?? null)) {
            $g = $style['gradient'];
            $settings['background_background'] = 'gradient';
            $settings['background_gradient_type'] = (string) ($g['type'] ?? 'linear');
            $settings['background_color'] = (string) ($g['color1'] ?? '#64A14F');
            $settings['background_color_stop'] = ['unit' => '%', 'size' => (int) ($g['stop1'] ?? 0), 'sizes' => []];
            $settings['background_color_b'] = (string) ($g['color2'] ?? '#038132');
            $settings['background_color_b_stop'] = ['unit' => '%', 'size' => (int) ($g['stop2'] ?? 100), 'sizes' => []];
            $settings['background_gradient_angle'] = ['unit' => 'deg', 'size' => (int) ($g['angle'] ?? 180), 'sizes' => []];
        } elseif (!empty($style['background'])) {
            $settings['background_background'] = 'classic';
            $this->bindColor($settings, $globals, 'background_color', (string) $style['background']);
        } else {
            $settings['background_color'] = 'rgba(0,0,0,0)';
        }

        // Button Icon (e.g. arrow, chevron, plus, check from Figma vector children)
        if (is_array($node['buttonIcon'] ?? null)) {
            $icon = $node['buttonIcon'];
            $settings['selected_icon'] = [
                'value' => (string) ($icon['value'] ?? 'fas fa-arrow-right'),
                'library' => (string) ($icon['library'] ?? 'fa-solid'),
            ];
            $settings['icon_align'] = (string) ($icon['align'] ?? 'right');
            $settings['icon_indent'] = ['unit' => 'px', 'size' => 8, 'sizes' => []];
        }
        if (!empty($text['color'])) {
            $this->bindColor($settings, $globals, 'button_text_color', (string) $text['color']);
        }
        $this->bindTypography($settings, $globals, 'typography', $text, $responsive);

        if (is_array($style['radius'] ?? null)) {
            $settings['border_radius'] = $this->boxObject($style['radius']);
        }
        if (is_array($style['borderWidth'] ?? null) && !empty($style['borderColor'])) {
            $settings['border_border'] = 'solid';
            $settings['border_width'] = $this->boxObject($style['borderWidth']);
            $this->bindColor($settings, $globals, 'border_color', (string) $style['borderColor']);
        }

        // Linear Gradient Border Solution:
        // Automatically injects custom_css for dual-clipping gradient borders
        if (is_array($style['borderGradient'] ?? null) && is_array($style['borderWidth'] ?? null)) {
            $g = $style['borderGradient'];
            $bw = max(1, (int) ($style['borderWidth']['top'] ?? 1));
            $gradCss = (!empty($style['devModeBorderImage']) && strpos((string) $style['devModeBorderImage'], 'linear-gradient') === 0)
                ? (string) $style['devModeBorderImage']
                : sprintf('linear-gradient(%ddeg, %s %d%%, %s %d%%)', (int) ($g['angle'] ?? 135), (string) ($g['color1'] ?? '#000000'), (int) ($g['stop1'] ?? 0), (string) ($g['color2'] ?? '#FFFFFF'), (int) ($g['stop2'] ?? 100));
            $bgSolid = !empty($style['background']) ? (string) $style['background'] : '#ffffff';
            $bgLayer = is_array($style['gradient'] ?? null)
                ? sprintf('linear-gradient(%ddeg, %s %d%%, %s %d%%)', (int) ($style['gradient']['angle'] ?? 180), (string) ($style['gradient']['color1'] ?? '#FFFFFF'), (int) ($style['gradient']['stop1'] ?? 0), (string) ($style['gradient']['color2'] ?? '#FFFFFF'), (int) ($style['gradient']['stop2'] ?? 100))
                : "linear-gradient({$bgSolid}, {$bgSolid})";

            if (is_array($style['radius'] ?? null)) {
                $snippet = "selector {\n  border: {$bw}px solid transparent !important;\n  background-image: {$bgLayer}, {$gradCss} !important;\n  background-origin: border-box !important;\n  background-clip: padding-box, border-box !important;\n}";
            } else {
                $snippet = "selector {\n  border: {$bw}px solid !important;\n  border-image: {$gradCss} 1 !important;\n}";
            }
            $settings['custom_css'] = (!empty($settings['custom_css']) ? $settings['custom_css'] . "\n" : '') . $snippet;
        }
        if (is_array($layout['padding'] ?? null)) {
            $settings['text_padding'] = $this->boxObject($layout['padding']);
        }

        return $this->wrapElement('widget', 'button', $settings, $globals, []);
    }

    /** @param array<string,mixed> $node @return array<string,mixed> */
    private function buildSiteLogo(array $node): array
    {
        $media = $this->resolveNodeMedia($node);
        $w = max(20, (int) ($node['layout']['width'] ?? 120));

        $isProActive = defined('ELEMENTOR_PRO_VERSION') || class_exists('\\ElementorPro\\Plugin');

        if ($isProActive) {
            if ($media['url'] === '' && !empty($node['svg']['markup'])) {
                $cleanSvg = AssetStore::sanitizeSvg((string) $node['svg']['markup']);
                if ($cleanSvg !== '') {
                    $svgSha = (string) ($node['svg']['sha256'] ?? '');
                    $stored = $this->assets->storeBase64Asset($svgSha, base64_encode($cleanSvg), 'image/svg+xml', (string) ($node['content']['name'] ?? 'Site Logo'));
                    if ($stored !== null && !empty($stored['url'])) {
                        $media = ['id' => (int) ($stored['id'] ?? 0), 'url' => (string) $stored['url']];
                    } else {
                        $media = ['id' => 0, 'url' => 'data:image/svg+xml;base64,' . base64_encode($cleanSvg)];
                    }
                }
            }
            $settings = [
                'custom_image' => $media,
                'use_custom_image' => 'yes',
            ];
            if (!empty($node['layout']['width'])) {
                $settings['width'] = ['unit' => 'px', 'size' => $w, 'sizes' => []];
            }
            return $this->wrapElement('widget', 'theme-site-logo', $settings, [], []);
        }

        // Elementor Free fallback:
        if (!empty($media['url'])) {
            $settings = [
                'image' => $media,
                'image_size' => 'full',
            ];
            if (!empty($node['layout']['width'])) {
                $settings['width'] = ['unit' => 'px', 'size' => $w, 'sizes' => []];
            }
            return $this->wrapElement('widget', 'image', $settings, [], []);
        }

        if (!empty($node['svg']['markup'])) {
            $cleanSvg = AssetStore::sanitizeSvg((string) $node['svg']['markup']);
            if ($cleanSvg !== '') {
                $h = max(20, (int) ($node['layout']['height'] ?? 40));
                return $this->wrapElement('widget', 'html', [
                    'html' => sprintf(
                        '<div class="f2e-site-logo" style="display:inline-flex;align-items:center;width:%dpx;height:%dpx;line-height:0;">%s</div>',
                        $w,
                        $h,
                        $cleanSvg
                    ),
                ], [], []);
            }
        }

        return $this->buildImage($node);
    }

    /** @param array<string,mixed> $node @return array<string,mixed> */
    private function buildImage(array $node): array
    {
        $media = $this->resolveNodeMedia($node);
        $w = (int) ($node['layout']['width'] ?? 0);
        $h = (int) ($node['layout']['height'] ?? 0);

        if (empty($media['url']) && !empty($node['svg']['markup'])) {
            $cleanSvg = AssetStore::sanitizeSvg((string) $node['svg']['markup']);
            if ($cleanSvg !== '') {
                return $this->wrapElement('widget', 'html', [
                    'html' => sprintf(
                        '<div class="f2e-image-svg" style="display:inline-flex;align-items:center;%s%sline-height:0;">%s</div>',
                        $w > 0 ? "width:{$w}px;" : '',
                        $h > 0 ? "height:{$h}px;" : '',
                        $cleanSvg
                    ),
                ], [], []);
            }
        }

        $settings = [
            'image' => $media,
            'image_size' => 'full',
        ];
        if (!empty($node['layout']['width'])) {
            $settings['width'] = ['unit' => 'px', 'size' => (int) $node['layout']['width'], 'sizes' => []];
        }
        if (is_array($node['style']['radius'] ?? null)) {
            $settings['image_border_radius'] = $this->boxObject($node['style']['radius']);
        }
        return $this->wrapElement('widget', 'image', $settings, [], []);
    }

    /** @param array<string,mixed> $node @return array<string,mixed> */
    private function buildIcon(array $node): array
    {
        $w = max(12, (int) ($node['layout']['width'] ?? 24));
        $h = max(12, (int) ($node['layout']['height'] ?? 24));
        if (!empty($node['svg']['markup'])) {
            $cleanSvg = AssetStore::sanitizeSvg((string) $node['svg']['markup']);
            if ($cleanSvg !== '') {
                return $this->wrapElement('widget', 'html', [
                    'html' => sprintf(
                        '<div class="f2e-inline-svg" style="display:inline-flex;align-items:center;justify-content:center;width:%dpx;height:%dpx;line-height:0;">%s</div>',
                        $w,
                        $h,
                        $cleanSvg
                    ),
                ], [], []);
            }
        }

        $sha = (string) ($node['svg']['sha256'] ?? '');
        $media = $sha !== '' ? $this->resolveMedia($sha, '') : ['id' => 0, 'url' => ''];
        $color = (string) ($node['svg']['color'] ?? $node['style']['background'] ?? '#1E293B');

        $selectedIcon = ($media['id'] > 0 && $media['url'] !== '')
            ? ['value' => ['id' => $media['id'], 'url' => $media['url']], 'library' => 'svg']
            : ['value' => 'fas fa-circle', 'library' => 'fa-solid'];

        return $this->wrapElement('widget', 'icon', [
            'selected_icon' => $selectedIcon,
            'primary_color' => $color,
            'size' => ['unit' => 'px', 'size' => $w, 'sizes' => []],
        ], [], []);
    }

    /** @param array<string,mixed> $node @return array<string,mixed> */
    private function buildHtml(array $node): array
    {
        $markup = !empty($node['svg']['markup'])
            ? AssetStore::sanitizeSvg((string) $node['svg']['markup'])
            : (string) ($node['text']['characters'] ?? '');
        return $this->wrapElement('widget', 'html', ['html' => $markup], [], []);
    }

    /** @param array<string,mixed> $node @return array<string,mixed> */
    private function buildDivider(array $node): array
    {
        $weight = max(1, min(20, (int) ($node['layout']['height'] ?? 1)));
        $color = (string) ($node['style']['background'] ?? $node['style']['borderColor'] ?? '#10B981');
        $w = (int) ($node['layout']['width'] ?? 0);
        $settings = [
            'style' => 'solid',
            'weight' => ['unit' => 'px', 'size' => $weight, 'sizes' => []],
            'align' => 'left',
        ];
        if ($w > 0 && $w < 400) {
            $settings['width'] = ['unit' => 'px', 'size' => $w, 'sizes' => []];
        }
        $globals = [];
        $this->bindColor($settings, $globals, 'color', $color);
        return $this->wrapElement('widget', 'divider', $settings, $globals, []);
    }

    /** @param array<string,mixed> $node @return array<string,mixed> */
    private function buildSpacer(array $node): array
    {
        $space = max(8, (int) ($node['layout']['height'] ?? 24));
        return $this->wrapElement('widget', 'spacer', [
            'space' => ['unit' => 'px', 'size' => $space, 'sizes' => []],
        ], [], []);
    }

    /** @param array<string,mixed> $node @param array<string,mixed> $nodes @return array<string,mixed> */
    private function buildBoxWidget(array $node, array $nodes, string $wType): array
    {
        $content = is_array($node['content'] ?? null) ? $node['content'] : [];
        $texts = $this->collectSubtreeTexts($node, $nodes);
        $title = (string) ($content['title_text'] ?? '');
        $desc = (string) ($content['description_text'] ?? '');

        if ($title === '') {
            $title = (string) ($texts[0]['text']['characters'] ?? $content['name'] ?? 'Feature Title');
            $desc = (string) ($texts[1]['text']['characters'] ?? '');
        }

        $pos = (string) ($content['position'] ?? ((($node['layout']['direction'] ?? 'column') === 'row') ? 'left' : 'top'));

        $settings = [
            'title_text' => $title,
            'description_text' => $desc,
            'position' => $pos,
        ];

        $globals = [];
        $titleText = is_array($content['titleTypography'] ?? null)
            ? $content['titleTypography']
            : (is_array($node['text'] ?? null) ? $node['text'] : (is_array($texts[0]['text'] ?? null) ? $texts[0]['text'] : []));
        $descText = is_array($content['descriptionTypography'] ?? null)
            ? $content['descriptionTypography']
            : (is_array($texts[1]['text'] ?? null) ? $texts[1]['text'] : []);
        $responsive = is_array($node['responsive'] ?? null) ? $node['responsive'] : [];

        if (!empty($titleText['color'])) {
            $this->bindColor($settings, $globals, 'title_color', (string) $titleText['color']);
        }
        if (!empty($titleText)) {
            $this->bindTypography($settings, $globals, 'title_typography', $titleText, $responsive);
        }
        if (!empty($descText['color'])) {
            $this->bindColor($settings, $globals, 'description_color', (string) $descText['color']);
        }
        if (!empty($descText)) {
            $this->bindTypography($settings, $globals, 'description_typography', $descText, $responsive);
        }

        $finalWidgetType = $wType;

        if ($wType === 'image-box') {
            $media = $this->resolveNodeMedia($node, ['raster', 'image', 'style', 'svg']);
            if ($media['id'] === 0 && $media['url'] === '') {
                $imgs = $this->collectSubtreeImages($node, $nodes);
                if (!empty($imgs[0])) {
                    $media = $this->resolveMedia((string) ($imgs[0]['sha256'] ?? ''), (string) ($imgs[0]['dataUri'] ?? ''));
                }
            }
            $settings['image'] = $media;
        } else {
            // Icon box: check uploaded SVG first, then inline SVG markup, then raster fallback to image-box
            $svgSha = (string) ($node['svg']['sha256'] ?? '');
            $svgMedia = $svgSha !== '' ? $this->resolveMedia($svgSha, '') : ['id' => 0, 'url' => ''];

            if ($svgMedia['id'] > 0 && $svgMedia['url'] !== '') {
                $settings['selected_icon'] = [
                    'value' => ['id' => (int) $svgMedia['id'], 'url' => (string) $svgMedia['url']],
                    'library' => 'svg',
                ];
            } elseif (!empty($node['svg']['markup'])) {
                $cleanSvg = AssetStore::sanitizeSvg((string) $node['svg']['markup']);
                if ($cleanSvg !== '') {
                    $stored = $this->assets->storeBase64Asset($svgSha, base64_encode($cleanSvg), 'image/svg+xml', $title);
                    if ($stored !== null && (int) ($stored['id'] ?? 0) > 0 && !empty($stored['url'])) {
                        $settings['selected_icon'] = [
                            'value' => ['id' => (int) $stored['id'], 'url' => (string) $stored['url']],
                            'library' => 'svg',
                        ];
                    } else {
                        // Inline SVG Flexbox container fallback (never put raw <svg> inside selected_icon['value'])
                        $iconW = max(16, (int) ($node['svg']['width'] ?? 32));
                        $iconH = max(16, (int) ($node['svg']['height'] ?? 32));
                        $children = [
                            $this->wrapElement('widget', 'html', [
                                'html' => sprintf(
                                    '<div class="f2e-inline-svg" style="display:inline-flex;align-items:center;justify-content:center;width:%dpx;height:%dpx;line-height:0;">%s</div>',
                                    $iconW,
                                    $iconH,
                                    $cleanSvg
                                ),
                            ], [], []),
                            $this->wrapElement('widget', 'text-editor', [
                                'editor' => '<h4 style="margin:0 0 6px 0;">' . self::escapeHtml($title) . '</h4>'
                                    . ($desc !== '' ? '<p style="margin:0;">' . self::escapeHtml($desc) . '</p>' : ''),
                                'align' => $pos === 'left' ? 'left' : 'center',
                            ], [], []),
                        ];
                        return $this->wrapElement('container', null, [
                            'container_type' => 'flex',
                            'flex_direction' => $pos === 'left' ? 'row' : 'column',
                            'flex_align_items' => $pos === 'left' ? 'flex-start' : 'center',
                            'flex_gap' => ['unit' => 'px', 'size' => 12, 'column' => '12', 'row' => '12', 'isLinked' => true],
                        ], [], $children, true);
                    }
                } else {
                    $settings['selected_icon'] = ['value' => 'fas fa-star', 'library' => 'fa-solid'];
                }
            } else {
                // Check raster fallback: emit image-box instead of putting PNG/WebP into library => 'svg'
                $rasterMedia = $this->resolveNodeMedia($node, ['raster', 'image', 'style']);
                if ($rasterMedia['id'] > 0 || $rasterMedia['url'] !== '') {
                    $finalWidgetType = 'image-box';
                    $settings['image'] = $rasterMedia;
                } else {
                    $settings['selected_icon'] = ['value' => 'fas fa-star', 'library' => 'fa-solid'];
                }
            }
        }

        return $this->wrapElement('widget', $finalWidgetType, $settings, $globals, []);
    }

    /** @param array<string,mixed> $node @param array<string,mixed> $nodes @return array<string,mixed> */
    private function buildIconList(array $node, array $nodes): array
    {
        $rawItems = $node['content']['iconList'] ?? [];
        $listData = [];
        if (is_array($rawItems) && !empty($rawItems)) {
            foreach ($rawItems as $idx => $it) {
                $txt = is_array($it) ? (string) ($it['text'] ?? '') : (string) $it;
                if (trim($txt) === '') continue;
                $listData[] = [
                    '_id' => $this->nextId(),
                    'text' => $txt,
                    'selected_icon' => ['value' => 'fas fa-circle', 'library' => 'fa-solid'],
                ];
            }
        }
        if (empty($listData)) {
            $texts = array_map(static fn (array $n): string => (string) ($n['text']['characters'] ?? ''), $this->collectSubtreeTexts($node, $nodes));
            foreach ($texts as $idx => $t) {
                $cleanText = preg_replace('/^[\x{2713}\x{2714}\x{2022}\x{00b7}\x{25cf}\x{25cb}\x{2013}\x{2014}\-*]\s*/u', '', trim($t));
                if ($cleanText === '') continue;
                $listData[] = [
                    '_id' => $this->nextId(),
                    'text' => $cleanText,
                    'selected_icon' => ['value' => 'fas fa-circle', 'library' => 'fa-solid'],
                ];
            }
        }
        if (empty($listData)) {
            $listData = [
                ['_id' => $this->nextId(), 'text' => 'Item 1', 'selected_icon' => ['value' => 'fas fa-check', 'library' => 'fa-solid']],
                ['_id' => $this->nextId(), 'text' => 'Item 2', 'selected_icon' => ['value' => 'fas fa-check', 'library' => 'fa-solid']],
            ];
        }

        $isRow = (($node['layout']['direction'] ?? 'column') === 'row') || ((int) ($node['layout']['width'] ?? 0) > 600);
        $gap = max(12, (int) ($node['layout']['gap'] ?? 24));
        $color = (string) ($node['text']['color'] ?? '#FFFFFF');

        $globals = [];
        $settings = [
            'icon_list' => $listData,
            'view' => $isRow ? 'inline' : 'traditional',
            'space_between' => ['unit' => 'px', 'size' => $gap, 'sizes' => []],
            'icon_size' => ['unit' => 'px', 'size' => 6, 'sizes' => []],
        ];

        $this->bindColor($settings, $globals, 'icon_color', $color);
        $this->bindColor($settings, $globals, 'text_color', $color);

        $textConfig = is_array($node['text'] ?? null) ? $node['text'] : [];
        if (empty($textConfig['fontFamily'])) {
            $texts = $this->collectSubtreeTexts($node, $nodes);
            if (!empty($texts[0]['text']) && is_array($texts[0]['text'])) {
                $textConfig = $texts[0]['text'];
            }
        }
        $this->bindTypography($settings, $globals, 'icon_typography', $textConfig, (array) ($node['responsive'] ?? []));

        return $this->wrapElement('widget', 'icon-list', $settings, $globals, []);
    }

    /** @param array<string,mixed> $node @param array<string,mixed> $nodes @return array<string,mixed> */
    private function buildNestedAccordion(array $node, array $nodes): array
    {
        $items = [];
        $panels = [];
        $extractedItems = is_array($node['content']['accordionItems'] ?? null) ? $node['content']['accordionItems'] : [];
        $rawChildIds = is_array($node['children'] ?? null) ? $node['children'] : [];
        $childIds = [];
        foreach ($rawChildIds as $rcid) {
            $cNode = $nodes[(string) $rcid] ?? null;
            if (!is_array($cNode)) {
                continue;
            }
            $cw = (string) ($cNode['widget'] ?? '');
            if (in_array($cw, ['icon', 'divider', 'spacer', 'skip'], true)) {
                continue;
            }
            $childIds[] = $rcid;
        }
        $count = !empty($extractedItems) ? count($extractedItems) : count($childIds);

        $firstTitleTypo = null;
        $activeTitleColor = null;
        $normalTitleColor = null;
        $firstBodyTypo = null;
        $firstBodyText = '';
        $rowPadding = null;
        $rowBorderWidth = null;
        $rowBorderColor = null;

        for ($i = 0; $i < $count; $i++) {
            $cid = $childIds[$i] ?? null;
            $child = ($cid !== null && isset($nodes[(string) $cid]) && is_array($nodes[(string) $cid])) ? $nodes[(string) $cid] : null;
            $ext = isset($extractedItems[$i]) && is_array($extractedItems[$i]) ? $extractedItems[$i] : null;
            $texts = $child ? $this->collectSubtreeTexts($child, $nodes) : [];

            $titleTypo = is_array($ext['titleTypography'] ?? null) ? $ext['titleTypography'] : (is_array($texts[0]['text'] ?? null) ? $texts[0]['text'] : null);
            $bodyTypo = is_array($ext['bodyTypography'] ?? null) ? $ext['bodyTypography'] : (is_array($texts[1]['text'] ?? null) ? $texts[1]['text'] : null);

            $title = (string) ($ext['title'] ?? $texts[0]['text']['characters'] ?? $child['content']['name'] ?? ('Item #' . ($i + 1)));
            $bodyText = (string) ($ext['body'] ?? '');
            if ($bodyText === '' && count($texts) > 1) {
                $bodyParts = [];
                for ($tIdx = 1; $tIdx < count($texts); $tIdx++) {
                    $bt = trim((string) ($texts[$tIdx]['text']['characters'] ?? ''));
                    if ($bt !== '') $bodyParts[] = $bt;
                }
                $bodyText = implode("\n", $bodyParts);
            }

            if ($titleTypo) {
                if (!$firstTitleTypo) $firstTitleTypo = $titleTypo;
                if ($i === 0 && !empty($titleTypo['color']) && !$activeTitleColor) {
                    $activeTitleColor = (string) $titleTypo['color'];
                } elseif ($i > 0 && !empty($titleTypo['color']) && !$normalTitleColor) {
                    $normalTitleColor = (string) $titleTypo['color'];
                }
            }
            if ($bodyTypo && !$firstBodyTypo) $firstBodyTypo = $bodyTypo;
            if ($bodyText !== '' && $firstBodyText === '') $firstBodyText = $bodyText;

            $pad = is_array($ext['padding'] ?? null) ? $ext['padding'] : (is_array($child['layout']['padding'] ?? null) ? $child['layout']['padding'] : null);
            if ($pad && !$rowPadding && (!empty($pad['top']) || !empty($pad['bottom']))) {
                $rowPadding = $pad;
            }
            $bw = is_array($ext['borderWidth'] ?? null) ? $ext['borderWidth'] : (is_array($child['style']['borderWidth'] ?? null) ? $child['style']['borderWidth'] : null);
            $bc = (string) ($ext['borderColor'] ?? $child['style']['borderColor'] ?? '');
            if ($bw && $bc !== '' && !$rowBorderWidth) {
                $rowBorderWidth = $bw;
                $rowBorderColor = $bc;
            }

            $items[] = ['_id' => $this->nextId(), 'item_title' => $title];
            $effectiveBody = $bodyText !== '' ? $bodyText : ($firstBodyText !== '' ? $firstBodyText : $title);
            $bTypo = $bodyTypo ?? $firstBodyTypo ?? ['fontFamily' => 'Inter', 'fontWeight' => '400', 'fontSize' => 16, 'lineHeight' => 24, 'color' => 'rgba(0, 0, 0, 0.7)'];

            $textWidget = $this->wrapElement('widget', 'text-editor', [
                'editor' => '<p style="margin:0;">' . self::escapeHtml($effectiveBody) . '</p>',
                'align' => 'left',
                'text_color' => (string) ($bTypo['color'] ?? 'rgba(0, 0, 0, 0.7)'),
                'typography_typography' => 'custom',
                'typography_font_family' => (string) ($bTypo['fontFamily'] ?? 'Inter'),
                'typography_font_weight' => (string) ($bTypo['fontWeight'] ?? '400'),
                'typography_font_size' => ['unit' => 'px', 'size' => (int) ($bTypo['fontSize'] ?? 16), 'sizes' => []],
                'typography_line_height' => ['unit' => 'px', 'size' => (int) ($bTypo['lineHeight'] ?? 24), 'sizes' => []],
                '_title' => $title,
            ], [], []);

            $innerWrap = $this->wrapElement('container', null, [
                'container_type' => 'flex',
                'flex_direction' => 'column',
                'margin' => ['unit' => 'px', 'top' => '0', 'right' => '0', 'bottom' => '0', 'left' => '0', 'isLinked' => false],
                'padding' => ['unit' => 'px', 'top' => '0', 'right' => '0', 'bottom' => (string) ($rowPadding['bottom'] ?? 20), 'left' => '48', 'isLinked' => false],
            ], [], [$textWidget], true);

            $panel = $this->wrapElement('container', null, [
                '_title' => 'item #' . ($i + 1),
                'content_width' => 'full',
                'margin' => ['unit' => 'px', 'top' => '0', 'right' => '0', 'bottom' => '0', 'left' => '0', 'isLinked' => false],
                'padding' => ['unit' => 'px', 'top' => '0', 'right' => '0', 'bottom' => '0', 'left' => '0', 'isLinked' => false],
            ], [], [$innerWrap], true);
            $panel['isLocked'] = true;
            $panels[] = $panel;
        }

        $settings = [
            'items' => $items,
            'accordion_item_title_position_horizontal' => 'stretch',
            'accordion_item_title_icon_position' => 'end',
            'faq_schema' => '',
            'content_border_border' => 'none',
            'accordion_padding' => [
                'unit' => 'px',
                'top' => (string) ($rowPadding['top'] ?? 20),
                'right' => (string) ($rowPadding['right'] ?? 0),
                'bottom' => (string) ($rowPadding['bottom'] ?? 20),
                'left' => (string) ($rowPadding['left'] ?? 0),
                'isLinked' => false,
            ],
        ];

        if ($rowBorderWidth && $rowBorderColor) {
            $settings['accordion_border_normal_border'] = 'solid';
            $settings['accordion_border_normal_width'] = [
                'unit' => 'px',
                'top' => (string) ($rowBorderWidth['top'] ?? 0),
                'right' => (string) ($rowBorderWidth['right'] ?? 0),
                'bottom' => (string) ($rowBorderWidth['bottom'] ?? 1),
                'left' => (string) ($rowBorderWidth['left'] ?? 0),
                'isLinked' => false,
            ];
            $settings['accordion_border_normal_color'] = $rowBorderColor;
        }
        if ($firstTitleTypo) {
            $settings['title_typography_typography'] = 'custom';
            $settings['title_typography_font_family'] = (string) ($firstTitleTypo['fontFamily'] ?? 'Inter');
            $settings['title_typography_font_weight'] = (string) ($firstTitleTypo['fontWeight'] ?? '600');
            $settings['title_typography_font_size'] = ['unit' => 'px', 'size' => (int) ($firstTitleTypo['fontSize'] ?? 20), 'sizes' => []];
        }
        if ($normalTitleColor || $activeTitleColor) {
            $settings['normal_title_color'] = $normalTitleColor ?: ($activeTitleColor ?: '#000000');
            $settings['active_title_color'] = $activeTitleColor ?: ($normalTitleColor ?: '#16A34A');
            $settings['normal_icon_color'] = $normalTitleColor ?: '#475569';
            $settings['active_icon_color'] = $activeTitleColor ?: '#16A34A';
        }

        return $this->wrapElement('widget', 'nested-accordion', $settings, [], $panels);
    }

    /** @param array<string,mixed> $node @param array<string,mixed> $nodes @return array<string,mixed> */
    private function buildNestedTabs(array $node, array $nodes): array
    {
        $tabs = [];
        $panels = [];
        foreach ((array) ($node['children'] ?? []) as $cid) {
            $child = $nodes[(string) $cid] ?? null;
            if (!is_array($child)) {
                continue;
            }
            $tabs[] = ['_id' => $this->nextId(), 'tab_title' => (string) ($child['content']['name'] ?? 'Tab')];
            $panel = $this->buildContainer($child, $nodes, false);
            $panel['isInner'] = true;
            $panels[] = $panel;
        }
        return $this->wrapElement('widget', 'nested-tabs', ['tabs' => $tabs], [], $panels);
    }

    /** @param array<string,mixed> $node @param array<string,mixed> $nodes @return array<string,mixed> */
    private function buildGalleryOrCarousel(array $node, array $nodes, string $wType): array
    {
        $imgs = [];
        foreach ($this->collectSubtreeImages($node, $nodes) as $img) {
            $resolved = $this->resolveMedia((string) ($img['sha256'] ?? ''), (string) ($img['dataUri'] ?? ''));
            if ($resolved['id'] > 0 || $resolved['url'] !== '') {
                $imgs[] = $resolved;
            }
        }
        $isCarousel = str_contains($wType, 'carousel');
        $finalWidget = $isCarousel ? 'image-carousel' : 'image-gallery';
        $settings = $isCarousel
            ? ['carousel' => $imgs, 'slides_to_show' => '3', 'navigation' => 'both']
            : ['wp_gallery' => $imgs, 'gallery_columns' => '3', 'open_lightbox' => 'yes'];
        return $this->wrapElement('widget', $finalWidget, $settings, [], []);
    }

    /** @param array<string,mixed> $node @param array<string,mixed> $nodes @return array<string,mixed> */
    private function buildTestimonial(array $node, array $nodes): array
    {
        $texts = array_map(static fn (array $n): string => (string) ($n['text']['characters'] ?? ''), $this->collectSubtreeTexts($node, $nodes));
        usort($texts, static fn (string $a, string $b): int => strlen($b) <=> strlen($a));
        $imgs = $this->collectSubtreeImages($node, $nodes);
        return $this->wrapElement('widget', 'testimonial', [
            'testimonial_content' => $texts[0] ?? 'Great service and design.',
            'testimonial_name' => $texts[1] ?? (string) ($node['content']['name'] ?? 'Client'),
            'testimonial_job' => $texts[2] ?? 'Customer',
            'testimonial_image' => !empty($imgs[0]) ? $this->resolveMedia((string) ($imgs[0]['sha256'] ?? ''), (string) ($imgs[0]['dataUri'] ?? '')) : ['id' => 0, 'url' => ''],
        ], [], []);
    }

    /** @param array<string,mixed> $node @return array<string,mixed> */
    private function buildStarRating(array $node): array
    {
        return $this->wrapElement('widget', 'star-rating', [
            'rating_scale' => '5',
            'rating' => 5,
            'star_style' => 'star_fontawesome',
        ], [], []);
    }

    /** @param array<string,mixed> $node @param array<string,mixed> $nodes @return array<string,mixed> */
    private function buildSocialIcons(array $node, array $nodes): array
    {
        $platforms = ['facebook', 'twitter', 'x', 'instagram', 'linkedin', 'youtube', 'tiktok', 'github', 'telegram', 'whatsapp'];
        $list = [];
        foreach ((array) ($node['children'] ?? []) as $cid) {
            $child = $nodes[(string) $cid] ?? null;
            if (!is_array($child)) {
                continue;
            }
            $name = strtolower((string) ($child['content']['name'] ?? ''));
            $matched = 'link';
            foreach ($platforms as $p) {
                if (str_contains($name, $p)) {
                    $matched = $p;
                    break;
                }
            }
            $iconVal = ($matched === 'x' || $matched === 'twitter')
                ? 'fab fa-x-twitter'
                : ($matched === 'link' ? 'fas fa-share-alt' : 'fab fa-' . $matched);
            $list[] = [
                '_id' => $this->nextId(),
                'social_icon' => ['value' => $iconVal, 'library' => $matched === 'link' ? 'fa-solid' : 'fa-brands'],
                'link' => ['url' => (string) ($child['link'] ?? '#'), 'is_external' => 'true', 'nofollow' => ''],
            ];
        }
        return $this->wrapElement('widget', 'social-icons', ['social_icon_list' => $list], [], []);
    }

    /** @param array<string,mixed> $node @param array<string,mixed> $nodes @return array<string,mixed> */
    private function buildCounter(array $node, array $nodes): array
    {
        $textNodes = $this->collectSubtreeTexts($node, $nodes);
        $numNode = null;
        $labelNode = null;
        foreach ($textNodes as $tn) {
            $chars = (string) ($tn['text']['characters'] ?? '');
            if ($numNode === null && preg_match('/\d/', $chars) === 1) {
                $numNode = $tn;
            } elseif ($labelNode === null) {
                $labelNode = $tn;
            }
        }
        if ($numNode === null) {
            $numNode = !empty($node['text']) ? $node : ($textNodes[0] ?? $node);
        }

        $numTypo = is_array($numNode['text'] ?? null) ? $numNode['text'] : (is_array($node['text'] ?? null) ? $node['text'] : []);
        $numText = trim((string) ($numTypo['characters'] ?? '100'));
        $labelText = ($labelNode !== null && $labelNode !== $numNode)
            ? trim((string) ($labelNode['text']['characters'] ?? ''))
            : '';

        preg_match('/^([^0-9+-]*?)([0-9.,]+)(.*)$/', $numText, $m);
        $prefix = (string) ($m[1] ?? '');
        $rawDigits = str_replace(',', '', (string) ($m[2] ?? '100'));
        $suffix = (string) ($m[3] ?? '');
        if (preg_match('/^(0+)(?=\d)/', $rawDigits, $lz) === 1) {
            $prefix .= $lz[1];
        }

        $globals = [];
        $settings = [
            'starting_number' => 0,
            'ending_number' => (float) $rawDigits,
            'prefix' => $prefix,
            'suffix' => $suffix,
            'title' => $labelText,
        ];

        $numColor = (string) ($numTypo['color'] ?? $numTypo['gradient']['color2'] ?? $numTypo['gradient']['color1'] ?? '');
        if ($numColor !== '') {
            $this->bindColor($settings, $globals, 'number_color', $numColor);
        }
        if (!empty($numTypo)) {
            $this->bindTypography($settings, $globals, 'typography_number', $numTypo, (array) ($numNode['responsive'] ?? $node['responsive'] ?? []));
        }
        if ($labelNode !== null && is_array($labelNode['text'] ?? null)) {
            $lblTypo = $labelNode['text'];
            if (!empty($lblTypo['color'])) {
                $this->bindColor($settings, $globals, 'title_color', (string) $lblTypo['color']);
            }
            $this->bindTypography($settings, $globals, 'typography_title', $lblTypo, (array) ($labelNode['responsive'] ?? $node['responsive'] ?? []));
        }

        $gradCss = (string) ($numTypo['gradientCss'] ?? '');
        if ($gradCss === '' && is_array($numTypo['gradient'] ?? null)) {
            $g = $numTypo['gradient'];
            $gradCss = sprintf('linear-gradient(%ddeg, %s %d%%, %s %d%%)', (int) ($g['angle'] ?? 180), (string) ($g['color1'] ?? '#A9C35E'), (int) ($g['stop1'] ?? 0), (string) ($g['color2'] ?? '#038132'), (int) ($g['stop2'] ?? 100));
        }
        if ($gradCss !== '') {
            $settings['custom_css'] = "selector .elementor-counter-number-wrapper, selector .elementor-counter-number {\n  background: {$gradCss};\n  background-clip: text;\n  -webkit-background-clip: text;\n  -webkit-text-fill-color: transparent;\n}";
        }

        return $this->wrapElement('widget', 'counter', $settings, $globals, []);
    }

    // ── Elementor Pro Widget Builders ──

    /** @param array<string,mixed> $node @param array<string,mixed> $nodes @return array<string,mixed> */
    private function buildProForm(array $node, array $nodes): array
    {
        $fields = [];
        $submitLabel = (string) ($node['content']['submitLabel'] ?? 'Send Message');

        if (!empty($node['content']['formFields']) && is_array($node['content']['formFields'])) {
            foreach ($node['content']['formFields'] as $idx => $f) {
                $fType = (string) ($f['type'] ?? 'text');
                $label = (string) ($f['label'] ?? ('Field ' . ($idx + 1)));
                $placeholder = (string) ($f['placeholder'] ?? $label);
                $fields[] = [
                    '_id' => $this->nextId(),
                    'custom_id' => 'field_' . ($idx + 1),
                    'field_type' => $fType,
                    'field_label' => $label,
                    'placeholder' => $placeholder,
                    'required' => !empty($f['required']) ? 'true' : '',
                    'width' => '100',
                ];
            }
        } else {
            $idx = 1;
            foreach ((array) ($node['children'] ?? []) as $cid) {
                $child = $nodes[(string) $cid] ?? null;
                if (!is_array($child)) {
                    continue;
                }
                if (($child['widget'] ?? '') === 'button') {
                    $submitLabel = (string) ($child['content']['characters'] ?? $child['content']['name'] ?? $submitLabel);
                    continue;
                }
                $texts = array_map(static fn (array $n): string => (string) ($n['text']['characters'] ?? ''), $this->collectSubtreeTexts($child, $nodes));
                $label = $texts[0] ?? (string) ($child['content']['name'] ?? 'Field ' . $idx);
                $lower = strtolower($label);
                $type = 'text';
                if (str_contains($lower, 'email') || str_contains($lower, 'mail')) {
                    $type = 'email';
                } elseif (str_contains($lower, 'phone') || str_contains($lower, 'tel')) {
                    $type = 'tel';
                } elseif (str_contains($lower, 'message') || ((int) ($child['layout']['height'] ?? 0)) >= 90) {
                    $type = 'textarea';
                }
                $fields[] = [
                    '_id' => $this->nextId(),
                    'custom_id' => 'field_' . $idx,
                    'field_type' => $type,
                    'field_label' => $label,
                    'placeholder' => $texts[1] ?? $label,
                    'required' => (str_contains($lower, 'email') || str_contains($lower, 'name')) ? 'true' : '',
                    'width' => '100',
                ];
                $idx++;
            }
        }
        if ($fields === []) {
            $fields[] = ['_id' => $this->nextId(), 'custom_id' => 'email', 'field_type' => 'email', 'field_label' => 'Email', 'placeholder' => 'your@email.com', 'required' => 'true', 'width' => '100'];
        }
        return $this->wrapElement('widget', 'form', [
            'form_name' => (string) ($node['content']['name'] ?? 'Figma Form'),
            'form_fields' => $fields,
            'button_text' => $submitLabel,
            'button_size' => 'md',
        ], [], []);
    }

    /** @param array<string,mixed> $node @param array<string,mixed> $nodes @return array<string,mixed> */
    private function buildProNavMenu(array $node, array $nodes): array
    {
        $rawItems = $node['content']['menuItems'] ?? [];
        $items = [];
        if (is_array($rawItems) && !empty($rawItems)) {
            foreach ($rawItems as $m) {
                $name = is_array($m) ? (string) ($m['name'] ?? '') : (string) $m;
                if (trim($name) !== '') {
                    $items[] = trim($name);
                }
            }
        }
        if (empty($items)) {
            $items = array_map(static fn (array $n): string => (string) ($n['text']['characters'] ?? ''), $this->collectSubtreeTexts($node, $nodes));
        }
        if (empty($items)) {
            $items = ['Trang chủ', 'Giới thiệu', 'Dịch vụ', 'Liên hệ'];
        }

        $menuId = $this->ensureNavMenuExists($items);

        $isProActive = defined('ELEMENTOR_PRO_VERSION') || class_exists('\\ElementorPro\\Plugin');

        if ($isProActive) {
            $settings = [
                'layout' => (($node['layout']['direction'] ?? 'row') === 'column') ? 'vertical' : 'horizontal',
                'align_items' => 'center',
                'pointer' => 'underline',
                '_f2e_menu_items' => $items,
            ];
            if ($menuId > 0) {
                $settings['menu'] = (string) $menuId;
            }
            if (!empty($node['text']['color'])) {
                $settings['color_menu_item'] = (string) $node['text']['color'];
            }
            if (!empty($node['text']['fontSize'])) {
                $settings['typography_font_size'] = ['unit' => 'px', 'size' => (int) $node['text']['fontSize'], 'sizes' => []];
            }
            return $this->wrapElement('widget', 'nav-menu', $settings, [], []);
        }

        // Elementor Free fallback: Create a clean horizontal flex container with styled nav links
        $linkElements = [];
        foreach ($items as $idx => $label) {
            $linkElements[] = $this->wrapElement('widget', 'heading', [
                'title' => sprintf('<a href="#" style="text-decoration:none;color:inherit;">%s</a>', self::escapeHtml($label)),
                'header_size' => 'custom',
                'align' => 'left',
                'title_color' => $node['text']['color'] ?? '#1E293B',
                'typography_font_size' => ['unit' => 'px', 'size' => (int) ($node['text']['fontSize'] ?? 15), 'sizes' => []],
                'typography_font_weight' => (string) ($node['text']['fontWeight'] ?? '500'),
                '_element_width' => 'auto',
                '_flex_size' => 'none',
            ], [], []);
        }

        return $this->wrapElement('container', null, [
            'container_type' => 'flex',
            'flex_direction' => 'row',
            'flex_wrap' => 'nowrap',
            'flex_justify_content' => 'center',
            'flex_align_items' => 'center',
            'space_between_elements' => ['unit' => 'px', 'size' => max(8, (int) ($node['layout']['gap'] ?? 24)), 'sizes' => []],
            '_element_width' => 'auto',
            '_flex_size' => 'none',
        ], [], $linkElements);
    }

    /**
     * Finds or automatically creates a WordPress Navigation Menu matching the extracted items.
     * @param list<string> $items
     * @return int Menu term ID, or 0 if unavailable
     */
    private function ensureNavMenuExists(array $items): int
    {
        if (empty($items) || !function_exists('wp_get_nav_menus')) {
            return 0;
        }

        $menus = wp_get_nav_menus();
        if (!empty($menus)) {
            foreach ($menus as $m) {
                if (in_array(strtolower($m->name), ['main menu', 'header menu', 'menu 1', 'primary'], true)) {
                    return (int) $m->term_id;
                }
            }
            return (int) $menus[0]->term_id;
        }

        if (function_exists('wp_create_nav_menu')) {
            $menu_id = wp_create_nav_menu('Main Menu');
            if (!is_wp_error($menu_id) && $menu_id && function_exists('wp_update_nav_menu_item')) {
                foreach ($items as $index => $itemName) {
                    if (trim($itemName) === '') continue;
                    wp_update_nav_menu_item((int) $menu_id, 0, [
                        'menu-item-title' => $itemName,
                        'menu-item-url' => '#',
                        'menu-item-type' => 'custom',
                        'menu-item-status' => 'publish',
                        'menu-item-position' => $index + 1,
                    ]);
                }
                return (int) $menu_id;
            }
        }

        return 0;
    }

    /** @param array<string,mixed> $node @param array<string,mixed> $nodes @return array<string,mixed> */
    private function buildProCta(array $node, array $nodes): array
    {
        $texts = array_map(static fn (array $n): string => (string) ($n['text']['characters'] ?? ''), $this->collectSubtreeTexts($node, $nodes));
        $imgs = $this->collectSubtreeImages($node, $nodes);
        return $this->wrapElement('widget', 'call-to-action', [
            'skin' => 'classic',
            'title' => $texts[0] ?? (string) ($node['content']['name'] ?? 'Call to Action'),
            'description' => $texts[1] ?? '',
            'button' => $texts[2] ?? 'Learn More',
            'bg_image' => !empty($imgs[0]) ? $this->resolveMedia((string) ($imgs[0]['sha256'] ?? ''), (string) ($imgs[0]['dataUri'] ?? '')) : ['id' => 0, 'url' => ''],
        ], [], []);
    }

    /** @param array<string,mixed> $node @param array<string,mixed> $nodes @return array<string,mixed> */
    private function buildProPriceTable(array $node, array $nodes): array
    {
        $texts = array_map(static fn (array $n): string => (string) ($n['text']['characters'] ?? ''), $this->collectSubtreeTexts($node, $nodes));
        $priceText = '49';
        foreach ($texts as $t) {
            if (preg_match('/[$€£₫¥]|\d+\s*\/\s*(mo|yr|tháng|năm)/i', $t) === 1 || preg_match('/^\$?\d+$/', trim($t)) === 1) {
                $priceText = preg_replace('/[^0-9.]/', '', $t) ?: '49';
                break;
            }
        }
        $features = [];
        foreach (array_slice($texts, 2) as $ft) {
            $features[] = [
                '_id' => $this->nextId(),
                'item_text' => $ft,
                'selected_icon' => ['value' => 'fas fa-check', 'library' => 'fa-solid'],
            ];
        }
        return $this->wrapElement('widget', 'price-table', [
            'heading' => $texts[0] ?? (string) ($node['content']['name'] ?? 'Pro Plan'),
            'sub_heading' => $texts[1] ?? 'Monthly',
            'price' => $priceText,
            'currency_symbol' => 'dollar',
            'period' => 'Monthly',
            'features_list' => $features,
            'button_text' => end($texts) ?: 'Get Started',
        ], [], []);
    }

    /** @param array<string,mixed> $node @param array<string,mixed> $nodes @return array<string,mixed> */
    private function buildProFlipBox(array $node, array $nodes): array
    {
        $texts = array_map(static fn (array $n): string => (string) ($n['text']['characters'] ?? ''), $this->collectSubtreeTexts($node, $nodes));
        return $this->wrapElement('widget', 'flip-box', [
            'title_text_a' => $texts[0] ?? (string) ($node['content']['name'] ?? 'Front Title'),
            'description_text_a' => $texts[1] ?? '',
            'title_text_b' => $texts[2] ?? $texts[0] ?? 'Back Title',
            'description_text_b' => $texts[3] ?? $texts[1] ?? '',
            'button_text' => $texts[4] ?? 'Read More',
        ], [], []);
    }

    /** @param array<string,mixed> $node @param array<string,mixed> $nodes @return array<string,mixed> */
    private function buildProSlides(array $node, array $nodes): array
    {
        $slides = [];
        foreach ((array) ($node['children'] ?? []) as $cid) {
            $child = $nodes[(string) $cid] ?? null;
            if (!is_array($child)) {
                continue;
            }
            $texts = array_map(static fn (array $n): string => (string) ($n['text']['characters'] ?? ''), $this->collectSubtreeTexts($child, $nodes));
            $imgs = $this->collectSubtreeImages($child, $nodes);
            $slides[] = [
                '_id' => $this->nextId(),
                'heading' => $texts[0] ?? (string) ($child['content']['name'] ?? 'Slide Heading'),
                'description' => $texts[1] ?? '',
                'button_text' => $texts[2] ?? 'Learn More',
                'background_color' => (string) ($child['style']['background'] ?? '#1E293B'),
                'background_image' => !empty($imgs[0]) ? $this->resolveMedia((string) ($imgs[0]['sha256'] ?? ''), (string) ($imgs[0]['dataUri'] ?? '')) : ['id' => 0, 'url' => ''],
            ];
        }
        return $this->wrapElement('widget', 'slides', [
            'slides' => $slides,
            'slides_height' => ['unit' => 'px', 'size' => max(360, (int) ($node['layout']['height'] ?? 500)), 'sizes' => []],
        ], [], []);
    }

    /** @param array<string,mixed> $node @return array<string,mixed> */
    private function buildProLoopGrid(array $node): array
    {
        $cols = max(1, (int) ($node['layout']['columns'] ?? 3));
        return $this->wrapElement('widget', 'loop-grid', [
            'template_id' => '',
            'posts_per_page' => 6,
            'columns' => (string) $cols,
            'row_gap' => ['unit' => 'px', 'size' => (int) ($node['layout']['gap'] ?? 24), 'sizes' => []],
        ], [], []);
    }

    // ── Helpers ──

    /**
     * @param array<string,mixed> $settings
     * @param array<string,string> $globals
     * @param array<string,mixed> $style
     */
    private function applyBoxStyle(array &$settings, array &$globals, array $style): void
    {
        if (is_array($style['gradient'] ?? null)) {
            $g = $style['gradient'];
            $settings['background_background'] = 'gradient';
            $settings['background_gradient_type'] = (string) ($g['type'] ?? 'linear');
            $settings['background_color'] = (string) ($g['color1'] ?? '#000000');
            $settings['background_color_stop'] = ['unit' => '%', 'size' => (int) ($g['stop1'] ?? 0), 'sizes' => []];
            $settings['background_color_b'] = (string) ($g['color2'] ?? '#FFFFFF');
            $settings['background_color_b_stop'] = ['unit' => '%', 'size' => (int) ($g['stop2'] ?? 100), 'sizes' => []];
            $settings['background_gradient_angle'] = ['unit' => 'deg', 'size' => (int) ($g['angle'] ?? 180), 'sizes' => []];
        } elseif (!empty($style['background'])) {
            $settings['background_background'] = 'classic';
            $this->bindColor($settings, $globals, 'background_color', (string) $style['background']);
        }

        if (!empty($style['backgroundImage']) || !empty($style['backgroundImageDataUri'])) {
            $media = $this->resolveStyleBgMedia($style);
            if ($media['url'] !== '' || $media['id'] > 0) {
                $settings['background_background'] = 'classic';
                $settings['background_image'] = $media;
                $settings['background_size'] = 'cover';
                $settings['background_position'] = 'center center';
                $settings['background_repeat'] = 'no-repeat';
            }
        }

        if (is_array($style['radius'] ?? null)) {
            $settings['border_radius'] = $this->boxObject($style['radius']);
        }
        if (is_array($style['borderWidth'] ?? null) && !empty($style['borderColor'])) {
            $settings['border_border'] = 'solid';
            $settings['border_width'] = $this->boxObject($style['borderWidth']);
            $this->bindColor($settings, $globals, 'border_color', (string) $style['borderColor']);
        }

        // Linear Gradient Border Solution:
        // Automatically injects custom_css for dual-clipping gradient borders
        if (is_array($style['borderGradient'] ?? null) && is_array($style['borderWidth'] ?? null)) {
            $g = $style['borderGradient'];
            $bw = max(1, (int) ($style['borderWidth']['top'] ?? 1));
            $gradCss = (!empty($style['devModeBorderImage']) && strpos((string) $style['devModeBorderImage'], 'linear-gradient') === 0)
                ? (string) $style['devModeBorderImage']
                : sprintf('linear-gradient(%ddeg, %s %d%%, %s %d%%)', (int) ($g['angle'] ?? 135), (string) ($g['color1'] ?? '#000000'), (int) ($g['stop1'] ?? 0), (string) ($g['color2'] ?? '#FFFFFF'), (int) ($g['stop2'] ?? 100));
            $bgSolid = !empty($style['background']) ? (string) $style['background'] : '#ffffff';
            $bgLayer = is_array($style['gradient'] ?? null)
                ? sprintf('linear-gradient(%ddeg, %s %d%%, %s %d%%)', (int) ($style['gradient']['angle'] ?? 180), (string) ($style['gradient']['color1'] ?? '#FFFFFF'), (int) ($style['gradient']['stop1'] ?? 0), (string) ($style['gradient']['color2'] ?? '#FFFFFF'), (int) ($style['gradient']['stop2'] ?? 100))
                : "linear-gradient({$bgSolid}, {$bgSolid})";

            if (is_array($style['radius'] ?? null)) {
                $snippet = "selector {\n  border: {$bw}px solid transparent !important;\n  background-image: {$bgLayer}, {$gradCss} !important;\n  background-origin: border-box !important;\n  background-clip: padding-box, border-box !important;\n}";
            } else {
                $snippet = "selector {\n  border: {$bw}px solid !important;\n  border-image: {$gradCss} 1 !important;\n}";
            }
            $settings['custom_css'] = (!empty($settings['custom_css']) ? $settings['custom_css'] . "\n" : '') . $snippet;
        }
        if (is_array($style['boxShadow'] ?? null)) {
            $settings['box_shadow_box_shadow_type'] = 'yes';
            $settings['box_shadow_box_shadow'] = $style['boxShadow'];
        }
    }

    /**
     * @param array<string,mixed> $settings
     * @param array<string,string> $globals
     */
    private function bindColor(array &$settings, array &$globals, string $control, string $value): void
    {
        $key = GlobalStyles::normalizeColorKey($value);
        if (isset($this->colorGlobals[$key])) {
            $globals[$control] = 'globals/colors?id=' . $this->colorGlobals[$key];
        }
        $settings[$control] = $value;
    }

    /**
     * @param array<string,mixed> $settings
     * @param array<string,string> $globals
     * @param array<string,mixed> $text
     * @param array<string,mixed> $responsive
     */
    private function bindTypography(array &$settings, array &$globals, string $prefix, array $text, array $responsive): void
    {
        if ($text === []) {
            return;
        }
        $family = (string) ($text['fontFamily'] ?? '');
        $size = (float) ($text['fontSize'] ?? 16);
        $weight = (string) ($text['fontWeight'] ?? '400');

        if ($family !== '') {
            $tKey = GlobalStyles::normalizeTypoKey($family, $size, $weight);
            if (isset($this->typoGlobals[$tKey])) {
                $globals[$prefix . '_typography'] = 'globals/typography?id=' . $this->typoGlobals[$tKey];
            }
        }

        $settings[$prefix . '_typography'] = 'custom';
        if ($family !== '') {
            $settings[$prefix . '_font_family'] = $family;
        }
        $settings[$prefix . '_font_weight'] = $weight;
        $settings[$prefix . '_font_size'] = ['unit' => 'px', 'size' => $size, 'sizes' => []];

        $tabletSize = $responsive['tablet']['fontSize'] ?? ($size > 24 ? round($size * 0.82) : null);
        $mobileSize = $responsive['mobile']['fontSize'] ?? ($size > 20 ? max(18.0, round($size * 0.68)) : null);
        if ($tabletSize !== null) {
            $settings[$prefix . '_font_size_tablet'] = ['unit' => 'px', 'size' => (float) $tabletSize, 'sizes' => []];
        }
        if ($mobileSize !== null) {
            $settings[$prefix . '_font_size_mobile'] = ['unit' => 'px', 'size' => (float) $mobileSize, 'sizes' => []];
        }
        if (isset($text['lineHeight']) && is_numeric($text['lineHeight'])) {
            $settings[$prefix . '_line_height'] = [
                'unit' => (string) ($text['lineHeightUnit'] ?? 'px'),
                'size' => (float) $text['lineHeight'],
                'sizes' => [],
            ];
        }
        if (isset($text['letterSpacing']) && is_numeric($text['letterSpacing'])) {
            $settings[$prefix . '_letter_spacing'] = [
                'unit' => 'px',
                'size' => (float) $text['letterSpacing'],
                'sizes' => [],
            ];
        }
        if (!empty($text['transform'])) {
            $settings[$prefix . '_text_transform'] = (string) $text['transform'];
        }
    }

    private static function escapeHtml(string $value): string
    {
        return function_exists('esc_html')
            ? esc_html($value)
            : htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    /**
     * @param array<string,mixed> $style
     * @return array{id:int,url:string}
     */
    private function resolveStyleBgMedia(array $style): array
    {
        $bgRef = (string) ($style['backgroundImage'] ?? '');
        $bgData = (string) ($style['backgroundImageDataUri'] ?? '');
        $isDirectUrl = preg_match('/^(https?:\/\/|data:image\/)/i', $bgRef) === 1;
        $sha = $isDirectUrl ? '' : $bgRef;
        $fallback = $bgData !== '' ? $bgData : ($isDirectUrl ? $bgRef : '');
        return ($sha !== '' || $fallback !== '') ? $this->resolveMedia($sha, $fallback) : ['id' => 0, 'url' => ''];
    }

    /**
     * @param array<string,mixed> $node
     * @param list<string> $order
     * @return array{id:int,url:string}
     */
    private function resolveNodeMedia(array $node, array $order = ['image', 'raster', 'style', 'svg']): array
    {
        foreach ($order as $source) {
            if ($source === 'style') {
                $style = is_array($node['style'] ?? null) ? $node['style'] : [];
                if (!empty($style['backgroundImage']) || !empty($style['backgroundImageDataUri'])) {
                    $media = $this->resolveStyleBgMedia($style);
                    if ($media['id'] > 0 || $media['url'] !== '') {
                        return $media;
                    }
                }
                continue;
            }
            $slot = $node[$source] ?? null;
            if (!is_array($slot)) {
                continue;
            }
            $sha = (string) ($slot['sha256'] ?? '');
            $fallback = (string) ($slot['dataUri'] ?? '');
            if ($sha !== '' || $fallback !== '') {
                $media = $this->resolveMedia($sha, $fallback);
                if ($media['id'] > 0 || $media['url'] !== '') {
                    return $media;
                }
            }
        }
        return ['id' => 0, 'url' => ''];
    }

    /** @return array{id:int,url:string} */
    private function resolveMedia(string $sha256, string $fallbackUrl = ''): array
    {
        if ($sha256 !== '') {
            if (isset($this->attachmentMap[$sha256])) {
                return [
                    'id' => (int) ($this->attachmentMap[$sha256]['id'] ?? 0),
                    'url' => (string) ($this->attachmentMap[$sha256]['url'] ?? ''),
                ];
            }
            $stored = $this->assets->findBySha256($sha256);
            if ($stored !== null) {
                return $stored;
            }
        }
        return ['id' => 0, 'url' => $fallbackUrl];
    }

    /** @param array<string,mixed> $node @param array<string,mixed> $nodes @return list<array<string,mixed>> */
    private function collectSubtreeTexts(array $node, array $nodes): array
    {
        if (!empty($node['extractedTexts']) && is_array($node['extractedTexts']) && empty($node['children'])) {
            $out = [];
            foreach ($node['extractedTexts'] as $idx => $t) {
                if (is_array($t) && !empty($t['characters'])) {
                    $out[] = [
                        'id' => ((string) ($node['id'] ?? 'n')) . '-txt-' . $idx,
                        'text' => $t,
                        'responsive' => $node['responsive'] ?? [],
                    ];
                }
            }
            if ($out !== []) {
                return $out;
            }
        }
        $out = [];
        $walk = function (array $n) use (&$walk, &$out, $nodes): void {
            if (!empty($n['text']['characters'])) {
                $out[] = $n;
            }
            foreach ((array) ($n['children'] ?? []) as $cid) {
                if (isset($nodes[(string) $cid]) && is_array($nodes[(string) $cid])) {
                    $walk($nodes[(string) $cid]);
                }
            }
        };
        $walk($node);
        return $out;
    }

    /** @param array<string,mixed> $node @param array<string,mixed> $nodes @return list<array<string,mixed>> */
    private function collectSubtreeImages(array $node, array $nodes): array
    {
        $out = [];
        $walk = function (array $n) use (&$walk, &$out, $nodes): void {
            if (is_array($n['image'] ?? null) && (!empty($n['image']['sha256']) || !empty($n['image']['dataUri']))) {
                $out[] = $n['image'];
            } elseif (is_array($n['raster'] ?? null) && (!empty($n['raster']['sha256']) || !empty($n['raster']['dataUri']))) {
                $out[] = $n['raster'];
            } elseif (!empty($n['style']['backgroundImage']) || !empty($n['style']['backgroundImageDataUri'])) {
                $bgRef = (string) ($n['style']['backgroundImage'] ?? '');
                $bgData = (string) ($n['style']['backgroundImageDataUri'] ?? '');
                $isDirectUrl = preg_match('/^(https?:\/\/|data:image\/)/i', $bgRef) === 1;
                $out[] = [
                    'sha256' => $isDirectUrl ? '' : $bgRef,
                    'dataUri' => $bgData !== '' ? $bgData : ($isDirectUrl ? $bgRef : ''),
                ];
            }
            foreach ((array) ($n['children'] ?? []) as $cid) {
                if (isset($nodes[(string) $cid]) && is_array($nodes[(string) $cid])) {
                    $walk($nodes[(string) $cid]);
                }
            }
        };
        $walk($node);
        return $out;
    }

    /** @param array<string,mixed> $node @param array<string,mixed> $text */
    private function inferHeadingLevel(array $node, array $text): string
    {
        $name = strtolower((string) ($node['content']['rawName'] ?? $node['content']['name'] ?? ''));
        if (preg_match('/\bh([1-6])\b/', $name, $m) === 1) {
            return 'h' . $m[1];
        }
        $size = (float) ($text['fontSize'] ?? 24);
        return match (true) {
            $size >= 44 => 'h1',
            $size >= 32 => 'h2',
            $size >= 24 => 'h3',
            $size >= 20 => 'h4',
            default => 'h5',
        };
    }

    private function normalizeAlign(string $align): string
    {
        $a = strtolower(trim($align));
        return $a === 'justified' ? 'justify' : ($a !== '' ? $a : 'left');
    }

    /** @param array<string,mixed> $layout @return array<string,mixed> */
    private function gapObject(array $layout): array
    {
        $main = max(0, (int) ($layout['gap'] ?? 0));
        $cross = (!empty($layout['wrap']) && isset($layout['rowGap'])) ? max(0, (int) $layout['rowGap']) : $main;
        $isRow = ($layout['direction'] ?? 'column') === 'row';
        $col = $isRow ? $main : $cross;
        $row = $isRow ? $cross : $main;
        return [
            'unit' => 'px',
            'size' => $row,
            'column' => (string) $col,
            'row' => (string) $row,
            'isLinked' => $col === $row,
        ];
    }

    /** @param array<string,mixed> $box @return array<string,mixed> */
    private function boxObject(array $box): array
    {
        $t = (int) ($box['top'] ?? 0);
        $r = (int) ($box['right'] ?? 0);
        $b = (int) ($box['bottom'] ?? 0);
        $l = (int) ($box['left'] ?? 0);
        return [
            'unit' => 'px',
            'top' => (string) $t,
            'right' => (string) $r,
            'bottom' => (string) $b,
            'left' => (string) $l,
            'isLinked' => (bool) ($box['isLinked'] ?? ($t === $r && $r === $b && $b === $l)),
        ];
    }

    /** @param array<string,mixed> $box @return array<string,int> */
    private function scaleBox(array $box, float $factor, int $cap): array
    {
        $out = [];
        foreach (['top', 'right', 'bottom', 'left'] as $side) {
            $out[$side] = min($cap, (int) round(((int) ($box[$side] ?? 0)) * $factor));
        }
        return $out;
    }

    /**
     * @param array<string,mixed> $settings
     * @param array<string,string> $globals
     * @param list<array<string,mixed>> $elements
     * @return array<string,mixed>
     */
    private function wrapElement(string $elType, ?string $widgetType, array $settings, array $globals, array $elements, bool $isInner = false): array
    {
        if ($globals !== []) {
            $settings['__globals__'] = $globals;
        }
        $el = [
            'id' => $this->nextId(),
            'elType' => $elType,
            'isInner' => $isInner,
            'settings' => $settings,
            'elements' => $elements,
        ];
        if ($widgetType !== null) {
            $el['widgetType'] = $widgetType;
        }
        return $el;
    }

    private function nextId(): string
    {
        for ($i = 0; $i < 50; $i++) {
            $id = substr(bin2hex(random_bytes(4)), 0, 7);
            if (!isset($this->usedIds[$id])) {
                $this->usedIds[$id] = true;
                return $id;
            }
        }
        return substr(md5((string) microtime(true)), 0, 7);
    }
}
