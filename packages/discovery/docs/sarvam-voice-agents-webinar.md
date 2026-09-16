# Sarvam AI — Voice Agents on the Indus Platform
### Technical notes from the product webinar (timestamps removed, non-technical content stripped)

> Speaker: Aditya Davla, product lead for the voice agents charter at Sarvam AI.
> Note on names: the auto-transcript garbles several proper nouns. Where the intent is clear, corrected spellings are used — "Sarvam" (not Serbam/serum), "Indus" / indus.sarvam.ai, "Saarika" for the ASR model, "Bulbul" for the TTS model. Model size figures quoted in the Q&A were inconsistent in the source ("105B" and "15B" both appear); these are flagged inline rather than guessed at.

---

## 1. Platform scale and production context

- The same platform enterprises use for production workloads is now generally available to the public — same reliability, compliance, security and data-residency posture.
- Roughly **350 million+ minutes spoken in production, entirely by AI** (no human agents, no NLP/IVR padding) over the preceding year — about 665 years of talk time.
- Largest single deployment described: a **10,000-seat-equivalent contact centre** run out of one office, without degrading latency or quality.
- Deployment reality learned from enterprise rollouts: an agent is only useful once it is wired into **telephony** and into **systems of record**. Those integrations are treated as first-class platform concerns, not afterthoughts.

---

## 2. Architecture: models plus harness

### The naive view
A voice agent is three models plus turn-taking, dropped onto telephony:

| Job | Component |
|---|---|
| Listening | ASR (Saarika) |
| Thinking | LLM |
| Speaking | TTS (Bulbul) |
| Glue | Turn-detection + orchestration |

### The actual shape
The three models and the turn logic are the **harness**. Around the harness sit three product surfaces, and this structure is mirrored in the UI:

- **Build** — authoring the agent and iterating on it as production signal comes in.
- **Deploy** — telephony, integrations, systems of record, web embedding, campaigns.
- **Monitor** — QC over production calls, analytics, and deciding what to fix next.

### Opinionated design calls inside the harness

**1. Single-state agents only.**
No complex multi-state conversation graphs. Instead, the LLM is trained to follow instructions written in one long prompt. Consequences: debugging is a matter of scrolling through a document to find the paragraph that is wrong; the authoring UX stays simple; failure localisation is cheap.

**2. Indic-native pipeline (the key differentiator).**
Text stays in the Indic script end to end rather than being romanised:
- ASR outputs Hindi in Devanagari → LLM receives Devanagari
- LLM emits code-mixed (Hinglish) Hindi text → TTS receives it directly
- TTS is trained on code-mixed input, so it renders mixed-language text naturally

Emergent benefits: higher ASR accuracy, better language comprehension by the LLM, and natural-sounding code-mixed speech.

**3. Standard, boring interfaces.**
The harness uses plain function calling and a conventional agentic loop. The stated principle: models will keep improving, so the harness should track whatever shape frontier models converge on rather than inventing bespoke abstractions.

**4. Own models, co-designed with the harness.**
The models are trained partly *for* this harness and the harness is built *for* these models, which enables self-improving loops between the two.

---

## 3. Build walkthrough — creating an agent

Worked example used throughout: an **outbound appointment-booking agent for a dermatology clinic**. A user fills a form on the clinic website; the agent calls them, captures the skin issue, and books a slot.

### Workspaces
Create a workspace (e.g. `demo`) for a clean slate. Workspaces sit under the organisation and isolate agents, numbers, campaigns and analytics.

### Genie — the agent that builds agents
Genie is a copilot that scaffolds a voice agent from a natural-language brief. It has **web search** and **read/write access to the agent's own configuration** (prompt, tools, variables).

Example brief given verbatim in the demo:
> Build a derma clinic appointment booking agent, mock the tools. User has filled a form on the website and we're making an outbound call. We have the user's name and phone number.

Genie asks clarifying questions (clinic name, appointment type), then generates the prompt, mock tools, and input/output variables. Because it can search the web, pointing it at a real brand (e.g. "build an agent for Mamaearth") yields a well-grounded first draft.

