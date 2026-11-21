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
     * @return array<string,mixed>
     */
    public function sync(array $colors, array $typography): array
    {
        if (!function_exists('get_option') || !function_exists('update_post_meta')) {
            return ['kitId' => 0, 'colors' => ['created' => [], 'updated' => []], 'typography' => ['created' => [], 'updated' => []]];
        }

        $kitId = (int) get_option('elementor_active_kit', 0);
        if ($kitId <= 0) {
            return ['kitId' => 0, 'colors' => ['created' => [], 'updated' => []], 'typography' => ['created' => [], 'updated' => []]];
        }

        $settings = get_post_meta($kitId, self::KIT_META_KEY, true);
        $settings = is_array($settings) ? $settings : [];

        $colorReport = $this->mergeColors($settings, $colors);
        $typoReport = $this->mergeTypography($settings, $typography);

        update_post_meta($kitId, self::KIT_META_KEY, $settings);
        $this->clearElementorCache();

        return [
            'kitId' => $kitId,
            'colors' => $colorReport,
            'typography' => $typoReport,
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
