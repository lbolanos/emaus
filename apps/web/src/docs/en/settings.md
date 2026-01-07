# Settings

This section explains the configuration options available in the Emaus system.

## Overview

The Settings section allows administrators to configure various aspects of the system, including user accounts, retreat settings, and system preferences.

## User Management

### Adding Users

1. Navigate to **Settings → Users**
2. Click **Add User**
3. Enter user information:
   - Name
   - Email
   - Role (Superadmin, Admin, Coordinator, Viewer)
4. The user will receive an email to set their password

### User Roles

**Superadmin**

- Full system access
- Can manage other users
- Database management capabilities
- Financial reports access

**Admin**

- Manage all retreats
- User management (except superadmins)
- Full reporting access

**Coordinator**

- Assigned to specific retreats
- Manage participants for assigned retreats
- Limited reporting

**Viewer**

- Read-only access
- Can view assigned retreats
- No editing capabilities

### Managing Permissions

1. Select a user from the list
2. Click **Edit Permissions**
3. Check/uncheck permissions as needed
4. Save changes

## Retreat Configuration

### House Settings

Configure retreat houses:

1. Navigate to **Settings → Houses**
2. Select a house or add new
3. Configure:
   - Room count and layout
   - Bed types and quantities
   - Floor information
   - Capacity limits
   - Special notes

### Default Values

Set default values for new retreats:

- Maximum walkers
- Maximum servers
- Default table size
- Payment amounts

## System Configuration

### Email Settings

Configure email notifications:

1. Navigate to **Settings → Email**
2. Enter SMTP details:
   - Server address
   - Port number
   - Authentication credentials
3. Test configuration
4. Save settings

### Backup Settings

Configure automatic backups:

1. Navigate to **Settings → Backup**
2. Set backup frequency
3. Choose backup location
4. Configure retention policy

## Data Import/Export

### Export Settings

Configure default export options:

- File format (Excel, CSV, PDF)
- Include/exclude fields
- Date format
- Number formatting

### Import Templates

Download and configure import templates:

- Required fields
- Optional fields
- Validation rules
- Default values

## Localization

### Language Settings

The system supports multiple languages:

- English (en)
- Spanish (es)

Users can select their preferred language from the header. The setting is saved for future sessions.

### Date and Time Formats

Configure regional formats:

- Date format (MM/DD/YYYY vs DD/MM/YYYY)
- Time format (12h vs 24h)
- Number formatting (decimal separator, thousands separator)

## Security Settings

### Password Policies

Set password requirements:

- Minimum length
- Complexity requirements
- Expiration policy

### Session Management

Configure user sessions:

- Session timeout duration
- Remember me duration
- Maximum concurrent sessions

## Audit Log

View system activity:

1. Navigate to **Settings → Audit Log**
2. Filter by:
   - Date range
   - User
   - Action type
3. Export log for analysis

The audit log tracks:

- User logins
- Data changes
- Configuration updates
- Export activities
