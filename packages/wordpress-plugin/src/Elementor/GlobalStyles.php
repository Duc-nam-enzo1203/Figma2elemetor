<?php

declare(strict_types=1);

namespace F2EBridge\Elementor;

/**
 * Synchronizes Figma Color Variables & Text Styles into Elementor's Active Kit
 * (`_elementor_page_settings`: `custom_colors` and `custom_typography`) and builds
 * lookup indices so `TranspilerV3` can bind `__globals__` automatically.
 */
final class GlobalStyles
{
    public const KIT_META_KEY = '_elementor_page_settings';

    /**
     * @param list<array<string,mixed>> $colors
     * @param list<array<string,mixed>> $typography
     * @param array<string,mixed> $themeStyles
     * @param array<string,mixed> $generalSettings
     * @return array<string,mixed>
     */
    public function sync(array $colors, array $typography, array $themeStyles = [], array $generalSettings = []): array
    {
        if (!function_exists('get_option') || !function_exists('update_post_meta')) {
            return [
                'kitId' => 0,
                'colors' => ['created' => [], 'updated' => []],
                'typography' => ['created' => [], 'updated' => []],
                'themeStyles' => [],
                'settings' => [],
            ];
        }

        $kitId = (int) get_option('elementor_active_kit', 0);
        if ($kitId <= 0) {
            return [
                'kitId' => 0,
                'colors' => ['created' => [], 'updated' => []],
                'typography' => ['created' => [], 'updated' => []],
                'themeStyles' => [],
                'settings' => [],
            ];
        }

        $settings = get_post_meta($kitId, self::KIT_META_KEY, true);
        $settings = is_array($settings) ? $settings : [];

        $colorReport = $this->mergeColors($settings, $colors);
        $typoReport = $this->mergeTypography($settings, $typography);
        $themeStyleReport = $this->mergeThemeStyles($settings, $themeStyles);
        $settingsReport = $this->mergeGeneralSettings($settings, $generalSettings);

        update_post_meta($kitId, self::KIT_META_KEY, $settings);
        $this->clearElementorCache();

        return [
            'kitId' => $kitId,
            'colors' => $colorReport,
            'typography' => $typoReport,
            'themeStyles' => $themeStyleReport,
            'settings' => $settingsReport,
        ];
    }

    /**
     * @return array<string,string> Map of normalized uppercase hex color -> Elementor Global Color ID
     */
    public function colorIndex(): array
    {
        $settings = $this->getKitSettings();
        $index = [];
        foreach (['system_colors', 'custom_colors'] as $group) {
            foreach ((array) ($settings[$group] ?? []) as $entry) {
                if (!is_array($entry) || empty($entry['_id']) || empty($entry['color'])) {
                    continue;
                }
                $key = self::normalizeColorKey((string) $entry['color']);
                $index[$key] ??= (string) $entry['_id'];
            }
        }
        return $index;
    }

    /**
     * @return array<string,string> Map of "family|size|weight" -> Elementor Global Typography ID
     */
    public function typographyIndex(): array
    {
        $settings = $this->getKitSettings();
        $index = [];
        foreach (['system_typography', 'custom_typography'] as $group) {
            foreach ((array) ($settings[$group] ?? []) as $entry) {
                if (!is_array($entry) || empty($entry['_id'])) {
                    continue;
                }
                $family = (string) ($entry['typography_font_family'] ?? '');
                $size = $entry['typography_font_size']['size'] ?? null;
                $weight = (string) ($entry['typography_font_weight'] ?? '400');
                if ($family !== '' && is_numeric($size)) {
                    $key = self::normalizeTypoKey($family, (float) $size, $weight);
                    $index[$key] ??= (string) $entry['_id'];
                }
            }
        }
        return $index;
    }

    public static function normalizeColorKey(string $color): string
    {
        return strtoupper(preg_replace('/\s+/', '', trim($color)) ?? '');
    }

    public static function normalizeTypoKey(string $family, float $size, string $weight): string
    {
        return strtolower(trim($family)) . '|' . round($size, 1) . '|' . trim($weight);
    }

