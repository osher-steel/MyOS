# Personal OS — Part 1 Master Build Prompt

You are my senior software architect, product engineer, and UI/UX collaborator.

I am building a **personal operating system / personal intelligence dashboard** for myself. This is primarily a personal and creative project, not a SaaS product. Optimize for:

1. usefulness to one user,
2. clean architecture,
3. privacy,
4. extensibility,
5. excellent UI/UX,
6. experimentation and learning,
7. avoiding unnecessary enterprise complexity.

Do **not** prematurely generalize the application for multiple customers.

The application will eventually include finance, news, music, events, goals, life administration, photography, a design studio, and a public portfolio. However, we are currently building **Part 1 only**.

---

# 1. PART 1 SCOPE

Build the foundation for four domains:

* Finance
* News / knowledge
* Music
* Events

These should feed a shared personal data layer accessible through:

* the web application,
* a personal API,
* a CLI,
* and eventually AI tools.

The architecture should roughly follow:

```text
Plaid ─────────┐
Spotify ───────┤
News/RSS ──────┤
Events ────────┤
               ↓
        Ingestion Layer
               ↓
    Normalize / Enrich / Dedupe
               ↓
           Firestore
               ↓
          Personal API
         /      |       \
       Web     CLI       AI
```

The dashboard is a **client of the personal data platform**, not the platform itself.

---

# 2. TECH STACK

Prefer:

### Frontend

* Next.js
* React
* TypeScript
* Tailwind
* reusable component architecture

### Backend

* Firebase Auth
* Firestore
* Firebase Storage where necessary
* Cloud Functions and/or Cloud Run
* Cloud Scheduler for recurring ingestion jobs

### Validation / Shared Types

Use Zod and TypeScript.

Maintain shared schemas rather than redefining domain objects across services.

### Integrations

Initial integrations:

* Plaid
* Spotify
* Ticketmaster or equivalent event sources
* RSS
* one or more news APIs
* direct/public publication feeds where appropriate

Architecture should allow additional sources later.

---

# 3. REPOSITORY STRUCTURE

Prefer a monorepo or similarly organized structure such as:

```text
personal-os/
├── apps/
│   ├── web/
│   └── cli/
│
├── functions/
│   ├── plaid/
│   ├── spotify/
│   ├── events/
│   ├── news/
│   └── api/
│
├── packages/
│   ├── schemas/
│   ├── taxonomy/
│   ├── firebase/
│   ├── api-client/
│   └── ui/
│
└── scripts/
```

Do not over-engineer package boundaries if a simpler implementation is appropriate.

---

# 4. CORE ARCHITECTURAL PRINCIPLE

Do NOT put every object into a generic universal collection.

Different domains should maintain appropriate domain models.

Examples:

```text
users/{uid}/accounts
users/{uid}/transactions
users/{uid}/budgets

users/{uid}/artists
users/{uid}/tracks
users/{uid}/listeningEvents

users/{uid}/events

users/{uid}/content
users/{uid}/storyClusters

users/{uid}/topics
users/{uid}/interactions
users/{uid}/integrationState
```

Finance, for example, should not be forced into the same abstraction as a news article.

However, articles, research papers, essays, learning resources, videos, and similar intellectual material MAY share a generic `ContentItem` abstraction.

---

# 5. TAXONOMY

The taxonomy is one of the most important parts of the system.

Create a hierarchical taxonomy with flat IDs assigned to content.

Primary domains:

```text
WORLD
BUSINESS
TECHNOLOGY
SCIENCE
SOCIETY
LOCAL
```

Example hierarchy:

```text
technology
└── computer-science
    ├── databases
    ├── distributed-systems
    ├── networking
    ├── security
    ├── software-architecture
    ├── programming-languages
    └── artificial-intelligence

business
├── startups
│   ├── fundraising
│   ├── acquisitions
│   └── venture-capital
├── economics
├── markets
└── industries
    ├── parking
    ├── marketplaces
    ├── mobility
    ├── logistics
    └── cities

science
├── biology
├── health
├── medicine
├── environment
├── climate
└── general-research

society
├── mental-health
├── children-and-technology
├── social-media
├── screen-time
├── education
└── AI-and-society
```

