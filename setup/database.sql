-- ============================================================
-- CHATBOT STUDY - Master Database Setup Script
-- ============================================================
-- This script creates all tables, functions, indexes, and RLS
-- policies needed for the chatbot-study research toolkit.
--
-- IMPORTANT: This script is IDEMPOTENT - safe to run multiple times!
-- It uses CREATE IF NOT EXISTS, CREATE OR REPLACE, and DROP IF EXISTS
-- so you can re-run it whenever you pull updates from the repository.
--
-- Instructions:
-- 1. Create a new Supabase project at https://supabase.com
-- 2. Go to SQL Editor in your Supabase dashboard
-- 3. Paste this entire script and run it
-- 4. Create your first admin user using the SQL at the bottom
--
-- After pulling repository updates:
-- - Re-run this script to apply any new tables, functions, or policies
-- - Your existing data will NOT be affected
--
-- Compatible with: Supabase (PostgreSQL 15+)
-- ============================================================

-- ============================================================
-- SECTION 1: Extensions
-- ============================================================

-- Enable pgvector for embedding similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- SECTION 2: Core Tables
-- ============================================================

-- ------------------------------------------------------------
-- Users Table
-- ------------------------------------------------------------
-- Stores application users with access code authentication
CREATE TABLE IF NOT EXISTS value_graph_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT,
    access_code TEXT UNIQUE NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    strategy_type TEXT DEFAULT 'vertical' CHECK (strategy_type IN ('vertical', 'horizontal')),
    can_generate_surveys BOOLEAN DEFAULT FALSE,
    can_use_speech_patterns BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns if they don't exist (for existing databases)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'value_graph_users' AND column_name = 'can_generate_surveys') THEN
        ALTER TABLE value_graph_users ADD COLUMN can_generate_surveys BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'value_graph_users' AND column_name = 'can_use_speech_patterns') THEN
        ALTER TABLE value_graph_users ADD COLUMN can_use_speech_patterns BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Index for access code lookups
CREATE INDEX IF NOT EXISTS idx_users_access_code ON value_graph_users(access_code);

-- ------------------------------------------------------------
-- Chat Log Table
-- ------------------------------------------------------------
-- Stores all chat messages between users and the AI
CREATE TABLE IF NOT EXISTS chatlog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES value_graph_users(id) ON DELETE CASCADE,
    session_id UUID,
    human_message TEXT,
    llm_message TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    potential_topics TEXT[],
    potential_contexts TEXT[],
    potential_items TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for chatlog
CREATE INDEX IF NOT EXISTS idx_chatlog_user_id ON chatlog(user_id);
CREATE INDEX IF NOT EXISTS idx_chatlog_session_id ON chatlog(session_id);
CREATE INDEX IF NOT EXISTS idx_chatlog_timestamp ON chatlog(timestamp);

-- ------------------------------------------------------------
-- Chat Windows Table
-- ------------------------------------------------------------
-- Groups chat messages into analysis windows (sliding windows)
CREATE TABLE IF NOT EXISTS chat_windows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES value_graph_users(id) ON DELETE CASCADE,
    session_id UUID,
    chat_ids UUID[],
    chat_data JSONB,
    start_timestamp TIMESTAMPTZ,
    end_timestamp TIMESTAMPTZ,
    potential_topics TEXT[],
    potential_contexts TEXT[],
    potential_items TEXT[],
    synthesized BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for chat_windows
