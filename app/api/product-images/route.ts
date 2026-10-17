import { NextResponse } from 'next/server'

function uidFromIdToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as {
      user_id?: string
      sub?: string
    }
    return payload.user_id || payload.sub || null
  } catch {
    return null
  }
}

function candidateBuckets() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  const configured = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  const buckets: string[] = []

  // Classic GCS name — .firebasestorage.app often 404s and browsers report that as CORS.
  if (projectId) buckets.push(`${projectId}.appspot.com`)
  if (configured && !buckets.includes(configured)) buckets.push(configured)
  if (projectId) {
    const modern = `${projectId}.firebasestorage.app`
    if (!buckets.includes(modern)) buckets.push(modern)
  }

  return buckets
}

function downloadUrl(bucket: string, path: string, downloadToken?: string) {
  const encoded = encodeURIComponent(path)
  const base = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}?alt=media`
  return downloadToken ? `${base}&token=${downloadToken}` : base
}

async function uploadObject(params: {
  bucket: string
  path: string
  body: ArrayBuffer
  contentType: string
  idToken: string
}) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  const search = new URLSearchParams({ name: params.path })
  if (apiKey) search.set('key', apiKey)

  const url = `https://firebasestorage.googleapis.com/v0/b/${params.bucket}/o?${search.toString()}`
  const headers: Record<string, string> = {
    Authorization: `Firebase ${params.idToken}`,
    'Content-Type': params.contentType,
  }
  if (appId) headers['x-firebase-gmpid'] = appId

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: params.body,
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, text }
}

export async function POST(request: Request) {
  const idToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!idToken) {
    return NextResponse.json({ error: 'You must be signed in to upload images.' }, { status: 401 })
  }

  const uid = uidFromIdToken(idToken)
  if (!uid) {
    return NextResponse.json({ error: 'Invalid session token.' }, { status: 401 })
  }

  const formData = await request.formData()
  const files = formData.getAll('files').filter((value): value is File => value instanceof File)
  if (files.length === 0) {
    return NextResponse.json({ error: 'No image files were sent.' }, { status: 400 })
  }

  const buckets = candidateBuckets()
  if (buckets.length === 0) {
    return NextResponse.json({ error: 'Firebase Storage bucket is not configured.' }, { status: 500 })
  }

  const urls: string[] = []

  for (const file of files) {
    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '-')
    const extension = file.name.split('.').pop() || 'jpg'
    const path = `products/${uid}/${Date.now()}-${baseName}.${extension}`
    const body = await file.arrayBuffer()
    const contentType = file.type || 'image/jpeg'

    let uploaded = false
    let lastError = ''

    for (const bucket of buckets) {
      const result = await uploadObject({ bucket, path, body, contentType, idToken })
      if (result.ok) {
        let downloadToken: string | undefined
        try {
          const parsed = JSON.parse(result.text) as { downloadTokens?: string }
          downloadToken = parsed.downloadTokens
        } catch {
          // Public URL still works for many buckets without a token.
        }
        urls.push(downloadUrl(bucket, path, downloadToken))
        uploaded = true
        break
      }
      lastError = result.text || `HTTP ${result.status}`
    }

    if (!uploaded) {
      const looksMissing =
        /not found|404|No such object|bucket does not exist|The specified bucket does not exist/i.test(
          lastError,
        )
      return NextResponse.json(
        {
          error: looksMissing
            ? 'Firebase Storage is not enabled for this project. In Firebase Console open Build → Storage and click Get started.'
            : `Upload failed: ${lastError.slice(0, 400)}`,
        },
        { status: 502 },
      )
    }
  }

  return NextResponse.json({ urls })
}
