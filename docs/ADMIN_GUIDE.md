# Admin Dashboard Guide

The admin dashboard provides tools for researchers to manage participants, analyze data, and monitor the study.

## Accessing the Admin Dashboard

1. Log in with an admin access code
2. You'll be automatically redirected to `/admin/dashboard`
3. Non-admin users cannot access admin routes

## Dashboard Overview

**Location**: `/admin/dashboard`

The main dashboard has two tabs:

### User Management Tab

Displays all users with key statistics:

| Column | Description |
|--------|-------------|
| Name | User's display name |
| Email | Optional email |
| Access Code | Login credential (click to copy) |
| Sessions | Count of distinct chat sessions |
| Value Nodes | Count of extracted value nodes |
| Strategy | Conversation strategy type (click to toggle) |
| Role | Badge if user is admin |
| Actions | Quick action buttons |

**Strategy Column:**

Each user has a conversation strategy that determines how the AI chatbot behaves:

- **Vertical (purple)**: Deep, focused conversations that persistently explore topics
- **Horizontal (teal)**: Broad, spontaneous conversations that move between topics freely

Click the strategy button to toggle between types. Changes take effect on the user's next chat session.

**Actions per User**:
- **Synthesis**: Process conversations into value graph
- **Visualize**: View interactive value graph
- **Strategies**: View conversation strategies
- **Export Chats**: Download chat logs as JSON

### System Analytics Tab

Aggregate statistics:
- Total users
- Total chat sessions
- Total value nodes extracted
- Other system-wide metrics

## Creating Users

1. Click "Create User" button
2. Fill in the form:
   - **Name**: Required - participant identifier
   - **Email**: Optional - for reference
   - **Access Code**: Optional - auto-generated if blank
   - **Admin**: Checkbox for admin privileges
   - **Strategy**: Choose Vertical (depth) or Horizontal (breadth)
3. Click "Create"
4. Share the access code with the participant

**Important**: Store access codes securely. They cannot be recovered.

**Strategy Selection Tips:**
- Use **Vertical** for participants in value extraction studies (deeper insights)
- Use **Horizontal** for exploratory studies or control groups
- Strategy can be changed later via the dashboard

## User Management Pages

### Synthesis Page (`/admin/synthesis/[userId]`)

Process conversations into value graphs.

**Features**:

1. **Session Selection**: Dropdown to select specific sessions

2. **Window Management**:
   - View conversation windows
   - Create windows from new chats
   - Clean up duplicate windows

3. **Analysis Operations**:
   - Analyze individual windows (extract topics, contexts, items)
   - Batch analyze entire session
   - Super batch analyze all sessions

4. **Synthesis Operations**:
   - Synthesize individual windows into value nodes
   - Batch synthesize session
   - Super batch synthesize all sessions

5. **Topic Management**:
   - Normalize topic labels
   - Merge duplicate topics

**Progress Tracking**:
- Modal shows real-time progress
- Logs display operation details
- Errors are highlighted

### Visualization Page (`/admin/visualization/[userId]`)

View the user's value graph.

**Features**:
- Interactive force-directed graph
- Zoom and pan controls
- Click nodes to see conversation evidence
- Fullscreen mode
- Node filtering

**Node Types**:
- **Context nodes**: Life domains (gray circles)
- **Topic nodes**: Extracted topics (colored by sentiment)
- **Item nodes**: Specific items mentioned (blue shades)

### Strategies Page (`/admin/strategies/[userId]`)

View AI-generated conversation strategies.

**Features**:
- List all strategies by session
- View strategy details:
  - User profile
  - Communication insights
  - Shared memories
  - Conversation goals
- Delete strategies
- Clean up duplicates

### User Detail Page (`/admin/user/[id]`)

Detailed user profile view.

**Tabs**:

1. **Conversations**: 
   - List of chat windows
   - Recent messages preview
   - Timestamps

2. **Value Nodes**:
   - All extracted value nodes
   - Topic, context, score
   - Reasoning and evidence

## Exporting Data

### Chat Export

1. Go to Admin Dashboard
2. Find user in the list
3. Click "Export Chats"
4. JSON file downloads automatically

**Export Format**:
```json
{
  "sessions": {
    "session-uuid-1": [
      {
        "human_message": "User's message",
        "llm_message": "AI's response",
        "timestamp": "2025-01-15T10:30:00Z"
      }
    ],
    "session-uuid-2": [...]
  }
}
```

### Bulk Data Export

For bulk exports, use Supabase directly:

1. Go to Supabase Dashboard
2. Navigate to Table Editor
3. Select table (chatlog, user_pvq_responses, etc.)
4. Click "Export" → "Export as CSV"

## Processing Workflow

### Recommended Order

1. **Wait for sufficient data**: Let participants chat for several sessions

2. **Generate windows**: 
   - Go to Synthesis page
   - Click "Merge and Save All Windows"

3. **Analyze windows**:
   - Click "Super Batch Analyze All"
   - Wait for completion

4. **Synthesize value graph**:
   - Click "Super Batch Synthesize All"
   - Wait for completion

5. **Review results**:
   - View Visualization page
   - Check extracted topics and nodes

### Troubleshooting Synthesis

**No topics extracted**:
- Ensure chat messages have content
- Check Gemini API key is valid
- Review thinking logs for errors

**Duplicate topics**:
- Use "Normalize Topic Labels"
- Check similarity threshold settings

**Missing value nodes**:
- Verify topics are linked to contexts
- Check confidence thresholds

## Security Considerations

### Access Control

- Only admins can access `/admin/*` routes
- User data is isolated by RLS policies
- Admin access code should be kept secure

### Data Privacy

- Participant data visible to all admins
- Consider who has admin access
- Export data is not encrypted

### API Keys

- Keys are exposed in browser (NEXT_PUBLIC_*)
- Monitor usage in provider dashboards
- Consider rate limiting for production

## Common Tasks

### Resetting a User

If a user needs to start over:

```sql
-- Delete all user data (use with caution!)
DELETE FROM chatlog WHERE user_id = 'user-uuid';
DELETE FROM chat_windows WHERE user_id = 'user-uuid';
DELETE FROM topics WHERE user_id = 'user-uuid';
DELETE FROM value_nodes WHERE user_id = 'user-uuid';
DELETE FROM items WHERE user_id = 'user-uuid';
DELETE FROM user_pvq_responses WHERE user_id = 'user-uuid';
```

### Changing User Access Code

```sql
UPDATE value_graph_users 
SET access_code = 'new-code'
WHERE id = 'user-uuid';
```

### Promoting User to Admin

```sql
UPDATE value_graph_users 
SET is_admin = TRUE
WHERE id = 'user-uuid';
```

### Viewing Raw Strategy Data

```sql
SELECT strategy_data 
FROM conversation_strategies 
WHERE user_id = 'user-uuid'
ORDER BY created_at DESC;
```

## Monitoring

### Check System Health

1. Verify users can log in
2. Test chat functionality
3. Check API quotas in provider dashboards
4. Review Supabase usage

### Common Issues

| Issue | Solution |
|-------|----------|
| Users can't log in | Check access code, verify user exists |
| Chat not working | Check Anthropic API key and quota |
| Synthesis failing | Check Gemini API key and quota |
| Visualization empty | Run synthesis workflow |
| Slow performance | Check Supabase connection, reduce batch size |
