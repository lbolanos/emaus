# Community Management

📺 **[Watch tutorial video](https://youtu.be/xIVmHyhkDHA)**

The Community Management feature allows you to maintain ongoing relationships with retreat participants by organizing them into communities, tracking their engagement, and managing group activities.

## Overview

Communities are groups of people who have participated in retreats and wish to stay connected. This feature helps you:

- Organize participants into communities
- Track member engagement and participation
- Schedule and record community meetings
- Monitor member states (active, inactive, relocated, etc.)
- Invite and manage community administrators

## Creating a Community

1. Navigate to **Communities** from the main menu
2. Click **New Community**
3. Fill in the community details:
   - **Name**: A descriptive name for the community
   - **Address**: Physical location details (street, city, state, zip, country)
   - **Description** (optional): Additional information about the community
4. Click **Create Community**

You will automatically be added as the community owner.

## Managing Members

### Importing Members from a Retreat

1. Open the community dashboard
2. Go to the **Members** tab
3. In the **⋮** menu at the top right, choose **Import Members**
4. Select the retreat
5. Choose the participants to import
6. Click **Import Selected**

When choosing participants:

- **Cancelled participants are hidden** by default. Turn on **Include cancelled** to bring one in.
- A community allows **one member per phone number**. If a participant's phone already belongs to
  another member (for example, two relatives registered with the same number), they show greyed
  out with **Their phone already belongs to…** and can't be selected. To add them, use
  **Create member** with their own number.
- Only retreats you have access to are listed.
- If someone couldn't be imported, the dialog stays open and tells you who and why.

### Member States

Members can be in one of the following states:

- **Active Member**: Regularly participates in community activities
- **Far from Location**: Lives too far to participate regularly
- **No Answer**: Has not responded to recent contact attempts
- **Another Group**: Participates in a different community

You can update a member's state by clicking on their current state in the members list.

### Merging Duplicate Member Records

📺 **[Watch tutorial video](https://youtu.be/FrMbNdk3Kio)**

When the same person ends up with two records (same email, phone, or similar name), the
system suggests it under **Duplicates**, in the **⋮** menu of the **Members** tab; the number
on the **⋮** button shows how many pairs are waiting for review.

1. In the **⋮** menu, choose **Duplicates** and review each suggested pair: they are suggestions, not verdicts
2. Click **See what would move**: it shows which enrollments, attendance, and messages will
   move to the record that stays (the one with more records; you can switch it)
3. Click **Merge**: everything lands on a single record and the other one is archived — not deleted
4. If they are two different people, use **Not the same person** and confirm. The dismissed
   pair is listed under **Dismissed pairs** and can be undone if it was a mistake

### Removing Members

To remove a member from the community:

1. Find the member in the members list
2. In the **⋮** menu of their row, choose **Remove member**
3. Confirm the action

The same **⋮** menu holds Record attendance, Mark as contacted (a green check then shows next to
the name), Notes, History, Photo and Edit details. Only **Messages** stays visible in the row.

## Meetings and Attendance

### Creating a Meeting

1. Go to the **Meetings** tab
2. Click **New Meeting**
3. Fill in the meeting details:
   - **Title**: Name of the meeting
   - **Start Date**: When the meeting will occur
   - **Duration**: Length in minutes
   - **Location** (optional): Where the meeting will be held
   - **Notes** (optional): Additional information
4. Click **Create Meeting**

### Recording Attendance

1. Open a meeting from the meetings list
2. Click **Record Attendance**
3. Tap each member's card to mark them present; it saves instantly, there is no save button

Each card shows the member's photo (or initials if there is none) and the retreat they were
imported from, to help recognize people. The search and filter bar stays on top while scrolling:

- **Attendance**: everyone, present, or not marked yet. "Not marked" leaves who is missing.
- **Retreat**: members imported from a given retreat, or those with no retreat.
- **Frequency**: high, medium, low, or no attendance.
- **Photo**: all, with photo, or without photo. "Without photo" helps fill in photos: tap a card's
  avatar to take or choose the photo (tapping the avatar does not mark attendance).
- **Sort**: by name (A–Z), most attendance, most recent retreat, or most recent to join.

On a phone the filters fold into a **Filters (n)** button. Filters and sort are remembered on each
device for the next meeting.

**Without signal**: if the internet drops, keep tapping cards. Each one shows **Pending** and is
saved on its own when the signal returns. The screen must have been opened with signal.

To mark one member across several meetings, use **Record attendance** in the **⋮** menu of their
row in **Members**.

### Attendance from the meeting photo

If the community has face recognition turned on, every time the meeting photo is uploaded (from
the meetings list, from the meeting, or with **Upload meeting photo** on the attendance screen)
the app suggests who each person is by comparing with the profile photos:

1. Upload the group photo. It is saved as the meeting photo and the review opens
2. **Suggestions**: each face in the photo appears next to the suggested member's profile photo.
   Remove the wrong ones: the app sometimes mistakes someone outside the community for a member
3. **Unidentified**: tap the microphone and say the name, or type it; pick one of the matches. You
   can also choose **Not from the community** or **Skip**
4. **Confirm N present** marks them present. Members without a profile photo get their face from
   the group photo, so they are recognized next time

Nothing is saved until you confirm. Uploading the photo again only adds attendance, never removes
it. If the recognition service does not answer, the photo is saved anyway and the review opens
without suggestions.

**Turning it on** (community owner only): in **Communities**, the community menu → **Edit
community** → **Face recognition for attendance**. Faces are sent to Google Gemini for the
analysis.

**Excluding a member**: if someone asks not to be recognized, choose **Exclude from face
recognition** in the **⋮** menu of their row. They can still be marked present by hand or by voice.

### Meeting album

Once the meeting photo has been reviewed, click **Publish album** in the meetings list: a link to
share (for example over WhatsApp) is copied. The page shows the photo and, when tapping each face,
the first name and first surname of whoever was confirmed in the review. It never shows emails or
phone numbers, nor anyone excluded from recognition. The link is not indexed by search engines;
**Unpublish album** turns it off.

## Dashboard and Analytics

The community dashboard provides insights into:

- **Total Members**: Current number of community members
- **Member State Distribution**: Breakdown by member state
- **Meeting Count**: Number of meetings held
- **Participation Frequency**: How often members attend meetings
  - High: 75%+ attendance
  - Medium: 25-75% attendance
  - Low: <25% attendance
  - None: No attendance recorded

## Managing Administrators

### Inviting an Administrator

1. Go to the **Admins** tab
2. Click **Invite Admin**
3. Enter the email address of the user
4. Click **Send Invitation**

The system will generate an invitation link that you can share with the user.

### Sharing the Invitation Link

After creating an invitation:

1. Copy the invitation link displayed in the modal
2. Share it with the invited user via email, chat, or any other method
3. The invitation link is valid for 7 days

The link will look like: `https://your-domain.com/accept-community-invitation/{token}`

### What the Invited User Must Do

When a user receives an invitation link:

1. **Click the invitation link** - This will open the invitation acceptance page
2. **If not logged in**:
   - Click "Login" (Iniciar Sesión)
   - The system will remember the invitation token
   - After logging in, return to the same link
3. **Review the invitation details**:
   - Community name
   - Your email address
   - Expiration date
4. **Click "Accept Invitation"** (Aceptar Invitación)
5. **Wait for confirmation** - You'll be redirected to the community dashboard

After accepting:

- The community will appear in your sidebar under "Comunidades" (Communities)
- You'll have full admin access to manage members, meetings, and view analytics

**Important**: The user must already have an account in the system. If they don't have an account, they need to create one first before accepting the invitation.

### Admin Roles

- **Owner**: Full control over the community (cannot be removed)
- **Admin**: Can manage members, meetings, and view analytics

### Revoking Admin Access

1. Find the admin in the admins list
2. Click **Revoke Access**
3. Confirm the action

Note: You cannot revoke access from the community owner.

## Best Practices

1. **Regular Updates**: Keep member states current to maintain accurate analytics
2. **Consistent Meetings**: Schedule regular meetings to maintain community engagement
3. **Attendance Tracking**: Record attendance promptly after each meeting
4. **Member Communication**: Use member notes to track important information
5. **Admin Management**: Invite trusted administrators to help manage larger communities

## Tips

- Use the search function to quickly find specific members
- Filter members by state to focus on specific groups
- Export member lists for external communication tools
- Review dashboard statistics regularly to identify engagement trends
- Update member states based on attendance patterns
