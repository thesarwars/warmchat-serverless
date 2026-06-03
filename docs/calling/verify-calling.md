WS connect - load the dashboard. Network tab should show ws://localhost:3333/api/calling/ws42 (dev) or wss://www.warmchats.com/api/calling/ws42 (prod) in connected state. ✅ already confirmed working by you.

WebRTC outbound - click a "Call" button on a lead. Confirm:

The call rings the lead's phone
The lead's caller-ID shows your assigned DID (not +1-559-383-9632 or anything else)
Audio works both directions when answered
Inbound - call +1-747-201-7203 from your cell. Confirm:

Browser pops the incoming-call modal within a couple seconds
Accepting answers it in the browser with audio
Hanging up writes a row in calls table with status='COMPLETED'
Inbound missed - call the DID, don't answer in the browser, let it ring out. Confirm:

Call row ends NO_ANSWER
Your cell receives the missed-call SMS