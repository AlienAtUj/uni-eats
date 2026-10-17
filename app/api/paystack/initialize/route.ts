import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/paystack/initialize
 * Securely initializes a Paystack transaction on the server using PAYSTACK_SECRET_KEY.
 * Never exposes the secret key to the client browser.
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
    const { email, amountZar, metadata } = body

    if (!email || typeof amountZar !== 'number' || amountZar <= 0) {
      return NextResponse.json(
        { error: 'Valid customer email and positive order amount are required.' },
        { status: 400 }
      )
    }

    // Paystack requires amount in lowest currency denomination (cents for ZAR)
    const amountInCents = Math.round(amountZar * 100)
    const reference = `UE_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`

    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: amountInCents,
        currency: 'ZAR',
        reference,
        metadata: {
          ...metadata,
          custom_fields: [
            {
              display_name: 'Platform',
              variable_name: 'platform',
              value: 'UniEats Campus Ordering',
            },
          ],
        },
      }),
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
    })
  } catch (error: any) {
    console.error('Paystack initialization error:', error)
    return NextResponse.json(
      { error: 'Internal server error initializing payment' },
      { status: 500 }
    )
  }
}
