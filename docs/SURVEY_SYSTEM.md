# Survey System Documentation

The survey system implements Schwartz's PVQ-RR (Portrait Values Questionnaire - Revised) and related experiments for measuring and comparing human values.

## Overview

The survey system enables researchers to:

- Collect standardized value measurements using the PVQ-RR
- Compare manual survey responses with AI-predicted values
- Run controlled experiments on value perception
- Visualize value profiles using multiple chart types

## Survey Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Training  ──▶  Survey     ──▶  Stage 1  ──▶  Stage 2           │
│  Modal          PVQ-RR         Topic-        Persona             │
│                 Survey         Context       Embodiment          │
│                                Graph                             │
│                    │                              │              │
│                    ▼                              ▼              │
│              ┌──────────┐                  ┌──────────────┐     │
│              │ Generate │                  │   Stage 3    │     │
│              │   LLM    │                  │    Chart     │     │
│              │Predictions│                 │  Evaluation  │     │
│              └──────────┘                  └──────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Stages

### Stage 0: Training Modal

**Purpose**: Introduces participants to Schwartz values theory.

**Content**:
- Explanation of the 19 basic values
- Value circle diagram showing relationships
- Example personas demonstrating value profiles
- Practice questions to ensure understanding

**Location**: `components/survey/Stage0Modal.tsx`

### Survey: PVQ-RR Survey

**Purpose**: Collect ground-truth value measurements.

**Implementation**:
- 57 standardized questions (3 per value)
- 1-6 Likert scale ("Not like me at all" to "Very much like me")
- Gender selection for pronoun matching
- 3 user-generated questions for personalization

**Scoring**:
```typescript
// For each of 19 values:
1. Calculate raw score = average of 3 questions
2. Calculate MRAT = mean of all 57 responses
3. Centered score = raw score - MRAT
```

**Location**: `components/survey/survey-form.tsx`

### Stage 1: Topic-Context Graph

**Purpose**: Let participants explore AI-extracted values from their conversations.

**Features**:
- Interactive Topic-Context Graph
- Click nodes to see conversation evidence
- Compare extracted values with survey results

**Location**: `components/survey/ValuesGraphModal.tsx`

### Stage 2: Persona Embodiment Experiment

**Purpose**: Test how well AI can embody user's values in novel situations.

**Design**:
- 5 rounds (2 WVS scenarios + 3 user-generated questions)
- 4 personas per round:
  1. **User Embodiment**: Based on chat history
  2. **Anti-User**: Opposite personality
  3. **Schwartz Values**: Based on PVQ scores
  4. **Random Schwartz**: Control condition
- User rates each persona 1-5

**Location**: `components/survey/Stage2Modal.tsx`

### Stage 3: Chart Evaluation

**Purpose**: Direct comparison of manual vs. AI-predicted value charts.

**Design**:
- Round 1: Manual vs. Anti-Manual (validation)
- Round 2: LLM vs. Anti-LLM (validation)
- Round 3: Manual vs. LLM (key comparison)
- Binary forced choice per round
- Final preference recorded

**Location**: `components/survey/Stage2Modal.tsx`

## The 19 Schwartz Values

| Code | Value Name | Description |
|------|-----------|-------------|
| SDT | Self-Direction Thought | Freedom to develop ideas |
| SDA | Self-Direction Action | Freedom to determine actions |
| ST | Stimulation | Excitement, novelty, challenge |
| HE | Hedonism | Pleasure and sensuous gratification |
| AC | Achievement | Success through demonstrated competence |
| POD | Power Dominance | Control over people |
| POR | Power Resources | Control through material resources |
| FAC | Face | Maintaining public image |
| SEP | Security Personal | Safety in immediate environment |
| SES | Security Societal | Safety and stability in society |
| TR | Tradition | Maintaining cultural customs |
| COR | Conformity Rules | Compliance with rules and laws |
| COI | Conformity Interpersonal | Avoiding upsetting others |
| HUM | Humility | Recognizing one's insignificance |
| UNN | Universalism Nature | Protection of the natural environment |
| UNC | Universalism Concern | Commitment to equality and justice |
| UNT | Universalism Tolerance | Acceptance of those who are different |
| BEC | Benevolence Care | Caring for close others' welfare |
| BED | Benevolence Dependability | Being reliable for close others |

## Services

### Prediction Service (`app/values/services/prediction-service.ts`)

Batch prediction of all 19 values at once:

```typescript
predictBatchValuesFromUserChats(userId): Promise<BatchPredictionResult>
```

Uses Gemini to analyze chat history and predict value scores.

### Individual Prediction Service (`app/values/services/individual-prediction-service.ts`)

Per-question prediction with confidence scores:

```typescript
predictIndividualPVQFromUserChats(userId, gender): Promise<IndividualPredictionResult>
```

Each question gets:
- Natural language response
- Score (1-6)
- Reasoning
- Confidence score (0.0-1.0)
- Thinking summary

### Chart Evaluation Service (`app/values/services/chart-evaluation-service.ts`)