Geography must be modeled independently from topic.

Example:

```text
US
FR
PE
IL
CN
EU
US-FL
US-FL-MIAMI
```

This should allow an article to be classified as:

```text
topics:
- elections
- regulation

geographies:
- FR
```

Do not model France itself as a topic.

---

# 6. PERSONAL EDITORIAL PREFERENCES

Topics should support explicit preferences.

Example:

```typescript
TopicPreference {
  topicId: string

  explicitWeight: number
  learnedWeight: number

  preferences: {
    breaking: number
    analysis: number
    evergreen: number
    research: number
  }
}
```

Explicit and learned preferences MUST remain separate.

For example:

```text
Distributed Systems

breaking      low
analysis      very high
evergreen     very high
research      high
```

versus:

```text
Artificial Intelligence

breaking      low
analysis      medium
evergreen     medium
research      medium
```

The system should learn from behavior without allowing a few accidental interactions to completely override explicit preferences.

---

# 7. NEWS / KNOWLEDGE INGESTION

Support multiple sources.

Potential sources include:

* RSS
* news APIs
* publication feeds
* government sources
* research feeds
* local Miami publications
* technology publications
* science publications

Do not rely on a single news provider.

Pipeline:

```text
Source
  ↓
Fetch
  ↓
Normalize
  ↓
Store raw normalized item
  ↓
Deduplicate
  ↓
Classify
  ↓
Extract entities/geography
  ↓
Cluster into stories
  ↓
Rank
  ↓
Summarize
```

IMPORTANT:

AI enrichment must occur AFTER normalized source data has been stored.

Never make the ingestion pipeline:

```text
source → LLM → database
```

Prefer:

```text
source
↓
normalized stored item
↓
AI enrichment
↓
updated item
```

If the AI enrichment fails, the original item must remain usable.

---

# 8. CONTENT MODEL

Design something approximately like:

```typescript
ContentItem {
  id: string

  type:
    | "news"
    | "analysis"
    | "paper"
    | "learning"
    | "opinion"

  title: string
  source: string
  author?: string

  url: string
  canonicalUrl?: string

  publishedAt: Timestamp
  ingestedAt: Timestamp

  excerpt?: string

  topics: string[]
  geographies: string[]
  entities: string[]

  contentType?: {
    breaking?: boolean
    analysis?: boolean
    evergreen?: boolean
    research?: boolean
  }

  relevanceScore?: number
  importanceScore?: number
  noveltyScore?: number

  clusterId?: string

  summary?: string
  whyItMatters?: string

  liked: boolean
  saved: boolean
  opened: boolean
  dismissed: boolean
}
```

Modify this model where technically justified.

---

# 9. STORY CLUSTERING

Do not show five separate articles when five publications report the same development.

Create canonical story clusters.

Example:

```text
Reuters ──────┐
NYT ──────────┤
Le Monde ─────┤
FT ───────────┤
Politico ─────┘
       ↓
   StoryCluster
       ↓
one digest item
```

A cluster should retain its source articles so the user can choose which human-written reporting to read.

Possible model:

```typescript
StoryCluster {
  id: string

  headline: string
  summary: string

  articleIds: string[]

  topicIds: string[]
  geographies: string[]

  firstSeenAt: Timestamp
  latestUpdateAt: Timestamp

  importanceScore: number
  relevanceScore: number
}
```

Start with simple clustering using normalized headlines, entities, geography, and temporal proximity.

Embeddings/vector similarity can be introduced later.

---

# 10. NEWS EXPERIENCE

The AI should behave like an **editor/librarian**, not replace journalism.

Each story should ideally support three levels:

### Glance

One sentence explaining what happened.

### Understand

A concise synthesis containing:

* What happened
* Why it matters
* What changed
* What to watch next
* Areas of disagreement when appropriate

### Read

Links to original human-written sources.

