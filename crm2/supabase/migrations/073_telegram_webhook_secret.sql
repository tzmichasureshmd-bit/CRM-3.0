-- ============================================================
-- 073: Add webhook_secret column to telegram_bots
-- ============================================================
-- Adds a dedicated encrypted webhook_secret column so the
-- Telegram webhook handler can verify X-Telegram-Bot-Api-Secret-Token
-- without repurposing the last_error diagnostics column.
-- Safe to run even if 072 already added it (IF NOT EXISTS guard).
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'telegram_bots'
      AND column_name = 'webhook_secret'
  ) THEN
    ALTER TABLE telegram_bots ADD COLUMN webhook_secret TEXT;
    RAISE NOTICE '073: Added telegram_bots.webhook_secret';
  ELSE
    RAISE NOTICE '073: telegram_bots.webhook_secret already exists, skipping';
  END IF;
END $$;