### The Canvas
The prompt-authoring surface. Layout:
- **Top bar** — agent hierarchy, draft versions, test entry point
- **Centre** — the prompt document
- **Right** — Genie copilot
- **Left** — tools, variables, settings

Editing behaves like Notion:
- `\` (backslash) → formatting menu (H1/H2, lists, etc.)
- `@` → insert references to **variables** and **tools** inline in the prompt

### Tools

**Custom API tools.** An API tool lets the agent call an external system mid-conversation — fetch data, or write data and read the response. Configuration fields:
- Tool name and description (the description is what the LLM uses to decide when to call it)
- Execution point: at conversation start, mid-conversation (function-called), or at conversation end
- Request definition — a cURL can be pasted directly and is parsed into the config

For the demo, Genie created two **mock** tools returning canned responses:
- `check_appointment_slot` — read: which slots are free
- `book_appointment_slot` — write: commit the booking

A more mature version of the same agent used six tools.

**System tools.** Present on every agent, exposed as function calls:
- `end_interaction` — hang up at any point
- `knowledge_base` — query an attached knowledge base
- `data_validator` — see §8
- *(previewed)* call forwarding, for human-in-the-loop transfer

**Tool latency budget.** Hard limit is **30 seconds**; the recommendation is **3–5 seconds**, configurable per tool. Long-running agent frameworks (e.g. Google ADK chains taking 10–15s) are a poor fit — anything exposable behind a low-latency API works fine.

### Variables

Two kinds, both referenceable inside tools:

**Input variables — personalise the conversation.**
Created with a name and a default value; the default is overridden per-call at campaign or API time. Inserted into the prompt via `@`. Example: writing `You are calling on behalf of @company_name` sends `You are calling on behalf of DermaCo` to the LLM, or whatever value that call was seeded with.

**Output variables — extract structured data from the conversation.**
Evaluated **after** the call: the full transcript plus every output variable's extraction prompt goes to the LLM in one pass.

Each output variable has a name, a data type and an extraction prompt.

- *Enum example* — `disposition`, type enum, allowed values: `appointment_booked`, `callback_requested`, `no_slots`, `declined`, `wrong_person`, … The extraction prompt tells the LLM how to choose.
- *String example* — `call_summary`, type string, extraction prompt: "a one-to-two-line description of what happened on the call."
- The mature demo agent used `call_disposition`, `call_summary`, `visit_reason`.

### Goals
A goal defines **when a call counts as a win**, expressed against output variables — e.g. *goal achieved when `call_disposition == appointment_booked`*. Goals drive the Monitor section, which then segments calls into goal-achieved vs not and surfaces insight on what moves that rate.

---

## 4. Settings — runtime configuration

Organised as **Speaking / Thinking / Listening / Language**. Defaults are recommended for most use cases; touch these only when a specific use case breaks.

**Speaking (TTS — Bulbul v3)**
- ~35 voices, male and female, recorded by Indian voice actors on heavily vernacular data
- Speaking speed — **~1.15× works well across speakers**
- Pitch — raise or lower per use case
- Pronunciation dictionary (advanced)

**Thinking (LLM)**
- Model selection
- **Temperature** — lower for stricter instruction compliance, higher for more creative phrasing
- Knowledge base attachment — upload PDF / Word / PowerPoint, add a document description, and the agent can query it

**Listening (ASR / turn-taking)**
- Allow caller interruption: on/off
- **Eagerness** — lower values make the agent respond faster and listen less; higher values make it more patient
- **Interruption threshold** — needs tuning for noisy environments; in noisy conditions, naive interruption handling misfires

**Environment**
Synthetic background ambience (e.g. "quiet office") at an adjustable level. Rationale: a perfectly silent background is uncanny and tips callers off that they're talking to a bot; a contact-centre floor sounds normal.

**Language**
- Mid-call language switching, on or off
- Initial language selection
- **Auto-detect switching** — if the caller switches from Hindi to Telugu mid-sentence, the agent follows

**Nudges and voicemail**
- Nudge silent callers after a configurable interval (e.g. 7s or 15s): *"Are you still there? I just wanted to check on your dermatologist appointment."*
- Hang up after N unanswered nudges, so minutes aren't burned
- Leave a voicemail when voicemail is detected
- A **sidecar harness** detects voicemail and hold-music reliably — if someone parks the agent on hold, the call is cut rather than left to burn minutes

All of the above — interruption handling, language switching, background ambience — is included at no additional price.

---

## 5. Testing the agent

### Playground / Test Agent
- Talk to the agent by **voice**, or **type** to it to test the LLM without the fatigue of speaking
- **Override input variables** per test run (e.g. change the customer name from Sakshi to something else)
- **Swap the speaker** mid-testing — hear the same agent as a male voice, or in Bengali
- Inline visibility of **tool calls**: the request params and the raw tool response are shown in the transcript
- At the end of the run, the **extracted output variables** are displayed — in the demo: disposition `booked`, a correct summary, and visit reason "large pimple on the face"
- **Conversation history** is retained so earlier test runs can be revisited
- **Add a phone number** (OTP-verified) to test over real telephony — the point being that web-call behaviour and telephone behaviour differ meaningfully

Stated expectation: Genie will not one-shot a good agent, because *AI doesn't have taste*. The loop is test → read the transcript and tool calls → edit the canvas → retest.

### Automated tests / simulation
Genie can author a test suite for the agent. Each test is a **simulated user scenario** plus a list of **expected behaviours** in natural language.

Example scenario — *standard smooth appointment booking*:
- Agent verifies user identity at the start of the call
- Agent asks about and acknowledges the reason for the visit
- Agent retrieves and offers appointment slots
- Agent informs the user of necessary preparation steps
- (added live) Agent always calls the `book_appointment` tool

Tests can be named and run N times. The report shows the simulated transcript with each expected behaviour marked pass/fail.

Failure example from the demo: the expected behaviour was that the agent confirms a requested 11:30 callback time back to the user. The transcript showed the user saying 11:30 and the agent never confirming — so the failure points straight at the callback section of the prompt as the thing to fix.

---

## 6. Deploy

### Telephony and phone numbers
The observation driving this: building the agent is easy, wiring up telephony is the painful part. Sarvam partners with a telephony provider so numbers can be provisioned in-platform.

Flow:
1. KYC — individual (PAN + Aadhaar, OTP-verified) or business
2. Browse available numbers by circle (079, 080, … series)
3. Buy and import the number — typically about **two minutes** end to end

### Outbound campaigns
1. Name the campaign
2. Select the agent and the **specific agent version** (e.g. v6)
3. Select the connection / phone number
4. Upload a **cohort file** and map columns to input variables (phone number, user name, service type …). A live preview renders after mapping; rows can be cycled through to confirm the import
5. **Validate** — invalid rows are reported and downloadable as an error file
6. Configure the run: start time (immediate ≈ 2 minutes out), end time, **CPS** (calls per second), permitted calling window, and **retry rules per outcome** — busy / no-answer / failed
7. Configure a **webhook URL** to receive per-attempt data
8. Review, place a few **test dials** to saved or ad-hoc numbers, then launch

Post-launch status is visible on the campaign, and campaigns can be cancelled.

### APIs
Everything in the UI is available programmatically:
- **Outbound campaign APIs** — full campaign lifecycle
- **Instant outbound API** — fire a single call, so you can build your own orchestration or journey around it
- **Inbound deployment APIs**
- **Data fetch APIs** — list interactions, list attempts, fetch transcripts
- **Webhooks** — per-attempt payloads whether or not the call connected; this is the recommended way to get call metadata (caller number, disposition, etc.) rather than reading the UI
- Docs include **recipes and guides** — best-practice orchestration patterns for common use cases

### MoEngage integration
A Sarvam voice agent can be dropped in as a **node inside a MoEngage journey**. Cart-recovery example: WhatsApp at 10 minutes → SMS at 25 minutes → push notification → if none convert, a voice agent calls to ask what went wrong and present an offer.

### On-premise
Available for very large enterprise deals; the public product is API-based.

---

## 7. Monitor

### Standard analytics
The dashboard is laid out as the **journey of a call**:
1. **Connectivity** — volume, connectivity rate, unique connects vs unique attempts
2. **Engagement** — latency profile, call duration distribution, minutes, short-call percentage
3. **Goal achievement** — driven by the goal defined at build time
4. **Tool calls** — whether tools fired during the conversation
5. **Group-by cuts** and **call logs**

**Call logs** expose phone numbers, contact numbers, end reason, connectivity status and other per-call metadata, with column selection.

### Custom boards
An effectively full dashboarding layer over the call data.
- Inspect the **schema** and write SQL-style queries directly, **or** describe the widget in natural language and have it generate the query
- Demo: *"give me a chart which plots the number of minutes I have done over the last two weeks"* → query generated → accepted → runs → returns a table → switch the render to a **line chart** → resize → save as a named widget on the board
- Boards can be built for internal use or for end-customer consumption

---

## 8. Latency engineering

Why the pipeline is fast despite being a multi-model cascade:

1. **Single data centre, end to end.** ASR, LLM and TTS — plus the CPU hardware running the harness — are co-located. This alone accounts for roughly **50–200ms** of savings versus a distributed setup.
2. **Small, purpose-trained models.** The LLM is deliberately much smaller than a frontier chat model, and is run in **non-thinking mode** — no reasoning tokens before the reply.
3. **Fine-tuned on the right distribution.** Training data is conversational: short sentences, natural spoken responses, and reliable tool calling. The explicit trade-off — *this model will not make a good coding agent* — is accepted, because voice needs little deliberation and a lot of responsiveness. A small model given very high-quality data covers that surface well, at lower latency and lower cost.
4. **Same infrastructure for everyone.** Web-call latency heard in the demo is the latency on production telephony too; there is no separate demo infra. Tens of thousands of concurrent production calls were running during the webinar.

Additional mid-pipeline optimisations exist but were not detailed.

---

## 9. Practical techniques and known failure modes

**Capturing phone numbers reliably** — a common weak point for voice agents. Two approaches:
- On inbound telephony, don't ask: the caller's number is provided by the platform.
- On web or other non-telephony channels, prompt the agent to **read the number back and confirm**, repeating until the caller confirms. Combine with the **data validator** system tool.

**Data validator tool.** Validates a collected value's *format* before the agent proceeds. Configure a tool name, a description telling the LLM what it's checking (e.g. "verifies whether the phone number collected is a valid phone number"), a value type (e.g. string) and a **regex** constraint (e.g. 10 digits). Format validation and read-back confirmation are complementary: the regex catches malformed values, the read-back catches correctly-formatted but misheard ones.

**Tool responses not being used by the agent.** If the agent calls an API tool but doesn't parse or act on the response, the fix generally involves capturing the response into variables and prompting explicitly against them — flagged as needing case-by-case support.

**Multi-agent conversations** (one user, two independent agents) are not supported out of the box; the intended pattern is an **agent / sub-agent architecture**, which was previewed as coming.

**Human transfer** — a call-forwarding tool was previewed; the mechanism is a tool call that rings a human who then picks up.

**Genie usage is free** — building sessions do not consume credits. Billing is on usage only.

**Building a custom pipeline with raw Sarvam models** will generally show higher latency than the managed agents platform, because you lose the co-location and the tuned harness. Recommended model for a self-built conversational stack: the Sarvam conversational model in **non-thinking mode** (a dedicated `-conversations` variant was announced; the parameter count was stated inconsistently in the session).

**Model roadmap mentioned:** Saarika v4 already live on the API and coming to voice agents shortly; Bulbul v4 "very soon".

---

## 10. Pricing

| Tier | Subscription | Effective rate |
|---|---|---|
| Business | ₹10,000 (yields ₹12,000 in credits) | ₹4 / minute |
| Scale | ₹50,000 | ₹3.5 / minute |
| Custom | — | Negotiated above ~3–5 lakh minutes |

Credits carry approximately a one-year expiry.

---

## Support routing
- Technical / platform support and bug reports: **developer@sarvam.ai**
- Business, plans, credits, enterprise deals: the Contact Us form on the Sarvam website
