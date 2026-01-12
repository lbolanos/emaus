# Community Management

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
3. Click **Import from Retreat**
4. Select the retreat
5. Choose the participants to import
6. Click **Import Selected**

### Member States

Members can be in one of the following states:

- **Active Member**: Regularly participates in community activities
- **Far from Location**: Lives too far to participate regularly
- **No Answer**: Has not responded to recent contact attempts
- **Another Group**: Participates in a different community

You can update a member's state by clicking on their current state in the members list.

### Removing Members

To remove a member from the community:

1. Find the member in the members list
2. Click the **Remove** button
3. Confirm the action

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
3. Mark each member as present or absent
4. Add notes for individual members if needed
5. Click **Save Attendance**

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
