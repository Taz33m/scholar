# Privacy + AI Consent Checklist

This is a practical checklist for Apple Scholar's closed beta.
It is not legal advice.

## Goal

Before inviting more students, make sure the product can truthfully explain:

- what data is collected
- why it is collected
- who processes it
- how long it is kept
- how a student can ask for deletion
- when AI or voice features are being used

## Recommended Documents

### 1. Privacy Policy

Your privacy policy should clearly cover:

- account data
- email address
- session messages and transcripts
- uploaded course files
- generated artifacts
- progress signals and mastery data
- analytics data
- voice/audio inputs and transcriptions
- vendors/subprocessors
- retention and deletion
- contact information

### 2. In-Product AI Disclosure

Put this near the tutoring entry point or first-run consent:

- the tutor uses AI-generated responses
- responses may be incomplete or wrong
- the tutor may use transcripts, uploads, and generated artifacts to personalize the session
- the system may log progress and objective completion during the session

### 3. Voice/Recording Disclosure

If voice is enabled, disclose:

- whether raw audio is stored
- whether audio is transcribed
- whether transcripts are stored
- whether voice data is sent to third-party providers

## Suggested Student Consent Copy

By continuing, you understand that Apple Scholar uses AI to generate tutoring responses and learning materials. Your messages, uploads, and session activity may be processed to run the product, personalize your learning experience, and improve the beta. If you use voice features, audio and/or transcripts may be processed by Apple Scholar and its service providers.

## Data Inventory

Track each of these explicitly:

- account email
- magic-link login metadata
- course enrollment metadata
- tutor transcript text
- checklist progress
- quiz answers and scores
- worksheet answers
- generated flashcards, quizzes, diagrams, and notes
- uploaded files
- voice session data
- support requests and feedback

## Internal Operational Rules

For the closed beta, I recommend:

- limit access to 18+ users only
- do not knowingly onboard users under 13
- do not ingest official school records or LMS data yet
- do not claim guaranteed accuracy or grade improvement
- do not claim "private" or "secure" unless your practices match that claim
- keep an internal deletion path for student data requests

## School / FERPA Boundary

If this is direct-to-student and not receiving official school records, keep that boundary clear.

Do not market the product as school-integrated or FERPA-compliant by default unless:

- a school is actually involved
- the data flow is understood
- the contract language is reviewed

## Logging You Should Keep

Store enough records to prove consent and explain data handling:

- user id
- student email
- accepted terms version
- accepted privacy version
- accepted AI/voice disclosure version
- timestamp
- IP address or device/session identifier if appropriate

## Founder To-Do List

- publish a privacy policy before scaling the beta
- add clickwrap assent logging
- add a deletion request contact or inbox flow
- add a visible voice/AI disclosure before voice tutoring starts
- maintain a simple vendor list for Supabase, Vercel, analytics, and model providers

## Optional Next Step

Once you're ready, turn this into:

- `/terms`
- `/privacy`
- an onboarding checkbox block with versioned consent logging
