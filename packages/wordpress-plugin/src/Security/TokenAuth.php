<?php

declare(strict_types=1);

namespace F2EBridge\Security;

/**
 * Manages the site-scoped Connection Token used by the Figma Desktop Plugin.
 * Stores an HMAC-SHA256 hash verification check and allows 1-click regeneration.
 */
final class TokenAuth
{
    public const OPTION_TOKEN = 'f2e_bridge_connection_token';
    public const OPTION_TOKEN_HASH = 'f2e_bridge_connection_token_hash';
    public const OPTION_USER_ID = 'f2e_bridge_paired_user_id';

    public function getOrCreateToken(): string
    {
        $existing = get_option(self::OPTION_TOKEN, '');
        if (is_string($existing) && strlen($existing) >= 32) {
            $hash = get_option(self::OPTION_TOKEN_HASH, '');
            if (!is_string($hash) || $hash === '') {
                update_option(self::OPTION_TOKEN_HASH, $this->hashToken($existing), false);
            }
            return $existing;
        }
        return $this->regenerateToken();
    }

    public function regenerateToken(): string
    {
        $raw = 'f2e_live_' . bin2hex(random_bytes(24));
        update_option(self::OPTION_TOKEN, $raw, false);
        update_option(self::OPTION_TOKEN_HASH, $this->hashToken($raw), false);
        if (function_exists('get_current_user_id') && get_current_user_id() > 0) {
            update_option(self::OPTION_USER_ID, (int) get_current_user_id(), false);
        }
        return $raw;
    }

    private const RATE_LIMIT_MAX_FAILURES = 15;
    private const RATE_LIMIT_WINDOW_SECS = 600;

    private function rateLimitKey(): string
    {
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
        return 'f2e_auth_fail_' . substr(hash('sha256', $ip), 0, 16);
    }

    public function isRateLimited(): bool
    {
        if (!function_exists('get_transient')) {
            return false;
        }
        return (int) get_transient($this->rateLimitKey()) >= self::RATE_LIMIT_MAX_FAILURES;
    }

    private function recordFailedAttempt(): void
    {
        if (!function_exists('get_transient') || !function_exists('set_transient')) {
            return;
        }
        $key = $this->rateLimitKey();
        $count = (int) get_transient($key);
        set_transient($key, $count + 1, self::RATE_LIMIT_WINDOW_SECS);
    }

    public function verifyBearerHeader(?string $authHeader): bool
    {
        if ($this->isRateLimited()) {
            return false;
        }
        if (!is_string($authHeader) || $authHeader === '') {
            return false;
        }
        if (preg_match('/^Bearer\s+(\S+)$/i', trim($authHeader), $matches) !== 1) {
            $this->recordFailedAttempt();
            return false;
        }
        $provided = $matches[1];
        $storedHash = get_option(self::OPTION_TOKEN_HASH, '');
        if (is_string($storedHash) && $storedHash !== '') {
            $ok = hash_equals($storedHash, $this->hashToken($provided));
            if (!$ok) {
                $this->recordFailedAttempt();
            }
            return $ok;
        }

        // Legacy fallback if hash was not yet populated
        $stored = get_option(self::OPTION_TOKEN, '');
        if (!is_string($stored) || $stored === '') {
            $this->recordFailedAttempt();
            return false;
        }
        $valid = hash_equals($stored, $provided);
        if ($valid) {
            update_option(self::OPTION_TOKEN_HASH, $this->hashToken($stored), false);
        } else {
            $this->recordFailedAttempt();
        }
        return $valid;
    }

    public function hashToken(string $token): string
    {
        $key = function_exists('wp_salt') ? (string) wp_salt('auth') : 'f2e_bridge_auth_key';
        return hash_hmac('sha256', $token, $key);
    }

    private function isValidPairedUser(int $userId): bool
    {
        if ($userId <= 0) {
            return false;
        }
        if (function_exists('get_userdata') && function_exists('user_can')) {
            $user = get_userdata($userId);
            return $user !== false && user_can($user, 'upload_files') && user_can($user, 'edit_pages');
        }
        return true;
    }

    public function getPairedUserId(): int
    {
        $uid = (int) get_option(self::OPTION_USER_ID, 0);
        if ($this->isValidPairedUser($uid)) {
            return $uid;
        }
        if (function_exists('get_users')) {
            $admins = get_users([
                'role' => 'administrator',
                'orderby' => 'ID',
                'order' => 'ASC',
                'number' => 5,
                'fields' => 'ID',
            ]);
            if (is_array($admins)) {
                foreach ($admins as $adminId) {
                    $candidate = (int) $adminId;
                    if ($this->isValidPairedUser($candidate)) {
                        return $candidate;
                    }
                }
            }
        }
        if (function_exists('get_userdata') && function_exists('user_can')) {
            return $this->isValidPairedUser(1) ? 1 : 0;
        }
        return 1;
    }
}
