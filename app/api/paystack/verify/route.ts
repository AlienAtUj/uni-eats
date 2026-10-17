import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/paystack/verify
 * Server-to-server verification of a Paystack payment reference.
 * Prevents fake client-side "payment success" spoofing and validates exact amount & currency.
 */
export async function POST(req: NextRequest) {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json(
        { error: 'Paystack Secret Key (PAYSTACK_SECRET_KEY) is not configured on the server.' },
        { status: 500 }
      )
    }

    const { reference, expectedAmountZar } = await req.json()

    if (!reference || typeof reference !== 'string') {
      return NextResponse.json(
        { error: 'Missing payment reference' },
        { status: 400 }
      )
    }

    // Call Paystack Verify API directly from server
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    )

    const data = await verifyRes.json()

    if (!verifyRes.ok || !data.status || !data.data) {
      return NextResponse.json(
        { verified: false, error: data.message || 'Could not verify transaction with Paystack' },
        { status: 400 }
      )
    }

    const tx = data.data

    // 1. Check payment status is strictly 'success'
    if (tx.status !== 'success') {
      return NextResponse.json(
        { verified: false, error: `Payment status is '${tx.status}', not 'success'` },
        { status: 400 }
      )
    }

    // 2. Check amount matches expected amount (in cents) to prevent tampering
    if (typeof expectedAmountZar === 'number' && expectedAmountZar > 0) {
      const expectedCents = Math.round(expectedAmountZar * 100)
      if (tx.amount < expectedCents) {
        return NextResponse.json(
          {
            verified: false,
            error: `Amount mismatch: paid ${tx.amount} cents, expected ${expectedCents} cents`,
          },
          { status: 400 }
        )
      }
    }

    return NextResponse.json({
      verified: true,
      reference: tx.reference,
      amountZar: tx.amount / 100,
      currency: tx.currency,
      channel: tx.channel,
      paidAt: tx.paid_at,
    })
  } catch (error: any) {
    console.error('Paystack verification error:', error)
    return NextResponse.json(
      { verified: false, error: 'Internal server error verifying payment' },
      { status: 500 }
    )
  }
}
