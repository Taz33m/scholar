# Apple Scholar Docs

Apple Scholar is building the Codex for Students and Educators: a voice-native, multimodal AI learning system designed to make tutoring, review, and teaching feel interactive instead of transactional.

> Would you drop PDFs into ChatGPT and prompt it to be your professor for a life-threatening exam?
>
> That is the gap Apple Scholar is built to close.

## Product Thesis

Education should not collapse into a single chat box.

For students, Apple Scholar is an always-available professor that can speak, draw, quiz, explain, and adapt as understanding changes in real time.

For educators, Apple Scholar is an agentic teaching layer that can transform notes, slides, and curriculum into live explanations, review sessions, and study artifacts at software scale.

## Technical Thesis

Apple Scholar is being built on a primarily Gemini stack because the product depends on three things happening together:

- real-time voice conversation
- multimodal reasoning
- agentic tool use inside the same interaction loop

That stack currently centers on:

- Gemini Live API
- Google ADK
- Gemini multimodal generation and reasoning
- interactive canvas tooling for visual explanation
- application infrastructure for waitlist, smoke coverage, and production iteration

Our goal is to build as close to the Google DeepMind frontier as possible. Through the momentum of Google's AI Future Fund and in conversation with Reach Capital, we want to bring the latest Gemini capabilities into real learning workflows as soon as they are production-ready.

## Origin Story

Apple Scholar began at the Columbia Business School x Google Developer Group NYC Build With AI Hackathon.

The project did not start as an education company. It started as a Zoom and meetings AI agent for early-stage founders. Mid-build, it became obvious that the problem worth solving was not the one on the screen. It was the one I was experiencing personally every day as a student: learning difficult material under real pressure.

That insight led to the pivot that became Geminilearn, now Apple Scholar.

The result was 1st place at the hackathon, $15k in Google credits, tickets to Google I/O 2026, and a private pitch session with Google's AI Future Fund.

This was not just a hackathon project. It became the foundation for the company.

## Product Capabilities

- live spoken tutoring sessions
- whiteboard explanations and diagrams
- quizzes for retrieval practice
- flashcards for spaced repetition
- adaptive responses based on learner confusion and intent
- educator workflows for turning source material into interactive review

## Supporting Docs

- [Repo overview](../README.md)
- [Frontend developer guide](../frontend/README.md)
- [Session inspection notes](../frontend/TEST_SESSION_INSPECTION.md)
- [Production deploy notes](./production-deploy.md)
- [Supabase waitlist schema](./supabase-waitlist.sql)
- [Flashcards schema](./schema/flashcards.json)