    /**
     * Post-processes compiled Elementor v3 elements on the server to bind verified
     * Active Kit Global Colors and Global Typography (`__globals__`) while preserving
     * exact Figma hex colors and font values as inline fallbacks.
     *
     * @param list<array<string,mixed>> $elements
     * @param array<string,string>|null $customColorIndex Optional precomputed color index
     * @param array<string,string>|null $customTypoIndex Optional precomputed typography index
     * @return list<array<string,mixed>>
     */
    public function bindGlobalsToElements(array $elements, ?array $customColorIndex = null, ?array $customTypoIndex = null): array
    {
        $colors = $customColorIndex ?? $this->colorIndex();
        $typos = $customTypoIndex ?? $this->typographyIndex();
        if ($colors === [] && $typos === []) {
            return $elements;
        }

        $colorFields = [
            'background_color',
            'title_color',
            'text_color',
            'button_text_color',
            'button_background_color',
            'border_color',
            'color',
            'primary_color',
            'secondary_color',
            'icon_color',
            'heading_color',
            'description_color',
        ];

        $typoPrefixes = [
            'typography',
            'title_typography',
            'description_typography',
            'heading_typography',
            'content_typography',
            'icon_typography',
            'button_typography',
        ];

        $walk = function (array $list) use (&$walk, $colors, $typos, $colorFields, $typoPrefixes): array {
            foreach ($list as $i => $el) {
                if (!is_array($el)) {
                    continue;
                }
                $settings = is_array($el['settings'] ?? null) ? $el['settings'] : [];
                $globals = is_array($settings['__globals__'] ?? null) ? $settings['__globals__'] : [];

                if ($colors !== []) {
                    foreach ($colorFields as $field) {
                        if (!empty($settings[$field]) && is_string($settings[$field]) && empty($globals[$field])) {
                            $norm = self::normalizeColorKey($settings[$field]);
                            if (isset($colors[$norm])) {
                                $globals[$field] = 'globals/colors?id=' . $colors[$norm];
                            }
                        }
                    }
                }

                if ($typos !== []) {
                    foreach ($typoPrefixes as $prefix) {
                        $globalKey = $prefix . '_typography';
                        $familyKey = $prefix . '_font_family';
                        $sizeKey = $prefix . '_font_size';
                        $weightKey = $prefix . '_font_weight';
                        if (
                            empty($globals[$globalKey]) &&
                            !empty($settings[$familyKey]) &&
                            is_string($settings[$familyKey]) &&
                            isset($settings[$sizeKey]['size']) &&
                            is_numeric($settings[$sizeKey]['size'])
                        ) {
                            $weight = (string) ($settings[$weightKey] ?? '400');
                            $tKey = self::normalizeTypoKey($settings[$familyKey], (float) $settings[$sizeKey]['size'], $weight);
                            if (isset($typos[$tKey])) {
                                $globals[$globalKey] = 'globals/typography?id=' . $typos[$tKey];
                            }
                        }
                    }
                }

                if ($globals !== []) {
                    $settings['__globals__'] = $globals;
                }
                $el['settings'] = $settings;

                if (!empty($el['elements']) && is_array($el['elements'])) {
                    $el['elements'] = $walk($el['elements']);
                }
                $list[$i] = $el;
            }
            return $list;
        };

        return $walk($elements);
    }

    /** @return array<string,mixed> */
    private function getKitSettings(): array
    {
        if (!function_exists('get_option') || !function_exists('get_post_meta')) {
            return [];
        }
        $kitId = (int) get_option('elementor_active_kit', 0);
        if ($kitId <= 0) {
            return [];
        }
        $settings = get_post_meta($kitId, self::KIT_META_KEY, true);
        return is_array($settings) ? $settings : [];
    }