CREATE INDEX IF NOT EXISTS idx_chat_windows_user_id ON chat_windows(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_windows_session_id ON chat_windows(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_windows_synthesized ON chat_windows(synthesized);

-- ------------------------------------------------------------
-- Chat Backup Table (RLS Disabled for Failsafe)
-- ------------------------------------------------------------
-- Emergency backup table for chat messages
CREATE TABLE IF NOT EXISTS chat_backup (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL,
    user_id UUID NOT NULL,
    human_message TEXT,
    llm_message TEXT,
    original_timestamp TIMESTAMPTZ,
    backup_timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for backup lookups
CREATE INDEX IF NOT EXISTS idx_chat_backup_session_id ON chat_backup(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_backup_user_id ON chat_backup(user_id);

-- ------------------------------------------------------------
-- Chat Feedback Table
-- ------------------------------------------------------------
-- Stores user feedback after chat sessions
CREATE TABLE IF NOT EXISTS chat_feedback (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES value_graph_users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    feedback_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for feedback lookups
CREATE INDEX IF NOT EXISTS idx_chat_feedback_user_id ON chat_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_session_id ON chat_feedback(session_id);

-- ------------------------------------------------------------
-- Chat Debug Log Table
-- ------------------------------------------------------------
-- Stores debug logs for troubleshooting
CREATE TABLE IF NOT EXISTS chat_debug_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    log_level TEXT NOT NULL CHECK (log_level IN ('ERROR', 'WARNING', 'INFO', 'DEBUG')),
    session_id UUID,
    user_id UUID,
    message TEXT NOT NULL,
    context JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for debug logs
CREATE INDEX IF NOT EXISTS idx_chat_debug_log_level ON chat_debug_log(log_level);
CREATE INDEX IF NOT EXISTS idx_chat_debug_log_session_id ON chat_debug_log(session_id);

-- ------------------------------------------------------------
-- Conversation Strategies Table
-- ------------------------------------------------------------
-- Stores AI-generated conversation strategies per session
CREATE TABLE IF NOT EXISTS conversation_strategies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES value_graph_users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    strategy_data JSONB NOT NULL,
    time_of_day TEXT CHECK (time_of_day IN ('morning', 'afternoon', 'evening', 'night')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for strategies
CREATE INDEX IF NOT EXISTS idx_conversation_strategies_user_id ON conversation_strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_strategies_session_id ON conversation_strategies(session_id);

-- ============================================================
-- SECTION 3: Value Graph Tables
-- ============================================================

-- ------------------------------------------------------------
-- Contexts Table
-- ------------------------------------------------------------
-- Life domains for value categorization
CREATE TABLE IF NOT EXISTS contexts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    user_id UUID REFERENCES value_graph_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clean up any duplicate contexts before creating unique index
-- (needed for upgrades from older versions that didn't have uniqueness constraint)
DELETE FROM contexts 
WHERE id NOT IN (
    SELECT DISTINCT ON (name, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)) id
    FROM contexts 
    ORDER BY name, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), created_at ASC
);

-- Create unique index for context names (handles NULL user_id for global contexts)
CREATE UNIQUE INDEX IF NOT EXISTS contexts_name_user_unique_idx 
ON contexts (name, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Insert default contexts (global, no user_id) - only if they don't exist
INSERT INTO contexts (name, description)
SELECT name, description FROM (VALUES
    ('Work', 'Professional life, career, job-related topics'),
    ('Leisure', 'Hobbies, entertainment, relaxation activities'),
    ('Culture', 'Arts, traditions, cultural practices and beliefs'),
    ('Education', 'Learning, academic pursuits, skill development'),
    ('People', 'Relationships, family, friends, social connections'),
    ('Lifestyle', 'Daily habits, health, living arrangements')
) AS v(name, description)
WHERE NOT EXISTS (
    SELECT 1 FROM contexts c WHERE c.name = v.name AND c.user_id IS NULL
);

-- ------------------------------------------------------------
-- Topics Table
-- ------------------------------------------------------------
-- Extracted topics from conversations with embeddings
CREATE TABLE IF NOT EXISTS topics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES value_graph_users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    related_labels TEXT[],
    embedding VECTOR(1536), -- OpenAI text-embedding-3-small dimension
    reasoning TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for topics
CREATE INDEX IF NOT EXISTS idx_topics_user_id ON topics(user_id);
CREATE INDEX IF NOT EXISTS idx_topics_label ON topics(label);

-- Vector similarity index for topic embeddings
CREATE INDEX IF NOT EXISTS idx_topics_embedding ON topics 
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ------------------------------------------------------------
-- Items Table
-- ------------------------------------------------------------
-- Concrete items mentioned in conversations
CREATE TABLE IF NOT EXISTS items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES value_graph_users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    chat_ids UUID[],
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for items
CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);

-- Vector similarity index for item embeddings
CREATE INDEX IF NOT EXISTS idx_items_embedding ON items 
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ------------------------------------------------------------
-- Value Nodes Table
-- ------------------------------------------------------------
-- Topic-context pairs with sentiment scores
CREATE TABLE IF NOT EXISTS value_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES value_graph_users(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    context_id UUID NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score >= -7 AND score <= 7),
    reasoning TEXT,
    chat_ids UUID[],
    item_ids UUID[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(topic_id, context_id)
);

-- Indexes for value_nodes
CREATE INDEX IF NOT EXISTS idx_value_nodes_user_id ON value_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_value_nodes_topic_id ON value_nodes(topic_id);
CREATE INDEX IF NOT EXISTS idx_value_nodes_context_id ON value_nodes(context_id);

-- ------------------------------------------------------------
-- Thinking Logs Table
-- ------------------------------------------------------------
-- Stores LLM thinking process for auditability
CREATE TABLE IF NOT EXISTS thinking_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES value_graph_users(id) ON DELETE CASCADE,
    service_name TEXT NOT NULL,
    operation_name TEXT NOT NULL,
    session_id UUID,
    window_id UUID,
    thinking_summary TEXT,
    response_content TEXT,
    model_name TEXT NOT NULL,
    thinking_budget INTEGER,
    prompt_excerpt TEXT, -- Max 500 chars
    execution_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for thinking_logs
CREATE INDEX IF NOT EXISTS idx_thinking_logs_user_id ON thinking_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_thinking_logs_service_name ON thinking_logs(service_name);

-- ============================================================
-- SECTION 4: Survey & Experiment Tables
-- ============================================================

-- ------------------------------------------------------------
-- User PVQ Responses Table
-- ------------------------------------------------------------
-- Stores manual PVQ-RR survey responses (57 questions)
CREATE TABLE IF NOT EXISTS user_pvq_responses (
    user_id UUID PRIMARY KEY REFERENCES value_graph_users(id) ON DELETE CASCADE,
    gender TEXT CHECK (gender IN ('male', 'female')),
    -- PVQ-RR 57 questions (1-6 scale)
    q1 INTEGER CHECK (q1 >= 1 AND q1 <= 6),
    q2 INTEGER CHECK (q2 >= 1 AND q2 <= 6),
    q3 INTEGER CHECK (q3 >= 1 AND q3 <= 6),
    q4 INTEGER CHECK (q4 >= 1 AND q4 <= 6),
    q5 INTEGER CHECK (q5 >= 1 AND q5 <= 6),
    q6 INTEGER CHECK (q6 >= 1 AND q6 <= 6),
    q7 INTEGER CHECK (q7 >= 1 AND q7 <= 6),
    q8 INTEGER CHECK (q8 >= 1 AND q8 <= 6),
    q9 INTEGER CHECK (q9 >= 1 AND q9 <= 6),
    q10 INTEGER CHECK (q10 >= 1 AND q10 <= 6),
    q11 INTEGER CHECK (q11 >= 1 AND q11 <= 6),
    q12 INTEGER CHECK (q12 >= 1 AND q12 <= 6),
    q13 INTEGER CHECK (q13 >= 1 AND q13 <= 6),
    q14 INTEGER CHECK (q14 >= 1 AND q14 <= 6),
    q15 INTEGER CHECK (q15 >= 1 AND q15 <= 6),
    q16 INTEGER CHECK (q16 >= 1 AND q16 <= 6),
    q17 INTEGER CHECK (q17 >= 1 AND q17 <= 6),
    q18 INTEGER CHECK (q18 >= 1 AND q18 <= 6),
    q19 INTEGER CHECK (q19 >= 1 AND q19 <= 6),
    q20 INTEGER CHECK (q20 >= 1 AND q20 <= 6),
    q21 INTEGER CHECK (q21 >= 1 AND q21 <= 6),
    q22 INTEGER CHECK (q22 >= 1 AND q22 <= 6),
    q23 INTEGER CHECK (q23 >= 1 AND q23 <= 6),
    q24 INTEGER CHECK (q24 >= 1 AND q24 <= 6),
    q25 INTEGER CHECK (q25 >= 1 AND q25 <= 6),
    q26 INTEGER CHECK (q26 >= 1 AND q26 <= 6),
    q27 INTEGER CHECK (q27 >= 1 AND q27 <= 6),
    q28 INTEGER CHECK (q28 >= 1 AND q28 <= 6),
    q29 INTEGER CHECK (q29 >= 1 AND q29 <= 6),
    q30 INTEGER CHECK (q30 >= 1 AND q30 <= 6),
    q31 INTEGER CHECK (q31 >= 1 AND q31 <= 6),
    q32 INTEGER CHECK (q32 >= 1 AND q32 <= 6),
    q33 INTEGER CHECK (q33 >= 1 AND q33 <= 6),
    q34 INTEGER CHECK (q34 >= 1 AND q34 <= 6),
    q35 INTEGER CHECK (q35 >= 1 AND q35 <= 6),
    q36 INTEGER CHECK (q36 >= 1 AND q36 <= 6),
    q37 INTEGER CHECK (q37 >= 1 AND q37 <= 6),
    q38 INTEGER CHECK (q38 >= 1 AND q38 <= 6),
    q39 INTEGER CHECK (q39 >= 1 AND q39 <= 6),
    q40 INTEGER CHECK (q40 >= 1 AND q40 <= 6),
    q41 INTEGER CHECK (q41 >= 1 AND q41 <= 6),
    q42 INTEGER CHECK (q42 >= 1 AND q42 <= 6),
    q43 INTEGER CHECK (q43 >= 1 AND q43 <= 6),
    q44 INTEGER CHECK (q44 >= 1 AND q44 <= 6),
    q45 INTEGER CHECK (q45 >= 1 AND q45 <= 6),
    q46 INTEGER CHECK (q46 >= 1 AND q46 <= 6),
    q47 INTEGER CHECK (q47 >= 1 AND q47 <= 6),
    q48 INTEGER CHECK (q48 >= 1 AND q48 <= 6),
    q49 INTEGER CHECK (q49 >= 1 AND q49 <= 6),
    q50 INTEGER CHECK (q50 >= 1 AND q50 <= 6),
    q51 INTEGER CHECK (q51 >= 1 AND q51 <= 6),
    q52 INTEGER CHECK (q52 >= 1 AND q52 <= 6),
    q53 INTEGER CHECK (q53 >= 1 AND q53 <= 6),
    q54 INTEGER CHECK (q54 >= 1 AND q54 <= 6),
    q55 INTEGER CHECK (q55 >= 1 AND q55 <= 6),
    q56 INTEGER CHECK (q56 >= 1 AND q56 <= 6),
    q57 INTEGER CHECK (q57 >= 1 AND q57 <= 6),
    -- User-generated questions
    user_generated_q1 TEXT,
    user_generated_q2 TEXT,
    user_generated_q3 TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- User LLM Individual Responses Table
-- ------------------------------------------------------------
-- Stores AI predictions for individual PVQ questions
CREATE TABLE IF NOT EXISTS user_llm_individual_responses (
    user_id UUID PRIMARY KEY REFERENCES value_graph_users(id) ON DELETE CASCADE,
    pvq_version TEXT DEFAULT 'PVQ-RR',
    gender TEXT,
    model_name TEXT NOT NULL,
    prompt_metadata JSONB,
    raw_responses JSONB, -- Question ID -> Response text mapping
    -- Individual question predictions (1-6 scale)
    q1 INTEGER, q2 INTEGER, q3 INTEGER, q4 INTEGER, q5 INTEGER,
    q6 INTEGER, q7 INTEGER, q8 INTEGER, q9 INTEGER, q10 INTEGER,
    q11 INTEGER, q12 INTEGER, q13 INTEGER, q14 INTEGER, q15 INTEGER,
    q16 INTEGER, q17 INTEGER, q18 INTEGER, q19 INTEGER, q20 INTEGER,
    q21 INTEGER, q22 INTEGER, q23 INTEGER, q24 INTEGER, q25 INTEGER,
    q26 INTEGER, q27 INTEGER, q28 INTEGER, q29 INTEGER, q30 INTEGER,
    q31 INTEGER, q32 INTEGER, q33 INTEGER, q34 INTEGER, q35 INTEGER,
    q36 INTEGER, q37 INTEGER, q38 INTEGER, q39 INTEGER, q40 INTEGER,
    q41 INTEGER, q42 INTEGER, q43 INTEGER, q44 INTEGER, q45 INTEGER,
    q46 INTEGER, q47 INTEGER, q48 INTEGER, q49 INTEGER, q50 INTEGER,
    q51 INTEGER, q52 INTEGER, q53 INTEGER, q54 INTEGER, q55 INTEGER,
    q56 INTEGER, q57 INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- User LLM Batch Responses Table
-- ------------------------------------------------------------
-- Stores AI batch predictions for all 19 Schwartz values
CREATE TABLE IF NOT EXISTS user_llm_batch_responses (
    user_id UUID PRIMARY KEY REFERENCES value_graph_users(id) ON DELETE CASCADE,
    model_name TEXT NOT NULL,
    prompt_metadata JSONB, -- Contains chat_messages_count, mrat, generation_timestamp
    raw_reasoning JSONB, -- Value code -> Reasoning text mapping
    -- Centered scores for 19 Schwartz values
    sdt_score NUMERIC, -- Self-Direction Thought
    sda_score NUMERIC, -- Self-Direction Action
    st_score NUMERIC,  -- Stimulation
    he_score NUMERIC,  -- Hedonism
    ac_score NUMERIC,  -- Achievement
    pod_score NUMERIC, -- Power Dominance
    por_score NUMERIC, -- Power Resources
    fac_score NUMERIC, -- Face
    sep_score NUMERIC, -- Security Personal
    ses_score NUMERIC, -- Security Societal
    tr_score NUMERIC,  -- Tradition
    cor_score NUMERIC, -- Conformity Rules
    coi_score NUMERIC, -- Conformity Interpersonal
    hum_score NUMERIC, -- Humility
    unn_score NUMERIC, -- Universalism Nature
    unc_score NUMERIC, -- Universalism Concern
    unt_score NUMERIC, -- Universalism Tolerance
    bec_score NUMERIC, -- Benevolence Care
    bed_score NUMERIC, -- Benevolence Dependability
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Stage 3 Experiment Table (Chart Evaluation)
-- ------------------------------------------------------------
-- Stores chart comparison experiment data
CREATE TABLE IF NOT EXISTS stage3_experiment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES value_graph_users(id) ON DELETE CASCADE,
    charts_generated BOOLEAN DEFAULT FALSE,
    generation_completed_at TIMESTAMPTZ,
    generation_metadata JSONB,
    -- Chart data for comparisons
    round_1_manual_data JSONB,
    round_1_anti_manual_data JSONB,
    round_2_llm_data JSONB,
    round_2_anti_llm_data JSONB,
    -- Round completion tracking
    round_1_completed BOOLEAN DEFAULT FALSE,
    round_1_winner TEXT CHECK (round_1_winner IN ('manual', 'anti-manual')),
    round_1_completed_at TIMESTAMPTZ,
    round_2_completed BOOLEAN DEFAULT FALSE,
    round_2_winner TEXT CHECK (round_2_winner IN ('llm', 'anti-llm')),
    round_2_completed_at TIMESTAMPTZ,
    round_3_completed BOOLEAN DEFAULT FALSE,
    round_3_winner TEXT CHECK (round_3_winner IN ('manual', 'llm')),
    round_3_completed_at TIMESTAMPTZ,
    -- Final results
    all_rounds_completed BOOLEAN DEFAULT FALSE,
    final_completed_at TIMESTAMPTZ,
    final_choice TEXT CHECK (final_choice IN ('manual', 'llm')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- ------------------------------------------------------------
-- Stage 2 Experiment Table (Persona Embodiment)
-- ------------------------------------------------------------
-- Stores persona embodiment experiment data
CREATE TABLE IF NOT EXISTS stage2_experiment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES value_graph_users(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL CHECK (round_number >= 1 AND round_number <= 5),
    scenario_name TEXT NOT NULL,
    scenario_prompt TEXT NOT NULL,
    scenario_type TEXT CHECK (scenario_type IN ('wvs_structured', 'user_generated')),
    -- Persona responses
    user_embodiment_response TEXT,
    user_embodiment_reasoning TEXT,
    anti_user_response TEXT,
    anti_user_reasoning TEXT,
    schwartz_values_response TEXT,
    schwartz_values_reasoning TEXT,
    random_schwartz_response TEXT,
    random_schwartz_reasoning TEXT,
    -- User ratings (1-6 scale, matching PVQ-RR)
    user_embodiment_rating INTEGER CHECK (user_embodiment_rating >= 1 AND user_embodiment_rating <= 6),
    anti_user_rating INTEGER CHECK (anti_user_rating >= 1 AND anti_user_rating <= 6),
    schwartz_values_rating INTEGER CHECK (schwartz_values_rating >= 1 AND schwartz_values_rating <= 6),
    random_schwartz_rating INTEGER CHECK (random_schwartz_rating >= 1 AND random_schwartz_rating <= 6),
    -- Timestamps
    responses_generated_at TIMESTAMPTZ,
    user_selection_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, round_number)
);

-- Index for stage2 lookups
CREATE INDEX IF NOT EXISTS idx_stage2_experiment_user_id ON stage2_experiment(user_id);

-- ============================================================
-- SECTION 5: RPC Functions
-- ============================================================

-- ------------------------------------------------------------
-- Get User by Access Code
-- ------------------------------------------------------------
-- Drop existing function first if return type changed
DROP FUNCTION IF EXISTS get_user_by_access_code(TEXT);

CREATE OR REPLACE FUNCTION get_user_by_access_code(input_code TEXT)
RETURNS TABLE (
    id UUID,
    name TEXT,
    email TEXT,
    is_admin BOOLEAN,
    can_generate_surveys BOOLEAN,
    can_use_speech_patterns BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.name,
        u.email,
        u.is_admin,
        u.can_generate_surveys,
        u.can_use_speech_patterns
    FROM value_graph_users u
    WHERE u.access_code = input_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- Set User Context (for RLS)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_user_context(p_user_id UUID, p_is_admin BOOLEAN)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.user_id', p_user_id::TEXT, TRUE);
    PERFORM set_config('app.is_admin', p_is_admin::TEXT, TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- Create User (Admin Only)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_user(
    admin_access_code TEXT,
    new_user_name TEXT,
    new_user_email TEXT DEFAULT NULL,
    new_user_access_code TEXT DEFAULT NULL,
    new_user_is_admin BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    user_access_code TEXT
) AS $$
DECLARE
    admin_user RECORD;
    generated_code TEXT;
    final_access_code TEXT;
BEGIN
    -- Verify admin
    SELECT * INTO admin_user 
    FROM value_graph_users 
    WHERE access_code = admin_access_code AND is_admin = TRUE;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Invalid admin credentials'::TEXT, NULL::TEXT;
        RETURN;
    END IF;
    
    -- Generate access code if not provided
    IF new_user_access_code IS NULL OR new_user_access_code = '' THEN
        generated_code := LOWER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
        final_access_code := generated_code;
    ELSE
        final_access_code := new_user_access_code;
    END IF;
    
    -- Check if access code already exists
    IF EXISTS (SELECT 1 FROM value_graph_users WHERE access_code = final_access_code) THEN
        RETURN QUERY SELECT FALSE, 'Access code already exists'::TEXT, NULL::TEXT;
        RETURN;
    END IF;
    
    -- Create user
    INSERT INTO value_graph_users (name, email, access_code, is_admin)
    VALUES (new_user_name, new_user_email, final_access_code, new_user_is_admin);
    
    RETURN QUERY SELECT TRUE, 'User created successfully'::TEXT, final_access_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- Self Register (No Admin Required)
-- ------------------------------------------------------------
-- Allows anyone to create their own account with an auto-generated access code
-- SECURITY: Access codes are generated server-side to prevent enumeration attacks
CREATE OR REPLACE FUNCTION self_register(
    new_user_name TEXT,
    new_user_email TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    user_id UUID,
    access_code TEXT
) AS $$
DECLARE
    created_user_id UUID;
    generated_code TEXT;
    max_attempts INTEGER := 10;
    attempt INTEGER := 0;
BEGIN
    -- Validate inputs
    IF new_user_name IS NULL OR TRIM(new_user_name) = '' THEN
        RETURN QUERY SELECT FALSE, 'Name is required'::TEXT, NULL::UUID, NULL::TEXT;
        RETURN;
    END IF;
    
    -- Generate a unique access code (8 character alphanumeric)
    LOOP
        attempt := attempt + 1;
        -- Generate random 8-char code using MD5 hash of random value
        generated_code := LOWER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 8));
        
        -- Check if code is unique
        EXIT WHEN NOT EXISTS (SELECT 1 FROM value_graph_users WHERE value_graph_users.access_code = generated_code);
        
        -- Safety check to prevent infinite loop
        IF attempt >= max_attempts THEN
            RETURN QUERY SELECT FALSE, 'Unable to generate unique access code. Please try again.'::TEXT, NULL::UUID, NULL::TEXT;
            RETURN;
        END IF;
    END LOOP;
    
    -- Create the user (non-admin by default)
    INSERT INTO value_graph_users (name, email, access_code, is_admin, strategy_type)
    VALUES (TRIM(new_user_name), NULLIF(TRIM(new_user_email), ''), generated_code, FALSE, 'vertical')
    RETURNING id INTO created_user_id;
    
    RETURN QUERY SELECT TRUE, 'Account created successfully'::TEXT, created_user_id, generated_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- Get User Data Counts
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_data_counts(user_id_param UUID)
RETURNS TABLE (
    topics_count BIGINT,
    nodes_count BIGINT,
    items_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM topics WHERE user_id = user_id_param),
        (SELECT COUNT(*) FROM value_nodes WHERE user_id = user_id_param),
        (SELECT COUNT(*) FROM items WHERE user_id = user_id_param);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- Find Similar Topics (Vector Similarity)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION find_similar_topics(
    search_embedding VECTOR(1536),
    similarity_threshold NUMERIC DEFAULT 0.7,
    max_results INTEGER DEFAULT 10,
    user_id_param UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    label TEXT,
    similarity NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.label,
        (1 - (t.embedding <=> search_embedding))::NUMERIC as similarity
    FROM topics t
    WHERE 
        t.embedding IS NOT NULL
        AND (user_id_param IS NULL OR t.user_id = user_id_param)
        AND (1 - (t.embedding <=> search_embedding)) >= similarity_threshold
    ORDER BY t.embedding <=> search_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- Find Similar Items (Vector Similarity)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION find_similar_items(
    search_embedding VECTOR(1536),
    similarity_threshold NUMERIC DEFAULT 0.7,
    max_results INTEGER DEFAULT 10,
    user_id_param UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    similarity NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id,
        i.name,
        (1 - (i.embedding <=> search_embedding))::NUMERIC as similarity
    FROM items i
    WHERE 
        i.embedding IS NOT NULL
        AND (user_id_param IS NULL OR i.user_id = user_id_param)
        AND (1 - (i.embedding <=> search_embedding)) >= similarity_threshold
    ORDER BY i.embedding <=> search_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- Update Topic with Embedding
-- ------------------------------------------------------------
-- Updates a topic's embedding vector
-- NOTE: Parameters must be in alphabetical order for Supabase RPC named params
DROP FUNCTION IF EXISTS update_topic_with_embedding(UUID, VECTOR(1536));
DROP FUNCTION IF EXISTS update_topic_with_embedding(VECTOR(1536), UUID);

CREATE OR REPLACE FUNCTION update_topic_with_embedding(
    embedding_vector VECTOR(1536),
    topic_id UUID
)
RETURNS VOID AS $$
BEGIN
    UPDATE topics
    SET embedding = embedding_vector,
        updated_at = NOW()
    WHERE id = topic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- Update Item with Embedding
-- ------------------------------------------------------------
-- Updates an item's embedding vector
-- NOTE: Parameters must be in alphabetical order for Supabase RPC named params
DROP FUNCTION IF EXISTS update_item_with_embedding(UUID, VECTOR(1536));
DROP FUNCTION IF EXISTS update_item_with_embedding(VECTOR(1536), UUID);

CREATE OR REPLACE FUNCTION update_item_with_embedding(
    embedding_vector VECTOR(1536),
    item_id UUID
)
RETURNS VOID AS $$
BEGIN
    UPDATE items
    SET embedding = embedding_vector,
        updated_at = NOW()
    WHERE id = item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SECTION 6: Row Level Security (RLS) Policies
-- ============================================================
-- This app uses client-side access code authentication, not Supabase Auth.
-- RLS policies allow operations as long as the user_id references a valid user.
-- Authorization is handled at the application level.

-- Enable RLS on tables
ALTER TABLE chatlog ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE value_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE thinking_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_pvq_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_llm_individual_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_llm_batch_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage3_experiment ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage2_experiment ENABLE ROW LEVEL SECURITY;

-- NOTE: chat_backup has RLS DISABLED for failsafe logging
-- This is intentional - do not enable RLS on chat_backup

-- RLS Policies: Allow operations if user_id references a valid user
-- The app validates users via access codes at the application level
-- Note: DROP IF EXISTS ensures this script is idempotent (safe to re-run)

DROP POLICY IF EXISTS chatlog_policy ON chatlog;
CREATE POLICY chatlog_policy ON chatlog
    FOR ALL USING (user_id IN (SELECT id FROM value_graph_users));

DROP POLICY IF EXISTS chat_windows_policy ON chat_windows;
CREATE POLICY chat_windows_policy ON chat_windows
    FOR ALL USING (user_id IN (SELECT id FROM value_graph_users));

DROP POLICY IF EXISTS chat_feedback_policy ON chat_feedback;
CREATE POLICY chat_feedback_policy ON chat_feedback
    FOR ALL USING (user_id IN (SELECT id FROM value_graph_users));

DROP POLICY IF EXISTS conversation_strategies_policy ON conversation_strategies;
CREATE POLICY conversation_strategies_policy ON conversation_strategies
    FOR ALL USING (user_id IN (SELECT id FROM value_graph_users));

DROP POLICY IF EXISTS topics_policy ON topics;
CREATE POLICY topics_policy ON topics
    FOR ALL USING (user_id IN (SELECT id FROM value_graph_users));

DROP POLICY IF EXISTS items_policy ON items;
CREATE POLICY items_policy ON items
    FOR ALL USING (user_id IN (SELECT id FROM value_graph_users));

DROP POLICY IF EXISTS value_nodes_policy ON value_nodes;
CREATE POLICY value_nodes_policy ON value_nodes
    FOR ALL USING (user_id IN (SELECT id FROM value_graph_users));

DROP POLICY IF EXISTS thinking_logs_policy ON thinking_logs;
CREATE POLICY thinking_logs_policy ON thinking_logs
    FOR ALL USING (user_id IN (SELECT id FROM value_graph_users));

DROP POLICY IF EXISTS user_pvq_responses_policy ON user_pvq_responses;
CREATE POLICY user_pvq_responses_policy ON user_pvq_responses
    FOR ALL USING (user_id IN (SELECT id FROM value_graph_users));

DROP POLICY IF EXISTS user_llm_individual_responses_policy ON user_llm_individual_responses;
CREATE POLICY user_llm_individual_responses_policy ON user_llm_individual_responses
    FOR ALL USING (user_id IN (SELECT id FROM value_graph_users));

DROP POLICY IF EXISTS user_llm_batch_responses_policy ON user_llm_batch_responses;
CREATE POLICY user_llm_batch_responses_policy ON user_llm_batch_responses
    FOR ALL USING (user_id IN (SELECT id FROM value_graph_users));

DROP POLICY IF EXISTS stage3_experiment_policy ON stage3_experiment;
CREATE POLICY stage3_experiment_policy ON stage3_experiment
    FOR ALL USING (user_id IN (SELECT id FROM value_graph_users));

DROP POLICY IF EXISTS stage2_experiment_policy ON stage2_experiment;
CREATE POLICY stage2_experiment_policy ON stage2_experiment
    FOR ALL USING (user_id IN (SELECT id FROM value_graph_users));

-- ============================================================
-- SECTION 7: Triggers for Updated Timestamps
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
-- Note: DROP IF EXISTS ensures this script is idempotent (safe to re-run)

DROP TRIGGER IF EXISTS update_value_graph_users_updated_at ON value_graph_users;
CREATE TRIGGER update_value_graph_users_updated_at
    BEFORE UPDATE ON value_graph_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_chatlog_updated_at ON chatlog;
CREATE TRIGGER update_chatlog_updated_at
    BEFORE UPDATE ON chatlog
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_chat_windows_updated_at ON chat_windows;
CREATE TRIGGER update_chat_windows_updated_at
    BEFORE UPDATE ON chat_windows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversation_strategies_updated_at ON conversation_strategies;
CREATE TRIGGER update_conversation_strategies_updated_at
    BEFORE UPDATE ON conversation_strategies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_contexts_updated_at ON contexts;
CREATE TRIGGER update_contexts_updated_at
    BEFORE UPDATE ON contexts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_topics_updated_at ON topics;
CREATE TRIGGER update_topics_updated_at
    BEFORE UPDATE ON topics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_items_updated_at ON items;
CREATE TRIGGER update_items_updated_at
    BEFORE UPDATE ON items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_value_nodes_updated_at ON value_nodes;
CREATE TRIGGER update_value_nodes_updated_at
    BEFORE UPDATE ON value_nodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_pvq_responses_updated_at ON user_pvq_responses;
CREATE TRIGGER update_user_pvq_responses_updated_at
    BEFORE UPDATE ON user_pvq_responses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_llm_individual_responses_updated_at ON user_llm_individual_responses;
CREATE TRIGGER update_user_llm_individual_responses_updated_at
    BEFORE UPDATE ON user_llm_individual_responses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_llm_batch_responses_updated_at ON user_llm_batch_responses;
CREATE TRIGGER update_user_llm_batch_responses_updated_at
    BEFORE UPDATE ON user_llm_batch_responses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stage3_experiment_updated_at ON stage3_experiment;
CREATE TRIGGER update_stage3_experiment_updated_at
    BEFORE UPDATE ON stage3_experiment
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stage2_experiment_updated_at ON stage2_experiment;
CREATE TRIGGER update_stage2_experiment_updated_at
    BEFORE UPDATE ON stage2_experiment
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SECTION 8: Create First Admin User
-- ============================================================
-- Run this to create your first admin user after setup:
--
-- INSERT INTO value_graph_users (name, email, access_code, is_admin)
-- VALUES ('Admin', 'admin@example.com', 'your-secret-code', TRUE);
--
-- Replace 'your-secret-code' with a secure access code.
-- This user can then create additional users via the admin dashboard.

-- ============================================================
-- Setup Complete!
-- ============================================================
-- Your database is now ready. Next steps:
-- 1. Create your first admin user using the SQL above
-- 2. Configure your .env.local with API keys
-- 3. Run: pnpm install && pnpm dev
-- 4. Login with your admin access code
-- ============================================================
