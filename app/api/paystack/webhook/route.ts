import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * POST /api/paystack/webhook
 * Verifies the x-paystack-signature header using HMAC SHA-512 and PAYSTACK_SECRET_KEY
 * to guarantee the webhook event genuinely originated from Paystack.
 */
export async function POST(req: NextRequest) {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const signature = req.headers.get('x-paystack-signature')
    if (!signature) {
      return NextResponse.json({ error: 'Missing Paystack signature' }, { status: 401 })
    }

    const rawBody = await req.text()
    const expectedHash = crypto
      .createHmac('sha512', secretKey)
      .update(rawBody)
      .digest('hex')

    if (expectedHash !== signature) {
      console.warn('Invalid Paystack webhook signature rejected')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = JSON.parse(rawBody)

    if (event.event === 'charge.success') {
      const tx = event.data
      console.log(`✅ Verified Paystack Webhook: charge.success for ref ${tx.reference}`)
    }

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error) {
    console.error('Paystack webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