    /**
     * @param array<string,mixed> $settings
     * @param list<array<string,mixed>> $colors
     * @return array<string,mixed>
     */
    private function mergeColors(array &$settings, array $colors): array
    {
        $custom = is_array($settings['custom_colors'] ?? null) ? $settings['custom_colors'] : [];
        $created = [];
        $updated = [];

        foreach ($colors as $c) {
            $name = trim((string) ($c['name'] ?? ''));
            $val = self::normalizeColorKey((string) ($c['value'] ?? ''));
            if ($name === '' || $val === '') {
                continue;
            }
            $slug = $this->slugify($name);
            $foundIdx = null;
            foreach ($custom as $i => $item) {
                if (is_array($item) && ((string) ($item['_id'] ?? '') === $slug || $this->slugify((string) ($item['title'] ?? '')) === $slug)) {
                    $foundIdx = $i;
                    break;
                }
            }
            if ($foundIdx !== null) {
                if (self::normalizeColorKey((string) ($custom[$foundIdx]['color'] ?? '')) !== $val) {
                    $custom[$foundIdx]['color'] = $val;
                    $updated[] = $name;
                }
            } else {
                $custom[] = [
                    '_id' => $slug,
                    'title' => $name,
                    'color' => $val,
                ];
                $created[] = $name;
            }
        }

        $settings['custom_colors'] = array_values($custom);

        // Map system colors (Primary, Secondary, Text, Accent) if recognized
        $system = is_array($settings['system_colors'] ?? null) ? $settings['system_colors'] : [];
        $knownSystemIds = ['primary', 'secondary', 'text', 'accent'];
        foreach ($colors as $c) {
            $role = strtolower(trim((string) ($c['role'] ?? '')));
            if (in_array($role, $knownSystemIds, true)) {
                $val = self::normalizeColorKey((string) ($c['value'] ?? ''));
                $matchedSys = false;
                foreach ($system as &$sysItem) {
                    if (is_array($sysItem) && ($sysItem['_id'] ?? '') === $role) {
                        $sysItem['color'] = $val;
                        $matchedSys = true;
                    }
                }
                unset($sysItem);
                if (!$matchedSys) {
                    $system[] = [
                        '_id' => $role,
                        'title' => ucfirst($role),
                        'color' => $val,
                    ];
                }
                $updated[] = "System " . ucfirst($role);
            }
        }
        if (!empty($system)) {
            $settings['system_colors'] = $system;
        }

        return ['created' => $created, 'updated' => $updated, 'total' => count($custom)];
    }

