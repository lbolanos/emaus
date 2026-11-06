# Server Briefing

The cross between the **Minute by Minute** and each **server's duties**: pick the activity you are at, and the screen builds the moment — who is on stage, where, and what each person should be doing.

📺 **[Watch the video tutorial (1:36)](https://youtu.be/xKgNukP6Lsc)**

## We are at

- By default it runs in **⏵ Automatic** mode: it follows over WebSocket the activity currently **in progress** (the one you started from Minute by Minute).
- To look at another activity, pick it from the selector: the group re-arms instantly and stays fixed (**manual** badge). **Back to automatic** returns to following the retreat live.
- The view updates on its own: when an activity starts or completes, **On stage** moves to the next moment without reloading.

## On stage

- Shows the **responsables** of the chosen activity plus the **holder** of its duty, with their roles (🎤), the **location** (📍), their **table** and how many **📎 documents** they have.
- If nobody is assigned to the activity, it says so and points you to **Assign responsables** (if you have manage permission).
- Search a server by name: filters both sections, accent-insensitive.

## The other servers

- Every server shows their **next moment** of the chosen activity's day, their table and document count. Servers with no moments that day show as *no moments assigned*.

## A server's briefing

- Tap any server to open their briefing:
  - **Now**: where they should be and what they should do for the chosen activity.
  - **Their day**: every activity of that day, in order, with the chosen one highlighted.
  - **Assignments**: their fixed responsibilities and service teams, with the instructions of each dynamic.
  - **Documents**: documents for each moment and for their responsibilities, ready to open from a phone.

## Requirements

- The view needs the retreat to have a materialized **Minute by Minute** and **assigned responsables** (from *Assign responsables* or from Minute by Minute itself). Without responsables, "On stage" shows empty.
- In *Production* realtime runs over WebSocket; in development the proxy must have WebSockets enabled.
