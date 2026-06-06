**Tasks Page Requirements \- View link tasks page \- Make warmchats ui look like this**

[**https://618a04db-9a20-4092-a5fb-bb79a9a2fcb5.claudeusercontent.com/v1/design/projects/618a04db-9a20-4092-a5fb-bb79a9a2fcb5/serve/leads/index-print.html?t=728dbd6999c4a43b386b68aae23181b0b20aa5014e3b34f96713bf88436adf8c.4b19b9da-0047-49fa-8a3e-6c7a8ef1c177.83534f39-f59e-4dab-a5a2-be7cd4a5922e.1780632473\&direct=1**](https://618a04db-9a20-4092-a5fb-bb79a9a2fcb5.claudeusercontent.com/v1/design/projects/618a04db-9a20-4092-a5fb-bb79a9a2fcb5/serve/leads/index-print.html?t=728dbd6999c4a43b386b68aae23181b0b20aa5014e3b34f96713bf88436adf8c.4b19b9da-0047-49fa-8a3e-6c7a8ef1c177.83534f39-f59e-4dab-a5a2-be7cd4a5922e.1780632473&direct=1)

The Tasks page is the agent's action center. AI handles conversations and follow-up automatically, but when something requires a human, AI creates a task for the agent.

### **Task Sources**

**Agent-Created Tasks**

* Call lead  
* Send email  
* Schedule showing  
* Follow-up reminder  
* Personal to-do  
* Custom task

**AI-Created Tasks**

* Missed call needs callback  
* Lead requested showing  
* Lead requested pricing/CMA  
* Lead requested human contact  
* Appointment confirmation needed  
* Contract/deal action needed  
* AI confidence too low  
* Human takeover required

### **AI Priorities Section**

Show top 3-6 highest-priority tasks.

For each task show:

* Why it matters  
* Conversion opportunity  
* AI recommendation  
* One-click action

Examples:

* Call Now  
* Open Conversation  
* Send Draft  
* Schedule Showing

### **My Tasks**

Show all open tasks.

Fields:

* Task Name  
* Lead  
* Type  
* Priority  
* Due Date  
* Owner  
* Status

Filters:

* All  
* Urgent  
* AI  
* Today  
* Upcoming

### **Completing Tasks**

When agent clicks **Complete**:

* Task moves to **Completed Today**  
* Completion timestamp is saved  
* Removed from active task list

### **AI Behavior**

AI should create tasks only when it cannot complete the action itself.

Examples:

* AI can answer SMS → no task needed  
* AI books appointment → no task needed  
* Lead asks to speak with agent → create task  
* Missed call → create callback task  
* Contract question → create human task

### **Goal**

AI handles the repetitive work. Tasks are only for actions that require a human. The page should tell agents exactly what needs their attention next and keep completed work organized at the bottom.

