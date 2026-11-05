import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import {
  computeVerifiedOrderTotalCents,
  createIntegrityHash,
  isValidEmail,
  type CheckoutItemInput,
} from '@/lib/paystack-server'

/**
 * POST /api/paystack/initialize
 * Securely initializes a Paystack transaction on the server using PAYSTACK_SECRET_KEY.
 * Recalculates order total against Firestore product prices so client cart prices cannot be tampered with.
 */
export async function POST(req: NextRequest) {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json(
        {
          error: 'Paystack Secret Key (PAYSTACK_SECRET_KEY) is not configured in .env.local',
          missingKey: true,
        },
        { status: 500 }
      )
    }

    const body = await req.json()
    const { email, amountZar, items, metadata } = body as {
      email?: string
      amountZar?: number
      items?: CheckoutItemInput[]
      metadata?: Record<string, any>
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'A valid customer email address is required.' },
        { status: 400 }
      )
    }

    const { amountInCents, amountZar: verifiedAmountZar } = await computeVerifiedOrderTotalCents(
      items,
      amountZar
    )

    if (amountInCents <= 0) {
      return NextResponse.json(
        { error: 'Order total must be greater than zero.' },
        { status: 400 }
      )
    }

    const reference = `UE_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
    const integrityHash = createIntegrityHash(secretKey, reference, amountInCents, 'ZAR')

    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.trim(),
        amount: amountInCents,
        currency: 'ZAR',
        reference,
        metadata: {
          ...metadata,
          verifiedAmountCents: amountInCents,
          integrityHash,
          custom_fields: [
            {
              display_name: 'Platform',
              variable_name: 'platform',
              value: 'Dash Food & Groceries',
            },
          ],
        },
      }),
      cache: 'no-store',
    })

    const data = await paystackRes.json()

    if (!paystackRes.ok || !data.status) {
      return NextResponse.json(
        { error: data.message || 'Failed to initialize Paystack transaction' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference,
      amountInCents,
      amountZar: verifiedAmountZar,
    })
  } catch (error: any) {
    console.error('Paystack initialization error:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal server error initializing payment' },
      { status: 500 }
    )
  }
}

