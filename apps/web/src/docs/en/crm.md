# Communication & CRM

📺 **[Watch the tutorial: templates and sequences](https://youtu.be/KpYW_kWYdMk)** (Spanish)

This section explains how to communicate with participants more efficiently: send group messages over WhatsApp, automate reminders and follow-ups, and keep track of who you've already contacted.

## Overview

The system brings together several tools so you don't have to send each message by hand:

- **WhatsApp queue**: send a message to several participants, one by one, from **your own WhatsApp account**.
- **Segments**: save filter combinations (e.g. "walkers with pending payment") to reuse them.
- **Automated sequences**: schedule sends by event or date (welcome on registration, reminder before the retreat, follow-up afterward).
- **Communication dashboard**: see how many messages have been sent and to how many people.
- **Tasks & follow-up**: reminders for you and the status of each participant (contacted, confirmed, etc.).

### An important rule about WhatsApp

Each coordinator sends WhatsApp **from their own account** (their phone). The system does **not** send WhatsApp for you automatically: it prepares the message, opens it in your WhatsApp, and you send it with one click. This avoids WhatsApp bans and messages arriving from an unknown number.

> **Email** is sent automatically. **WhatsApp** always requires your click.

## WhatsApp queue

Use it to send the same (personalized) message to several participants over WhatsApp, without copy-pasting one by one.

1. Go to **Walkers** (or **Servers**).
2. Check the box for the participants you want to contact.
3. In the blue selection bar, click the green send icon (**WhatsApp queue**).
4. Choose a template (or type the message). Variables like the name are filled in for each person.
5. For each recipient, click **Open WhatsApp**: your WhatsApp opens with the message ready. Send it and the row is marked as sent.

The progress bar shows how many you've done (e.g. "7 of 20 sent"). Each send is saved in the participant's history.

## Segments

A **segment** is a named filter combination, so you don't have to set it up every time.

- **Save**: apply the filters you want in the participant list (type, tags, payment status…) and click the bookmark icon to save them with a name (e.g. "Unpaid walkers").
- **Apply**: pick the segment from the dropdown and the list filters automatically.
- **Delete**: from the same save dialog you can remove segments you no longer use.

Segments can also be used as the audience of an automated sequence.

## Automated sequences

A **sequence** sends messages on its own based on a trigger and a time offset. Ideal for welcomes, payment reminders and follow-ups.

To create one:

1. Go to **Automated Sequences** and click **New sequence**.
2. Give it a **name** and choose the **trigger**:
   - **On registration**: counts from when the participant signed up.
   - **Days before the retreat** / **Days after the retreat**.
   - **On their birthday**.
3. Choose the **audience**:
   - **Everyone**, **Walkers** or **Servers**.
   - **Table leaders/co-leaders**: only the servers assigned as leader or co-leader of a table in the retreat.
4. Add one or more **steps**. Each step has:
   - **Days**: the offset relative to the trigger (e.g. 7 days before).
   - **Hour**: what time of day it sends.
   - **Template**: the message to use.
   - **Channel**: **Email** (sent automatically) or **WhatsApp** (goes to the pending queue).
   - **Send to**: who the step's message goes to:
     - **Participant**: the walker/server.
     - **Emergency contact 1** / **Emergency contact 2**: the participant's family (uses their phone/email and the message is addressed to their name).
     - **Inviter (palanquero)**: the server who invited the participant (useful to notify them "a new walker registered").
     - **Responsibility…**: the holder of a retreat responsibility (you pick which: Palancas coordinator, Treasurer, etc.). Handy to notify someone in charge when a person registers.
5. Save. You can activate or deactivate the sequence anytime.

> Since the recipient is chosen **per step**, a single sequence can, for example, send one message to the walker and another to their emergency contact.

The system checks every hour which messages are due. **Email** ones go out automatically; **WhatsApp** ones appear in the **pending queue**, where you dispatch them with one click (when a step targets an emergency contact, it opens with that contact's phone). *New steps default to **WhatsApp**.*

The page is organized in three tabs: **Sequences** (the list), **Pending** (the WhatsApp queue) and **Issues** (those that couldn't be sent). Pending and Issues have **search**, **sort** and **pagination**; Pending also has a **Show: All / Mine / Unassigned** filter.

In the queue, each pending item shows the participant's **follow-up status** (to contact, contacted, confirmed, etc.) so you can decide with context. Besides the send button, there's a **"Skip"** button to discard that message without sending it (e.g. if the participant already confirmed and the reminder no longer applies).

Clicking the participant's **name** (in Pending or Issues) opens their **detail panel**, with everything you need to decide whether to send or skip: their **follow-up status** (and note), the **message that will be sent** (preview), their **letters/palancas** (whether requested and which were received), their **notes**, and the **messages already sent** to them (recent history). You can **send** or **skip** right from that panel.

**Options to send just the right message to the right people:**
- **Per-step condition**: each step can go only to those matching a filter (e.g. "only if payment is pending" or "walkers only"), so a payment reminder won't reach someone who already paid.
- **Stop once they confirm**: use the step **condition** "only if attendance is *pending*". The reminder then stops as soon as the person confirms (or declines) attendance. Anyone who **declined** (in follow-up) always stops receiving messages.
- **Don't send if overdue by more than N days**: prevents a late registrant from receiving all the already-past reminders at once.
- **Do not contact**: from a pending item's detail you can mark a person as "do not contact"; they're excluded from automated sends.

**Sending WhatsApp with control:** in the queue, **"Open WhatsApp"** opens the message in your account (marked as *opened*); once you've actually sent it, click **"I sent it"** to clear it from the queue. Turn on **"Mark sent on open"** to have opening the chat mark it as sent (skipping the second step). You can **take** an item so it's under your name (useful to split work among coordinators: filter by **Mine** / **Unassigned**) and use **"Open next"** to move quickly (it opens the next of what you're viewing).

> **Refresh with current template**: if you edit a template, messages already in the queue keep the old text (it's "frozen" when queued). This button updates them with the current text, without changing who or when.

> The **Run now** button processes the sequence immediately, without waiting for the automatic check. Useful for testing.

> **Late registrations**: if someone registers *after* the date of an "X days before" step, that message is sent (or queued) as soon as they're enrolled, even though its ideal date has passed. If the sequence has several already-past steps, the participant will receive them **all at once**. Keep this in mind when designing sequences with multiple pre-retreat reminders (e.g. a "10 days left" message could reach someone who has 3 days left).

**What happens in each case:**

- Each sequence shows a summary: how many messages were **sent**, are **queued**, were **skipped** or **failed**.
- Messages that couldn't be sent appear under the **"Issues"** tab with the reason (e.g. "no template in the retreat", "recipient without phone") and a **"How to fix"** line telling you what to do. For each one you can **Resend** (re-enqueue after fixing the data) or **Discard**; there's also **"Resend all" / "Discard all"** for bulk.
- If a message doesn't apply because the participant simply **lacks that link** (e.g. no inviter registered, or the responsibility has no holder), it's **discarded automatically** and **doesn't show** under Issues (not an error to fix). A missing nickname falls back to the **first name** (the greeting is never blank).
- If you **deactivate** a sequence, its pending messages are paused (not sent until you reactivate it).
- If a participant **cancels**, they stop receiving the scheduled messages.
- **Editing** a sequence does not re-send to those who already received it; on save you'll also see a **preview** of the message with a sample participant.

### Global sequence templates

If you use the same sequences across several retreats, you can define them **once** as a global template and reuse them:

- In **Global Settings → Global Sequences** you create a sequence (trigger, audience, steps) just like in a retreat, but without tying it to one. The template picker uses the **global templates**.
- In each retreat, under **Automated Sequences**, click **"Import from global template"** and pick one. A copy is created in that retreat.
- The imported sequence stays **inactive**: review it (e.g. check the retreat has the templates it uses) and **activate** it when ready. That way no messages are ever sent by surprise.
- Editing or deleting a global template **does not affect** sequences already imported into retreats (they are independent copies).

> **Registration messages**: the welcome (walker and server), the privacy notice and the palanquero notification **are now sent through automated sequences** (not from registration itself). Each retreat already ships these sequences **active**; they go out immediately when the person registers. If you don't want them sent, **deactivate** the corresponding sequence.

The system ships a **ready-to-import pack** (you'll see it under Global Sequences):
- **Walker welcome** (on registration).
- **Pre-retreat: palancas & confirmation** — requests palancas from the emergency contacts (21 days before), reminds them (7 days before) and sends the attendance confirmation to the walker (3 days before).
- **Table leaders/co-leaders briefing** (1 day before).
- **Post-retreat follow-up (Fourth Day)** (1 day after), inviting to the Fourth Day and to join a nearby community with the landing link.

Import the ones you need into your retreat and tweak channels, days or recipients before activating them.

## Communication dashboard

A quick summary of the retreat:

- **Total sent** and breakdown by **WhatsApp** and **Email**.
- **Participants reached** (how many distinct people you've written to).
- **Pending WhatsApp** to dispatch.
- **Activity over the last 30 days** and the **most used templates**.

## Tasks & follow-up

To keep track of your work:

- **Tasks**: reminders for you (e.g. "Call Juan to confirm payment"), with an optional due date. Mark them done when finished.
- **Participant follow-up**: record each person's status:
  - **To contact** · **Contacted** · **Confirmed** · **No answer** · **Declined**

  You can add a note (e.g. "Confirms attendance over WhatsApp"). This helps you know who still needs follow-up.

> Follow-up is a management marker for you; it doesn't change permissions or move the participant between lists.
