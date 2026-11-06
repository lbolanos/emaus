# Family letters

Letters are the surprise of the retreat: participants' families (walkers **and** servers) write
a support message that gets printed and delivered during the weekend. **Do not mention them to
participants ahead of time.**

This module replaces the manual WhatsApp collection: each participant gets a **unique email
address** and incoming letters are organized for review and printing.

## How it works

1. **Activate mailboxes** — one button generates an address for every active participant
   (cancelled and waiting excluded). Idempotent: existing addresses are untouched.
2. **Share** — generates a per-participant message with the address, ready to copy or send by
   WhatsApp to each family. Bulk-copy all addresses for a group chat.
3. **Receive** — the family writes to `carta.XXXX@emaus.cc` with text and photos. A mistyped
   address **bounces** so the family knows it did not arrive. Letters arrive as *Pending
   review*.
4. **Review** — filter the inbox by status, table or text; open each letter (full text and
   attached photos) and mark it **Approve** or **Hide**.
5. **Print** — print approved letters per table or for the whole retreat: one section per
   participant (table order), photos included. Printed letters are flagged *Printed*
   (re-printable anytime).

## Good to know

- **Mailboxes**: in the mailbox dialog you can switch a participant's address off (abuse or
  request) — emails to it bounce until re-enabled.
- **Non-printable photos**: HEIC (iPhone) photos or PDF attachments are stored but not printed
  — the letter carries a note. Ask the family to resend as JPG/PNG.
- **Resends**: the same email sent twice is detected and only one copy is kept. A forwarded
  message arrives as a new letter — hide it during review.
- **Privacy**: only roles with the letters permission (admin, logistics, communications,
  superadmin) see this module, and every read is audited.
- **Per-letter limits**: max 10 attachments, 8 MB each, 12 MB total. Anything over bounces or
  arrives with a warning.

## What about Palancas?

The **Palancas** view remains the logistics control for physical letters between brotherhoods
(requested vs received). This module is only for letters families send by email. They are not
synced.