    /**
     * @param array<string,mixed> $settings
     * @param list<array<string,mixed>> $typography
     * @return array<string,mixed>
     */
    private function mergeTypography(array &$settings, array $typography): array
    {
        $custom = is_array($settings['custom_typography'] ?? null) ? $settings['custom_typography'] : [];
        $created = [];
        $updated = [];

        foreach ($typography as $t) {
            $name = trim((string) ($t['name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $slug = $this->slugify($name);
            $fields = [
                'typography_typography' => 'custom',
                'typography_font_family' => (string) ($t['fontFamily'] ?? 'Inter'),
                'typography_font_weight' => (string) ($t['fontWeight'] ?? '400'),
                'typography_font_size' => [
                    'unit' => 'px',
                    'size' => (float) ($t['fontSize'] ?? 16),
                    'sizes' => [],
                ],
            ];
            if (isset($t['lineHeight']) && is_numeric($t['lineHeight'])) {
                $fields['typography_line_height'] = [
                    'unit' => (string) ($t['lineHeightUnit'] ?? 'px'),
                    'size' => (float) $t['lineHeight'],
                    'sizes' => [],
                ];
            }
            if (isset($t['letterSpacing']) && is_numeric($t['letterSpacing'])) {
                $fields['typography_letter_spacing'] = [
                    'unit' => 'px',
                    'size' => (float) $t['letterSpacing'],
                    'sizes' => [],
                ];
            }

            $foundIdx = null;
            foreach ($custom as $i => $item) {
                if (is_array($item) && ((string) ($item['_id'] ?? '') === $slug || $this->slugify((string) ($item['title'] ?? '')) === $slug)) {
                    $foundIdx = $i;
                    break;
                }
            }

            if ($foundIdx !== null) {
                $custom[$foundIdx] = array_merge($custom[$foundIdx], $fields);
                $updated[] = $name;
            } else {
                $custom[] = array_merge(['_id' => $slug, 'title' => $name], $fields);
                $created[] = $name;
            }
        }

        $settings['custom_typography'] = array_values($custom);
        return ['created' => $created, 'updated' => $updated, 'total' => count($custom)];
    }

    /**
     * Synchronizes Theme Styles (Typography H1-H6/Body/Link, Buttons, Form Fields) into Active Kit.
     *
     * @param array<string,mixed> $settings
     * @param array<string,mixed> $themeStyles
     * @return array<string,mixed>
     */
    private function mergeThemeStyles(array &$settings, array $themeStyles): array
    {
        $updated = [];

        // 1. Theme Style: Typography (H1-H6, Body, Link)
        $typo = is_array($themeStyles['typography'] ?? null) ? $themeStyles['typography'] : [];
        foreach (['body', 'link', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as $tag) {
            $item = $typo[$tag] ?? null;
            if (!is_array($item)) {
                continue;
            }
            $prefix = "{$tag}_typography_";
            $settings[$prefix . 'typography'] = 'custom';
            if (!empty($item['fontFamily'])) {
                $settings[$prefix . 'font_family'] = (string) $item['fontFamily'];
            }
            if (isset($item['fontSize']) && is_numeric($item['fontSize'])) {
                $settings[$prefix . 'font_size'] = [
                    'unit' => 'px',
                    'size' => (float) $item['fontSize'],
                    'sizes' => [],
                ];
            }
            if (!empty($item['fontWeight'])) {
                $settings[$prefix . 'font_weight'] = (string) $item['fontWeight'];
            }
            if (isset($item['lineHeight']) && is_numeric($item['lineHeight'])) {
                $settings[$prefix . 'line_height'] = [
                    'unit' => (string) ($item['lineHeightUnit'] ?? 'px'),
                    'size' => (float) $item['lineHeight'],
                    'sizes' => [],
                ];
            }
            if (!empty($item['color'])) {
                $colorKey = ($tag === 'body') ? 'body_color' : (($tag === 'link') ? 'link_color' : "{$tag}_color");
                $settings[$colorKey] = self::normalizeColorKey((string) $item['color']);
            }
            $updated[] = strtoupper($tag);
        }

        // 2. Theme Style: Buttons
        $btn = is_array($themeStyles['buttons'] ?? null) ? $themeStyles['buttons'] : [];
        if (!empty($btn)) {
            $settings['button_typography_typography'] = 'custom';
            if (!empty($btn['typography']['fontFamily'])) {
                $settings['button_typography_font_family'] = (string) $btn['typography']['fontFamily'];
            }
            if (isset($btn['typography']['fontSize']) && is_numeric($btn['typography']['fontSize'])) {
                $settings['button_typography_font_size'] = [
                    'unit' => 'px',
                    'size' => (float) $btn['typography']['fontSize'],
                    'sizes' => [],
                ];
            }
            if (!empty($btn['typography']['fontWeight'])) {
                $settings['button_typography_font_weight'] = (string) $btn['typography']['fontWeight'];
            }
            if (!empty($btn['textColor'])) {
                $settings['button_text_color'] = self::normalizeColorKey((string) $btn['textColor']);
            }
            if (!empty($btn['backgroundColor'])) {
                $settings['button_background_color'] = self::normalizeColorKey((string) $btn['backgroundColor']);
            }
            if (isset($btn['borderRadius']) && is_array($btn['borderRadius'])) {
                $r = $btn['borderRadius'];
                $settings['button_border_radius'] = [
                    'unit' => 'px',
                    'top' => (float) ($r['top'] ?? 0),
                    'right' => (float) ($r['right'] ?? 0),
                    'bottom' => (float) ($r['bottom'] ?? 0),
                    'left' => (float) ($r['left'] ?? 0),
                    'isLinked' => true,
                ];
            }
            if (isset($btn['padding']) && is_array($btn['padding'])) {
                $p = $btn['padding'];
                $settings['button_padding'] = [
                    'unit' => 'px',
                    'top' => (float) ($p['top'] ?? 0),
                    'right' => (float) ($p['right'] ?? 0),
                    'bottom' => (float) ($p['bottom'] ?? 0),
                    'left' => (float) ($p['left'] ?? 0),
                    'isLinked' => false,
                ];
            }
            $updated[] = 'Buttons';
        }

        // 3. Theme Style: Form Fields
        $fields = is_array($themeStyles['formFields'] ?? null) ? $themeStyles['formFields'] : [];
        if (!empty($fields)) {
            $settings['form_fields_typography_typography'] = 'custom';
            if (!empty($fields['typography']['fontFamily'])) {
                $settings['form_fields_typography_font_family'] = (string) $fields['typography']['fontFamily'];
            }
            if (isset($fields['typography']['fontSize']) && is_numeric($fields['typography']['fontSize'])) {
                $settings['form_fields_typography_font_size'] = [
                    'unit' => 'px',
                    'size' => (float) $fields['typography']['fontSize'],
                    'sizes' => [],
                ];
            }
            if (!empty($fields['textColor'])) {
                $settings['form_fields_text_color'] = self::normalizeColorKey((string) $fields['textColor']);
            }
            if (!empty($fields['backgroundColor'])) {
                $settings['form_fields_background_color'] = self::normalizeColorKey((string) $fields['backgroundColor']);
            }
            if (!empty($fields['borderColor'])) {
                $settings['form_fields_border_color'] = self::normalizeColorKey((string) $fields['borderColor']);
            }
            if (isset($fields['borderRadius']) && is_array($fields['borderRadius'])) {
                $r = $fields['borderRadius'];
                $settings['form_fields_border_radius'] = [
                    'unit' => 'px',
                    'top' => (float) ($r['top'] ?? 0),
                    'right' => (float) ($r['right'] ?? 0),
                    'bottom' => (float) ($r['bottom'] ?? 0),
                    'left' => (float) ($r['left'] ?? 0),
                    'isLinked' => true,
                ];
            }
            if (isset($fields['padding']) && is_array($fields['padding'])) {
                $p = $fields['padding'];
                $settings['form_fields_padding'] = [
                    'unit' => 'px',
                    'top' => (float) ($p['top'] ?? 0),
                    'right' => (float) ($p['right'] ?? 0),
                    'bottom' => (float) ($p['bottom'] ?? 0),
                    'left' => (float) ($p['left'] ?? 0),
                    'isLinked' => false,
                ];
            }
            $updated[] = 'Form Fields';
        }

        return ['updated' => $updated];
    }

    /**
     * Synchronizes General Settings (Layout width, background color) into Active Kit.
     *
     * @param array<string,mixed> $settings
     * @param array<string,mixed> $general
     * @return array<string,mixed>
     */
    private function mergeGeneralSettings(array &$settings, array $general): array
    {
        $updated = [];
        $layout = is_array($general['layout'] ?? null) ? $general['layout'] : [];
        if (isset($layout['containerWidth']) && is_numeric($layout['containerWidth'])) {
            $w = (int) $layout['containerWidth'];
            if ($w >= 600 && $w <= 2560) {
                $settings['container_width'] = [
                    'unit' => 'px',
                    'size' => $w,
                    'sizes' => [],
                ];
                $updated[] = "Container Width ({$w}px)";
            }
        }

        $bg = is_array($general['background'] ?? null) ? $general['background'] : [];
        if (!empty($bg['color'])) {
            $settings['site_background_color'] = self::normalizeColorKey((string) $bg['color']);
            $updated[] = 'Site Background Color';
        }

        return ['updated' => $updated];
    }

    private function slugify(string $title): string
    {
        $slug = strtolower(trim($title));
        $slug = preg_replace('/[^a-z0-9]+/', '', $slug) ?? '';
        return substr($slug !== '' ? $slug : 'f2e' . bin2hex(random_bytes(3)), 0, 16);
    }

    private function clearElementorCache(): void
    {
        if (class_exists('Elementor\\Plugin')) {
            $plugin = \Elementor\Plugin::$instance ?? null;
            if (is_object($plugin) && isset($plugin->files_manager) && method_exists($plugin->files_manager, 'clear_cache')) {
                $plugin->files_manager->clear_cache();
            }
        }
    }
}
