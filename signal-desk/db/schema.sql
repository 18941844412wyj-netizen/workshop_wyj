-- users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- profiles（角色+权重+自定义角色+通知偏好）
CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT,
  weights JSONB NOT NULL DEFAULT '{"定价":3,"功能":3,"更新日志":3,"招聘":2,"营销活动":3,"合规条款":2}',
  custom_roles JSONB NOT NULL DEFAULT '[]',
  email_settings JSONB NOT NULL DEFAULT '{"enabled":true,"recipientEmails":[],"pushTime":"09:00","pushContent":{"includeTitle":true,"includeSummary":true,"includeAction":true,"includeLink":true}}',
  onboarded BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- targets（监控目标）
CREATE TABLE IF NOT EXISTS targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  track TEXT NOT NULL,
  collect_mode TEXT NOT NULL DEFAULT 'manual',
  schedule TEXT,
  monitor_status TEXT DEFAULT '监控中',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- snapshots（采集快照）
CREATE TABLE IF NOT EXISTS snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  html TEXT NOT NULL,
  text_content TEXT,
  version INT NOT NULL DEFAULT 1,
  captured_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_snapshots_target_captured ON snapshots(target_id, captured_at DESC);

-- intels（情报）
CREATE TABLE IF NOT EXISTS intels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_before_id UUID REFERENCES snapshots(id),
  snapshot_after_id UUID REFERENCES snapshots(id),
  labels JSONB NOT NULL DEFAULT '[]',
  priority TEXT NOT NULL,
  title TEXT NOT NULL,
  what_changed TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  action_general JSONB NOT NULL DEFAULT '{}',
  action_plan JSONB NOT NULL DEFAULT '{}',
  source_anchor JSONB NOT NULL DEFAULT '{"before":"","after":""}',
  status TEXT NOT NULL DEFAULT '未读',
  match_score NUMERIC DEFAULT 0,
  in_core_pool BOOLEAN DEFAULT FALSE,
  is_noise BOOLEAN DEFAULT FALSE,
  noise_type TEXT,
  analysis_status TEXT DEFAULT 'success',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_intels_user_created ON intels(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intels_user_status ON intels(user_id, status);

-- feedback（反馈）
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intel_id UUID NOT NULL REFERENCES intels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tags JSONB NOT NULL DEFAULT '[]',
  modules JSONB NOT NULL DEFAULT '[]',
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(intel_id, user_id)
);

-- chat_sessions（对话会话）
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT DEFAULT '新会话',
  ended BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- conv_messages（对话消息）
CREATE TABLE IF NOT EXISTS conv_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  reference_intel_ids JSONB DEFAULT '[]',
  reference_label TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conv_messages_session ON conv_messages(session_id, created_at ASC);

-- notifications（邮件推送去重）
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  intel_id UUID NOT NULL REFERENCES intels(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, intel_id)
);
