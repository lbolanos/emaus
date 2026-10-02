# Message Templates

📺 **[Watch the tutorial](https://youtu.be/KpYW_kWYdMk)** (Spanish)

Templates are reusable texts (welcomes, payment reminders, palanca requests, etc.) that you later send to participants by email or WhatsApp. Each template has a **type** and an **audience** (walkers, servers, family, or general).

## Create and edit

Click **Add new** to create a template, or the pencil icon to edit an existing one. You can search by name or content and filter by type. In the table, each template shows a message preview that expands to read it in full.

## Several templates of the same type: the default

You can have several templates of the same type (for example, three garment reminders). Each **sequence step** sends the template chosen in its selector, so there is no ambiguity there. Wherever the system picks **by type alone** —quick-send buttons, such as the confirmation-message button in the shirts report, and the sequences a new retreat creates on its own— it uses the type's **default**, marked **★ Default** in the table. To change it, click **☆** on another template of the same type, or tick "Use this one as the default of its type" when creating or editing it. If you never chose one, the default is the oldest of the type.

## {scope.var} variables

Within the text you can insert variables that fill in automatically when sending, in the form `{scope.field}`:

- **`{participant.*}`** — recipient data: `firstName`, `nickname`, `cellPhone`, `email`, emergency contacts, palanquero…
- **`{retreat.*}`** — retreat data: `parish`, `startDate`, `endDate`, `cost`, `paymentInfo`…

The editor includes a picker with the available variables and a **preview** using sample data. `{custom_message}` is not a variable: it's a blank you fill in at send time.

## Global templates

Under **Settings → Global Templates** (admins only) you maintain the base templates that get copied into each new retreat. There you can create, edit, **activate/deactivate**, and delete master templates. Some **System** variables (like `{user.name}` or `{shareLink}`) only resolve in the server's automatic emails, not when sending a manual message.