The goal is to help decide:

> Is this worth more of my attention?

Do not generate unnecessarily long AI summaries when original journalism should be read instead.

---

# 11. PERSONALIZATION

Record interactions as events.

Example:

```typescript
Interaction {
  id: string

  entityType:
    | "content"
    | "event"
    | "artist"
    | "track"

  entityId: string

  action:
    | "view"
    | "open"
    | "like"
    | "save"
    | "dismiss"
    | "attend"

  timestamp: Timestamp
}
```

Maintain convenient state such as:

```text
liked: true
saved: true
```

on relevant documents, while ALSO preserving the interaction history.

Potential weighting:

```text
save             +4
like             +3
open source      +2
view             +0.2
dismiss          -2
not interested   -5
```

Treat this only as a starting heuristic.

---

# 12. CONTENT RANKING

Start with deterministic/simple scoring rather than machine learning.

Example:

```text
relevance =
    topicAffinity       * 0.35
  + geographyAffinity   * 0.15
  + sourceAffinity      * 0.10
  + importance          * 0.20
  + freshness           * 0.10
  + exploration         * 0.10
```

Maintain some exploration/serendipity so personalization does not create an extreme filter bubble.

Conceptually:

```text
~80% directly relevant
~10% important regardless of preference
~10% serendipity / intellectual exploration
```

These percentages should remain configurable.

---

# 13. FINANCE

Use Plaid as the initial financial ingestion layer.

Support:

* accounts
* transactions
* balances
* transaction synchronization
* personal categories
* budgets
* monthly summaries
* cash flow
* savings
* eventually assets/liabilities/net worth

Maintain provider data separately from personal interpretation.

Example:

```text
providerCategory = FOOD_AND_DRINK
personalCategory = dining_out
```

Never destroy source metadata when adding personal classifications.

Create derived financial snapshots so the frontend does not need to repeatedly aggregate the entire transaction collection.

Examples:

```text
financeSnapshots/{YYYY-MM}
```

Potential derived metrics:

* income
* spending
* spending by category
* budget remaining
* savings
* savings rate
* account balances
* net worth when available

---

# 14. MUSIC

Use Spotify initially.

Ingest:

* recently played tracks
* top artists
* top tracks
* artist metadata
* genres where available

Models may include:

```text
artists
tracks
listeningEvents
musicSnapshots
```

Preserve listening history when possible rather than only storing the current Spotify-generated rankings.

Generate useful derived information such as:

* top artists
* top genres
* recently discovered artists
* returning favorites
* listening changes over time

Music preferences should eventually inform event recommendations.

---

# 15. EVENTS

Aggregate events from multiple sources.

Begin with a broad event provider such as Ticketmaster plus hand-selected Miami sources.

Potential future sources:

* venues
* museums
* galleries
* local event calendars
* independent music venues
* cultural institutions

Normalize events into a common schema.

Example:

```typescript
Event {
  id: string

  title: string
  description?: string

  startAt: Timestamp
  endAt?: Timestamp

  venue: {
    name: string
    lat?: number
    lng?: number
  }

  city: string

  categories: string[]
  artists?: string[]

  url?: string

  price?: {
    min?: number
    max?: number
  }

  source: string
  sourceId: string

  relevanceScore?: number

  liked: boolean
  saved: boolean
  attending?: boolean
}
```

Use source identifiers and canonical IDs to prevent duplicates.

Eventually calculate event relevance using signals such as:

```text
music affinity
+
event/category preference
+
location
+
calendar availability
+
price
+
previous interactions
```

Do not implement all of this immediately.

---

# 16. PERSONAL API

Create a clean API between storage and clients.

Potential routes:

```text
GET /v1/today
GET /v1/digest

GET /v1/finance/summary
GET /v1/finance/transactions
GET /v1/finance/budgets

GET /v1/music/summary
GET /v1/music/artists

GET /v1/events
GET /v1/events/recommended

GET /v1/news
GET /v1/news/:cluster

GET /v1/content/saved

POST /v1/content/:id/like
POST /v1/content/:id/save
POST /v1/content/:id/dismiss

POST /v1/events/:id/save
```

