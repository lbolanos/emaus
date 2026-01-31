# S3 Document Storage (Future Feature)

## Overview

This document describes the planned document storage feature for the Emaus system using AWS S3. This is a future enhancement to store and manage participant documents, medical records, and retreat-related files.

## Purpose

The document storage system will enable:

- Secure storage of participant forms and documents
- Medical records and health information
- Retreat schedules and planning documents
- Participant consent forms
- Payment receipts and documentation
- Communication logs and correspondence

## Storage Structure

Documents will be organized in the `documents/` prefix with subdirectories by type:

```
emaus-media/documents/
├── participant-forms/
│   ├── {participantId}/
│   │   ├── registration-form-v1.pdf
│   │   ├── emergency-contact.pdf
│   │   └── health-questionnaire.pdf
├── medical-records/
│   ├── {participantId}/
│   │   ├── allergies.pdf
│   │   ├── medications.pdf
│   │   └── medical-conditions.pdf
├── retreat-schedules/
│   ├── {retreatId}/
│   │   ├── schedule-v1.pdf
│   │   ├── participant-list.pdf
│   │   └── assignments.pdf
└── consent-forms/
    ├── {retreatId}/
    │   ├── participant-{participantId}-consent.pdf
    └── volunteer-{userId}-consent.pdf
```

## Access Control

Documents are **private** and require authentication:

- Only authorized users can access documents
- Admin users can manage all documents
- Coordinators can manage documents for their retreats
- Participants can view their own documents (future)

## Supported File Types

| Category          | Allowed Types                | Max Size |
| ----------------- | ---------------------------- | -------- |
| Forms/Docs        | PDF, DOCX, XLSX              | 10 MB    |
| Medical Records   | PDF, JPG, PNG                | 5 MB     |
| Schedules         | PDF, XLSX                    | 5 MB     |
| Images            | JPG, PNG, WebP               | 3 MB     |

## API Endpoints (Planned)

### Upload Document

```http
POST /api/participants/:participantId/documents
Content-Type: multipart/form-data

{
  "document": <File>,
  "documentType": "participant-form|medical|consent",
  "description": "Document description"
}

Response:
{
  "id": "doc-123",
  "url": "https://emaus-media.s3.amazonaws.com/documents/...",
  "key": "documents/participant-forms/...",
  "size": 1024,
  "uploadedAt": "2024-01-31T12:00:00Z"
}
```

### List Documents

```http
GET /api/participants/:participantId/documents?type=participant-form

Response:
[
  {
    "id": "doc-123",
    "name": "registration-form.pdf",
    "type": "participant-form",
    "size": 1024,
    "uploadedAt": "2024-01-31T12:00:00Z"
  }
]
```

### Download Document

```http
GET /api/participants/:participantId/documents/:documentId/download

Response: Binary file with appropriate Content-Type header
```

### Delete Document

```http
DELETE /api/participants/:participantId/documents/:documentId

Response: { success: true }
```

## Implementation Details

### Service Methods (To Be Added)

In `s3Service.ts`:

```typescript
// Upload document
async uploadDocument(
  path: string,
  buffer: Buffer,
  contentType: string,
  metadata?: Record<string, string>
): Promise<UploadResult>

// Delete document
async deleteDocument(path: string): Promise<void>

// Get document metadata
async getDocumentMetadata(path: string): Promise<DocumentMetadata>

// Generate presigned download URL
async generatePresignedUrl(
  path: string,
  expiresIn?: number
): Promise<string>

// List documents with prefix
async listDocuments(prefix: string): Promise<DocumentInfo[]>
```

### Database Schema Extension

New table for document tracking:

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  participant_id UUID REFERENCES participants(id),
  retreat_id UUID REFERENCES retreats(id),
  document_type VARCHAR(50),
  s3_key VARCHAR(255) UNIQUE,
  original_filename VARCHAR(255),
  content_type VARCHAR(100),
  file_size INTEGER,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  deleted_at TIMESTAMP,
  metadata JSONB
);

CREATE INDEX idx_documents_participant ON documents(participant_id);
CREATE INDEX idx_documents_retreat ON documents(retreat_id);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);
```

## Security Considerations

1. **Access Control**
   - All document access requires authentication
   - Role-based access (Admin > Coordinator > User)
   - Audit logging for all document access

2. **Data Protection**
   - Files encrypted at rest (AES256)
   - Files encrypted in transit (HTTPS)
   - Presigned URLs with time limits (expires in 1 hour)

3. **Privacy**
   - Medical records stored separately
   - PII masking in logs
   - HIPAA-compliant storage practices

4. **Compliance**
   - Document retention policies
   - Automatic deletion after retention period
   - Audit trail for regulatory compliance

## Features to Implement

### Phase 1: Basic Document Upload

- [x] S3 document upload methods
- [ ] Document upload API endpoint
- [ ] File size validation
- [ ] Document type validation
- [ ] Database tracking

### Phase 2: Document Management

- [ ] List documents by participant
- [ ] Filter by document type
- [ ] Download documents
- [ ] Delete documents
- [ ] Soft delete with restoration

### Phase 3: Advanced Features

- [ ] Document versioning
- [ ] Document expiration
- [ ] Bulk upload
- [ ] Document preview (thumbnails)
- [ ] Search and filtering

### Phase 4: Compliance

- [ ] Audit logging
- [ ] Retention policies
- [ ] HIPAA compliance
- [ ] Data anonymization
- [ ] Backup strategies

## Cost Estimation

For 1,000 participants storing average 5 documents (500 KB average):

- Total size: 2.5 GB
- Storage cost: 2.5 GB × $0.023/month = ~$0.06/month
- Upload cost: 5,000 uploads × $0.005/1K = ~$0.025/month
- Download cost: Varies by usage
- **Estimated monthly cost**: ~$0.10/month

## Future Enhancements

1. **Document Preview** - Thumbnail previews in UI
2. **OCR Processing** - Extract text from documents
3. **Document Search** - Full-text search on document contents
4. **Bulk Operations** - Batch upload/delete
5. **Email Integration** - Send documents to participants
6. **Digital Signatures** - Sign documents electronically
7. **Workflow Automation** - Approval workflows for documents

## Related Files

- `docs_dev/s3-media-storage.md` - Main S3 storage documentation
- `apps/api/src/services/s3Service.ts` - S3 service implementation
- `apps/api/src/config/env.ts` - Configuration with document prefix

## See Also

- [S3 Media Storage](./s3-media-storage.md)
- [S3 Public Assets](./s3-public-assets.md)
