# Feature Planning — Maintenance-Scheduler Endpoint & Modular Decision Engine

**Version:** 1.0 · **Date:** 2026-07-26
**Context:** NEBULA X ("The Living Railway"), LTA-mentored, 18–20 Sep 2026, teams of 3–4. Three independent tracks: **PS1 AI Maintenance Scheduler**, **PS2 Smart Travel Companion**, **PS3 Predictive Fault Detection** (your track). Judged on technical execution, problem fit, ease of use, real-world impact.

---

## 0. Ground truth that changes the analysis

Before either feature: what NEBULA X actually asks for, since both proposals were designed against an *assumed* hackathon shape that turns out to be slightly different from the real one.

- **PS1's actual brief** is not "consume fault alerts" — it's *"a tool that automatically detects conflicts between maintenance requests, flags them clearly, suggests alternatives and automates the scheduling process."* That's a **scheduling/constraint-conflict problem** (technicians, depot slots, track-possession windows competing for time), not necessarily a real-time telemetry consumer. A PS1 team's natural MVP ingests a table of *planned* maintenance requests — it may never be built to receive streaming anomaly events at all.
- **PS3's actual brief** (yours) is *"a tool embedded with models (AI/ML) to detect anomalies amidst the signals from various train systems."* Detection only. Nothing in the brief asks for response orchestration or chain-of-command tooling.
- **Tracks are independent.** No stated mechanism for teams to combine, no cross-track judging criterion. You will not be teamed with a PS1 group, and you have no guarantee one exists in a state that could receive anything from you.
- **Judging is per-track** on technical execution / problem fit / ease of use / real-world impact, by railway professionals.

This matters because it reframes both features from "build the real thing" to **"build the artifact that best demonstrates real-world integration/operational thinking to a PS3 judge, standing entirely on its own."** That's a different, cheaper, lower-risk design target than what either feature sounds like at first read — and it's the lens the rest of this document uses.

---

## 1. Verdicts

| Feature | Verdict | Scope | Est. hours |
|---|---|---|---|
| Maintenance-scheduler integration endpoint | **Build — narrow** | Spec + real endpoint + your own mock consumer. No live dependency on another team. | 4–6h |
| Modular decision/escalation engine | **Build — scoped down** | Fixed hierarchy, rule-based activation/routing (DMN-style table), recommend-only. Drop dynamic org-reshaping. | 6–9h |

Neither is in PS3's judged brief. Both are justifiable *only* under the "real-world impact" / "ease of use" axes, and only if they don't cannibalize hours from the ML bake-off — which is what's actually judged as "technical execution" for your track. Treat both as **polish on top of a working detector**, not parallel main features. If you're behind on the core pipeline at hour 30, cut these before you cut a model ablation.

---

## 2. Feature 1 — Maintenance-scheduler integration endpoint

### 2.1 The trap, stated plainly

"Seamless integration" between two independently-built, still-changing hackathon systems is a well-documented failure mode, not a hypothetical one. Capital One's own retrospective on hosting hackathons found that giving teams a **shared mock environment measurably increased both integration adoption and submission quality** — i.e., even the company that runs hackathons for a living steers participants away from live cross-team coupling and toward mocks. Generic hackathon-demo advice converges on the same point: a demo that depends on a live call to something you don't control (rate limits, downtime, timing, a laptop closed at the wrong moment) is a demo that fails in front of judges for reasons that have nothing to do with your work.

Given §0 — no PS1 team is guaranteed to exist in a working, compatible state — this isn't caution, it's arithmetic. **Building against a real partner system that may not exist is building against a null.**

### 2.2 What to build instead

The actual audience for this feature is the **PS3 judge**, not a PS1 team. Design for that:

1. A versioned **OpenAPI spec** for one endpoint (`POST /fault-events`). This alone is the signal judges read as "integration-ready thinking" — it costs an hour and needs no partner to exist.
2. A real endpoint, fed by your actual detector output — not a stub.
3. **Your own mock consumer**: a 20-line receiver that logs and displays incoming events in a small dashboard. This is what you actually demo. It proves the contract works end-to-end, deterministically, regardless of whether any PS1 team's system is alive.
4. If a real PS1 team's endpoint happens to be reachable near the end, wire it in live as a bonus. Never as the critical demo path.