Do not expose arbitrary Firestore querying.

---

# 17. AI ACCESS

AI should consume controlled tools rather than receive unrestricted database access.

Potential tools:

```text
getFinancialSummary()
searchTransactions()

getCurrentNews()
searchSavedContent()

getUpcomingEvents()

getMusicPreferences()

getTopicPreferences()
```

Architecture:

```text
Firestore
    ↑
Personal API
    ↑
AI Tool Layer
    ↑
Claude / GPT / local model / CLI
```

The AI provider should be replaceable.

Do not couple the personal data system to one LLM provider.

---

# 18. CLI

Build a lightweight CLI consuming the same Personal API.

Potential commands:

```bash
os today

os money
os money month

os news
os news france
os news cs

os events
os events weekend

os music
os music month

os saved
os saved search "distributed systems"

os ask "What are the important things happening today?"
```

The `ask` functionality should determine which approved personal tools/data are needed rather than giving an LLM unrestricted database access.

---

# 19. DIGEST ENGINE

Create a digest-generation service.

Conceptually:

```typescript
generateDigest({
  date,
  mode: "morning"
})
```

Candidate selection should happen algorithmically before LLM processing.

Do NOT dump the entire article database into an LLM and ask it what matters.

Example morning composition:

```text
World              3–5
Business           2–3
Technology         2
Science            2
Society            1–2
Miami               2
Learn Something     1
Events               3–5
```

Eventually support multiple digest modes:

```text
morning
evening
sunday
```

But implement morning first.

---

# 20. PRIVACY PRINCIPLES

This is not intended to be SOC 2 compliant.

However, this project is deliberately being used to practice good privacy and security architecture.

Treat privacy as an architectural constraint.

Suggested classifications:

```text
RESTRICTED
- finance
- calendar

PRIVATE
- listening history
- event attendance
- saved content
- preferences

INTERNAL
- derived analytics

PUBLIC
- none in Part 1
```

Apply least privilege.

For example:

```text
news-worker
→ news/content only

spotify-worker
→ music only

plaid-worker
→ finance only
```

A compromise of one integration should not automatically expose unrelated domains.

Practice:

* least privilege
* explicit trust boundaries
* secure secret management
* narrow API permissions
* data minimization
* deletion
* export
* retention policies
* auditability
* separation of raw and derived data
* avoiding sensitive information in logs

AI should never receive more personal information than is necessary to answer the current query.

---

# 21. UI / UX

Do NOT build a generic SaaS dashboard.

This application is also a design-learning project.

The interface should eventually feel like a combination of:

* personal morning newspaper
* personal terminal
* financial dashboard
* cultural discovery tool
* personal archive

Prioritize:

* typography
* hierarchy
* information density
* editorial layout
* whitespace
* intentional interaction
* readability
* strong visual rhythm

Avoid:

* excessive cards
* generic gradients
* gratuitous glassmorphism
* dashboard-template aesthetics
* unnecessary pill-shaped UI
* excessive icons
* AI-generated-looking layouts

The home page should eventually answer:

> What do I need to know about my life and the world today?

Do not prematurely lock in a design system. The project will later include a Design Studio specifically for visual experimentation.

---

# 22. INITIAL HOME EXPERIENCE

Part 1 should eventually support something conceptually like:

```text
SUNDAY · AUGUST 16

GOOD MORNING

MONEY
August spending
Budget remaining
Savings progress
Noteworthy transactions

NEWS

World
Business
Technology
Science
Society
Miami

Each story:
headline
one-line context
why it matters
sources
save / like / dismiss

LEARN SOMETHING
One interesting CS/science/economics/etc. concept

EVENTS
Interesting things happening this week

MUSIC
Recent listening
Current favorites
Discoveries / rediscoveries
```

This is conceptual, not a rigid UI specification.

---

# 23. BUILD ORDER

Work incrementally.

## Phase 1 — Foundation

Build:

* project structure
* Firebase
* Auth
* Firestore
* shared schemas
* taxonomy
* integration state
* Personal API skeleton
* privacy boundaries

## Phase 2 — Finance

Build:

* Plaid integration
* account sync
* transaction sync
* categories
* budgets
* monthly summaries
* basic finance UI

## Phase 3 — News

Build:

* RSS/news ingestion
* normalized content
* taxonomy classification
* deduplication
* basic clustering
* likes
* saves
* dismiss
* ranking
* morning digest

## Phase 4 — Spotify

Build:

* OAuth
* recently played
* artists
* tracks
* listening history
* music summaries

## Phase 5 — Events

Build:

* broad event API
* selected Miami sources
* normalization
* deduplication
* saved events
* music/event affinity

## Phase 6 — Unified Home

Combine the domains into the first useful morning experience.

## Phase 7 — CLI / AI

Expose controlled personal tools and implement the CLI.

---

# 24. MVP DEFINITION

Part 1 is successful when I genuinely want to open this application in the morning.

At minimum I should be able to see:

### Money

* current financial state
* monthly spending
* budget progress
* savings progress

### News

* personally relevant stories
* clear categorization
* deduplicated coverage
* links to original human-written journalism
* like/save/dismiss
* one interesting learning item

### Events

* interesting upcoming local events
* personalized ranking
* save functionality

### Music

* recent listening
* current favorites
* trends/discoveries

And the same underlying system should be queryable through the Personal API and eventually the CLI/AI layer.

---

# 25. FUTURE CONTEXT — DO NOT BUILD YET

The system will eventually expand into:

### Part 2 — Design Studio

* design-system experiments
* typography
* color
* components
* layouts
* mood boards
* visual references

### Part 3 — Photography Archive

* private photo library
* albums
* metadata
* favorites
* eventual private/public publishing

### Part 4 — Public Portfolio

* experience
* projects
* case studies
* photography
* writing
* experiments

Private content should eventually be explicitly **published into a separate public data surface**, rather than having the public website query private collections using a visibility filter.

### Part 5 — Possible External Use

Potentially open source the system or build customized versions for other people.

Do NOT optimize for this now.

The current application should be unapologetically designed for one person.

---

# 26. ENGINEERING PHILOSOPHY

When making technical decisions:

**Prefer:**

* boring reliable infrastructure
* explicit data contracts
* modular boundaries
* recoverable ingestion pipelines
* idempotent jobs
* observable failures
* source provenance
* privacy by architecture
* simple algorithms before ML
* deterministic logic before AI
* AI where semantic reasoning provides genuine value

**Avoid:**

* microservices for their own sake
* premature multi-tenancy
* unnecessary abstractions
* premature vector databases
* AI for deterministic operations
* storing only AI-generated representations
* destructive normalization
* unrestricted LLM database access
* premature scalability work

This system serves one user. Optimize accordingly.

---

# 27. HOW TO WORK WITH ME

Do not attempt to generate the entire application in one response or one enormous implementation.

Act as a senior engineer collaborating with me.

For every phase:

1. understand the existing codebase before modifying it,
2. identify the smallest coherent next milestone,
3. explain major architectural decisions,
4. implement that milestone,
5. validate it,
6. identify technical debt or privacy implications,
7. then proceed to the next milestone.

When an implementation decision has meaningful tradeoffs, explain them briefly before choosing.

Do not ask me about trivial implementation details that can reasonably be decided from this specification.

Do ask before making decisions that materially alter:

* architecture,
* privacy boundaries,
* data ownership,
* major dependencies,
* cost,
* or the product direction.

Maintain documentation of the architecture and important decisions as the system evolves.

Above all, remember:

**This is not a SaaS dashboard. It is a personal data platform, morning intelligence system, creative software project, and long-term experiment in building a digital environment around one person's life.**

Start by proposing the concrete **Phase 1 architecture, Firestore schema, repository structure, security boundaries, and implementation sequence**. Do not begin implementing until that foundation has been clearly defined.
