-- Create settings table to store email templates and other app settings
-- This allows settings to sync across devices
CREATE TABLE IF NOT EXISTS public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Policy: Only authenticated users can read settings
CREATE POLICY "Allow authenticated users to read settings"
  ON public.settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only authenticated users can insert/update settings
CREATE POLICY "Allow authenticated users to manage settings"
  ON public.settings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create index for faster key lookups
CREATE INDEX IF NOT EXISTS settings_key_idx ON public.settings(key);

-- Insert default email templates if they don't exist
INSERT INTO public.settings (key, value)
VALUES 
  ('email_tpl_subject', 'Payment confirmation'),
  ('email_tpl_html', '<div>
  <p>{{name}} 様</p>
  <p>お支払いを確認しました。ありがとうございます！</p>
  <p>領収書を添付しております。ご確認ください。</p>
  <p>This is a confirmation that we received your payment. Thank you!</p>
  <p>Please find your receipt attached to this email.</p>
</div>'),
  ('email_tpl_text', '{{name}} 様
お支払いを確認しました。ありがとうございます！
領収書を添付しております。ご確認ください。

This is a confirmation that we received your payment. Thank you!
Please find your receipt attached to this email.'),
  ('email_tpl_from', 'RaJA <no-reply@info.raja-international.com>')
ON CONFLICT (key) DO NOTHING;

