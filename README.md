# Apple Scholar

Apple Scholar, formerly Geminilearn, is building the Codex for Students and Educators: a voice-native, multimodal AI learning system that can teach, test, visualize, and adapt in real time.

> Would you drop PDFs into ChatGPT and prompt it to be your professor for a life-threatening exam?
>
> I hope not. That is exactly the problem Apple Scholar is built to solve.

## Vision

Chat is not the end-state for education.

The best learning product should feel closer to an exceptional tutor, TA, and study system merged into one. For students, Apple Scholar is the always-available professor: ask questions out loud, get explanations in real time, move into a whiteboard when concepts become visual, generate flashcards when memorization matters, and switch into quizzes when recall matters.

For educators, Apple Scholar is the Codex layer for teaching: a system that can turn notes, slides, and curriculum into live explanations, adaptive review sessions, study artifacts, and better office hours at software scale.

## Why This Wins Technically

Apple Scholar is being built on a primarily Gemini stack because the product requires real-time voice, multimodal reasoning, tool use, and orchestration inside a single learning loop.

Today that means:

- Gemini Live API for spoken back-and-forth tutoring
- Google ADK for agentic orchestration and tool calls
- Gemini multimodal capabilities for diagrams, flashcards, quizzes, and contextual explanation
- Next.js, React, and interactive canvas tooling for the learner workspace
- Supabase-backed waitlist and product infrastructure
- Playwright and Vitest coverage for smoke and regression testing

Our plan is to build Apple Scholar as close to the Google DeepMind frontier as possible. Through the momentum and access created by Google's AI Future Fund, and in conversation with Reach Capital, we want to adopt the latest Gemini capabilities as soon as they are stable enough to become real products for students and educators, not just demos.

## The Problem

Studying for a high-stakes exam is not a chat problem.

Students do not need another interface that summarizes PDFs and calls it tutoring. They need a system that can:

- talk back in real time
- adapt when confusion shows up
- show, not just tell
- create the right learning artifact at the right moment
- make high-quality tutoring more accessible than traditional hourly models

Most AI EdTech still stops at the text box. That is useful for lookup. It is weak for real learning.

## Origin Story

On the last weekend of my spring break, I joined the Columbia Business School x Google Developer Group NYC Build With AI Hackathon.

I initially started on a Zoom and meetings AI agent for early-stage founders. Midway through the build, I realized something simple: I was not the user, so I pivoted.

The pain point I was living and breathing was learning, especially as a student in an academically rigorous environment. So I built the product I wished existed for me: Geminilearn, now Apple Scholar.

That instinct paid off. Apple Scholar won 1st place at the hackathon, earning $15k in Google credits, tickets to Google I/O 2026, and a private pitch session with Google's AI Future Fund.

This was not just a hackathon win. It was the beginning of the company.

## What the Product Does

Apple Scholar combines real-time voice tutoring with an agentic learning workspace that can:

- hold live tutoring sessions
- generate whiteboard explanations and diagrams
- create quizzes for retrieval practice
- generate flashcards for spaced repetition
- adapt based on what the learner is struggling with
- help educators turn course material into live review sessions and study artifacts

## Repository Structure

- `frontend/` - the main product application
- `docs/` - deployment notes, schemas, and supporting documentation

## Quick Start

1. `cd frontend`
2. `npm install`
3. Create `frontend/.env.local` with `GEMINI_API_KEY=...`
4. Optional: configure waitlist storage with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then run `docs/supabase-waitlist.sql`
5. `npm run dev`
6. Open `http://localhost:3000`

For smoke and regression commands, see `frontend/README.md`.
