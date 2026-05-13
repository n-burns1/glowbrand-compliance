# TwelveLabs Pegasus 1.5 API Reference

Base URL: `https://api.twelvelabs.io/v1.2`

All requests require the header:
```
x-api-key: <TWELVELABS_API_KEY>
Content-Type: application/json
```

---

## /indexes

### List Indexes
```
GET /indexes
```
Returns all indexes for your account.

**Response**
```json
{
  "data": [
    {
      "id": "idx_abc123",
      "name": "my-index",
      "created_at": "2024-01-01T00:00:00Z",
      "engines": [{ "name": "pegasus1.5", "options": ["visual", "conversation"] }]
    }
  ],
  "page_info": { "limit": 10, "page": 1, "total_page": 1, "total_results": 1 }
}
```

### Get Index
```
GET /indexes/:indexId
```

### Create Index
```
POST /indexes
```
**Body**
```json
{
  "name": "my-index",
  "engines": [
    {
      "name": "pegasus1.5",
      "options": ["visual", "conversation", "text_in_video", "logo"]
    }
  ]
}
```

**Engine options for Pegasus 1.5**
| Option | Description |
|---|---|
| `visual` | Visual understanding (objects, scenes, actions) |
| `conversation` | Spoken dialogue and audio |
| `text_in_video` | On-screen text / OCR |
| `logo` | Brand / logo detection |

**Response** `201 Created`
```json
{ "id": "idx_abc123" }
```

### Delete Index
```
DELETE /indexes/:indexId
```

---

## /tasks

### Create Task (Index a Video)
```
POST /tasks
```
**Body**
```json
{
  "index_id": "idx_abc123",
  "video_url": "https://example.com/video.mp4"
}
```
Or upload a file as `multipart/form-data` with field `video_file`.

**Response** `201 Created`
```json
{
  "id": "task_xyz789",
  "status": "pending"
}
```

### Get Task Status
```
GET /tasks/:taskId
```
**Response**
```json
{
  "id": "task_xyz789",
  "index_id": "idx_abc123",
  "video_id": "vid_def456",
  "status": "ready",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:05:00Z"
}
```

**Task statuses:** `pending` → `indexing` → `ready` | `failed`

### List Tasks
```
GET /tasks?index_id=idx_abc123&page=1&page_limit=10
```

---

## /generate

Generates text output from an already-indexed video using Pegasus 1.5's multimodal understanding.

### Generate Summary
```
POST /generate
```
**Body**
```json
{
  "video_id": "vid_def456",
  "type": "summary",
  "prompt": "Summarize the key product claims made in this video."
}
```
`prompt` is optional — omit it for a generic summary.

**Response**
```json
{
  "id": "gen_ghi012",
  "video_id": "vid_def456",
  "summary": "The video presents..."
}
```

### Generate Chapters
```
POST /generate
```
**Body**
```json
{
  "video_id": "vid_def456",
  "type": "chapter"
}
```
**Response**
```json
{
  "id": "gen_ghi013",
  "video_id": "vid_def456",
  "chapters": [
    {
      "chapter_number": 1,
      "start": 0,
      "end": 45,
      "chapter_title": "Introduction",
      "chapter_summary": "Brand overview and product positioning."
    }
  ]
}
```

### Generate Highlights
```
POST /generate
```
**Body**
```json
{
  "video_id": "vid_def456",
  "type": "highlight"
}
```
**Response**
```json
{
  "id": "gen_ghi014",
  "video_id": "vid_def456",
  "highlights": [
    {
      "highlight": "Clinically tested formula shown at 0:32.",
      "start": 32,
      "end": 38
    }
  ]
}
```

---

## Error Responses

| Status | Meaning |
|---|---|
| `400` | Bad request — check required fields |
| `401` | Invalid or missing API key |
| `404` | Resource not found |
| `429` | Rate limit exceeded |
| `500` | TwelveLabs server error |

```json
{ "code": "invalid_request", "message": "index_id is required" }
```

---

## Typical Workflow

```
1. POST /indexes          → get indexId
2. POST /tasks            → submit video, get taskId
3. GET  /tasks/:taskId    → poll until status === "ready", get videoId
4. POST /generate         → generate summary / chapters / highlights
```
