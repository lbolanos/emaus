# Family letters

📺 **[Watch the video tutorial](https://youtu.be/L7gsglbSZVY)**

Letters are the surprise of the retreat: participants' families (walkers **and** servers) write
a support message that gets printed and delivered during the weekend. **Do not mention them to
participants ahead of time.**

This module replaces the manual WhatsApp collection: each participant gets a **unique email
address** and incoming letters are organized for review and printing.

## How it works

Everything starts in the **⋮** at the top right: **Print**, **Mailboxes**, **Share** and
**Activate mailboxes**.

1. **Activate mailboxes** — generates an address for every active participant (cancelled and
   waiting excluded). Idempotent: existing addresses are untouched.
2. **Share** — a per-participant message with the address, ready to copy or send by WhatsApp.
   Each row shows whether it was already sent («✓ Sent on…») and you can filter the ones left.
   Under the title you see how many mailboxes are active.
3. **Receive** — the family writes to `carta.XXXX@emaus.cc` with text and photos. A mistyped
   address **bounces** so the family knows it did not arrive. Letters arrive as *Pending
   review*.
4. **Review** — in the **Inbox**, filter by status, table, palanquero, participant or text. Open
   a letter to read it; its actions (**Approve**, **Hide**, copy address, print) live in the
   **⋮** of its row. A letter hidden by mistake can be approved again. Shortcuts: `j`/`k` to
   move, `Enter` to open, `a` approves, `o` hides.
5. **Print** — from the top ⋮: **Only unprinted** (what is missing, given your filters), the
   whole retreat, the table, a palanquero's folders, the filtered participant or the letters
   you tick. You get a preview first; afterwards it asks whether it printed fine, and **only
   then** marks them as *Printed*.
6. **If a letter brings a payment receipt** — its row ⋮ → **Register as payment receipt**:
   opens the standard payment form already linked to the participant, with the photo loaded.
   When you save, the letter gets linked to the payment (leaves review) and the payment shows
   up under **Payments → Receipts** as *Applied*.

## Folders: each participant's folder

The **Folders** tab (next to Inbox) shows one row per participant with the state of their
folder: **✓ Complete**, **N missing** to print or **N to review**. From there:

- **Click the row** to open their letters in the inbox; **← Back to Folders** returns to it.
- **Print missing** for that person, or **Print everything missing** for what you are viewing.
- With no letters, it shows whether the address was already sent and lets you resend it.

## For the palanquero

The **palanquero** selector (next to Inbox | Folders) shows only their participants, in both
views. The choice stays in the page link: copy the browser address and send it to the
palanquero so they land on their folders. The last palanquero you picked is remembered in
that browser.

## What goes on paper

Only **what the family wrote**: the letter text and its photos, **one letter per sheet**. The
participant's name, table, sender, date and subject are not printed, and the browser adds no
date or page address. Since the sheet does not say whose it is, tick **Include a cover page**
in the preview so each folder gets a sheet with the name, table and letter count.

If a sheet got lost or printed wrong: **⋮ → Remove printed mark** (on the letter) or **Mark
folder as not printed** (in Folders), then print what is missing again.

If you already printed them some other way (another computer, or you closed the preview without
confirming): **⋮ → Mark as printed** (on the letter), **Mark folder as printed** (in Folders) or,
with several letters selected, **top ⋮ → Mark selected as printed**. Only the approved letters
that were missing get marked.

## Good to know

- **Mailboxes**: in the mailbox dialog you can turn off a participant's address (abuse or an
  explicit request) — emails to it bounce until you turn it back on.
- **Photos and documents**: click a photo to view it larger (arrows move between the letter's
  photos). Families can also send the letter as **PDF, Word, PowerPoint, Excel or
  OpenDocument**: they are kept, the letter shows «📎 N attachments», and in its detail
  **Open** shows the PDF in a tab while **Download** fetches the rest for its own program.
  These documents and HEIC photos (iPhone) **do not print**: the preview lists them and Folders
  shows «📎 N documents» so they get printed separately.
- **What gets discarded** (a notice stays on the letter): executables, archives, web pages, SVG
  and documents **with macros** (docm, pptm, xlsm or macros inside), for safety.
- **Duplicates**: the same email sent twice is detected and kept once. A forward sent as a new
  message arrives as a new letter — hide it during review.
- **Privacy**: only roles with letter permissions (admin, logistics, communications,
  superadmin) see this module, and every read is audited.
- **Limits per letter**: at most 10 attachments, 8 MB each and 12 MB in total.

## What about Palancas?

The **Palancas** view remains the logistics control for physical letters between brotherhoods
(requested vs received). This module is only for letters families send by email. They are not
synced.