This mirrors what API-first/contract-first practice and consumer-driven contract testing exist to solve generally: decouple two independently-changing systems by agreeing the *shape* early and letting each side build against a mock of the other, verified later. You're applying the same idea at hackathon timescale.

### 2.3 Ground the schema in real prior art, don't invent one

**MIMOSA OSA-CBM / ISO 13374** define the standard condition-monitoring pipeline: Data Acquisition → Data Manipulation → State Detection → Health Assessment → Prognostics Assessment → Advisory Generation. Still the reference architecture in 2026 (superseded only in wire format — CORBA/DCOM is dead, the six-block semantics now ride over REST/MQTT — not in concept). ISO 13374's State Detection block outputs abnormality zones explicitly named **"alert"/"alarm"**; its Presentation layer mandates equipment ID, fault type, **severity estimate**, and **recommended action**.

**ISO 13379-1** (diagnostics) defines a formal diagnostic report shape (event, diagnosis, symptoms, failure mode, corrective-action) and a Monitoring Priority Number combining confidence × severity. **ISO 13381-1** (prognostics) formally defines **confidence level**, **root cause**, and **estimated time to failure**. **ISO 14224** supplies a 9-level equipment taxonomy and standardized failure-mode codes.

Real CMMS/EAM systems converge on a similar minimal surface: IBM Maximo creates a Service Request → Work Order from a REST/OSLC payload; Fiix takes a `POST /workorders` linked to an asset ID; Infor EAM (via its ION middleware) ingests predictive alerts carrying **confidence scores** and auto-creates flagged work orders — the closest architectural match to your use case. Heavier legacy EAMs (SAP PM, GE Digital APM) hop through integration middleware rather than taking direct webhooks, which is exactly why building your own endpoint + spec (rather than assuming a specific vendor's wire format) is the right level of abstraction for a hackathon.

For the transport layer, borrow **Stripe and GitHub's** webhook conventions directly: HMAC-SHA256 signature over the raw body, a delivery/event ID for idempotency, fast 2xx-then-process-async, exponential-backoff retries, explicit schema versioning. This is ~30 minutes of work and reads as production-grade maturity to anyone who's integrated with either.

### 2.4 The PS1 impedance mismatch — the one thing worth catching now

PS1's object is a **maintenance request**: planned work competing for technician time, depot slots, and track-possession windows. Your object is a **detected fault event**: an ML-scored anomaly with a confidence value. These are not the same shape, and a naive integration that just POSTs a raw fault event at a scheduler expecting planned-work requests won't actually compose — the receiving side has nothing to schedule *against* yet.

The fix is a one-field reframing, not a redesign: emit the fault event shaped as a **candidate maintenance request** — add a proposed time window, an urgency-derived priority, and an estimated work duration/resource need, derived from severity + subsystem. That turns "we detected something" into "here is a request for the scheduler's conflict-resolution logic to place," which is the actual input type PS1 is built to consume. Stating this translation step explicitly, even if no PS1 system ever receives it, is itself a "real-world impact" and "problem fit" argument — it shows you read the adjacent brief, not just your own.

### 2.5 Recommended schema

| Field | Type | Basis |
|---|---|---|
| `eventId` | UUID | Webhook convention (idempotency) |
| `schemaVersion` | string | Webhook convention |
| `assetId` | string | ISO 13374 / ISO 14224 |
| `assetTaxonomyPath` | string | ISO 14224 (9-level equipment taxonomy) |
| `timestamp` | ISO 8601 | ISO 13374 |
| `faultCode` / `failureMode` | enum | ISO 14224 failure-mode taxonomy; ISO 13379-1 |
| `healthState` | enum: normal / alert / alarm | ISO 13374 State Detection |
| `severity` | int 1–5 | ISO 13379-1 (Monitoring Priority Number) |
| `confidence` | float 0–1 | ISO 13381-1 |
| `rootCause` | string, nullable | ISO 13381-1 |
| `estimatedTimeToFailure` | duration, nullable | ISO 13381-1 (ETTF) |
| `recommendedAction` | string | ISO 13374 Advisory Generation |
| **`proposedWindow`** | `{start, end}`, nullable | *Added for PS1 compatibility (§2.4)* |
| **`estimatedDuration`** / **`resourceHint`** | duration / string, nullable | *Added for PS1 compatibility (§2.4)* |
| `evidence` | object (sensor refs, crop URI, model version) | ISO 13374 Data Acquisition |
| `sourceModel` | string | Provenance — your own addition |

Signing/retry/idempotency headers (`X-Signature`, `X-Delivery-Id`) follow Stripe/GitHub convention — transport, not standards, layer.

### 2.6 Build order (4–6h)

1. OpenAPI spec + schema above (1h) — this is the artifact judges actually read.
2. Real endpoint wired to detector output (1–2h).
3. Mock consumer/dashboard (1–2h) — this is what you demo.
4. HMAC signing + idempotency + retry (30 min–1h) — cut first if squeezed.

---

## 3. Feature 2 — Modular decision/escalation engine

### 3.1 Disambiguate "modular decision tree" before writing any code

The phrase covers three genuinely different builds:

- **(a) A config layer** mapping fault classification → response, editable without redeploying code.
- **(b) A dynamic escalation/notification graph** — who gets paged for which fault type, severity, time of day. This is the PagerDuty-escalation-policy pattern, well-understood, easy to prototype convincingly.
- **(c) A literally reconfigurable org chart** — the hierarchy itself changing shape per incident type.

**(c) is the one to drop.** It solves a problem real command systems don't appear to have.

### 3.2 What real command systems actually do: fixed template, modular activation

FEMA's Incident Command System is the most-used real-world command structure precisely because it's designed to scale — but the way it scales is instructive. ICS uses one fixed functional template (Incident Commander; Operations, Planning, Logistics, Finance/Administration) that is **never reshaped**. What flexes is *staffing*: "Only positions that are required at the time should be established," and as an incident shrinks, roles merge back up the same tree. Expansion authority belongs to the Incident Commander alone — the *shape* is a national interoperability requirement precisely so any responder recognizes it regardless of incident.

This matches the OCC research you started from almost exactly: "during disruptions these groups become a single coordinated response team" describes activation of a constant hierarchy, not a redrawn one. So:

**"Modular" should mean rule-based activation/routing through a fixed hierarchy — never reshaping the hierarchy itself.** This is also the cheaper, safer, and more defensible build.

### 3.3 Prior art to build on, not reinvent

**Decision Model and Notation (DMN)** is the OMG standard for exactly this: modular, versionable, human-editable decision tables mapping inputs to outputs. **GoRules' Zen Engine** is an MIT-licensed, embeddable implementation of DMN's JSON form (JDM) with bindings for Python/Node/Go/Java/C#/Kotlin/Swift, plus an open-source visual editor component (`jdm-editor`). Standing up a 10–20 rule table this way is a matter of hours, not days, and gets you real hit-policy semantics (first-match, priority, collect) for free instead of hand-rolling them. Hand-rolling a bespoke tree DSL burns hours for no demo-visible gain over adopting the standard.

### 3.4 What real rail decision-support systems actually automate

**SMRT Overwatch** (2020, Circle Line; extended fleet-wide by end-2024; UITP Operational Excellence Award 2023) is explicitly framed as "an additional layer… to complement the current system" — AI-assisted anomaly detection, abnormal-dwell-time flags, and incident-prioritization *recommendations*, with a documented 30% drop in short delays. Humans execute every response. **Alstom's Urbalis/ICONIS** is described the same way: "traffic supervision and regulation, decision support and smart incident management," dispatcher-executed. Thales and Hitachi's comparable systems, trialled against ICONIS on Network Rail in 2013, were evaluated the same way. The academic rescheduling/delay-management literature (ILP, GNN, RL approaches) is large, but almost universally frames its output as dispatcher decision support, not closed-loop execution. No public case surfaced of a deployed OCC tool over-automating into an incident — consistent with the certification burden (below) making that a hard line operators don't cross.

### 3.5 Why the response layer should be rules, not ML

Every real system found here uses ML for *detection* (pattern recognition on label-rich sensor/video data) and rules for *response selection* — never the reverse. Three reasons to keep it that way:

- **Auditability.** A judge's obvious question is "who's liable if this recommends the wrong response?" A rule table answers with "rule #14 fired, here's why." A learned policy cannot.
- **Data reality.** Severe-fault examples are exactly the ones you have the fewest of — nowhere near enough to trust a learned policy over safety-adjacent decisions.
- **The liability actually collapses onto the human either way.** Elish's "Moral Crumple Zones" (2019) documents that liability for automation-shaped decisions lands on "the nearest human operator" even when the system heavily shaped the outcome and the human's real control was limited. Bainbridge's "Ironies of Automation" (1983) and Cummings' work on automation bias (2004 — one documented case of a bad decision-support flag driving a 56.9% increase in downstream errors) both describe the same failure mode: operators over-trust plausible-looking automated recommendations, especially for the rare high-stakes cases where their own judgment matters most. An opaque, ML-driven response recommendation is the worst possible shape for this risk. A transparent rule table that only ever recommends is the best available mitigation, and it's cheap to build.

Rail's own safety-case machinery backs this up structurally: **IEC 62278/EN 50126** (RAMS) is the rail-sector application of **IEC 61508** (functional safety, SIL 1–4). Anything whose recommendation could plausibly be followed into an unsafe operational action risks being pulled into that certification scope — the real reason every deployed system above stays strictly advisory.

### 3.6 Borrow Grades of Automation as a design pattern, not just an analogy

**IEC 62267 / UITP's GoA0–GoA4** taxonomy is how rail already self-declares how much authority automation holds — from GoA0 (no automation) to GoA4 (fully unattended). The reusable idea isn't the analogy, it's the *pattern*: **make every recommendation self-declare its authority level**, the same way a line publicly states which GoA it runs at. Concretely: tag every output of the decision engine with an explicit badge — "Recommend only — human executes" — plus the rule ID that fired. This is a small, concrete, demoable feature in itself, and it's the single best answer to a skeptical judge because it's not a claim, it's a UI element they can see.

```
             ┌─────────────────────┐
             │   Chief Controller   │   ← fixed template (ICS-style),
             └──────────┬──────────┘      never reshaped
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
 ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
 │Train Control │  │Station Ctrl │  │ Depot Control│   ← rule engine ACTIVATES
 └─────────────┘  └─────────────┘  └─────────────┘      nodes per fault type/
        ▲                                                 severity — routes
        │  fault event (severity 4, door subsystem)        TO these, doesn't
        │  ──────────────────────────────────────►         redraw them
   [ detector ] → [ DMN-style rule table ] → recommendation + rule-id + "GoA-R: recommend only"
```

### 3.7 Build order (6–9h)

1. Fixed hierarchy + input schema: `{faultType, severity, confidence, subsystem, timeOfDay}` (1h).
2. Wire Zen Engine / JDM; author one escalation table + one response table, 10–20 rules, closed vocabulary (short-turn / withdraw / shuttle / suspend / continue) mirroring the real OCC categories from your original research (2–3h).
3. Audit trace: log which rule fired, on what input, at what confidence (1–2h).
4. Autonomy badge in the UI ("GoA-R — recommend only") on every output (1h).
5. Wire to real detector output once the bake-off produces stable class labels (1–2h — can run in parallel with model training, see §4).

**One-liner to have ready for judges:** *"The tool only recommends — every notification and action still routes through the same human controllers and chain of command that exist today, and every recommendation logs the exact rule that fired, so liability stays where it already sits: with the human decision-maker, auditable like a spreadsheet, not a black box."*

---

## 4. How the two features connect

They're not two disconnected bolt-ons — one naturally triggers the other:

```
Detect (PS3 core)  →  Classify/rules (§3)  →  ┬→ Notify human controllers (dashboard)
                                                └→ Emit maintenance-scheduler event (§2),
                                                    only when a rule says severity/confidence
                                                    clears threshold
```

The rule table is the natural place to decide *when* a fault is worth escalating to the maintenance-scheduler contract at all — not every anomaly should generate an external event. This also means Feature 2's schema (`faultType, severity, confidence, subsystem`) should be designed once and consumed by both features, rather than each inventing its own fault representation.

### Scheduling insight

Feature 2 doesn't need a *good* model to start — only a *fixed output shape*. The rule table, engine wiring, and audit trace can all be built against synthetic/dummy classifier output as early as hour ~10, in parallel with the model bake-off (hours 8–20 in the core plan), then pointed at real output once it lands. It does not need to wait for Phase 3.

---

## 5. Devil's advocate summary

**Reasons not to build either, stated as strongly as possible:**

- Neither is in PS3's judged brief. Every hour here is an hour not spent on the few-shot curve, which is the chart that actually demonstrates your stated thesis (transfer learning).
- Team size is 3–4, already fully loaded across Data/Models/Platform/Story in the existing 48h plan. There is no free capacity; this scope has to come from somewhere.
- A cross-track integration nobody asked for, demoed to a judge who's only scoring your track against your track's brief, may simply not move the needle judges are told to use.
- A decision-support feature touching "who gets notified during a rail incident" invites exactly the liability question in §3.5 — if you can't answer it crisply, it becomes a net negative in Q&A rather than a differentiator.

**Why build them anyway, on the scoped-down version:**

- "Real-world impact" and "ease of use" are explicit judging axes, evaluated by railway professionals who will recognize a raw anomaly score as a weak deliverable and a triaged, explainable, standards-grounded recommendation as a strong one.
- Both scoped versions are cheap (10–15h combined) *because* they're built on existing standards (ISO 13374 family, DMN/Zen Engine) and existing prior art (Stripe/GitHub webhooks, ICS activation model) instead of invented from scratch — the research above is what makes the scoping possible, not just the idea.
- Feature 2 in particular converts your own OCC research from a mood board into a specific, defensible, citable design decision — which is a better story than either ignoring the research or over-building on it.

**The actual risk to manage is not "should we," it's "don't let this grow."** Both build-order lists above are deliberately short. If either starts requiring a UI editor, a second data model, or a dependency on someone else's uptime, that's the signal to cut back to the list, not extend it.

---

## 6. Where this sits in the existing 48h plan

Against the phase plan in the main brief (Phase 0 Scaffold → 6 Rehearse, feature freeze at hour 40):

- **Feature 2, steps 1–3** slot into the idle capacity during **Phase 2 (Bake-off, hours 8–20)** — it needs the output *shape*, not the final model, and can run on synthetic labels.
- **Feature 1** and **Feature 2 steps 4–5** slot into **Phase 4 (Deploy, hours 30–40)**, alongside ONNX export — same "serving/orchestration" concern, same owner.
- **Recommended ownership** given a 3–4 person team: **Platform** owns engine wiring and the endpoint (already doing ONNX/containers, same skill set). **Story** owns rule-table *content* — authoring the 10–20 fault→response mappings is domain/operational writing, not engineering, and Story has slack before their demo/writeup load ramps up at hour 40.
- Both are explicitly subject to the hour-40 feature freeze and the "never be in a state with no working model" priority from the core plan. If the bake-off is behind schedule at hour 30, this entire document is the first thing to cut.

---

## 7. Sources

**Condition-monitoring & CMMS integration standards**
- [MIMOSA OSA-CBM](https://www.mimosa.org/mimosa-osa-cbm/) · [MIMOSA OIIE](https://www.mimosa.org/open-industrial-interoperability-ecosystem-oiie/)
- [ISO 13374-1:2003](https://www.iso.org/standard/21832.html) · [ISO 14224](https://www.iso.org/standard/64076.html) · [NIST/PHM Society standards survey](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=916376)
- [EN 15341:2019+A1:2022](https://standards.iteh.ai/catalog/standards/cen/fd8282fc-5fa6-4b32-b7ce-e5e3d6d735ec/en-15341-2019a1-2022)
- [IBM Maximo — create service request + work order via REST](https://www.ibm.com/support/pages/how-create-service-request-and-follow-work-order-using-rest-api)
- [SAP webhook management guide](https://help.sap.com/docs/cloud-alm/apis/webhook-management-guide)
- [GE Digital APM Health](https://www.ge.com/digital/applications/asset-performance-management/apm-health)
- [Fiix API](https://jentic.com/apis/fiix) · [Infor EAM REST / ION](https://samaconsultinginc.com/blogs/infor-eam-rest-api-development-asset-crud-operations-work-order-creation-and-custom-field-extensions/)

**Webhook craft & hackathon integration risk**
- [Stripe webhooks — features and best practices](https://hookdeck.com/webhooks/platforms/guide-to-stripe-webhooks-features-and-best-practices) · [GitHub webhook delivery validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [Capital One — what hosting hackathons taught us about our APIs](https://medium.com/capital-one-tech/what-hosting-hackathons-taught-us-about-our-apis-b48d8304b74d)
- [Mock vs. live API testing](https://sparrowapp.dev/blogs/when-to-mock-vs-when-to-hit-live-apis-integration-testing-best-practices/)
- [API-first development — case studies](https://www.linkedin.com/pulse/three-case-studies-api-first-development-contracts-wojciech-bulaty) · [Consumer-driven contract testing](https://specmatic.io/updates/types-of-contract-testing/)

**Command structure & decision engines**
- [IEC 62267:2009 — AUGT safety requirements (GoA)](https://webstore.iec.ch/en/publication/6681) · [GoA overview](https://metrorailnews.in/automatic-train-operation-for-metro-railways-a-global-perspective-and-analysis/)
- [Incident Command System — modular/scalable organization](https://en.wikipedia.org/wiki/Incident_Command_System) · [FEMA IS-100c](https://emilms.fema.gov/is_0100c/groups/23.html)
- [DMN — OMG](https://www.omg.org/intro/DMN.pdf) · [DMN — Wikipedia](https://en.wikipedia.org/wiki/Decision_Model_and_Notation)
- [GoRules Zen Engine (MIT, JDM)](https://github.com/gorules/zen) · [JDM Editor](https://github.com/gorules/jdm-editor) · [GoRules vs Drools](https://gorules.io/compare/gorules-vs-drools)

**Rail decision-support systems in production**
- [SMRT Overwatch — official media release](https://www.smrt.com.sg/news-publications/newsroom/media-releases/media-release-smrt-officially-launches-overwatch,-to-extend-international-award-winning-initiative/)
- [Alstom Urbalis/ICONIS — supervision and decision support](https://www.alstom.com/solutions/signalling/supervision-advanced-urban-network-control)
- [Network Rail Leeds trials — ICONIS/Thales/Hitachi comparison](https://www.railtechnologymagazine.com/Rail-Industry-Focus-/complete-control)
- [Railway rescheduling/delay-management survey](https://arxiv.org/pdf/2209.12689)

**Safety, liability & human factors**
- [IEC 62278/EN 50126 (RAMS)](https://standards.globalspec.com/std/494463/IEC%2062278) · [IEC 61508 SILs explained](https://www.perforce.com/blog/qac/what-iec-61508-safety-integrity-levels-sils)
- Bainbridge, ["Ironies of Automation" (1983)](https://en.wikipedia.org/wiki/Ironies_of_Automation)
- Cummings, ["Automation bias in intelligent time-critical decision support" (2004)](https://arc.aiaa.org/doi/10.2514/6.2004-6313)
- Elish, ["Moral Crumple Zones" (2019)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2757236)

**Hackathon ground truth**
- [NEBULA X — The Living Railway](https://nebulax.com.sg/)