Manages Stage 3 experiment:

```typescript
getChartEvaluationData(userId): Promise<ChartEvaluationData>
generateAndStoreAllCharts(userId, manualData, llmData): Promise<void>
saveStage3Results(userId, round, winner): Promise<void>
```

### Chart Generation Service (`app/values/services/chart-generation-service.ts`)

Creates comparison charts:

```typescript
generateAntiPersonChart(originalData): Promise<ProcessedValueResult[]>
generateRandomChart(): ProcessedValueResult[]
```

### Stage 2 Service (`app/values/services/stage2-service.ts`)

Manages persona embodiment experiment:

```typescript
getStage2Status(userId): Promise<Stage2Status>
generateAllPersonaResponses(userId, scenario): Promise<PersonaResponses>
saveRoundRatings(userId, roundNumber, ratings): Promise<void>
```

## Database Tables

### user_pvq_responses

Manual survey responses:

| Column | Type | Description |
|--------|------|-------------|
| user_id | UUID | Primary key, FK to users |
| gender | TEXT | 'male' or 'female' |
| q1-q57 | INTEGER | Survey responses (1-6) |
| user_generated_q1-q3 | TEXT | Custom questions |

### user_llm_individual_responses

Per-question AI predictions:

| Column | Type | Description |
|--------|------|-------------|
| user_id | UUID | Primary key |
| pvq_version | TEXT | 'PVQ-RR' |
| gender | TEXT | Gender used for pronouns |
| q1-q57 | INTEGER | Predicted scores |
| raw_responses | JSONB | Full AI responses |
| model_name | TEXT | Model used |
| prompt_metadata | JSONB | Generation info |

### user_llm_batch_responses

Batch value predictions:

| Column | Type | Description |
|--------|------|-------------|
| user_id | UUID | Primary key |
| model_name | TEXT | Model used |
| sdt_score - bed_score | NUMERIC | Centered scores for 19 values |
| raw_reasoning | JSONB | Reasoning per value |
| prompt_metadata | JSONB | Generation info |

### stage3_experiment

Chart evaluation data:

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK to users |
| round_1_manual_data | JSONB | Manual chart data |
| round_1_anti_manual_data | JSONB | Anti-manual chart |
| round_2_llm_data | JSONB | LLM chart data |
| round_2_anti_llm_data | JSONB | Anti-LLM chart |
| round_1/2/3_completed | BOOLEAN | Completion flags |
| round_1/2/3_winner | TEXT | User selections |
| final_choice | TEXT | 'manual' or 'llm-individual' |

### stage2_experiment

Persona embodiment data:

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK to users |
| round_number | INTEGER | 1-5 |
| scenario_name | TEXT | Scenario identifier |
| scenario_prompt | TEXT | Full scenario text |
| *_response | TEXT | Persona responses |
| *_reasoning | TEXT | Persona reasoning |
| *_rating | INTEGER | User ratings (1-5) |

## Value Processing

### value-utils.ts

Core value processing logic:

```typescript
// Calculate centered scores
processValueResults(responses: Record<string, number>, gender: string): ProcessedValueResult[]

// Value metadata
VALUE_DATA: Record<string, {
  name: string,
  code: string,
  color: string,
  angle: number,
  description: string
}>

// Question to value mapping
PVQ_BASIC_VALUES_ITEMS: Record<string, number[]>
```

### ProcessedValueResult

```typescript
interface ProcessedValueResult {
  name: string;      // e.g., "Self-Direction Thought"
  code: string;      // e.g., "SDT"
  rawScore: number;  // Average of 3 questions
  centeredScore: number; // rawScore - MRAT
  color: string;     // For visualization
  angle: number;     // Position on value circle
}
```

## Visualizations

### Circular Visualization

Primary value chart showing scores on a circular layout matching Schwartz's value circle.

**Location**: `components/survey/visualizations/CircularVisualization.tsx`

### Bar Visualization

Alternative bar chart view for comparing values.

**Location**: `components/survey/visualizations/BarVisualization.tsx`

### Quadrant Visualization

Groups values by higher-order categories (Openness, Self-Enhancement, Conservation, Self-Transcendence).

**Location**: `components/survey/visualizations/QuadrantVisualization.tsx`

## Customization

### Adding New Questions

1. Add question to `data/pvq-questions.json`:
```json
{
  "id": 58,
  "text": "Your question text...",
  "value_code": "SDT"
}
```

2. Update database schema to add column
3. Update survey form to include question
4. Update value mappings in `value-utils.ts`

### Modifying Experiments

Stage 3 scenarios can be modified in `stage2-service.ts`:

```typescript
const WVS_SCENARIOS = [
  {
    name: "community_vs_individual",
    prompt: "Your scenario prompt..."
  }
];
```

### Changing Visualization Colors

Modify `VALUE_DATA` in `value-utils.ts`:

```typescript
SDT: {
  name: "Self-Direction Thought",
  color: "#4A90D9", // Change this
  // ...
}
```
