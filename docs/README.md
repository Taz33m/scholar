# Apple Scholar Overview

Contributors: Tazeem Mahashin, Vera Malkova

Formerly Geminilearn, Apple Scholar is an AI tutor built to teach the way a real tutor would: in real time, with voice, visual explanation, quizzes, flashcards, and an interactive whiteboard that appears exactly when the learner needs it.

> Would you drop PDFs into ChatGPT and prompt it to be your professor for a life-threatening exam?
>
> We hope not. That is exactly the problem we set out to solve.

## Founder Story

On the last weekend of spring break, I joined the Columbia Business School x Google Developer Group NYC Build With AI Hackathon.

After finding my teammate, Vera Malkova, we started building a Zoom and meetings AI agent for early-stage founders. Halfway through, we realized something simple: we were not the user, so we pivoted.

The pain point we were living and breathing was learning, especially as students at academically rigorous institutions. So we built the product we wished existed for us: Geminilearn, now Apple Scholar.

That instinct paid off. We won 1st place at the hackathon, earning $15k in Google credits, tickets to Google I/O 2026, and a private pitch session with Google's AI Future Fund.

This is not just a hackathon win. It is our startup origin story.

## The Problem We Solve

Studying for a high-stakes exam is not a chat problem.

Students do not need another text box that summarizes PDFs and calls it tutoring. They need something that can:

- talk back in real time
- adapt to confusion as it happens
- show, not just tell
- create the right learning artifact at the right moment
- make high-quality tutoring accessible without the hourly cost of a private instructor

Most AI EdTech products still stop at the classic chat interface. That breaks down when the material is difficult, visual, cumulative, or time-sensitive.

## What We Built

Apple Scholar combines a real-time voice tutor with an agentic learning workspace. Using Gemini's Live API and the Google ADK, the product can:

- hold a live spoken tutoring session
- generate whiteboard explanations and diagrams
- create quizzes for retrieval practice
- generate flashcards for spaced repetition
- adapt the session based on what the student is asking and struggling with

Think of it as your professor or tutor, available with one click, without the expensive hourly rate.

## Why This Matters

We did not build Apple Scholar by guessing at a market. We built it from a problem we experience firsthand, over and over again.

The best learning tools should feel less like prompting a chatbot and more like working with someone who can actually teach.

## Vision

We believe the future of learning is multimodal, conversational, adaptive, and accessible.

Our vision is to build the always-available professor for every student: an AI-native tutor that can speak, draw, test, explain, and personalize at the level of an exceptional human teacher.

We are building toward that future in partnership with Google's AI Future Fund and Reach Capital as we continue speaking with our first users across universities.

We look forward to shaping the lives of students across the world through Apple Scholar.

## Product Foundations

- Gemini Live API for real-time voice interaction
- Google ADK for agentic tool use and orchestration
- Next.js and React for the product experience
- Excalidraw and canvas tooling for visual explanations
- Supabase-backed waitlist infrastructure with local fallback
- Playwright and Vitest smoke and regression coverage

## Supporting Docs

- [Repo overview](../README.md)
- [Frontend developer guide](../frontend/README.md)
- [Session inspection notes](../frontend/TEST_SESSION_INSPECTION.md)
- [Production deploy notes](./production-deploy.md)
- [Supabase waitlist schema](./supabase-waitlist.sql)
- [Flashcards schema](./schema/flashcards.json)

## Acknowledgements

Special thanks to Amin A., Anand Vardhan Singh, Bhavik Chopra, Anna Nerezova, the rest of the organizing team, and especially Vera Malkova for building this with me.

If you or anyone in your network would be helpful as we continue speaking with our first users across universities, we would love to connect.
