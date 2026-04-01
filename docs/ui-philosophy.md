# Apple Scholar UI Philosophy

This document is for anyone designing or implementing Apple Scholar interfaces, including AI agents making frontend changes.

The goal is simple: Apple Scholar must read as a serious academic product, not a clever demo.

## Core Standard

Apple Scholar should feel credible to:

- a student preparing for a high-stakes exam
- a professor deciding whether this is worthy of attention
- an educator evaluating whether the product understands academic work

The UI should suggest rigor, calm, and competence.
It should not feel playful, chatty, gimmicky, over-labeled, or eager to explain itself.

## The Product We Are Designing

Apple Scholar is not “an AI app with education features.”
It is a voice-native learning system for serious study.

That means the product should feel closer to:

- a well-run tutoring environment
- a clean research or note-taking tool
- a professional academic workspace

It should feel less like:

- a hackathon prototype
- a creative tool for inspiration
- a chatbot wrapped in extra UI

## The Principle of Restraint

Restraint is a product requirement, not a style preference.

Restraint means:

- do not label what is already obvious
- do not explain the interface inside the interface
- do not fill empty space with reassuring copy
- do not add decorative status pills, helper text, or cards unless they improve decision-making
- do not announce a feature when the user can already see it

Examples:

- A transcript box does not need to say `Live Transcript` if its purpose is already visually clear.
- A box does not need placeholder copy explaining that “transcriptions and replies will appear here.”
- If a session is idle, the workspace can simply be quiet.
- Elements should appear when they become useful, not before.

Default rule:
If a piece of copy is describing what the user can plainly infer from the UI, remove it.

## Serious EdTech Bar

Apple Scholar should communicate academic seriousness.

That means:

- clear hierarchy
- stable spacing
- calm typography
- restrained motion
- deliberate use of color
- minimal chrome

It should avoid:

- novelty-first styling
- loud gradients
- glassmorphism as a default language
- consumer-social metaphors
- playful empty states
- UI that feels like it is trying to impress rather than help

“Toy” signals usually include:

- too many pills and badges
- too much explanatory copy
- overly soft or bubbly component shapes
- gratuitous animation
- dashboards that look like marketing pages

## Layout Guidance

The workspace should prioritize the learning surface.

Default layout priorities:

1. The main learning surface gets the most space.
2. Secondary controls should stay compact.
3. Supporting information should be visible but quiet.

Applied to the tutor session:

- The canvas or active artifact area should dominate the screen.
- Transcript/output should be compact and peripheral, not the star of the page.
- Input controls should be accessible but unobtrusive.
- The removal of the old left sidebar should increase usable workspace, not replace it with a new large decorative shell.

## Voice-First Interaction Guidance

Voice is primary.
Text is a fallback or precision mode.

This means:

- voice controls should feel native and immediate
- text mode should be available without visually competing with voice mode
- the interface should not look like a text chat product with a microphone added on top

At the same time:

- the voice UI should not overperform “AI-ness”
- avoid theatrical pulsing, glowing, or animated states unless they communicate something operationally important
- speaking/listening state should be legible but understated

## Transcript and Output Behavior

Transcript UI should be event-driven and context-aware.

Preferred behavior:

- the transcript surface can stay visually quiet until the session actually starts
- transcribed content appears when the user or assistant speaks
- tool output appears only when relevant
- the box should feel like a live working surface, not a framed explainer

Avoid:

- large blocks of setup copy
- headings that restate the obvious
- instructional text that lingers after the user understands the interaction
- persistent empty-state narration

The interface should reveal itself through use.

## Content and Copy Rules

Copy should be sparse, specific, and operational.

Good UI copy:

- clarifies a decision
- confirms a result
- surfaces an error
- labels something ambiguous

Bad UI copy:

- narrates the obvious
- markets the product from inside the product
- explains mechanics that should be intuitive
- fills space because the designer is uncomfortable with quiet

When in doubt:

- prefer no sentence over a weak sentence
- prefer one precise label over two stacked explanations
- prefer showing state over describing state

## Visual Language

Apple Scholar should lean toward a disciplined academic palette.

Defaults:

- light backgrounds
- neutral grays and slate tones
- one restrained accent color used intentionally
- clean borders and strong spacing
- modest radii

Avoid:

- excessively glossy or futuristic effects
- too many accent colors
- purple-heavy generic AI aesthetics
- dark mode-style hero surfaces used without a product reason

Typography should feel editorial and trustworthy, not playful.
Use type to establish seriousness before decoration does.

## Motion

Motion should be informative, not expressive by default.

Use motion for:

- state change
- focus transition
- lightweight feedback

Avoid motion for:

- atmosphere
- personality
- spectacle

If an animation can be removed without harming comprehension, it probably should be.

## Decision Test

Before shipping any UI change, ask:

1. Does this make the product feel more academically credible or less?
2. Is this helping the student study, or is it explaining itself too much?
3. Would a professor see this as a serious tool or a polished toy?
4. If we removed half the labels and helper copy, would the interface improve?
5. Is the main learning surface still clearly dominant?

If the answer trends toward “polished toy,” redesign it.

## Default Direction For Future Work

When making UI decisions for Apple Scholar:

- choose quieter over louder
- choose clearer over more impressive
- choose fewer elements over more elements
- choose durable academic trust over short-term visual novelty

Apple Scholar should feel like software built for real study.
That is the bar.
