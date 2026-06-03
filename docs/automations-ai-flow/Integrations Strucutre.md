WarmChats Integration Structure (MVP)

Core Goal

Any lead source -> WarmChats captures lead -> inbox conversation created -> AI follow-up starts instantly.


Main Integration Architecture

1. Lead Sources

WarmChats should accept leads from:

Website embed forms

Open house forms

CSV imports

Webhooks/API

Manual lead entry


2. Universal Lead Intake Endpoint

All integrations should flow into one main endpoint:

POST /api/leads

This endpoint handles:

Lead creation

Duplicate detection

Source tracking

AI automation triggering

Inbox thread creation


3. Embed Forms

Each user gets:

Unique form_id

Copy/paste embed code

Default fields:

First name

Last name

Phone

Email

Lead type

Message

Consent checkbox

Example:

<script src="https://warmchats.com/embed.js"></script>
<div data-warmchats-form="abc123"></div>
Submission flow:

Form submitted

Lead sent to backend

Lead created/updated

Inbox conversation created

AI instant reply triggered

Agent notified


4. Lead Processing Logic

When a lead enters WarmChats:

Normalize phone/email

Check duplicates

Create or update lead

Save lead source

Create inbox thread

Trigger AI automation if enabled

Notify assigned agent


5. Source Tracking - 

Every lead must store:

Source

Campaign

Form ID

Page URL

Timestamp

Consent status

Example sources:

Meta Ads

Google Ads

Website Form

Open House

Referral

Zillow

Realtor.com

CSV Import

Manual


6. AI Automation Layer

After lead creation:

Send instant reply

Start qualification flow

Detect intent

Score lead

Push booking

Alert agent if hot


7.  Import System input cluade design for importing leads 

Requirements:

Field mapping

Duplicate prevention

Import preview

Error reporting

Bulk tagging

AI trigger option after import


8. Integration Rules

Prevent duplicate leads

Every lead must have a source

AI only triggers if enabled

Log all errors

Store consent for compliance

All leads appear in Leads + Inbox instantly


9. Main MVP Success Flow

Meta/Website/Open House lead
-> WarmChats captures lead
-> Inbox thread created
-> AI replies instantly
-> AI qualifies lead
-> Appointment gets booked
-> Agent notified