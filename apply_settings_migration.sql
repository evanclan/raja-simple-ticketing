-- =====================================================
-- STEP 1: Create settings table and configure policies
-- =====================================================

-- Create settings table to store email templates and other app settings
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
DROP POLICY IF EXISTS "Allow authenticated users to read settings" ON public.settings;
CREATE POLICY "Allow authenticated users to read settings"
  ON public.settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only authenticated users can insert/update settings
DROP POLICY IF EXISTS "Allow authenticated users to manage settings" ON public.settings;
CREATE POLICY "Allow authenticated users to manage settings"
  ON public.settings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create index for faster key lookups
CREATE INDEX IF NOT EXISTS settings_key_idx ON public.settings(key);

-- =====================================================
-- STEP 2: Insert/Update your custom templates
-- =====================================================

-- Entry Pass Subject
INSERT INTO public.settings (key, value)
VALUES ('entry_pass_subject', 'Your Entry Pass')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- Entry Pass HTML (Your Custom Template)
INSERT INTO public.settings (key, value)
VALUES ('entry_pass_html', '<div>
  <p>こんにちは！<br>
  RaJA Halloween Cruise 事務局です。</p>

  <p>このたびは「RaJA Halloween Cruise 2025」にお申込みいただき、誠にありがとうございます。</p>

  <p>当日の受付では、WEBチケット画面のご提示をお願いいたします。<br>
  （チケットURLは本メール内に記載しております）</p>

  <p>--------------------------------------------<br>
  【WEBチケットのご利用方法】<br>
  ・当日、受付でチケット画面をスタッフにお見せください。<br>
  ・スタッフが管理者用PINを入力し、確認後ご入場いただけます。<br>
  ・スムーズな受付のため、事前にチケットのURLが正しく開けるかご確認ください。<br>
  ※スクリーンショットでのご提示は無効となります。必ずブラウザ上でご提示ください。<br>
  --------------------------------------------</p>

  <p>また、注意事項や当日のスケジュールをまとめたPDFを添付しています。<br>
  集合時間・受付場所などの詳細も記載されておりますので、必ずご確認ください。</p>

  <p>※出港時刻：10月31日（木）19:00<br>
  船は定刻通りに出航いたします。<br>
  恐れ入りますが、遅刻された場合はご乗船いただけませんので、<br>
  お時間に余裕をもってお越しくださいませ。<br>
  なお、お車でお越しのは際は、近隣のコインパーキングをご利用ください。</p>

  <p>スタッフ一同、みなさまにお会いできることを心より楽しみにしております。<br>
  ぜひ仮装して、一緒にスペシャルなハロウィンナイトをお過ごしください！</p>
</div>')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- Entry Pass Plain Text (Auto-generated from your HTML)
INSERT INTO public.settings (key, value)
VALUES ('entry_pass_text', 'こんにちは！
RaJA Halloween Cruise 事務局です。

このたびは「RaJA Halloween Cruise 2025」にお申込みいただき、誠にありがとうございます。

当日の受付では、WEBチケット画面のご提示をお願いいたします。
（チケットURLは本メール内に記載しております）

--------------------------------------------
【WEBチケットのご利用方法】
・当日、受付でチケット画面をスタッフにお見せください。
・スタッフが管理者用PINを入力し、確認後ご入場いただけます。
・スムーズな受付のため、事前にチケットのURLが正しく開けるかご確認ください。
※スクリーンショットでのご提示は無効となります。必ずブラウザ上でご提示ください。
--------------------------------------------

また、注意事項や当日のスケジュールをまとめたPDFを添付しています。
集合時間・受付場所などの詳細も記載されておりますので、必ずご確認ください。

※出港時刻：10月31日（木）19:00
船は定刻通りに出航いたします。
恐れ入りますが、遅刻された場合はご乗船いただけませんので、
お時間に余裕をもってお越しくださいませ。
なお、お車でお越しのは際は、近隣のコインパーキングをご利用ください。

スタッフ一同、みなさまにお会いできることを心より楽しみにしております。
ぜひ仮装して、一緒にスペシャルなハロウィンナイトをお過ごしください！

{{url}}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- Entry Pass PDF URL (empty by default)
INSERT INTO public.settings (key, value)
VALUES ('entry_pass_pdf_url', '')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- =====================================================
-- STEP 3: Insert default payment confirmation templates
-- =====================================================

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

-- =====================================================
-- DONE! Check results
-- =====================================================

-- View all settings
SELECT key, LEFT(value, 50) as value_preview, updated_at
FROM public.settings
ORDER BY key;

