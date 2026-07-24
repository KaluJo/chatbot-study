# Chatbot Study - Complete Setup Guide[cite: 5]
This guide walks you through setting up your own instance of the Chatbot Study research toolkit from scratch.[cite: 5]

## Prerequisites[cite: 5]
Before you begin, ensure you have:[cite: 5]
- **Node.js 20+** installed ([download](https://nodejs.org/))[cite: 5]
- **pnpm** package manager (`npm install -g pnpm`)[cite: 5]
- A **GitHub account** (for cloning the repository)[cite: 5]
- A **credit card** for API services (all have free tiers)[cite: 5]

## Step 1: Create a Supabase Project[cite: 5]
[Supabase](https://supabase.com) provides the PostgreSQL database and authentication infrastructure.[cite: 5]
1. Go to [https://supabase.com](https://supabase.com) and sign up/log in[cite: 5]
2. Click **"New Project"**[cite: 5]
3. Fill in the project details:[cite: 5]
   - **Name**: `chatbot-study` (or your preferred name)[cite: 5]
   - **Database Password**: Generate a strong password (save this!)[cite: 5]
   - **Region**: Choose the closest to your participants[cite: 5]
4. Click **"Create new project"** and wait ~2 minutes for setup[cite: 5]

### Get Your Supabase Credentials[cite: 5]
Once your project is ready:[cite: 5]
1. Go to **Settings** → **API Keys** in the left sidebar[cite: 5]
2. Copy these values (you'll need them for `.env.local`):[cite: 5]
   - **Project URL**: `https://xxxxx.supabase.co`[cite: 5]
   - **Publishable key** (`sb_publishable_...`) — used as `NEXT_PUBLIC_SUPABASE_ANON_KEY`[cite: 5]
   - **Secret key** (`sb_secret_...`) — used as `SUPABASE_SERVICE_ROLE_KEY`, keep this private[cite: 5]
> **Note:** Older Supabase projects show JWT-format keys (`eyJhbGci...`).[cite: 5] Both formats work — copy whichever your project shows.[cite: 5]

## Step 2: Run the Database Setup Script[cite: 5]
1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)[cite: 5]
2. Click **"New query"**[cite: 5]
3. Open `setup/database.sql` from this repository[cite: 5]
4. Copy the **entire contents** and paste into the SQL Editor[cite: 5]
5. Click **"Run"** (or press Cmd/Ctrl + Enter)[cite: 5]
You should see "Success. No rows returned" - this is expected![cite: 5]

> **Important:** This script is **idempotent** (safe to run multiple times).[cite: 5] After pulling updates from the repository, **always re-run this script** to apply any new database functions, tables, or policies.[cite: 5] Your existing data will not be affected.[cite: 5]
>
> Common symptom of missing database updates: errors like `Could not find the function public.function_name(...) in the schema cache`[cite: 5]

### Verify the Setup[cite: 5]
To verify tables were created:[cite: 5]
1. Go to **Table Editor** in the left sidebar[cite: 5]
2. You should see all tables: `value_graph_users`, `chatlog`, `topics`, etc.[cite: 5]
3. Click on `contexts` - you should see 6 default contexts (Work, Leisure, etc.)[cite: 5]

## Step 3: Create Your First Admin User[cite: 5]
In the **SQL Editor**, run:[cite: 5]
```sql
INSERT INTO value_graph_users (name, email, access_code, is_admin)
VALUES ('Your Name', 'your@email.com', 'your-secret-admin-code', TRUE);
```
**Important**: Replace:[cite: 5]
- `Your Name` with your actual name[cite: 5]
- `your@email.com` with your email[cite: 5]
- `your-secret-admin-code` with a memorable but secure code (this is your login!)[cite: 5]
Save this access code - you'll use it to log into the admin dashboard.[cite: 5]

## Step 4: Get API Keys[cite: 5]
You'll need API keys from at least one LLM provider.[cite: 5] Here's how to get each:[cite: 5]

### Anthropic Claude (Required for Chat)[cite: 5]
1. Go to [https://console.anthropic.com](https://console.anthropic.com)[cite: 5]
2. Sign up/log in[cite: 5]
3. Go to **API Keys** and create a new key[cite: 5]
4. Copy the key (starts with `sk-ant-...`)[cite: 5]

### Qwen (Required for Strategy Generation)[cite: 5]
1. Go to the DashScope console (or appropriate Qwen API platform)[cite: 5]
2. Sign in with your account[cite: 5]
3. Click **"Create API Key"**[cite: 5]
4. Copy the key[cite: 5]

### OpenAI (Optional - for Embeddings)[cite: 5]
1. Go to [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)[cite: 5]
2. Sign up/log in[cite: 5]
3. Click **"Create new secret key"**[cite: 5]
4. Copy the key (starts with `sk-...`)[cite: 5]
**Note**: OpenAI embeddings are optional.[cite: 5] The system will fall back to text-based similarity if not configured.[cite: 5]

## Step 5: Configure Environment Variables[cite: 5]
1. In the repository root, copy the example environment file:[cite: 5]
```bash
cp .env.example .env.local
```
2. Open `.env.local` in your editor and fill in the values:[cite: 5]
```bash
# Required: Supabase (client-side URL and anon key are safe to expose) 
NEXT_PUBLIC_SUPABASE_URL=[https://your-project.supabase.co](https://your-project.supabase.co)
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
# Required: Supabase service role key (server-side only, NEVER expose publicly) 
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
# Required: Anthropic Claude (server-side only, NOT exposed to browser) 
ANTHROPIC_API_KEY=sk-ant-your-key
CLAUDE_MODEL=claude-sonnet-4-20250514
# Recommended: Qwen (server-side only) 
QWEN_API_KEY=your-qwen-key
QWEN_MODEL=qwen-max
QWEN_MODEL_PRO=qwen-max
# Optional: OpenAI (server-side only) 
OPENAI_API_KEY=sk-your-key
```

## Step 6: Install Dependencies and Run[cite: 5]
```bash
# Install dependencies 
pnpm install
# Start the development server 
pnpm dev
```
The application will be available at [http://localhost:3000](http://localhost:3000)[cite: 5]

## Step 7: First-Time Setup Wizard[cite: 5]
When you first open the app with an empty database, you'll be automatically redirected to the **Setup Wizard** (`/setup`):[cite: 5]
1. **Service Check**: The wizard verifies which APIs are configured:[cite: 5]
   - ✓ Supabase (required) - database connection[cite: 5]
   - ✓ Claude (required) - chat functionality[cite: 5]
   - ○ Qwen (recommended) - personalized strategies[cite: 5]
   - ○ OpenAI (optional) - semantic embeddings[cite: 5]
2. **Create Admin Account**: Enter your admin name and access code[cite: 5]
3. **Done!**: You'll be redirected to login with your new admin credentials[cite: 5]

### What Happens Without Optional APIs?[cite: 5]
| Missing API | What Happens |
|-------------|--------------|
| **Qwen** | Chat works with generic conversation strategies (no personalization)[cite: 5] |
| **OpenAI** | Topic similarity uses text-matching instead of semantic search[cite: 5] |
Both fallbacks work fine - you just get reduced functionality.[cite: 5]

### Manual Access[cite: 5]
You can always access the setup wizard at `/setup` to:[cite: 5]
- Re-check your API configuration[cite: 5]
- Create additional admin accounts[cite: 5]
- Troubleshoot connection issues[cite: 5]

## Production Deployment[cite: 5]
### Deploy to Vercel (Recommended)[cite: 5]
1. Push your repository to GitHub[cite: 5]
2. Go to [vercel.com](https://vercel.com) and import your repository[cite: 5]
3. Add all environment variables in Vercel's project settings[cite: 5]
4. Deploy![cite: 5]

### Environment Variables in Production[cite: 5]
In Vercel, go to **Settings** → **Environment Variables** and add:[cite: 5]
| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase URL[cite: 5] |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase publishable key[cite: 5] |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase secret key[cite: 5] |
| `ANTHROPIC_API_KEY` | Your Anthropic key[cite: 5] |
| `CLAUDE_MODEL` | `claude-sonnet-4-20250514`[cite: 5] |
| `QWEN_API_KEY` | Your Qwen key[cite: 5] |
| `QWEN_MODEL` | `qwen-max`[cite: 5] |
| `QWEN_MODEL_PRO` | `qwen-max`[cite: 5] |
| `OPENAI_API_KEY` | Your OpenAI key (optional)[cite: 5] |

## Troubleshooting[cite: 5]
### "Invalid access code" on login[cite: 5]
- Verify the access code was inserted correctly in the database[cite: 5]
- Check the `value_graph_users` table in Supabase Table Editor[cite: 5]
- Access codes are case-sensitive[cite: 5]

### Chat not responding[cite: 5]
- Check browser console for API errors[cite: 5]
- Verify `ANTHROPIC_API_KEY` is set correctly in your environment[cite: 5]
- Check Anthropic console for API usage/errors[cite: 5]

### Strategy generation fails[cite: 5]
- Verify `QWEN_API_KEY` is set correctly in your environment[cite: 5]
- Check DashScope API quotas[cite: 5]

### "Could not find the function" error[cite: 5]
If you see an error like `Could not find the function public.some_function(...) in the schema cache`:[cite: 5]
1. This means your database is missing functions added in recent updates[cite: 5]
2. **Solution:** Re-run `setup/database.sql` in the Supabase SQL Editor[cite: 5]
3. The script is idempotent - it won't affect your existing data[cite: 5]

### Vector similarity not working[cite: 5]
- If using OpenAI embeddings, verify the key is set[cite: 5]
- Without OpenAI, the system uses text-based fallback (still works, less accurate)[cite: 5]
- Check that the `vector` extension is enabled in Supabase[cite: 5]

### Database connection issues[cite: 5]
- Verify Supabase project is active (not paused)[cite: 5]
- Check that URL and anon key are correct[cite: 5]
- Ensure no firewall blocking connections[cite: 5]

## Security Notes[cite: 5]
### API Keys in Browser[cite: 5]
This toolkit uses `NEXT_PUBLIC_*` environment variables, which are exposed to the browser.[cite: 5] This is intentional for research transparency and ease of setup.[cite: 5]
**For production studies**, consider:[cite: 5]
1. Moving API calls to server-side routes[cite: 5]
2. Implementing rate limiting[cite: 5]
3. Using Supabase Edge Functions for sensitive operations[cite: 5]

### Row Level Security (RLS)[cite: 5]
The database uses RLS to ensure:[cite: 5]
- Users can only access their own data[cite: 5]
- Admins can access all data[cite: 5]
- The `chat_backup` table is exempt (failsafe for data recovery)[cite: 5]

## Next Steps[cite: 5]
Once setup is complete:[cite: 5]
1. Read the [Architecture Documentation](../docs/ARCHITECTURE.md)[cite: 5]
2. Customize the chatbot persona in `app/chat/services/claude-service.ts`[cite: 5]
3. Modify conversation strategies in `app/chat/services/strategy-service.ts`[cite: 5]
4. Review the [Admin Guide](../docs/ADMIN_GUIDE.md) for managing participants[cite: 5]
---
Need help? Open an issue on GitHub or check the main README for more resources.[cite: 5]