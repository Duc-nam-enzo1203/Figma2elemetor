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

    public function verifyBearerHeader(?string $authHeader): bool
    {
        if (!is_string($authHeader) || $authHeader === '') {
            return false;
        }
        if (preg_match('/^Bearer\s+(\S+)$/i', trim($authHeader), $matches) !== 1) {
            return false;
        }
        $provided = $matches[1];
        $storedHash = get_option(self::OPTION_TOKEN_HASH, '');
        if (is_string($storedHash) && $storedHash !== '') {
            return hash_equals($storedHash, $this->hashToken($provided));
        }

        // Legacy fallback if hash was not yet populated
        $stored = get_option(self::OPTION_TOKEN, '');
        if (!is_string($stored) || $stored === '') {
            return false;
        }
        $valid = hash_equals($stored, $provided);
        if ($valid) {
            update_option(self::OPTION_TOKEN_HASH, $this->hashToken($stored), false);
        }
        return $valid;
    }

    public function hashToken(string $token): string
    {
        $key = function_exists('wp_salt') ? (string) wp_salt('auth') : 'f2e_bridge_auth_key';
        return hash_hmac('sha256', $token, $key);
    }

    public function getPairedUserId(): int
    {
        $uid = (int) get_option(self::OPTION_USER_ID, 0);
        if ($uid > 0) {
            return $uid;
        }
        if (function_exists('get_users')) {
            $admins = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']);
            if (!empty($admins[0])) {
                return (int) $admins[0];
            }
        }
        return 1;
    }
}
